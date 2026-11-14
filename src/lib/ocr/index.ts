/**
 * 小票识别：原生插件只出文字行，金额/日期/商户在这里抽。
 */
export { fileToOcrDataUrl, OCR_MAX_SIDE } from './image'
export { ocrAvailable, recognizeReceipt, warmUpOcr } from './plugin'
export { parseReceipt, guessCategoryId } from './parse'
export type { ParseOptions } from './parse'
export { amountCandidates, pickAmount } from './amount'
export type { AmountCandidate } from './amount'
export { dateCandidates, pickDate } from './date'
export type { DateCandidate } from './date'
export { pickMerchant } from './merchant'
export type { MerchantCandidate } from './merchant'
export { cleanLine, compact, digitRatio, letterCount, maskNoise, normalizeWidth } from './text'
