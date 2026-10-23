import fs from 'node:fs'
import { DEFAULT_DB_PATH } from '../config.js'
import { openDatabase } from '../db/index.js'

const target = process.env.PB_DB ?? DEFAULT_DB_PATH

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${target}${suffix}`
  if (fs.existsSync(file)) {
    fs.rmSync(file)
    console.log(`[db] 已删除 ${file}`)
  }
}

const db = openDatabase(target)
const accounts = db.prepare('SELECT login_name, roles FROM accounts ORDER BY id').all() as unknown as Array<{
  login_name: string
  roles: string
}>
const pets = db.prepare('SELECT COUNT(*) AS n FROM pets').get() as { n: number }
const rooms = db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }
console.log(`[db] 已重建数据库：${target}`)
console.log(`[db] 账号：${accounts.map((row) => `${row.login_name}(${row.roles})`).join('、')}`)
console.log(`[db] 宠物 ${Number(pets.n)} 只，房间 ${Number(rooms.n)} 间`)
db.close()
