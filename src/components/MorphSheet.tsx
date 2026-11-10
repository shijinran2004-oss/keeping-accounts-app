import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { popModal, pushModal } from '../utils/modalStack'

/**
 * 形变弹层：从底部导航中间的「+」按钮原位长成一块面板，收起时缩回原处。
 * 折叠态与 .tab-add 完全重合（同位置、同尺寸、同配色），所以看起来是同一个元素在变形。
 */

const EXIT_MS = 460

type Geometry = {
  x: number
  y: number
  w: number
  h: number
  openX: number
  openY: number
  openW: number
  openH: number
}

function measure(): Geometry {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const fab = document.querySelector('.tab-add') as HTMLElement | null
  const rect = fab?.getBoundingClientRect()
  const w = rect?.width ?? 50
  const h = rect?.height ?? 50
  const openH = Math.round(Math.min(vh * 0.88, 570))
  return {
    x: Math.round(rect ? rect.left : vw / 2 - w / 2),
    y: Math.round(rect ? rect.top : vh - 70),
    w,
    h,
    openX: 0,
    openY: vh - openH,
    openW: vw,
    openH,
  }
}

export function MorphSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [geo, setGeo] = useState<Geometry | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (open) {
      setGeo(measure())
      setMounted(true)
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setExpanded(true))
      })
      const onResize = () => setGeo(measure())
      window.addEventListener('resize', onResize)
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
        window.removeEventListener('resize', onResize)
      }
    }
    setExpanded(false)
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const close = () => closeRef.current()
    pushModal(close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      popModal(close)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mounted])

  if (!mounted || !geo) return null

  return createPortal(
    <div className={`morph-root ${expanded ? 'is-open' : ''}`}>
      <div className="morph-backdrop" onClick={() => closeRef.current()} />
      <div
        className={`morph-panel ${expanded ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={
          {
            '--qa-x': `${geo.x}px`,
            '--qa-y': `${geo.y}px`,
            '--qa-w': `${geo.w}px`,
            '--qa-h': `${geo.h}px`,
            '--qa-ox': `${geo.openX}px`,
            '--qa-oy': `${geo.openY}px`,
            '--qa-ow': `${geo.openW}px`,
            '--qa-oh': `${geo.openH}px`,
          } as React.CSSProperties
        }
      >
        <div className="morph-face" aria-hidden="true">
          <Plus size={26} strokeWidth={2} />
        </div>
        <div className="morph-body" aria-hidden={!expanded}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
