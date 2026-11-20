import { useEffect } from 'react'
import type { FeedPost, SeedUser } from '../../community/seed'
import { useCommunity } from '../../community/store'

/** 头像只在主题的奶黄 / 灰两档里按 hue 轮换，官方号是黑底 */
const AVATAR_TONES = [
  { background: '#f8e8a8', color: '#161616' },
  { background: '#ececea', color: '#161616' },
  { background: '#fdf6dc', color: '#6b6b6b' },
]

export function Avatar({ user, size = 22 }: { user: SeedUser; size?: number }) {
  const official = user.badge === '官方'
  return (
    <span
      className={`avatar ${official ? 'is-official' : ''}`}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.46),
        ...(official ? {} : AVATAR_TONES[Math.abs(Math.round(user.hue)) % AVATAR_TONES.length]),
      }}
      aria-hidden
    >
      {official ? '修' : [...user.name][0]}
    </span>
  )
}

export function Badge({ user }: { user: SeedUser }) {
  return user.badge ? <em className="user-badge">{user.badge}</em> : null
}

export function Toast() {
  const toast = useCommunity((s) => s.toast)
  const say = useCommunity((s) => s.say)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => say(''), 3200)
    return () => clearTimeout(t)
  }, [toast, say])
  return toast ? <div className="toast" role="status">{toast}</div> : null
}

export const stepsOf = (p: FeedPost) => p.guides.reduce((n, g) => n + g.steps.length, 0)
