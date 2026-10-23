import { DEFAULT_DB_PATH } from '../config.js'
import { openDatabase } from '../db/index.js'

const target = process.env.PB_DB ?? DEFAULT_DB_PATH
const db = openDatabase(target)
const pets = db.prepare('SELECT COUNT(*) AS n FROM pets').get() as { n: number }
const rooms = db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }
console.log(`[db] 数据库就绪：${target}`)
console.log(`[db] 宠物 ${Number(pets.n)} 只，房间 ${Number(rooms.n)} 间`)
db.close()
