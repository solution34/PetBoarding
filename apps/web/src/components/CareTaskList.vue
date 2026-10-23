<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { CareTask } from '../api/types'
import { formatDateTime } from '../utils/dates'
import { CARE_TASK_KIND_LABELS } from '../utils/format'
import StatusBadge from './StatusBadge.vue'

const props = withDefaults(
  defineProps<{
    tasks: CareTask[]
    /** 工作人员模式：待完成任务可填写记录并标记完成。 */
    editable?: boolean
    busy?: boolean
    emptyText?: string
  }>(),
  {
    editable: false,
    busy: false,
    emptyText: '暂无照护任务',
  },
)

const emit = defineEmits<{
  (event: 'complete', payload: { taskId: number; notes: string }): void
}>()

const drafts = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string>>({})

watch(
  () => props.tasks,
  (tasks) => {
    for (const task of tasks) {
      if (!(task.id in drafts)) drafts[task.id] = ''
    }
  },
  { immediate: true },
)

const kindLabel = (kind: CareTask['kind']): string => CARE_TASK_KIND_LABELS[kind] ?? kind

function complete(task: CareTask): void {
  const notes = (drafts[task.id] ?? '').trim()
  if (!notes) {
    errors[task.id] = '请填写完成记录（文字说明）'
    return
  }
  delete errors[task.id]
  emit('complete', { taskId: task.id, notes })
}
</script>

<template>
  <div v-if="tasks.length === 0" class="state-block">{{ emptyText }}</div>
  <ul v-else class="task-list">
    <li v-for="task in tasks" :key="task.id" class="task">
      <div class="task__head">
        <span class="task__title">
          <span class="badge badge--gray">{{ kindLabel(task.kind) }}</span>
          <StatusBadge kind="careTask" :value="task.status" />
        </span>
        <span class="task__time">计划时间：{{ formatDateTime(task.plannedAt) }}</span>
      </div>
      <p class="task__instruction">说明：{{ task.instruction }}</p>
      <p class="muted task__meta">
        创建人：{{ task.createdByName }} · 创建时间：{{ formatDateTime(task.createdAt) }}
      </p>

      <div v-if="task.record" class="task__record">
        <p>
          <strong>{{ task.record.staffName }}</strong>
          于 {{ formatDateTime(task.record.completedAt) }} 完成
        </p>
        <p>完成记录：{{ task.record.notes }}</p>
      </div>

      <div v-if="editable && task.status === 'pending'" class="task__complete">
        <input
          v-model="drafts[task.id]"
          class="input"
          type="text"
          maxlength="200"
          placeholder="填写完成情况（必填）"
          :disabled="busy"
        />
        <button class="btn btn--primary btn--sm" :disabled="busy" @click="complete(task)">
          标记完成
        </button>
        <p v-if="errors[task.id]" class="field__error">{{ errors[task.id] }}</p>
      </div>
    </li>
  </ul>
</template>
