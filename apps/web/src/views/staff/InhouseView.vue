<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { CareTask, CareTaskKind, StaySummary } from '../../api/types'
import { completeCareTask, createCareTask, getCareTasks, listStays } from '../../api'
import CareTaskList from '../../components/CareTaskList.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { clockState, refreshToday } from '../../stores/clock'
import {
  defaultCareTaskPlannedAt,
  formatDateCN,
  formatDateTime,
  toLocalApiDateTime,
} from '../../utils/dates'
import { errorMessage } from '../../utils/errors'
import { speciesLabel } from '../../utils/format'

interface TaskDraft {
  kind: CareTaskKind
  plannedAt: string
  instruction: string
}

interface StayTasksState {
  open: boolean
  loaded: boolean
  loading: boolean
  tasks: CareTask[]
  error: string
  draft: TaskDraft
  creating: boolean
}

const stays = ref<StaySummary[]>([])
const loading = ref(true)
const completingTaskId = ref<number | null>(null)
const states = reactive<Record<number, StayTasksState>>({})
const { error, notice, clear, fail, ok } = useFeedback()

const kindOptions: Array<{ value: CareTaskKind; label: string }> = [
  { value: 'feeding', label: '喂食' },
  { value: 'water', label: '饮水' },
  { value: 'cleaning', label: '清洁' },
  { value: 'other', label: '其他' },
]

function stateOf(stay: StaySummary): StayTasksState {
  const existing = states[stay.reservationId]
  if (existing) return existing
  const created: StayTasksState = {
    open: false,
    loaded: false,
    loading: false,
    tasks: [],
    error: '',
    draft: {
      kind: 'feeding',
      plannedAt: defaultCareTaskPlannedAt(stay.reservation.endDate, clockState.today),
      instruction: '',
    },
    creating: false,
  }
  states[stay.reservationId] = created
  return created
}

async function fetchStays(silent: boolean): Promise<void> {
  if (!silent) loading.value = true
  try {
    const response = await listStays()
    stays.value = response.stays
    for (const stay of response.stays) stateOf(stay)
  } catch (cause) {
    fail(cause)
  } finally {
    if (!silent) loading.value = false
  }
}

onMounted(async () => {
  await refreshToday(true)
  await fetchStays(false)
})

async function loadTasks(stay: StaySummary): Promise<void> {
  const state = stateOf(stay)
  state.loading = true
  state.error = ''
  try {
    const response = await getCareTasks(stay.reservationId)
    state.tasks = response.tasks
    state.loaded = true
  } catch (cause) {
    state.error = errorMessage(cause)
  } finally {
    state.loading = false
  }
}

function toggleTasks(stay: StaySummary): void {
  const state = stateOf(stay)
  clear()
  state.open = !state.open
  if (state.open && !state.loaded) {
    void loadTasks(stay)
  }
}

async function submitTask(stay: StaySummary): Promise<void> {
  const state = stateOf(stay)
  if (!state.draft.plannedAt) {
    error.value = '请选择计划时间'
    return
  }
  if (!state.draft.instruction.trim()) {
    error.value = '请填写任务说明'
    return
  }
  clear()
  state.creating = true
  try {
    await createCareTask(stay.reservationId, {
      kind: state.draft.kind,
      plannedAt: toLocalApiDateTime(state.draft.plannedAt),
      instruction: state.draft.instruction.trim(),
    })
    ok('照护任务已创建')
    state.draft.instruction = ''
    await loadTasks(stay)
    await fetchStays(true)
  } catch (cause) {
    fail(cause)
  } finally {
    state.creating = false
  }
}

async function handleComplete(
  stay: StaySummary,
  payload: { taskId: number; notes: string },
): Promise<void> {
  completingTaskId.value = payload.taskId
  clear()
  try {
    await completeCareTask(payload.taskId, { notes: payload.notes })
    ok('照护任务已完成，已保存执行人、完成时间与文字记录')
    await loadTasks(stay)
    await fetchStays(true)
  } catch (cause) {
    fail(cause)
  } finally {
    completingTaskId.value = null
  }
}

async function refresh(): Promise<void> {
  clear()
  await refreshToday(true)
  await fetchStays(false)
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">在住照护</h1>
        <p class="page__subtitle">
          在住宠物列表：创建照护任务（类型/计划时间/说明），执行后填写文字记录并标记完成；离店后剩余待完成任务自动取消。
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--ghost" type="button" @click="refresh">刷新列表</button>
      </div>
    </header>

    <div class="alert alert--info">门店今天：{{ formatDateCN(clockState.today) }}</div>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">在住记录加载中…</div>
    <div v-else-if="stays.length === 0" class="card state-block">
      当前没有在住宠物。入住办理成功后，宠物会出现在这里。
    </div>

    <div v-else class="stay-grid">
      <section v-for="stay in stays" :key="stay.id" class="card work-card">
        <header class="work-card__head">
          <div>
            <div class="work-card__title">
              <span>{{ stay.reservation.pet.name }}</span>
              <StatusBadge kind="reservation" :value="stay.reservation.status" />
              <span class="badge badge--gray">{{ speciesLabel(stay.reservation.pet.species) }}</span>
            </div>
            <div class="work-card__meta">
              <span>主人：{{ stay.reservation.ownerDisplayName }}</span>
              <span>房间：{{ stay.reservation.room?.name ?? '—' }}</span>
              <span>入住：{{ formatDateTime(stay.checkInAt) }}</span>
            </div>
          </div>
          <RouterLink
            class="btn btn--primary btn--sm"
            :to="`/staff/inhouse/${stay.reservationId}`"
          >
            离店结算
          </RouterLink>
        </header>

        <dl class="kv">
          <dt>计划日期</dt>
          <dd>
            {{ formatDateCN(stay.reservation.startDate) }} →
            {{ formatDateCN(stay.reservation.endDate) }}
            （{{ stay.reservation.plannedDays }} 天）
          </dd>
          <dt>迟到原因</dt>
          <dd>{{ stay.lateReason || '无' }}</dd>
          <dt>检查备注</dt>
          <dd>{{ stay.inspectionNotes || '无' }}</dd>
          <dt>任务统计</dt>
          <dd>
            待完成 <strong>{{ stay.pendingTaskCount }}</strong> · 已完成
            <strong>{{ stay.completedTaskCount }}</strong>
          </dd>
        </dl>

        <div class="work-card__actions">
          <button class="btn btn--soft" type="button" @click="toggleTasks(stay)">
            {{ states[stay.reservationId]?.open ? '收起照护任务' : '管理照护任务' }}
          </button>
        </div>

        <div v-if="states[stay.reservationId]?.open" class="stay-tasks">
          <form class="sub-panel" @submit.prevent="submitTask(stay)">
            <h3 class="sub-panel__title">创建照护任务</h3>
            <div class="form-grid form-grid--3">
              <label class="field">
                <span class="field__label">任务类型<span class="required">*</span></span>
                <select v-model="states[stay.reservationId].draft.kind" class="select">
                  <option v-for="option in kindOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span class="field__label">计划时间<span class="required">*</span></span>
                <input
                  v-model="states[stay.reservationId].draft.plannedAt"
                  class="input"
                  type="datetime-local"
                />
              </label>
              <label class="field">
                <span class="field__label">任务说明<span class="required">*</span></span>
                <input
                  v-model="states[stay.reservationId].draft.instruction"
                  class="input"
                  type="text"
                  placeholder="例如：按备注喂半袋猫粮"
                />
              </label>
            </div>
            <p class="field__hint mt-8">
              计划时间须晚于实际入住时间（{{ formatDateTime(stay.checkInAt) }}），且不晚于计划离店日 23:59。
            </p>
            <div class="form-actions">
              <button
                class="btn btn--primary"
                type="submit"
                :disabled="states[stay.reservationId].creating"
              >
                {{ states[stay.reservationId].creating ? '创建中…' : '创建任务' }}
              </button>
            </div>
          </form>

          <div v-if="states[stay.reservationId].loading" class="state-block">
            照护任务加载中…
          </div>
          <div v-else-if="states[stay.reservationId].error" class="alert alert--error">
            {{ states[stay.reservationId].error }}
          </div>
          <CareTaskList
            v-else
            :tasks="states[stay.reservationId].tasks"
            editable
            :busy="completingTaskId !== null"
            empty-text="暂无照护任务，可在上方创建"
            @complete="handleComplete(stay, $event)"
          />
        </div>
      </section>
    </div>
  </div>
</template>
