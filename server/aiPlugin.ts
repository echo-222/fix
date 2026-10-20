import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.ts'

type Env = Record<string, string>
type Next = (err?: unknown) => void

const MAX_BODY = 25 * 1024 * 1024

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

export function aiPlugin(env: Env): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = req.url ?? ''
    if (url.startsWith('/api/status')) {
      return send(res, 200, { configured: !!env.AI_API_KEY, model: env.AI_API_KEY ? env.AI_MODEL || 'gpt-4o' : null })
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
  return {
    name: 'xiuligong-ai',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
