import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { login, register, resetPassword, sendCode, type AuthInfo, type Me } from '../../auth/api'

/**
 * 等待页变成的登录页：登录（邮箱 + 密码）、注册（内测邀请码 + 邮箱 + 昵称 + 密码）。
 * 服务器开了邮箱验证（info.verify）时注册多一个验证码，也能用验证码自己重设密码；没开时忘了密码找管理员。
 * 邀请链接 ?invite=XXXX 直接落在注册页并填好邀请码。
 */
type Tab = 'login' | 'register' | 'reset'

const EMAIL_KEY = 'dongle-last-email'
const NICK_A = ['爱折腾的', '手很巧的', '不看说明书的', '周末动手的', '认真拧螺丝的', '好奇的', '深夜装机的', '慢慢来的']
const NICK_B = ['小熊', '松鼠', '企鹅', '海豚', '柠檬', '橘猫', '刺猬', '水獭', '仓鼠', '考拉']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function AuthPanel({ info, onDone }: { info: AuthInfo; onDone: (me: Me) => void }) {
  const invited = new URLSearchParams(location.search).get('invite') ?? ''
  const [tab, setTab] = useState<Tab>(invited ? 'register' : 'login')
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState(invited.toUpperCase())
  const [name, setName] = useState(() => `${pick(NICK_A)}${pick(NICK_B)}`)
  const [busy, setBusy] = useState<'' | 'code' | 'submit'>('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [wait, setWait] = useState(0)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])
  useEffect(() => {
    setError('')
    setHint('')
    setCode('')
    // 手机上自动聚焦会弹出键盘盖住页面，只在有鼠标的设备上把光标放进第一个空着的框
    if (!matchMedia('(pointer: fine)').matches) return
    const inputs = [...(form.current?.querySelectorAll('input') ?? [])]
    inputs.find((el) => !el.value)?.focus()
  }, [tab])

  const okEmail = EMAIL.test(email.trim())
  const getCode = async () => {
    setError('')
    if (!okEmail) return setError('邮箱格式不对')
    setBusy('code')
    try {
      const r = await sendCode({ email: email.trim(), purpose: tab === 'reset' ? 'reset' : 'register', invite: invite.trim() })
      setWait(r.cooldown)
      setHint(r.delivered
        ? `验证码已发到 ${email.trim()}，10 分钟内有效（没收到看看垃圾邮件）`
        : info.dev ? '开发模式没配邮件：验证码打印在运行 npm run dev 的终端里' : '邮件服务还没接好：验证码请找管理员要')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      const m = e instanceof Error && e.message.match(/^(\d+) 秒后/)
      if (m) setWait(Number(m[1]))
    } finally {
      setBusy('')
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy('submit')
    try {
      const body = { email: email.trim(), password }
      const me = tab === 'login' ? await login(body)
        : tab === 'register' ? await register({ ...body, code: info.verify ? code : undefined, invite: invite.trim(), name: name.trim() })
          : await resetPassword({ ...body, code })
      localStorage.setItem(EMAIL_KEY, me.email)
      if (invited) {
        const url = new URL(location.href)
        url.searchParams.delete('invite')
        history.replaceState(null, '', url)
      }
      onDone(me)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy('')
    }
  }

  const needCode = info.verify && tab !== 'login'
  const ready = okEmail && password.length >= (tab === 'login' ? 1 : 8) && (!needCode || code.trim().length === 6) && (tab !== 'register' || !!name.trim())

  return (
    <div className="auth">
      {tab === 'reset' ? (
        <div className="auth-title"><b>重设密码</b><span>用邮箱验证码设一个新密码</span></div>
      ) : (
        <div className="seg auth-tabs" role="tablist" aria-label="登录或注册">
          <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'is-on' : ''} onClick={() => setTab('login')}>登录</button>
          <button type="button" role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'is-on' : ''} onClick={() => setTab('register')}>注册</button>
        </div>
      )}
      <form ref={form} className="auth-form" onSubmit={submit} noValidate>
        {tab === 'register' && (
          <Field label="邀请码">
            <input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="内测邀请码" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={16} />
          </Field>
        )}
        <Field label="邮箱">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" maxLength={120} />
        </Field>
        {needCode && (
          <div className="auth-code">
            <Field label="验证码">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位数字" autoComplete="one-time-code" inputMode="numeric" />
            </Field>
            <button type="button" className="btn auth-send" onClick={getCode} disabled={busy !== '' || wait > 0}>
              {busy === 'code' ? '发送中…' : wait > 0 ? `${wait} 秒` : hint ? '重新获取' : '获取验证码'}
            </button>
          </div>
        )}
        {tab === 'register' && (
          <Field label="昵称">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="nickname" />
          </Field>
        )}
        <Field label={tab === 'login' ? '密码' : tab === 'reset' ? '新密码' : '密码'}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === 'login' ? '' : '至少 8 位'} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} maxLength={72} />
        </Field>
        {error ? <p className="auth-msg is-error" role="alert">{error}</p> : hint ? <p className="auth-msg">{hint}</p> : null}
        <button className="btn primary auth-submit" disabled={!ready || busy !== ''}>
          {busy === 'submit' ? '请稍候…' : tab === 'login' ? '登录' : tab === 'register' ? '注册并进入' : '重设并登录'}
        </button>
      </form>
      <p className="auth-foot">
        {tab === 'login' && (info.verify
          ? <button type="button" className="auth-link" onClick={() => setTab('reset')}>忘记密码？</button>
          : <span>忘记密码？找管理员重置</span>)}
        {tab === 'reset' && <button type="button" className="auth-link" onClick={() => setTab('login')}>返回登录</button>}
        {tab === 'register' && <span>内测阶段凭邀请码注册，邀请码找管理员要</span>}
      </p>
    </div>
  )
}
