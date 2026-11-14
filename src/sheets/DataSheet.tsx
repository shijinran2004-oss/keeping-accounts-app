import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Clipboard as CapClipboard } from '@capacitor/clipboard'
import {
  AlertTriangle,
  Clipboard,
  Download,
  FileJson,
  FolderOpen,
  History,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { buildBackup, buildPreview, parseBackup, useLedger } from '../data'
import { backupFileName, exportBackupFile, formatBytes, readBackupFile, todayStr } from '../lib'
import type { ImportMode, ParsedBackup, SnapshotKind, SnapshotMeta } from '../types'
import { Sheet, useToast } from '../ui'

const MODE_OPTIONS: { value: ImportMode; label: string }[] = [
  { value: 'replace', label: '覆盖恢复' },
  { value: 'merge', label: '合并' },
  { value: 'settings', label: '仅设置与分类' },
]

const KIND_LABEL: Record<SnapshotKind, string> = {
  'before-import': '导入前',
  'before-clear': '清空前',
  'before-restore': '恢复前',
  weekly: '每周',
  manual: '手动',
}

function formatMoment(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/**
 * 数据备份：导出（可压缩）、导入（先预览再确认，支持三种模式）、本机快照、清空。
 * 导入不再直接覆盖：先在弹层里核对条数与日期范围，确认后再写库，写前自动留快照。
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
  const { state, importBackup, listSnapshots, restoreSnapshot } = useLedger()
  const toast = useToast()
  const [tab, setTab] = useState<'export' | 'import'>('export')
  const [busy, setBusy] = useState(false)
  const [legacy, setLegacy] = useState(false)
  const [exportInfo, setExportInfo] = useState<{ original: number; packed: number | null } | null>(null)
  const [text, setText] = useState('')
  const [pickedName, setPickedName] = useState('')
  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [parseError, setParseError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [mode, setMode] = useState<ImportMode>('replace')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [restoreId, setRestoreId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const parseSeq = useRef(0)

  useEffect(() => {
    if (!open) return
    setTab('export')
    setText('')
    setPickedName('')
    setParsed(null)
    setParseError('')
    setMode('replace')
    setRestoreId('')
    setConfirmClear(false)
    setBusy(false)
  }, [open])

  // 打开时读一次快照列表
  useEffect(() => {
    if (!open) return
    let alive = true
    listSnapshots()
      .then((rows) => {
        if (alive) setSnapshots(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, listSnapshots])

  // 导出体积：只在打开导出页时算一次，不再随每次输入重算整本账
  useEffect(() => {
    if (!open || tab !== 'export') return
    let alive = true
    setExportInfo(null)
    buildBackup(state, todayStr(), { compress: true })
      .then((built) => {
        if (alive) setExportInfo({ original: built.originalBytes, packed: built.bytes ? built.bytes.length : null })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, tab, state])

  // 粘贴文本后 260ms 再解析，避免每敲一个字符都跑一次
  useEffect(() => {
    const value = text.trim()
    if (!value) {
      setParsing(false)
      return
    }
    const seq = parseSeq.current + 1
    parseSeq.current = seq
    setParsing(true)
    const timer = window.setTimeout(() => {
      parseBackup({ text: value })
        .then((result) => {
          if (parseSeq.current !== seq) return
          setParsed(result)
          setParseError('')
        })
        .catch((error: unknown) => {
          if (parseSeq.current !== seq) return
          setParsed(null)
          setParseError(error instanceof Error ? error.message : '读不懂这个备份')
        })
        .finally(() => {
          if (parseSeq.current === seq) setParsing(false)
        })
    }, 260)
    return () => window.clearTimeout(timer)
  }, [text])

  const preview = useMemo(
    () => (parsed ? buildPreview(parsed, state, mode) : null),
    [parsed, state, mode],
  )

  const copy = async () => {
    try {
      const built = await buildBackup(state, todayStr())
      try {
        await navigator.clipboard.writeText(built.text)
      } catch {
        await CapClipboard.write({ string: built.text })
      }
      toast('备份文本已复制', 'success')
    } catch {
      toast('复制失败，请改用导出文件', 'error')
    }
  }

  const doExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const built = await buildBackup(state, todayStr(), { compress: !legacy, legacy })
      const res = await exportBackupFile({
        fileName: built.fileName,
        mime: built.mime,
        text: built.compressed ? undefined : built.text,
        bytes: built.bytes ?? undefined,
      })
      toast(res === 'downloaded' ? '备份文件已下载' : '备份文件已生成', 'success')
    } catch {
      toast('导出失败，可以改用复制文本备份', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const seq = parseSeq.current + 1
    parseSeq.current = seq
    setBusy(true)
    setParsing(true)
    try {
      const bytes = await readBackupFile(file)
      const result = await parseBackup({ bytes })
      if (parseSeq.current !== seq) return
      setParsed(result)
      setParseError('')
      setText('')
      setPickedName(file.name)
      toast('已读取 ' + file.name, 'success')
    } catch (error) {
      if (parseSeq.current !== seq) return
      setParsed(null)
      setParseError(error instanceof Error ? error.message : '读取失败')
    } finally {
      if (parseSeq.current === seq) {
        setParsing(false)
        setBusy(false)
      }
    }
  }

  const doImport = async () => {
    if (!parsed || busy) return
    setBusy(true)
    try {
      const outcome = await importBackup(parsed, mode)
      toast('已导入：新增 ' + outcome.added + ' 笔，更新 ' + outcome.updated + ' 笔', 'success')
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await restoreSnapshot(id)
      if (res.ok) {
        toast('已恢复到该快照', 'success')
        setSnapshots(await listSnapshots())
        setRestoreId('')
      } else {
        toast(res.error ?? '恢复失败', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const compareText = !preview
    ? ''
    : preview.mode === 'replace'
      ? '将用备份替换现在的 ' + state.txs.length + ' 笔记录'
      : preview.mode === 'merge'
        ? '新增 ' + preview.toAdd + ' 笔 · 更新 ' + preview.toUpdate + ' 笔 · 相同 ' + preview.unchanged + ' 笔'
        : '保留现有 ' + state.txs.length + ' 笔记录，只恢复设置与分类'

  return (
    <Sheet open={open} onClose={onClose} title="数据备份" full>
      <div className="sheet-body data-sheet">
        <div className="mini-seg wide" role="tablist" aria-label="备份方式">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'export'}
            className={tab === 'export' ? 'is-active' : ''}
            onClick={() => setTab('export')}
          >
            <Download size={15} strokeWidth={1.7} /> 导出
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'import'}
            className={tab === 'import' ? 'is-active' : ''}
            onClick={() => setTab('import')}
          >
            <Upload size={15} strokeWidth={1.7} /> 导入
          </button>
        </div>

        {tab === 'export' ? (
          <>
            <div className="backup-card">
              <div className="backup-file">
                <FileJson size={20} strokeWidth={1.5} />
                <div>
                  <b>{backupFileName(todayStr(), !legacy && exportInfo?.packed ? 'json.gz' : 'json')}</b>
                  <span>
                    {state.txs.length} 笔记录 · {state.categories.length} 个分类
                    {exportInfo ? ' · ' + formatBytes(exportInfo.original) + (exportInfo.packed ? ' → ' + formatBytes(exportInfo.packed) : '') : ''}
                  </span>
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={doExport} disabled={busy}>
                <Download size={16} strokeWidth={1.8} /> {busy ? '正在生成…' : '导出备份文件'}
              </button>
            </div>
            <label className="backup-toggle">
              <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
              <span>兼容 1.1.x 的纯 JSON（体积更大，旧版 App 也能读）</span>
            </label>
            <p className="hint">
              新版备份带版本头和校验和，默认压缩；导入时会先预览条数、日期范围，再决定覆盖还是合并。
            </p>
            <button type="button" className="btn-ghost block" onClick={copy}>
              <Clipboard size={15} strokeWidth={1.7} /> 复制为文本备份
            </button>
          </>
        ) : (
          <>
            <p className="hint">
              选备份文件，或把备份内容粘到下面。读取后先预览，确认无误再导入；导入前会自动存一份快照。
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.gz,application/json,application/gzip"
              className="file-input"
              onChange={onFile}
            />
            <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
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
                const next = e.target.value
                setText(next)
                setPickedName('')
                if (!next.trim()) {
                  setParsed(null)
                  setParseError('')
                }
              }}
              placeholder='粘贴备份内容，形如 {"format":"shijinran.backup",...} 或旧版 {"version":1,...}'
              aria-label="粘贴备份内容"
            />
            {parsing ? (
              <p className="backup-status">
                <Loader2 size={14} strokeWidth={1.8} className="spin" /> 正在读取备份…
              </p>
            ) : null}
            {parseError ? (
              <p className="backup-status is-error">
                <AlertTriangle size={14} strokeWidth={1.8} /> {parseError}
              </p>
            ) : null}

            {preview && parsed ? (
              <div className="backup-preview">
                <div className="backup-preview-head">
                  <ShieldCheck size={18} strokeWidth={1.6} />
                  <div>
                    <b>{parsed.meta.exportedAt ? formatMoment(parsed.meta.exportedAt) : '旧版备份'}</b>
                    <span>
                      格式 v{parsed.meta.schema}
                      {parsed.meta.appVersion ? ' · App ' + parsed.meta.appVersion : ''}
                      {parsed.meta.compressed ? ' · 已压缩' : ''}
                    </span>
                  </div>
                </div>
                <div className="backup-preview-stats">
                  <span>{preview.txCount} 笔记录</span>
                  <span>{preview.categoryCount} 个分类</span>
                  <span>{preview.dateFrom ? preview.dateFrom + ' 至 ' + preview.dateTo : '没有流水'}</span>
                </div>
                <div className="mini-seg wide" role="group" aria-label="导入方式">
                  {MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={mode === option.value ? 'is-active' : ''}
                      onClick={() => setMode(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="hint">{compareText}</p>
                {preview.warnings.length ? (
                  <ul className="backup-warnings">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>
                        <AlertTriangle size={13} strokeWidth={1.8} /> {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="btn-primary" onClick={doImport} disabled={busy}>
                  <ShieldCheck size={16} strokeWidth={1.8} /> {busy ? '正在导入…' : '确认导入（自动快照）'}
                </button>
              </div>
            ) : null}
          </>
        )}

        <div className="backup-snapshots">
          <div className="backup-snapshots-head">
            <History size={16} strokeWidth={1.7} /> 本机快照
            <span>自动保留最近 5 份</span>
          </div>
          {snapshots.length === 0 ? (
            <p className="hint">还没有快照。导入、清空、恢复前会自动生成。</p>
          ) : (
            <ul>
              {snapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  <div>
                    <b>{KIND_LABEL[snapshot.kind]}快照</b>
                    <span>
                      {formatMoment(snapshot.createdAt)} · {snapshot.txCount} 笔 · {formatBytes(snapshot.bytes)}
                    </span>
                  </div>
                  {restoreId === snapshot.id ? (
                    <div className="confirm-row">
                      <button type="button" className="btn-ghost sm" onClick={() => setRestoreId('')}>
                        取消
                      </button>
                      <button type="button" className="btn-danger sm" disabled={busy} onClick={() => void doRestore(snapshot.id)}>
                        确认恢复
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-ghost sm" onClick={() => setRestoreId(snapshot.id)}>
                      <RotateCcw size={14} strokeWidth={1.8} /> 恢复
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="data-note">
          <Info size={15} strokeWidth={1.7} />
          <p>数据保存在本机的应用存储里，卸载 App 会一起清除，记得偶尔导出一次备份。</p>
        </div>

        <div className="danger-zone">
          <h3>清空数据</h3>
          {confirmClear ? (
            <div className="confirm-row">
              <span>将删除全部 {state.txs.length} 笔记录，清空前会自动存一份快照。</span>
              <div>
                <button type="button" className="btn-ghost sm" onClick={() => setConfirmClear(false)}>
                  取消
                </button>
                <button type="button" className="btn-danger sm" onClick={onClear}>
                  确认清空
                </button>
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
