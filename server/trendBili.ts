// 热榜的 B 站渠道：从 B 站公开接口（不登录、不带账号）取分区排行、全站热门和热搜，整理成一段实时数据交给模型，
// 让它从恰饭 / 测评 / 开箱 / 选购指南视频里认出正在被推的产品和品牌（接口不标哪条是商单，靠标题和简介判断）。
// 一次扫描只发六七个请求、每个间隔一秒多；碰上风控（-352 / -412）先领一个游客 buvid 再试一次，还不行就跳过那一项。
// 旧分区号（188 科技之类）的排行 2025 年起不再更新，这里用新分区号（tid v2）；家装房产、户外潮流的排行也停了，只能从全站热门里捞。

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const GAP_MS = 1200
/** 只要最近这么多天发布的视频 */
const FRESH_DAYS = 21

/** 还在更新的分区排行 */
const RANKS = [
  { rid: 1012, name: '科技数码', take: 40 },
  { rid: 1013, name: '汽车', take: 12 },
]
/** 全站热门里和产品沾边的分区：科技数码、汽车、时尚美妆、家装房产、户外潮流、健身、体育运动、亲子、医疗保健、生活兴趣、生活经验 */
const RELEVANT = new Set([1012, 1013, 1014, 1015, 1016, 1017, 1018, 1025, 1026, 1030, 1031])
const POPULAR_PAGES = 3
const POPULAR_TAKE = 30
const HOT_TAKE = 30

export interface BiliVideo {
  bvid: string
  title: string
  desc: string
  up: string
  zone: string
  view: number
  like: number
  days: number
}

export interface BiliDigest {
  at: string
  ranks: { name: string; videos: BiliVideo[] }[]
  popular: BiliVideo[]
  hot: { word: string; heat: number }[]
  /** 没取到的那几项和原因 */
  errors: string[]
}

interface RawVideo {
  bvid?: string
  title?: string
  desc?: string
  pubdate?: number
  pid_v2?: number
  pid_name_v2?: string
  tnamev2?: string
  owner?: { name?: string }
  stat?: { view?: number; like?: number }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const one = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

class Bili {
  cookie = ''
  base: string
  signal?: AbortSignal
  constructor(base: string, signal?: AbortSignal) {
    this.base = base
    this.signal = signal
  }

  private async raw(path: string) {
    const res = await fetch(this.base + path, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Accept: 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as { code?: number; message?: string; data?: any }
  }

  /** 领一个游客 buvid（B 站网页第一次打开时也是这么拿的） */
  private async visitor() {
    const j = await this.raw('/x/frontend/finger/spi')
    if (!j.data?.b_3) throw new Error('领不到游客标识')
    this.cookie = `buvid3=${j.data.b_3}${j.data.b_4 ? `; buvid4=${encodeURIComponent(j.data.b_4)}` : ''}`
  }

  async get(path: string) {
    let j = await this.raw(path)
    if ((j.code === -352 || j.code === -412) && !this.cookie) {
      await this.visitor()
      await sleep(GAP_MS)
      j = await this.raw(path)
    }
    if (j.code !== 0) throw new Error(`B 站返回 ${j.code}${j.message ? `（${j.message}）` : ''}`)
    return j.data
  }
}

function video(v: RawVideo, now: number): BiliVideo | null {
  if (!v.bvid || !v.title) return null
  const days = v.pubdate ? Math.max(0, Math.floor((now - v.pubdate * 1000) / 86400_000)) : 0
  if (days > FRESH_DAYS) return null
  const desc = one(v.desc, 60)
  return {
    bvid: v.bvid, title: one(v.title, 80), desc: desc === '-' ? '' : desc, up: one(v.owner?.name, 20),
    zone: [v.pid_name_v2, v.tnamev2].filter(Boolean).join('/'), view: Number(v.stat?.view) || 0, like: Number(v.stat?.like) || 0, days,
  }
}

/** 取一遍 B 站的实时数据；单项失败记进 errors，不整体失败 */
export async function biliSignals(opts: { base?: string; signal?: AbortSignal } = {}): Promise<BiliDigest> {
  const b = new Bili(opts.base || 'https://api.bilibili.com', opts.signal)
  const now = Date.now()
  const out: BiliDigest = { at: new Date(now).toISOString(), ranks: [], popular: [], hot: [], errors: [] }
  const seen = new Set<string>()
  const step = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      if (opts.signal?.aborted) throw e
      out.errors.push(`${what}：${e instanceof Error ? e.message : String(e)}`)
    }
    await sleep(GAP_MS)
  }
  for (const r of RANKS) {
    await step(`${r.name}排行`, async () => {
      const d = await b.get(`/x/web-interface/ranking/v2?rid=${r.rid}&type=all`)
      const list = ((d?.list ?? []) as RawVideo[]).filter((v) => v.pid_v2 === r.rid).map((v) => video(v, now)).filter((v): v is BiliVideo => !!v && !seen.has(v.bvid))
      list.slice(0, r.take).forEach((v) => seen.add(v.bvid))
      out.ranks.push({ name: r.name, videos: list.slice(0, r.take) })
    })
  }
  for (let pn = 1; pn <= POPULAR_PAGES && out.popular.length < POPULAR_TAKE; pn++) {
    await step(`全站热门第 ${pn} 页`, async () => {
      const d = await b.get(`/x/web-interface/popular?ps=50&pn=${pn}`)
      for (const v of (d?.list ?? []) as RawVideo[]) {
        if (!RELEVANT.has(Number(v.pid_v2))) continue
        const x = video(v, now)
        if (x && !seen.has(x.bvid) && out.popular.length < POPULAR_TAKE) {
          seen.add(x.bvid)
          out.popular.push(x)
        }
      }
    })
  }
  await step('热搜', async () => {
    const d = await b.get(`/x/web-interface/search/square?limit=${HOT_TAKE}`)
    out.hot = ((d?.trending?.list ?? []) as { keyword?: string; show_name?: string; heat_score?: number }[])
      .map((h) => ({ word: one(h.show_name || h.keyword, 30), heat: Number(h.heat_score) || 0 }))
      .filter((h) => h.word)
      .slice(0, HOT_TAKE)
  })
  return out
}

export const biliCount = (d: BiliDigest) => d.ranks.reduce((n, r) => n + r.videos.length, 0) + d.popular.length

const wan = (n: number) => (n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)} 万` : String(n))
const line = (v: BiliVideo, i: number) =>
  `${i + 1}. ${v.title} | UP ${v.up || '—'} | ${v.zone} | 播放 ${wan(v.view)} · 赞 ${wan(v.like)} | ${v.days ? `${v.days} 天前` : '今天'}${v.desc ? ` | 简介：${v.desc}` : ''} | https://www.bilibili.com/video/${v.bvid}`

/** 给模型看的一段文字 */
export function biliText(d: BiliDigest) {
  const parts = [`B 站公开接口的实时数据（${new Date(Date.parse(d.at) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')} 北京时间抓取，播放和点赞是累计数）：`]
  if (d.hot.length) parts.push(`热搜词：${d.hot.map((h) => h.word).join('、')}`)
  for (const r of d.ranks) if (r.videos.length) parts.push(`分区排行 · ${r.name}（最近 ${FRESH_DAYS} 天发布的，按 B 站综合排行）：`, ...r.videos.map(line))
  if (d.popular.length) parts.push('全站热门里和产品相关的分区：', ...d.popular.map(line))
  if (d.errors.length) parts.push(`（这几项没取到：${d.errors.join('；')}）`)
  return parts.join('\n')
}
