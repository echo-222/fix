import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyOp, type Comment, type CommunityDB, type Op, type Post } from '../src/community/db.ts'
import { SCRIPT_USER, type Me } from './auth.ts'
import { broadcast, logEvent } from './events.ts'
import { HttpError, clientIp, readJson, send, type Req, type Res } from './http.ts'
import { MEDIA_DIR, all, now, one, run, tx } from './sql.ts'

/**
 * 社区接口：笔记、评论、点赞、收藏都记在 SQLite 里，按登录的账号算；图片存在 data/community-media/。
 * 前端拿到的还是 CommunityDB 这一整份（规则在 src/community/db.ts 的 applyOp，前后端共用），
 * 服务器用 applyOp 校验后，把这一次的变化写进对应的表，再记一条行为流水。
 */
const MEDIA_URL = '/api/community/media/'
const MEDIA_NAME = /^[a-f0-9]{24}\.(jpg|png|webp)$/
const TARGET = /^[a-z]-[\w:-]{1,60}$/
const MAX_OP = 64 * 1024
const MAX_IMAGE = 6 * 1024 * 1024
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

interface PostRow { id: string; author: string; product: string; kind: string; title: string; body: string; category: string; tags: string; images: string; created_at: string }
interface CommentRow { id: string; post_id: string; author: string; text: string; reply_to: string | null; created_at: string }

let cache: CommunityDB | null = null
const invalidate = () => {
  cache = null
}

function marks(table: 'likes' | 'saves') {
  const out: Record<string, string[]> = {}
  for (const r of all<{ target: string; user_id: string }>(`select target, user_id from ${table} order by created_at`)) (out[r.target] ??= []).push(r.user_id)
  return out
}

export function communityDoc(): CommunityDB {
  if (cache) return cache
  const posts: Post[] = all<PostRow>('select * from posts order by created_at').map((p) => ({
    id: p.id, product: p.product, kind: p.kind === 'manual' ? 'manual' : 'note', title: p.title, body: p.body, category: p.category,
    tags: JSON.parse(p.tags) as string[], images: JSON.parse(p.images) as string[], author: p.author, createdAt: p.created_at,
  }))
  const comments: Comment[] = all<CommentRow>('select * from comments order by created_at').map((c) => ({
    id: c.id, postId: c.post_id, author: c.author, text: c.text, ...(c.reply_to ? { replyTo: c.reply_to } : {}), createdAt: c.created_at,
  }))
  const users: CommunityDB['users'] = {}
  for (const u of all<{ id: string; name: string; hue: number }>('select id, name, hue from users where id in (select author from posts union select author from comments)')) {
    users[u.id] = { name: u.name, hue: u.hue }
  }
  cache = { version: 1, users, posts, comments, likes: marks('likes'), saves: marks('saves') }
  return cache
}

/** 删一条评论连同它下面的回复、它们收到的赞（作者自己删和管理员删都走这里） */
export function removeComment(id: string) {
  const ids = [id, ...all<{ id: string }>('select id from comments where reply_to = ?', id).map((r) => r.id)]
  tx(() => {
    for (const x of ids) {
      run('delete from comments where id = ?', x)
      run('delete from likes where target = ?', x)
    }
  })
  invalidate()
}

export function removePost(id: string) {
  const ids = all<{ id: string }>('select id from comments where post_id = ?', id).map((r) => r.id)
  tx(() => {
    run('delete from posts where id = ?', id)
    run('delete from comments where post_id = ?', id)
    for (const x of [id, ...ids]) run('delete from likes where target = ?', x)
    run('delete from saves where target = ?', id)
  })
  invalidate()
}

/** 系统账号（热榜）发布一份说明书：和用户发布写同一张表，发完清缓存、记流水。已经发过同一份就返回原来那篇 */
export function publishManual(author: string, p: { product: string; title: string; body: string; category: string; tags: string[] }) {
  const had = one<{ id: string }>("select id from posts where product = ? and kind = 'manual' and author = ?", p.product, author)
  if (had) return had.id
  const id = `p-${randomBytes(6).toString('hex')}`
  run('insert into posts (id, author, product, kind, title, body, category, tags, images, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, author, p.product, 'manual', p.title, p.body, p.category, JSON.stringify(p.tags), '[]', now())
  invalidate()
  logEvent(author, 'publish', id, p.title)
  return id
}

/** 笔记里的图片只能是本服务器存的，或开发时网页导入说明书保存的原页 */
const isImage = (src: string) =>
  (src.startsWith(MEDIA_URL) && MEDIA_NAME.test(src.slice(MEDIA_URL.length)) && existsSync(join(MEDIA_DIR, src.slice(MEDIA_URL.length)))) ||
  /^\/imported\/[a-z0-9-]+\/p\d+\.jpg$/.test(src)

function persist(op: Op, next: CommunityDB, me: Me, ip: string) {
  switch (op.type) {
    case 'user': {
      const name = next.users[me.id].name
      run('update users set name = ? where id = ?', name, me.id)
      logEvent(me.id, 'rename', null, name, ip)
      break
    }
    case 'like':
    case 'save': {
      const table = op.type === 'like' ? 'likes' : 'saves'
      if (op.on) run(`insert or ignore into ${table} (target, user_id, created_at) values (?, ?, ?)`, op.target, me.id, now())
      else run(`delete from ${table} where target = ? and user_id = ?`, op.target, me.id)
      logEvent(me.id, op.on ? op.type : `un${op.type}`, op.target, null, ip)
      break
    }
    case 'comment': {
      const c = next.comments.find((x) => x.id === op.comment.id)!
      run('insert into comments (id, post_id, author, text, reply_to, created_at) values (?, ?, ?, ?, ?, ?)', c.id, c.postId, me.id, c.text, c.replyTo ?? null, c.createdAt)
      logEvent(me.id, 'comment', c.postId, c.text, ip)
      break
    }
    case 'uncomment': {
      const post = one<{ post_id: string }>('select post_id from comments where id = ?', op.id)?.post_id ?? null
      removeComment(op.id)
      logEvent(me.id, 'uncomment', post, null, ip)
      break
    }
    case 'post': {
      const p = next.posts.find((x) => x.id === op.post.id)!
      run('insert into posts (id, author, product, kind, title, body, category, tags, images, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p.id, me.id, p.product, p.kind, p.title, p.body, p.category, JSON.stringify(p.tags), JSON.stringify(p.images), p.createdAt)
      logEvent(me.id, p.kind === 'manual' ? 'publish' : 'post', p.id, p.title, ip)
      break
    }
    case 'unpost': {
      const title = one<{ title: string }>('select title from posts where id = ?', op.id)?.title ?? null
      removePost(op.id)
      logEvent(me.id, 'unpost', op.id, title, ip)
      break
    }
  }
  invalidate()
}

/** 同一个人 10 分钟内反复打开同一篇只记一次「打开」 */
const viewed = new Map<string, number>()

export async function communityRoutes(req: Req, res: Res, url: string, me: Me) {
  const ip = clientIp(req)
  if (url === '/api/community' && req.method === 'GET') return send(res, 200, { db: communityDoc() })

  if (url.startsWith(MEDIA_URL) && req.method === 'GET') {
    const name = url.slice(MEDIA_URL.length)
    if (!MEDIA_NAME.test(name) || !existsSync(join(MEDIA_DIR, name))) return send(res, 404, { error: 'not found' })
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[name.split('.').pop()!])
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    return res.end(readFileSync(join(MEDIA_DIR, name)))
  }

  if (me === SCRIPT_USER) throw new HttpError(403, '截图脚本只能看')

  if (url === '/api/community/op' && req.method === 'POST') {
    const { op } = await readJson<{ op: Op }>(req, MAX_OP)
    if (!op || typeof op !== 'object') throw new HttpError(400, '操作格式不对')
    const mine = { ...op, user: me.id } as Op
    let next: CommunityDB
    try {
      next = applyOp(communityDoc(), mine, isImage)
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e))
    }
    persist(mine, next, me, ip)
    return send(res, 200, { db: communityDoc() })
  }

  if (url === '/api/community/media' && req.method === 'POST') {
    const { data } = await readJson<{ data: string }>(req, MAX_IMAGE * 1.4)
    const m = typeof data === 'string' ? data.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/) : null
    if (!m) throw new HttpError(400, '只支持 JPG / PNG / WebP 图片')
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > MAX_IMAGE) throw new HttpError(400, '图片太大')
    const name = `${randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    mkdirSync(MEDIA_DIR, { recursive: true })
    writeFileSync(join(MEDIA_DIR, name), buf)
    return send(res, 200, { url: MEDIA_URL + name })
  }

  /** 页面心跳（在线状态、正在看哪一页）和「打开了某篇说明书」 */
  if (url === '/api/track' && req.method === 'POST') {
    const b = await readJson<{ kind?: string; target?: string; page?: string }>(req, 4096)
    const page = typeof b.page === 'string' ? b.page.slice(0, 120) : null
    if (page !== null) {
      const u = one<{ last_page: string | null; name: string }>('select last_page, name from users where id = ?', me.id)
      if (u && u.last_page !== page) {
        run('update users set last_page = ? where id = ?', page, me.id)
        broadcast({ type: 'presence', user: me.id, name: u.name, page, at: now() })
      }
    }
    if (b.kind === 'view' && typeof b.target === 'string' && TARGET.test(b.target)) {
      const key = `${me.id}|${b.target}`
      if (Date.now() - (viewed.get(key) ?? 0) > 10 * 60_000) {
        viewed.set(key, Date.now())
        logEvent(me.id, 'view', b.target, null, ip)
      }
    }
    return send(res, 200, { ok: true })
  }

  throw new HttpError(404, 'not found')
}
