import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA_SQL } from './schema.js'
import { seedDatabase } from './seed.js'

export type { DatabaseSync }

/** 打开（或创建）数据库：自动建表，空库时写入种子数据。 */
export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA_SQL)

  const row = db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number } | undefined
  if (!row || Number(row.n) === 0) {
    seedDatabase(db)
  }
  return db
}

/** 在单独事务中执行，抛错回滚。 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 忽略回滚失败，保留原始异常
    }
    throw error
  }
}
