<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { AdminRoom, AdminRoomType } from '../../api/types'
import { getAdminRooms, updateRoom, updateRoomType } from '../../api'
import { useFeedback } from '../../composables/useFeedback'
import { errorMessage, getErrorField, isApiErrorCode } from '../../utils/errors'
import {
  fenToYuanInput,
  formatFen,
  speciesLabel,
  yuanInputToFen,
} from '../../utils/format'

interface RoomDraft {
  name: string
  maxWeight: string
}

const roomTypes = ref<AdminRoomType[]>([])
const loading = ref(true)
const priceDrafts = reactive<Record<number, string>>({})
const priceSaving = reactive<Record<number, boolean>>({})
const roomDrafts = reactive<Record<number, RoomDraft>>({})
const roomSaving = reactive<Record<number, boolean>>({})
const roomErrors = reactive<Record<number, string>>({})
const { error, notice, clear, fail, ok } = useFeedback()

function initDrafts(): void {
  for (const roomType of roomTypes.value) {
    priceDrafts[roomType.id] = fenToYuanInput(roomType.dailyPriceFen)
    for (const room of roomType.rooms) {
      roomDrafts[room.id] = { name: room.name, maxWeight: String(room.maxWeight) }
      roomErrors[room.id] = ''
    }
  }
}

async function load(silent = false): Promise<void> {
  if (!silent) loading.value = true
  try {
    const response = await getAdminRooms()
    roomTypes.value = response.roomTypes
    initDrafts()
  } catch (cause) {
    fail(cause)
  } finally {
    if (!silent) loading.value = false
  }
}

onMounted(() => {
  void load()
})

function findRoom(roomId: number): AdminRoom | null {
  for (const roomType of roomTypes.value) {
    const room = roomType.rooms.find((item) => item.id === roomId)
    if (room) return room
  }
  return null
}

async function savePrice(roomType: AdminRoomType): Promise<void> {
  clear()
  const fen = yuanInputToFen(priceDrafts[roomType.id] ?? '')
  if (fen === null) {
    error.value = `「${roomType.name}」日价必须是非负金额（元）`
    return
  }
  priceSaving[roomType.id] = true
  try {
    const response = await updateRoomType(roomType.id, { dailyPriceFen: fen })
    ok(
      `「${roomType.name}」日价已更新为 ${formatFen(response.roomType.dailyPriceFen)}/天，仅影响之后提交的预约`,
    )
    await load(true)
  } catch (cause) {
    fail(cause)
  } finally {
    priceSaving[roomType.id] = false
  }
}

async function saveRoom(room: AdminRoom): Promise<void> {
  clear()
  const draft = roomDrafts[room.id]
  if (!draft) return
  roomErrors[room.id] = ''
  const name = draft.name.trim()
  const weight = Number(draft.maxWeight)
  if (!name) {
    roomErrors[room.id] = '房间名称不能为空'
    return
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    roomErrors[room.id] = '最大体重必须是大于 0 的数字'
    return
  }
  roomSaving[room.id] = true
  try {
    await updateRoom(room.id, { name, maxWeight: weight })
    ok(`房间「${name}」资料已保存`)
    await load(true)
  } catch (cause) {
    if (isApiErrorCode(cause, 'ROOM_IN_USE')) {
      roomErrors[room.id] =
        '该房间存在未完成预约（已确认/已入住），不能修改最大体重；可只修改名称后重试。'
      const current = findRoom(room.id)
      if (current) draft.maxWeight = String(current.maxWeight)
    } else if (isApiErrorCode(cause, 'VALIDATION_ERROR')) {
      const field = getErrorField(cause)
      const suffix = field === 'name' ? '（房间名称需全局唯一）' : ''
      roomErrors[room.id] = `${errorMessage(cause)}${suffix}`
    } else {
      fail(cause)
    }
  } finally {
    roomSaving[room.id] = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">房型与房间</h1>
        <p class="page__subtitle">
          维护四类房型的日价，以及房间名称与最大体重限制。改价只影响之后提交的预约，历史订单价格快照不变。
        </p>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div v-if="loading" class="state-block">房型与房间数据加载中…</div>

    <template v-else>
      <section v-for="roomType in roomTypes" :key="roomType.id" class="card admin-roomtype">
        <header class="admin-roomtype__head">
        <div class="admin-roomtype__title">
          <span>{{ roomType.name }}</span>
          <span class="badge badge--gray">{{ speciesLabel(roomType.species) }}</span>
          <span class="muted">当前日价 {{ formatFen(roomType.dailyPriceFen) }}/天</span>
        </div>
      </header>

      <form class="price-editor" @submit.prevent="savePrice(roomType)">
        <label class="field">
          <span class="field__label">日价（元）</span>
          <input
            v-model="priceDrafts[roomType.id]"
            class="input"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <button class="btn btn--primary btn--sm" type="submit" :disabled="priceSaving[roomType.id]">
          {{ priceSaving[roomType.id] ? '保存中…' : '保存日价' }}
        </button>
        <span class="price-editor__current">
          金额以分保存，例如 80.00 元 = 8000 分；已提交订单使用日价快照，不随改价变化。
        </span>
      </form>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>房间名称</th>
              <th>最大体重（kg）</th>
              <th>未完成预约</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in roomType.rooms" :key="room.id">
              <td>
                <input v-model="roomDrafts[room.id].name" class="input" type="text" />
              </td>
              <td>
                <input
                  v-model="roomDrafts[room.id].maxWeight"
                  class="input"
                  type="number"
                  min="0.1"
                  step="0.1"
                />
              </td>
              <td>{{ room.activeReservationCount }} 单</td>
              <td>
                <button
                  class="btn btn--soft btn--sm"
                  type="button"
                  :disabled="roomSaving[room.id]"
                  @click="saveRoom(room)"
                >
                  {{ roomSaving[room.id] ? '保存中…' : '保存房间' }}
                </button>
                <p v-if="roomErrors[room.id]" class="room-error">{{ roomErrors[room.id] }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </section>
    </template>

    <section class="card card--soft">
      <h2 class="section-title">维护规则</h2>
      <ul class="stack stack--sm mt-8">
        <li class="muted">房型固定四类，所属房型初始化后不可变更；房间名称全局唯一。</li>
        <li class="muted">最大体重必须大于 0；房间存在已确认或已入住的预约时不能修改体重限制（返回 409 ROOM_IN_USE）。</li>
        <li class="muted">改价不追溯：仅影响之后提交的预约，审核不会改变已有订单的日价快照。</li>
      </ul>
    </section>
  </div>
</template>
