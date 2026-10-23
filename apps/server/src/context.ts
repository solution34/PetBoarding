import type { DatabaseSync } from 'node:sqlite'
import { todayShanghai } from './lib/dates.js'

export interface AppContext {
  db: DatabaseSync
  /** 演示/验收固定“今天”；null 表示使用真实门店日期。 */
  todayOverride: string | null
  today: () => string
}

export function createContext(db: DatabaseSync, todayOverride: string | null): AppContext {
  return {
    db,
    todayOverride,
    today: () => todayShanghai(todayOverride)
  }
}
