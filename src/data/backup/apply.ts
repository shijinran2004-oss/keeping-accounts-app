/**
 * 把解析好的备份应用到当前账本。纯函数，不改 React 状态也不碰存储，
 * 方便单测，也让「覆盖 / 合并 / 仅设置」三种模式只差这一层。
 */
import type { ImportMode, ImportOutcome, LedgerState, ParsedBackup, Tx } from '../../types'

function sameTx(a: Tx, b: Tx): boolean {
  return (
    a.amount === b.amount &&
    a.type === b.type &&
    a.categoryId === b.categoryId &&
    a.note === b.note &&
    a.date === b.date &&
    a.createdAt === b.createdAt
  )
}

export function applyImport(
  backup: ParsedBackup,
  current: LedgerState,
  mode: ImportMode,
): { state: LedgerState; outcome: ImportOutcome } {
  if (mode === 'replace') {
    const total = backup.state.txs.length
    return {
      state: backup.state,
      outcome: { mode, added: total, updated: 0, unchanged: 0, total },
    }
  }

  if (mode === 'settings') {
    // 只恢复设置与分类：备份里的分类优先，现有的自定义分类保留，避免现有流水失去归属
    const ids = new Set(backup.state.categories.map((category) => category.id))
    const categories = [
      ...backup.state.categories,
      ...current.categories.filter((category) => !ids.has(category.id)),
    ]
    return {
      state: { ...current, settings: backup.state.settings, categories },
      outcome: { mode, added: 0, updated: 0, unchanged: 0, total: current.txs.length },
    }
  }

  const merged = [...current.txs]
  const index = new Map(merged.map((tx, at) => [tx.id, at]))
  let added = 0
  let updated = 0
  let unchanged = 0

  for (const tx of backup.state.txs) {
    const at = index.get(tx.id)
    if (at === undefined) {
      index.set(tx.id, merged.length)
      merged.push(tx)
      added += 1
      continue
    }
    const old = merged[at]
    if (sameTx(old, tx)) {
      unchanged += 1
      continue
    }
    // 同 id 冲突时取更新时间更晚的一条
    if (tx.createdAt >= old.createdAt) {
      merged[at] = tx
      updated += 1
    } else {
      unchanged += 1
    }
  }

  // 合并只动流水，但备份里的新分类要带上，否则导入的记录找不到分类名
  const currentIds = new Set(current.categories.map((category) => category.id))
  const categories = [
    ...current.categories,
    ...backup.state.categories.filter((category) => !currentIds.has(category.id)),
  ]
  return {
    state: { ...current, categories, txs: merged },
    outcome: { mode, added, updated, unchanged, total: merged.length },
  }
}
