import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { LIMITS } from '../src/community/db.ts'
import { broadcast, logEvent } from './events.ts'
import { HttpError, clientIp, cookies, limit, readJson, send, setCookie, userAgent, type Env, type Req, type Res } from './http.ts'
import { mailConfigured, sendCodeMail, type CodePurpose } from './mail.ts'
import { now, one, run, tx } from './sql.ts'

/**
 * 账号：邮箱 + 密码注册（内测要邀请码），邮箱 + 密码登录；登录后能自己改密码，忘了密码由管理员在后台重置。
 * EMAIL_VERIFY=1 时注册要邮箱验证码，也能用验证码自己重设密码（要配 SMTP，见 mail.ts）。
 * 登录后发一个随机 token 放在 HttpOnly cookie 里，库里只存它的 sha256；30 天内有访问就自动续期。
 * ADMIN_EMAILS 里的邮箱注册时不用邀请码，并且自动是管理员。
 */
export interface Me {
  id: string
  email: string
  name: string
  hue: number
  role: 'user' | 'admin'
}

interface UserRow {
  id: string
  email: string | null
  name: string
  hue: number
  pass: string | null
  role: string
  status: string
  ban_reason: string | null
  last_seen: string | null
}

const COOKIE = 'dongle_sid'
const SESSION_DAYS = 30
const CODE_TTL = 10 * 60_000
const CODE_COOLDOWN = 60_000
const CODE_TRIES = 5
/** 这么久内有请求（页面每分钟发一次心跳）就算在线 */
export const ONLINE_MS = 2 * 60_000

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const toMe = (u: Pick<UserRow, 'id' | 'email' | 'name' | 'hue' | 'role'>): Me => ({
  id: u.id, email: u.email ?? '', name: u.name, hue: u.hue, role: u.role === 'admin' ? 'admin' : 'user',
})

// ---------- 密码 ----------

const derive = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((ok, fail) => scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? fail(e) : ok(key))))

export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  return `s1$${salt.toString('base64url')}$${(await derive(pw, salt)).toString('base64url')}`
}

async function verifyPassword(pw: string, stored: string) {
  const [v, salt, hash] = stored.split('$')
  if (v !== 's1' || !salt || !hash) return false
  const key = await derive(pw, Buffer.from(salt, 'base64url'))
  const want = Buffer.from(hash, 'base64url')
  return key.length === want.length && timingSafeEqual(key, want)
}

// ---------- 输入 ----------

export function normEmail(v: unknown) {
  const email = String(v ?? '').trim().toLowerCase()
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, '邮箱格式不对')
  return email
}

export function checkPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, '密码至少 8 位')
  if (v.length > 72) throw new HttpError(400, '密码太长了')
  return v
}

function cleanName(v: unknown) {
  const name = String(v ?? '').trim().slice(0, LIMITS.name)
  if (!name) throw new HttpError(400, '起个昵称吧')
  return name
}

export const verifyEmail = (env: Env) => env.EMAIL_VERIFY === '1'

/** 管理员重置密码时发给用户的临时密码：去掉了容易看错的 0O1lI */
export function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => abc[randomInt(abc.length)]).join('')
}

export const adminEmails = (env: Env) =>
  new Set((env.ADMIN_EMAILS ?? '').split(/[\s,，;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))

/** 启动时把 ADMIN_EMAILS 里已经注册的账号设成管理员 */
export function promoteAdmins(env: Env) {
  for (const email of adminEmails(env)) run(`update users set role = 'admin' where email = ?`, email)
}

// ---------- 邀请码 ----------

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const newInviteCode = () => Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('')
export const normInvite = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)

function usableInvite(code: string) {
  if (!code) throw new HttpError(400, '先填内测邀请码')
  const row = one<{ max_uses: number; uses: number; disabled: number; expires_at: string | null }>(
    'select max_uses, uses, disabled, expires_at from invites where code = ?', code)
  return !!row && !row.disabled && row.uses < row.max_uses && !(row.expires_at && row.expires_at < now())
}

// ---------- 会话 ----------

function startSession(req: Req, res: Res, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const at = now()
  const ip = clientIp(req)
  run('insert into sessions (id, user_id, created_at, expires_at, last_seen, ip, ua) values (?, ?, ?, ?, ?, ?, ?)',
    sha(token), userId, at, new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString(), at, ip, userAgent(req))
  run('update users set last_seen = ?, last_ip = ? where id = ?', at, ip, userId)
  setCookie(req, res, COOKIE, token, SESSION_DAYS * 86400)
}

/** 会话的 last_seen / 续期最多 30 秒写一次库 */
const touched = new Map<string, number>()

export function sessionUser(req: Req): Me | null {
  const token = cookies(req)[COOKIE]
  if (!token) return null
  const sid = sha(token)
  const row = one<UserRow & { expires_at: string }>(
    'select u.id, u.email, u.name, u.hue, u.role, u.status, u.last_seen, s.expires_at from sessions s join users u on u.id = s.user_id where s.id = ?', sid)
  if (!row) return null
  if (row.expires_at < now() || row.status !== 'active') {
    run('delete from sessions where id = ?', sid)
    return null
  }
  const t = Date.now()
  if (t - (touched.get(sid) ?? 0) > 30_000) {
    touched.set(sid, t)
    const at = new Date(t).toISOString()
    run('update sessions set last_seen = ?, expires_at = ?, ip = ? where id = ?', at, new Date(t + SESSION_DAYS * 86400_000).toISOString(), clientIp(req), sid)
    run('update users set last_seen = ?, last_ip = ? where id = ?', at, clientIp(req), row.id)
    if (!row.last_seen || t - Date.parse(row.last_seen) > ONLINE_MS) {
      const page = one<{ last_page: string | null }>('select last_page from users where id = ?', row.id)?.last_page ?? null
      broadcast({ type: 'presence', user: row.id, name: row.name, page, at })
    }
  }
  return toMe(row)
}

/** 截图脚本（scripts/shoot-manuals.mjs 等）起的开发服务器不用登录 */
export const SCRIPT_USER: Me = { id: 'u-script', email: '', name: '截图脚本', hue: 0, role: 'user' }

// ---------- 验证码 ----------

const codeHash = (email: string, purpose: CodePurpose, code: string) => sha(`${email}|${purpose}|${code}`)

function verifyCode(email: string, purpose: CodePurpose, input: unknown) {
  const code = String(input ?? '').replace(/\D/g, '')
  const row = one<{ hash: string; expires_at: string; attempts: number }>(
    'select hash, expires_at, attempts from codes where email = ? and purpose = ?', email, purpose)
  if (!row || row.expires_at < now()) throw new HttpError(400, '验证码已过期，重新获取一个')
  if (row.attempts >= CODE_TRIES) throw new HttpError(400, '验证码试错太多次，重新获取一个')
  if (codeHash(email, purpose, code) !== row.hash) {
    run('update codes set attempts = attempts + 1 where email = ? and purpose = ?', email, purpose)
    const left = CODE_TRIES - row.attempts - 1
    throw new HttpError(400, left > 0 ? `验证码不对，还能试 ${left} 次` : '验证码试错太多次，重新获取一个')
  }
  run('delete from codes where email = ? and purpose = ?', email, purpose)
}

// ---------- 接口 ----------

export async function authRoutes(req: Req, res: Res, url: string, env: Env, me: Me | null) {
  if (url === '/api/auth/me' && req.method === 'GET') {
    return send(res, 200, { user: me, verify: verifyEmail(env), mail: mailConfigured(env), dev: env.NODE_ENV !== 'production' })
  }
  if (req.method !== 'POST') throw new HttpError(405, '只支持 POST')
  const ip = clientIp(req)
  const verify = verifyEmail(env)

  if (url === '/api/auth/code') {
    if (!verify) throw new HttpError(404, '现在注册不用验证码')
    const b = await readJson<{ email?: string; purpose?: string; invite?: string }>(req)
    const purpose: CodePurpose = b.purpose === 'reset' ? 'reset' : 'register'
    const email = normEmail(b.email)
    limit(`code-ip:${ip}`, 20, 3600_000, '验证码发得太多了，一小时后再试')
    limit(`code-mail:${email}`, 8, 86400_000, '这个邮箱今天收到的验证码太多了，明天再试')
    const exists = !!one('select id from users where email = ?', email)
    if (purpose === 'register') {
      if (exists) throw new HttpError(409, '这个邮箱已经注册过了，直接登录吧')
      if (!adminEmails(env).has(email) && !usableInvite(normInvite(b.invite))) throw new HttpError(400, '邀请码不对，或者已经用完了')
    } else if (!exists) throw new HttpError(404, '这个邮箱还没注册')
    const last = one<{ created_at: string }>('select created_at from codes where email = ? and purpose = ?', email, purpose)
    const wait = last ? CODE_COOLDOWN - (Date.now() - Date.parse(last.created_at)) : 0
    if (wait > 0) throw new HttpError(429, `${Math.ceil(wait / 1000)} 秒后才能再发`)

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const mail = mailConfigured(env)
    const at = now()
    run(`insert into codes (email, purpose, hash, created_at, expires_at, attempts, ip, plain) values (?, ?, ?, ?, ?, 0, ?, ?)
         on conflict (email, purpose) do update set hash = excluded.hash, created_at = excluded.created_at, expires_at = excluded.expires_at,
         attempts = 0, ip = excluded.ip, plain = excluded.plain`,
      email, purpose, codeHash(email, purpose, code), at, new Date(Date.now() + CODE_TTL).toISOString(), ip, mail ? null : code)
    if (mail) {
      try {
        await sendCodeMail(env, email, code, purpose)
      } catch (e) {
        run('delete from codes where email = ? and purpose = ?', email, purpose)
        console.error('[dongle] 验证码邮件发送失败', e)
        throw new HttpError(502, '验证码邮件没发出去，稍后再试')
      }
    } else console.log(`[dongle] ${purpose === 'register' ? '注册' : '重设密码'}验证码 ${email} → ${code}`)
    logEvent(null, 'code', null, `${purpose === 'register' ? '注册' : '重设密码'} ${email}`, ip)
    return send(res, 200, { ok: true, cooldown: CODE_COOLDOWN / 1000, delivered: mail })
  }

  if (url === '/api/auth/register') {
    const b = await readJson<{ email?: string; code?: string; invite?: string; name?: string; password?: string }>(req)
    const email = normEmail(b.email)
    const name = cleanName(b.name)
    const password = checkPassword(b.password)
    limit(`register:${ip}`, 20, 3600_000)
    if (one('select id from users where email = ?', email)) throw new HttpError(409, '这个邮箱已经注册过了，直接登录吧')
    const admin = adminEmails(env).has(email)
    const invite = normInvite(b.invite)
    if (!admin && !usableInvite(invite)) throw new HttpError(400, '邀请码不对，或者已经用完了')
    if (verify) verifyCode(email, 'register', b.code)
    const pass = await hashPassword(password)
    const id = `u-${randomBytes(8).toString('hex')}`
    const at = now()
    tx(() => {
      if (!admin && run('update invites set uses = uses + 1 where code = ? and disabled = 0 and uses < max_uses', invite).changes === 0) {
        throw new HttpError(400, '邀请码刚刚被用完了，换一个')
      }
      run(`insert into users (id, email, name, hue, pass, role, invite, created_at, last_seen, last_ip) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, email, name, randomInt(360), pass, admin ? 'admin' : 'user', admin && !invite ? null : invite, at, at, ip)
    })
    startSession(req, res, id)
    logEvent(id, 'register', null, admin && !invite ? '管理员邮箱' : `邀请码 ${invite}`, ip)
    return send(res, 200, { user: toMe(one<UserRow>('select * from users where id = ?', id)!) })
  }

  if (url === '/api/auth/login') {
    const b = await readJson<{ email?: string; password?: string }>(req)
    const email = normEmail(b.email)
    limit(`login-ip:${ip}`, 30, 15 * 60_000)
    limit(`login:${email}`, 10, 15 * 60_000, `密码试错太多次了，15 分钟后再试${verify ? '，或者用「忘记密码」' : '，忘了密码找管理员重置'}`)
    const u = one<UserRow>('select * from users where email = ?', email)
    if (!u?.pass || !(await verifyPassword(String(b.password ?? ''), u.pass))) {
      logEvent(u?.id ?? null, 'login_fail', null, email, ip)
      throw new HttpError(400, '邮箱或密码不对')
    }
    if (u.status !== 'active') throw new HttpError(403, `账号已停用${u.ban_reason ? `：${u.ban_reason}` : ''}`)
    if (adminEmails(env).has(email) && u.role !== 'admin') {
      run(`update users set role = 'admin' where id = ?`, u.id)
      u.role = 'admin'
    }
    startSession(req, res, u.id)
    logEvent(u.id, 'login', null, null, ip)
    return send(res, 200, { user: toMe(u) })
  }

  if (url === '/api/auth/reset') {
    if (!verify) throw new HttpError(400, '忘了密码请找管理员重置')
    const b = await readJson<{ email?: string; code?: string; password?: string }>(req)
    const email = normEmail(b.email)
    const password = checkPassword(b.password)
    limit(`reset:${ip}`, 20, 3600_000)
    const u = one<UserRow>('select * from users where email = ?', email)
    if (!u) throw new HttpError(404, '这个邮箱还没注册')
    verifyCode(email, 'reset', b.code)
    if (u.status !== 'active') throw new HttpError(403, `账号已停用${u.ban_reason ? `：${u.ban_reason}` : ''}`)
    const pass = await hashPassword(password)
    tx(() => {
      run('update users set pass = ? where id = ?', pass, u.id)
      run('delete from sessions where user_id = ?', u.id)
    })
    startSession(req, res, u.id)
    logEvent(u.id, 'reset', null, null, ip)
    return send(res, 200, { user: toMe(u) })
  }

  if (url === '/api/auth/password') {
    if (!me || me === SCRIPT_USER) throw new HttpError(401, '请先登录')
    const b = await readJson<{ old?: string; password?: string }>(req)
    limit(`passwd:${me.id}`, 10, 15 * 60_000, '试得太多了，15 分钟后再试')
    const u = one<UserRow>('select * from users where id = ?', me.id)
    if (!u?.pass || !(await verifyPassword(String(b.old ?? ''), u.pass))) throw new HttpError(400, '原密码不对')
    const password = checkPassword(b.password)
    if (password === b.old) throw new HttpError(400, '新密码和原密码一样')
    const pass = await hashPassword(password)
    const current = sha(cookies(req)[COOKIE] ?? '')
    tx(() => {
      run('update users set pass = ? where id = ?', pass, me.id)
      run('delete from sessions where user_id = ? and id != ?', me.id, current)
    })
    logEvent(me.id, 'passwd', null, null, ip)
    return send(res, 200, { ok: true })
  }

  if (url === '/api/auth/logout') {
    const token = cookies(req)[COOKIE]
    if (token) run('delete from sessions where id = ?', sha(token))
    setCookie(req, res, COOKIE, '', 0)
    if (me && me !== SCRIPT_USER) logEvent(me.id, 'logout', null, null, ip)
    return send(res, 200, { ok: true })
  }

  throw new HttpError(404, 'not found')
}
