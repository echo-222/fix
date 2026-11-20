import { randomBytes, randomInt } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkPassword, hashPassword, newInviteCode, normEmail } from './auth.ts'
import { HttpError } from './http.ts'
import { all, closeSql, now, one, run } from './sql.ts'

/**
 * 在服务器上直接改库：npm run admin -- <命令>
 *   admin <邮箱> [密码] [昵称]     设为管理员；账号不存在时用这个密码直接建一个（不用验证码、邀请码）
 *   passwd <邮箱> <新密码>         重设密码，并让这个账号所有设备下线
 *   invite [个数] [每个可用次数] [备注]
 *   invites                        列出邀请码
 *   users                          列出注册用户
 *   backup <目录> [保留天数]        把数据库备份成 <目录>/dongle-<日期>.db，删掉超过保留天数的旧备份
 */
const USAGE = `用法：npm run admin -- <命令>
  admin <邮箱> [密码] [昵称]      设为管理员；账号不存在时用这个密码直接建一个
  passwd <邮箱> <新密码>          重设密码（所有设备下线）
  invite [个数] [每个可用次数] [备注]
  invites                         列出邀请码
  users                           列出注册用户
  backup <目录> [保留天数]         备份数据库（默认保留 14 天）`

async function main(cmd: string | undefined, args: string[]) {
  switch (cmd) {
    case 'admin': {
      const email = normEmail(args[0])
      const u = one<{ id: string }>('select id from users where email = ?', email)
      if (u) {
        run(`update users set role = 'admin', status = 'active' where id = ?`, u.id)
        console.log(`${email} 已是管理员`)
        if (args[1]) await main('passwd', [email, args[1]])
        return
      }
      if (!args[1]) throw new Error(`${email} 还没注册：npm run admin -- admin ${email} <密码> [昵称]`)
      const pass = await hashPassword(checkPassword(args[1]))
      const at = now()
      run(`insert into users (id, email, name, hue, pass, role, created_at) values (?, ?, ?, ?, ?, 'admin', ?)`,
        `u-${randomBytes(8).toString('hex')}`, email, (args[2] || '管理员').slice(0, 16), randomInt(360), pass, at)
      console.log(`已创建管理员 ${email}`)
      return
    }
    case 'passwd': {
      const email = normEmail(args[0])
      const u = one<{ id: string }>('select id from users where email = ?', email)
      if (!u) throw new Error(`${email} 还没注册`)
      run('update users set pass = ? where id = ?', await hashPassword(checkPassword(args[1])), u.id)
      run('delete from sessions where user_id = ?', u.id)
      console.log(`${email} 的密码已重设`)
      return
    }
    case 'invite': {
      const n = Math.min(200, Math.max(1, Number(args[0]) || 1))
      const uses = Math.max(1, Number(args[1]) || 1)
      const note = args.slice(2).join(' ').slice(0, 40)
      const codes: string[] = []
      while (codes.length < n) {
        const code = newInviteCode()
        if (run('insert or ignore into invites (code, note, max_uses, created_at) values (?, ?, ?, ?)', code, note, uses, now()).changes) codes.push(code)
      }
      console.log(codes.join('\n'))
      return
    }
    case 'invites':
      console.table(all('select code, note, uses, max_uses, disabled, created_at from invites order by created_at desc'))
      return
    case 'users':
      console.table(all('select email, name, role, status, invite, created_at, last_seen from users where email is not null order by created_at desc'))
      return
    case 'backup': {
      if (!args[0]) throw new Error('备份到哪个目录？npm run admin -- backup <目录>')
      const dir = resolve(args[0])
      const keep = Math.max(1, Number(args[1]) || 14)
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `dongle-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.db`)
      run('vacuum into ?', file)
      const old = Date.now() - keep * 86400_000
      for (const f of readdirSync(dir)) {
        if (/^dongle-\d{14}\.db$/.test(f) && statSync(join(dir, f)).mtimeMs < old) rmSync(join(dir, f))
      }
      console.log(`已备份到 ${file}`)
      return
    }
    default:
      console.log(USAGE)
  }
}

try {
  await main(process.argv[2], process.argv.slice(3))
} catch (e) {
  console.error(e instanceof HttpError || e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  closeSql()
}
