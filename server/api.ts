import type { Plugin } from 'vite'
import { adminRoutes } from './admin.ts'
import { SCRIPT_USER, authRoutes, promoteAdmins, sessionUser, type Me } from './auth.ts'
import { communityRoutes } from './community.ts'
import { HttpError, send, type Env, type Next, type Req, type Res } from './http.ts'
import { importedRoutes } from './imports.ts'
import { sql } from './sql.ts'
import { hotList } from './trends.ts'

/**
 * 所有 /api/* 的入口：开发服务器（下面的 Vite 插件）和线上服务器（server/main.ts）用同一份。
 * /api/auth/* 不用登录；其余都要登录，/api/admin/* 还要是管理员。/api/trends 是广场排序用的热度（trends.ts）。
 * /api/status、/api/analyze、/api/manual/* 过了登录检查交给 aiPlugin 的处理函数（登录的人用 requestUser 取）。
 * /imported/*（网页导入的说明书）也在这里：按账号过滤，见 imports.ts。
 */
const AI_ROUTE = /^\/api\/(status|analyze|manual\/)/

const users = new WeakMap<Req, Me>()
/** 交给 aiPlugin 的请求是谁发的 */
export const requestUser = (req: Req) => users.get(req) ?? null

/** POST 只接受同源请求（cookie 已经是 SameSite=Lax，这里再挡一层） */
function sameOrigin(req: Req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * 微信、飞书的内置浏览器有时把页面当成跨域，不给 Access-Control-Allow-Origin 就把响应丢掉，
 * 前端只能看到 Load failed。来源和 Host 一致时才回写自己的源。
 */
function cors(req: Req, res: Res) {
  const origin = req.headers.origin
  if (!origin || !sameOrigin(req)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
}

export function createApi(env: Env, opts: { bypass?: boolean } = {}) {
  sql()
  promoteAdmins(env)
  return async (req: Req, res: Res, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/') && !path.startsWith('/imported/')) return next()
    try {
      cors(req, res)
      if (req.method === 'OPTIONS') {
        if (!sameOrigin(req)) throw new HttpError(403, '请求来源不对')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        res.setHeader('Access-Control-Max-Age', '86400')
        res.statusCode = 204
        return res.end()
      }
      if (path.startsWith('/imported/')) return importedRoutes(req, res, path, opts.bypass ? SCRIPT_USER : sessionUser(req))
      if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) throw new HttpError(403, '请求来源不对')
      const me = opts.bypass ? SCRIPT_USER : sessionUser(req)
      if (path.startsWith('/api/auth/')) return await authRoutes(req, res, path, env, me)
      if (!me) return send(res, 401, { error: '请先登录' })
      if (path.startsWith('/api/admin/')) {
        if (me.role !== 'admin') return send(res, 403, { error: '只有管理员能进后台' })
        return await adminRoutes(req, res, url, env, me)
      }
      if (path === '/api/community' || path.startsWith('/api/community/') || path === '/api/track') return await communityRoutes(req, res, path, me)
      if (path === '/api/trends' && req.method === 'GET') return send(res, 200, hotList())
      if (AI_ROUTE.test(path)) {
        users.set(req, me)
        return next()
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message })
      console.error('[dongle]', e)
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  }
}

/** 开发 / 预览服务器上挂接口。截图脚本起的开发服务器设 DONGLE_AUTH_BYPASS=1，不用登录（只能看，不能写） */
export function apiPlugin(env: Env): Plugin {
  let handler: ReturnType<typeof createApi> | null = null
  const use = (req: Req, res: Res, next: Next) => (handler ??= createApi(env, { bypass: process.env.DONGLE_AUTH_BYPASS === '1' }))(req, res, next)
  return {
    name: 'dongle-api',
    configureServer(server) {
      server.middlewares.use(use)
    },
    configurePreviewServer(server) {
      server.middlewares.use(use)
    },
  }
}
