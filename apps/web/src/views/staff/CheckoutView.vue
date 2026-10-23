<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Bill, CareTask, PaymentMethod, Reservation } from '../../api/types'
import { checkout, getBill, getCareTasks, getReservation } from '../../api'
import BillCard from '../../components/BillCard.vue'
import CareTaskList from '../../components/CareTaskList.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { formatDateCN, formatDateTime } from '../../utils/dates'
import { errorMessage } from '../../utils/errors'
import { PAYMENT_METHOD_LABELS, formatFen, speciesLabel } from '../../utils/format'

const route = useRoute()
const reservationId = computed(() => Number(route.params.id))
const reservation = ref<Reservation | null>(null)
const bill = ref<Bill | null>(null)
const tasks = ref<CareTask[]>([])
const loading = ref(true)
const billLoading = ref(false)
const billError = ref('')
const tasksError = ref('')
const ownerConfirmed = ref(false)
const paymentMethod = ref<PaymentMethod>('cash')
const settling = ref(false)
const { error, notice, clear, fail, ok } = useFeedback()

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: '现金' },
  { value: 'transfer', label: '线下转账' },
]

const canSettle = computed(() => reservation.value?.status === 'checked_in')

async function load(): Promise<void> {
  const id = reservationId.value
  if (!Number.isFinite(id) || id <= 0) {
    loading.value = false
    error.value = '订单编号不合法'
    return
  }
  loading.value = true
  clear()
  billError.value = ''
  tasksError.value = ''
  try {
    const response = await getReservation(id)
    reservation.value = response.reservation

    if (
      response.reservation.status === 'checked_in' ||
      response.reservation.status === 'completed'
    ) {
      billLoading.value = true
      try {
        const billResponse = await getBill(id)
        bill.value = billResponse.bill
      } catch (cause) {
        billError.value = errorMessage(cause)
      } finally {
        billLoading.value = false
      }
    }

    try {
      const tasksResponse = await getCareTasks(id)
      tasks.value = tasksResponse.tasks
    } catch (cause) {
      tasksError.value = errorMessage(cause)
    }
  } catch (cause) {
    reservation.value = null
    fail(cause)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function submitCheckout(): Promise<void> {
  if (!reservation.value) return
  if (reservation.value.status !== 'checked_in') {
    error.value = '仅已入住且未结单的预约可办理离店结算'
    return
  }
  if (!ownerConfirmed.value) {
    error.value = '请先勾选确认主人已核对账单金额'
    return
  }
  clear()
  settling.value = true
  try {
    const response = await checkout(reservation.value.id, {
      paymentMethod: paymentMethod.value,
      ownerConfirmed: true,
    })
    bill.value = response.bill
    reservation.value = response.reservation
    ownerConfirmed.value = false
    ok('离店结算完成：已登记全额线下收款、结束入住并释放实际占用')
    try {
      const tasksResponse = await getCareTasks(reservation.value.id)
      tasks.value = tasksResponse.tasks
    } catch {
      // 结单已成功，任务历史刷新失败不阻断页面
    }
  } catch (cause) {
    fail(cause)
  } finally {
    settling.value = false
  }
}

async function refreshBill(): Promise<void> {
  if (!reservation.value) return
  billLoading.value = true
  billError.value = ''
  try {
    const response = await getBill(reservation.value.id)
    bill.value = response.bill
  } catch (cause) {
    billError.value = errorMessage(cause)
  } finally {
    billLoading.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <p class="muted">
          <RouterLink class="link" to="/staff/inhouse">← 返回在住照护</RouterLink>
        </p>
        <h1 class="page__title">
          离店结算<template v-if="reservation"> #{{ reservation.id }}</template>
          <StatusBadge
            v-if="reservation"
            kind="reservation"
            :value="reservation.status"
            class="ml-8"
          />
        </h1>
        <p class="page__subtitle">
          账单仅含基础费与逾期费；主人核对后，工作人员登记现金或线下转账全额收款并结单。
        </p>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">结算数据加载中…</div>

    <section v-else-if="!reservation" class="card state-block">
      订单不存在或无权查看。
      <RouterLink class="link" to="/staff/inhouse">返回在住照护</RouterLink>
    </section>

    <template v-else>
      <div v-if="reservation.status === 'completed'" class="alert alert--success">
        该预约已完成离店结算，以下为已保存的账单与收款记录。
      </div>
      <div v-else-if="!canSettle" class="alert alert--warning">
        当前预约状态为「{{ reservation.status }}」，只有已入住且未结单的预约可办理离店结算。
      </div>
      <div v-else class="alert alert--info">
        结单后不可撤销：将保存账单与全额收款、结束入住、取消剩余待完成照护任务，并释放实际占用。
      </div>

      <section class="card">
        <header class="card__header">
          <h2 class="card__title">预约与在住信息</h2>
        </header>
        <dl class="kv">
          <dt>宠物</dt>
          <dd>
            {{ reservation.pet.name }}（{{ speciesLabel(reservation.pet.species) }} ·
            {{ reservation.pet.weight }}kg）
          </dd>
          <dt>主人</dt>
          <dd>{{ reservation.ownerDisplayName }}</dd>
          <dt>房型 / 房间</dt>
          <dd>{{ reservation.roomType.name }} / {{ reservation.room?.name ?? '—' }}</dd>
          <dt>计划日期</dt>
          <dd>
            {{ formatDateCN(reservation.startDate) }} → {{ formatDateCN(reservation.endDate) }}
            （{{ reservation.plannedDays }} 天）
          </dd>
          <dt>锁定日价</dt>
          <dd>{{ formatFen(reservation.dailyPriceSnapshotFen) }} / 天</dd>
          <dt>计划基础费</dt>
          <dd class="money">{{ formatFen(reservation.baseFeeFen) }}</dd>
          <template v-if="reservation.stay">
            <dt>实际入住</dt>
            <dd>{{ formatDateTime(reservation.stay.checkInAt) }}</dd>
            <dt>迟到原因</dt>
            <dd>{{ reservation.stay.lateReason || '无' }}</dd>
            <dt>检查备注</dt>
            <dd>{{ reservation.stay.inspectionNotes || '无' }}</dd>
          </template>
        </dl>
      </section>

      <div v-if="billLoading" class="state-block">账单加载中…</div>
      <div v-else-if="billError" class="alert alert--error">{{ billError }}</div>
      <BillCard
        v-else-if="bill"
        :bill="bill"
        :preview="reservation.status === 'checked_in'"
      />

      <section v-if="canSettle" class="card">
        <header class="card__header">
          <h2 class="card__title">主人核对与收款</h2>
          <button class="btn btn--ghost btn--sm" type="button" @click="refreshBill">
            重新计算账单
          </button>
        </header>
        <div class="stack stack--sm">
          <label class="checkbox">
            <input v-model="ownerConfirmed" type="checkbox" />
            <span>主人已核对账单金额（基础费、逾期费与合计）<span class="required">*</span></span>
          </label>

          <div class="field">
            <span class="field__label">收款方式<span class="required">*</span></span>
            <div class="radio-group">
              <label v-for="option in paymentOptions" :key="option.value" class="radio">
                <input v-model="paymentMethod" type="radio" :value="option.value" />
                <span>{{ PAYMENT_METHOD_LABELS[option.value] }}</span>
              </label>
            </div>
            <span class="field__hint">登记线下全额收款；本版不支持在线支付与部分收款。</span>
          </div>

          <p v-if="!bill" class="field__error">账单尚未加载成功，请先刷新账单预览后再结单。</p>
          <div class="form-actions">
            <button
              class="btn btn--primary"
              type="button"
              :disabled="settling || !bill"
              @click="submitCheckout"
            >
              {{ settling ? '结单中…' : '确认全额收款并结单' }}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <header class="card__header">
          <h2 class="card__title">照护任务历史</h2>
          <span v-if="canSettle" class="muted">结单时剩余待完成任务将自动转为已取消并保留历史。</span>
        </header>
        <div v-if="tasksError" class="alert alert--error">{{ tasksError }}</div>
        <CareTaskList v-else :tasks="tasks" empty-text="暂无照护任务" />
      </section>
    </template>
  </div>
</template>
