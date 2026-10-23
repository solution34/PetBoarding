import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { bootstrap } from './stores/session'
import { refreshToday } from './stores/clock'
import './styles.css'

async function start(): Promise<void> {
  const app = createApp(App)
  app.use(router)

  // 启动时恢复会话（GET /api/auth/me），失败视为未登录。
  await bootstrap()
  void refreshToday(true)
  await router.isReady()
  app.mount('#app')
}

void start()
