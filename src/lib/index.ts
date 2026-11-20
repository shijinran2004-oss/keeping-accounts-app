/**
 * 工具函数统一出口。
 */
export * from './money'
export * from './date'
export * from './stats'
export { tap, tapSuccess } from './haptics'
export { pushModal, popModal, closeTopModal } from './modal'
export { fileToAvatar } from './avatar'
export {
  backupFileName,
  base64ToBytes,
  bytesToBase64,
  formatBytes,
  exportBackupFile,
  readBackupFile,
} from './backup'
export type { BackupFilePayload } from './backup'
export {
  ACCENTS,
  THEME_OPTIONS,
  accentName,
  applyTheme,
  applyThemeFromStorage,
  isAccentKey,
  isThemeMode,
  resolveTheme,
  themeName,
} from './theme'
export {
  fileToOcrDataUrl,
  ocrAvailable,
  parseReceipt,
  recognizeReceipt,
  warmUpOcr,
  OCR_MAX_SIDE,
} from './ocr'
export type { AmountCandidate, DateCandidate, MerchantCandidate, ParseOptions } from './ocr'
export {
  BILL_SOURCE_LABEL,
  buildLedgerCsv,
  decodeBillBytes,
  ledgerCsvFileName,
  parseBillCents,
  parseBillCsv,
  parseBillDate,
  parseCsv,
  planBillImport,
} from './import'
export {
  WATCH_OFF,
  ackAutoRecords,
  captureAvailable,
  consumeCapture,
  disableWatch,
  drainAutoRecords,
  enableWatch,
  onAutoRecord,
  onCapture,
  onLaunchAction,
  openNoticeSettings,
  requestIgnoreBattery,
  requestAllFiles,
  requestOverlay,
  takeLaunchAction,
  watchStatus,
} from './capture'
