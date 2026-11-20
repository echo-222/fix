import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { ViteDevServer } from 'vite'
import { createAiHandler } from './aiPlugin.ts'
import { createApi } from './api.ts'
import type { Req, Res } from './http.ts'
import { closeSql } from './sql.ts'
import { startTrendWorker } from './trends.ts'

/**
 * 线上服务器：npm start（node 直接跑 TS）。接口和开发服务器同一份；
 * 顺带托管 dist/ 静态文件，线上 nginx 会直接发静态文件，只把 /api/ 和 /imported/（网页导入的说明书，按账号过滤）转过来。
 * 配置全走环境变量（systemd 的 EnvironmentFile，见 deploy/）。
 */
const env = process.env
const DIST = resolve(env.DIST_DIR || 'dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(req: Req, res: Res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end()
  }
  let path: string
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.statusCode = 400
    return res.end()
  }
  if (path.endsWith('/')) path += 'index.html'
  const file = normalize(join(DIST, path))
  const found = file.startsWith(DIST + sep) && existsSync(file) && statSync(file).isFile()
  const target = found ? file : extname(path) ? null : join(DIST, 'index.html')
  if (!target) {
    res.statusCode = 404
    return res.end('not found')
  }
  res.setHeader('Content-Type', TYPES[extname(target)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', target.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : target.endsWith('.html') ? 'no-cache' : 'public, max-age=86400')
  if (req.method === 'HEAD') return res.end()
  createReadStream(target).pipe(res)
}

/**
 * 网页导入说明书的流水线要编译 / 审计 src/ 下的 TS（ssrLoadModule）：第一次用到时起一个不监听端口的 Vite。
 * 线上要装上 devDependencies（deploy.sh 会装）；起不来就当不能生成，原因打在日志里。
 */
let pipeline: Promise<ViteDevServer | null> | null = null
let noPipeline = false
const pipelineServer = () => {
  if (noPipeline) return null
  return (pipeline ??= import('vite')
    .then(({ createServer }) => createServer({
      configFile: false,
      cacheDir: env.DONGLE_VITE_CACHE || undefined,
      logLevel: 'warn',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, watch: null },
    }))
    .catch((e) => {
      console.error('[dongle] 说明书流水线用的 Vite 起不来：', e)
      noPipeline = true
      return null
    }))
}

const api = createApi(env)
const ai = createAiHandler(env as Record<string, string>, pipelineServer)
startTrendWorker()
const server = createServer((req, res) => {
  api(req, res, () => ai(req, res, () => serveStatic(req, res)))
})

const port = Number(env.PORT || 3000)
const host = env.HOST || '127.0.0.1'
server.listen(port, host, () => console.log(`[dongle] 已启动 http://${host}:${port}（静态文件 ${DIST}）`))

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close()
    closeSql()
    process.exit(0)
  })
}
