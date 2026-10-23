<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Bill, CareTask, Reservation } from '../../api/types'
import { cancelReservation, getBill, getCareTasks, getReservation } from '../../api'
import BillCard from '../../components/BillCard.vue'
import CareTaskList from '../../components/CareTaskList.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { formatDateCN, formatDateTime } from '../../utils/dates'
import { errorMessage } from '../../utils/errors'
import { formatFen, reasonLabel, speciesLabel } from '../../utils/format'

const route = useRoute()
const reservationId = computed(() => Number(route.params.id))
const reservation = ref<Reservation | null>(null)
const tasks = ref<CareTask[]>([])
const bill = ref<Bill | null>(null)
const loading = ref(true)
const careLoading = ref(false)
const billLoading = ref(false)
const careError = ref('')
const billError = ref('')
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)
const { error, notice, clear, fail, ok } = useFeedback()

const canCancel = computed(
  () => reservation.value?.status === 'pending' || reservation.value?.status === 'confirmed',
)

const billApplicable = computed(
  () =>
    reservation.value !== null &&
    (reservation.value.status === 'checked_in' || reservation.value.status === 'completed'),
)

async function loadCareTasks(id: number): Promise<void> {
  careLoading.value = true
  careError.value = ''
  try {
    const response = await getCareTasks(id)
    tasks.value = response.tasks
  } catch (cause) {
    careError.value = errorMessage(cause)
  } finally {
    careLoading.value = false
  }
}

async function loadBill(id: number): Promise<void> {
  billLoading.value = true
  billError.value = ''
  try {
    const response = await getBill(id)
    bill.value = response.bill
  } catch (cause) {
    billError.value = errorMessage(cause)
  } finally {
    billLoading.value = false
  }
}

async function load(): Promise<void> {
  const id = reservationId.value
  if (!Number.isFinite(id) || id <= 0) {
    loading.value = false
    error.value = '订单编号不合法'
    return
  }
  loading.value = true
  clear()
  try {
    const response = await getReservation(id)
    reservation.value = response.reservation
    void loadCareTasks(id)
    if (
      response.reservation.status === 'checked_in' ||
      response.reservation.status === 'completed'
    ) {
      void loadBill(id)
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

function openCancel(): void {
  clear()
  cancelReason.value = ''
  cancelOpen.value = true
}

async function submitCancel(): Promise<void> {
  if (!reservation.value) return
  if (!cancelReason.value.trim()) {
    error.value = '请填写取消原因'
    return
  }
  cancelling.value = true
  try {
    const response = await cancelReservation(reservation.value.id, {
      reason: cancelReason.value.trim(),
    })
    reservation.value = response.reservation
    cancelOpen.value = false
    cancelReason.value = ''
    ok('预约已取消，未入住不收取费用')
  } catch (cause) {
    fail(cause)
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <p class="muted">
          <RouterLink class="link" to="/owner/orders">← 返回我的订单</RouterLink>
        </p>
        <h1 class="page__title">
          订单详情<template v-if="reservation"> #{{ reservation.id }}</template>
          <StatusBadge
            v-if="reservation"
            kind="reservation"
            :value="reservation.status"
            class="ml-8"
          />
        </h1>
        <p class="page__subtitle">只读展示订单状态、宠物、房型/房间、价格快照、照护任务与账单。</p>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">订单加载中…</div>

    <section v-else-if="!reservation" class="card state-block">
      订单不存在或无权查看。
      <RouterLink class="link" to="/owner/orders">返回我的订单</RouterLink>
    </section>

    <template v-else>
      <section class="card">
        <header class="card__header">
          <h2 class="card__title">预约信息</h2>
          <span class="muted">创建于 {{ formatDateTime(reservation.createdAt) }}</span>
        </header>
        <dl class="kv">
          <dt>宠物</dt>
          <dd>
            {{ reservation.pet.name }}（{{ speciesLabel(reservation.pet.species) }} ·
            {{ reservation.pet.weight }}kg）
          </dd>
          <dt>计划日期</dt>
          <dd>
            {{ formatDateCN(reservation.startDate) }} → {{ formatDateCN(reservation.endDate) }}
            （{{ reservation.plannedDays }} 天）
          </dd>
          <dt>房型</dt>
          <dd>{{ reservation.roomType.name }}</dd>
          <dt>房间</dt>
          <dd>{{ reservation.room ? reservation.room.name : '待审核 / 未分配' }}</dd>
          <dt>日价快照</dt>
          <dd>{{ formatFen(reservation.dailyPriceSnapshotFen) }} / 天</dd>
          <dt>计划基础费</dt>
          <dd class="money">{{ formatFen(reservation.baseFeeFen) }}</dd>
          <dt>审核时间</dt>
          <dd>{{ reservation.reviewedAt ? formatDateTime(reservation.reviewedAt) : '—' }}</dd>
        </dl>
      </section>

      <div v-if="reservation.reason" class="alert alert--warning">
        <p class="alert__title">{{ reasonLabel(reservation.status) }}</p>
        <p>{{ reservation.reason }}</p>
      </div>

      <section class="card">
        <header class="card__header">
          <h2 class="card__title">宠物信息</h2>
        </header>
        <dl class="kv">
          <dt>名称</dt>
          <dd>{{ reservation.pet.name }}</dd>
          <dt>物种 / 体重</dt>
          <dd>{{ speciesLabel(reservation.pet.species) }} · {{ reservation.pet.weight }}kg</dd>
          <dt>联系人</dt>
          <dd>{{ reservation.pet.contact }}</dd>
          <dt>照护备注</dt>
          <dd>{{ reservation.pet.careNotes || '无' }}</dd>
          <dt>疫苗说明</dt>
          <dd>{{ reservation.pet.vaccineNotes || '无' }}</dd>
        </dl>
      </section>

      <section v-if="reservation.stay" class="card">
        <header class="card__header">
          <h2 class="card__title">入住记录</h2>
          <span v-if="!reservation.stay.checkOutAt" class="badge badge--green">在住</span>
          <span v-else class="badge badge--gray">已离店</span>
        </header>
        <dl class="kv">
          <dt>实际入住</dt>
          <dd>{{ formatDateTime(reservation.stay.checkInAt) }}</dd>
          <dt>实际离店</dt>
          <dd>{{ reservation.stay.checkOutAt ? formatDateTime(reservation.stay.checkOutAt) : '—' }}</dd>
          <dt>迟到原因</dt>
          <dd>{{ reservation.stay.lateReason || '无' }}</dd>
          <dt>入住检查备注</dt>
          <dd>{{ reservation.stay.inspectionNotes || '无' }}</dd>
        </dl>
      </section>

      <section class="card">
        <header class="card__header">
          <h2 class="card__title">照护任务与完成记录</h2>
        </header>
        <div v-if="careLoading" class="state-block">照护任务加载中…</div>
        <div v-else-if="careError" class="alert alert--error">{{ careError }}</div>
        <CareTaskList v-else :tasks="tasks" empty-text="暂无照护任务（入住后由工作人员创建）" />
      </section>

      <div v-if="billLoading" class="state-block">账单加载中…</div>
      <div v-else-if="billApplicable && billError" class="alert alert--error">{{ billError }}</div>
      <BillCard
        v-else-if="billApplicable && bill"
        :bill="bill"
        :preview="bill.settled === false"
      />

      <section v-if="canCancel" class="card">
        <header class="card__header">
          <h2 class="card__title">取消预约</h2>
          <span class="muted">待审核 / 已确认且未入住的预约可免费取消。</span>
        </header>
        <template v-if="!cancelOpen">
          <button class="btn btn--danger" type="button" @click="openCancel">取消预约</button>
        </template>
        <form v-else class="stack" @submit.prevent="submitCancel">
          <label class="field">
            <span class="field__label">取消原因<span class="required">*</span></span>
            <textarea
              v-model="cancelReason"
              class="textarea"
              placeholder="请填写取消原因，例如：行程有变"
            ></textarea>
          </label>
          <div class="form-actions">
            <button class="btn btn--danger" type="submit" :disabled="cancelling">
              {{ cancelling ? '提交中…' : '确认取消预约' }}
            </button>
            <button class="btn btn--ghost" type="button" :disabled="cancelling" @click="cancelOpen = false">
              返回
            </button>
          </div>
        </form>
      </section>
    </template>
  </div>
</template>
