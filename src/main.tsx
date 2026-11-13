import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/app.css'
import './styles/og.css'
import App from './App'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { applyThemeFromStorage } from './utils'

async function initNative() {
  if (!Capacitor.isNativePlatform()) return
  const light = document.documentElement.dataset.theme === 'light'
  try {
    await StatusBar.setStyle({ style: light ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: light ? '#F2F2F7' : '#000000' })
  } catch {
    /* plugin unavailable */
  }
  try {
    await SplashScreen.hide()
  } catch {
    /* plugin unavailable */
  }
}

applyThemeFromStorage()
void initNative()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
