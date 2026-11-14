/**
 * IndexedDB 存储实现。
 *
 * 一笔一条记录：新增 / 修改 / 删除只动对应记录与设置，不再整册序列化。
 * localStorage 回退实现见 ls.ts，两者共用 LedgerRepository 接口。
 */
import type {
  Category,
  LedgerRepository,
  LedgerState,
  Settings,
  SnapshotMeta,
  SnapshotRecord,
  Tx,
} from '../../types'
import { normalize } from '../normalize'
import { META_KEYS, META_STORE, SNAPSHOT_STORE, TX_STORE, closeDb, openDb, requestResult, withTx } from './idb'

/** meta 表的行结构：key 为主键，value 是任意 JSON */
interface MetaRecord {
  key: string
  value: unknown
}

export class IdbRepository implements LedgerRepository {
  readonly engine = 'idb' as const

  private constructor(private readonly db: IDBDatabase) {}

  /** 打开数据库并返回仓库；连接在整个页面生命周期内复用 */
  static async open(): Promise<IdbRepository> {
    return new IdbRepository(await openDb())
  }

  async load(): Promise<LedgerState | null> {
    const [txs, settings, categories] = await Promise.all([
      this.readAll<Tx>(TX_STORE),
      this.readMeta<Settings>(META_KEYS.settings),
      this.readMeta<Category[]>(META_KEYS.categories),
    ])
    // 没有 settings 视为空库（首次安装或迁移未完成）
    if (!settings) return null
    return normalize({ version: 1, txs, categories: categories ?? [], settings })
  }

  async replaceAll(state: LedgerState): Promise<void> {
    await withTx(this.db, [TX_STORE, META_STORE], 'readwrite', (tx) => {
      const txs = tx.objectStore(TX_STORE)
      txs.clear()
      for (const row of state.txs) txs.put(row)
      this.writeMeta(tx, META_KEYS.settings, state.settings)
      this.writeMeta(tx, META_KEYS.categories, state.categories)
    })
  }

  async putTx(tx: Tx): Promise<void> {
    await withTx(this.db, TX_STORE, 'readwrite', (scope) => {
      scope.objectStore(TX_STORE).put(tx)
    })
  }

  async deleteTx(id: string): Promise<void> {
    await withTx(this.db, TX_STORE, 'readwrite', (scope) => {
      scope.objectStore(TX_STORE).delete(id)
    })
  }

  async putSettings(settings: Settings): Promise<void> {
    await withTx(this.db, META_STORE, 'readwrite', (scope) => {
      scope.objectStore(META_STORE).put({ key: META_KEYS.settings, value: settings })
    })
  }

  async putCategories(categories: Category[]): Promise<void> {
    await withTx(this.db, META_STORE, 'readwrite', (scope) => {
      scope.objectStore(META_STORE).put({ key: META_KEYS.categories, value: categories })
    })
  }

  async putSnapshot(snapshot: SnapshotRecord): Promise<void> {
    await withTx(this.db, SNAPSHOT_STORE, 'readwrite', (scope) => {
      scope.objectStore(SNAPSHOT_STORE).put(snapshot)
    })
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    const rows = await this.readAll<SnapshotRecord>(SNAPSHOT_STORE)
    return rows
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        createdAt: row.createdAt,
        txCount: row.txCount,
        bytes: row.bytes,
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async getSnapshot(id: string): Promise<SnapshotRecord | null> {
    return withTx(this.db, SNAPSHOT_STORE, 'readonly', async (scope) => {
      const row = await requestResult(scope.objectStore(SNAPSHOT_STORE).get(id) as IDBRequest<SnapshotRecord | undefined>)
      return row ?? null
    })
  }

  async deleteSnapshot(id: string): Promise<void> {
    await withTx(this.db, SNAPSHOT_STORE, 'readwrite', (scope) => {
      scope.objectStore(SNAPSHOT_STORE).delete(id)
    })
  }

  close(): void {
    closeDb(this.db)
  }

  private readAll<T>(store: string): Promise<T[]> {
    return withTx(this.db, store, 'readonly', (scope) =>
      requestResult(scope.objectStore(store).getAll() as IDBRequest<T[]>),
    )
  }

  private async readMeta<T>(key: string): Promise<T | null> {
    const row = await withTx(this.db, META_STORE, 'readonly', (scope) =>
      requestResult(scope.objectStore(META_STORE).get(key) as IDBRequest<MetaRecord | undefined>),
    )
    return row ? (row.value as T) : null
  }

  private writeMeta(tx: IDBTransaction, key: string, value: unknown): void {
    tx.objectStore(META_STORE).put({ key, value } satisfies MetaRecord)
  }
}
