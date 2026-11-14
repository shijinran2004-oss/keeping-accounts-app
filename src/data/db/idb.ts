/**
 * IndexedDB 薄封装。
 *
 * 只负责：打开数据库、建表、把请求和事务包装成 Promise。
 * 业务语义（账本怎么存取）在 repo.ts；这个文件不认识账本类型。
 */
const DB_NAME = 'shijinran'
const DB_VERSION = 1

export const TX_STORE = 'txs'
export const META_STORE = 'meta'
export const SNAPSHOT_STORE = 'snapshots'

/** meta 表里放哪几个 key，避免各处拼字符串 */
export const META_KEYS = {
  settings: 'settings',
  categories: 'categories',
} as const

let opening: Promise<IDBDatabase> | null = null

/** 浏览器 / WebView 是否提供 IndexedDB（隐私模式下可能没有） */
export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/** 打开数据库（首次会建表），同一页面复用一个连接 */
export function openDb(): Promise<IDBDatabase> {
  if (!idbAvailable()) return Promise.reject(new Error('IndexedDB is not available'))
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(TX_STORE)) {
          const store = db.createObjectStore(TX_STORE, { keyPath: 'id' })
          store.createIndex('byDate', 'date')
          store.createIndex('byCategory', 'categoryId')
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const db = request.result
        // 别的标签页要升级数据库时主动让位，避免卡在 blocked
        db.onversionchange = () => db.close()
        resolve(db)
      }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
      request.onblocked = () => reject(new Error('IndexedDB blocked by another tab'))
    }).catch((error) => {
      opening = null
      throw error
    })
  }
  return opening
}

/** 关闭连接并清掉缓存；下次 openDb 会重新打开 */
export function closeDb(db: IDBDatabase): void {
  db.close()
  opening = null
}

/** 把单次请求变成 Promise，失败时抛出原始的 DOMException */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/** 等整个事务完成：写操作必须在 complete 后才算落盘 */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/**
 * 在一个事务里跑一段逻辑。
 * 回调抛错会中止事务并原样抛出；回调返回后等事务 complete 再 resolve，
 * 所以「写成功」与「已落盘」是同一个承诺。
 */
export async function withTx<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode)
  const done = transactionDone(tx)
  // 事务可能是被外部中止的；这里先挂一个空处理，避免未处理的 rejection
  done.catch(() => {})
  let result: T | undefined
  try {
    result = await fn(tx)
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* 事务已经结束 */
    }
    throw error
  }
  await done
  return result as T
}
