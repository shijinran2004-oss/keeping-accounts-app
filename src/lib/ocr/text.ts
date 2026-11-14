/**
 * 小票文字清洗：OCR 出来的全角、空格、竖线噪声都先在这里归一。
 */

const FULL_TO_HALF: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G',
  'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J', 'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N',
  'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T', 'Ｕ': 'U',
  'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g',
  'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j', 'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n',
  'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't', 'ｕ': 'u',
  'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
  '．': '.', '，': ',', '：': ':', '；': ';', '（': '(', '）': ')',
  '％': '%', '＃': '#', '－': '-', '＋': '+', '／': '/', '＝': '=',
  '￥': '¥', '　': ' ',
}

/** 全角转半角，顺手把各种连字符、货币符号统一 */
export function normalizeWidth(input: string): string {
  let out = ''
  for (const ch of input) out += FULL_TO_HALF[ch] ?? ch
  return out
    .replace(/[—–―]/g, '-')
    .replace(/[、]/g, ',')
    .replace(/[\u00a0\u3000]/g, ' ')
}

/** 单行清洗：去首尾空白、压缩连续空格、去掉竖排噪声字符 */
export function cleanLine(input: string): string {
  return normalizeWidth(input)
    .replace(/[|¦丨]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 去掉所有空白，用于关键词匹配 */
export function compact(input: string): string {
  return cleanLine(input).replace(/\s+/g, '')
}

/** 这一行里数字字符的占比，用来判断“这行是不是地址/电话/编号” */
export function digitRatio(input: string): number {
  const text = compact(input)
  if (!text) return 0
  let digits = 0
  for (const ch of text) if (ch >= '0' && ch <= '9') digits++
  return digits / text.length
}

/** 中文/字母字符数（判断像不像商户名） */
export function letterCount(input: string): number {
  let n = 0
  for (const ch of compact(input)) {
    if ((ch >= '\u4e00' && ch <= '\u9fa5') || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) n++
  }
  return n
}

/** 把可能混在一起的时间、单号、电话先挖空，避免被当成金额 */
export function maskNoise(line: string): string {
  return normalizeWidth(line)
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' ')
    .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/(no\.?|单号|票号|流水号)[a-z0-9-]*/gi, ' ')
    .replace(/\d{3,4}-\d{7,8}/g, ' ')
    .replace(/\d{6,}/g, ' ')
}

/** 元 -> 分，四舍五入，避免浮点误差 */
export function yuanToCents(value: number): number {
  return Math.round(value * 100)
}
