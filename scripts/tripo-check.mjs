// 检查 Tripo 配置：npm run tripo:check
// 读 .env.local（与开发服务器同一套 loadEnv 规则），调用 GET /account/balance，不消耗积分。
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), '')
const key = env.TRIPO_API_KEY
const base = (env.TRIPO_BASE_URL || 'https://openapi.tripo3d.com/v3').replace(/\/$/, '')

if (!key) {
  console.error('未配置 TRIPO_API_KEY：在 .env.local 里填上 tsk_ 开头的 Key（说明见 .env.example）')
  process.exit(1)
}
if (!/\/v3$/.test(base)) console.warn(`  注意：TRIPO_BASE_URL=${base} 不是 v3 地址，v2 接口 2026-10-31 停用`)

const res = await fetch(`${base}/account/balance`, { headers: { Authorization: `Bearer ${key}` } }).catch((e) => {
  console.error(`连不上 ${base}：${e.message}`)
  process.exit(1)
})
const body = await res.json().catch(() => ({}))
if (!res.ok || body.code !== 0) {
  console.error(`Tripo 返回 HTTP ${res.status}${body.code !== undefined ? ` · code ${body.code}` : ''}：${body.message ?? res.statusText}`)
  if (res.status === 401 || res.status === 403) console.error('  Key 无效，或 Key 与站点不匹配（国内站 Key 用 openapi.tripo3d.com，国际站用 openapi.tripo3d.ai）')
  if (body.suggestion) console.error(`  ${body.suggestion}`)
  process.exit(1)
}
console.log(`Tripo 已连通  ${base}`)
console.log(`  生成模型 ${env.TRIPO_MODEL || '(未设置，按接口默认)'}`)
for (const [k, v] of Object.entries(body.data ?? {})) console.log(`  ${k}: ${v}`)
