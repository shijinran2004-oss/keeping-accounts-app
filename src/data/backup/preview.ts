/**
 * 导入前预览：把「备份里有什么」和「导入后会发生什么」算出来给界面展示。
 */
import type { ImportMode, ImportPreview, LedgerState, ParsedBackup } from '../../types'
import { applyImport } from './apply'

export function buildPreview(
  backup: ParsedBackup,
  current: LedgerState,
  mode: ImportMode,
): ImportPreview {
  const dates = backup.state.txs.map((tx) => tx.date).sort()
  const { outcome } = applyImport(backup, current, mode)

  return {
    mode,
    txCount: backup.state.txs.length,
    categoryCount: backup.state.categories.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates.length ? dates[dates.length - 1] : null,
    toAdd: outcome.added,
    toUpdate: outcome.updated,
    unchanged: outcome.unchanged,
    replaceCount: mode === 'replace' ? current.txs.length : 0,
    warnings: backup.warnings,
  }
}
