import type { DatabaseSync } from 'node:sqlite'
import { hashPassword } from '../lib/passwords.js'
import { nowIso } from '../lib/dates.js'

interface SeedAccount {
  displayName: string
  loginName: string
  password: string
  roles: string[]
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { displayName: '王小明（主人A）', loginName: 'ownerA', password: 'owner123', roles: ['owner'] },
  { displayName: '李小红（主人B）', loginName: 'ownerB', password: 'owner123', roles: ['owner'] },
  { displayName: '张店长（工作人员）', loginName: 'staff', password: 'staff123', roles: ['staff'] },
  { displayName: '赵管理（管理员）', loginName: 'admin', password: 'admin123', roles: ['admin'] }
]

interface SeedPet {
  ownerLogin: string
  name: string
  species: 'cat' | 'dog'
  weight: number
  contact: string
  careNotes: string
  vaccineNotes: string
}

const SEED_PETS: SeedPet[] = [
  {
    ownerLogin: 'ownerA',
    name: '咪咪',
    species: 'cat',
    weight: 4.2,
    contact: '13800000001',
    careNotes: '怕生，需轻声安抚；每日喂食两次，早晚各半袋猫粮。',
    vaccineNotes: '猫三联已接种；2026年9月已体内驱虫。'
  },
  {
    ownerLogin: 'ownerA',
    name: '旺财',
    species: 'dog',
    weight: 18,
    contact: '13800000002',
    careNotes: '每日早晚各遛放一次；进食较快，请使用慢食碗。',
    vaccineNotes: '狂犬疫苗已接种；2026年8月已体外驱虫。'
  },
  {
    ownerLogin: 'ownerB',
    name: '球球',
    species: 'dog',
    weight: 30,
    contact: '13800000003',
    careNotes: '性格活泼，需单独活动避免与其他犬只冲突。',
    vaccineNotes: '狂犬疫苗已接种。'
  },
  {
    ownerLogin: 'ownerB',
    name: '糖糖',
    species: 'cat',
    weight: 3.8,
    contact: '13800000003',
    careNotes: '有轻微应激，换环境需安静角落；罐头需拌温水。',
    vaccineNotes: '猫三联已接种。'
  }
]

interface SeedRoomType {
  name: string
  species: 'cat' | 'dog'
  dailyPriceFen: number
  rooms: Array<{ name: string; maxWeight: number }>
}

const SEED_ROOM_TYPES: SeedRoomType[] = [
  {
    name: '猫舍标间',
    species: 'cat',
    dailyPriceFen: 8000,
    rooms: [
      { name: 'C101', maxWeight: 6 },
      { name: 'C102', maxWeight: 6 }
    ]
  },
  {
    name: '猫舍豪华间',
    species: 'cat',
    dailyPriceFen: 12000,
    rooms: [
      { name: 'C201', maxWeight: 8 },
      { name: 'C202', maxWeight: 8 }
    ]
  },
  {
    name: '犬舍标间',
    species: 'dog',
    dailyPriceFen: 10000,
    rooms: [
      { name: 'D101', maxWeight: 25 },
      { name: 'D102', maxWeight: 25 }
    ]
  },
  {
    name: '犬舍豪华间',
    species: 'dog',
    dailyPriceFen: 15000,
    rooms: [
      { name: 'D201', maxWeight: 40 },
      { name: 'D202', maxWeight: 40 }
    ]
  }
]

export function seedDatabase(db: DatabaseSync): void {
  const createdAt = nowIso()
  const insertAccount = db.prepare(
    'INSERT INTO accounts (display_name, login_name, password_hash, roles, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const account of SEED_ACCOUNTS) {
    insertAccount.run(
      account.displayName,
      account.loginName,
      hashPassword(account.password),
      JSON.stringify(account.roles),
      createdAt
    )
  }

  const findAccount = db.prepare('SELECT id FROM accounts WHERE login_name = ?')
  const insertPet = db.prepare(
    `INSERT INTO pets (owner_id, name, species, weight, contact, care_notes, vaccine_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const pet of SEED_PETS) {
    const owner = findAccount.get(pet.ownerLogin) as { id: number } | undefined
    if (!owner) continue
    insertPet.run(
      owner.id,
      pet.name,
      pet.species,
      pet.weight,
      pet.contact,
      pet.careNotes,
      pet.vaccineNotes,
      createdAt
    )
  }

  const insertRoomType = db.prepare(
    'INSERT INTO room_types (name, species, daily_price_fen) VALUES (?, ?, ?)'
  )
  const insertRoom = db.prepare(
    'INSERT INTO rooms (room_type_id, name, max_weight) VALUES (?, ?, ?)'
  )
  const findRoomType = db.prepare('SELECT id FROM room_types WHERE name = ?')
  for (const roomType of SEED_ROOM_TYPES) {
    insertRoomType.run(roomType.name, roomType.species, roomType.dailyPriceFen)
    const saved = findRoomType.get(roomType.name) as { id: number } | undefined
    if (!saved) continue
    for (const room of roomType.rooms) {
      insertRoom.run(saved.id, room.name, room.maxWeight)
    }
  }

  console.log('[db] 已写入演示种子数据：账号4个、宠物4只、房型4类、房间8间')
}
