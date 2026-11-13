import { useEffect, useLayoutEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import appIcon from '../assets/app-icon.png'
import poster from '../assets/launch-poster.png'

const EXIT_MS = 420
const HOLD_MS = 1350
const REDUCED_HOLD_MS = 260

/**
 * 冷启动时从桌面图标过渡到海报：图标先出现，随后海报从图标的圆角矩形里
 * 向外展开、同时对上焦；离场时海报虚化，交底给首页。
 * 只在原生冷启动显示；浏览器里加 ?launch=1 可预览。
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
      <div className="launch-clip">
        <img className="launch-poster" src={poster} alt="" draggable={false} />
      </div>
      <div className="launch-icon-wrap">
        <img className="launch-icon" src={appIcon} alt="" draggable={false} />
      </div>
    </div>
  )
}
