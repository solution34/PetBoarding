import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import type { Role } from '../api/types'
import { setUnauthorizedHandler } from '../api/client'
import {
  bootstrap,
  clearSession,
  hasAnyRole,
  homePath,
  sessionState,
} from '../stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问（仅登录页）。 */
    public?: boolean
    /** 允许访问的角色；未声明表示登录即可。 */
    roles?: Role[]
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/owner/book',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/owner',
    redirect: '/owner/book',
  },
  {
    path: '/owner/pets',
    name: 'owner-pets',
    component: () => import('../views/owner/PetsView.vue'),
    meta: { roles: ['owner'], title: '宠物档案' },
  },
  {
    path: '/owner/book',
    name: 'owner-book',
    component: () => import('../views/owner/BookView.vue'),
    meta: { roles: ['owner'], title: '查询与预约' },
  },
  {
    path: '/owner/orders',
    name: 'owner-orders',
    component: () => import('../views/owner/OrdersView.vue'),
    meta: { roles: ['owner'], title: '我的订单' },
  },
  {
    path: '/owner/orders/:id',
    name: 'owner-order-detail',
    component: () => import('../views/owner/OrderDetailView.vue'),
    meta: { roles: ['owner'], title: '订单详情' },
  },
  {
    path: '/staff',
    redirect: '/staff/review',
  },
  {
    path: '/staff/review',
    name: 'staff-review',
    component: () => import('../views/staff/ReviewView.vue'),
    meta: { roles: ['staff'], title: '预约审核' },
  },
  {
    path: '/staff/checkin',
    name: 'staff-checkin',
    component: () => import('../views/staff/CheckinView.vue'),
    meta: { roles: ['staff'], title: '入住办理' },
  },
  {
    path: '/staff/inhouse',
    name: 'staff-inhouse',
    component: () => import('../views/staff/InhouseView.vue'),
    meta: { roles: ['staff'], title: '在住照护' },
  },
  {
    path: '/staff/inhouse/:id',
    name: 'staff-checkout',
    component: () => import('../views/staff/CheckoutView.vue'),
    meta: { roles: ['staff'], title: '离店结算' },
  },
  {
    path: '/admin',
    redirect: '/admin/rooms',
  },
  {
    path: '/admin/rooms',
    name: 'admin-rooms',
    component: () => import('../views/admin/RoomsView.vue'),
    meta: { roles: ['admin'], title: '房型与房间' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  if (!sessionState.loaded) {
    await bootstrap()
  }
  const account = sessionState.account

  if (to.meta.public) {
    if (account && to.name === 'login') return homePath()
    return true
  }

  if (!account) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  const allowedRoles = to.meta.roles
  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return homePath()
  }
  return true
})

router.afterEach((to) => {
  const base = '宠物寄养预约与照护管理系统'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

setUnauthorizedHandler(() => {
  clearSession()
  const current = router.currentRoute.value
  if (current.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: current.fullPath } })
  }
})

export default router
