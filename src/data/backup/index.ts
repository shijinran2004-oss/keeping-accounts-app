/**
 * 备份模块出口：格式、编解码、解析、预览、应用、快照。
 */
export { APP_VERSION, BACKUP_FORMAT, BACKUP_SCHEMA, checksumOf, isEnvelope } from './format'
export type { BackupEnvelope } from './format'
export { gzipSupported, gzipText, gunzipText, isGzip } from './codec'
export { BackupParseError, parseBackup } from './parse'
export type { BackupInput } from './parse'
export { buildPreview } from './preview'
export { applyImport } from './apply'
export { buildBackup } from './export'
export type { BuildOptions, BuiltBackup } from './export'
export {
  SNAPSHOT_KEEP,
  createSnapshot,
  maybeWeeklySnapshot,
  pruneSnapshots,
  restoreSnapshot,
} from './snapshot'
