import { apiFetch } from '../net'

/** 登录相关接口（server/auth.ts）。登录态在 HttpOnly cookie 里，前端只拿到「我是谁」 */
export interface Me {
  id: string
  email: string
  name: string
  hue: number
  role: 'user' | 'admin'
}

export interface AuthInfo {
  user: Me | null
  /** 注册要邮箱验证码、能用验证码自己重设密码（服务器 EMAIL_VERIFY=1）；关着时忘了密码找管理员 */
  verify: boolean
  /** 服务器配好了发邮件；没配时验证码在服务器日志 / 管理后台里 */
  mail: boolean
  dev: boolean
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await apiFetch(path, body === undefined ? undefined : { body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || (r.status >= 500 ? '服务器出错了，稍后再试' : `请求失败（${r.status}）`))
  return j as T
}

/** 连不上服务器时返回 null（静态预览、断网） */
export async function fetchAuth(): Promise<AuthInfo | null> {
  try {
    const r = await apiFetch('/api/auth/me')
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as AuthInfo
  } catch {
    return null
  }
}

export const sendCode = (b: { email: string; purpose: 'register' | 'reset'; invite?: string }) =>
  call<{ ok: true; cooldown: number; delivered: boolean }>('/api/auth/code', b)
export const register = (b: { email: string; code?: string; invite: string; name: string; password: string }) =>
  call<{ user: Me }>('/api/auth/register', b).then((r) => r.user)
export const login = (b: { email: string; password: string }) => call<{ user: Me }>('/api/auth/login', b).then((r) => r.user)
export const resetPassword = (b: { email: string; code: string; password: string }) =>
  call<{ user: Me }>('/api/auth/reset', b).then((r) => r.user)
/** 登录后自己改密码；其他设备会下线，当前这台保持登录 */
export const changePassword = (b: { old: string; password: string }) => call<{ ok: true }>('/api/auth/password', b)
export const logout = () => call('/api/auth/logout', {})
