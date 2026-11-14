import { useEffect, useState, type CSSProperties } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { COLOR_CHOICES, ICON_CHOICES, useLedger } from '../data'
import type { Category, TxType } from '../types'
import { CategoryIcon, Sheet, useToast } from '../ui'

export function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addCategory, deleteCategory } = useLedger()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<TxType>('expense')
  const [icon, setIcon] = useState<Category['icon']>('coffee')
  const [color, setColor] = useState(COLOR_CHOICES[0])

  useEffect(() => {
    if (!open) return
    setAdding(false)
    setName('')
    setType('expense')
    setIcon('coffee')
    setColor(COLOR_CHOICES[0])
  }, [open])

  const groups: { label: string; type: TxType }[] = [
    { label: '支出分类', type: 'expense' },
    { label: '收入分类', type: 'income' },
  ]

  return (
    <Sheet open={open} onClose={onClose} title="分类管理" full>
      <div className="sheet-body cat-manage">
        {groups.map((g) => (
          <div className="cat-manage-group" key={g.type}>
            <h3>{g.label}<span>{state.categories.filter((c) => c.type === g.type).length}</span></h3>
            <div className="card list-card">
              {state.categories
                .filter((c) => c.type === g.type)
                .map((c) => (
                  <div className="manage-row" key={c.id}>
                    <span className="cat-tile" style={{ ['--cat' as string]: c.color } as CSSProperties}>
                      <CategoryIcon name={c.icon} size={17} />
                    </span>
                    <span className="manage-name">{c.name}</span>
                    {c.builtin ? (
                      <span className="manage-tag">内置</span>
                    ) : (
                      <button
                        type="button"
                        className="manage-del"
                        aria-label={`删除${c.name}`}
                        onClick={() => {
                          deleteCategory(c.id)
                          toast('分类已删除，相关记录归入其他')
                        }}
                      >
                        <Trash2 size={16} strokeWidth={1.6} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}

        {adding ? (
          <div className="card add-cat-form">
            <h3>新建分类</h3>
            <label className="field compact">
              <span>名称</span>
              <input
                value={name}
                maxLength={6}
                onChange={(e) => setName(e.target.value)}
                placeholder="比如：咖啡"
                aria-label="分类名称"
              />
            </label>
            <div className="mini-seg" role="tablist" aria-label="分类类型">
              {(['expense', 'income'] as TxType[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={type === k}
                  className={type === k ? 'is-active' : ''}
                  onClick={() => setType(k)}
                >
                  {k === 'expense' ? '支出' : '收入'}
                </button>
              ))}
            </div>
            <div className="icon-picker">
              {ICON_CHOICES.map((ic) => (
                <button
                  key={ic.key}
                  type="button"
                  className={`icon-choice ${icon === ic.key ? 'is-active' : ''}`}
                  onClick={() => setIcon(ic.key)}
                  aria-label={ic.label}
                >
                  <CategoryIcon name={ic.key} size={18} />
                </button>
              ))}
            </div>
            <div className="color-picker">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-choice ${color === c ? 'is-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>取消</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!name.trim()}
                onClick={() => {
                  addCategory({ name: name.trim(), type, icon, color })
                  toast('分类已添加', 'success')
                  setAdding(false)
                  setName('')
                }}
              >
                添加
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="add-cat-btn" onClick={() => setAdding(true)}>
            <Plus size={17} strokeWidth={2} /> 新建自定义分类
          </button>
        )}
      </div>
    </Sheet>
  )
}
