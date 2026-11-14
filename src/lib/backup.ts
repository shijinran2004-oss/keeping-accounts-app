import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { BackupExportResult } from '../types'

/** 备份文件名，例如：使劲燃的钱-备份-2026-11-11.json(.gz) */
export function backupFileName(date: string, ext: 'json' | 'json.gz' = 'json'): string {
  return '使劲燃的钱-备份-' + date + '.' + ext
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(1) + ' KB'
  return (kb / 1024).toFixed(2) + ' MB'
}

/** 二进制转 base64：分块处理，避免大文件一次展开爆栈 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface BackupFilePayload {
  fileName: string
  mime: string
  /** 明文备份 */
  text?: string
  /** 压缩后的二进制备份 */
  bytes?: Uint8Array
}

/**
 * 导出备份文件。
 * 原生端写进 Cache 目录再交给系统分享面板；浏览器端直接触发下载。
 * 二进制（.json.gz）在原生端按 base64 写入，不传 encoding 即为二进制模式。
 */
export async function exportBackupFile(file: BackupFilePayload): Promise<BackupExportResult> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: file.fileName,
      data: file.bytes ? bytesToBase64(file.bytes) : (file.text ?? ''),
      directory: Directory.Cache,
      ...(file.bytes ? {} : { encoding: Encoding.UTF8 }),
    })
    await Share.share({
      title: file.fileName,
      text: '使劲燃的钱 · 账本备份',
      url: uri,
      dialogTitle: '保存或发送备份文件',
    })
    return 'shared'
  }

  const blob = file.bytes
    ? new Blob([file.bytes as unknown as BlobPart], { type: file.mime })
    : new Blob([file.text ?? ''], { type: file.mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

/** 读取用户选中的备份文件；交给 data 层判断是明文还是 gzip */
export async function readBackupFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
