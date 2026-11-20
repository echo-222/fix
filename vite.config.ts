import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { aiPlugin } from './server/aiPlugin.ts'
import { apiPlugin } from './server/api.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // 线上挂在子路径下：deploy.sh 用 BASE_PATH=/dongle/ 打包（前端地址都经过 src/base.ts 的 withBase）
    base: env.BASE_PATH || '/',
    // 线上服务器的 node_modules 是只读的：截图脚本起的 Vite 把预构建缓存放到 DONGLE_VITE_CACHE（见 deploy/dongle.service）
    cacheDir: env.DONGLE_VITE_CACHE || undefined,
    // apiPlugin 在前：它先做登录检查，再把 /api/status、/api/analyze、/api/manual/* 交给 aiPlugin
    plugins: [react(), apiPlugin(env), aiPlugin(env)],
  }
})
