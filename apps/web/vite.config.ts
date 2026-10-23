import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发时 Vite 代理 /api 到 Express；演示部署时由 Express 直接提供打包后的文件。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900
  }
})
