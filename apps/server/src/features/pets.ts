import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import { nowIso } from '../lib/dates.js'
import { serializePet } from '../serialize.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { PetRow } from '../types.js'

interface PetPayload {
  name: string
  species: 'cat' | 'dog'
  weight: number
  contact: string
  careNotes: string
  vaccineNotes: string
}

function parsePetPayload(body: unknown): PetPayload {
  const input = (body ?? {}) as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) throw ApiError.validation('请填写宠物名称', 'name')

  const species = input.species
  if (species !== 'cat' && species !== 'dog') {
    throw ApiError.validation('物种只能是猫或犬', 'species')
  }

  const weight = Number(input.weight)
  if (!Number.isFinite(weight) || weight <= 0) {
    throw ApiError.validation('体重必须是大于 0 的数字', 'weight')
  }

  const contact = typeof input.contact === 'string' ? input.contact.trim() : ''
  if (!contact) throw ApiError.validation('请填写联系人', 'contact')

  const careNotes = typeof input.careNotes === 'string' ? input.careNotes.trim() : ''
  const vaccineNotes = typeof input.vaccineNotes === 'string' ? input.vaccineNotes.trim() : ''
  return { name, species, weight, contact, careNotes, vaccineNotes }
}

export function createPetsRouter(ctx: AppContext): Router {
  const router = Router()
  router.use(requireAuth, requireRole('owner'))

  router.get('/', (req, res) => {
    const rows = ctx.db
      .prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY id')
      .all(req.account!.id) as unknown as PetRow[]
    res.json({ pets: rows.map(serializePet) })
  })

  router.post('/', (req, res) => {
    const payload = parsePetPayload(req.body)
    const createdAt = nowIso()
    const info = ctx.db
      .prepare(
        `INSERT INTO pets (owner_id, name, species, weight, contact, care_notes, vaccine_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.account!.id,
        payload.name,
        payload.species,
        payload.weight,
        payload.contact,
        payload.careNotes,
        payload.vaccineNotes,
        createdAt
      )
    const row = ctx.db.prepare('SELECT * FROM pets WHERE id = ?').get(Number(info.lastInsertRowid)) as
      | PetRow
      | undefined
    res.status(201).json({ pet: serializePet(row!) })
  })

  router.put('/:id', (req, res) => {
    const petId = Number(req.params.id)
    if (!Number.isInteger(petId)) throw ApiError.validation('宠物编号不合法')
    const row = ctx.db.prepare('SELECT * FROM pets WHERE id = ?').get(petId) as PetRow | undefined
    if (!row) throw ApiError.notFound('宠物不存在')
    if (row.owner_id !== req.account!.id) throw ApiError.forbidden('只能修改本人的宠物档案')

    const payload = parsePetPayload(req.body)
    ctx.db
      .prepare(
        `UPDATE pets SET name = ?, species = ?, weight = ?, contact = ?, care_notes = ?, vaccine_notes = ?
         WHERE id = ?`
      )
      .run(
        payload.name,
        payload.species,
        payload.weight,
        payload.contact,
        payload.careNotes,
        payload.vaccineNotes,
        petId
      )
    const updated = ctx.db.prepare('SELECT * FROM pets WHERE id = ?').get(petId) as unknown as PetRow
    res.json({ pet: serializePet(updated) })
  })

  return router
}
