// 按清单调用 Tripo v3 生成 / 后处理模型：npm run tripo -- <manual-id> [--only a,b] [--force] [--dry] [--dir <清单目录>] [--out <成品目录>]
// --dir / --out 缺省是 models/<id>/ 和 public/models/<id>/（网页导入流水线用别的目录）。
// 清单 models/<id>/tripo.json：{ "jobs": [{ "name": "gpu", "steps": [{ "type": "text-to-model", "prompt": "…" }, { "type": "decimate", "face_limit": 6000 }] }] }
// 同一个 job 的 steps 依次执行，后一步的 input 自动取上一步的 task_id；image-to-model 可写 "image": "models/<id>/refs/x.jpg"，脚本先上传；
// multiview-to-model 写 "images": { "front": "…", "left": "…", "back": "…", "right": "…" }（front 必填，至少两张，几张图的比例要一致）。
// "optimize" 是本地步骤（不调 API、不扣费）：gltf-transform 简化网格 + 贴图压成 WebP，
//   { "type": "optimize", "ratio": 0.03, "error": 0.001, "texture_size": 1024 }。细节多的模型别用 Tripo 的 decimate（会把薄壳整片吃掉）。
// 结果链接 5 分钟过期，所以每步成功立刻下载：中间结果 → models/<id>/raw/，最后一步 → public/models/<id>/<name>.glb。
// task_id、实际扣费、耗时写进 models/<id>/tripo.log.json；已完成的 job 默认跳过（--force 重跑）。
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadEnv } from 'vite'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const id = args.find((a, i) => !a.startsWith('--') && !['--only', '--dir', '--out'].includes(args[i - 1]))
if (!id) {
  console.log('用法：npm run tripo -- <manual-id> [--only a,b] [--force] [--dry] [--dir <清单目录>] [--out <成品目录>]')
  process.exit(1)
}
const only = flag('--only')?.split(',')
const force = args.includes('--force')
const dry = args.includes('--dry')

const env = loadEnv('development', process.cwd(), '')
const KEY = env.TRIPO_API_KEY
const BASE = (env.TRIPO_BASE_URL || 'https://openapi.tripo3d.com/v3').replace(/\/$/, '')
const MODEL = env.TRIPO_MODEL || 'v3.1-20260211'
if (!KEY && !dry) {
  console.error('未配置 TRIPO_API_KEY（见 .env.example），先跑 npm run tripo:check')
  process.exit(1)
}

const ROUTES = {
  'text-to-model': '/generation/text-to-model',
  'image-to-model': '/generation/image-to-model',
  'multiview-to-model': '/generation/multiview-to-model',
  segment: '/mesh/segment',
  complete: '/mesh/complete',
  decimate: '/mesh/decimate',
  texture: '/models/texture',
  convert: '/models/convert',
}
const GENERATION = new Set(['text-to-model', 'image-to-model', 'multiview-to-model'])
const POLL_MS = 3000
const TIMEOUT_MS = 20 * 60 * 1000
const CONCURRENCY = 4

const srcDir = flag('--dir') ?? join('models', id)
const rawDir = join(srcDir, 'raw')
const outDir = flag('--out') ?? join('public', 'models', id)
const listPath = join(srcDir, 'tripo.json')
const logPath = join(srcDir, 'tripo.log.json')
if (!existsSync(listPath)) {
  console.error(`找不到 ${listPath}`)
  process.exit(1)
}
const { jobs } = JSON.parse(readFileSync(listPath, 'utf8'))
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {}
const saveLog = () => writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n')
mkdirSync(rawDir, { recursive: true })
mkdirSync(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      // 断网只重试查询；POST 重发可能重复建任务、重复扣费
      if (method !== 'GET' || attempt >= 6) throw e
      await sleep(2 ** attempt * 1000)
      continue
    }
    if (res.status === 429 && attempt < 6) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt
      await sleep(wait * 1000)
      continue
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.code !== 0) throw new Error(`${method} ${path} → HTTP ${res.status} code ${json.code ?? '?'}：${json.message ?? res.statusText}${json.suggestion ? `（${json.suggestion}）` : ''}`)
    return json.data
  }
}

async function upload(path) {
  const form = new FormData()
  form.append('file', new Blob([readFileSync(path)]), basename(path))
  return (await api('POST', '/files', form)).file_token
}

async function download(url, path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}：${path}`)
      writeFileSync(path, Buffer.from(await res.arrayBuffer()))
      return
    } catch (e) {
      if (attempt >= 3) throw e
      await sleep(2 ** attempt * 1000)
    }
  }
}

function optimize(src, out, { ratio = 0.03, error = 0.001, texture_size = 1024 } = {}) {
  execFileSync('npx', [
    '-y', '@gltf-transform/cli@4', 'optimize', src, out,
    '--compress', 'false', '--texture-compress', 'webp', '--texture-size', String(texture_size),
    '--simplify-ratio', String(ratio), '--simplify-error', String(error),
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
}

async function wait(taskId, tag) {
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < TIMEOUT_MS) {
    const task = await api('GET', `/tasks/${taskId}`)
    const line = `${task.status} ${task.progress ?? 0}%`
    if (line !== last) console.log(`  ${tag}  ${line}`)
    last = line
    if (task.status === 'success') return task
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(task.status)) {
      throw new Error(`${tag} ${task.status}${task.error_code ? ` · ${task.error_code}` : ''}${task.error_message ? `：${task.error_message}` : ''}（${taskId}）`)
    }
    await sleep(POLL_MS)
  }
  throw new Error(`${tag} 超时（${taskId}）`)
}

async function runJob(job) {
  // 上次提交后中断（断网、Ctrl+C）的步骤：接着轮询原任务，不重新提交
  const pending = force ? null : log[job.name]?.pending
  // 上次在后面的步骤失败（例如本地 optimize 出错）：已经生成、文件还在的步骤直接沿用，不重复扣费
  const earlier = force || log[job.name]?.done ? [] : (log[job.name]?.steps ?? [])
  const entry = { steps: [], started: new Date().toISOString() }
  let prev
  for (const [i, step] of job.steps.entries()) {
    const { type, image, images, ...params } = step
    if (type === 'optimize') {
      const src = entry.steps.at(-1)?.file
      const file = join(rawDir, `${job.name}-${i + 1}-optimize.glb`)
      if (dry) {
        console.log(`  ${job.name} #${i + 1} optimize  本地 gltf-transform ${JSON.stringify(params)}`)
        continue
      }
      if (!src) throw new Error(`${job.name}：optimize 前面没有模型`)
      const t0 = Date.now()
      optimize(src, file, params)
      console.log(`  ${job.name} #${i + 1} optimize  ${(Date.now() - t0) / 1000 | 0} 秒 → ${file}`)
      entry.steps.push({ type, credits: 0, seconds: Math.round((Date.now() - t0) / 1000), body: params, file })
      log[job.name] = entry
      saveLog()
      continue
    }
    const route = ROUTES[type]
    if (!route) throw new Error(`${job.name}：未知步骤 ${type}`)
    const tag = `${job.name} #${i + 1} ${type}`
    const resume = !dry && pending?.step === i ? pending : null
    const kept = earlier[i]
    if (!resume && kept?.type === type && kept.task_id && kept.file && existsSync(kept.file)) {
      console.log(`  ${tag}  沿用上次的结果 ${kept.task_id}`)
      entry.steps.push(kept)
      prev = kept.task_id
      continue
    }
    if (!resume && pending && pending.step > i && log[job.name].steps?.[i]?.task_id) {
      entry.steps.push(log[job.name].steps[i])
      prev = log[job.name].steps[i].task_id
      continue
    }
    const body = { ...params }
    if (GENERATION.has(type)) body.model ??= MODEL
    if (!resume && image) body.input = dry ? `<上传 ${image}>` : await upload(image)
    else if (!resume && images) {
      if (!images.front) throw new Error(`${job.name}：multiview 必须有 front`)
      body.inputs = []
      for (const [view, path] of Object.entries(images)) body.inputs.push({ [view]: dry ? `<上传 ${path}>` : await upload(path) })
    } else if (!GENERATION.has(type)) body.input ??= prev
    if (dry) {
      console.log(`  ${tag}  POST ${route} ${JSON.stringify(body)}`)
      prev = `<${tag}>`
      continue
    }
    const t0 = resume ? Date.parse(resume.at) : Date.now()
    const task_id = resume ? resume.task_id : (await api('POST', route, body)).task_id
    console.log(`  ${tag}  ${resume ? '接着等' : '已提交'} ${task_id}`)
    log[job.name] = { ...entry, pending: { step: i, task_id, at: new Date(t0).toISOString() } }
    saveLog()
    const task = await wait(task_id, tag)
    const out = task.output ?? {}
    const url = out.model_url ?? out.pbr_model ?? out.model
    const file = join(rawDir, `${job.name}-${i + 1}-${type}.glb`)
    if (url) await download(url, file)
    const preview = out.rendered_image_url ?? out.rendered_image
    if (preview) await download(preview, join(rawDir, `${job.name}-${i + 1}-${type}.${preview.split('?')[0].split('.').pop() || 'png'}`)).catch(() => {})
    entry.steps.push({ type, task_id, credits: task.credits_consumed ?? task.consumed_credit ?? null, seconds: Math.round((Date.now() - t0) / 1000), body, file: url ? file : null })
    prev = task_id
    log[job.name] = entry
    saveLog()
  }
  if (dry) return
  const last = entry.steps.at(-1)
  if (!last?.file) throw new Error(`${job.name}：最后一步没有返回模型`)
  const final = join(outDir, `${job.name}.glb`)
  copyFileSync(last.file, final)
  entry.file = final
  entry.credits = entry.steps.reduce((n, s) => n + (Number(s.credits) || 0), 0)
  entry.done = true
  entry.finished = new Date().toISOString()
  saveLog()
  console.log(`  ${job.name}  完成 → ${final}  共 ${entry.credits} 积分`)
}

const todo = jobs.filter((j) => (!only || only.includes(j.name)) && (force || dry || !log[j.name]?.done || !existsSync(join(outDir, `${j.name}.glb`))))
console.log(`Tripo ${BASE} · ${MODEL} · ${todo.length} 个任务${dry ? '（只打印请求）' : ''}`)
const failures = []
const queue = [...todo]
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      await runJob(job)
    } catch (e) {
      failures.push(job.name)
      log[job.name] = { ...log[job.name], done: false, error: e.message }
      saveLog()
      console.error(`  ${job.name}  失败：${e.message}`)
    }
  }
}))
if (!dry) {
  const total = Object.values(log).reduce((n, e) => n + (Number(e.credits) || 0), 0)
  console.log(`清单累计扣费 ${total} 积分 · 日志 ${logPath}`)
}
process.exit(failures.length ? 1 : 0)
