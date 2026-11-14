import { Capacitor, registerPlugin } from '@capacitor/core'
import type { OcrNativeResult } from '../../types'

interface OcrNativePlugin {
  recognize(options: { dataUrl: string; maxSide?: number }): Promise<OcrNativeResult>
  warmUp(): Promise<{ ready: boolean; ms: number }>
}

const Ocr = registerPlugin<OcrNativePlugin>('Ocr')

/** 浏览器里没有原生插件，界面上要把入口藏掉或提示 */
export function ocrAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Ocr')
}

/** 调用原生识别；只返回文字行，抽取逻辑在 parseReceipt 里 */
export async function recognizeReceipt(dataUrl: string, maxSide?: number): Promise<OcrNativeResult> {
  return Ocr.recognize({ dataUrl, maxSide })
}

/** 页面空闲时预热模型，第一张图会快很多 */
export async function warmUpOcr(): Promise<boolean> {
  if (!ocrAvailable()) return false
  try {
    const result = await Ocr.warmUp()
    return Boolean(result?.ready)
  } catch {
    return false
  }
}
