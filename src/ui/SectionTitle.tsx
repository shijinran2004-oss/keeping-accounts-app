import React from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * 小节标题。传 action 时右侧显示「全部 / 更多」，点击走 onAction。
 */
export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: React.ReactNode
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action && (
        <button className="text-btn" onClick={onAction} type="button">
          {action}
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}
