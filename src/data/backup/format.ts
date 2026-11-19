/**
 * 备份文件格式 v2。
 *
 * 旧版备份是裸 LedgerState；新版在正文外面包一层头部：格式标识、schema、
 * 版本、时间、条数、校验和。头部用于在导入前判断文件是什么、能不能读、有没有损坏。
 */
import type { LedgerState } from '../../types'

export const BACKUP_FORMAT = 'shijinran.backup'
export const BACKUP_SCHEMA = 2
/** 与 package.json 的 version 保持一致，导入预览里展示 */
export const APP_VERSION = '1.4.33'

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT
  schema: number
  appVersion: string
  exportedAt: number
  counts: { txs: number; categories: number }
  checksum: string
  payload: LedgerState
}

/** FNV-1a 32 位，用于发现截断或改坏，不做安全用途 */
export function checksumOf(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0')
}

/** 判断一个 JSON 值是不是 v2 备份容器 */
export function isEnvelope(value: unknown): value is BackupEnvelope {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<BackupEnvelope>
  return (
    row.format === BACKUP_FORMAT &&
    typeof row.schema === 'number' &&
    typeof row.payload === 'object' &&
    row.payload !== null
  )
}
