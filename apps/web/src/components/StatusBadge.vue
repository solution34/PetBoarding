<script setup lang="ts">
import { computed } from 'vue'
import type { CareTaskStatus, ReservationStatus } from '../api/types'
import {
  CARE_TASK_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  careTaskTone,
  reservationTone,
} from '../utils/format'
import type { StatusTone } from '../utils/format'

const props = defineProps<{
  kind: 'reservation' | 'careTask'
  value: ReservationStatus | CareTaskStatus
}>()

const label = computed(() =>
  props.kind === 'reservation'
    ? RESERVATION_STATUS_LABELS[props.value as ReservationStatus]
    : CARE_TASK_STATUS_LABELS[props.value as CareTaskStatus],
)

const tone = computed<StatusTone>(() =>
  props.kind === 'reservation'
    ? reservationTone(props.value as ReservationStatus)
    : careTaskTone(props.value as CareTaskStatus),
)
</script>

<template>
  <span class="badge" :class="`badge--${tone}`">{{ label }}</span>
</template>
