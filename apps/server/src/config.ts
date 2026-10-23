import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（src 与 dist 都在 apps/server 下，向上三级）。 */
export const REPO_ROOT = path.resolve(here, '../../..')
export const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'data', 'petboarding.db')
export const WEB_DIST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'dist')
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

export interface CreateAppOptions {
  /** SQLite 数据库文件路径；默认仓库根 data/petboarding.db。 */
  dbPath?: string
  /** 演示/测试用固定“今天”（YYYY-MM-DD）；默认读取 PB_TODAY 环境变量，未设置则用真实门店日期。 */
  todayOverride?: string | null
  /** 是否托管前端打包产物；默认 true。 */
  serveWeb?: boolean
}
