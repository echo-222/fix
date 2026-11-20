import { DEFAULT_CONFIG, generateDesk } from '../domain/desk'
import { buildGuides } from '../domain/guides'
import { MANUALS } from '../domain/manual/library'
import { IMPORTED_AS, IMPORTED_CATEGORY, IMPORTED_FOREIGN } from '../domain/manual/library/imported'
import { PRODUCTS, SHAFT_DEFAULTS, buildShaft, type ShaftKind } from '../domain/products'
import type { Comment, Post, User } from './db'

/**
 * 说明书库自带的笔记（每份说明书一篇，id 为 m-<产品>）和示例互动。
 * 示例的点赞数、评论、示例用户只是为了让原型看起来像社区，不进数据库；上线前把 DEMO_ACTIVITY 关掉。
 */
export const DEMO_ACTIVITY = true

export const OFFICIAL = 'u-official'
/** 网页导入、还没发布的说明书，作者显示成这个 */
export const LOCAL_UPLOADER = 'u-local'

export interface SeedUser extends User {
  badge?: string
}

export const SEED_USERS: Record<string, SeedUser> = {
  [OFFICIAL]: { name: '懂了官方', hue: 8, badge: '官方' },
  [LOCAL_UPLOADER]: { name: '我导入的', hue: 0 },
  'u-demo-mujiang': { name: '周末木匠', hue: 28 },
  'u-demo-laowang': { name: '数码老王', hue: 210 },
  'u-demo-xiaochen': { name: '租房小陈', hue: 160 },
  'u-demo-alin': { name: '宝妈阿琳', hue: 330 },
  'u-demo-geek': { name: '极客K', hue: 262 },
  'u-demo-newbie': { name: '装机小白', hue: 190 },
  'u-demo-liu': { name: '家电维修刘师傅', hue: 40 },
  'u-demo-cat': { name: '猫和扫地机', hue: 120 },
}
const DEMO_IDS = Object.keys(SEED_USERS).filter((id) => id.startsWith('u-demo-'))

export interface GuideInfo {
  id: string
  title: string
  kind: 'usage' | 'assembly' | 'repair'
  steps: string[]
}

/** 首页卡片、笔记页用的笔记：库里存的 Post 加上说明书信息 */
export interface FeedPost extends Post {
  official?: boolean
  /** 网页导入、还没发布到社区的说明书 */
  draft?: boolean
  /** 别人导入的草稿（只有管理员拿得到）或已删除的：能打开看，不进首页和「我的」 */
  foreign?: boolean
  guides: GuideInfo[]
  realLook?: boolean
  /** 折纸、立体书、原理演示这类教程：没有说明书，文案按「参考资料」写 */
  tutorial?: boolean
}

export const DIY_CATEGORY = 'DIY 家具'

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export const noteIdOf = (product: string) => `m-${product.replace(/^manual:/, '')}`
export const slugOf = (product: string) => product.replace(/^manual:/, '')

const KIND_TAG = { usage: '使用', assembly: '安装', repair: '故障排查' } as const
const TUTORIAL_TAG = { usage: '原理动画', assembly: '分步教程', repair: '常见问题' } as const
/** 教程品类 → 标签：手工类跟着做，科普类看原理 */
const CRAFT = new Set(['折纸', '立体书'])
const DAY = 86400000
/** 示例数据的时间以页面打开时刻倒推，看起来总是「最近」 */
const NOW = Date.now()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function official(product: string, title: string, desc: string, category: string, guides: GuideInfo[], extra: Partial<FeedPost> = {}): FeedPost {
  const id = noteIdOf(product)
  const steps = guides.reduce((n, g) => n + g.steps.length, 0)
  const tutorial = !!extra.tutorial
  const kinds = [...new Set(guides.map((g) => (tutorial ? TUTORIAL_TAG : KIND_TAG)[g.kind]))]
  const list = `${guides.length} 个指南、共 ${steps} 步：${guides.map((g) => `「${g.title}」`).join('')}。`
  const body = tutorial
    ? `${desc}\n\n${list}拖动可以 360° 转着看，步骤和数字按参考资料整理，每一步都重新画成了 3D 动画${CRAFT.has(category) ? '，翻到背面、压在底下的那一层也看得见' : '，动起来看原理'}。`
    : `${desc}\n\n${list}拖动可以 360° 转着看，每一步的动作、接口和指示灯都按说明书原文做成了 3D 动画。`
  const genre = tutorial ? [CRAFT.has(category) ? '手工' : '科普'] : []
  return {
    id, product, kind: 'manual', title, body, category, tags: [category, ...genre, ...kinds, ...(extra.realLook ? ['真实外观'] : [])],
    images: [], author: OFFICIAL, createdAt: ago((hash(id) % 50) * DAY + (hash(id) % 23) * 3600000), official: true, guides, ...extra,
  }
}

function parametric(): FeedPost[] {
  const desk = generateDesk(DEFAULT_CONFIG)
  const guidesOf = (id: string) => {
    const list = id === 'desk' ? buildGuides(desk) : buildShaft(SHAFT_DEFAULTS[id as ShaftKind]).guides
    return list.map((g) => ({ id: g.id, title: g.title, kind: g.kind, steps: g.steps.map((s) => s.title) }))
  }
  return PRODUCTS.filter((p) => !p.id.startsWith('manual:')).map((p) =>
    official(p.id, p.name, `${p.desc}。尺寸、板材、配件都能改，3D 安装步骤跟着实时更新。`, DIY_CATEGORY, guidesOf(p.id), { tags: [DIY_CATEGORY, p.family, '安装', '可改尺寸'] }),
  )
}

/** 说明书库里每份说明书一篇官方笔记；网页导入的是草稿 */
export const LIBRARY_POSTS: FeedPost[] = [
  ...MANUALS.map((m) => {
    const guides = m.guides.map((g) => ({ id: g.id, title: g.title, kind: g.kind, steps: g.steps.map((s) => s.title) }))
    const realLook = m.parts.some((p) => !!p.model) || !!m.finishes
    if (m.category === IMPORTED_CATEGORY) {
      const category = IMPORTED_AS.get(m.id) ?? IMPORTED_CATEGORY
      return {
        ...official(`manual:${m.id}`, m.name, m.desc, category, guides, { realLook, ...(m.genre === 'tutorial' ? { tutorial: true } : {}) }),
        official: false, draft: true, author: LOCAL_UPLOADER, ...(IMPORTED_FOREIGN.has(m.id) ? { foreign: true } : {}),
      }
    }
    return official(`manual:${m.id}`, m.name, m.desc, m.category, guides, { realLook, ...(m.genre === 'tutorial' ? { tutorial: true } : {}) })
  }),
  ...parametric(),
]

// ---------- 示例互动 ----------

const OFFICIAL_IDS = new Set(LIBRARY_POSTS.filter((p) => p.official).map((p) => p.id))

export function seedLikes(target: string) {
  if (!DEMO_ACTIVITY) return 0
  const h = hash(target)
  if (OFFICIAL_IDS.has(target)) return 24 + (h % 900) * (h % 7 === 0 ? 3 : 1)
  if (target.startsWith('s-')) return h % 38
  return 0
}

export function seedSaves(target: string) {
  return DEMO_ACTIVITY && OFFICIAL_IDS.has(target) ? 6 + (hash(target + 'save') % 260) : 0
}

function templates(p: FeedPost): { text: string; reply?: string }[] {
  const main = p.guides[0]
  const pickStep = main && main.steps.length > 2 ? Math.min(main.steps.length - 1, 1 + (hash(p.id) % (main.steps.length - 1))) : -1
  const repair = p.guides.find((g) => g.kind === 'repair')
  const total = p.guides.reduce((n, g) => n + g.steps.length, 0)
  const assembly = p.guides.some((g) => g.kind === 'assembly')
  if (p.tutorial) {
    const craft = CRAFT.has(p.category)
    return [
      craft
        ? { text: '跟着 3D 一步步做，比看平面图解清楚多了，翻到底下的那一层终于看懂了。' }
        : { text: '动起来一看就懂，比课本上的示意图直观太多了。' },
      pickStep > 0 && { text: `第 ${pickStep + 1} 步「${main.steps[pickStep]}」之前一直没弄明白，转着看了两圈就会了。` },
      craft
        ? { text: '带孩子一起做的，第一次就成功了，玩了一下午。' }
        : { text: '给孩子讲原理正好用上，数字和公式都标在旁边。' },
      { text: `${total} 步拆得刚刚好，暂停在哪一步都能转着看。` },
      { text: '收藏了，下次忘了怎么弄再回来看。' },
      craft
        ? { text: '能出个难一点的吗？比如千纸鹤、会动的立体贺卡。', reply: '收到，已经记进待做清单。' }
        : { text: '能不能再出几个？比如凸轮、离合器、电磁铁。', reply: '收到，已经记进待做清单，做好了会发在这个品类下面。' },
    ].filter((t): t is { text: string; reply?: string } => !!t)
  }
  return [
    { text: '跟着 3D 转着看，比纸质说明书清楚多了，终于知道每个零件长什么样。' },
    pickStep > 0 && { text: `第 ${pickStep + 1} 步「${main.steps[pickStep]}」之前一直没弄明白，看了动画一下就懂了。` },
    repair && { text: `「${repair.title}」这个排查顺序很实用，按着一步步走，问题自己就解决了，省了一次上门。` },
    p.realLook && { text: '打开「真实外观」以后和实物几乎一样，找按键、接口方便多了。' },
    assembly && { text: `${total} 步拆得很细，零件对着清单一个个找，一次就装好了。` },
    !assembly && total > 25 && { text: `${total} 步也太细了，连拆包装、撕保护膜都有。新手友好。` },
    { text: '收藏了，下次忘了怎么弄再回来看。' },
    { text: `能不能出一份同系列其他型号的？家里那台是老款。`, reply: '收到，已经记进待做清单。也可以直接上传那台的说明书 PDF，AI 会生成一份 3D 版。' },
  ].filter((t): t is { text: string; reply?: string } => !!t)
}

export function seedComments(p: FeedPost): Comment[] {
  if (!DEMO_ACTIVITY || !p.official) return []
  const pool = templates(p)
  const h = hash(p.id)
  const n = 1 + (h % 3)
  const out: Comment[] = []
  const base = new Date(p.createdAt).getTime()
  for (let i = 0; i < n; i++) {
    const t = pool[(h + i * 3) % pool.length]
    if (out.some((c) => c.text === t.text)) continue
    const id = `s-${slugOf(p.product)}-${i}`
    const at = Math.min(NOW - 60000, base + (i + 1) * ((h % 9) + 2) * 3600000)
    out.push({ id, postId: p.id, author: DEMO_IDS[(h + i * 5) % DEMO_IDS.length], text: t.text, createdAt: new Date(at).toISOString() })
    if (t.reply) out.push({ id: `${id}-r`, postId: p.id, author: OFFICIAL, text: t.reply, replyTo: id, createdAt: new Date(Math.min(NOW - 30000, at + 5 * 3600000)).toISOString() })
  }
  return out
}
