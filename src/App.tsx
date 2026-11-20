import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { LedgerProvider, useLedger } from './data'
import { Home, Ledger, Me, Onboarding, Stats } from './pages'
import { AddSheet, TxDetailSheet } from './sheets'
import type { CaptureImage, Tab, Tx, TxType } from './types'
import {
  applyTheme,
  captureAvailable,
  closeTopModal,
  consumeCapture,
  onCapture,
  onLaunchAction,
  takeLaunchAction,
} from './lib'
import { AlertTriangle } from 'lucide-react'
import { LaunchScreen, TabBar, ToastProvider } from './ui'

/**
 * 应用壳：四个 tab、记账/详情弹层、Android 返回键和主题/状态栏同步。
 */
function Shell({ launching }: { launching: boolean }) {
  const { state, storageError, dismissStorageError } = useLedger()
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Tx | null>(null)
  const [seed, setSeed] = useState<{ type?: TxType; categoryId?: string } | null>(null)
  const [detailTx, setDetailTx] = useState<Tx | null>(null)
  const [capture, setCapture] = useState<CaptureImage | null>(null)
  const theme = state.settings.theme ?? 'light'
  const accent = state.settings.accent ?? 'lime'

  useEffect(() => {
    const sync = () => {
      const resolved = applyTheme(theme, accent)
      if (!Capacitor.isNativePlatform()) return
      // 冷启动海报是整屏奶油色，这段时间状态栏也刷成海报顶边色，别留一条灰带
      const light = resolved === 'light'
      StatusBar.setBackgroundColor({
        color: launching ? '#FCFEF8' : light ? '#F2F2F7' : '#000000',
      })
        .then(() => StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }))
        .catch(() => {})
    }
    sync()
    if (theme !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme, accent, launching])

  const openAdd = (tx?: Tx, nextSeed?: { type?: TxType; categoryId?: string }) => {
    setEditing(tx ?? null)
    setSeed(nextSeed ?? null)
    setAddOpen(true)
  }

  const editFromDetail = (tx: Tx) => {
    setDetailTx(null)
    window.setTimeout(() => openAdd(tx), 180)
  }

  // 分享进来或点截图通知：先取走那张图，再直接打开记账弹层；识别交给 AddSheet
  useEffect(() => {
    if (!captureAvailable()) return
    let alive = true
    let off: (() => void) | undefined
    const take = (image: CaptureImage | null) => {
      if (!alive || !image) return
      setEditing(null)
      setSeed(null)
      setCapture(image)
      setAddOpen(true)
    }
    void onCapture(take).then((stop) => {
      off = stop
      if (!alive) stop()
    })
    void consumeCapture().then(take)
    return () => {
      alive = false
      off?.()
    }
  }, [])

  // 桌面快捷方式 / 小组件点「记一笔」：冷启动和热启动都要能直接开弹层
  useEffect(() => {
    if (!captureAvailable()) return
    let alive = true
    let off: (() => void) | undefined
    void takeLaunchAction().then((action) => {
      if (alive && action === 'add') openAdd()
    })
    void onLaunchAction((action) => {
      if (action === 'add') openAdd()
    }).then((stop) => {
      off = stop
      if (!alive) stop()
    })
    return () => {
      alive = false
      off?.()
    }
  }, [])

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
      {storageError ? (
        <div className="storage-banner" role="alert">
          <AlertTriangle size={15} strokeWidth={1.8} />
          <span>没能保存到本机：{storageError}</span>
          <button type="button" onClick={dismissStorageError}>
            知道了
          </button>
        </div>
      ) : null}
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
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        editing={editing}
        seed={seed}
        capture={capture}
        onCaptureUsed={() => setCapture(null)}
      />
    </div>
  )
}

/** 根组件：数据 Provider、Toast，以及冷启动海报。 */
export default function App() {
  const [launching, setLaunching] = useState(
    () => Capacitor.isNativePlatform() || new URLSearchParams(window.location.search).has('launch'),
  )

  return (
    <>
      <LedgerProvider>
        <ToastProvider>
          <Shell launching={launching} />
        </ToastProvider>
      </LedgerProvider>
      {launching && <LaunchScreen onDone={() => setLaunching(false)} />}
    </>
  )
}
