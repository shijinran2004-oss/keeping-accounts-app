import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { LedgerProvider, useLedger } from './data'
import { Home } from './pages/Home'
import { Ledger } from './pages/Ledger'
import { Stats } from './pages/Stats'
import { Me } from './pages/Me'
import { Onboarding } from './pages/Onboarding'
import { AddSheet } from './pages/AddSheet'
import type { Tab, Tx, TxType } from './types'
import { applyTheme, closeTopModal } from './utils'
import { TabBar, ToastProvider, TxDetailSheet } from './components'

function Shell() {
  const { state } = useLedger()
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Tx | null>(null)
  const [seed, setSeed] = useState<{ type?: TxType; categoryId?: string } | null>(null)
  const [detailTx, setDetailTx] = useState<Tx | null>(null)
  const theme = state.settings.theme ?? 'dark'
  const accent = state.settings.accent ?? 'lime'

  useEffect(() => {
    const sync = () => {
      const resolved = applyTheme(theme, accent)
      if (!Capacitor.isNativePlatform()) return
      StatusBar.setStyle({ style: resolved === 'light' ? Style.Dark : Style.Light }).catch(() => {})
      StatusBar.setBackgroundColor({ color: resolved === 'light' ? '#F2F2F7' : '#000000' }).catch(
        () => {},
      )
    }
    sync()
    if (theme !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme, accent])

  const openAdd = (tx?: Tx, nextSeed?: { type?: TxType; categoryId?: string }) => {
    setEditing(tx ?? null)
    setSeed(nextSeed ?? null)
    setAddOpen(true)
  }

  const editFromDetail = (tx: Tx) => {
    setDetailTx(null)
    window.setTimeout(() => openAdd(tx), 180)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    CapApp.addListener('backButton', () => {
      if (closeTopModal()) return
      if (tab !== 'home') {
        setTab('home')
        return
      }
      CapApp.exitApp()
    }).then((h) => {
      remove = () => h.remove()
    })
    return () => remove?.()
  }, [tab])

  if (!state.settings.onboarded) return <Onboarding />

  return (
    <div className="app">
      <main className="main" key={tab}>
        {tab === 'home' && (
          <Home
            onAdd={() => openAdd()}
            onOpenTx={(tx) => setDetailTx(tx)}
            onGoLedger={() => setTab('ledger')}
            onGoStats={() => setTab('stats')}
            onGoMe={() => setTab('me')}
            onQuickAdd={(categoryId) => openAdd(undefined, { type: 'expense', categoryId })}
          />
        )}
        {tab === 'ledger' && <Ledger onOpenTx={(tx) => setDetailTx(tx)} onAdd={() => openAdd()} />}
        {tab === 'stats' && <Stats onGoMe={() => setTab('me')} />}
        {tab === 'me' && <Me />}
      </main>
      <TabBar tab={tab} onChange={setTab} onAdd={() => openAdd()} />
      <TxDetailSheet tx={detailTx} onClose={() => setDetailTx(null)} onEdit={editFromDetail} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} editing={editing} seed={seed} />
    </div>
  )
}

export default function App() {
  return (
    <LedgerProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </LedgerProvider>
  )
}
