import type { OcrDraft, OcrLine } from '../../types'
import { todayStr } from '../date'
import { pickAmount } from './amount'
import { pickDate } from './date'
import { pickMerchant } from './merchant'
import { cleanLine, compact } from './text'

/** 商户名里的关键词 -> 内置分类 id */
const CATEGORY_KEYWORDS: Array<[string, string]> = [
  ['food', '餐 饭 面 粉 烧烤 火锅 咖啡 奶茶 牛奶 酸奶 麦当劳 肯德基 星巴克 汉堡 饺子 粥 便当 食堂 小吃 烘焙 面包 蛋糕 甜品'],
  ['transport', '地铁 公交 出租 滴滴 打车 加油 中石化 中石油 停车 高铁 火车 车票 机场 航空 高速 充电桩'],
  ['shopping', '超市 便利店 商场 百货 淘宝 京东 拼多多 优衣库 购物 五金 家居 数码 电器 药妆 屈臣氏 名创'],
  ['home', '房租 物业 水费 电费 燃气 供暖 宽带 家政 维修 装修'],
  ['fun', '电影 影院 游戏 ktv 演出 门票 剧本 密室 桌游 会员 视频 音乐 游乐园'],
  ['health', '药 医院 诊所 体检 口腔 门诊 医疗 保健 康复'],
  ['study', '书店 图书 教育 培训 课程 学习 文具 考试 网校'],
  ['social', '礼品 礼盒 婚庆 花店 红包 请柬 伴手礼'],
  ['travel', '酒店 民宿 机票 景区 旅行 旅游 度假 门票 客栈 青旅'],
  ['pet', '宠物 猫 狗 兽医 宠物店 猫粮 狗粮'],
  ['phone', '话费 流量 宽带 移动 联通 电信 营业厅 充值'],
]

/**
 * 用 OCR 全文猜一个分类；猜不到返回 null，交给用户自己点。
 */
export function guessCategoryId(text: string): string | null {
  const flat = compact(text).toLowerCase()
  for (const [id, words] of CATEGORY_KEYWORDS) {
    for (const word of words.split(' ')) {
      if (word && flat.includes(word.toLowerCase())) return id
    }
  }
  return null
}

export interface ParseOptions {
  /** YYYY-MM-DD，测试时可注入固定日期 */
  today?: string
}

/**
 * 把 OCR 的文字行抽成一张草稿：金额、日期、商户、分类。
 * 只负责“猜”，写不写账由用户确认。
 */
export function parseReceipt(lines: OcrLine[], options: ParseOptions = {}): OcrDraft {
  const today = options.today ?? todayStr()
  const usable = lines
    .map((line) => ({ ...line, text: cleanLine(line.text) }))
    .filter((line) => line.text.length > 0)

  const text = usable.map((line) => line.text).join('\n')
  const amount = pickAmount(usable)
  const date = pickDate(usable, today)
  const merchant = pickMerchant(usable)
  // 先看店名：超市小票里也会有牛奶面包，按全票猜会被带成“餐饮”
  const categoryId = guessCategoryId(merchant?.name ?? '') ?? guessCategoryId(text)

  const amountScore = amount?.confidence ?? 0
  const dateScore = date?.confidence ?? 0
  const merchantScore = merchant?.confidence ?? 0
  const confidence = Math.round((amountScore * 0.5 + dateScore * 0.25 + merchantScore * 0.25) * 100) / 100
  const warnings: string[] = []
  if (amount?.warning) warnings.push(amount.warning)
  if (!amount) warnings.push('金额没认出来，请手动填')

  return {
    amountCents: amount?.cents ?? null,
    date: date?.date ?? null,
    merchant: merchant?.name ?? null,
    categoryId,
    confidence,
    lines: usable,
    text,
    warnings,
  }
}
