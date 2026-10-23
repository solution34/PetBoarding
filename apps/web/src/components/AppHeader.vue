<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { clockState } from '../stores/clock'
import { logout, sessionState } from '../stores/session'
import { formatDateCN } from '../utils/dates'
import { roleLabel } from '../utils/format'

interface NavItem {
  to: string
  label: string
}

const router = useRouter()
const account = computed(() => sessionState.account)
const loggingOut = ref(false)

const navItems = computed<NavItem[]>(() => {
  const current = account.value
  if (!current) return []
  const items: NavItem[] = []
  if (current.roles.includes('owner')) {
    items.push(
      { to: '/owner/pets', label: '宠物档案' },
      { to: '/owner/book', label: '查询与预约' },
      { to: '/owner/orders', label: '我的订单' },
    )
  }
  if (current.roles.includes('staff')) {
    items.push(
      { to: '/staff/review', label: '预约审核' },
      { to: '/staff/checkin', label: '入住办理' },
      { to: '/staff/inhouse', label: '在住照护' },
    )
  }
  if (current.roles.includes('admin')) {
    items.push({ to: '/admin/rooms', label: '房型与房间' })
  }
  return items
})

const rolesText = computed(() => (account.value?.roles ?? []).map(roleLabel).join(' / '))
const todayText = computed(() => formatDateCN(clockState.today))

async function handleLogout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logout()
    await router.push({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink to="/" class="brand">
        <span class="brand__mark">🐾</span>
        <span class="brand__text">宠物寄养管理系统</span>
        <span class="brand__version">V1.2</span>
      </RouterLink>

      <nav class="app-nav" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="app-nav__link"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="app-header__account">
        <span class="app-header__today">门店日期 {{ todayText }}</span>
        <span class="app-header__user">{{ account?.displayName }}</span>
        <span class="badge badge--role">{{ rolesText }}</span>
        <button class="btn btn--ghost btn--sm" :disabled="loggingOut" @click="handleLogout">
          退出登录
        </button>
      </div>
    </div>
  </header>
</template>
