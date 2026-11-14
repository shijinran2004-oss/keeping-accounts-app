import { useEffect, useState } from 'react'
import { DEFAULT_LEDGER_NAME, useLedger } from '../data'
import { Sheet, useToast } from '../ui'

export function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) setDraft(state.settings.name?.trim() || DEFAULT_LEDGER_NAME)
  }, [open, state.settings.name])

  const save = () => {
    const next = draft.trim() || DEFAULT_LEDGER_NAME
    saveSettings({ name: next })
    toast('名字已更新')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="账本名字">
      <div className="sheet-body form">
        <label className="field">
          <span>名字</span>
          <input
            className="name-input"
            value={draft}
            maxLength={20}
            placeholder={DEFAULT_LEDGER_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </label>
        <p className="field-note">最多 20 个字；首页大标题会同步显示，问候语按手机时间自动变。</p>
        <button className="btn-primary" type="button" disabled={!draft.trim()} onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  )
}
