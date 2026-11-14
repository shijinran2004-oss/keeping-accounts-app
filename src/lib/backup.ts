import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { BackupExportResult, LedgerState } from '../types'

/** 备份文件名，例如：使劲燃的钱-备份-2026-11-11.json */
export function backupFileName(date: string): string {
  return `使劲燃的钱-备份-${date}.json`
}

/** 整个账本序列化成备份文本（就是 localStorage 里存的那份） */
export function backupJson(state: LedgerState): string {
  return JSON.stringify(state, null, 2)
}

/** 备份文本的字节数，按 UTF-8 算 */
export function backupBytes(json: string): number {
  return new TextEncoder().encode(json).length
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

/**
 * 导出备份文件。
 * 原生端写进 Cache 目录再交给系统分享面板（可存到文件、发微信、发网盘）；
 * 浏览器端直接触发下载。
 */
export async function exportBackupFile(json: string, fileName: string): Promise<BackupExportResult> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: fileName,
      text: '使劲燃的钱 · 账本备份',
      url: uri,
      dialogTitle: '保存或发送备份文件',
    })
    return 'shared'
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

/** 读取用户选中的备份文件 */
export async function readBackupFile(file: File): Promise<string> {
  return file.text()
}
