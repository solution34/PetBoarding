import { createApp } from './app.js'
import { DEFAULT_DB_PATH } from './config.js'

const port = Number(process.env.PORT ?? 3000)
const instance = createApp({
  dbPath: process.env.PB_DB,
  todayOverride: process.env.PB_TODAY ?? null
})

const server = instance.app.listen(port, () => {
  const dbPath = process.env.PB_DB ?? DEFAULT_DB_PATH
  console.log(`[server] 宠物寄养预约与照护管理系统 V1.2 Demo 已启动`)
  console.log(`[server] 访问地址：http://localhost:${port}`)
  console.log(`[server] 数据库：${dbPath}`)
  console.log(
    `[server] 门店今天：${instance.today()}${instance.todayOverride ? '（演示日期覆盖 PB_TODAY）' : ''}`
  )
})

function shutdown(): void {
  server.close(() => {
    instance.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
