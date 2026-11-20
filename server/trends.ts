// 热榜：定时联网搜索市场上正火的产品 → 挑出适合做 3D 交互演示、库里还没有的 → 找品牌官方说明书 → 走网页导入同一条流水线生成
// → 审计零问题且截图复核通过就以「懂了热榜」的名义发到广场（没通过的留在后台等管理员看）。广场按热度加权排序（GET /api/trends）。
// 信号分渠道（电商·新闻 / 小红书 / B 站）各搜一遍、并行跑，同一款、同一个品牌按名字和别名并起来，几个渠道都热的加分；
// B 站另外先从公开接口取实时排行和热搜（trendBili.ts）交给模型。每次扫描顺带出一份品牌榜（trend_brands）。
// 设置和状态都在库里（kv、trend_items、trend_brands、trend_scans），管理后台「热度」页看和改。
// 调度：开发服务器和线上服务器里各起一个定时器，同一个库只有拿到租约的进程干活（别的开发服务器、Vite 重载留下的旧实例不会重复跑）。
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ViteDevServer } from 'vite'
import { LIMITS } from '../src/community/db.ts'
import { tripoReady } from './appearance.ts'
import type { Me } from './auth.ts'
import { publishManual, removePost } from './community.ts'
import { logEvent } from './events.ts'
import { HttpError, readJson, send, type Req, type Res } from './http.ts'
import { loadJob } from './importJobs.ts'
import { IMPORT_DIR, IMPORT_WORK_DIR, readIndex } from './imports.ts'
import { LlmError, type Usage } from './llm.ts'
import { cancelJob, runningJobs, startJob, type Job } from './manualPipeline.ts'
import { all, getKv, now, one, run, setKv, tx } from './sql.ts'
import { biliCount, biliSignals, biliText } from './trendBili.ts'
import { fetchSource, MAX_PAGES, officialDomains, type Source } from './trendSource.ts'
import { knownMode, MODE_LABEL, searchConfig, searchJson, type SearchMode } from './webSearch.ts'

type Env = Record<string, string>
type Pipeline = () => ViteDevServer | Promise<ViteDevServer | null> | null

/** 热榜发布用的系统账号（没有邮箱，不算注册用户、不能登录） */
export const TREND_USER = { id: 'u-trend', name: '懂了热榜', hue: 18 }

export type ChannelId = 'market' | 'xhs' | 'bili'
export const CHANNELS: Record<ChannelId, string> = { market: '电商·新闻', xhs: '小红书', bili: 'B 站' }
const CHANNEL_IDS = Object.keys(CHANNELS) as ChannelId[]
/** 同一款（同一个品牌）在几个渠道都上榜：热度取最高的，每多一个渠道加这么多 */
const CROSS_BONUS = 5

type Signal = { title: string; url: string; ch?: ChannelId }
type ChannelHeat = Partial<Record<ChannelId, number>>

export interface TrendSettings {
  /** 自动扫描 + 自动生成（关着时只能在后台手动扫、手动点生成） */
  auto: boolean
  intervalHours: number
  /** 热度、适合度都到线才自动生成 */
  minHeat: number
  minDemo: number
  /** 每天最多自动生成几份（北京时间算天） */
  dailyLimit: number
  /** 审计零问题且截图复核通过就自动发到广场；关掉则都等管理员确认 */
  autoPublish: boolean
  /** 生成时用 Tripo 做写实外观（需要 TRIPO_API_KEY） */
  appearance: boolean
  /** 每个渠道每次找几款 */
  count: number
  /** 每个渠道每次列几个热门品牌 */
  brandCount: number
  /** 从哪些渠道找信号（每个渠道单独联网搜一遍） */
  channels: ChannelId[]
  region: string
  focus: string
}

const DEFAULTS: TrendSettings = {
  auto: false, intervalHours: 12, minHeat: 60, minDemo: 55, dailyLimit: 5, autoPublish: true, appearance: true, count: 12,
  brandCount: 15, channels: ['market', 'xhs', 'bili'],
  region: '中国大陆',
  focus: '消费电子、家用电器、智能家居、个护健康、出行（电动车、滑板车、儿童推车）、户外和运动装备、母婴用品、工具和 DIY、拼装玩具',
}

export type TrendStatus = 'new' | 'existing' | 'queued' | 'sourcing' | 'generating' | 'published' | 'held' | 'failed' | 'ignored'

interface ItemData {
  brand: string
  model: string
  category: string
  aliases: string[]
  heatWhy: string
  demoWhy: string
  signals: Signal[]
  officialSite: string
  manualUrl: string
  /** 最近一次扫描里在哪些渠道上榜、各自的热度 */
  channels?: ChannelId[]
  channelHeat?: ChannelHeat
  history: { at: string; heat: number }[]
  /** 和库里已有的说明书是同一款（product 指向它） */
  matched?: boolean
  /** 状态说明：为什么没上架、为什么失败 */
  note?: string
  /** 自动排进生成队列的（算每日额度） */
  auto?: boolean
  /** 被服务重启打断、自动重排过（只重排一次；排着的这次不再占额度） */
  resumed?: 'queued' | 'done'
  queuedAt?: string
  sourcingAt?: string
  startedAt?: string
  doneAt?: string
  publishedAt?: string
  source?: { url: string; kind: string; pages: number; total: number; from?: number; to?: number }
}

interface ItemRow {
  key: string
  name: string
  heat: number
  demo: number
  status: TrendStatus
  product: string | null
  job: string | null
  post: string | null
  first_seen: string
  last_seen: string
  updated_at: string
  data: string
}

interface ScanRow {
  id: string
  at: string
  trigger: string
  status: 'running' | 'done' | 'error'
  finished_at: string | null
  mode: string | null
  summary: string | null
  found: number
  queued: number
  error: string | null
  data: string
}

/** 模型扫描回的一条（并渠道时补上 channels / channelHeat） */
interface ScanItem {
  name?: string
  brand?: string
  model?: string
  category?: string
  aliases?: unknown
  heat?: unknown
  heatWhy?: string
  demo?: unknown
  demoWhy?: string
  signals?: unknown
  officialSite?: string
  manualUrl?: string
  existing?: string
  channels?: ChannelId[]
  channelHeat?: ChannelHeat
}

/** 模型扫描回的一个品牌 */
interface ScanBrand {
  name?: string
  aliases?: unknown
  heat?: unknown
  categories?: unknown
  why?: string
  products?: unknown
  signals?: unknown
  officialSite?: string
  channels?: ChannelId[]
  channelHeat?: ChannelHeat
}

interface BrandRow {
  key: string
  name: string
  heat: number
  status: 'active' | 'ignored'
  first_seen: string
  last_seen: string
  updated_at: string
  data: string
}

interface BrandData {
  aliases: string[]
  categories: string[]
  why: string
  /** 模型说的这个品牌眼下最火的几款 */
  products: string[]
  signals: Signal[]
  officialSite: string
  channels: ChannelId[]
  channelHeat: ChannelHeat
  history: { at: string; heat: number }[]
}

interface ScanReply {
  summary?: string
  items?: ScanItem[]
  brands?: ScanBrand[]
}

/** 一次扫描里一个渠道的结果（存进 trend_scans.data.channels） */
interface ChannelRun {
  id: ChannelId
  ok: boolean
  summary?: string
  items: number
  brands: number
  seconds: number
  usage?: Usage
  searched?: boolean | null
  mode?: string
  error?: string
  warn?: string
  /** B 站接口取到的视频数、热搜词数 */
  bili?: { videos: number; hot: number }
}

const DAY = 24 * 3600 * 1000
const TICK_MS = 20_000
const LEASE_MS = 90_000
/** 扫描 / 找说明书超过这么久还没结束：当作进程中途退出了 */
const STALE_MS = 25 * 60 * 1000
/** 生成任务跑这么久还没结束就取消（正常十几分钟，外观模型多也不到一小时），免得一条卡住、后面全排着 */
const JOB_MAX_MS = 2 * 3600 * 1000
/** 渠道没扫成时歇多久再扫一遍（每次请求最长 10 分钟，两遍加起来仍在 STALE_MS 以内） */
const RESCAN_WAIT_MS = 30_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const INSTANCE = `${process.pid}-${randomBytes(3).toString('hex')}`

let ctx: { env: Env; pipeline: Pipeline; maxJobs: number } | null = null
let scanning: string | null = null
let producing: string | null = null

const G = globalThis as typeof globalThis & { __dongleTrendTimer?: ReturnType<typeof setInterval> }

/** createAiHandler 里调用：记下环境和流水线（后台接口、调度都要用） */
export function initTrends(env: Env, pipeline: Pipeline) {
  ctx = { env, pipeline, maxJobs: Number(env.MANUAL_MAX_JOBS) || 2 }
}

/** 开发服务器 / 线上服务器起来后调用：每 20 秒看一眼要不要扫描、排队、生成、跟进 */
export function startTrendWorker() {
  if (G.__dongleTrendTimer) clearInterval(G.__dongleTrendTimer)
  G.__dongleTrendTimer = setInterval(() => void tick().catch((e) => console.error('[trends]', e)), TICK_MS)
  G.__dongleTrendTimer.unref?.()
  setTimeout(() => void tick().catch((e) => console.error('[trends]', e)), 3000).unref?.()
}

// ---------- 小工具 ----------

/** 北京时间的日期 */
const dayOf = (t: number | string = Date.now()) => new Date((typeof t === 'string' ? Date.parse(t) : t) + 8 * 3600 * 1000).toISOString().slice(0, 10)
const clamp = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d)
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-_·•.,，。、:：;；()（）【】[\]「」『』'"‘’“”/\\+|!！?？]+/g, '')
const isUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u)
const dataOf = (r: ItemRow) => JSON.parse(r.data) as ItemData
const brandData = (r: BrandRow) => JSON.parse(r.data) as BrandData
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const secs = (t0: number) => Math.round((Date.now() - t0) / 1000)
const heatOf = (x: { heat?: unknown }) => clamp(x.heat, 0, 100, 0)
/** 模型给的字符串数组：去空、去重、截断 */
const strs = (v: unknown, max: number, n: number) => [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean))].slice(0, n)
const signalsOf = (v: unknown, n: number): Signal[] =>
  ((Array.isArray(v) ? v : []) as { title?: unknown; url?: unknown; ch?: unknown }[])
    .map((g) => ({ title: str(g?.title, 80), url: str(g?.url, 500), ...(CHANNEL_IDS.includes(g?.ch as ChannelId) ? { ch: g.ch as ChannelId } : {}) }))
    .filter((g) => isUrl(g.url))
    .slice(0, n)

export function trendSettings(): TrendSettings {
  return { ...DEFAULTS, ...getKv<Partial<TrendSettings>>('trend_settings') }
}

function cleanSettings(v: Partial<TrendSettings>, base: TrendSettings): TrendSettings {
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  return {
    auto: bool(v.auto, base.auto),
    intervalHours: clamp(v.intervalHours, 1, 168, base.intervalHours),
    minHeat: clamp(v.minHeat, 0, 100, base.minHeat),
    minDemo: clamp(v.minDemo, 0, 100, base.minDemo),
    dailyLimit: clamp(v.dailyLimit, 0, 50, base.dailyLimit),
    autoPublish: bool(v.autoPublish, base.autoPublish),
    appearance: bool(v.appearance, base.appearance),
    count: clamp(v.count, 3, 30, base.count),
    brandCount: clamp(v.brandCount, 5, 30, base.brandCount),
    channels: cleanChannels(v.channels, base.channels),
    region: v.region === undefined ? base.region : str(v.region, 30) || DEFAULTS.region,
    focus: v.focus === undefined ? base.focus : str(v.focus, 400) || DEFAULTS.focus,
  }
}

function cleanChannels(v: unknown, d: ChannelId[]) {
  if (v === undefined) return d
  const list = Array.isArray(v) ? CHANNEL_IDS.filter((c) => v.includes(c)) : []
  if (!list.length) throw new HttpError(400, '至少选一个信号来源')
  return list
}

function save(row: ItemRow, d: ItemData, patch: Partial<Omit<ItemRow, 'data' | 'key'>> = {}) {
  const r = { ...row, ...patch }
  run('update trend_items set name = ?, heat = ?, demo = ?, status = ?, product = ?, job = ?, post = ?, last_seen = ?, updated_at = ?, data = ? where key = ?',
    r.name, r.heat, r.demo, r.status, r.product, r.job, r.post, r.last_seen, now(), JSON.stringify(d), r.key)
  return { ...r, data: JSON.stringify(d) }
}

const item = (key: string) => one<ItemRow>('select * from trend_items where key = ?', key)
const items = (status?: TrendStatus) => (status ? all<ItemRow>('select * from trend_items where status = ?', status) : all<ItemRow>('select * from trend_items'))

const brands = () => all<BrandRow>('select * from trend_brands')

/** 好几次扫描都没再上榜的，热度慢慢降：十天降到 1/e（产品和品牌都一样） */
const liveHeat = (r: { heat: number; last_seen: string }, t = Date.now()) => Math.round(r.heat * Math.exp(-Math.max(0, t - Date.parse(r.last_seen) - DAY) / (10 * DAY)))

/** 一个导入的说明书已经公开（导入的人发布过） */
function publicImport(id: string, owner?: string) {
  return !!one("select 1 from posts where product = ? and kind = 'manual' and author = ? limit 1", `manual:${id}`, owner ?? '')
}

/** 广场上已经有的说明书：官方库 + 公开了的导入（模型据此判断「库里已经有了」） */
async function catalog(): Promise<{ id: string; name: string; category: string }[]> {
  const out: { id: string; name: string; category: string }[] = []
  const server = await ctx?.pipeline()
  if (server) {
    const { MANUALS } = (await server.ssrLoadModule('/src/domain/manual/library/index.ts')) as { MANUALS: { id: string; name: string; category: string }[] }
    for (const m of MANUALS) out.push({ id: m.id, name: m.name, category: m.category })
  }
  for (const e of readIndex().manuals) if (!e.deleted && publicImport(e.id, e.owner) && !out.some((m) => m.id === e.id)) out.push({ id: e.id, name: e.name, category: '网友导入' })
  return out
}

// ---------- 调度 ----------

/** 拿到 / 续上租约才干活：同一时刻只有一个进程在调度 */
function lease(): boolean {
  const t = Date.now()
  return tx(() => {
    run("insert or ignore into kv (key, value, updated_at) values ('trend_lease', '{}', ?)", now())
    const r = run(
      "update kv set value = ?, updated_at = ? where key = 'trend_lease' and (coalesce(json_extract(value, '$.holder'), '') = ? or coalesce(json_extract(value, '$.until'), 0) < ?)",
      JSON.stringify({ holder: INSTANCE, pid: process.pid, until: t + LEASE_MS }), now(), INSTANCE, t,
    )
    return Number(r.changes) > 0
  })
}

const lastScan = () => one<ScanRow>('select * from trend_scans order by at desc limit 1')
const lastDone = () => one<ScanRow>("select * from trend_scans where status = 'done' order by at desc limit 1")

/** 上一次成功的扫描（手动的也算）加一个间隔；上一次自动扫描失败了，两小时后再试 */
function nextScanAt(s: TrendSettings) {
  if (!s.auto) return null
  const last = one<{ at: string; status: string }>("select at, status from trend_scans where status != 'running' and (trigger = 'auto' or status = 'done') order by at desc limit 1")
  if (!last) return Date.now()
  const wait = last.status === 'done' ? s.intervalHours * 3600 * 1000 : Math.min(s.intervalHours, 2) * 3600 * 1000
  return Date.parse(last.at) + wait
}

let userReady = false
function ensureUser() {
  if (userReady) return
  run("insert or ignore into users (id, email, name, hue, role, status, created_at) values (?, null, ?, ?, 'user', 'active', ?)", TREND_USER.id, TREND_USER.name, TREND_USER.hue, now())
  userReady = true
}

async function tick() {
  if (!ctx || !lease()) return
  ensureUser()
  const s = trendSettings()
  const t = Date.now()
  // 进程中途退出留下的「扫描中」「找说明书中」
  for (const r of all<ScanRow>("select * from trend_scans where status = 'running'")) {
    if (r.id !== scanning && t - Date.parse(r.at) > STALE_MS) run("update trend_scans set status = 'error', error = '扫描中断（服务重启了）', finished_at = ? where id = ?", now(), r.id)
  }
  for (const r of items('sourcing')) {
    const d = dataOf(r)
    if (r.key !== producing && t - Date.parse(d.sourcingAt ?? r.updated_at) > STALE_MS) resume(r, '找说明书中断了（服务重启了）')
  }
  for (const r of items('generating')) follow(r, s)
  const busyScan = !!scanning || !!one("select 1 from trend_scans where status = 'running'")
  if (s.auto && !busyScan && (nextScanAt(s) ?? Infinity) <= t) startScan('auto', TREND_USER.id)
  if (s.auto) refill(s)
  if (!producing && !items('sourcing').length && !items('generating').length && runningJobs() < ctx.maxJobs) {
    const next = nextQueued(s)
    if (next) void produce(next, s)
  }
}

/** 今天（北京时间）自动生成的份数（开始生成才算）和找说明书的次数（找不到的也算，防止一直搜） */
function usedToday() {
  const today = dayOf()
  let started = 0
  let tried = 0
  for (const r of items()) {
    const d = dataOf(r)
    if (!d.auto) continue
    if (d.startedAt && dayOf(d.startedAt) === today) started++
    if (d.sourcingAt && dayOf(d.sourcingAt) === today) tried++
  }
  return { started, tried }
}

/** 找说明书的次数上限：每日额度的 3 倍 */
const roomToday = (s: TrendSettings) => {
  const u = usedToday()
  return Math.min(s.dailyLimit - u.started, s.dailyLimit * 3 - u.tried)
}

/** 自动模式：按热度 × 适合度把够线的新品排进队列，排队的加今天用掉的不超过每日额度 */
function refill(s: TrendSettings) {
  const queued = items('queued').filter((r) => dataOf(r).auto).length
  let room = roomToday(s) - queued
  if (room <= 0) return 0
  const fresh = Date.now() - 2 * DAY
  const pool = items('new')
    .filter((r) => r.heat >= s.minHeat && r.demo >= s.minDemo && Date.parse(r.last_seen) >= fresh)
    .sort((a, b) => b.heat * b.demo - a.heat * a.demo)
  let n = 0
  for (const r of pool) {
    if (room-- <= 0) break
    const d = dataOf(r)
    save(r, { ...d, auto: true, queuedAt: now(), note: undefined }, { status: 'queued' })
    n++
  }
  return n
}

function nextQueued(s: TrendSettings) {
  const q = items('queued').sort((a, b) => (dataOf(a).queuedAt ?? '').localeCompare(dataOf(b).queuedAt ?? ''))
  // 管理员手动点的、被重启打断重排的不占额度；自动的超了额度就等明天
  return q.find((r) => !dataOf(r).auto || dataOf(r).resumed === 'queued') ?? (roomToday(s) > 0 ? q[0] : undefined)
}

function fail(r: ItemRow, note: string) {
  save(r, { ...dataOf(r), note, doneAt: now() }, { status: 'failed' })
  logEvent(TREND_USER.id, 'trend_fail', r.product, `${r.name}：${note}`.slice(0, 200))
}

/** 服务重启打断的不是这一条本身的问题：自动重排一次，再被打断才算失败 */
function resume(r: ItemRow, why: string) {
  const d = dataOf(r)
  if (d.resumed) return fail(r, `${why}，可以重新生成`)
  save(r, { ...d, resumed: 'queued', queuedAt: now(), note: `${why}，已自动重新排队` }, { status: 'queued', ...(d.matched ? {} : { product: null }), job: null })
  logEvent(TREND_USER.id, 'trend_queue', null, `${r.name}：${why}，自动重排`)
}

// ---------- 扫描 ----------

const SCAN_SYSTEM = [
  '你是「懂了 Dongle」的选品编辑。懂了把说明书和教程做成可交互的 3D 分步演示：开箱、安装、组装、配网配对、换耗材、拆洗保养、折叠收纳、故障排查，每一步都能转着看。',
  '你的工作是联网搜索，找出现在市场上正火、而且值得做成 3D 交互演示的具体产品，再列一份最火的品牌。热度只根据这次搜到的信息判断，不要凭印象；每条信号都要有真实的来源链接。',
].join('\n')

/** 每个渠道看什么信号 */
const CHANNEL_BRIEF: Record<ChannelId, string[]> = {
  market: [
    '渠道：电商和新闻。联网搜索最近 14 天的市场信号：电商平台热卖榜、品牌榜和大促战报（京东、天猫、抖音电商、拼多多）、众筹（小米众筹、京东众筹、摩点）、新品发布和首销、百度 / 微信指数、微博热搜、知乎、抖音、科技和消费媒体报道。',
    '小红书和 B 站另有专门的扫描，这里不用专门去搜它们。',
  ],
  xhs: [
    '渠道：小红书。只看小红书上的信号（最近 14 天）：',
    '- 品牌合作 / 商业推广笔记（蒲公英合作、标了「赞助」「合作」的笔记）在推什么产品，哪些品牌在密集投放；',
    '- 种草爆文、搜索热词、热门话题，「好物推荐」「开箱」「测评」「避雷」类高赞笔记里反复出现的产品；',
    '- 千瓜数据、新红数据、灰豚数据、蝉妈妈等第三方平台公开的小红书品牌投放榜、种草榜、爆文榜和品类报告；媒体对「小红书爆款」「小红书种草」的报道。',
    '小红书站内页面多半要登录：搜不到原帖就用第三方榜单和报道，signals 的标题里写明是哪家的榜单或哪篇报道。不要拿电商销量榜充当小红书信号。',
  ],
  bili: [
    '渠道：B 站。只看 B 站上的信号（最近 14 天）：',
    '- 恰饭 / 商单视频：UP 主接的品牌合作、测评开箱、选购指南里重点推的产品（标题、简介里点名的型号，「本期视频由…赞助」，评测对象）；',
    '- B 站热门、分区排行榜、热搜词里出现的产品；',
    '- 火烧云数据、飞瓜数据等第三方平台公开的 B 站品牌投放榜 / 恰饭榜，花火平台的相关报道。',
    '下面是刚从 B 站公开接口抓到的实时数据：先从里面认产品和品牌（signals 直接用视频链接），再联网补充；和产品无关的视频（游戏、影视、搞笑、赛事）不用管。',
  ],
}

function scanPrompt(ch: ChannelId, s: TrendSettings, lib: string[], hints: string[], extra = '') {
  return [
    `热度扫描 · ${CHANNELS[ch]} · 今天是 ${dayOf()}（北京时间）。`,
    `地区：${s.region}。关注方向：${s.focus}。`,
    ...CHANNEL_BRIEF[ch],
    ...(extra ? [extra, ''] : []),
    `一、挑出这个渠道上 ${s.count} 个最热的具体产品（具体到品牌和型号，不要「扫地机器人」这种品类泛称），按热度从高到低：`,
    '- heat：0–100，这个渠道上的热度。综合榜单排名、声量和互动量、投放密度、发布 / 首销时间远近；同一期里拉开差距，最热的 85 以上。',
    '- demo：0–100 适合做 3D 交互演示的程度。有实体结构、有一步步上手操作（安装、组装、配网、换滤芯 / 耗材、拆洗、折叠、更换配件）的高；只看外观、纯软件 / App / 内容 / 食品 / 服装、操作只有开关机的低。',
    '- heatWhy：一句话，为什么热（带上具体的数字或榜单名）。',
    '- demoWhy：一句话，3D 演示演什么。',
    '- signals：2–4 条信号，每条是搜到的网页标题和 URL。',
    '- officialSite：品牌官网的域名，比如 mi.com、dyson.cn、roborock.com。',
    '- manualUrl：搜到品牌官网或官方支持站上这一款的说明书 / 用户手册 / 快速入门（PDF 优先）就填，搜不到留空，不要编。',
    '- existing：和下面「已经有了」里的某一份是同一款（或只差颜色、容量、套装）就填它的 id，否则留空。',
    `二、列出这个渠道上最热的 ${s.brandCount} 个品牌（品牌榜，限关注方向里的实体消费品牌），按热度从高到低：`,
    '- name：品牌常用名（有中文名用中文名）。子品牌（米家、Redmi 之于小米）并到母品牌，写进 aliases；独立运营的姊妹品牌（添可之于科沃斯）分开列。',
    '- heat：0–100，这个渠道上的品牌热度（声量、投放 / 合作量、榜单表现、新品密度）。',
    '- categories：热在哪些品类（1–3 个）。',
    '- why：一句话，为什么火（带具体数字、榜单名或代表性的合作 / 爆款）。',
    '- products：这个品牌眼下最火的 1–3 款具体产品。',
    '- signals：1–3 条来源（网页标题和 URL）。',
    '- officialSite：官网域名。',
    ...(hints.length ? [`上期品牌榜靠前的：${hints.join('、')}。只是线索，可以留意它们的新品；这期热度按这次搜到的判断，不热了就别列。`] : []),
    '',
    '已经有了：',
    ...lib,
    '',
    '只回 JSON：',
    '{"summary":"两三句话：这个渠道这期的风向（什么品类、哪些品牌在涨，为什么）","items":[{"name":"产品全名","brand":"品牌","model":"型号","category":"细品类，比如 扫地机器人、游戏主机","aliases":["常见叫法"],"heat":0,"heatWhy":"","demo":0,"demoWhy":"","signals":[{"title":"","url":""}],"officialSite":"","manualUrl":"","existing":""}],"brands":[{"name":"","aliases":[],"heat":0,"categories":[],"why":"","products":[],"signals":[{"title":"","url":""}],"officialSite":""}]}',
  ].join('\n')
}

// ---------- 并渠道 ----------

interface Part<T> {
  ch: ChannelId
  x: T
}

/** 几个渠道各自扫回的同一款 / 同一个品牌归成一组：键相同，或名字、别名归一后对得上。组内按热度从高到低 */
function group<T extends { heat?: unknown }>(lists: { ch: ChannelId; list: T[] }[], keyOf: (x: T) => string, namesOf: (x: T) => string[], min: number) {
  const groups: { key: string; names: Set<string>; parts: Part<T>[] }[] = []
  for (const { ch, list } of lists) {
    for (const x of list) {
      const key = keyOf(x)
      if (!key) continue
      const names = [key, ...namesOf(x).map(norm)].filter((n) => n.length >= min)
      let g = groups.find((y) => y.key === key || names.some((n) => y.names.has(n)))
      if (!g) groups.push((g = { key, names: new Set(), parts: [] }))
      for (const n of names) g.names.add(n)
      if (!g.parts.some((p) => p.ch === ch)) g.parts.push({ ch, x })
    }
  }
  return groups.map((g) => g.parts.sort((a, b) => heatOf(b.x) - heatOf(a.x)))
}

/** 一组里跨渠道的字段：热度（最高的 + 多渠道加分）、各渠道热度、来源（多渠道时每个渠道留两条）、别名 */
function across<T extends { heat?: unknown; signals?: unknown; aliases?: unknown }>(parts: Part<T>[]) {
  const channelHeat: ChannelHeat = {}
  for (const p of parts) channelHeat[p.ch] = heatOf(p.x)
  return {
    heat: Math.min(100, heatOf(parts[0].x) + CROSS_BONUS * (parts.length - 1)),
    channels: parts.map((p) => p.ch),
    channelHeat,
    signals: parts.flatMap((p) => signalsOf(p.x.signals, parts.length > 1 ? 2 : 4).map((g) => ({ ...g, ch: p.ch }))),
    aliases: [...new Set(parts.flatMap((p) => strs(p.x.aliases, 40, 6)))],
  }
}

/** 这次没扫到的渠道（没扫成或关掉了）沿用上次在那个渠道的热度，3 天内有效：一个来源断网不至于把排名拉低 */
const CARRY_MS = 3 * DAY
function carry(prev: { channelHeat?: ChannelHeat }, lastSeen: string, cur: { heat: number; channels: ChannelId[]; channelHeat: ChannelHeat }, ok: ChannelId[]) {
  if (Date.now() - Date.parse(lastSeen) > CARRY_MS) return cur
  const kept = CHANNEL_IDS.filter((c) => !ok.includes(c) && typeof prev.channelHeat?.[c] === 'number')
  if (!kept.length) return cur
  const channelHeat: ChannelHeat = { ...cur.channelHeat }
  for (const c of kept) channelHeat[c] = prev.channelHeat![c]
  const hs = Object.values(channelHeat) as number[]
  return { heat: Math.min(100, Math.max(...hs) + CROSS_BONUS * (hs.length - 1)), channels: [...cur.channels, ...kept], channelHeat }
}

const firstOf = <T>(parts: Part<T>[], f: (x: T) => unknown) => parts.map((p) => str(f(p.x), 500)).find(Boolean) ?? ''

const itemKey = (x: ScanItem) => {
  const name = str(x.name, 60)
  return name ? norm(`${str(x.brand, 30)}${str(x.model, 60) || name}`).slice(0, 80) || norm(name).slice(0, 80) : ''
}

function combineItems(lists: { ch: ChannelId; list: ScanItem[] }[]): ScanItem[] {
  return group(lists, itemKey, (x) => [str(x.name, 60), str(x.model, 60), ...strs(x.aliases, 40, 6)], 4).map((parts) => ({
    ...parts[0].x,
    ...across(parts),
    demo: Math.max(...parts.map((p) => clamp(p.x.demo, 0, 100, 0))),
    manualUrl: firstOf(parts, (x) => x.manualUrl),
    existing: firstOf(parts, (x) => x.existing),
    officialSite: firstOf(parts, (x) => x.officialSite),
  }))
}

function combineBrands(lists: { ch: ChannelId; list: ScanBrand[] }[]): ScanBrand[] {
  return group(lists, (x) => norm(str(x.name, 30)).slice(0, 40), (x) => strs(x.aliases, 30, 10), 2).map((parts) => {
    const a = across(parts)
    // 显示名取渠道里叫得最多的（「米家」「小米」都有时用「小米」），一样多取热度高的
    const votes = new Map<string, number>()
    for (const p of parts) votes.set(str(p.x.name, 30), (votes.get(str(p.x.name, 30)) ?? 0) + 1)
    const name = [...votes].sort((x, y) => y[1] - x[1])[0][0]
    return {
      ...parts[0].x,
      ...a,
      name,
      aliases: [...new Set([...a.aliases, ...parts.map((p) => str(p.x.name, 30))])].filter((n) => norm(n) !== norm(name)),
      categories: [...new Set(parts.flatMap((p) => strs(p.x.categories, 20, 3)))].slice(0, 5),
      products: [...new Set(parts.flatMap((p) => strs(p.x.products, 60, 3)))].slice(0, 6),
      why: str(parts[0].x.why, 200),
      officialSite: firstOf(parts, (x) => x.officialSite),
    }
  })
}

/** 名字、型号、别名归一后能对上就算同一款 */
function matchRow(rows: ItemRow[], key: string, names: string[]) {
  const byKey = rows.find((r) => r.key === key)
  if (byKey) return byKey
  const want = new Set(names.map(norm).filter((n) => n.length >= 4))
  return rows.find((r) => {
    const d = dataOf(r)
    return [r.name, d.model, ...d.aliases].map(norm).some((n) => n.length >= 4 && want.has(n))
  })
}

/** 把一次扫描的结果并进 trend_items：新的插入，见过的更新热度和历史。ok：这次扫成了的渠道 */
function merge(found: ScanItem[], lib: { id: string }[], ok: ChannelId[]) {
  const rows = items()
  const at = now()
  let fresh = 0
  const seen: string[] = []
  for (const x of found) {
    const name = str(x.name, 60)
    const key = itemKey(x)
    if (!name || !key) continue
    const brand = str(x.brand, 30)
    const model = str(x.model, 60)
    const aliases = strs(x.aliases, 40, 6)
    const existing = str(x.existing, 60)
    const lib1 = existing && lib.find((m) => m.id === existing) ? `manual:${existing}` : null
    const heat = clamp(x.heat, 0, 100, 0)
    const demo = clamp(x.demo, 0, 100, 0)
    const fields = {
      brand, model, category: str(x.category, 20), aliases,
      heatWhy: str(x.heatWhy, 160), demoWhy: str(x.demoWhy, 160),
      signals: signalsOf(x.signals, 6),
      officialSite: str(x.officialSite, 60), manualUrl: isUrl(str(x.manualUrl, 500)) ? str(x.manualUrl, 500) : '',
      channels: x.channels ?? [], channelHeat: x.channelHeat ?? {},
    }
    const row = matchRow(rows, key, [name, model, ...aliases])
    if (row && seen.includes(row.key)) continue
    if (!row) {
      const d: ItemData = { ...fields, history: [{ at, heat }], ...(lib1 ? { matched: true } : {}) }
      run('insert into trend_items (key, name, heat, demo, status, product, job, post, first_seen, last_seen, updated_at, data) values (?, ?, ?, ?, ?, ?, null, null, ?, ?, ?, ?)',
        key, name, heat, demo, lib1 ? 'existing' : 'new', lib1, at, at, at, JSON.stringify(d))
      rows.push(item(key)!)
      seen.push(key)
      fresh++
      continue
    }
    seen.push(row.key)
    const d = dataOf(row)
    const c = carry(d, row.last_seen, { heat, channels: fields.channels, channelHeat: fields.channelHeat }, ok)
    const next: ItemData = { ...d, ...fields, channels: c.channels, channelHeat: c.channelHeat, manualUrl: fields.manualUrl || d.manualUrl, history: [...d.history, { at, heat: c.heat }].slice(-30) }
    let status = row.status
    let product = row.product
    // 后来发现库里已经有（比如网友刚导入发布了）：不再生成
    if (lib1 && (status === 'new' || status === 'failed' || status === 'queued')) {
      status = 'existing'
      product = lib1
      next.matched = true
      next.note = undefined
    }
    save(row, next, { name, heat: c.heat, demo, status, product, last_seen: at })
  }
  return { fresh, total: seen.length }
}

/** 把一次扫描的品牌并进 trend_brands：按名字和别名认同一个品牌，显示名沿用第一次见到的 */
function mergeBrands(found: ScanBrand[], ok: ChannelId[]) {
  const rows = brands()
  const at = now()
  let fresh = 0
  const seen: string[] = []
  for (const x of found) {
    const name = str(x.name, 30)
    const key = norm(name).slice(0, 40)
    if (!key) continue
    const heat = clamp(x.heat, 0, 100, 0)
    const fields = {
      aliases: strs(x.aliases, 30, 10).filter((a) => norm(a) !== key),
      categories: strs(x.categories, 20, 5), why: str(x.why, 200), products: strs(x.products, 60, 6),
      signals: signalsOf(x.signals, 6), officialSite: str(x.officialSite, 60),
      channels: x.channels ?? [], channelHeat: x.channelHeat ?? {},
    }
    const want = new Set([key, ...fields.aliases.map(norm)].filter((n) => n.length >= 2))
    const row = rows.find((r) => r.key === key) ?? rows.find((r) => [r.key, ...brandData(r).aliases.map(norm)].some((n) => want.has(n)))
    if (row && seen.includes(row.key)) continue
    if (!row) {
      const d: BrandData = { ...fields, history: [{ at, heat }] }
      run("insert into trend_brands (key, name, heat, status, first_seen, last_seen, updated_at, data) values (?, ?, ?, 'active', ?, ?, ?, ?)", key, name, heat, at, at, at, JSON.stringify(d))
      rows.push(one<BrandRow>('select * from trend_brands where key = ?', key)!)
      seen.push(key)
      fresh++
      continue
    }
    seen.push(row.key)
    const d = brandData(row)
    const aliases = [...new Set([...fields.aliases, ...d.aliases, name])].filter((a) => norm(a) !== row.key).slice(0, 12)
    const c = carry(d, row.last_seen, { heat, channels: fields.channels, channelHeat: fields.channelHeat }, ok)
    const next: BrandData = { ...d, ...fields, aliases, channels: c.channels, channelHeat: c.channelHeat, history: [...d.history, { at, heat: c.heat }].slice(-30) }
    run('update trend_brands set heat = ?, last_seen = ?, updated_at = ?, data = ? where key = ?', c.heat, at, at, JSON.stringify(next), row.key)
  }
  return { fresh, total: seen.length }
}

/** 上期品牌榜前十（两周内上过榜、没被忽略的）：下次扫描时提示模型留意它们的新品 */
function brandHints() {
  const t = Date.now()
  return brands()
    .filter((r) => r.status === 'active' && t - Date.parse(r.last_seen) < 14 * DAY)
    .map((r) => ({ name: r.name, live: liveHeat(r, t) }))
    .sort((a, b) => b.live - a.live)
    .slice(0, 10)
    .map((r) => r.name)
}

/** 开始一次扫描（后台跑），返回扫描号 */
export function startScan(trigger: 'auto' | 'manual', by: string) {
  if (!ctx) throw new HttpError(501, '热榜没有初始化')
  if (scanning) throw new HttpError(409, '正在扫描，等这一次结束')
  if (!searchConfig(ctx.env)) throw new HttpError(501, '服务器还没配置 AI_API_KEY')
  if (one("select 1 from trend_scans where status = 'running'")) throw new HttpError(409, '另一个服务进程正在扫描，等它结束')
  ensureUser()
  const id = `s-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`
  run("insert into trend_scans (id, at, trigger, status, data) values (?, ?, ?, 'running', '{}')", id, now(), trigger)
  scanning = id
  void doScan(id, by).finally(() => {
    if (scanning === id) scanning = null
  })
  return id
}

const NO_BILI = '（这次 B 站接口什么也没取到，全靠联网搜索）'

/** 一个渠道联网搜一遍；B 站先取公开接口的实时数据拼进提示词 */
async function scanChannel(ch: ChannelId, s: TrendSettings, lib: string[], hints: string[]) {
  const t0 = Date.now()
  const warns: string[] = []
  let extra = ''
  let bili: ChannelRun['bili']
  if (ch === 'bili') {
    try {
      const d = await biliSignals({ base: ctx!.env.TREND_BILI_BASE })
      bili = { videos: biliCount(d), hot: d.hot.length }
      extra = bili.videos || bili.hot ? biliText(d) : NO_BILI
      if (d.errors.length) warns.push(`B 站接口${bili.videos || bili.hot ? '有几项' : ''}没取到：${d.errors.join('；')}`.slice(0, 300))
    } catch (e) {
      extra = NO_BILI
      warns.push(`B 站接口没取到：${message(e)}`.slice(0, 300))
    }
  }
  const r = await searchJson<ScanReply>(ctx!.env, SCAN_SYSTEM, scanPrompt(ch, s, lib, hints, extra))
  if (r.searched === false) warns.push('模型这次没有调用联网搜索，结果可能是旧知识')
  const items = Array.isArray(r.data.items) ? r.data.items.slice(0, 40) : []
  const found = Array.isArray(r.data.brands) ? r.data.brands.slice(0, 40) : []
  const out: ChannelRun = {
    id: ch, ok: true, summary: str(r.data.summary, 400), items: items.length, brands: found.length, seconds: secs(t0),
    usage: r.usage, searched: r.searched, mode: r.mode, ...(warns.length ? { warn: warns.join('；') } : {}), ...(bili ? { bili } : {}),
  }
  return { run: out, items, brands: found, citations: r.citations, model: r.model }
}

async function doScan(id: string, by: string) {
  const s = trendSettings()
  const t0 = Date.now()
  try {
    const lib = await catalog()
    const libLines = lib.map((m) => `- ${m.id}：${m.name}（${m.category}）`)
    const hints = brandHints()
    const chans = s.channels.length ? s.channels : DEFAULTS.channels
    const scanAll = (list: ChannelId[]) => Promise.allSettled(list.map((ch) => scanChannel(ch, s, libLines, hints)))
    const settled = await scanAll(chans)
    // 网络抖得厉害时单个请求重试也会用完：没扫成的渠道（配置问题除外）歇一会儿再扫一遍
    const again = chans.filter((_, i) => settled[i].status === 'rejected' && !(settled[i].reason instanceof LlmError && settled[i].reason.fatal))
    const first = new Map(again.map((ch) => [ch, message((settled[chans.indexOf(ch)] as PromiseRejectedResult).reason)]))
    if (again.length) {
      await sleep(RESCAN_WAIT_MS)
      const retry = await scanAll(again)
      again.forEach((ch, i) => (settled[chans.indexOf(ch)] = retry[i]))
    }
    const runs: ChannelRun[] = []
    const done: Awaited<ReturnType<typeof scanChannel>>[] = []
    settled.forEach((x, i) => {
      const redo = first.get(chans[i])
      if (x.status === 'fulfilled') {
        const r = x.value.run
        if (redo) r.warn = [`第一遍没扫成（${redo.slice(0, 120)}），重扫了一遍`, r.warn].filter(Boolean).join('；')
        runs.push(r)
        done.push(x.value)
      } else runs.push({ id: chans[i], ok: false, items: 0, brands: 0, seconds: secs(t0), error: `${message(x.reason).slice(0, 400)}${redo ? '（重扫了一遍还是没成）' : ''}` })
    })
    if (!done.length) throw new Error(runs.map((r) => `${CHANNELS[r.id]}：${r.error}`).join('；'))
    const ok = done.map((d) => d.run.id)
    const { fresh, total } = merge(combineItems(done.map((d) => ({ ch: d.run.id, list: d.items }))), lib, ok)
    const b = mergeBrands(combineBrands(done.map((d) => ({ ch: d.run.id, list: d.brands }))), ok)
    const queued = s.auto ? refill(s) : 0
    const summary = runs.filter((r) => r.summary).map((r) => (chans.length > 1 ? `${CHANNELS[r.id]}：${r.summary}` : r.summary)).join('\n')
    const usage = done.reduce((u, d) => ({ input: u.input + (d.run.usage?.input ?? 0), output: u.output + (d.run.usage?.output ?? 0), cached: u.cached + (d.run.usage?.cached ?? 0) }), { input: 0, output: 0, cached: 0 })
    const searched = done.some((d) => d.run.searched === true) ? true : done.every((d) => d.run.searched === false) ? false : null
    const warn = runs.flatMap((r) => (r.error ? [`${CHANNELS[r.id]}没扫成：${r.error}`] : r.warn ? [`${CHANNELS[r.id]}：${r.warn}`] : [])).join('；').slice(0, 800)
    const citations = [...new Map(done.flatMap((d) => d.citations).map((c) => [c.url, c])).values()].slice(0, 40)
    run("update trend_scans set status = 'done', finished_at = ?, mode = ?, summary = ?, found = ?, queued = ?, data = ? where id = ?",
      now(), done[0].run.mode ?? null, summary.slice(0, 1500), total, queued,
      JSON.stringify({ model: done[0].model, usage, searched, fresh, brands: b.total, freshBrands: b.fresh, channels: runs, citations, seconds: secs(t0), ...(warn ? { warn } : {}) }), id)
    logEvent(by, 'trend_scan', null, `${total} 款上榜，${fresh} 款新面孔，品牌榜 ${b.total} 个${queued ? `，${queued} 款排进生成` : ''}${done[0].run.summary ? `：${done[0].run.summary}` : ''}`.slice(0, 300))
  } catch (e) {
    run("update trend_scans set status = 'error', finished_at = ?, error = ? where id = ?", now(), message(e).slice(0, 600), id)
    logEvent(by, 'trend_scan_fail', null, message(e).slice(0, 200))
  }
}

// ---------- 生成 ----------

const SOURCE_SYSTEM = '你是联网检索助手，只找品牌官方发布的产品说明书。只根据这次搜到的结果回答，链接必须是搜到的真实地址。'

function sourcePrompt(r: ItemRow, d: ItemData) {
  return [
    `找官方说明书 · 产品：${r.name}（品牌 ${d.brand || '未知'}，型号 ${d.model || '未知'}${d.officialSite ? `，官网 ${d.officialSite}` : ''}）。`,
    '请联网搜索这款产品在品牌官网或官方服务 / 支持 / 下载站上的说明书。要求：',
    '- 只要品牌官方的地址（官网、官方服务站、官方 CDN），不要 manualslib 这类说明书聚合站、文库、网盘、电商详情页、论坛和自媒体转载。',
    '- 优先简体中文的 PDF 用户手册 / 使用说明书；没有就给快速入门指南 PDF；再没有就给官网上的网页版说明书或使用教程页。产品介绍页、参数页、购买页不算说明书，不要给。',
    '- 链接要能直接打开文件或页面，按优先级排，最多 4 个。',
    '只回 JSON：{"officialDomains":["品牌用的官方域名，包括放说明书文件的 CDN 域名"],"links":[{"url":"","title":"","kind":"pdf 或 html","lang":"zh / en / 多语言"}]}',
  ].join('\n')
}

const allowHosts = () => (ctx?.env.TREND_ALLOW_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

/** 先试扫描时给的说明书地址，不行再专门搜一次；都不行抛出每个地址失败的原因 */
async function findSource(r: ItemRow, d: ItemData, work: string): Promise<Source> {
  const tried: string[] = []
  let domains = officialDomains([d.officialSite])
  const attempt = async (url: string) => {
    try {
      const src = await fetchSource(url, { domains, allow: allowHosts(), work })
      if (!src.pages.length) throw new Error('没有页面')
      return src
    } catch (e) {
      tried.push(`${url.slice(0, 100)}：${message(e)}`)
      return null
    }
  }
  if (d.manualUrl) {
    const src = await attempt(d.manualUrl)
    if (src) return src
  }
  const found = await searchJson<{ officialDomains?: string[]; links?: { url?: string }[] }>(ctx!.env, SOURCE_SYSTEM, sourcePrompt(r, d))
  domains = officialDomains([d.officialSite, ...(found.data.officialDomains ?? [])])
  for (const l of (found.data.links ?? []).slice(0, 4)) {
    const url = str(l?.url, 500)
    if (!isUrl(url) || url === d.manualUrl) continue
    const src = await attempt(url)
    if (src) return src
  }
  throw new Error(tried.length ? `没找到能用的官方说明书：${tried.join('；')}` : '没搜到品牌官方的说明书')
}

async function produce(r0: ItemRow, s: TrendSettings) {
  const env = ctx!.env
  producing = r0.key
  const d0 = dataOf(r0)
  let r = save(r0, { ...d0, sourcingAt: now(), note: undefined, ...(d0.resumed ? { resumed: 'done' as const } : {}) }, { status: 'sourcing' })
  try {
    const d = dataOf(r)
    const work = join(IMPORT_WORK_DIR, `trend-${norm(r.key).replace(/[^a-z0-9]/g, '').slice(0, 40) || 'item'}-${randomBytes(2).toString('hex')}`)
    const src = await findSource(r, d, work)
    const server = await ctx!.pipeline()
    if (!server) return fail(r, '说明书流水线没起来（开发服务器或线上服务器才能生成）')
    if (runningJobs() >= ctx!.maxJobs) {
      save(r, { ...dataOf(r), note: '同时在生成的太多了，稍后再试' }, { status: 'queued' })
      return
    }
    ensureUser()
    const range = src.pageNumbers && src.total > src.pages.length ? `（原文件 ${src.total} 页，取了第 ${src.pageNumbers[0]}–${src.pageNumbers.at(-1)} 页）` : ''
    const hint = [
      `热榜自动生成：「${r.name}」${d.brand || d.model ? `（${[d.brand, d.model].filter(Boolean).join(' ')}）` : ''}的官方${src.kind === 'html' ? '网页版' : ''}说明书，来源 ${src.url}${range}。`,
      d.demoWhy && `演示重点：${d.demoWhy}`,
      '只按资料里写的做，资料没写的不要编。',
    ].filter(Boolean).join('\n')
    const job = startJob(env, server, {
      pages: src.pages.slice(0, MAX_PAGES), texts: src.texts.slice(0, MAX_PAGES), pageNumbers: src.pageNumbers?.slice(0, MAX_PAGES),
      hint, showPages: false, review: true, appearance: s.appearance && tripoReady(env),
      fileName: `${r.name} 官方说明书`, source: { title: `${r.name} 官方说明书（${new URL(src.url).hostname}）`, url: src.url },
    }, TREND_USER.id)
    r = save(r, {
      ...dataOf(r), startedAt: now(),
      source: { url: src.url, kind: src.kind, pages: src.pages.length, total: src.total, ...(src.pageNumbers ? { from: src.pageNumbers[0], to: src.pageNumbers.at(-1) } : {}) },
    }, { status: 'generating', job: job.id })
    logEvent(TREND_USER.id, 'trend_generate', null, `${r.name}（${src.kind.toUpperCase()} ${src.pages.length} 页，${new URL(src.url).hostname}）`)
  } catch (e) {
    fail(r, message(e).slice(0, 500))
  } finally {
    if (producing === r0.key) producing = null
  }
}

/** 自动上架至少要这么多步：资料是拦截页 / 产品介绍页时模型只能凑出一两步 */
const MIN_STEPS = 4

function stepCount(id: string) {
  try {
    const spec = JSON.parse(readFileSync(join(IMPORT_DIR, id, 'spec.json'), 'utf8')) as { guides?: { steps?: unknown[] }[] }
    return (spec.guides ?? []).reduce((n, g) => n + (g.steps?.length ?? 0), 0)
  } catch {
    return 0
  }
}

/** 自动上架的门槛：步数够、审计零问题、截图复核真的做了、做完没有退回 */
function verdict(job: Job): { ok: boolean; reason: string } {
  const steps = job.manualId ? stepCount(job.manualId) : 0
  if (steps < MIN_STEPS) return { ok: false, reason: `只有 ${steps} 步，内容太少（资料可能不是说明书，或者官网拦了截图）` }
  if (job.problems.length) return { ok: false, reason: `还有 ${job.problems.length} 个审计问题：${job.problems.slice(0, 2).join('；')}` }
  if (job.log.some((l) => l.msg.includes('保留复核前的版本'))) return { ok: false, reason: '截图复核发现问题、但修改没成功，退回了复核前的版本' }
  if (!job.log.some((l) => l.msg.startsWith('复核：'))) return { ok: false, reason: job.log.some((l) => l.msg.includes('跳过')) ? '截图复核没做成' : '没有做截图复核' }
  return { ok: true, reason: '' }
}

function follow(r: ItemRow, s: TrendSettings) {
  const job = r.job ? loadJob(r.job) : undefined
  if (!job) return fail(r, '生成任务不见了')
  if (job.status === 'running') {
    if (Date.now() - job.created < JOB_MAX_MS) return
    cancelJob(job.id, { id: TREND_USER.id, email: '', name: TREND_USER.name, hue: TREND_USER.hue, role: 'user' })
    return fail(r, `生成超过 ${JOB_MAX_MS / 3600000} 小时没结束，已取消，可以重新生成`)
  }
  if (job.status === 'error' && job.error?.startsWith('服务器重启过')) return resume(r, '生成到一半服务重启了')
  if (job.status !== 'done') return fail(r, job.status === 'cancelled' ? '生成任务被取消了' : `生成失败：${job.error ?? '未知错误'}`)
  if (job.kind !== 'scene' || !job.manualId) return fail(r, job.kind === 'not_manual' ? '模型判断这份资料做不成 3D 演示' : '这份资料走了参数化家具流程，热榜不处理')
  const v = verdict(job)
  const product = `manual:${job.manualId}`
  const d = { ...dataOf(r), doneAt: now() }
  if (v.ok && s.autoPublish) {
    try {
      return publish(save(r, d, { product }), TREND_USER.id)
    } catch (e) {
      return fail(item(r.key)!, `上架失败：${message(e)}`)
    }
  }
  const note = v.ok ? '复核通过；自动上架关着，等你确认' : `没有自动上架：${v.reason}`
  save(r, { ...d, note }, { status: 'held', product })
  logEvent(TREND_USER.id, 'trend_hold', product, `${job.name ?? r.name}：${note}`.slice(0, 200))
}

function publish(r: ItemRow, by: string) {
  const id = r.product?.replace(/^manual:/, '') ?? ''
  const file = join(IMPORT_DIR, id, 'spec.json')
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(file)) throw new HttpError(409, '生成的说明书不见了')
  const spec = JSON.parse(readFileSync(file, 'utf8')) as { name: string; category?: string }
  const d = dataOf(r)
  const category = str(spec.category, 20) || d.category || '电子产品'
  const body = [
    d.demoWhy && `3D 演示：${d.demoWhy}`,
    d.heatWhy && `为什么上热榜：${d.heatWhy}`,
    d.source?.url && `说明书来源：${d.source.url}`,
  ].filter(Boolean).join('\n')
  ensureUser()
  const post = publishManual(TREND_USER.id, {
    product: r.product!, title: str(spec.name, LIMITS.title), body: body.slice(0, LIMITS.body), category,
    tags: [...new Set([category.slice(0, LIMITS.tag), '3D 说明书', '热门'])],
  })
  save(r, { ...d, note: undefined, publishedAt: now() }, { status: 'published', post })
  logEvent(by, 'trend_publish', r.product, spec.name)
}

// ---------- 广场 ----------

/** GET /api/trends：广场按热度排序用。只给广场上看得到的说明书（库里已有的、热榜发布了的） */
export function hotList() {
  const t = Date.now()
  const best = new Map<string, { product: string; heat: number; name: string; why: string }>()
  for (const r of all<ItemRow>("select * from trend_items where product is not null and status in ('existing', 'published')")) {
    if (r.status === 'published' && !(r.post && one('select 1 from posts where id = ?', r.post))) continue
    const heat = liveHeat(r, t)
    if (heat < 10) continue
    const had = best.get(r.product!)
    if (!had || had.heat < heat) best.set(r.product!, { product: r.product!, heat, name: r.name, why: dataOf(r).heatWhy })
  }
  const list = [...best.values()].sort((a, b) => b.heat - a.heat).slice(0, 30)
  return { updated: lastDone()?.finished_at ?? null, items: list.map((x, i) => ({ ...x, rank: i + 1 })) }
}

// ---------- 后台 ----------

function itemView(r: ItemRow) {
  const d = dataOf(r)
  const prev = d.history.at(-2)?.heat
  return {
    key: r.key, name: r.name, brand: d.brand, model: d.model, category: d.category, status: r.status, note: d.note ?? null,
    heat: r.heat, live: liveHeat(r), demo: r.demo, delta: prev === undefined ? null : r.heat - prev, history: d.history.slice(-12).map((h) => h.heat),
    heatWhy: d.heatWhy, demoWhy: d.demoWhy, signals: d.signals, officialSite: d.officialSite, manualUrl: d.manualUrl,
    channels: d.channels ?? [], channelHeat: d.channelHeat ?? {},
    product: r.product, job: r.job, post: r.post, postLive: !!(r.post && one('select 1 from posts where id = ?', r.post)),
    matched: !!d.matched, auto: !!d.auto, source: d.source ?? null,
    firstSeen: r.first_seen, lastSeen: r.last_seen, startedAt: d.startedAt ?? null, doneAt: d.doneAt ?? null,
  }
}

/** 品牌榜的一行；items 是上榜产品里属于这个品牌的（按品牌名、别名对） */
function brandView(r: BrandRow, byBrand: Map<string, ItemRow[]>, t: number) {
  const d = brandData(r)
  const prev = d.history.at(-2)?.heat
  const mine = new Map<string, ItemRow>()
  for (const n of [r.key, ...d.aliases.map(norm)]) for (const i of byBrand.get(n) ?? []) mine.set(i.key, i)
  return {
    key: r.key, name: r.name, status: r.status, aliases: d.aliases, categories: d.categories, why: d.why, products: d.products,
    signals: d.signals, officialSite: d.officialSite, channels: d.channels, channelHeat: d.channelHeat,
    heat: r.heat, live: liveHeat(r, t), delta: prev === undefined ? null : r.heat - prev, history: d.history.slice(-12).map((h) => h.heat),
    items: [...mine.values()].map((i) => ({ key: i.key, name: i.name, status: i.status, live: liveHeat(i, t) })).sort((a, b) => b.live - a.live).slice(0, 8),
    firstSeen: r.first_seen, lastSeen: r.last_seen,
  }
}

function brandList() {
  const t = Date.now()
  const byBrand = new Map<string, ItemRow[]>()
  for (const i of items()) {
    if (i.status === 'ignored') continue
    const k = norm(dataOf(i).brand ?? '')
    if (k) byBrand.set(k, [...(byBrand.get(k) ?? []), i])
  }
  // 热度封顶 100 会并列：再比几个渠道都热、各渠道热度加起来
  const sum = (h: ChannelHeat = {}) => Object.values(h).reduce((s, x) => s + (x ?? 0), 0)
  return brands().map((r) => brandView(r, byBrand, t)).sort((a, b) =>
    (a.status === 'ignored' ? 1 : 0) - (b.status === 'ignored' ? 1 : 0) || b.live - a.live || b.channels.length - a.channels.length || sum(b.channelHeat) - sum(a.channelHeat))
}

function scanView(r: ScanRow) {
  return { ...r, data: JSON.parse(r.data || '{}') as Record<string, unknown> }
}

function overview() {
  const env = ctx?.env ?? {}
  const s = trendSettings()
  const cfg = searchConfig(env)
  const mode = cfg ? knownMode(cfg) : undefined
  const holder = getKv<{ pid?: number; until?: number }>('trend_lease')
  const order: Record<TrendStatus, number> = { generating: 0, sourcing: 1, queued: 2, held: 3, failed: 4, new: 5, published: 6, existing: 7, ignored: 9 }
  const list = items().map(itemView).sort((a, b) => (a.status === 'ignored' ? 1 : 0) - (b.status === 'ignored' ? 1 : 0) || b.live - a.live || order[a.status] - order[b.status])
  return {
    settings: s,
    state: {
      scanning,
      lastScan: lastScan() ? scanView(lastScan()!) : null,
      nextScanAt: nextScanAt(s),
      usedToday: usedToday(),
      search: { model: cfg?.model ?? null, mode: mode ?? null, label: mode ? MODE_LABEL[mode as SearchMode] : null, probe: getKv('trend_probe') ?? null },
      worker: holder?.until && holder.until > Date.now() ? { pid: holder.pid ?? null, self: holder.pid === process.pid } : null,
      tripo: tripoReady(env),
      ready: !!ctx && !!cfg,
    },
    items: list,
    brands: brandList(),
    scans: all<ScanRow>('select * from trend_scans order by at desc limit 20').map(scanView),
  }
}

async function probe(by: string) {
  const at = now()
  try {
    const r = await searchJson<{ date?: string; headline?: string; url?: string }>(ctx!.env,
      '你是联网搜索助手。只根据这次搜到的结果回答。',
      `联网搜索检测 · 今天是 ${dayOf()}（北京时间）。搜一条今天或昨天的中文科技新闻，只回 JSON：{"date":"新闻日期","headline":"标题","url":"链接"}`)
    const out = { ok: true, at, mode: r.mode, label: MODE_LABEL[r.mode], model: r.model, searched: r.searched, sample: r.data, usage: r.usage, citations: r.citations.slice(0, 3) }
    setKv('trend_probe', out)
    logEvent(by, 'trend_probe', null, `${MODE_LABEL[r.mode]}${r.searched === false ? '（没调用搜索）' : ''}`)
    return out
  } catch (e) {
    const out = { ok: false, at, error: message(e).slice(0, 600) }
    setKv('trend_probe', out)
    return out
  }
}

/** /api/admin/trends*（admin.ts 已经查过是管理员） */
export async function trendAdminRoutes(req: Req, res: Res, path: string, me: Me) {
  if (!ctx) throw new HttpError(501, '热榜只在开发服务器（npm run dev）和线上服务器上可用')
  const post = req.method === 'POST'
  if (path === '/api/admin/trends' && req.method === 'GET') return send(res, 200, overview())
  if (path === '/api/admin/trends/settings' && post) {
    const before = trendSettings()
    const next = cleanSettings(await readJson<Partial<TrendSettings>>(req), before)
    setKv('trend_settings', next)
    logEvent(me.id, 'trend_settings', null, `${next.auto ? '自动' : '手动'} · 每 ${next.intervalHours} 小时 · 每天 ${next.dailyLimit} 份 · 热度 ≥ ${next.minHeat} · 适合度 ≥ ${next.minDemo}${next.autoPublish ? ' · 复核通过自动上架' : ''} · 渠道 ${next.channels.map((c) => CHANNELS[c]).join('、')}`)
    return send(res, 200, overview())
  }
  if (path === '/api/admin/trends/scan' && post) return send(res, 200, { id: startScan('manual', me.id) })
  if (path === '/api/admin/trends/probe' && post) return send(res, 200, await probe(me.id))
  const mb = path.match(/^\/api\/admin\/trends\/brands\/([^/]+)$/)
  if (mb && post) {
    const r = one<BrandRow>('select * from trend_brands where key = ?', decodeURIComponent(mb[1]))
    if (!r) throw new HttpError(404, '没有这个品牌')
    const { action } = await readJson<{ action?: string }>(req)
    if (action !== 'ignore' && action !== 'restore') throw new HttpError(400, '不认识的操作')
    run('update trend_brands set status = ?, updated_at = ? where key = ?', action === 'ignore' ? 'ignored' : 'active', now(), r.key)
    return send(res, 200, overview())
  }
  const m = path.match(/^\/api\/admin\/trends\/items\/([^/]+)$/)
  if (m && post) {
    const r = item(decodeURIComponent(m[1]))
    if (!r) throw new HttpError(404, '没有这一条')
    const { action } = await readJson<{ action?: string }>(req)
    const d = dataOf(r)
    const busy = r.status === 'sourcing' || r.status === 'generating'
    switch (action) {
      case 'produce':
        if (busy || r.status === 'published') throw new HttpError(409, '这一条正在生成或已经上架了')
        save(r, { ...d, auto: false, resumed: undefined, queuedAt: now(), note: undefined }, { status: 'queued', ...(d.matched ? {} : { product: null }), job: null })
        logEvent(me.id, 'trend_queue', null, r.name)
        break
      case 'publish':
        if (r.status !== 'held' || !r.product) throw new HttpError(409, '只有生成好、等确认的才能上架')
        publish(r, me.id)
        break
      case 'unpublish':
        if (r.status !== 'published' || !r.post) throw new HttpError(409, '这一条没有上架')
        removePost(r.post)
        save(r, { ...d, note: '管理员下架了' }, { status: 'held', post: null })
        logEvent(me.id, 'trend_unpublish', r.product, r.name)
        break
      case 'cancel':
        if (!busy) throw new HttpError(409, '这一条没在生成')
        if (r.job) cancelJob(r.job, me)
        else fail(r, '管理员取消了')
        break
      case 'ignore':
        if (busy) throw new HttpError(409, '正在生成，先取消')
        save(r, { ...d, note: '管理员忽略了' }, { status: 'ignored' })
        break
      case 'restore':
        if (r.status !== 'ignored') throw new HttpError(409, '这一条没有被忽略')
        save(r, { ...d, note: undefined }, { status: d.matched ? 'existing' : r.post ? 'published' : r.product ? 'held' : 'new' })
        break
      default:
        throw new HttpError(400, '不认识的操作')
    }
    return send(res, 200, overview())
  }
  throw new HttpError(404, 'not found')
}
