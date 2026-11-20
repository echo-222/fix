import { useMemo } from 'react'
import { create } from 'zustand'
import { logout as logoutApi, type Me } from '../auth/api'
import { apiFetch } from '../net'
import { applyOp, emptyDB, normalizeDB, type Comment, type CommunityDB, type Op, type Post } from './db'
import { LIBRARY_POSTS, SEED_USERS, hash, noteIdOf, seedComments, seedLikes, seedSaves, type FeedPost, type SeedUser } from './seed'

/**
 * 社区数据都在服务器上（server/community.ts），按登录的账号记：点赞、收藏、评论、发布。
 * 前端拿一整份 CommunityDB，点赞 / 收藏先用 applyOp 在界面上生效，服务器失败再退回。
 */
export type { Me }

const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** 登录失效（过期、被管理员下线 / 停用）：提示一下，刷新回到登录页 */
let expiring = false
function expired() {
  if (expiring) return
  expiring = true
  useCommunity.getState().say('登录已失效，请重新登录')
  setTimeout(() => location.reload(), 1200)
}

async function json<T>(r: Response): Promise<T> {
  if (r.status === 401) expired()
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `服务器返回 ${r.status}`)
  return j as T
}

const post = (url: string, body: unknown) => apiFetch(url, { body })

export interface PublishInput {
  product: string
  kind: Post['kind']
  title: string
  body: string
  category: string
  tags: string[]
  /** data URL，发布时上传 */
  images: string[]
}

export interface PublishOpen { product?: string; note?: boolean }

interface CommunityState {
  status: 'loading' | 'ready'
  db: CommunityDB
  me: Me
  /** 最近一次失败的提示，显示成 toast */
  toast: string
  /** product：预选关联的说明书；note：跳过「上传 / 写笔记」二选一，直接写笔记 */
  publishOpen: false | PublishOpen

  load: (me: Me | null) => Promise<void>
  like: (target: string) => void
  save: (target: string) => void
  comment: (postId: string, text: string, replyTo?: string) => Promise<void>
  uncomment: (id: string) => Promise<void>
  publish: (input: PublishInput) => Promise<string>
  unpost: (id: string) => Promise<void>
  rename: (name: string) => Promise<void>
  logout: () => Promise<void>
  openPublish: (v: false | PublishOpen) => void
  say: (toast: string) => void
}

const GUEST: Me = { id: 'u-guest', email: '', name: '游客', hue: 0, role: 'user' }

export const useCommunity = create<CommunityState>()((set, get) => {
  /** 服务器给的那份里只有发过内容的人；自己没发过时也要认得出自己 */
  const put = (raw: unknown) => {
    const db = normalizeDB(raw)
    const { me } = get()
    if (!db.users[me.id]) db.users[me.id] = { name: me.name, hue: me.hue }
    set({ db })
  }
  /** 发给服务器执行一次操作（用户 id 由服务器按登录的账号填），拿回最新数据 */
  const send = async (op: Op) => {
    const r = await json<{ db: CommunityDB }>(await post('/api/community/op', { op }))
    put(r.db)
  }
  const fail = (e: unknown) => {
    get().say(e instanceof Error ? e.message : String(e))
  }
  /** 点赞 / 收藏先在界面上生效，服务器失败再退回 */
  const optimistic = (op: Op) => {
    const before = get().db
    try {
      set({ db: applyOp(before, op, () => true) })
    } catch (e) {
      return fail(e)
    }
    send(op).catch((e) => {
      set({ db: before })
      fail(e)
    })
  }
  const uploadImage = async (data: string) => (await json<{ url: string }>(await post('/api/community/media', { data }))).url

  return {
    status: 'loading',
    db: emptyDB(),
    me: GUEST,
    toast: '',
    publishOpen: false,

    load: async (me) => {
      if (me) set({ me })
      try {
        const r = await apiFetch('/api/community')
        if (r.ok && r.headers.get('content-type')?.includes('json')) put(((await r.json()) as { db: unknown }).db)
      } catch {
        // 截图脚本的纯 3D 画面不需要社区数据
      }
      set({ status: 'ready' })
    },
    like: (target) => {
      const { db, me } = get()
      optimistic({ type: 'like', user: me.id, target, on: !db.likes[target]?.includes(me.id) })
    },
    save: (target) => {
      const { db, me } = get()
      optimistic({ type: 'save', user: me.id, target, on: !db.saves[target]?.includes(me.id) })
    },
    comment: async (postId, text, replyTo) => {
      try {
        await send({ type: 'comment', user: get().me.id, comment: { id: rid('c'), postId, text, replyTo } })
      } catch (e) {
        fail(e)
        throw e
      }
    },
    uncomment: async (id) => {
      try {
        await send({ type: 'uncomment', user: get().me.id, id })
      } catch (e) {
        fail(e)
      }
    },
    publish: async (input) => {
      try {
        const images = await Promise.all(input.images.map(uploadImage))
        const id = rid('p')
        const { images: _, ...rest } = input
        await send({ type: 'post', user: get().me.id, post: { ...rest, id, images } })
        return id
      } catch (e) {
        fail(e)
        throw e
      }
    },
    unpost: async (id) => {
      try {
        await send({ type: 'unpost', user: get().me.id, id })
      } catch (e) {
        fail(e)
      }
    },
    rename: async (name) => {
      const before = get().me
      const me = { ...before, name: name.trim().slice(0, 16) || before.name }
      set({ me })
      try {
        await send({ type: 'user', user: me.id, name: me.name, hue: me.hue })
      } catch (e) {
        set({ me: before })
        fail(e)
      }
    },
    logout: async () => {
      try {
        await logoutApi()
      } finally {
        location.reload()
      }
    },
    openPublish: (v) => set({ publishOpen: v }),
    say: (toast) => set({ toast }),
  }
})

/**
 * 在线状态：页面开着时每分钟报一次「我在、在看哪一页」，打开说明书 / 笔记时报一次「打开了」。
 * 管理后台的「在线」「正在看」「热门」就是这么来的。
 */
export function startPresence() {
  const beat = (target?: string) => {
    post('/api/track', { kind: target ? 'view' : 'ping', target, page: location.hash || '#/' })
      .then((r) => r.status === 401 && expired())
      .catch(() => {})
  }
  const onRoute = () => {
    const note = location.hash.match(/^#\/note\/([^/?#]+)/)
    beat(note ? decodeURIComponent(note[1]) : undefined)
  }
  onRoute()
  window.addEventListener('hashchange', onRoute)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beat())
  setInterval(() => document.visibilityState === 'visible' && beat(), 60_000)
}

// ---------- 读数据的工具 ----------

export function authorOf(db: CommunityDB, id: string): SeedUser {
  return SEED_USERS[id] ?? db.users[id] ?? { name: '匿名用户', hue: hash(id) % 360 }
}

export const likeCount = (db: CommunityDB, target: string) => seedLikes(target) + (db.likes[target]?.length ?? 0)
export const saveCount = (db: CommunityDB, target: string) => seedSaves(target) + (db.saves[target]?.length ?? 0)

/** 库里的说明书笔记 + 用户发布的笔记（发布过的导入说明书不再显示草稿） */
export function buildFeed(db: CommunityDB): FeedPost[] {
  const byProduct = new Map(LIBRARY_POSTS.map((p) => [p.product, p]))
  const user: FeedPost[] = db.posts.map((p) => {
    const lib = byProduct.get(p.product)
    return { ...p, guides: lib?.guides ?? [], realLook: lib?.realLook }
  })
  const published = new Set(user.filter((p) => p.kind === 'manual').map((p) => p.product))
  return [...LIBRARY_POSTS.filter((p) => !(p.draft && published.has(p.product))), ...user]
}

export function useFeed() {
  const db = useCommunity((s) => s.db)
  return useMemo(() => buildFeed(db), [db])
}

/** m-<产品> 指向已发布的导入说明书时，换成那篇用户笔记 */
export function findPost(feed: FeedPost[], id: string) {
  const hit = feed.find((p) => p.id === id)
  if (hit) return hit
  return id.startsWith('m-') ? feed.find((p) => p.kind === 'manual' && noteIdOf(p.product) === id) : undefined
}

export function commentsOf(db: CommunityDB, post: FeedPost): Comment[] {
  return [...seedComments(post), ...db.comments.filter((c) => c.postId === post.id)].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function commentCount(db: CommunityDB, post: FeedPost) {
  return commentsOf(db, post).length
}

export function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return '刚刚'
  if (ms < 3600000) return `${Math.floor(ms / 60000)} 分钟前`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)} 小时前`
  if (ms < 30 * 86400000) return `${Math.floor(ms / 86400000)} 天前`
  const d = new Date(iso)
  return `${d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}-`}${d.getMonth() + 1}-${d.getDate()}`
}

export const compact = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
