/**
 * 生成备份文件：v2 容器 + 可选 gzip；legacy 选项生成旧版裸 JSON，给 1.1.x 兜底。
 */
import type { LedgerState } from '../../types'
import { gzipSupported, gzipText } from './codec'
import { APP_VERSION, BACKUP_FORMAT, BACKUP_SCHEMA, checksumOf, type BackupEnvelope } from './format'

export interface BuiltBackup {
  /** 未压缩时的完整文本；压缩时也保留一份，供复制文本用 */
  text: string
  /** 压缩后的字节；未压缩时为 null */
  bytes: Uint8Array | null
  compressed: boolean
  /** 压缩前的 UTF-8 字节数 */
  originalBytes: number
  fileName: string
  mime: string
}

export interface BuildOptions {
  compress?: boolean
  legacy?: boolean
  appVersion?: string
}

export async function buildBackup(
  state: LedgerState,
  date: string,
  options: BuildOptions = {},
): Promise<BuiltBackup> {
  const baseName = '使劲燃的钱-备份-' + date

  if (options.legacy) {
    const text = JSON.stringify(state, null, 2)
    return {
      text,
      bytes: null,
      compressed: false,
      originalBytes: new TextEncoder().encode(text).length,
      fileName: baseName + '.json',
      mime: 'application/json',
    }
  }

  const payloadText = JSON.stringify(state)
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    schema: BACKUP_SCHEMA,
    appVersion: options.appVersion ?? APP_VERSION,
    exportedAt: Date.now(),
    counts: { txs: state.txs.length, categories: state.categories.length },
    checksum: checksumOf(payloadText),
    payload: state,
  }
  const text = JSON.stringify(envelope)
  const originalBytes = new TextEncoder().encode(text).length

  if (options.compress && gzipSupported()) {
    const bytes = await gzipText(text)
    return {
      text,
      bytes,
      compressed: true,
      originalBytes,
      fileName: baseName + '.json.gz',
      mime: 'application/gzip',
    }
  }

  return {
    text,
    bytes: null,
    compressed: false,
    originalBytes,
    fileName: baseName + '.json',
    mime: 'application/json',
  }
}
