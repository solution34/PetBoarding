import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Express } from 'express'
import { createContext } from './context.js'
import { DEFAULT_DB_PATH, WEB_DIST_DIR, type CreateAppOptions } from './config.js'
import { openDatabase, type DatabaseSync } from './db/index.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { todayShanghai } from './lib/dates.js'
import { attachSession } from './middleware/auth.js'
import { createAuthRouter } from './features/auth.js'
import { createPetsRouter } from './features/pets.js'
import { createCatalogRouter } from './features/catalog.js'
import { createReservationsRouter } from './features/reservations.js'
import { createCareTasksRouter } from './features/care.js'
import { createStaysRouter } from './features/stays.js'
import { createAdminRouter } from './features/admin.js'

export interface AppInstance {
  app: Express
  db: DatabaseSync
  todayOverride: string | null
  today: () => string
  close: () => void
}

/**
 * 创建应用实例。验收脚本直接 import 本函数，用独立数据库与 todayOverride 启动进程内服务。
 */
export function createApp(options: CreateAppOptions = {}): AppInstance {
  const dbPath = options.dbPath ?? process.env.PB_DB ?? DEFAULT_DB_PATH
  const todayOverride =
    options.todayOverride !== undefined
      ? options.todayOverride
      : process.env.PB_TODAY && process.env.PB_TODAY.trim()
        ? process.env.PB_TODAY.trim()
        : null

  const db = openDatabase(dbPath)
  const ctx = createContext(db, todayOverride)

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use(attachSession(db))

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'petboarding-v1.2-demo',
      today: ctx.today(),
      clockOverridden: todayOverride !== null
    })
  })

  app.use('/api/auth', createAuthRouter(ctx))
  app.use('/api/pets', createPetsRouter(ctx))
  app.use('/api', createCatalogRouter(ctx))
  app.use('/api/reservations', createReservationsRouter(ctx))
  app.use('/api/care-tasks', createCareTasksRouter(ctx))
  app.use('/api/stays', createStaysRouter(ctx))
  app.use('/api/admin', createAdminRouter(ctx))
  app.use('/api', notFoundHandler)

  if (options.serveWeb !== false) {
    app.use(express.static(WEB_DIST_DIR))
    app.get(/.*/, (_req, res) => {
      const indexHtml = path.join(WEB_DIST_DIR, 'index.html')
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml)
        return
      }
      res
        .status(200)
        .type('text/plain; charset=utf-8')
        .send('前端尚未构建。请先在仓库根执行 npm run build:web，或开发时运行 npm run dev:web。')
    })
  }

  app.use(errorHandler)

  return {
    app,
    db,
    todayOverride,
    today: () => todayShanghai(todayOverride),
    close: () => db.close()
  }
}
