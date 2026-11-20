import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TLSSocket } from 'node:tls'

export type Req = IncomingMessage
export type Res = ServerResponse
export type Next = (err?: unknown) => void
export type Env = Record<string, string | undefined>

/** 路由里直接 throw，统一在 api.ts 里转成 { error } */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function readBody(req: Req, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        reject(new HttpError(413, '内容太大'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function readJson<T>(req: Req, max = 64 * 1024): Promise<T> {
  const text = await readBody(req, max)
  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new HttpError(400, '请求格式不对')
  }
}

export function send(res: Res, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function cookies(req: Req): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** 线上在 nginx 后面：只有从本机转发来的请求才信 X-Forwarded-* */
const fromProxy = (req: Req) => /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress ?? '')

export const isHttps = (req: Req) =>
  !!(req.socket as TLSSocket).encrypted || (fromProxy(req) && req.headers['x-forwarded-proto'] === 'https')

/** 站点挂在子路径下时 nginx 带 X-Forwarded-Prefix（如 /dongle）：cookie 只发给这个路径，不给同域名下的别的站 */
function cookiePath(req: Req) {
  const prefix = fromProxy(req) ? req.headers['x-forwarded-prefix'] : undefined
  return typeof prefix === 'string' && /^(\/[\w-]+)+$/.test(prefix) ? prefix : '/'
}

export function setCookie(req: Req, res: Res, name: string, value: string, maxAgeSec: number) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath(req)}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (isHttps(req)) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clientIp(req: Req): string {
  if (fromProxy(req)) {
    const fwd = req.headers['x-real-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]
    if (typeof fwd === 'string' && fwd.trim()) return fwd.trim()
  }
  return (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
}

export const userAgent = (req: Req) => String(req.headers['user-agent'] ?? '').slice(0, 300)

/** 简单的固定窗口限流（单进程，重启清零），超了就 429 */
const buckets = new Map<string, { n: number; reset: number }>()
export function limit(key: string, max: number, windowMs: number, message = '操作太频繁，请稍后再试') {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs })
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k)
    return
  }
  if (++b.n > max) throw new HttpError(429, message)
}
