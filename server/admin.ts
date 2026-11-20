import { createReadStream, existsSync } from 'node:fs'
import { ONLINE_MS, hashPassword, newInviteCode, tempPassword, verifyEmail, type Me } from './auth.ts'
import { removeComment, removePost } from './community.ts'
import { logEvent, onLive } from './events.ts'
import { HttpError, clientIp, readJson, send, type Env, type Req, type Res } from './http.ts'
import { allJobs, backfill, jobDetail, runningCount, workFile } from './importJobs.ts'
import { mailConfigured } from './mail.ts'
import { all, now, one, run, tx } from './sql.ts'
import { trendAdminRoutes } from './trends.ts'

/**
 * 管理后台接口（只有 role = admin 能进，api.ts 里拦）：
 * 概览、用户列表 / 详情 / 停用 / 下线 / 重置密码 / 设管理员、内容删除、所有人的生成任务（进度、日志、上传的原页、中间产物）、
 * 邀请码、行为流水，以及实时推送（SSE）。
 */
const iso = (ms: number) => new Date(ms).toISOString()
const count = (q: string, ...p: (string | number)[]) => Number(one<{ n: number }>(q, ...p)?.n ?? 0)

/** 北京时间今天 0 点 */
function todayStart() {
  const day = 86400_000
  const shift = 8 * 3600_000
  return iso(Math.floor((Date.now() + shift) / day) * day - shift)
}

export function recentEvents(limit: number, before: number | null = null, user: string | null = null) {
  return all(
    `select e.id, e.at, e.user_id, u.name, e.kind, e.target, e.detail, e.ip from events e left join users u on u.id = e.user_id
     where (?1 is null or e.id < ?1) and (?2 is null or e.user_id = ?2) order by e.id desc limit ?3`,
    before, user, limit,
  )
}

const USER_COLUMNS = `u.id, u.email, u.name, u.hue, u.role, u.status, u.ban_reason, u.invite, u.created_at, u.last_seen, u.last_ip, u.last_page,
  (select count(*) from posts where author = u.id) posts,
  (select count(*) from comments where author = u.id) comments,
  (select count(*) from likes where user_id = u.id) likes,
  (select count(*) from saves where user_id = u.id) saves,
  (select count(*) from events where user_id = u.id and kind = 'view') views`

function overview(env: Env) {
  backfill()
  const t = Date.now()
  const day = todayStart()
  const online = iso(t - ONLINE_MS)
  const reg = "select count(*) n from users where email is not null"
  return {
    stats: {
      users: count(reg),
      today: count(`${reg} and created_at >= ?`, day),
      online: count(`${reg} and last_seen >= ?`, online),
      active: count(`${reg} and last_seen >= ?`, iso(t - 86400_000)),
      banned: count(`${reg} and status = 'banned'`),
      manuals: count("select count(*) n from posts where kind = 'manual'"),
      notes: count("select count(*) n from posts where kind = 'note'"),
      comments: count('select count(*) n from comments'),
      likes: count('select count(*) n from likes'),
      saves: count('select count(*) n from saves'),
      views: count("select count(*) n from events where kind = 'view' and at >= ?", day),
      imports: count('select count(*) n from import_jobs'),
      importsToday: count('select count(*) n from import_jobs where created_at >= ?', day),
      importing: runningCount(),
      invitesLeft: count(
        'select coalesce(sum(max_uses - uses), 0) n from invites where disabled = 0 and uses < max_uses and (expires_at is null or expires_at > ?)', now()),
    },
    online: all('select id, name, hue, email, last_seen, last_page from users where email is not null and last_seen >= ? order by last_seen desc', online),
    /** 最近 14 天：每天新注册、活跃（有任何行为）的人数，按北京时间分天 */
    trend: all(
      `select d, sum(r) registered, sum(a) active from (
         select substr(datetime(created_at, '+8 hours'), 1, 10) d, 1 r, 0 a from users where email is not null and created_at >= ?1
         union all
         select d, 0, 1 from (select distinct substr(datetime(at, '+8 hours'), 1, 10) d, user_id from events where user_id is not null and at >= ?1)
       ) group by d order by d`,
      iso(t - 14 * 86400_000)),
    /** 打开 / 收藏 / 点赞最多的说明书和笔记（评论的赞不算） */
    hot: all(
      `select target, sum(v) views, sum(s) saves, sum(l) likes from (
         select target, 1 v, 0 s, 0 l from events where kind = 'view' and target is not null
         union all select target, 0, 1, 0 from saves
         union all select target, 0, 0, 1 from likes where target not like 'c-%'
       ) group by target order by views + saves * 3 + likes * 2 desc limit 12`),
    events: recentEvents(80),
    verify: verifyEmail(env),
    mail: mailConfigured(env),
    /** 要验证码但邮件没配好时，验证码在这里，管理员可以转告 */
    codes: !verifyEmail(env) || mailConfigured(env) ? [] : all(
      'select email, purpose, plain, created_at, expires_at from codes where plain is not null and expires_at > ? order by created_at desc', now()),
  }
}

function userDetail(id: string) {
  const user = one(`select ${USER_COLUMNS} from users u where u.id = ?`, id)
  if (!user) throw new HttpError(404, '用户不存在')
  return {
    user,
    saves: all('select target, created_at from saves where user_id = ? order by created_at desc', id),
    likes: all("select target, created_at from likes where user_id = ? and target not like 'c-%' order by created_at desc", id),
    posts: all('select id, kind, title, product, created_at from posts where author = ? order by created_at desc', id),
    comments: all('select id, post_id, text, created_at from comments where author = ? order by created_at desc limit 200', id),
    sessions: all('select substr(id, 1, 8) id, created_at, last_seen, ip, ua from sessions where user_id = ? and expires_at > ? order by last_seen desc', id, now()),
    events: recentEvents(120, null, id),
  }
}

/** 返回值只在重置密码时有：临时密码只给管理员看这一次，库里只存哈希 */
async function act(me: Me, id: string, b: { action?: string; reason?: string; role?: string; name?: string }, ip: string) {
  const u = one<{ id: string; name: string }>('select id, name from users where id = ?', id)
  if (!u) throw new HttpError(404, '用户不存在')
  const self = id === me.id
  let detail: string | null = null
  let password: string | undefined
  switch (b.action) {
    case 'passwd': {
      if (self) throw new HttpError(400, '自己的密码在右上角头像菜单里改')
      password = tempPassword()
      const pass = await hashPassword(password)
      tx(() => {
        run('update users set pass = ? where id = ?', pass, id)
        run('delete from sessions where user_id = ?', id)
      })
      break
    }
    case 'ban': {
      if (self) throw new HttpError(400, '不能停用自己')
      detail = String(b.reason ?? '').trim().slice(0, 60) || null
      tx(() => {
        run(`update users set status = 'banned', ban_reason = ? where id = ?`, detail, id)
        run('delete from sessions where user_id = ?', id)
      })
      break
    }
    case 'unban':
      run(`update users set status = 'active', ban_reason = null where id = ?`, id)
      break
    case 'kick':
      run('delete from sessions where user_id = ?', id)
      break
    case 'role': {
      if (self) throw new HttpError(400, '不能改自己的角色')
      detail = b.role === 'admin' ? 'admin' : 'user'
      run('update users set role = ? where id = ?', detail, id)
      break
    }
    case 'purge': {
      const posts = all<{ id: string }>('select id from posts where author = ?', id)
      const comments = all<{ id: string }>('select id from comments where author = ?', id)
      for (const p of posts) removePost(p.id)
      for (const c of comments) if (one('select id from comments where id = ?', c.id)) removeComment(c.id)
      detail = `${posts.length} 篇笔记、${comments.length} 条评论`
      break
    }
    default:
      throw new HttpError(400, '未知操作')
  }
  logEvent(me.id, `admin:${b.action}`, id, detail ? `${u.name} · ${detail}` : u.name, ip)
  return password
}

function content() {
  return {
    posts: all(
      `select p.id, p.kind, p.title, p.product, p.created_at, p.author, u.name, u.email,
         (select count(*) from comments where post_id = p.id) comments,
         (select count(*) from likes where target = p.id) likes,
         (select count(*) from saves where target = p.id) saves
       from posts p left join users u on u.id = p.author order by p.created_at desc`),
    comments: all(
      'select c.id, c.post_id, c.text, c.created_at, c.author, u.name, u.email from comments c left join users u on u.id = c.author order by c.created_at desc limit 300'),
  }
}

function listInvites() {
  const users = all<{ id: string; name: string; email: string; invite: string; created_at: string }>(
    'select id, name, email, invite, created_at from users where invite is not null order by created_at')
  return all('select * from invites order by created_at desc').map((i) => ({ ...i, users: users.filter((u) => u.invite === i.code) }))
}

/** 实时推送：新的行为流水、有人上线 / 换页面。nginx 那边要关掉缓冲（X-Accel-Buffering） */
function stream(req: Req, res: Res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  const off = onLive((m) => res.write(`data: ${JSON.stringify(m)}\n\n`))
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    off()
    clearInterval(ping)
  })
}

export async function adminRoutes(req: Req, res: Res, url: URL, env: Env, me: Me) {
  const path = url.pathname
  const ip = clientIp(req)
  const get = req.method === 'GET'

  if (path === '/api/admin/stream' && get) return stream(req, res)
  if (path === '/api/admin/overview' && get) return send(res, 200, overview(env))
  if (path === '/api/admin/users' && get) {
    return send(res, 200, { users: all(`select ${USER_COLUMNS} from users u where u.email is not null order by u.created_at desc`) })
  }
  const user = path.match(/^\/api\/admin\/users\/(u-[\w-]+)$/)
  if (user && get) return send(res, 200, userDetail(user[1]))
  if (user && req.method === 'POST') {
    const password = await act(me, user[1], await readJson(req), ip)
    return send(res, 200, { ...userDetail(user[1]), password })
  }

  if (path === '/api/admin/events' && get) {
    const before = Number(url.searchParams.get('before')) || null
    return send(res, 200, { events: recentEvents(100, before, url.searchParams.get('user')) })
  }

  if (path === '/api/admin/content' && get) return send(res, 200, content())
  if (path === '/api/admin/content/delete' && req.method === 'POST') {
    const b = await readJson<{ kind?: string; id?: string }>(req)
    const id = String(b.id ?? '')
    if (b.kind === 'post') {
      const p = one<{ title: string; author: string }>('select title, author from posts where id = ?', id)
      if (!p) throw new HttpError(404, '笔记不存在')
      removePost(id)
      logEvent(me.id, 'admin:unpost', p.author, p.title, ip)
    } else if (b.kind === 'comment') {
      const c = one<{ text: string; author: string }>('select text, author from comments where id = ?', id)
      if (!c) throw new HttpError(404, '评论不存在')
      removeComment(id)
      logEvent(me.id, 'admin:uncomment', c.author, c.text, ip)
    } else throw new HttpError(400, '未知类型')
    return send(res, 200, content())
  }

  if (path === '/api/admin/trends' || path.startsWith('/api/admin/trends/')) return await trendAdminRoutes(req, res, path, me)
  if (path === '/api/admin/imports' && get) return send(res, 200, { jobs: allJobs() })
  const job = path.match(/^\/api\/admin\/imports\/([\w-]+)$/)
  if (job && get) {
    const d = jobDetail(job[1])
    if (!d) throw new HttpError(404, '任务不存在')
    return send(res, 200, d)
  }
  const file = path.match(/^\/api\/admin\/imports\/([\w-]+)\/files\/([^/]+)$/)
  if (file && get) {
    const at = workFile(file[1], decodeURIComponent(file[2]))
    if (!at || !existsSync(at)) throw new HttpError(404, '文件不存在')
    res.statusCode = 200
    res.setHeader('Content-Type', `${at.endsWith('.json') ? 'application/json' : 'text/plain'}; charset=utf-8`)
    res.setHeader('Cache-Control', 'no-store')
    return createReadStream(at).pipe(res)
  }

  if (path === '/api/admin/invites' && get) return send(res, 200, { invites: listInvites() })
  if (path === '/api/admin/invites' && req.method === 'POST') {
    const b = await readJson<{ count?: number; maxUses?: number; note?: string; days?: number }>(req)
    const n = Math.min(50, Math.max(1, Math.floor(Number(b.count) || 1)))
    const uses = Math.min(1000, Math.max(1, Math.floor(Number(b.maxUses) || 1)))
    const days = Math.floor(Number(b.days) || 0)
    const note = String(b.note ?? '').trim().slice(0, 40)
    const at = now()
    const codes: string[] = []
    tx(() => {
      while (codes.length < n) {
        const code = newInviteCode()
        if (run('insert or ignore into invites (code, note, max_uses, created_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?)',
          code, note, uses, me.id, at, days > 0 ? iso(Date.now() + days * 86400_000) : null).changes) codes.push(code)
      }
    })
    logEvent(me.id, 'admin:invite', null, `${n} 个${uses > 1 ? `，每个可用 ${uses} 次` : ''}${note ? ` · ${note}` : ''}`, ip)
    return send(res, 200, { codes, invites: listInvites() })
  }
  const invite = path.match(/^\/api\/admin\/invites\/([A-Z0-9]{4,16})$/)
  if (invite && req.method === 'POST') {
    const b = await readJson<{ disabled?: boolean; note?: string }>(req)
    if (!one('select code from invites where code = ?', invite[1])) throw new HttpError(404, '邀请码不存在')
    if (typeof b.disabled === 'boolean') run('update invites set disabled = ? where code = ?', b.disabled ? 1 : 0, invite[1])
    if (typeof b.note === 'string') run('update invites set note = ? where code = ?', b.note.trim().slice(0, 40), invite[1])
    logEvent(me.id, typeof b.disabled === 'boolean' ? (b.disabled ? 'admin:invite_off' : 'admin:invite_on') : 'admin:invite_note', null, invite[1], ip)
    return send(res, 200, { invites: listInvites() })
  }

  throw new HttpError(404, 'not found')
}
