import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Clipboard as CapClipboard } from '@capacitor/clipboard'
import { Download, FileJson, FolderOpen, Info, Trash2, Upload, Clipboard } from 'lucide-react'
import { useLedger } from '../data'
import {
  backupBytes,
  backupFileName,
  backupJson,
  exportBackupFile,
  formatBytes,
  readBackupFile,
  todayStr,
} from '../lib'
import { Sheet, useToast } from '../ui'

/**
 * 数据备份：导出 JSON、选文件或粘贴导入、清空记录。
 * 导入会整份覆盖当前账本，导出会弹系统分享面板或直接下载。
 */
export function DataSheet({
  open,
  onClose,
  onClear,
}: {
  open: boolean
  onClose: () => void
  onClear: () => void
}) {
  const { state, importState } = useLedger()
  const toast = useToast()
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [text, setText] = useState('')
  const [pickedName, setPickedName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setMode('export')
    setText('')
    setPickedName('')
    setConfirmClear(false)
    setBusy(false)
  }, [open])

  const json = backupJson(state)
  const fileName = backupFileName(todayStr())
  const bytes = backupBytes(json)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      toast('备份文本已复制', 'success')
    } catch {
      try {
        await CapClipboard.write({ string: json })
        toast('备份文本已复制', 'success')
      } catch {
        toast('复制失败，请长按选择文本', 'error')
      }
    }
  }

  const exportFile = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await exportBackupFile(json, fileName)
      toast(res === 'downloaded' ? '备份文件已下载' : '备份文件已生成', 'success')
    } catch {
      toast('导出失败，可以改用下面的文本备份', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const content = await readBackupFile(file)
      setText(content)
      setPickedName(file.name)
      toast(`已读取 ${file.name}`, 'success')
    } catch {
      toast('读取失败，换一个文件试试', 'error')
    }
  }

  const doImport = () => {
    const res = importState(text)
    if (res.ok) {
      toast('账本已恢复', 'success')
      onClose()
    } else {
      toast(res.error ?? '导入失败', 'error')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="数据备份" full>
      <div className="sheet-body data-sheet">
        <div className="mini-seg wide" role="tablist" aria-label="备份方式">
          <button type="button" role="tab" aria-selected={mode === 'export'} className={mode === 'export' ? 'is-active' : ''} onClick={() => setMode('export')}>
            <Download size={15} strokeWidth={1.7} /> 导出
          </button>
          <button type="button" role="tab" aria-selected={mode === 'import'} className={mode === 'import' ? 'is-active' : ''} onClick={() => setMode('import')}>
            <Upload size={15} strokeWidth={1.7} /> 导入
          </button>
        </div>

        {mode === 'export' ? (
          <>
            <div className="backup-card">
              <div className="backup-file">
                <FileJson size={20} strokeWidth={1.5} />
                <div>
                  <b>{fileName}</b>
                  <span>
                    {state.txs.length} 笔记录 · {state.categories.length} 个分类 · {formatBytes(bytes)}
                  </span>
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={exportFile} disabled={busy}>
                <Download size={16} strokeWidth={1.8} /> {busy ? '正在生成…' : '导出备份文件'}
              </button>
            </div>
            <p className="hint">
              导出后可以把文件发到微信、网盘或电脑上。换手机、重装 App 之后，切到「导入」选这个文件就能完整恢复。
            </p>
            <button type="button" className="btn-ghost block" onClick={copy}>
              <Clipboard size={15} strokeWidth={1.7} /> 复制为文本备份
            </button>
          </>
        ) : (
          <>
            <p className="hint">选择之前导出的 .json 文件；也可以把备份内容直接粘到下面的框里。导入会覆盖当前账本。</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="file-input"
              onChange={onFile}
            />
            <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
              <FolderOpen size={16} strokeWidth={1.8} /> 选择备份文件
            </button>
            {pickedName ? (
              <p className="backup-picked">
                <FileJson size={14} strokeWidth={1.7} /> {pickedName}
              </p>
            ) : null}
            <textarea
              className="backup-area"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setPickedName('')
              }}
              placeholder='把备份内容粘贴到这里，形如 {"version":1,...}'
              aria-label="粘贴备份内容"
            />
            <button type="button" className="btn-primary" disabled={!text.trim()} onClick={doImport}>
              导入并覆盖
            </button>
          </>
        )}

        <div className="data-note">
          <Info size={15} strokeWidth={1.7} />
          <p>数据保存在本机的应用存储里，卸载 App 会一起清除，记得偶尔导出一次备份。</p>
        </div>

        <div className="danger-zone">
          <h3>清空数据</h3>
          {confirmClear ? (
            <div className="confirm-row">
              <span>将删除全部 {state.txs.length} 笔记录，无法撤销。</span>
              <div>
                <button type="button" className="btn-ghost sm" onClick={() => setConfirmClear(false)}>取消</button>
                <button type="button" className="btn-danger sm" onClick={onClear}>确认清空</button>
              </div>
            </div>
          ) : (
            <button type="button" className="danger-row" onClick={() => setConfirmClear(true)}>
              <Trash2 size={16} strokeWidth={1.6} /> 清空所有记录
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
