import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { aiPlugin } from './server/aiPlugin.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), aiPlugin(env)],
  }
})
