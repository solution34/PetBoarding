/**
 * 页面级操作反馈：错误提示 + 成功提示（操作成功反馈）。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { errorMessage } from '../utils/errors'

export interface FeedbackStore {
  error: Ref<string>
  notice: Ref<string>
  clear: () => void
  fail: (error: unknown, prefix?: string) => void
  ok: (message: string) => void
}

export function useFeedback(): FeedbackStore {
  const error = ref('')
  const notice = ref('')

  function clear(): void {
    error.value = ''
    notice.value = ''
  }

  function fail(cause: unknown, prefix?: string): void {
    const message = errorMessage(cause)
    error.value = prefix ? `${prefix}：${message}` : message
    notice.value = ''
  }

  function ok(message: string): void {
    notice.value = message
    error.value = ''
  }

  return { error, notice, clear, fail, ok }
}
