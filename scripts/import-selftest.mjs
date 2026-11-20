// 网页导入的端到端自测：npm run import:selftest
// 起假模型（scripts/mock-llm.mjs，不花钱）和一个线上服务器（server/main.ts，临时数据目录），注册一个管理员、一个普通用户，
// 普通用户上传一页资料，等流水线跑完（分流 → 转写 → 写脚本 → 审计修复 → 保存 → 截图复核），检查分流和提示词选对了 skill，
// 再检查生成的说明书存进了 IMPORT_DIR、截图复核真的截到了图、没发布时别人看不到。
// 线上服务器上也能跑（检查 Chrome、只读的代码目录、Vite 缓存这些线上才有的环境），见 README「网页导入说明书」。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ADMIN = 'boss@example.com'
let failed = 0
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`)
  if (!cond) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function start(args, env, ready) {
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const p = { proc, log: '' }
  proc.stdout.on('data', (d) => (p.log += d))
  proc.stderr.on('data', (d) => (p.log += d))
  p.ready = (async () => {
    for (let i = 0; i < 300 && !p.log.includes(ready); i++) {
      if (proc.exitCode !== null) break
      await sleep(100)
    }
    if (!p.log.includes(ready)) throw new Error(`${args[0]} 没起来：\n${p.log}`)
  })()
  p.stop = () => proc.exitCode === null && new Promise((r) => (proc.once('exit', r), proc.kill()))
  return p
}

const dir = mkdtempSync(join(tmpdir(), 'dongle-import-'))
const llmPort = 5300 + Math.floor(Math.random() * 90)
const port = 3900 + Math.floor(Math.random() * 90)
const env = {
  PORT: String(port), DATA_DIR: dir, IMPORT_DIR: join(dir, 'imported'), IMPORT_WORK_DIR: join(dir, 'work'),
  ADMIN_EMAILS: ADMIN, NODE_ENV: 'production', SMTP_HOST: '', EMAIL_VERIFY: '', TRIPO_API_KEY: '',
  AI_BASE_URL: `http://127.0.0.1:${llmPort}/v1`, AI_API_KEY: 'mock', AI_MODEL: 'mock', AI_MANUAL_MODEL: 'mock-skill',
}
// 分流：默认回放路由器说明书，走 manual-to-3d。换链路：
//   SELFTEST_MANUAL=origami-cup（折纸，自动取景）/ popup-vfold / physics-newton-cradle / mech-gear-train：按 id 前缀分流
//   MOCK_ROUTE=free：强制自由生成（freeform-3d）；MOCK_CONFIDENCE=0.2：专门链路把握太低，服务器应改走自由生成
const MANUAL = process.env.SELFTEST_MANUAL
const PREFIX = { 'origami-': 'origami', 'popup-': 'popup', 'physics-': 'physics', 'mech-': 'mechanism' }
const SKILL = { manual: 'manual-to-3d', origami: 'origami-3d', popup: 'popup-3d', physics: 'physics-3d', mechanism: 'mechanism-3d', free: 'freeform-3d' }
const CATEGORY = { origami: '折纸', popup: '立体书', physics: '物理原理', mechanism: '机械结构' }
const asked = process.env.MOCK_ROUTE || Object.entries(PREFIX).find(([p]) => MANUAL?.startsWith(p))?.[1] || 'manual'
const lowConfidence = Number(process.env.MOCK_CONFIDENCE ?? 0.9) < 0.4
const ROUTE = asked !== 'manual' && asked !== 'free' && lowConfidence ? 'free' : asked
const llm = start(['scripts/mock-llm.mjs', ...(MANUAL ? [MANUAL] : [])], { MOCK_LLM_PORT: String(llmPort) }, 'mock LLM：')
const server = start(['server/main.ts'], env, '已启动')
const base = `http://127.0.0.1:${port}`

const client = () => {
  let cookie = ''
  return async (path, body, method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = r.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: r.status, body: await r.json().catch(() => ({})) }
  }
}

try {
  await Promise.all([llm.ready, server.ready])
  const boss = client()
  await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'boss-pass-1' })
  const [code] = (await boss('/api/admin/invites', { count: 2 })).body.codes
  const user = client()
  ok((await user('/api/auth/register', { email: 'tester@example.com', invite: code, name: '小王', password: 'tester-pass' })).status === 200, '普通用户注册')
  ok((await user('/api/status')).body.manual === true, '/api/status：说明书生成可用')

  const page = `data:image/jpeg;base64,${readFileSync('public/manuals/mouse-bt54/p0-2.jpg').toString('base64')}`
  const post = await user('/api/manual/jobs', { pages: [page], review: true, appearance: false, fileName: 'selftest.jpg' })
  ok(post.status === 200 && post.body.id, '提交生成任务')
  ok((await user('/api/manual/jobs', { pages: [page] })).status === 429, '同一个人同时只能跑一个')
  const mine = (await user('/api/manual/jobs')).body.jobs ?? []
  ok(mine.some((j) => j.id === post.body.id && j.status === 'running' && j.input?.pages === 1 && !('log' in j)), '「我的 · 导入」列出了生成中的任务（摘要，不带日志）')

  let job = {}
  let stage = ''
  const t0 = Date.now()
  while (Date.now() - t0 < 10 * 60 * 1000) {
    job = (await user(`/api/manual/jobs/${post.body.id}`)).body
    if (job.stage !== stage) console.log(`  … ${((Date.now() - t0) / 1000).toFixed(0)}s ${(stage = job.stage)}`)
    if (job.status !== 'running') break
    await sleep(1000)
  }
  for (const l of job.log ?? []) if (l.level !== 'info') console.log(`    [${l.level}] ${l.msg}`)
  ok(job.status === 'done' && job.manualId, `流水线跑完（${((Date.now() - t0) / 1000).toFixed(0)} 秒，${job.status}${job.error ? '：' + job.error : ''}）`)
  ok(!job.problems?.length, `审计问题都修掉了${job.problems?.length ? '：' + job.problems.join('；') : ''}`)

  const id = job.manualId
  const work = join(env.IMPORT_WORK_DIR, post.body.id)
  const shots = existsSync(work) ? readdirSync(work, { recursive: true }).filter((f) => String(f).endsWith('.png') || String(f).endsWith('.jpg')) : []
  ok(job.log?.some((l) => l.msg.includes('复核')) && shots.length > 0, `截图复核截到了图（${shots.length} 张）`)
  ok(existsSync(join(env.IMPORT_DIR, id, 'spec.json')), `说明书存进了 IMPORT_DIR（${id}）`)
  const saved = JSON.parse(readFileSync(join(env.IMPORT_DIR, id, 'spec.json'), 'utf8'))
  ok(job.kind === 'scene' && job.route?.verdict === ROUTE && job.route?.skill === SKILL[ROUTE], `分流为 ${ROUTE}，用 ${SKILL[ROUTE]}（实际：${job.route?.verdict} / ${job.route?.skill}）`)
  ok(job.log.some((l) => l.msg.includes(`用 ${SKILL[ROUTE]} skill`)), '运行记录里写了分流结果和 skill')
  if (ROUTE !== asked) ok(job.route?.guess === asked && job.log.some((l) => l.msg.includes('改走自由生成')), `把握太低时从 ${asked} 改走自由生成，并记下原判断`)
  const checks = llm.log.split('\n').filter((l) => l.startsWith('提示词检查'))
  ok(['分流', '转写', '写脚本'].every((k) => checks.some((l) => l.startsWith(`提示词检查 ✓ ${k}`))) && !checks.some((l) => l.includes('✗')),
    `提示词按链路拼进了 ${SKILL[ROUTE]}${checks.some((l) => l.includes('✗')) ? '：' + checks.filter((l) => l.includes('✗')).join('；') : ''}`)
  if (CATEGORY[ROUTE]) ok(saved.category === CATEGORY[ROUTE] && saved.genre === 'tutorial', `归到「${CATEGORY[ROUTE]}」、教程类（实际：${saved.category} / ${saved.genre}）`)
  else if (ROUTE === 'manual') ok(saved.genre === undefined && saved.source?.title, `按产品说明书保存（${saved.category}）`)
  else ok(saved.category && saved.genre === 'tutorial' && saved.source?.title === '用户上传：selftest.jpg', `自由生成：品类由模型定（${saved.category}）、教程类`)
  ok(!saved.parts.some((p) => p.model), '教程 / 自由生成的样板没把外观模型带进脚本')
  if (ROUTE === 'origami') {
    const cams = saved.guides.flatMap((g) => g.steps.map((s) => s.camera))
    ok(cams.every((c) => Array.isArray(c.target) && c.dist > 0), `只写了 dir 的镜头都按纸的形状补上了（${cams.length} 个）`)
  }
  const listed = async (c) => (await c('/imported/index.json')).body.manuals?.map((m) => m.id) ?? []
  ok((await listed(user)).includes(id) && (await user(`/imported/${id}/spec.json`)).body.id === id, '导入的人打得开')
  const peer = client()
  const [, code2] = (await boss('/api/admin/invites', { count: 2 })).body.codes
  await peer('/api/auth/register', { email: 'peer@example.com', invite: code2, name: '小李', password: 'peer-pass-1' })
  ok(!(await listed(peer)).includes(id) && (await peer(`/imported/${id}/spec.json`)).status === 404, '没发布时别人看不到')
  const overview = (await boss('/api/admin/overview')).body
  const ev = overview.events ?? []
  ok(ev.some((e) => e.kind === 'import' && e.target === `manual:${id}`) && ev.some((e) => e.kind === 'import_start'), '后台行为流水记了开始生成和导入')
  ok(overview.stats?.imports >= 1 && overview.stats?.importing === 0, `概览里有生成任务数（${overview.stats?.imports}，在跑 ${overview.stats?.importing}）`)

  // 任务存进了库：自己的列表、原页图；别人看不到；管理员看得到全部（列表、详情、日志、中间产物）
  const jobId = post.body.id
  ok((await user('/api/manual/jobs')).body.jobs?.some((j) => j.id === jobId && j.status === 'done' && j.manualId === id), '结束的任务留在「我的 · 导入」列表里')
  ok((await user(`/api/manual/jobs/${jobId}/pages/1`)).status === 200 && existsSync(join(work, 'pages', '01.jpg')), '上传的原页存下来了，本人取得到')
  ok((await peer(`/api/manual/jobs/${jobId}`)).status === 404 && (await peer(`/api/manual/jobs/${jobId}/pages/1`)).status === 404, '别人看不到这个任务和原页')
  ok((await user('/api/admin/imports')).status === 403, '普通用户进不了后台的生成列表')
  const all = (await boss('/api/admin/imports')).body.jobs ?? []
  ok(all.some((j) => j.id === jobId && j.ownerName === '小王' && j.manualId === id), '管理员看得到所有人的生成任务')
  const detail = (await boss(`/api/admin/imports/${jobId}`)).body
  ok(detail.job?.log?.length > 0 && detail.pages === 1 && detail.files?.length > 0 && detail.imported?.id === id,
    `任务详情：日志 ${detail.job?.log?.length} 条、原页 ${detail.pages} 张、中间产物 ${detail.files?.length} 个`)
  ok((await boss(`/api/admin/imports/${jobId}/files/${detail.files?.[0]}`)).status === 200 && (await boss(`/api/manual/jobs/${jobId}/pages/1`)).status === 200, '管理员打得开中间产物和原页')
  ok((await boss(`/api/admin/imports/${jobId}/files/..%2F..%2Fdongle.db`)).status === 404, '中间产物接口不能跳出任务目录')

  // 用户删掉导入的说明书：自己那里没了，管理员还看得到、打得开
  ok((await user(`/api/manual/imported/${id}`, undefined, 'DELETE')).status === 200 && !(await listed(user)).includes(id), '用户删掉导入的说明书')
  const adminIndex = (await boss('/imported/index.json')).body.manuals ?? []
  ok(adminIndex.some((m) => m.id === id && m.deleted && m.mine === false) && (await boss(`/imported/${id}/spec.json`)).body.id === id, '删掉的管理员还看得到、打得开（标了已删）')
  ok((await boss(`/api/admin/imports/${jobId}`)).body.imported?.deleted && (await boss('/api/admin/imports')).body.jobs?.find((j) => j.id === jobId)?.deleted, '后台任务上标了用户已删')
} catch (e) {
  failed++
  console.error(e)
} finally {
  if (failed) console.error(`\n—— 服务器日志 ——\n${server.log}\n—— 假模型日志 ——\n${llm.log}`)
  await Promise.all([server.stop(), llm.stop()])
  rmSync(dir, { recursive: true, force: true })
}
console.log(failed ? `\n${failed} 项没通过` : '\n全部通过')
process.exit(failed ? 1 : 0)
