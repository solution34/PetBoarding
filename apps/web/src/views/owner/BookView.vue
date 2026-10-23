<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type {
  AvailabilityItem,
  AvailabilityResponse,
  Pet,
  PriceChangedDetails,
  RoomType,
} from '../../api/types'
import { createReservation, getAvailability, listPets, listRoomTypes } from '../../api'
import { useFeedback } from '../../composables/useFeedback'
import { clockState, refreshToday } from '../../stores/clock'
import { addDays, formatDateCN } from '../../utils/dates'
import { parsePriceChange } from '../../utils/errors'
import { formatFen, speciesLabel } from '../../utils/format'

const pets = ref<Pet[]>([])
const roomTypes = ref<RoomType[]>([])
const petId = ref('')
const startDate = ref('')
const endDate = ref('')
const loadingBase = ref(true)
const querying = ref(false)
const queried = ref(false)
const availability = ref<AvailabilityResponse | null>(null)
const selected = ref<AvailabilityItem | null>(null)
const priceChange = ref<PriceChangedDetails | null>(null)
const agreed = ref(false)
const submitting = ref(false)
const created = ref<{ id: number; petName: string } | null>(null)
const { error, notice, clear, fail, ok } = useFeedback()

const selectedPet = computed<Pet | null>(() => {
  return pets.value.find((pet) => String(pet.id) === petId.value) ?? null
})

const effectiveDailyPriceFen = computed<number>(() => {
  if (priceChange.value) return priceChange.value.dailyPriceFen
  return selected.value?.dailyPriceFen ?? 0
})

const effectiveTotalFen = computed<number>(() => {
  if (priceChange.value) return priceChange.value.totalFen
  return selected.value?.totalFen ?? 0
})

const effectivePlannedDays = computed<number>(() => {
  if (priceChange.value) return priceChange.value.plannedDays
  return availability.value?.plannedDays ?? 0
})

async function loadBase(): Promise<void> {
  loadingBase.value = true
  try {
    const [petsResponse, roomTypesResponse] = await Promise.all([listPets(), listRoomTypes()])
    pets.value = petsResponse.pets
    roomTypes.value = roomTypesResponse.roomTypes
    if (pets.value.length > 0 && !petId.value) {
      petId.value = String(pets.value[0]?.id ?? '')
    }
  } catch (cause) {
    fail(cause)
  } finally {
    loadingBase.value = false
  }
}

onMounted(async () => {
  await refreshToday(true)
  await loadBase()
  startDate.value = addDays(clockState.today, 1)
  endDate.value = addDays(startDate.value, 3)
  if (pets.value.length > 0) {
    await queryAvailability()
  }
})

function invalidateResults(): void {
  queried.value = false
  availability.value = null
  selected.value = null
  priceChange.value = null
  agreed.value = false
  clear()
}

async function queryAvailability(): Promise<void> {
  clear()
  selected.value = null
  priceChange.value = null
  agreed.value = false
  created.value = null

  const petIdNumber = Number(petId.value)
  if (!petIdNumber) {
    error.value = '请选择要寄养的宠物'
    return
  }
  if (!startDate.value || !endDate.value) {
    error.value = '请选择开始日期和离店日期'
    return
  }
  if (startDate.value < clockState.today) {
    error.value = '开始日期不能早于今天'
    return
  }
  if (startDate.value >= endDate.value) {
    error.value = '离店日期必须晚于开始日期'
    return
  }

  querying.value = true
  try {
    availability.value = await getAvailability({
      petId: petIdNumber,
      startDate: startDate.value,
      endDate: endDate.value,
    })
    queried.value = true
  } catch (cause) {
    availability.value = null
    queried.value = false
    fail(cause)
  } finally {
    querying.value = false
  }
}

function selectItem(item: AvailabilityItem): void {
  if (item.availableRooms <= 0) return
  clear()
  selected.value = item
  priceChange.value = null
  agreed.value = false
  created.value = null
}

function cancelSelection(): void {
  selected.value = null
  priceChange.value = null
  agreed.value = false
}

function handleAgreement(event: Event): void {
  agreed.value = (event.target as HTMLInputElement).checked
}

async function submitReservation(): Promise<void> {
  clear()
  const item = selected.value
  if (!item) {
    error.value = '请先选择房型'
    return
  }
  if (item.availableRooms <= 0) {
    error.value = '该房型当前没有连续可用房间，无法预约'
    return
  }
  if (!agreed.value) {
    error.value = '请先勾选确认费用说明'
    return
  }
  submitting.value = true
  try {
    const { reservation } = await createReservation({
      petId: Number(petId.value),
      roomTypeId: item.roomTypeId,
      startDate: startDate.value,
      endDate: endDate.value,
      confirmedDailyPriceFen: effectiveDailyPriceFen.value,
    })
    created.value = { id: reservation.id, petName: reservation.pet.name }
    ok(`预约已提交，订单 #${reservation.id} 等待工作人员审核`)
    selected.value = null
    priceChange.value = null
    agreed.value = false
  } catch (cause) {
    const change = parsePriceChange(cause)
    if (change) {
      priceChange.value = change
      agreed.value = false
    } else {
      fail(cause)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">查询与预约</h1>
        <p class="page__subtitle">
          选择宠物与寄养日期，查询匹配房型、日价、计划基础费与连续可用房间数。查询不占房，提交后进入待审核。
        </p>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">
      {{ notice }}
      <template v-if="created">
        <RouterLink class="link" :to="`/owner/orders/${created.id}`">查看订单详情</RouterLink>
      </template>
    </div>

    <section class="card">
      <form class="inline-form" @submit.prevent="queryAvailability">
        <label class="field">
          <span class="field__label">寄养宠物<span class="required">*</span></span>
          <select v-model="petId" class="select" @change="invalidateResults">
            <option value="" disabled>请选择宠物</option>
            <option v-for="pet in pets" :key="pet.id" :value="String(pet.id)">
              {{ pet.name }}（{{ speciesLabel(pet.species) }} · {{ pet.weight }}kg）
            </option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">开始日期<span class="required">*</span></span>
          <input
            v-model="startDate"
            class="input"
            type="date"
            :min="clockState.today"
            @change="invalidateResults"
          />
        </label>
        <label class="field">
          <span class="field__label">离店日期<span class="required">*</span></span>
          <input
            v-model="endDate"
            class="input"
            type="date"
            :min="startDate || clockState.today"
            @change="invalidateResults"
          />
        </label>
        <button class="btn btn--primary" type="submit" :disabled="querying || loadingBase">
          {{ querying ? '查询中…' : '查询房型' }}
        </button>
      </form>
      <p class="muted mt-8">
        门店今天：{{ formatDateCN(clockState.today) }} · 预约区间为 [开始日, 离店日)，按自然日差计算天数，最少一天。
      </p>
    </section>

    <div v-if="loadingBase" class="state-block">基础数据加载中…</div>

    <section v-else-if="pets.length === 0" class="card state-block">
      还没有宠物档案，请先
      <RouterLink class="link" to="/owner/pets">创建宠物档案</RouterLink>
      后再查询房型。
    </section>

    <template v-else>
      <section v-if="queried && availability" class="card">
        <header class="card__header">
          <div>
            <h2 class="card__title">
              查询结果
              <span class="muted">
                （{{ formatDateCN(availability.startDate) }} → {{ formatDateCN(availability.endDate) }}，
                计划 {{ availability.plannedDays }} 天）
              </span>
            </h2>
            <p class="card__hint">匹配规则：物种一致、房间最大体重 ≥ 宠物体重；连续可用按同一间房覆盖整个区间计算。</p>
          </div>
        </header>

        <div class="booking-list">
          <article
            v-for="item in availability.items"
            :key="item.roomTypeId"
            class="booking-item"
            :class="{ 'booking-item--unavailable': item.availableRooms === 0 }"
          >
            <div class="booking-item__main">
              <div class="booking-item__title">
                <span>{{ item.name }}</span>
                <span class="badge badge--gray">{{ speciesLabel(item.species) }}</span>
                <span v-if="item.availableRooms === 0" class="badge badge--red">暂无可连续可用房间</span>
              </div>
              <div class="booking-item__meta">
                <span>日价 <strong>{{ formatFen(item.dailyPriceFen) }}</strong>/天</span>
                <span>计划基础费 <strong>{{ formatFen(item.totalFen) }}</strong></span>
                <span>连续可用 <strong>{{ item.availableRooms }}</strong> 间</span>
              </div>
            </div>
            <div class="booking-item__side">
              <span class="booking-item__price">{{ formatFen(item.dailyPriceFen) }}</span>
              <button
                class="btn btn--primary btn--sm"
                type="button"
                :disabled="item.availableRooms === 0"
                @click="selectItem(item)"
              >
                {{ item.availableRooms === 0 ? '无法预约' : '选择并预约' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="selected" class="confirm-panel">
        <h2 class="confirm-panel__title">预约确认</h2>
        <dl class="kv">
          <dt>寄养宠物</dt>
          <dd>
            {{ selectedPet?.name }}（{{ selectedPet ? speciesLabel(selectedPet.species) : '' }} ·
            {{ selectedPet?.weight }}kg）
          </dd>
          <dt>房型</dt>
          <dd>{{ selected.name }}</dd>
          <dt>计划日期</dt>
          <dd>
            {{ formatDateCN(startDate) }} → {{ formatDateCN(endDate) }}（{{ effectivePlannedDays }} 天）
          </dd>
          <dt>锁定日价</dt>
          <dd>{{ formatFen(effectiveDailyPriceFen) }} / 天</dd>
          <dt>计划基础费</dt>
          <dd class="money">{{ formatFen(effectiveTotalFen) }}</dd>
        </dl>

        <div v-if="priceChange" class="price-change">
          <p class="price-change__title">房型价格已变化，请重新确认</p>
          <p>
            当前最新日价：<strong>{{ formatFen(priceChange.dailyPriceFen) }}</strong> / 天；
            计划 {{ priceChange.plannedDays }} 天，新总价
            <strong>{{ formatFen(priceChange.totalFen) }}</strong>。
          </p>
          <p>确认后再次提交将按新价格创建待审核预约。</p>
        </div>

        <label class="checkbox mt-12">
          <input type="checkbox" :checked="agreed" @change="handleAgreement" />
          <span>
            我已阅读并确认：延迟入住或提前接回均不减免原计划基础费；本单价格以提交时锁定的日价为准。
          </span>
        </label>

        <div class="form-actions">
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submitReservation">
            {{
              submitting
                ? '提交中…'
                : priceChange
                  ? '按新价格重新确认并提交'
                  : '确认价格并提交预约'
            }}
          </button>
          <button class="btn btn--ghost" type="button" :disabled="submitting" @click="cancelSelection">
            取消选择
          </button>
        </div>
      </section>

      <section class="card">
        <header class="card__header">
          <h2 class="card__title">房型当前日价（参考）</h2>
          <span class="card__hint">改价只影响之后提交的预约，已提交订单使用日价快照。</span>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>房型</th>
                <th>适用物种</th>
                <th>当前日价</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="roomType in roomTypes" :key="roomType.id">
                <td>{{ roomType.name }}</td>
                <td>{{ speciesLabel(roomType.species) }}</td>
                <td class="money">{{ formatFen(roomType.dailyPriceFen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
