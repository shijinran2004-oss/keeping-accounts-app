import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/app.css'
import './styles/og.css'
import App from './App'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

async function initNative() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#000000' })
  } catch {
    /* plugin unavailable */
  }
  try {
    await SplashScreen.hide()
  } catch {
    /* plugin unavailable */
  }
}

void initNative()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
