import { groupOf } from './groups'
import type { FeedPost } from './seed'

/** 广场模型图里模型地面中心的位置（占画面比例）：渲染时（three/SpriteCanvas）和摆放时都按这个点对齐 */
export const SPRITE_ANCHOR = { x: 0.5, y: 0.74 }

/**
 * 首页广场的排布：每份 3D 说明书占一格地砖，格子按离画面中心的远近排成螺旋。
 * 搜索 / 选品类时最匹配的一份放正中间，其余命中的和跟它相关的围在周围，不相关的放外圈并变淡。
 */

/** 品类 → 大类：「相关」先看同品类，再看同大类 */
const FAMILY: Record<string, string> = {
  扫地机器人: '清洁', 清洁电器: '清洁',
  空调: '家电', 净水器: '家电', 小厨电: '家电', 卫浴: '家电',
  路由器: '数码', 智能摄像头: '数码', 电子产品: '数码', 游戏机: '数码', 打印机: '数码', 电脑装机: '数码',
  智能门锁: '安全', 安全应急: '安全',
  平板家具: '家具', 'DIY 家具': '家具',
  婴儿推车: '出行', 电动出行: '出行',
  折纸: '纸艺', 立体书: '纸艺',
  物理原理: '科学', 机械结构: '科学',
}

const BRANDS: [string, RegExp][] = [
  ['xiaomi', /小米|米家|xiaomi|智米|zhimi/i],
  ['roborock', /石头|roborock/i],
  ['ikea', /ikea|宜家/i],
  ['ecovacs', /科沃斯|ecovacs/i],
  ['dyson', /戴森|dyson/i],
  ['midea', /美的|midea/i],
  ['epson', /爱普生|epson/i],
  ['goodbaby', /好孩子|goodbaby/i],
  ['tplink', /tp-?link/i],
  ['nintendo', /nintendo|任天堂/i],
  ['nespresso', /nespresso|雀巢/i],
]

const brandOf = (p: FeedPost) => BRANDS.find(([, re]) => re.test(`${p.title} ${p.product}`))?.[0]

/** 两份说明书有多相关：同一产品 > 同品类 > 同大类，同品牌、共同话题加分 */
export function relatedness(a: FeedPost, b: FeedPost) {
  if (a.id === b.id) return 100
  let s = 0
  if (a.product === b.product) s += 8
  if (a.category === b.category) s += 5
  else if (FAMILY[a.category] && FAMILY[a.category] === FAMILY[b.category]) s += 2.5
  const brand = brandOf(a)
  if (brand && brand === brandOf(b)) s += 2
  const tags = new Set(a.tags.filter((t) => t !== a.category))
  for (const t of b.tags) if (t !== b.category && tags.has(t)) s += 0.4
  return s
}

const bigrams = (w: string) => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(i, i + 2))

/** 每个词在哪儿出现、按位置给分；整个词找不到时按两字片段算一半（「扫地机」也能碰到「扫拖机器人」） */
export function queryScore(p: FeedPost, q: string, author: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const fields: [string, number][] = [
    [p.title, 6],
    [`${p.category} ${groupOf(p.category)}`, 5],
    [`${p.product} ${brandOf(p) ?? ''}`, 4],
    [p.tags.join(' '), 3],
    [p.guides.map((g) => g.title).join(' '), 2],
    [p.guides.flatMap((g) => g.steps).join(' '), 1.5],
    [p.body, 1],
    [author, 1],
  ].map(([t, w]) => [String(t).toLowerCase(), Number(w)])
  let total = 0
  for (const w of words) {
    let best = 0
    for (const [text, weight] of fields) {
      if (text.includes(w)) best = Math.max(best, weight)
      else if (w.length > 2) {
        const parts = bigrams(w)
        const ratio = parts.filter((b) => text.includes(b)).length / parts.length
        if (ratio >= 0.5) best = Math.max(best, weight * ratio * 0.5)
      }
    }
    if (best === 0) return 0
    total += best
  }
  return total
}

export type Tone = 'best' | 'hit' | 'near' | 'far' | 'plain'

export interface Arrangement {
  order: FeedPost[]
  tone: Map<string, Tone>
  best?: FeedPost
  hits: number
}

/**
 * 没有搜索 / 品类时：从最热的一份开始，每次接上和上一份最相关的，螺旋上相邻的格子就是同类产品。
 * 有搜索 / 品类时：最匹配的放中间，其余命中的按匹配度、再按和它的相关度排；没命中的按相关度排在外圈。
 */
/** cat 是首页的大类（groups.ts），不是说明书自己的细品类；match 给了就按它筛（「热门」这种不按品类分的） */
export function arrange(posts: FeedPost[], opts: { q: string; cat: string; match?: (p: FeedPost) => boolean; popularity: (p: FeedPost) => number; author: (p: FeedPost) => string }): Arrangement {
  const { q, cat, match, popularity, author } = opts
  const tone = new Map<string, Tone>()
  const query = q.trim()
  if (!query && !match && cat === '全部') {
    const left = [...posts].sort((a, b) => popularity(b) - popularity(a))
    const order: FeedPost[] = []
    while (left.length) {
      const prev = order[order.length - 1]
      let k = 0
      if (prev) {
        let top = -Infinity
        left.forEach((p, i) => {
          const s = relatedness(prev, p) + popularity(p) * 0.02
          if (s > top) { top = s; k = i }
        })
      }
      order.push(left.splice(k, 1)[0])
    }
    for (const p of order) tone.set(p.id, 'plain')
    return { order, tone, hits: order.length }
  }

  const score = (p: FeedPost) => {
    if (match ? !match(p) : cat !== '全部' && groupOf(p.category) !== cat) return 0
    return query ? queryScore(p, query, author(p)) : 1 + popularity(p) * 0.001
  }
  const scored = posts.map((p) => ({ p, s: score(p) }))
  const hits = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || popularity(b.p) - popularity(a.p))
  const best = hits[0]?.p
  if (!best) {
    const order = [...posts].sort((a, b) => popularity(b) - popularity(a))
    for (const p of order) tone.set(p.id, 'far')
    return { order, tone, hits: 0 }
  }
  const top = hits[0].s
  const rest = hits.slice(1).sort((a, b) => b.s / top + relatedness(best, b.p) * 0.08 - (a.s / top + relatedness(best, a.p) * 0.08))
  const misses = scored.filter((x) => x.s === 0).map((x) => x.p).sort((a, b) => relatedness(best, b) - relatedness(best, a) || popularity(b) - popularity(a))
  tone.set(best.id, 'best')
  for (const x of rest) tone.set(x.p.id, 'hit')
  for (const p of misses) tone.set(p.id, relatedness(best, p) >= 2.5 ? 'near' : 'far')
  return { order: [best, ...rest.map((x) => x.p), ...misses], tone, best, hits: hits.length }
}

/** 等轴网格的格子 (i, j) → 以格宽为单位的画面坐标：x 往右，y 往下（2:1 菱形） */
export const slotXY = (i: number, j: number) => ({ x: (i - j) / 2, y: (i + j) / 4 })

/** 前 n 个格子：按地面上到中心格的距离排（先贴边的四格，再对角），同一圈先左右、再从正上方顺时针 */
export function spiral(n: number) {
  const r = Math.ceil(Math.sqrt(n)) + 2
  const all: { i: number; j: number; x: number; y: number; d: number; a: number }[] = []
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const { x, y } = slotXY(i, j)
      all.push({ i, j, x, y, d: Math.round(Math.hypot(i, j) * 1e4) / 1e4, a: (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2) })
    }
  }
  all.sort((a, b) => a.d - b.d || Math.abs(a.y) - Math.abs(b.y) || a.a - b.a)
  return all.slice(0, n)
}
