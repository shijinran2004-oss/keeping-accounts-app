import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/app.css'
import './styles/og.css'
import App from './App'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { applyThemeFromStorage } from './lib'

async function initNative() {
  if (!Capacitor.isNativePlatform()) return
  const light = document.documentElement.dataset.theme === 'light'
  try {
    await StatusBar.setStyle({ style: light ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: light ? '#F2F2F7' : '#000000' })
  } catch {
    /* plugin unavailable */
  }
  // LaunchScreen 会在首帧后主动 hide；这里只做兜底，避免插件异常时卡在启动图
  window.setTimeout(() => {
    SplashScreen.hide().catch(() => {})
  }, 2400)
}

applyThemeFromStorage()
void initNative()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
