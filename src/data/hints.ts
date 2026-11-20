/**
 * 识别提示：商户记忆 + 关键词分类。
 *
 * 截图弹卡时要当场告诉用户「这是星巴克，记在餐饮」，所以把分类关键词表
 * 和商户记忆一起推给原生；两条通道（原生弹卡 / 前端补账）用同一套评分：
 * 记住过的商户 +20，商户名命中关键词 +3，整页文字命中 +1。
 */
import type { Category, CategoryHint, Settings } from '../types'
import { captureAvailable, categoryKeywords, setCategoryHints } from '../lib'

/** 一个打分出来的候选分类 */
export interface CategoryGuess {
  id: string
  name: string
  score: number
  /** 命中的关键词，用来解释为什么猜这个分类 */
  keyword: string
}

/** 商户记忆最多记这么多家，超出先丢最早的 */
const MERCHANT_RULES_MAX = 300

/** 备注里第一个「·」前面是商户名；顺手去掉「商户：」前缀 */
export function merchantOfNote(note: string): string {
  const head = (note ?? '').split('·')[0] ?? ''
  return head.replace(/^商\s*户\s*[:：]\s*/, '').trim().slice(0, 24)
}

/** 推给原生的分类关键词表（自定义分类没有内置关键词，推过去是无害的空数组） */
export function buildHints(categories: Category[]): CategoryHint[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    keywords: categoryKeywords(category.id),
  }))
}

/** 给一页文字和商户名打分，返回命中的分类（分数从高到低） */
export function scoreCategories(
  categories: Category[],
  text: string,
  merchant: string,
  memory: Record<string, string> = {},
): CategoryGuess[] {
  const shop = (merchant ?? '').toLowerCase()
  const page = (text ?? '').toLowerCase()
  const remembered = memory[merchant] ?? ''
  const out: CategoryGuess[] = []
  for (const category of categories) {
    let best = 0
    let keyword = ''
    for (const word of categoryKeywords(category.id)) {
      const low = word.toLowerCase()
      let hit = page.includes(low) ? 1 : 0
      if (shop && shop.includes(low)) hit += 3
      if (hit > best) {
        best = hit
        keyword = word
      }
    }
    if (remembered === category.id) {
      best += 20
      keyword = keyword || '记过'
    }
    if (best > 0) out.push({ id: category.id, name: category.name, score: best, keyword })
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

/** 只取最高分；同分时不乱猜，交给调用方兜底 */
export function guessCategory(
  categories: Category[],
  text: string,
  merchant: string,
  memory: Record<string, string> = {},
): string | null {
  const scored = scoreCategories(categories, text, merchant, memory)
  if (!scored.length) return null
  if (scored.length > 1 && scored[1].score === scored[0].score) return null
  return scored[0].id
}

/**
 * 弹卡时给用户挑的分类：当前选中的排最前（点了就跳第一个），
 * 其余按分数补到 limit 个；一个都没猜到时只留当前分类。
 */
export function suggestCategories(
  categories: Category[],
  text: string,
  merchant: string,
  memory: Record<string, string> = {},
  selectedId?: string,
  limit = 3,
): CategoryGuess[] {
  const scored = scoreCategories(categories, text, merchant, memory)
  const picked: CategoryGuess[] = []
  if (selectedId) {
    const category = categories.find((item) => item.id === selectedId)
    if (category) picked.push({ id: category.id, name: category.name, score: 0, keyword: '当前' })
  }
  for (const guess of scored) {
    if (picked.length >= limit) break
    if (picked.some((item) => item.id === guess.id)) continue
    picked.push(guess)
  }
  return picked.slice(0, limit)
}

/**
 * 记一笔时顺手记住「这家店归这个分类」。
 * 没变化就返回原对象，调用方可以拿 !== 判断要不要落盘。
 */
export function rememberMerchant(settings: Settings, merchant: string, categoryId: string): Settings {
  const name = (merchant ?? '').trim().slice(0, 24)
  if (!name || !categoryId) return settings
  const rules = settings.merchantRules ?? {}
  if (rules[name] === categoryId) return settings
  const next = { ...rules, [name]: categoryId }
  const keys = Object.keys(next)
  while (keys.length > MERCHANT_RULES_MAX) {
    const oldest = keys.shift()
    if (oldest) delete next[oldest]
  }
  return { ...settings, merchantRules: next }
}

/** 把最新的关键词表和商户记忆推给原生；Web 端没有原生插件，直接跳过 */
export async function syncCategoryHints(
  categories: Category[],
  settings: Settings,
): Promise<void> {
  if (!captureAvailable()) return
  await setCategoryHints({ categories: buildHints(categories), memory: settings.merchantRules ?? {} })
}
