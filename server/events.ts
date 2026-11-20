import { now, one, run } from './sql.ts'

/**
 * 用户行为流水：注册、登录、点赞、收藏、评论、发布、打开说明书、管理员操作……都记一条，
 * 同时推给正在看管理后台的人（/api/admin/stream）。presence 只推不存：某人上线 / 换了页面。
 */
export interface EventRow {
  id: number
  at: string
  user_id: string | null
  /** 推送时带上，后台不用再查名字 */
  name?: string | null
  kind: string
  target: string | null
  detail: string | null
  ip: string | null
}

export type Live = { type: 'event'; event: EventRow } | { type: 'presence'; user: string; name: string; page: string | null; at: string }

const listeners = new Set<(m: Live) => void>()

export function onLive(fn: (m: Live) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function broadcast(m: Live) {
  for (const fn of listeners) {
    try {
      fn(m)
    } catch {
      // 某个连接断了不影响别人
    }
  }
}

export function logEvent(user: string | null, kind: string, target: string | null = null, detail: string | null = null, ip: string | null = null) {
  const at = now()
  const r = run('insert into events (at, user_id, kind, target, detail, ip) values (?, ?, ?, ?, ?, ?)', at, user, kind, target, detail?.slice(0, 200) ?? null, ip)
  const name = user ? one<{ name: string }>('select name from users where id = ?', user)?.name ?? null : null
  const event: EventRow = { id: Number(r.lastInsertRowid), at, user_id: user, name, kind, target, detail, ip }
  broadcast({ type: 'event', event })
  return event
}
