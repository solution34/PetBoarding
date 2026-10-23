<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { Pet, Species } from '../../api/types'
import { createPet, listPets, updatePet } from '../../api'
import { useFeedback } from '../../composables/useFeedback'
import { getErrorField } from '../../utils/errors'
import { formatWeight, speciesLabel } from '../../utils/format'

interface PetForm {
  name: string
  species: Species
  weight: string
  contact: string
  careNotes: string
  vaccineNotes: string
}

const pets = ref<Pet[]>([])
const loading = ref(true)
const saving = ref(false)
const showForm = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<PetForm>({
  name: '',
  species: 'cat',
  weight: '',
  contact: '',
  careNotes: '',
  vaccineNotes: '',
})
const fieldErrors = reactive<Record<string, string>>({})
const { error, notice, clear, fail, ok } = useFeedback()

function resetFieldErrors(): void {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
}

function resetForm(): void {
  form.name = ''
  form.species = 'cat'
  form.weight = ''
  form.contact = ''
  form.careNotes = ''
  form.vaccineNotes = ''
  resetFieldErrors()
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await listPets()
    pets.value = response.pets
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

function startCreate(): void {
  clear()
  editingId.value = null
  resetForm()
  showForm.value = true
}

function startEdit(pet: Pet): void {
  clear()
  editingId.value = pet.id
  form.name = pet.name
  form.species = pet.species
  form.weight = String(pet.weight)
  form.contact = pet.contact
  form.careNotes = pet.careNotes
  form.vaccineNotes = pet.vaccineNotes
  resetFieldErrors()
  showForm.value = true
}

function cancelForm(): void {
  showForm.value = false
  editingId.value = null
  resetForm()
}

function validate(): boolean {
  resetFieldErrors()
  if (!form.name.trim()) fieldErrors.name = '请填写宠物名称'
  if (form.species !== 'cat' && form.species !== 'dog') fieldErrors.species = '请选择物种'
  const weight = Number(form.weight)
  if (!form.weight.trim() || !Number.isFinite(weight) || weight <= 0) {
    fieldErrors.weight = '体重必须是大于 0 的数字'
  }
  if (!form.contact.trim()) fieldErrors.contact = '请填写联系人方式'
  return Object.keys(fieldErrors).length === 0
}

async function submit(): Promise<void> {
  clear()
  if (!validate()) return
  saving.value = true
  const payload = {
    name: form.name.trim(),
    species: form.species,
    weight: Number(form.weight),
    contact: form.contact.trim(),
    careNotes: form.careNotes.trim(),
    vaccineNotes: form.vaccineNotes.trim(),
  }
  try {
    if (editingId.value !== null) {
      await updatePet(editingId.value, payload)
      ok('宠物档案已更新')
    } else {
      const response = await createPet(payload)
      ok(`宠物「${response.pet.name}」档案已创建`)
    }
    showForm.value = false
    editingId.value = null
    resetForm()
    await load()
  } catch (cause) {
    const field = getErrorField(cause)
    if (field) {
      fieldErrors[field] = cause instanceof Error ? cause.message : '字段校验失败'
    } else {
      fail(cause)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">宠物档案</h1>
        <p class="page__subtitle">
          维护本人宠物的名称、物种、体重、联系人及照护/疫苗备注。预约时将按物种与体重匹配房型。
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--primary" type="button" @click="startCreate">新增宠物</button>
      </div>
    </header>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <section v-if="showForm" class="card">
      <header class="card__header">
        <h2 class="card__title">{{ editingId === null ? '新增宠物' : `编辑宠物 #${editingId}` }}</h2>
        <button class="btn btn--ghost btn--sm" type="button" @click="cancelForm">收起</button>
      </header>
      <form class="stack" @submit.prevent="submit">
        <div class="form-grid">
          <label class="field">
            <span class="field__label">宠物名称<span class="required">*</span></span>
            <input v-model="form.name" class="input" type="text" placeholder="例如：咪咪" />
            <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name }}</span>
          </label>
          <label class="field">
            <span class="field__label">物种<span class="required">*</span></span>
            <select v-model="form.species" class="select">
              <option value="cat">猫</option>
              <option value="dog">犬</option>
            </select>
            <span v-if="fieldErrors.species" class="field__error">{{ fieldErrors.species }}</span>
          </label>
          <label class="field">
            <span class="field__label">体重（kg）<span class="required">*</span></span>
            <input
              v-model="form.weight"
              class="input"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="例如：4.2"
            />
            <span v-if="fieldErrors.weight" class="field__error">{{ fieldErrors.weight }}</span>
          </label>
          <label class="field">
            <span class="field__label">联系人方式<span class="required">*</span></span>
            <input v-model="form.contact" class="input" type="text" placeholder="手机号或联系方式" />
            <span v-if="fieldErrors.contact" class="field__error">{{ fieldErrors.contact }}</span>
          </label>
          <label class="field field--full">
            <span class="field__label">照护备注</span>
            <textarea
              v-model="form.careNotes"
              class="textarea"
              placeholder="例如：怕生，需轻声安抚；每日喂食两次"
            ></textarea>
          </label>
          <label class="field field--full">
            <span class="field__label">疫苗说明</span>
            <textarea
              v-model="form.vaccineNotes"
              class="textarea"
              placeholder="例如：猫三联已接种"
            ></textarea>
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn--primary" type="submit" :disabled="saving">
            {{ saving ? '保存中…' : '保存档案' }}
          </button>
          <button class="btn btn--ghost" type="button" :disabled="saving" @click="cancelForm">
            取消
          </button>
        </div>
      </form>
    </section>

    <div v-if="loading" class="state-block">宠物档案加载中…</div>
    <div v-else-if="pets.length === 0" class="card state-block">
      还没有宠物档案，点击右上角「新增宠物」创建第一份档案。
    </div>
    <div v-else class="pet-grid">
      <article v-for="pet in pets" :key="pet.id" class="card pet-card">
        <header class="pet-card__head">
          <div>
            <h2 class="pet-card__name">{{ pet.name }}</h2>
            <p class="muted">
              {{ speciesLabel(pet.species) }} · {{ formatWeight(pet.weight) }}
            </p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" @click="startEdit(pet)">
            编辑
          </button>
        </header>
        <dl class="kv">
          <dt>联系人</dt>
          <dd>{{ pet.contact }}</dd>
        </dl>
        <div class="pet-card__notes">
          <p><span class="label">照护备注：</span>{{ pet.careNotes || '无' }}</p>
          <p><span class="label">疫苗说明：</span>{{ pet.vaccineNotes || '无' }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
