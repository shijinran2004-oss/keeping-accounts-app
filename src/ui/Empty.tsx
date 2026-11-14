import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** 空状态占位：图标、标题、可选提示和操作按钮，列表/日历共用。 */
export function Empty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={22} strokeWidth={1.5} />
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action}
    </div>
  )
}
