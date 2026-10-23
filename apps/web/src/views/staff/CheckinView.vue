<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { Reservation } from '../../api/types'
import { checkIn, listReservations, markNoShow } from '../../api'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { clockState, refreshToday } from '../../stores/clock'
import { formatDateCN, formatDateTime } from '../../utils/dates'
import { formatFen, speciesLabel } from '../../utils/format'

interface CheckinPanel {
  open: boolean
  inspectionPassed: boolean
  inspectionNotes: string
  lateReason: string
  busy: boolean
  noShowOpen: boolean
  noShowReason: string
  noShowBusy: boolean
}

const reservations = ref<Reservation[]>([])
const loading = ref(true)
const panels = reactive<Record<number, CheckinPanel>>({})
const { error, notice, clear, fail, ok } = useFeedback()

function panelOf(id: number): CheckinPanel {
  const existing = panels[id]
  if (existing) return existing
  const created: CheckinPanel = {
    open: false,
    inspectionPassed: false,
    inspectionNotes: '',
    lateReason: '',
    busy: false,
    noShowOpen: false,
    noShowReason: '',
    noShowBusy: false,
  }
  panels[id] = created
  return created
}

function canCheckIn(item: Reservation): boolean {
  return (
    item.status === 'confirmed' &&
    clockState.today >= item.startDate &&
    clockState.today < item.endDate
  )
}

function needsLateReason(item: Reservation): boolean {
  return clockState.today > item.startDate
}

function canNoShow(item: Reservation): boolean {
  return item.status === 'confirmed' && clockState.today >= item.endDate
}

function checkinWindowHint(item: Reservation): string {
  if (clockState.today < item.startDate) {
    return `未到计划开始日（${item.startDate}），暂不能办理入住。`
  }
  if (clockState.today >= item.endDate) {
    return `已到/超过计划离店日（${item.endDate}），不能办理入住；如未到店可标记失约。`
  }
  return '当前日期在允许入住区间内，可办理入住。'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await listReservations('confirmed')
    reservations.value = response.reservations
    for (const item of response.reservations) panelOf(item.id)
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshToday(true)
  await load()
})

function toggleCheckin(item: Reservation): void {
  const panel = panelOf(item.id)
  clear()
  panel.open = !panel.open
  panel.inspectionPassed = false
  panel.inspectionNotes = ''
  panel.lateReason = ''
}

async function submitCheckin(item: Reservation): Promise<void> {
  const panel = panelOf(item.id)
  if (!canCheckIn(item)) {
    error.value = checkinWindowHint(item)
    return
  }
  if (!panel.inspectionPassed) {
    error.value = '请先确认入住资料核验通过'
    return
  }
  if (needsLateReason(item) && !panel.lateReason.trim()) {
    error.value = '今天晚于计划开始日，请填写迟到原因'
    return
  }
  clear()
  panel.busy = true
  try {
    const response = await checkIn(item.id, {
      inspectionPassed: true,
      inspectionNotes: panel.inspectionNotes.trim(),
      ...(needsLateReason(item) ? { lateReason: panel.lateReason.trim() } : {}),
    })
    ok(`订单 #${item.id} 已办理入住，实际房间：${response.reservation.room?.name ?? '—'}`)
    delete panels[item.id]
    await load()
  } catch (cause) {
    fail(cause)
  } finally {
    panel.busy = false
  }
}

function toggleNoShow(item: Reservation): void {
  const panel = panelOf(item.id)
  clear()
  panel.noShowOpen = !panel.noShowOpen
  panel.noShowReason = ''
}

async function submitNoShow(item: Reservation): Promise<void> {
  const panel = panelOf(item.id)
  if (!canNoShow(item)) {
    error.value = '到计划离店日（含）之后才能标记失约'
    return
  }
  if (!panel.noShowReason.trim()) {
    error.value = '请填写失约原因'
    return
  }
  clear()
  panel.noShowBusy = true
  try {
    await markNoShow(item.id, { reason: panel.noShowReason.trim() })
    ok(`订单 #${item.id} 已标记失约，计划占用已释放`)
    delete panels[item.id]
    await load()
  } catch (cause) {
    fail(cause)
  } finally {
    panel.noShowBusy = false
  }
}

async function refresh(): Promise<void> {
  clear()
  await refreshToday(true)
  await load()
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">入住办理</h1>
        <p class="page__subtitle">
          已确认预约在 [开始日, 离店日) 内办理入住；资料核验通过、实际房间空闲方可登记。晚于开始日入住必须填写迟到原因。
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--ghost" type="button" @click="refresh">刷新列表</button>
      </div>
    </header>

    <div class="alert alert--info">
      门店今天：{{ formatDateCN(clockState.today) }}
      <span v-if="clockState.clockOverridden">（服务端演示日期覆盖中）</span>
      · 到达计划离店日仍未入住的预约，可手动标记失约。
    </div>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">已确认预约加载中…</div>
    <div v-else-if="reservations.length === 0" class="card state-block">
      当前没有已确认待入住的预约。
    </div>

    <section v-for="item in reservations" :key="item.id" class="card work-card">
      <header class="work-card__head">
        <div>
          <div class="work-card__title">
            <span>订单 #{{ item.id }}</span>
            <StatusBadge kind="reservation" :value="item.status" />
            <span class="badge badge--gray">{{ item.pet.name }}</span>
            <span class="badge badge--gray">{{ speciesLabel(item.pet.species) }}</span>
          </div>
          <div class="work-card__meta">
            <span>主人：{{ item.ownerDisplayName }}</span>
            <span>房型：{{ item.roomType.name }}</span>
            <span>房间：{{ item.room?.name ?? '未分配' }}</span>
          </div>
        </div>
      </header>

      <div class="grid grid--2">
        <div class="sub-panel">
          <h3 class="sub-panel__title">预约信息</h3>
          <dl class="kv">
            <dt>计划日期</dt>
            <dd>
              {{ formatDateCN(item.startDate) }} → {{ formatDateCN(item.endDate) }}
              （{{ item.plannedDays }} 天）
            </dd>
            <dt>锁定日价</dt>
            <dd>{{ formatFen(item.dailyPriceSnapshotFen) }} / 天</dd>
            <dt>计划基础费</dt>
            <dd class="money">{{ formatFen(item.baseFeeFen) }}</dd>
            <dt>提交时间</dt>
            <dd>{{ formatDateTime(item.createdAt) }}</dd>
          </dl>
        </div>
        <div class="sub-panel">
          <h3 class="sub-panel__title">宠物资料 / 健康备注</h3>
          <dl class="kv">
            <dt>名称</dt>
            <dd>{{ item.pet.name }}（{{ speciesLabel(item.pet.species) }} · {{ item.pet.weight }}kg）</dd>
            <dt>联系人</dt>
            <dd>{{ item.pet.contact }}</dd>
            <dt>照护备注</dt>
            <dd>{{ item.pet.careNotes || '无' }}</dd>
            <dt>疫苗说明</dt>
            <dd>{{ item.pet.vaccineNotes || '无' }}</dd>
          </dl>
        </div>
      </div>

      <div class="alert" :class="canCheckIn(item) ? 'alert--success' : 'alert--warning'">
        {{ checkinWindowHint(item) }}
        <template v-if="canCheckIn(item) && needsLateReason(item)">
          · 今天晚于计划开始日，办理入住时需填写迟到原因，原定离店日与基础费不变。
        </template>
      </div>

      <div class="work-card__actions">
        <button
          class="btn btn--primary"
          type="button"
          :disabled="!canCheckIn(item) || panels[item.id]?.busy"
          @click="toggleCheckin(item)"
        >
          {{ panels[item.id]?.open ? '收起入住表单' : '办理入住' }}
        </button>
        <button
          class="btn btn--ghost"
          type="button"
          :disabled="!canNoShow(item)"
          @click="toggleNoShow(item)"
        >
          {{ panels[item.id]?.noShowOpen ? '收起失约表单' : '标记失约' }}
        </button>
        <span v-if="!canNoShow(item)" class="muted">
          到达计划离店日（含）后可标记失约。
        </span>
      </div>

      <form
        v-if="panels[item.id]?.open"
        class="sub-panel"
        @submit.prevent="submitCheckin(item)"
      >
        <h3 class="sub-panel__title">入住检查</h3>
        <label class="checkbox">
          <input v-model="panels[item.id].inspectionPassed" type="checkbox" />
          <span>资料核验通过（已核对宠物、联系人、疫苗及健康说明）<span class="required">*</span></span>
        </label>
        <label class="field mt-12">
          <span class="field__label">检查备注</span>
          <textarea
            v-model="panels[item.id].inspectionNotes"
            class="textarea"
            placeholder="例如：精神状态良好，无皮肤异常"
          ></textarea>
        </label>
        <label v-if="needsLateReason(item)" class="field mt-12">
          <span class="field__label">迟到原因<span class="required">*</span></span>
          <input
            v-model="panels[item.id].lateReason"
            class="input"
            type="text"
            placeholder="例如：主人航班延误"
          />
          <span class="field__hint">今天晚于计划开始日，必须填写迟到原因。</span>
        </label>
        <div class="form-actions">
          <button class="btn btn--primary" type="submit" :disabled="panels[item.id].busy">
            {{ panels[item.id].busy ? '登记中…' : '确认登记入住' }}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            :disabled="panels[item.id].busy"
            @click="toggleCheckin(item)"
          >
            取消
          </button>
        </div>
      </form>

      <form
        v-if="panels[item.id]?.noShowOpen"
        class="sub-panel"
        @submit.prevent="submitNoShow(item)"
      >
        <h3 class="sub-panel__title">标记失约</h3>
        <label class="field">
          <span class="field__label">失约原因<span class="required">*</span></span>
          <textarea
            v-model="panels[item.id].noShowReason"
            class="textarea"
            placeholder="例如：到店日未到店，电话确认后标记失约"
          ></textarea>
        </label>
        <div class="form-actions">
          <button class="btn btn--danger" type="submit" :disabled="panels[item.id].noShowBusy">
            {{ panels[item.id].noShowBusy ? '提交中…' : '确认标记失约' }}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            :disabled="panels[item.id].noShowBusy"
            @click="toggleNoShow(item)"
          >
            取消
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
