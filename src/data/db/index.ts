/**
 * 存储层唯一入口。
 *
 * 只有 data/store.tsx 从这里取；页面与弹层继续用 useLedger()。
 */
export { IdbRepository } from './repo'
export { LsRepository, readLegacyState, writeLegacyMirror } from './ls'
export {
  enginePreference,
  migrateLegacyToIdb,
  openLedger,
  setEnginePreference,
} from './migrate'
export { idbAvailable } from './idb'
