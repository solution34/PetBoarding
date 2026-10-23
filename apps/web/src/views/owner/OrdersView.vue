<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Reservation, ReservationStatus } from '../../api/types'
import { listReservations } from '../../api'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { formatDateCN, formatDateTime } from '../../utils/dates'
import { formatFen, reasonLabel, speciesLabel } from '../../utils/format'

type FilterValue = ReservationStatus | 'all'

const reservations = ref<Reservation[]>([])
const loading = ref(true)
const statusFilter = ref<FilterValue>('all')
const { error, fail } = useFeedback()

const filterOptions: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'confirmed', label: '已确认' },
  { value: 'checked_in', label: '已入住' },
  { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已驳回' },
  { value: 'cancelled', label: '已取消' },
  { value: 'missed', label: '已失约' },
]

async function load(): Promise<void> {
  loading.value = true
  try {
    const status = statusFilter.value === 'all' ? undefined : statusFilter.value
    const response = await listReservations(status)
    reservations.value = response.reservations
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(statusFilter, () => {
  void load()
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">我的订单</h1>
        <p class="page__subtitle">查看本人预约的状态、房型、价格、照护记录与账单。</p>
      </div>
      <div class="page__actions">
        <RouterLink class="btn btn--primary" to="/owner/book">新建预约</RouterLink>
      </div>
    </header>

    <div class="filter-tabs">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        class="filter-tab"
        :class="{ 'filter-tab--active': statusFilter === option.value }"
        @click="statusFilter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <div v-if="loading" class="state-block">订单加载中…</div>
    <div v-else-if="reservations.length === 0" class="card state-block">
      当前筛选条件下没有订单。
      <RouterLink class="link" to="/owner/book">去查询房型并预约</RouterLink>
    </div>
    <div v-else class="order-list">
      <article v-for="item in reservations" :key="item.id" class="card order-card">
        <div class="order-card__main">
          <div class="order-card__title">
            <span>订单 #{{ item.id }}</span>
            <StatusBadge kind="reservation" :value="item.status" />
            <span class="badge badge--gray">{{ item.pet.name }}</span>
            <span class="badge badge--gray">{{ speciesLabel(item.pet.species) }}</span>
          </div>
          <div class="order-card__meta">
            <span>
              {{ item.roomType.name }}<template v-if="item.room"> · 房间 {{ item.room.name }}</template>
            </span>
            <span>
              {{ formatDateCN(item.startDate) }} → {{ formatDateCN(item.endDate) }}（{{ item.plannedDays }} 天）
            </span>
            <span>日价快照 {{ formatFen(item.dailyPriceSnapshotFen) }}/天</span>
            <span>创建于 {{ formatDateTime(item.createdAt) }}</span>
          </div>
          <p v-if="item.reason" class="muted">{{ reasonLabel(item.status) }}：{{ item.reason }}</p>
        </div>
        <div class="order-card__side">
          <span class="booking-item__price">{{ formatFen(item.baseFeeFen) }}</span>
          <span class="muted">计划基础费</span>
          <RouterLink class="btn btn--ghost btn--sm" :to="`/owner/orders/${item.id}`">
            查看详情
          </RouterLink>
        </div>
      </article>
    </div>
  </div>
</template>
