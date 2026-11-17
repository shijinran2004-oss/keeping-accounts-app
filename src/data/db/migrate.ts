/**
 * 存储引擎选择与一次性迁移。
 *
 * 优先级：IndexedDB（默认）→ localStorage（回退）。
 * 迁移只做一次，并且必须校验条数与抽样 id；任何一步失败都退回旧存储，
 * 旧键保持只读，不会因为迁移把用户的账弄丢。
 */
import type { LedgerRepository, LedgerState, OpenedLedger, StorageEngine } from '../../types'
import { freshState } from '../normalize'
import { idbAvailable } from './idb'
import { LsRepository, readLegacyState, writeLegacyMirror } from './ls'
import { IdbRepository } from './repo'

/** 人工回退开关：写 'ls' 强制使用 localStorage，删掉即回到 IndexedDB */
const ENGINE_KEY = 'shijinran.storage.engine'

/** 当前偏好引擎；读不到 localStorage 时按 IndexedDB 处理 */
export function enginePreference(): StorageEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'ls' ? 'ls' : 'idb'
  } catch {
    return 'idb'
  }
}

/** 运维 / 客服引导用户回退旧存储时调用 */
export function setEnginePreference(engine: StorageEngine): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine)
  } catch {
    /* 隐私模式下写不了，忽略 */
  }
}

/**
 * 把旧账本搬进 IndexedDB。
 * 库里已经有记录时直接跳过（返回 false），避免覆盖用户迁移后新记的账。
 * 写入是一个事务，失败不会留下半套数据。
 */
export async function migrateLegacyToIdb(repo: LedgerRepository, legacy: LedgerState): Promise<boolean> {
  const existing = await repo.load()
  if (existing && existing.txs.length > 0) return false

  await repo.replaceAll(legacy)

  const back = await repo.load()
  if (!back) throw new Error('迁移校验失败：写入后读不到数据')
  if (back.txs.length !== legacy.txs.length) {
    throw new Error(`迁移校验失败：应有 ${legacy.txs.length} 笔，实际 ${back.txs.length} 笔`)
  }
  const ids = new Set(back.txs.map((tx) => tx.id))
  const sample = [...legacy.txs.slice(0, 5), ...legacy.txs.slice(-5)]
  if (!sample.every((tx) => ids.has(tx.id))) throw new Error('迁移校验失败：抽样记录缺失')
  return true
}

/** 启动入口的单例：StrictMode 会重复挂载，避免并发打开与重复迁移 */
let openingLedger: Promise<OpenedLedger> | null = null

/**
 * 启动入口：选引擎、必要时迁移、读出初始状态。
 * 返回的 repo 交给 data/store.tsx 持有，后续写入都走它。
 */
export function openLedger(): Promise<OpenedLedger> {
  if (!openingLedger) {
    openingLedger = openLedgerOnce().catch((error) => {
      openingLedger = null
      throw error
    })
  }
  return openingLedger
}

async function openLedgerOnce(): Promise<OpenedLedger> {
  const legacy = readLegacyState()

  if (enginePreference() === 'idb' && idbAvailable()) {
    let repo: IdbRepository | null = null
    // 只有本次运行把旧账本写进了原本为空的 IDB，失败时才允许清掉这次写入；库里已有数据绝不清
    let wipeOnFail = false
    try {
      repo = await IdbRepository.open()
      let migrated = false
      if (legacy) {
        const before = await repo.load()
        wipeOnFail = !(before && before.txs.length > 0)
        migrated = await migrateLegacyToIdb(repo, legacy)
      }
      let state = await repo.load()
      if (!state) {
        // 全新安装：落一份初始状态，保证下次 load 能拿到 settings
        state = legacy ?? freshState()
        await repo.replaceAll(state)
      }
      // 迁移成功时回写一次旧键：万一以后回退到 localStorage，数据停在切换这一刻
      if (migrated) writeLegacyMirror(state)
      return { repo, state, engine: 'idb', migrated }
    } catch (error) {
      console.warn('[storage] IndexedDB 初始化失败，回退到 localStorage', error)
      // 迁移中途失败：只清掉本次运行写进去的迁移数据；库里原本就有数据时 wipeOnFail 为 false，绝不清库
      if (repo && wipeOnFail) {
        try {
          await repo.replaceAll(freshState())
        } catch {
          /* 清不掉也没关系，下面会关闭连接 */
        }
      }
      repo?.close()
    }
  }

  const fallback = new LsRepository()
  const loaded = await fallback.load()
  return { repo: fallback, state: loaded ?? legacy ?? freshState(), engine: 'ls', migrated: false }
}
