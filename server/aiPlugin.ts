import { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { requestUser } from './api.ts'
import { tripoReady } from './appearance.ts'
import { HttpError, limit } from './http.ts'
import { imageFiles, myJobs } from './importJobs.ts'
import { IMPORT_WORK_DIR } from './imports.ts'
import { llmConfig } from './llm.ts'
import { cancelJob, deleteImported, publicJob, runningJobs, startJob, type JobInput } from './manualPipeline.ts'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.ts'
import { initTrends, startTrendWorker } from './trends.ts'

type Env = Record<string, string>
type Next = (err?: unknown) => void

const MAX_BODY = 80 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('图片太大，请减少页数或压缩后再试'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function extractJson(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON')
  return JSON.parse(text.slice(start, end + 1))
}

async function callModel(env: Env, images: string[], hint?: string) {
  const base = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const body = (jsonMode: boolean) => ({
    model: env.AI_MODEL || 'gpt-4o',
    temperature: 0.1,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT(hint) },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
  })
  const post = (jsonMode: boolean) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify(body(jsonMode)),
    })
  let r = await post(true)
  // 部分兼容服务不支持 response_format，去掉后重试
  if (r.status === 400) r = await post(false)
  if (!r.ok) throw new Error(`模型服务返回 ${r.status}：${(await r.text()).slice(0, 300)}`)
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content ?? ''
  return extractJson(content)
}

/**
 * /api/status、/api/analyze、/api/manual/*；登录检查在前面的 api.ts 里。线上服务器（server/main.ts）也用这一份。
 * pipeline：说明书流水线编译 / 审计 TS 源码用的 Vite 服务器（开发服务器本身，线上由 main.ts 按需起一个）；null 表示不能生成。
 */
export function createAiHandler(env: Env, pipeline: () => ViteDevServer | Promise<ViteDevServer | null> | null) {
  initTrends(env, pipeline)
  const maxJobs = Number(env.MANUAL_MAX_JOBS) || 2
  const daily = Number(env.MANUAL_DAILY_LIMIT) || 10
  const manualRoutes = async (req: IncomingMessage, res: ServerResponse, url: string) => {
    const me = requestUser(req)
    if (!me) return send(res, 401, { error: '请先登录' })
    if (url === '/api/manual/jobs' && req.method === 'POST') {
      if (!env.AI_API_KEY) return send(res, 501, { error: '服务器还没配置 AI_API_KEY' })
      const pending = pipeline()
      if (!pending) return send(res, 501, { error: '说明书生成只在开发服务器（npm run dev）和线上服务器上可用' })
      if (runningJobs(me.id)) return send(res, 429, { error: '你有一份说明书正在生成，等它完成或取消后再传下一份' })
      if (runningJobs() >= maxJobs) return send(res, 429, { error: '同时在生成的说明书太多了，过几分钟再试' })
      if (me.role !== 'admin') limit(`manual:${me.id}`, daily, 24 * 3600 * 1000, `每人每天最多生成 ${daily} 份说明书，明天再来`)
      const dev = await pending
      if (!dev) return send(res, 501, { error: '服务器上的说明书流水线没起来（日志：journalctl -u dongle）' })
      const input = JSON.parse(await readBody(req)) as JobInput
      if (!Array.isArray(input.pages) || !input.pages.length) return send(res, 400, { error: '没有页面' })
      if (input.pages.some((p) => typeof p !== 'string' || !p.startsWith('data:image/'))) return send(res, 400, { error: '页面要是图片 data URL' })
      const pageNumbers = Array.isArray(input.pageNumbers) && input.pageNumbers.length === input.pages.length && input.pageNumbers.every((n) => Number.isInteger(n) && n > 0)
        ? input.pageNumbers.slice(0, 40)
        : undefined
      const pageNotes = Array.isArray(input.pageNotes) ? input.pageNotes.slice(0, 40).map((s) => String(s ?? '').slice(0, 80)) : undefined
      // 外观流程在服务器上解 JPEG 裁图，所以照片只收 JPEG（浏览器端 compressImage 已经转好）
      const photos = Array.isArray(input.photos) ? input.photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/jpeg')).slice(0, 4) : undefined
      const job = startJob(env, dev, { ...input, pages: input.pages.slice(0, 40), texts: input.texts?.slice(0, 40), pageNumbers, pageNotes, photos, source: undefined }, me.id)
      return send(res, 200, { id: job.id })
    }
    if (url === '/api/manual/jobs' && req.method === 'GET') return send(res, 200, { jobs: myJobs(me.id) })
    const img = url.match(/^\/api\/manual\/jobs\/([\w-]+)\/(pages|photos)\/(\d+)$/)
    if (img) {
      if (!publicJob(img[1], me)) return send(res, 404, { error: 'not found' })
      const file = imageFiles(img[1], img[2] as 'pages' | 'photos')[Number(img[3]) - 1]
      if (!file) return send(res, 404, { error: 'not found' })
      res.setHeader('Content-Type', IMAGE_TYPES[extname(file)] ?? 'application/octet-stream')
      res.setHeader('Cache-Control', 'private, max-age=86400')
      return createReadStream(join(IMPORT_WORK_DIR, img[1], img[2], file)).pipe(res)
    }
    const m = url.match(/^\/api\/manual\/jobs\/([\w-]+)(\/cancel)?$/)
    if (m) {
      if (m[2] && req.method === 'POST') return send(res, 200, { ok: cancelJob(m[1], me) })
      const job = publicJob(m[1], me)
      return job ? send(res, 200, job) : send(res, 404, { error: '任务不存在' })
    }
    const d = url.match(/^\/api\/manual\/imported\/([a-z0-9-]+)$/)
    if (d && req.method === 'DELETE') return send(res, deleteImported(d[1], me) ? 200 : 404, { ok: true })
    return send(res, 404, { error: 'not found' })
  }

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = (req.url ?? '').split('?')[0]
    if (url.startsWith('/api/status')) {
      const ready = !!pipeline()
      return send(res, 200, {
        configured: !!env.AI_API_KEY,
        model: env.AI_API_KEY ? env.AI_MODEL || 'gpt-4o' : null,
        manual: ready && !!env.AI_API_KEY,
        manualModel: llmConfig(env)?.model ?? null,
        tripo: ready && tripoReady(env),
      })
    }
    if (url.startsWith('/api/manual/')) {
      try {
        return await manualRoutes(req, res, url)
      } catch (e) {
        if (e instanceof HttpError) return send(res, e.status, { error: e.message })
        return send(res, 500, { error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (!url.startsWith('/api/analyze')) return next()
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
    if (!env.AI_API_KEY) return send(res, 501, { error: '未配置 AI_API_KEY' })
    try {
      const { images, hint } = JSON.parse(await readBody(req)) as { images: string[]; hint?: string }
      if (!Array.isArray(images) || images.length === 0) return send(res, 400, { error: '没有图片' })
      const result = await callModel(env, images.slice(0, 8), hint)
      send(res, 200, { result, model: env.AI_MODEL || 'gpt-4o' })
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  }
}

export function aiPlugin(env: Env): Plugin {
  // 说明书 → 3D 流水线要在服务器里编译 / 审计 TS 源码：开发服务器直接用自己；vite preview 上不能生成（线上见 server/main.ts）
  let dev: ViteDevServer | null = null
  const handler = createAiHandler(env, () => dev)
  return {
    name: 'xiuligong-ai',
    configureServer(server) {
      dev = server
      server.middlewares.use(handler)
      // 截图、出图这些脚本起的 Vite（hmr: false）不跑热榜调度
      if (server.config.server.hmr !== false && !server.config.server.middlewareMode) startTrendWorker()
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
