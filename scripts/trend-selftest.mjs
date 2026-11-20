// 热榜的端到端自测：npm run trend:selftest
// 起假模型（scripts/mock-llm.mjs，带假的联网搜索、假的 B 站公开接口和假的「品牌官网说明书」，不花钱）和一个线上服务器（server/main.ts，临时数据目录），
// 管理员检测联网 → 手动扫描（电商·新闻 / 小红书 / B 站三个渠道并行：电商 4 款——1 款库里已有、1 款有官网 PDF、1 款说明书在内网、1 款不适合演示；
// 小红书里 X1 也热（并成一条、多渠道加分）；B 站从假接口的视频里认出 1 款；品牌按别名并起来出品牌榜）→ 打开自动、每天 2 份 →
// 调度把够线的两款排进队列：PDF 那款渲染成页面、走完流水线、复核通过自动发到广场；内网那款被拦下。
// 再检查广场热度排序、别人看得到、后台的忽略 / 下架 / 上架、品牌忽略、第二次扫描带上品牌线索，
// 以及联网方式的回退（chat 方式、都不支持时的说明）和网页版说明书截图。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
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

const dir = mkdtempSync(join(tmpdir(), 'dongle-trend-'))
const llmPort = 5300 + Math.floor(Math.random() * 90)
const port = 3900 + Math.floor(Math.random() * 90)
const mock = `http://127.0.0.1:${llmPort}`
const env = {
  PORT: String(port), DATA_DIR: dir, IMPORT_DIR: join(dir, 'imported'), IMPORT_WORK_DIR: join(dir, 'work'),
  ADMIN_EMAILS: ADMIN, NODE_ENV: 'production', SMTP_HOST: '', EMAIL_VERIFY: '', TRIPO_API_KEY: '',
  AI_BASE_URL: `${mock}/v1`, AI_API_KEY: 'mock', AI_MODEL: 'mock', AI_MANUAL_MODEL: 'mock-skill', AI_SEARCH_MODEL: '',
  // 假的「品牌官网」在本机：只放行 127.0.0.1，别的内网地址照样拦
  TREND_ALLOW_HOSTS: '127.0.0.1',
  TREND_BILI_BASE: `${mock}/bili`,
  SEARCH_IDLE_MS: '1500',
}
const llm = start(['scripts/mock-llm.mjs'], { MOCK_LLM_PORT: String(llmPort) }, 'mock LLM：')
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

const until = async (what, fn, ms) => {
  const t0 = Date.now()
  let v
  while (Date.now() - t0 < ms) {
    if ((v = await fn())) return v
    await sleep(1000)
  }
  throw new Error(`等不到：${what}`)
}

try {
  await Promise.all([llm.ready, server.ready])
  const boss = client()
  await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'boss-pass-1' })
  const [code] = (await boss('/api/admin/invites', { count: 1 })).body.codes
  const user = client()
  await user('/api/auth/register', { email: 'tester@example.com', invite: code, name: '小王', password: 'tester-pass' })

  ok((await user('/api/admin/trends')).status === 403, '普通用户进不了后台热度页')
  ok(Array.isArray((await user('/api/trends')).body.items) && (await user('/api/trends')).body.items.length === 0, '还没扫描时广场热度是空的')
  const first = (await boss('/api/admin/trends')).body
  ok(first.settings?.auto === false && first.settings?.dailyLimit === 5 && first.settings?.autoPublish === true, '默认：自动关着、每天 5 份、复核通过自动上架')

  const probe = (await boss('/api/admin/trends/probe', {})).body
  ok(probe.ok && probe.mode === 'responses' && probe.searched === true, `检测联网：${probe.label ?? probe.error}${probe.searched ? '，确实调用了搜索' : ''}`)

  // 手动扫描（自动关着：只记录，不排队）
  const scan = await boss('/api/admin/trends/scan', {})
  ok(scan.status === 200 && scan.body.id, '开始扫描')
  ok((await boss('/api/admin/trends/scan', {})).status === 409, '扫描中不能再点一次')
  let view = await until('扫描结束', async () => {
    const v = (await boss('/api/admin/trends')).body
    return v.scans?.[0]?.status !== 'running' && v
  }, 60_000)
  const s0 = view.scans[0]
  ok(s0.status === 'done' && s0.found === 6 && s0.mode === 'responses' && s0.summary && s0.data?.citations?.length > 0, `扫描完成：${s0.found} 款，${s0.error ?? s0.summary.replace(/\n/g, ' ｜ ')}`)
  const runs = s0.data?.channels ?? []
  ok(runs.length === 3 && runs.every((r) => r.ok && r.summary) && runs.map((r) => r.id).join() === 'market,xhs,bili', `三个渠道都扫成了：${runs.map((r) => `${r.id} ${r.items} 款 ${r.brands} 品牌`).join('，')}`)
  ok(/故意卡住不发数据/.test(llm.log) && runs.find((r) => r.id === 'market')?.ok, '电商·新闻那次搜索卡住不发数据，没干等、重连后照样扫成')
  ok(/故意在流中间断开连接/.test(llm.log) && runs.find((r) => r.id === 'xhs')?.ok, '小红书那次搜索流到一半断网，自动重试后照样扫成')
  ok(/故意在流里回 error 事件/.test(llm.log) && runs.find((r) => r.id === 'bili')?.ok, 'B 站那次搜索流里回了 error 事件，自动重试后照样扫成')
  const biliRun = runs.find((r) => r.id === 'bili')
  ok(biliRun?.bili?.videos === 3 && biliRun?.bili?.hot === 2 && !biliRun.warn, `B 站接口：${biliRun?.bili?.videos} 条视频（滤掉了游戏区和 60 天前的）、${biliRun?.bili?.hot} 个热搜，被风控后领 buvid 重试成功${biliRun?.warn ? `（${biliRun.warn}）` : ''}`)
  ok(/热搜也看到了/.test(biliRun?.summary ?? ''), 'B 站热搜词进了提示词')
  const byName = (v, name) => v.items.find((i) => i.name === name)
  const x1s = byName(view, '测试净化器 X1')
  ok(x1s?.heat === 93 && x1s.channels?.join() === 'market,xhs' && x1s.channelHeat?.xhs === 80 && x1s.signals?.some((g) => g.ch === 'xhs'), `两个渠道都热的并成一条、加分：热度 ${x1s?.heat}（${x1s?.channels?.join('+')}）`)
  const mon = byName(view, '弈威 27M4N5 显示器')
  ok(mon?.channels?.join() === 'bili' && mon.signals?.[0]?.url === 'https://www.bilibili.com/video/BV1mock0001', '从 B 站接口的视频里认出了产品，来源是视频链接')
  const bs = view.brands ?? []
  ok(bs.map((b) => b.name).join() === '小米,任天堂,测试牌,弈威', `品牌榜：${bs.map((b) => `${b.name} ${b.live}`).join('，')}`)
  const mi = bs.find((b) => b.name === '小米')
  ok(mi?.heat === 95 && mi.channels.length === 3 && mi.aliases.includes('米家') && mi.items.some((i) => i.name === '米家测试加湿器'), `「米家」并进小米：三个渠道、热度 ${mi?.heat}、别名 ${mi?.aliases?.join('、')}、名下产品 ${mi?.items?.map((i) => i.name).join('、')}`)
  ok(bs.find((b) => b.name === '测试牌')?.items?.length === 3, '品牌名下挂上了榜上的产品')
  ok(byName(view, 'Nintendo Switch OLED')?.status === 'existing' && byName(view, 'Nintendo Switch OLED')?.product === 'manual:nintendo-switch-oled', '库里已有的认出来了（指向现成的说明书）')
  ok(['测试净化器 X1', '内网测试机', '某款蓝牙耳机'].every((n) => byName(view, n)?.status === 'new'), '新面孔记为「新发现」，自动关着时不排队')
  const hot0 = (await user('/api/trends')).body.items
  ok(hot0.length === 1 && hot0[0].product === 'manual:nintendo-switch-oled' && hot0[0].rank === 1, '广场热度里有库里那款（排第 1）')

  // 打开自动、每天 2 份：调度把两款够线的排进去（耳机适合度太低不排）
  view = (await boss('/api/admin/trends/settings', { auto: true, dailyLimit: 2, intervalHours: 24, appearance: false })).body
  ok(view.settings?.auto === true && view.settings?.dailyLimit === 2, '保存设置')
  ok(view.state?.nextScanAt > Date.now() + 23 * 3600 * 1000, '刚扫过，下一次自动扫描在 24 小时后')
  const t0 = Date.now()
  let stage = ''
  view = await until('两款都处理完', async () => {
    const v = (await boss('/api/admin/trends')).body
    const now = v.items.filter((i) => i.status !== 'existing').map((i) => `${i.name}:${i.status}`).join(' ')
    if (now !== stage) console.log(`  … ${((Date.now() - t0) / 1000).toFixed(0)}s ${(stage = now)}`)
    const a = byName(v, '测试净化器 X1')
    const b = byName(v, '内网测试机')
    return ['published', 'held', 'failed'].includes(a?.status) && b?.status === 'failed' && v
  }, 12 * 60_000)
  const x1 = byName(view, '测试净化器 X1')
  ok(x1.status === 'published' && x1.post && x1.postLive, `PDF 那款生成后自动上架（${x1.status}${x1.note ? '：' + x1.note : ''}）`)
  ok(x1.source?.kind === 'pdf' && x1.source?.pages === 2 && x1.source?.url.endsWith('/files/manual.pdf'), `说明书来源：PDF ${x1.source?.pages} 页`)
  ok(x1.auto === true, '算进了每日额度')
  const lan = byName(view, '内网测试机')
  ok(/内网/.test(lan.note ?? ''), `内网地址被拦下：${lan.note}`)
  ok(byName(view, '某款蓝牙耳机')?.status === 'new', '适合度不够的没排队')
  ok(view.state?.usedToday?.started === 1 && view.state?.usedToday?.tried === 2, `今日额度：生成 ${view.state?.usedToday?.started} 份、找说明书 ${view.state?.usedToday?.tried} 次`)

  const id = x1.product.replace('manual:', '')
  const jobs = (await boss('/api/admin/imports')).body.jobs ?? []
  const job = jobs.find((j) => j.id === x1.job)
  ok(job?.owner === 'u-trend' && job?.ownerName === '懂了热榜' && job?.status === 'done', '生成任务记在「懂了热榜」名下，后台「生成」里看得到')
  const detail = (await boss(`/api/admin/imports/${x1.job}`)).body
  ok(detail.job?.log?.some((l) => l.msg.startsWith('复核：')) && !detail.job?.problems?.length, '审计零问题、截图复核做了')
  ok(detail.job?.input?.hint?.includes('热榜自动生成') && detail.job?.input?.hint?.includes('/files/manual.pdf'), '提示里带上了产品和官方来源')
  const spec = (await user(`/imported/${id}/spec.json`)).body
  ok(spec.id === id && spec.source?.url?.endsWith('/files/manual.pdf') && spec.source?.images?.length === 0, '别人打得开，来源记成官网地址、不放原页图')
  ok((await user('/imported/index.json')).body.manuals?.some((m) => m.id === id && m.mine === false), '别人的导入清单里有这份（不是自己的）')
  const doc = (await user('/api/community')).body.db ?? {}
  const post = doc.posts?.find((p) => p.id === x1.post)
  ok(post?.author === 'u-trend' && post?.product === x1.product && post?.kind === 'manual' && post?.tags?.includes('热门') && doc.users?.['u-trend']?.name === '懂了热榜', `广场上有这篇（${post?.title} · ${post?.tags?.join('、')}）`)
  const hot = (await user('/api/trends')).body.items
  ok(hot.length === 2 && hot[0].product === x1.product && hot[1].product === 'manual:nintendo-switch-oled' && hot[1].rank === 2, `广场热度按热度排：${hot.map((h) => `${h.rank}. ${h.name} ${h.heat}`).join('，')}`)
  ok(!(await boss('/api/admin/users')).body.users?.some((u) => u.id === 'u-trend'), '「懂了热榜」不算注册用户')
  const ev = (await boss('/api/admin/overview')).body.events ?? []
  ok(['trend_scan', 'trend_generate', 'trend_publish', 'trend_fail'].every((k) => ev.some((e) => e.kind === k)), '行为流水记了扫描、生成、上架、失败')

  // 后台操作
  const act = async (name, action) => (await boss(`/api/admin/trends/items/${encodeURIComponent(byName(view, name).key)}`, { action }))
  view = (await act('某款蓝牙耳机', 'ignore')).body
  ok(byName(view, '某款蓝牙耳机')?.status === 'ignored', '忽略')
  view = (await act('某款蓝牙耳机', 'restore')).body
  ok(byName(view, '某款蓝牙耳机')?.status === 'new', '恢复')
  view = (await act('测试净化器 X1', 'unpublish')).body
  ok(byName(view, '测试净化器 X1')?.status === 'held' && (await user('/api/community')).body.db?.posts?.every((p) => p.id !== x1.post), '下架：广场上没了，留在后台等确认')
  ok(!(await user('/api/trends')).body.items.some((h) => h.product === x1.product), '下架后不进广场热度')
  ok((await user(`/imported/${id}/spec.json`)).status === 404, '下架后别人打不开了')
  view = (await act('测试净化器 X1', 'publish')).body
  ok(byName(view, '测试净化器 X1')?.status === 'published' && byName(view, '测试净化器 X1')?.postLive, '重新上架')
  ok((await act('测试净化器 X1', 'publish')).status === 409, '已上架的不能重复上架')

  // 品牌榜操作、信号来源设置
  const brandAct = async (name, action) => (await boss(`/api/admin/trends/brands/${encodeURIComponent(view.brands.find((b) => b.name === name).key)}`, { action })).body
  view = await brandAct('弈威', 'ignore')
  ok(view.brands.at(-1)?.name === '弈威' && view.brands.at(-1)?.status === 'ignored', '品牌忽略后排到最后')
  view = await brandAct('弈威', 'restore')
  ok(view.brands.find((b) => b.name === '弈威')?.status === 'active', '品牌恢复')
  ok((await boss('/api/admin/trends/settings', { channels: [] })).status === 400, '信号来源至少留一个')
  view = (await boss('/api/admin/trends/settings', { channels: ['market', 'bili', 'nope'] })).body
  ok(view.settings?.channels?.join() === 'market,bili', '信号来源可以只开一部分（不认识的丢掉）')

  // 第二次扫描：只扫电商·新闻和 B 站，提示词里带上上期品牌榜
  const scan2 = (await boss('/api/admin/trends/scan', {})).body
  view = await until('第二次扫描结束', async () => {
    const v = (await boss('/api/admin/trends')).body
    return v.scans?.[0]?.id === scan2.id && v.scans[0].status !== 'running' && v
  }, 60_000)
  const s2 = view.scans[0]
  ok(s2.status === 'done' && s2.data?.channels?.map((r) => r.id).join() === 'market,bili', `第二次只扫了 ${s2.data?.channels?.map((r) => r.id).join('、')}`)
  ok(/收到品牌线索：小米、任天堂、测试牌、弈威/.test(s2.summary ?? ''), '上期品牌榜前几名作为线索带进了下一次扫描')
  const mi2 = view.brands.find((b) => b.name === '小米')
  ok(mi2?.history?.length === 2 && mi2.channels.join() === 'market,bili,xhs' && mi2.channelHeat?.xhs === 85 && mi2.heat === 95,
    `这次没扫的小红书沿用上次的热度：小米 ${mi2?.history?.join(' → ')}（${mi2?.channels?.join('+')}，小红书 ${mi2?.channelHeat?.xhs}）`)

  // 联网方式回退（直接调 webSearch.ts，用临时库）
  process.env.DATA_DIR = join(dir, 'unit')
  const { searchJson } = await import('../server/webSearch.ts')
  const viaChat = await searchJson({ AI_BASE_URL: `${mock}/v1`, AI_API_KEY: 'mock', AI_SEARCH_MODEL: 'chat-search' }, 'sys', '联网搜索检测 · 测试')
  ok(viaChat.mode === 'chat' && viaChat.data.headline, '没有 Responses API 时改用 chat 的 web_search_options')
  const none = await searchJson({ AI_BASE_URL: `${mock}/v1`, AI_API_KEY: 'mock', AI_SEARCH_MODEL: 'no-search' }, 'sys', '联网搜索检测 · 测试').catch((e) => e)
  ok(none instanceof Error && none.message.includes('不支持联网搜索') && none.message.includes('AI_SEARCH_MODEL'), '都不支持时说清楚原因和怎么换')

  // 网页版说明书：无头 Chrome 分段截图
  const shots = join(dir, 'html')
  const code2 = await new Promise((r) => spawn(process.execPath, ['scripts/page-shots.mjs', `${mock}/files/manual.html`, shots, '4'], { stdio: 'ignore' }).on('exit', r))
  const files = existsSync(shots) ? readdirSync(shots) : []
  ok(code2 === 0 && files.includes('p01.jpg') && files.includes('p02.jpg') && files.includes('text.json'), `网页版说明书截成 ${files.filter((f) => f.endsWith('.jpg')).length} 张`)

  // 拦截页、产品介绍页不能当说明书
  const { fetchSource } = await import('../server/trendSource.ts')
  const src = (name) => fetchSource(`${mock}/files/${name}`, { domains: ['127.0.0.1'], allow: ['127.0.0.1'], work: join(dir, 'src', name) }).catch((e) => e)
  const gate = await src('blocked.html')
  ok(gate instanceof Error && gate.message.includes('官网拦下了截图'), `官网的拦截页不要：${gate.message}`)
  const intro = await src('product.html')
  ok(intro instanceof Error && intro.message.includes('产品介绍'), `产品介绍 / 购买页不要：${intro.message}`)
  const page = await src('manual.html')
  ok(page.kind === 'html' && page.pages.length >= 2, `网页版说明书照常能用（${page.pages?.length ?? page.message} 张）`)
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
