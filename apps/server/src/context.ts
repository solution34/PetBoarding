import type { DatabaseSync } from 'node:sqlite'
import { nowInShanghai, todayShanghai } from './lib/dates.js'

export interface AppContext {
  db: DatabaseSync
  /** 演示/验收固定“今天”；null 表示使用真实门店日期。 */
  todayOverride: string | null
  today: () => string
  /** 业务记录时间戳；设置演示日期时同步套用覆盖日期。 */
  now: () => string
}

export function createContext(db: DatabaseSync, todayOverride: string | null): AppContext {
  return {
    db,
    todayOverride,
    today: () => todayShanghai(todayOverride),
    now: () => nowInShanghai(todayOverride)
  }
}
