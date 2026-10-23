/**
 * 门店“今天”：优先使用服务端 GET /api/health 返回的 today（支持 PB_TODAY 演示覆盖），
 * 不可用时回退到浏览器按 Asia/Shanghai 计算的日期。
 */
import { reactive } from 'vue'
import { getHealth } from '../api'
import { todayInShanghai } from '../utils/dates'

export interface ClockState {
  today: string
  loaded: boolean
  clockOverridden: boolean
}

export const clockState = reactive<ClockState>({
  today: todayInShanghai(),
  loaded: false,
  clockOverridden: false,
})

let lastFetchedAt = 0
const CACHE_MS = 30_000

export async function refreshToday(force = false): Promise<void> {
  const now = Date.now()
  if (!force && clockState.loaded && now - lastFetchedAt < CACHE_MS) return
  try {
    const health = await getHealth()
    if (health.today) {
      clockState.today = health.today
    }
    clockState.clockOverridden = health.clockOverridden === true
    clockState.loaded = true
    lastFetchedAt = now
  } catch {
    clockState.today = todayInShanghai()
  }
}
