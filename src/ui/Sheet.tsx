import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { popModal, pushModal } from '../lib'

/**
 * 常规底部弹层：遮罩、关闭按钮、Esc、Android 返回键、body 滚动锁定都在这里。
 * 只负责壳；表单、保存逻辑由调用方（sheets/ 里的弹层）自己管。
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  full?: boolean
}) {
  useEffect(() => {
    if (!open) return
    pushModal(onClose)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      popModal(onClose)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${full ? 'sheet-full' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="关闭" type="button">
              <X size={20} strokeWidth={1.7} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
