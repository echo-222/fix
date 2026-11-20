/**
 * 社区数据：用户发布的笔记、评论、点赞、收藏。服务器存在 SQLite 里（server/community.ts），按登录的账号记。
 * 前端（乐观更新）和服务器（校验）共用这里的 applyOp，规则只写一份；服务器会把 op.user 换成登录的账号。
 * 官方说明书对应的笔记不进库：前端从说明书库生成（见 seed.ts）。
 */

export interface User {
  name: string
  /** 头像底色的色相 */
  hue: number
}

/** id 前缀：u- 用户，p- 用户发布的笔记，c- 评论；说明书库自带的笔记是 m-<产品>、示例评论是 s-…，都不存库 */
export interface Post {
  id: string
  /** 'desk' | 'shelf' | 'table' | 'rack' | 'manual:<id>' */
  product: string
  /** manual：发布一份 3D 说明书；note：围绕某份说明书写的使用笔记 */
  kind: 'manual' | 'note'
  title: string
  body: string
  category: string
  tags: string[]
  /** 图片地址：服务器模式是 /api/community/media/…，本机模式是压缩后的 data URL */
  images: string[]
  author: string
  createdAt: string
}

export interface Comment {
  id: string
  postId: string
  author: string
  text: string
  /** 回复哪条评论 */
  replyTo?: string
  createdAt: string
}

export interface CommunityDB {
  version: 1
  users: Record<string, User>
  posts: Post[]
  comments: Comment[]
  /** 笔记 id 或评论 id → 点赞的用户 id */
  likes: Record<string, string[]>
  /** 笔记 id → 收藏的用户 id */
  saves: Record<string, string[]>
}

export type Op =
  | { type: 'user'; user: string; name: string; hue: number }
  | { type: 'like'; user: string; target: string; on: boolean }
  | { type: 'save'; user: string; target: string; on: boolean }
  | { type: 'comment'; user: string; comment: Pick<Comment, 'id' | 'postId' | 'text' | 'replyTo'> }
  | { type: 'uncomment'; user: string; id: string }
  | { type: 'post'; user: string; post: Omit<Post, 'author' | 'createdAt'> }
  | { type: 'unpost'; user: string; id: string }

export const LIMITS = { name: 16, title: 40, body: 2000, comment: 500, images: 6, tags: 6, tag: 12 }

export const emptyDB = (): CommunityDB => ({ version: 1, users: {}, posts: [], comments: [], likes: {}, saves: {} })

const ID = /^[a-z]-[\w-]{4,40}$/
const PRODUCT = /^(desk|shelf|table|rack|manual:[a-z0-9-]+)$/
const TARGET = /^[a-z]-[\w:-]{1,60}$/

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function toggle(map: Record<string, string[]>, target: string, user: string, on: boolean) {
  const set = new Set(map[target] ?? [])
  if (on) set.add(user)
  else set.delete(user)
  if (set.size) map[target] = [...set]
  else delete map[target]
}

/** 校验并应用一次操作；不合法时抛错（服务器返回 400） */
export function applyOp(db: CommunityDB, op: Op, isImage: (src: string) => boolean, now = new Date()): CommunityDB {
  if (!op || typeof op !== 'object' || typeof op.user !== 'string' || !ID.test(op.user)) throw new Error('缺少用户')
  const next: CommunityDB = structuredClone(db)
  const at = now.toISOString()
  switch (op.type) {
    case 'user': {
      const name = text(op.name, LIMITS.name)
      if (!name) throw new Error('昵称不能为空')
      next.users[op.user] = { name, hue: Math.round(Number(op.hue) || 0) % 360 }
      return next
    }
    case 'like':
    case 'save': {
      if (typeof op.target !== 'string' || !TARGET.test(op.target)) throw new Error('目标不存在')
      toggle(op.type === 'like' ? next.likes : next.saves, op.target, op.user, !!op.on)
      return next
    }
    case 'comment': {
      const c = op.comment
      const body = text(c?.text, LIMITS.comment)
      if (!c || !ID.test(c.id) || typeof c.postId !== 'string' || !TARGET.test(c.postId)) throw new Error('评论格式不对')
      if (!body) throw new Error('评论不能为空')
      if (next.comments.some((x) => x.id === c.id)) throw new Error('评论已存在')
      next.comments.push({ id: c.id, postId: c.postId, author: op.user, text: body, ...(c.replyTo && TARGET.test(c.replyTo) ? { replyTo: c.replyTo } : {}), createdAt: at })
      return next
    }
    case 'uncomment': {
      const c = next.comments.find((x) => x.id === op.id)
      if (!c) throw new Error('评论不存在')
      if (c.author !== op.user) throw new Error('只能删除自己的评论')
      next.comments = next.comments.filter((x) => x.id !== op.id && x.replyTo !== op.id)
      delete next.likes[op.id]
      return next
    }
    case 'post': {
      const p = op.post
      if (!p || !ID.test(p.id) || !p.id.startsWith('p-')) throw new Error('笔记格式不对')
      if (typeof p.product !== 'string' || !PRODUCT.test(p.product)) throw new Error('没有关联说明书')
      if (next.posts.some((x) => x.id === p.id)) throw new Error('笔记已存在')
      const title = text(p.title, LIMITS.title)
      if (!title) throw new Error('标题不能为空')
      const images = (Array.isArray(p.images) ? p.images : []).filter((s) => typeof s === 'string' && isImage(s)).slice(0, LIMITS.images)
      const tags = [...new Set((Array.isArray(p.tags) ? p.tags : []).map((t) => text(t, LIMITS.tag).replace(/^#/, '')).filter(Boolean))].slice(0, LIMITS.tags)
      next.posts.push({
        id: p.id, product: p.product, kind: p.kind === 'manual' ? 'manual' : 'note', title, body: text(p.body, LIMITS.body),
        category: text(p.category, 20) || '其他', tags, images, author: op.user, createdAt: at,
      })
      return next
    }
    case 'unpost': {
      const p = next.posts.find((x) => x.id === op.id)
      if (!p) throw new Error('笔记不存在')
      if (p.author !== op.user) throw new Error('只能删除自己的笔记')
      const gone = new Set(next.comments.filter((c) => c.postId === op.id).map((c) => c.id))
      next.posts = next.posts.filter((x) => x.id !== op.id)
      next.comments = next.comments.filter((c) => c.postId !== op.id)
      for (const id of [op.id, ...gone]) delete next.likes[id]
      delete next.saves[op.id]
      return next
    }
    default:
      throw new Error('未知操作')
  }
}

/** 读到的旧文件 / 手改过的文件补齐字段 */
export function normalizeDB(raw: unknown): CommunityDB {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<CommunityDB>
  return {
    version: 1,
    users: d.users && typeof d.users === 'object' ? d.users : {},
    posts: Array.isArray(d.posts) ? d.posts : [],
    comments: Array.isArray(d.comments) ? d.comments : [],
    likes: d.likes && typeof d.likes === 'object' ? d.likes : {},
    saves: d.saves && typeof d.saves === 'object' ? d.saves : {},
  }
}
