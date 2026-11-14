import React from 'react'
import { ChevronRight } from 'lucide-react'

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
