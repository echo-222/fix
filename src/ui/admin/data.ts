import { create } from 'zustand'
import type { JobBrief, ManualJob } from '../../ai/manualImport'
import { withBase } from '../../base'
import { apiFetch } from '../../net'

/** 管理后台的数据：/api/admin/*（server/admin.ts）+ 实时推送 /api/admin/stream */
export interface AdminEvent {
  id: number
  at: string
  user_id: string | null
  name: string | null
  kind: string
  target: string | null
  detail: string | null
  ip: string | null
}

export interface AdminUser {
  id: string
  email: string
  name: string
  hue: number
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  ban_reason: string | null
  invite: string | null
  created_at: string
  last_seen: string | null
  last_ip: string | null
  last_page: string | null
  posts: number
  comments: number
  likes: number
  saves: number
  views: number
}

export interface Overview {
  stats: Record<
    'users' | 'today' | 'online' | 'active' | 'banned' | 'manuals' | 'notes' | 'comments' | 'likes' | 'saves' | 'views' | 'invitesLeft' | 'imports' | 'importsToday' | 'importing',
    number
  >
  online: Pick<AdminUser, 'id' | 'name' | 'hue' | 'email' | 'last_seen' | 'last_page'>[]
  trend: { d: string; registered: number; active: number }[]
  hot: { target: string; views: number; saves: number; likes: number }[]
  events: AdminEvent[]
  /** 注册要不要邮箱验证码（服务器 EMAIL_VERIFY） */
  verify: boolean
  mail: boolean
  codes: { email: string; purpose: 'register' | 'reset'; plain: string; created_at: string; expires_at: string }[]
}

export interface UserDetail {
  user: AdminUser
  saves: { target: string; created_at: string }[]
  likes: { target: string; created_at: string }[]
  posts: { id: string; kind: string; title: string; product: string; created_at: string }[]
  comments: { id: string; post_id: string; text: string; created_at: string }[]
  sessions: { id: string; created_at: string; last_seen: string; ip: string | null; ua: string | null }[]
  events: AdminEvent[]
}

export interface Content {
  posts: { id: string; kind: string; title: string; product: string; created_at: string; author: string; name: string | null; email: string | null; comments: number; likes: number; saves: number }[]
  comments: { id: string; post_id: string; text: string; created_at: string; author: string; name: string | null; email: string | null }[]
}

/** 生成任务（网页导入）：所有人的，包括失败的、取消的、导入后被用户删掉的（deleted 是删除时间） */
export type AdminJob = JobBrief & { owner: string; ownerName: string | null; ownerEmail: string | null; deleted: string | null }

export interface JobDetail {
  job: ManualJob & { owner: string }
  ownerName: string | null
  ownerEmail: string | null
  /** 存下来的上传原页、产品照片张数（/api/manual/jobs/<id>/pages/<n>） */
  pages: number
  photos: number
  /** 中间产物文件名（/api/admin/imports/<id>/files/<name>） */
  files: string[]
  imported: { id: string; name: string; deleted: string | null; deletedBy: string | null } | null
}

/** 热榜（server/trends.ts）：联网扫描市场热度 → 自动生成 → 复核通过发到广场 */
export type TrendStatus = 'new' | 'existing' | 'queued' | 'sourcing' | 'generating' | 'published' | 'held' | 'failed' | 'ignored'

/** 信号渠道：每个渠道单独联网搜一遍，结果按产品 / 品牌并起来 */
export type TrendChannel = 'market' | 'xhs' | 'bili'
export const TREND_CHANNELS: Record<TrendChannel, string> = { market: '电商·新闻', xhs: '小红书', bili: 'B 站' }
export type TrendSignal = { title: string; url: string; ch?: TrendChannel }
export type ChannelHeat = Partial<Record<TrendChannel, number>>

export interface TrendItem {
  key: string
  name: string
  brand: string
  model: string
  category: string
  status: TrendStatus
  note: string | null
  /** 最近一次扫描的热度；live 是按多久没再上榜衰减后的 */
  heat: number
  live: number
  demo: number
  /** 和上一次扫描比 */
  delta: number | null
  history: number[]
  heatWhy: string
  demoWhy: string
  signals: TrendSignal[]
  officialSite: string
  manualUrl: string
  /** 最近一次扫描在哪些渠道上榜、各自的热度 */
  channels: TrendChannel[]
  channelHeat: ChannelHeat
  product: string | null
  job: string | null
  post: string | null
  postLive: boolean
  matched: boolean
  auto: boolean
  source: { url: string; kind: string; pages: number; total: number; from?: number; to?: number } | null
  firstSeen: string
  lastSeen: string
  startedAt: string | null
  doneAt: string | null
}

export interface TrendScan {
  id: string
  at: string
  trigger: 'auto' | 'manual'
  status: 'running' | 'done' | 'error'
  finished_at: string | null
  mode: string | null
  summary: string | null
  found: number
  queued: number
  error: string | null
  data: {
    model?: string; usage?: { input: number; output: number; cached: number }; searched?: boolean | null; fresh?: number
    brands?: number; freshBrands?: number; channels?: TrendChannelRun[]
    citations?: { url: string; title: string }[]; seconds?: number; warn?: string
  }
}

/** 一次扫描里一个渠道的结果 */
export interface TrendChannelRun {
  id: TrendChannel
  ok: boolean
  summary?: string
  items: number
  brands: number
  seconds: number
  usage?: { input: number; output: number; cached: number }
  searched?: boolean | null
  mode?: string
  error?: string
  warn?: string
  /** B 站公开接口取到的视频数、热搜词数 */
  bili?: { videos: number; hot: number }
}

export interface TrendBrand {
  key: string
  name: string
  status: 'active' | 'ignored'
  aliases: string[]
  categories: string[]
  why: string
  /** 模型说的眼下最火的几款 */
  products: string[]
  signals: TrendSignal[]
  officialSite: string
  channels: TrendChannel[]
  channelHeat: ChannelHeat
  heat: number
  live: number
  delta: number | null
  history: number[]
  /** 上榜产品里属于这个品牌的 */
  items: { key: string; name: string; status: TrendStatus; live: number }[]
  firstSeen: string
  lastSeen: string
}

export interface TrendSettings {
  auto: boolean
  intervalHours: number
  minHeat: number
  minDemo: number
  dailyLimit: number
  autoPublish: boolean
  appearance: boolean
  count: number
  brandCount: number
  channels: TrendChannel[]
  region: string
  focus: string
}

export type TrendProbe =
  | { ok: true; at: string; mode: string; label: string; model: string; searched: boolean | null; sample: { date?: string; headline?: string; url?: string } }
  | { ok: false; at: string; error: string }

export interface TrendOverview {
  settings: TrendSettings
  state: {
    scanning: string | null
    lastScan: TrendScan | null
    nextScanAt: number | null
    usedToday: { started: number; tried: number }
    search: { model: string | null; mode: string | null; label: string | null; probe: TrendProbe | null }
    /** 拿着调度租约的进程 */
    worker: { pid: number | null; self: boolean } | null
    tripo: boolean
    ready: boolean
  }
  items: TrendItem[]
  brands: TrendBrand[]
  scans: TrendScan[]
}

export type TrendAction = 'produce' | 'publish' | 'unpublish' | 'cancel' | 'ignore' | 'restore'

export interface Invite {
  code: string
  note: string
  max_uses: number
  uses: number
  disabled: number
  created_by: string | null
  created_at: string
  expires_at: string | null
  users: { id: string; name: string; email: string; created_at: string }[]
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await apiFetch(`/api/admin/${path}`, body === undefined ? undefined : { body })
  if (r.status === 401) location.reload()
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `服务器返回 ${r.status}`)
  return j as T
}

interface AdminState {
  overview: Overview | null
  users: AdminUser[] | null
  content: Content | null
  invites: Invite[] | null
  imports: AdminJob[] | null
  trends: TrendOverview | null
  details: Record<string, UserDetail>
  jobs: Record<string, JobDetail>
  /** 实时动态：首屏取概览里的 80 条，之后推送一条加一条 */
  live: AdminEvent[]
  connected: boolean
  error: string
  /** 刚生成的邀请码，显示在表单下面方便复制 */
  fresh: string[]

  refresh: (what: 'overview' | 'users' | 'imports' | 'trends' | 'content' | 'invites') => Promise<void>
  loadUser: (id: string) => Promise<void>
  loadJob: (id: string) => Promise<void>
  /** 热榜：保存设置、立即扫描、检测联网、对一条做操作；返回 false 表示失败（错误已提示） */
  trend: (path: 'settings' | 'scan' | 'probe' | `items/${string}` | `brands/${string}`, body?: unknown) => Promise<boolean>
  /** 重置密码（passwd）时返回临时密码 */
  act: (id: string, action: 'ban' | 'unban' | 'kick' | 'passwd' | 'role' | 'purge', extra?: { reason?: string; role?: string }) => Promise<string | undefined>
  remove: (kind: 'post' | 'comment', id: string) => Promise<void>
  createInvites: (b: { count: number; maxUses: number; note: string; days: number }) => Promise<void>
  toggleInvite: (code: string, disabled: boolean) => Promise<void>
  say: (error: string) => void
}

export const useAdmin = create<AdminState>()((set, get) => {
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  }
  return {
    overview: null,
    users: null,
    content: null,
    invites: null,
    imports: null,
    trends: null,
    details: {},
    jobs: {},
    live: [],
    connected: false,
    error: '',
    fresh: [],

    refresh: (what) => guard(async () => {
      if (what === 'overview') {
        const overview = await api<Overview>('overview')
        set((s) => ({ overview, live: s.live.length ? s.live : overview.events }))
      } else if (what === 'users') set({ users: (await api<{ users: AdminUser[] }>('users')).users })
      else if (what === 'imports') set({ imports: (await api<{ jobs: AdminJob[] }>('imports')).jobs })
      else if (what === 'trends') set({ trends: await api<TrendOverview>('trends') })
      else if (what === 'content') set({ content: await api<Content>('content') })
      else set({ invites: (await api<{ invites: Invite[] }>('invites')).invites })
    }),
    loadUser: (id) => guard(async () => {
      const d = await api<UserDetail>(`users/${id}`)
      set((s) => ({ details: { ...s.details, [id]: d } }))
    }),
    loadJob: (id) => guard(async () => {
      const d = await api<JobDetail>(`imports/${encodeURIComponent(id)}`)
      set((s) => ({ jobs: { ...s.jobs, [id]: d } }))
    }),
    trend: async (path, body = {}) => {
      let done = false
      await guard(async () => {
        const r = await api<TrendOverview | { id: string } | TrendProbe>(`trends/${path}`, body)
        if ('settings' in r) set({ trends: r })
        else await get().refresh('trends')
        done = true
      })
      return done
    },
    act: async (id, action, extra) => {
      let password: string | undefined
      await guard(async () => {
        const { password: temp, ...d } = await api<UserDetail & { password?: string }>(`users/${id}`, { action, ...extra })
        password = temp
        set((s) => ({ details: { ...s.details, [id]: d } }))
        get().refresh('users')
      })
      return password
    },
    remove: (kind, id) => guard(async () => {
      set({ content: await api<Content>('content/delete', { kind, id }) })
    }),
    createInvites: (b) => guard(async () => {
      const r = await api<{ codes: string[]; invites: Invite[] }>('invites', b)
      set({ invites: r.invites, fresh: r.codes })
    }),
    toggleInvite: (code, disabled) => guard(async () => {
      set({ invites: (await api<{ invites: Invite[] }>(`invites/${code}`, { disabled })).invites })
    }),
    say: (error) => set({ error }),
  }
})

/** 推送来一条动态后，相关的列表晚一点再整体刷新（短时间内多条只刷一次） */
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function later(key: string, fn: () => void, ms = 1200) {
  if (timers.has(key)) return
  timers.set(key, setTimeout(() => {
    timers.delete(key)
    fn()
  }, ms))
}

const CONTENT_KINDS = /^(post|publish|unpost|comment|uncomment|admin:unpost|admin:uncomment|admin:purge)$/

/** 连上实时推送；返回断开函数。断线后浏览器会按 retry 自动重连 */
export function connectLive() {
  const es = new EventSource(withBase('/api/admin/stream'))
  const s = useAdmin
  es.onopen = () => s.setState({ connected: true })
  es.onerror = () => s.setState({ connected: false })
  es.onmessage = (e) => {
    const m = JSON.parse(e.data) as { type: 'event'; event: AdminEvent } | { type: 'presence'; user: string }
    const { users, content, invites, imports, trends, details, jobs } = s.getState()
    later('overview', () => s.getState().refresh('overview'))
    if (users) later('users', () => s.getState().refresh('users'), 2000)
    if (m.type === 'presence') return
    const ev = m.event
    s.setState((st) => ({ live: [ev, ...st.live.filter((x) => x.id !== ev.id)].slice(0, 300) }))
    if (content && CONTENT_KINDS.test(ev.kind)) later('content', () => s.getState().refresh('content'))
    if (invites && /^(register|admin:invite)/.test(ev.kind)) later('invites', () => s.getState().refresh('invites'))
    if (/^import/.test(ev.kind)) {
      if (imports) later('imports', () => s.getState().refresh('imports'))
      for (const id of Object.keys(jobs)) later(`job:${id}`, () => s.getState().loadJob(id))
    }
    if (trends && /^(trend|import)/.test(ev.kind)) later('trends', () => s.getState().refresh('trends'))
    for (const id of [ev.user_id, ev.target]) if (id && details[id]) later(`user:${id}`, () => s.getState().loadUser(id))
  }
  // 没有新动态时，「在线」也要随时间变化（有人悄悄走了）
  const poll = setInterval(() => s.getState().refresh('overview'), 20_000)
  return () => {
    es.close()
    clearInterval(poll)
    s.setState({ connected: false })
  }
}
