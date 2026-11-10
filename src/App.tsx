import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { LedgerProvider, useLedger } from './data'
import { Home } from './pages/Home'
import { Ledger } from './pages/Ledger'
import { Stats } from './pages/Stats'
import { Me } from './pages/Me'
import { Onboarding } from './pages/Onboarding'
import { AddSheet } from './pages/AddSheet'
import type { Tab, Tx, TxType } from './types'
import { closeTopModal } from './utils'
import { TabBar, ToastProvider } from './components'

function Shell() {
  const { state } = useLedger()
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Tx | null>(null)
  const [seed, setSeed] = useState<{ type?: TxType; categoryId?: string } | null>(null)

  const openAdd = (tx?: Tx, nextSeed?: { type?: TxType; categoryId?: string }) => {
    setEditing(tx ?? null)
    setSeed(nextSeed ?? null)
    setAddOpen(true)
  }

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
            onEdit={(tx) => openAdd(tx)}
            onGoLedger={() => setTab('ledger')}
            onGoStats={() => setTab('stats')}
            onGoMe={() => setTab('me')}
            onQuickAdd={(categoryId) => openAdd(undefined, { type: 'expense', categoryId })}
          />
        )}
        {tab === 'ledger' && <Ledger onEdit={(tx) => openAdd(tx)} onAdd={() => openAdd()} />}
        {tab === 'stats' && <Stats onGoMe={() => setTab('me')} />}
        {tab === 'me' && <Me />}
      </main>
      <TabBar tab={tab} onChange={setTab} onAdd={() => openAdd()} />
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
