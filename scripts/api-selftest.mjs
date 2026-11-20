// 后台接口自测：npm run api:selftest
// 用临时目录起一个线上服务器（server/main.ts），走一遍：未登录被拦 → 管理员邮箱注册 → 发邀请码 → 普通用户凭邀请码注册 →
// 点赞 / 收藏 / 评论 / 发笔记 → 后台看到这些 → 网页导入的说明书谁看得到 → 停用后登录被拒 → 管理员重置密码 → 自己改密码。
// 再起一个 EMAIL_VERIFY=1 的服务器，测要验证码的注册和自己重设密码（验证码从服务器日志里读，没配邮件时会打印）。
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ADMIN = 'boss@example.com'
const USER = 'tester@example.com'

let failed = 0
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`)
  if (!cond) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function startServer(extra = {}) {
  const port = 3900 + Math.floor(Math.random() * 90)
  const dir = mkdtempSync(join(tmpdir(), 'dongle-api-'))
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/main.ts'], {
    env: {
      ...process.env, PORT: String(port), DATA_DIR: dir, IMPORT_DIR: join(dir, 'imported'), ADMIN_EMAILS: ADMIN,
      NODE_ENV: 'production', SMTP_HOST: '', EMAIL_VERIFY: '', ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const s = { base: `http://127.0.0.1:${port}`, log: '', importDir: join(dir, 'imported') }
  proc.stdout.on('data', (d) => (s.log += d))
  proc.stderr.on('data', (d) => (s.log += d))
  for (let i = 0; i < 60 && !s.log.includes('已启动'); i++) await sleep(100)
  s.stop = async () => {
    proc.kill()
    await new Promise((r) => proc.once('exit', r))
    rmSync(dir, { recursive: true, force: true })
  }
  /** 一个「浏览器」：自己记 cookie */
  s.client = () => {
    let cookie = ''
    return async (path, body, method = body ? 'POST' : 'GET') => {
      const r = await fetch(s.base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const set = r.headers.get('set-cookie')
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
      return { status: r.status, body: await r.json().catch(() => ({})), cookie: set }
    }
  }
  s.codeFor = async (email) => {
    for (let i = 0; i < 20; i++) {
      const m = [...s.log.matchAll(new RegExp(`验证码 ${email.replace('.', '\\.')} → (\\d{6})`, 'g'))].pop()
      if (m) return m[1]
      await sleep(50)
    }
    throw new Error(`日志里没有 ${email} 的验证码`)
  }
  return s
}

async function main(s) {
  ok(s.log.includes('已启动'), '服务器启动')
  const anon = s.client()
  const info = (await anon('/api/auth/me')).body
  ok(info.user === null && info.verify === false, '未登录：/api/auth/me 返回空，注册不用验证码')
  ok((await anon('/api/community')).status === 401, '未登录：社区数据 401')
  ok((await anon('/api/admin/overview')).status === 401, '未登录：后台 401')
  ok((await anon('/api/auth/code', { email: ADMIN, purpose: 'register' })).status === 404, '验证码接口关着')

  const boss = s.client()
  ok((await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'short' })).status === 400, '密码太短被拒')
  const reg = await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'boss-pass-1' })
  ok(reg.status === 200 && reg.body.user?.role === 'admin', '管理员邮箱不用邀请码直接注册，角色是 admin')
  ok((await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'boss-pass-1' })).status === 409, '同一个邮箱不能注册两次')
  const sub = await fetch(s.base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Prefix': '/dongle' },
    body: JSON.stringify({ email: ADMIN, password: 'boss-pass-1' }),
  })
  ok(/; Path=\/dongle;/.test(sub.headers.get('set-cookie') ?? '') && /; Path=\/;/.test(reg.cookie ?? ''), 'nginx 带 X-Forwarded-Prefix 时 cookie 只发给 /dongle，直连时是 /')

  const inv = await boss('/api/admin/invites', { count: 2, maxUses: 1, note: '第一批' })
  ok(inv.status === 200 && inv.body.codes?.length === 2, '后台生成 2 个邀请码')
  const [code1] = inv.body.codes

  const user = s.client()
  ok((await user('/api/auth/register', { email: USER, name: '内测小王', password: 'tester-pass' })).status === 400, '没有邀请码不能注册')
  ok((await user('/api/auth/register', { email: USER, invite: 'WRONG123', name: '内测小王', password: 'tester-pass' })).status === 400, '邀请码不对不能注册')
  const ur = await user('/api/auth/register', { email: USER, invite: code1.toLowerCase(), name: '内测小王', password: 'tester-pass' })
  ok(ur.status === 200 && ur.body.user?.role === 'user', '凭邀请码（不分大小写）注册成功')
  const uid = ur.body.user.id

  const other = s.client()
  ok((await other('/api/auth/register', { email: 'x@example.com', invite: code1, name: '路人', password: 'other-pass' })).status === 400, '一次性邀请码用过就失效')

  ok((await user('/api/admin/overview')).status === 403, '普通用户进不了后台')
  const forged = await user('/api/community/op', { op: { type: 'save', user: 'u-someoneelse', target: 'm-dyson-v12', on: true } })
  ok(forged.status === 200 && forged.body.db.saves['m-dyson-v12']?.includes(uid) && !forged.body.db.saves['m-dyson-v12']?.includes('u-someoneelse'), '收藏记在登录的账号上（伪造 user 无效）')
  await user('/api/community/op', { op: { type: 'like', user: uid, target: 'm-dyson-v12', on: true } })
  const cm = await user('/api/community/op', { op: { type: 'comment', user: uid, comment: { id: 'c-selftest01', postId: 'm-dyson-v12', text: '滤网多久换一次？' } } })
  ok(cm.status === 200 && cm.body.db.comments.some((c) => c.id === 'c-selftest01' && c.author === uid), '评论成功')
  const pt = await user('/api/community/op', { op: { type: 'post', user: uid, post: { id: 'p-selftest01', product: 'manual:dyson-v12', kind: 'note', title: '戴森换滤网心得', body: '拧下来冲水晾干', category: '清洁电器', tags: ['戴森'], images: [] } } })
  ok(pt.status === 200 && pt.body.db.posts.some((p) => p.id === 'p-selftest01'), '发笔记成功')
  ok((await user('/api/community/op', { op: { type: 'unpost', user: uid, id: 'p-nope' } })).status === 400, '删不存在的笔记被拒')
  await user('/api/track', { kind: 'view', target: 'm-dyson-v12', page: '#/note/m-dyson-v12' })

  const ov = await boss('/api/admin/overview')
  ok(ov.body.stats?.users === 2 && ov.body.stats.saves === 1 && ov.body.stats.comments === 1 && ov.body.stats.notes === 1, '后台概览：2 个用户、1 收藏、1 评论、1 笔记')
  ok(ov.body.online?.some((u) => u.id === uid && u.last_page === '#/note/m-dyson-v12'), '后台看到在线用户和正在看的页面')
  ok(ov.body.verify === false && ov.body.codes?.length === 0, '后台知道现在不用验证码')
  ok(ov.body.hot?.[0]?.target === 'm-dyson-v12', '热门说明书统计')
  const kinds = new Set(ov.body.events.map((e) => e.kind))
  ok(['register', 'save', 'like', 'comment', 'post', 'view', 'admin:invite'].every((k) => kinds.has(k)), '行为流水记全了')
  const detail = await boss(`/api/admin/users/${uid}`)
  ok(detail.body.saves?.length === 1 && detail.body.posts?.length === 1 && detail.body.sessions?.length === 1, '用户详情：收藏、发布、登录设备')
  const invs = await boss('/api/admin/invites')
  ok(invs.body.invites.find((i) => i.code === code1)?.users?.[0]?.id === uid, '邀请码记着是谁用的')

  // 网页导入的说明书：没发布时只有导入的人和管理员看得到，导入的人发布以后大家都能看
  const lamp = join(s.importDir, 'selftest-lamp')
  mkdirSync(join(lamp, 'models'), { recursive: true })
  writeFileSync(join(lamp, 'spec.json'), JSON.stringify({ id: 'selftest-lamp', name: '测试台灯' }))
  writeFileSync(join(lamp, 'models', 'body.glb'), 'glTF')
  writeFileSync(join(s.importDir, 'index.json'), JSON.stringify({ manuals: [{ id: 'selftest-lamp', name: '测试台灯', created: new Date().toISOString(), job: 'j-selftest', owner: uid }] }))
  const peer = s.client()
  ok((await peer('/api/auth/register', { email: 'peer@example.com', invite: inv.body.codes[1], name: '内测小李', password: 'peer-pass-1' })).status === 200, '第二个内测用户注册')
  const listed = async (c) => (await c('/imported/index.json')).body.manuals?.map((m) => m.id) ?? []
  ok((await anon('/imported/index.json')).status === 401 && (await anon('/imported/selftest-lamp/spec.json')).status === 401, '没登录拿不到导入的说明书')
  ok((await listed(user)).includes('selftest-lamp') && (await user('/imported/selftest-lamp/spec.json')).status === 200, '导入的人看得到自己没发布的说明书')
  ok((await listed(boss)).includes('selftest-lamp'), '管理员也看得到')
  const hidden = async () => !(await listed(peer)).includes('selftest-lamp') && (await peer('/imported/selftest-lamp/models/body.glb')).status === 404
  ok(await hidden(), '别人看不到没发布的说明书')
  await peer('/api/community/op', { op: { type: 'post', user: 'x', post: { id: 'p-selftest02', product: 'manual:selftest-lamp', kind: 'manual', title: '偷偷发布', body: '', images: [] } } })
  ok(await hidden(), '别人拿草稿的 id 发帖也公开不了')
  ok((await peer('/api/manual/imported/selftest-lamp', undefined, 'DELETE')).status === 404, '别人删不了')
  ok((await user('/imported/selftest-lamp/..%2F..%2Fdongle.db')).status === 404 && (await user('/imported/selftest-lamp/spec.sh')).status === 404, '只发说明书目录里的文件')
  const pub = await user('/api/community/op', { op: { type: 'post', user: uid, post: { id: 'p-selftest03', product: 'manual:selftest-lamp', kind: 'manual', title: '测试台灯', body: '', images: [] } } })
  ok(pub.status === 200 && !(await hidden()) && (await peer('/imported/selftest-lamp/models/body.glb')).status === 200, '导入的人发布以后大家都看得到')
  const rm = await user('/api/manual/imported/selftest-lamp', undefined, 'DELETE')
  ok(rm.status === 200 && !(await listed(boss)).includes('selftest-lamp'), '导入的人能删掉')
  await user('/api/community/op', { op: { type: 'unpost', user: uid, id: 'p-selftest03' } })
  await peer('/api/community/op', { op: { type: 'unpost', user: 'x', id: 'p-selftest02' } })

  ok((await boss(`/api/admin/users/${uid}`, { action: 'ban', reason: '测试' })).status === 200, '停用用户')
  ok((await user('/api/community')).status === 401, '停用后原来的登录立即失效')
  const banned = await user('/api/auth/login', { email: USER, password: 'tester-pass' })
  ok(banned.status === 403 && banned.body.error.includes('测试'), '停用后不能登录，提示原因')
  await boss(`/api/admin/users/${uid}`, { action: 'unban' })
  ok((await user('/api/auth/login', { email: USER, password: 'wrong-pass' })).status === 400, '密码不对被拒')
  ok((await user('/api/auth/login', { email: USER, password: 'tester-pass' })).status === 200, '解除停用后能登录')
  ok((await user('/api/auth/reset', { email: USER, code: '123456', password: 'new-pass-123' })).status === 400, '不用验证码时不能自己重设密码')

  const rp = await boss(`/api/admin/users/${uid}`, { action: 'passwd' })
  ok(rp.status === 200 && typeof rp.body.password === 'string' && rp.body.password.length >= 10, '管理员重置密码，拿到临时密码')
  ok((await user('/api/community')).status === 401, '重置后原来的登录失效')
  ok((await user('/api/auth/login', { email: USER, password: 'tester-pass' })).status === 400, '旧密码不能用了')
  ok((await user('/api/auth/login', { email: USER, password: rp.body.password })).status === 200, '临时密码能登录')
  ok((await boss(`/api/admin/users/${reg.body.user.id}`, { action: 'passwd' })).status === 400, '管理员不能在后台重置自己的密码')

  const phone = s.client()
  await phone('/api/auth/login', { email: USER, password: rp.body.password })
  ok((await user('/api/auth/password', { old: 'nope-nope', password: 'my-own-pass' })).status === 400, '改密码：原密码不对被拒')
  ok((await user('/api/auth/password', { old: rp.body.password, password: 'my-own-pass' })).status === 200, '改密码成功')
  ok((await user('/api/community')).status === 200, '改密码后当前设备还登录着')
  ok((await phone('/api/community')).status === 401, '改密码后其他设备下线')
  ok((await other('/api/auth/login', { email: USER, password: 'my-own-pass' })).status === 200, '新密码能登录')
  ok((await anon('/api/auth/password', { old: 'x', password: 'yyyyyyyy' })).status === 401, '没登录不能改密码')

  const del = await boss('/api/admin/content/delete', { kind: 'post', id: 'p-selftest01' })
  ok(del.status === 200 && !del.body.posts.some((p) => p.id === 'p-selftest01'), '管理员删除笔记')
  ok((await user('/api/auth/logout', {})).status === 200 && (await user('/api/community')).status === 401, '退出登录')
  ok((await fetch(`${s.base}/api/community/op`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status === 403, '跨站 POST 被拒')
}

/** EMAIL_VERIFY=1：注册要验证码，忘了密码能自己用验证码重设 */
async function withCodes(s) {
  console.log('\n— 开着邮箱验证（EMAIL_VERIFY=1）—')
  const boss = s.client()
  ok((await boss('/api/auth/me')).body.verify === true, '/api/auth/me 告诉前端要验证码')
  ok((await boss('/api/auth/code', { email: ADMIN, purpose: 'register' })).status === 200, '管理员邮箱不用邀请码就能发验证码')
  ok((await boss('/api/auth/register', { email: ADMIN, name: '老板', password: 'boss-pass-1' })).status === 400, '没填验证码被拒')
  ok((await boss('/api/auth/register', { email: ADMIN, code: '000000', name: '老板', password: 'boss-pass-1' })).status === 400, '验证码不对被拒')
  ok((await boss('/api/auth/register', { email: ADMIN, code: await s.codeFor(ADMIN), name: '老板', password: 'boss-pass-1' })).status === 200, '验证码对了注册成功')
  const [code1] = (await boss('/api/admin/invites', { count: 1 })).body.codes
  const user = s.client()
  ok((await user('/api/auth/code', { email: USER, purpose: 'register', invite: 'WRONG123' })).status === 400, '邀请码不对不发验证码')
  ok((await user('/api/auth/code', { email: USER, purpose: 'register', invite: code1 })).status === 200, '邀请码对了发验证码')
  ok((await user('/api/auth/code', { email: USER, purpose: 'register', invite: code1 })).status === 429, '60 秒内不能重发')
  ok((await user('/api/auth/register', { email: USER, code: await s.codeFor(USER), invite: code1, name: '小王', password: 'tester-pass' })).status === 200, '普通用户注册成功')
  const ov = await boss('/api/admin/overview')
  ok(ov.body.verify === true && ov.body.mail === false, '后台提示邮件还没配置')
  ok((await user('/api/auth/code', { email: USER, purpose: 'reset' })).status === 200, '忘记密码：发验证码')
  ok((await user('/api/auth/reset', { email: USER, code: await s.codeFor(USER), password: 'new-pass-123' })).status === 200, '用验证码重设密码并登录')
  ok((await user('/api/auth/login', { email: USER, password: 'new-pass-123' })).status === 200, '新密码能登录')
}

for (const [run, env] of [[main, {}], [withCodes, { EMAIL_VERIFY: '1' }]]) {
  const s = await startServer(env)
  try {
    await run(s)
  } catch (e) {
    failed++
    console.error(e)
    console.error(s.log)
  } finally {
    await s.stop()
  }
}
console.log(failed ? `\n${failed} 项没通过` : '\n全部通过')
process.exit(failed ? 1 : 0)
