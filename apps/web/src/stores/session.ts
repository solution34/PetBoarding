/**
 * 轻量会话状态：reactive 组合式 store，不引入 pinia。
 * 启动时通过 GET /api/auth/me 恢复会话；登录/退出维护 account。
 */
import { reactive } from 'vue'
import type { Account, Role } from '../api/types'
import { getMe, login as apiLogin, logout as apiLogout } from '../api'

export interface SessionState {
  account: Account | null
  loaded: boolean
  loading: boolean
}

export const sessionState = reactive<SessionState>({
  account: null,
  loaded: false,
  loading: false,
})

let bootstrapPromise: Promise<void> | null = null

/** 启动时恢复会话；失败视为未登录（不抛错）。 */
export async function bootstrap(force = false): Promise<void> {
  if (sessionState.loaded && !force) return
  if (bootstrapPromise) return bootstrapPromise
  sessionState.loading = true
  bootstrapPromise = (async () => {
    try {
      const { account } = await getMe()
      sessionState.account = account
    } catch {
      sessionState.account = null
    } finally {
      sessionState.loaded = true
      sessionState.loading = false
      bootstrapPromise = null
    }
  })()
  return bootstrapPromise
}

export async function login(loginName: string, password: string): Promise<Account> {
  const { account } = await apiLogin({ loginName, password })
  sessionState.account = account
  sessionState.loaded = true
  return account
}

export async function logout(): Promise<void> {
  try {
    await apiLogout()
  } catch {
    // 会话已失效时也允许本地退出
  } finally {
    sessionState.account = null
    sessionState.loaded = true
  }
}

/** 401 时由路由层调用：只清理本地状态，跳转由调用者负责。 */
export function clearSession(): void {
  sessionState.account = null
  sessionState.loaded = true
}

export function hasRole(role: Role): boolean {
  return sessionState.account?.roles.includes(role) ?? false
}

export function hasAnyRole(roles: readonly Role[]): boolean {
  return roles.some((role) => hasRole(role))
}

/** 登录后的角色默认页：owner → /owner/book，staff → /staff/review，admin → /admin/rooms。 */
export function homePath(): string {
  if (hasRole('owner')) return '/owner/book'
  if (hasRole('staff')) return '/staff/review'
  if (hasRole('admin')) return '/admin/rooms'
  return '/login'
}
