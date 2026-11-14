import { useEffect, useLayoutEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import poster from '../assets/launch-poster.png'

const EXIT_MS = 420
const HOLD_MS = 1300
const REDUCED_HOLD_MS = 240

/**
 * 冷启动海报：不再显示桌面图标，海报直接渐显、停留，再渐隐交给首页。
 * 只在原生冷启动显示；浏览器里加 ?launch=1 可预览。
 */
/**
 * 冷启动海报层：海报渐显 → 停留 → 虚化淡出 → onDone。
 * 不渲染 App 内容；减少动态效果时走最短路径。
 */
export function LaunchScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'in' | 'out'>('in')

  useLayoutEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let frame = 0
    let timer = 0
    // 海报解码完、第一帧画出来再收原生 splash，避免中间闪黑屏
    const hide = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          SplashScreen.hide().catch(() => {})
        })
      })
    }
    const preload = new Image()
    preload.onload = hide
    preload.onerror = hide
    preload.src = poster
    if (preload.complete) hide()
    timer = window.setTimeout(hide, 500)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      preload.onload = null
      preload.onerror = null
    }
  }, [])

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const hold = window.setTimeout(() => setPhase('out'), reduced ? REDUCED_HOLD_MS : HOLD_MS)
    return () => window.clearTimeout(hold)
  }, [])

  useEffect(() => {
    if (phase !== 'out') return
    const done = window.setTimeout(onDone, EXIT_MS)
    return () => window.clearTimeout(done)
  }, [phase, onDone])

  return (
    <div
      className={`launch launch-${phase}`}
      onClick={() => setPhase('out')}
      role="presentation"
      aria-hidden="true"
    >
      <img className="launch-poster" src={poster} alt="" draggable={false} />
    </div>
  )
}
