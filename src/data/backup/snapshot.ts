/**
 * 本机快照：导入、清空、恢复之前自动留一份，每周也留一份。
 * 只保留最近 5 份，超出部分从最旧开始删。
 */
import type { LedgerRepository, LedgerState, SnapshotKind, SnapshotMeta, SnapshotRecord } from '../../types'
import { normalize } from '../normalize'

export const SNAPSHOT_KEEP = 5
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function newSnapshotId(now: number): string {
  return 's-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

export async function createSnapshot(
  repo: LedgerRepository,
  state: LedgerState,
  kind: SnapshotKind,
): Promise<SnapshotMeta> {
  const data = JSON.stringify(state)
  const now = Date.now()
  const record: SnapshotRecord = {
    id: newSnapshotId(now),
    kind,
    createdAt: now,
    txCount: state.txs.length,
    bytes: new TextEncoder().encode(data).length,
    data,
  }
  await repo.putSnapshot(record)
  await pruneSnapshots(repo)
  return { id: record.id, kind, createdAt: now, txCount: record.txCount, bytes: record.bytes }
}

export async function pruneSnapshots(repo: LedgerRepository, keep = SNAPSHOT_KEEP): Promise<void> {
  const list = await repo.listSnapshots()
  await Promise.all(list.slice(keep).map((snapshot) => repo.deleteSnapshot(snapshot.id)))
}

/** 一周内没有快照就补一份；失败只写日志，不影响启动 */
export async function maybeWeeklySnapshot(repo: LedgerRepository, state: LedgerState): Promise<void> {
  if (!state.txs.length) return
  try {
    const list = await repo.listSnapshots()
    const latest = list[0]
    if (latest && Date.now() - latest.createdAt < WEEK_MS) return
    await createSnapshot(repo, state, 'weekly')
  } catch (error) {
    console.warn('[backup] 每周快照失败', error)
  }
}

/** 恢复快照；恢复前会把当前状态再存一份，防止点错无法回头 */
export async function restoreSnapshot(repo: LedgerRepository, id: string): Promise<LedgerState> {
  const record = await repo.getSnapshot(id)
  if (!record) throw new Error('快照不存在或已被清理')
  let parsed: unknown
  try {
    parsed = JSON.parse(record.data)
  } catch {
    throw new Error('快照内容已损坏，无法恢复')
  }
  const state = normalize(parsed)
  if (!state) throw new Error('快照内容不完整，无法恢复')

  const current = await repo.load()
  if (current && current.txs.length) await createSnapshot(repo, current, 'before-restore')
  await repo.replaceAll(state)
  return state
}
