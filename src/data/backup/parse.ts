/**
 * 把用户给的东西（粘贴的文本 / 选中的文件）解析成可导入的账本。
 *
 * 支持三种输入：v2 容器（可 gzip）、旧版裸 LedgerState、以及以后 schema 升级后的容器。
 * 解析只做只读校验，不改动任何现有数据；坏记录会被跳过并在 warnings 里说明。
 */
import type { ParsedBackup } from '../../types'
import { normalize } from '../normalize'
import { gunzipText, isGzip } from './codec'
import { BACKUP_SCHEMA, checksumOf, isEnvelope } from './format'

/** 文本通道 2MB、文件通道 20MB：超出时给可读提示，而不是把页面卡死 */
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_FILE_BYTES = 20 * 1024 * 1024

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupParseError'
  }
}

export interface BackupInput {
  text?: string
  bytes?: Uint8Array
}

export async function parseBackup(input: BackupInput): Promise<ParsedBackup> {
  const warnings: string[] = []
  let text: string
  let compressed = false

  if (input.bytes) {
    if (input.bytes.length > MAX_FILE_BYTES) throw new BackupParseError('文件超过 20MB，请确认选的是账本备份')
    if (isGzip(input.bytes)) {
      compressed = true
      try {
        text = await gunzipText(input.bytes)
      } catch {
        throw new BackupParseError('压缩包解不开，文件可能已损坏')
      }
    } else {
      text = new TextDecoder().decode(input.bytes)
    }
  } else {
    text = (input.text ?? '').trim()
    if (!text) throw new BackupParseError('备份内容为空')
    if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) {
      throw new BackupParseError('粘贴的内容超过 2MB，请改用文件导入')
    }
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new BackupParseError('不是有效的 JSON，确认复制完整')
  }

  let payload: unknown = value
  let schema = 1
  let appVersion: string | undefined
  let exportedAt: number | undefined

  if (isEnvelope(value)) {
    schema = value.schema
    if (schema > BACKUP_SCHEMA) throw new BackupParseError('这份备份来自更新的 App 版本，请先升级再导入')
    payload = value.payload
    appVersion = value.appVersion
    exportedAt = value.exportedAt
    if (value.checksum) {
      const actual = checksumOf(JSON.stringify(value.payload))
      if (actual !== value.checksum) warnings.push('校验和不一致，文件可能被改动过；已尽量恢复可读内容')
    }
  } else {
    warnings.push('这是旧版纯 JSON 备份，已按兼容模式读取')
  }

  const state = normalize(payload)
  if (!state) throw new BackupParseError('备份内容不完整，缺少账本设置或流水')

  const rawTxs = (payload as { txs?: unknown }).txs
  if (Array.isArray(rawTxs) && rawTxs.length > state.txs.length) {
    warnings.push('有 ' + (rawTxs.length - state.txs.length) + ' 笔记录格式不对，已跳过')
  }

  return {
    state,
    meta: {
      schema,
      appVersion,
      exportedAt,
      txCount: state.txs.length,
      categoryCount: state.categories.length,
      compressed,
    },
    warnings,
  }
}
