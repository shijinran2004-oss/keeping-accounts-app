import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Check, Info, TriangleAlert } from 'lucide-react'

import type { ToastItem, ToastTone } from '../types'

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {})

/** 全局轻提示：2.2 秒自动消失；新消息会顶掉旧消息，不堆叠。 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastItem | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((text: string, tone: ToastTone = 'default') => {
    window.clearTimeout(timer.current)
    setMsg({ id: Date.now(), text, tone })
    timer.current = window.setTimeout(() => setMsg(null), 2200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div className={`toast toast-${msg.tone}`} role="status" key={msg.id}>
          {msg.tone === 'success' && <Check size={16} strokeWidth={2} />}
          {msg.tone === 'error' && <TriangleAlert size={16} strokeWidth={2} />}
          {msg.tone === 'default' && <Info size={16} strokeWidth={2} />}
          <span>{msg.text}</span>
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** 取 show(text, tone)；必须在 ToastProvider 内使用。 */
export function useToast() {
  return useContext(ToastContext)
}
