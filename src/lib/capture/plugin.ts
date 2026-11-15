import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { AutoRecord, CaptureImage, CaptureSource, WatchStatus } from '../../types'

/**
 * 原生 Capture 插件（Android 侧见 capture/CapturePlugin.java）。
 * 它只负责把「别的 App 分享过来的图」和「监听服务认出来的截图」变成 dataUrl，
 * 识别、解析、回填全在前端，和拍小票走同一条路。
 */
interface CaptureApi {
  consume(): Promise<{ dataUrl?: string; source?: string; text?: string }>
  drainAutoRecords(): Promise<{ records?: AutoRecord[] }>
  watchStatus(): Promise<WatchStatus>
  enableWatch(): Promise<WatchStatus>
  openNoticeSettings(): Promise<void>
  disableWatch(): Promise<WatchStatus>
  addListener(
    event: 'capture',
    listener: (data: { source?: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(event: 'captureRecord', listener: () => void): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

let instance: CaptureApi | null = null

/** 懒注册：只有真的用到才注册，避免重复 import 时打「已注册」警告 */
function capture(): CaptureApi {
  if (!instance) instance = registerPlugin<CaptureApi>('Capture')
  return instance
}

/** 非原生环境或插件缺失时的状态 */
export const WATCH_OFF: WatchStatus = {
  supported: false,
  enabled: false,
  running: false,
  permission: 'prompt',
}

/** 这台设备能不能走分享/截图记账 */
export function captureAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Capture')
}

function asSource(value?: string): CaptureSource {
  return value === 'screenshot' ? 'screenshot' : 'share'
}

/** 取走等待中的那张图（分享或截图通知），没有就返回 null */
export async function consumeCapture(): Promise<CaptureImage | null> {
  if (!captureAvailable()) return null
  try {
    const result = await capture().consume()
    if (!result?.dataUrl) return null
    return { dataUrl: result.dataUrl, source: asSource(result.source), text: result.text }
  } catch {
    return null
  }
}

/** 取走通知里「直接记一笔」攒下的记录，取完原生存档就清空 */
export async function drainAutoRecords(): Promise<AutoRecord[]> {
  if (!captureAvailable()) return []
  try {
    const result = await capture().drainAutoRecords()
    return result?.records ?? []
  } catch {
    return []
  }
}

/** 监听开关的当前状态 */
export async function watchStatus(): Promise<WatchStatus> {
  if (!captureAvailable()) return WATCH_OFF
  try {
    return await capture().watchStatus()
  } catch {
    return WATCH_OFF
  }
}

/** 跳到系统的「截图记账提醒」通知设置，让用户把横幅打开 */
export async function openNoticeSettings(): Promise<void> {
  if (!captureAvailable()) return
  await capture().openNoticeSettings()
}

/** 打开截图监听：会申请相册（与通知）权限，成功后常驻一条通知 */
export async function enableWatch(): Promise<WatchStatus> {
  if (!captureAvailable()) throw new Error('这台设备不支持截图记账')
  return capture().enableWatch()
}

/** 关闭截图监听并停掉常驻通知 */
export async function disableWatch(): Promise<WatchStatus> {
  if (!captureAvailable()) return WATCH_OFF
  return capture().disableWatch()
}

/**
 * 通知里点了「直接记一笔」时叫一声（App 在前台的话立刻写进账本，不用等切回前台）。
 */
export async function onAutoRecord(handler: () => void): Promise<() => void> {
  if (!captureAvailable()) return () => {}
  const handle = await capture().addListener('captureRecord', () => handler())
  return () => {
    void handle.remove()
  }
}

/**
 * 订阅原生事件：分享进来、或从通知点进来。
 * 回调里已经带着图，返回的函数用来取消订阅。
 */
export async function onCapture(handler: (image: CaptureImage) => void): Promise<() => void> {
  if (!captureAvailable()) return () => {}
  const handle = await capture().addListener('capture', () => {
    void consumeCapture().then((image) => {
      if (image) handler(image)
    })
  })
  return () => {
    void handle.remove()
  }
}
