<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { Reservation, RoomChoice } from '../../api/types'
import {
  approveReservation,
  getCandidateRooms,
  listReservations,
  rejectReservation,
} from '../../api'
import StatusBadge from '../../components/StatusBadge.vue'
import { useFeedback } from '../../composables/useFeedback'
import { formatDateCN, formatDateTime } from '../../utils/dates'
import { formatFen, speciesLabel } from '../../utils/format'

interface ReviewPanel {
  rooms: RoomChoice[]
  roomsLoaded: boolean
  roomsLoading: boolean
  selectedRoomId: number | null
  rejectOpen: boolean
  rejectReason: string
  busy: boolean
}

const reservations = ref<Reservation[]>([])
const loading = ref(true)
const panels = reactive<Record<number, ReviewPanel>>({})
const { error, notice, clear, fail, ok } = useFeedback()

function panelOf(id: number): ReviewPanel {
  const existing = panels[id]
  if (existing) return existing
  const created: ReviewPanel = {
    rooms: [],
    roomsLoaded: false,
    roomsLoading: false,
    selectedRoomId: null,
    rejectOpen: false,
    rejectReason: '',
    busy: false,
  }
  panels[id] = created
  return created
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await listReservations('pending')
    reservations.value = response.reservations
    for (const item of response.reservations) panelOf(item.id)
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function loadRooms(item: Reservation): Promise<void> {
  const panel = panelOf(item.id)
  clear()
  panel.roomsLoading = true
  try {
    const response = await getCandidateRooms(item.id)
    panel.rooms = response.rooms
    panel.roomsLoaded = true
    panel.selectedRoomId = response.rooms.length === 1 ? (response.rooms[0]?.id ?? null) : null
  } catch (cause) {
    fail(cause)
  } finally {
    panel.roomsLoading = false
  }
}

function selectRoom(item: Reservation, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  panelOf(item.id).selectedRoomId = Number.isFinite(value) && value > 0 ? value : null
}

async function approve(item: Reservation): Promise<void> {
  const panel = panelOf(item.id)
  if (!panel.selectedRoomId) {
    error.value = '请选择要分配的房间'
    return
  }
  clear()
  panel.busy = true
  try {
    const response = await approveReservation(item.id, { roomId: panel.selectedRoomId })
    ok(`订单 #${item.id} 已通过审核，分配房间：${response.reservation.room?.name ?? '—'}`)
    delete panels[item.id]
    await load()
  } catch (cause) {
    fail(cause)
  } finally {
    panel.busy = false
  }
}

function toggleReject(item: Reservation): void {
  const panel = panelOf(item.id)
  clear()
  panel.rejectOpen = !panel.rejectOpen
  panel.rejectReason = ''
}

async function reject(item: Reservation): Promise<void> {
  const panel = panelOf(item.id)
  if (!panel.rejectReason.trim()) {
    error.value = '请填写驳回原因'
    return
  }
  clear()
  panel.busy = true
  try {
    await rejectReservation(item.id, { reason: panel.rejectReason.trim() })
    ok(`订单 #${item.id} 已驳回（不占房，主人可在详情查看原因）`)
    delete panels[item.id]
    await load()
  } catch (cause) {
    fail(cause)
  } finally {
    panel.busy = false
  }
}

async function refresh(): Promise<void> {
  clear()
  await load()
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">预约审核</h1>
        <p class="page__subtitle">
          审核待审核预约：通过时分配同房型、体重匹配且区间可用的具体房间；驳回需填写原因。审核不改变价格快照。
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--ghost" type="button" @click="refresh">刷新列表</button>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">待审核预约加载中…</div>
    <div v-else-if="reservations.length === 0" class="card state-block">
      当前没有待审核预约。
    </div>

    <section
      v-for="item in reservations"
      :key="item.id"
      class="card work-card"
    >
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
            <span>创建于 {{ formatDateTime(item.createdAt) }}</span>
          </div>
        </div>
        <span class="money">{{ formatFen(item.baseFeeFen) }}</span>
      </header>

      <div class="grid grid--2">
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
        <div class="sub-panel">
          <h3 class="sub-panel__title">预约与价格快照</h3>
          <dl class="kv">
            <dt>房型</dt>
            <dd>{{ item.roomType.name }}</dd>
            <dt>计划日期</dt>
            <dd>
              {{ formatDateCN(item.startDate) }} → {{ formatDateCN(item.endDate) }}
              （{{ item.plannedDays }} 天）
            </dd>
            <dt>锁定日价</dt>
            <dd>{{ formatFen(item.dailyPriceSnapshotFen) }} / 天（快照）</dd>
            <dt>计划基础费</dt>
            <dd class="money">{{ formatFen(item.baseFeeFen) }}</dd>
          </dl>
        </div>
      </div>

      <div class="sub-panel">
        <h3 class="sub-panel__title">候选房间（同房型、体重满足、区间可用）</h3>
        <div v-if="!panels[item.id]" class="muted">加载中…</div>
        <template v-else>
          <div v-if="!panels[item.id].roomsLoaded" class="row">
            <button
              class="btn btn--soft"
              type="button"
              :disabled="panels[item.id].roomsLoading"
              @click="loadRooms(item)"
            >
              {{ panels[item.id].roomsLoading ? '加载中…' : '加载候选房间' }}
            </button>
            <span class="muted">通过审核前需先加载并选择房间。</span>
          </div>
          <div v-else class="room-picker">
            <p v-if="panels[item.id].rooms.length === 0" class="alert alert--warning">
              该房型当前没有满足条件的可用房间，可驳回该预约或稍后重试。
            </p>
            <template v-else>
              <label class="field">
                <span class="field__label">选择房间<span class="required">*</span></span>
                <select class="select" @change="selectRoom(item, $event)">
                  <option value="" :selected="panels[item.id].selectedRoomId === null">
                    请选择房间
                  </option>
                  <option
                    v-for="room in panels[item.id].rooms"
                    :key="room.id"
                    :value="room.id"
                    :selected="panels[item.id].selectedRoomId === room.id"
                  >
                    {{ room.name }}（最大体重 {{ room.maxWeight }}kg）
                  </option>
                </select>
              </label>
              <div class="row">
                <button
                  class="btn btn--primary"
                  type="button"
                  :disabled="panels[item.id].busy"
                  @click="approve(item)"
                >
                  {{ panels[item.id].busy ? '提交中…' : '通过审核并分房' }}
                </button>
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  :disabled="panels[item.id].roomsLoading || panels[item.id].busy"
                  @click="loadRooms(item)"
                >
                  重新加载候选房间
                </button>
              </div>
            </template>
          </div>
        </template>
      </div>

      <div class="work-card__actions">
        <button class="btn btn--ghost" type="button" :disabled="panels[item.id]?.busy" @click="toggleReject(item)">
          {{ panels[item.id]?.rejectOpen ? '收起驳回' : '驳回预约' }}
        </button>
      </div>

      <form
        v-if="panels[item.id]?.rejectOpen"
        class="sub-panel"
        @submit.prevent="reject(item)"
      >
        <h3 class="sub-panel__title">驳回预约</h3>
        <label class="field">
          <span class="field__label">驳回原因<span class="required">*</span></span>
          <textarea
            v-model="panels[item.id].rejectReason"
            class="textarea"
            placeholder="例如：房间与宠物过敏史不匹配"
          ></textarea>
        </label>
        <div class="form-actions">
          <button class="btn btn--danger" type="submit" :disabled="panels[item.id].busy">
            {{ panels[item.id].busy ? '提交中…' : '确认驳回' }}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            :disabled="panels[item.id].busy"
            @click="toggleReject(item)"
          >
            取消
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
