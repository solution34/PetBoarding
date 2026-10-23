<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFeedback } from '../composables/useFeedback'
import { homePath, login } from '../stores/session'

interface DemoAccount {
  loginName: string
  password: string
  role: string
  name: string
}

const router = useRouter()
const route = useRoute()
const loginName = ref('')
const password = ref('')
const submitting = ref(false)
const { error, fail, clear } = useFeedback()

const demoAccounts: DemoAccount[] = [
  { loginName: 'ownerA', password: 'owner123', role: '宠物主人（主人A）', name: '王小明' },
  { loginName: 'ownerB', password: 'owner123', role: '宠物主人（主人B）', name: '李小红' },
  { loginName: 'staff', password: 'staff123', role: '工作人员', name: '张店长' },
  { loginName: 'admin', password: 'admin123', role: '管理员', name: '赵管理' },
]

function fill(account: DemoAccount): void {
  loginName.value = account.loginName
  password.value = account.password
  clear()
}

async function submit(): Promise<void> {
  clear()
  if (!loginName.value.trim() || !password.value) {
    error.value = '请输入登录名和密码'
    return
  }
  submitting.value = true
  try {
    await login(loginName.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const target = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : homePath()
    await router.replace(target)
  } catch (cause) {
    fail(cause)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-layout">
      <section class="card login-card">
        <header>
          <h1 class="login-card__title">宠物寄养预约与照护管理系统</h1>
          <p class="login-card__desc">
            单门店 · V1.2 Web MVP 演示。主人预约寄养、门店审核分房、入住照护并线下结算。
          </p>
        </header>

        <form class="stack stack--sm" @submit.prevent="submit">
          <label class="field">
            <span class="field__label">登录名<span class="required">*</span></span>
            <input
              v-model="loginName"
              class="input"
              type="text"
              name="loginName"
              autocomplete="username"
              placeholder="请输入登录名，例如 ownerA"
            />
          </label>
          <label class="field">
            <span class="field__label">密码<span class="required">*</span></span>
            <input
              v-model="password"
              class="input"
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="请输入密码"
            />
          </label>

          <div v-if="error" class="alert alert--error">{{ error }}</div>

          <div class="form-actions">
            <button class="btn btn--primary btn--block" type="submit" :disabled="submitting">
              {{ submitting ? '登录中…' : '登录' }}
            </button>
          </div>
        </form>

        <div class="notice-board">
          <strong>本版范围提示</strong>
          <ol class="mt-8">
            <li>预设账号登录，不支持自主注册、找回密码。</li>
            <li>预约提交时锁价，审核不改价；价格变化需主人重新确认。</li>
            <li>账单仅含基础费与逾期费，线下全额收款后结单。</li>
          </ol>
        </div>
      </section>

      <section class="card demo-card">
        <header>
          <h2 class="section-title">演示账号</h2>
          <p class="section-desc">点击任一账号可自动填入表单，再点击「登录」。</p>
        </header>
        <div class="demo-list">
          <button
            v-for="account in demoAccounts"
            :key="account.loginName"
            type="button"
            class="demo-item"
            @click="fill(account)"
          >
            <span class="demo-item__account">
              <span class="demo-item__name">{{ account.name }}</span>
              <span class="demo-item__credential">
                {{ account.loginName }} / {{ account.password }}
              </span>
            </span>
            <span class="demo-item__role">{{ account.role }}</span>
          </button>
        </div>
        <p class="muted">
          登录成功后按角色进入默认页：主人 → 查询与预约；工作人员 → 预约审核；管理员 → 房型与房间。
        </p>
      </section>
    </div>
  </div>
</template>
