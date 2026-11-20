import { useMemo, useSyncExternalStore } from 'react'

/**
 * hash 路由：静态部署不用配服务器回退。
 * #/ 社区首页 · #/note/<笔记 id> 笔记（说明书页面）
 * #/admin/<分区>[/<用户 id> | /<生成任务号>] 管理后台（只有管理员）
 * #/cover/<产品> 封面渲染（scripts/covers.mjs）· #/sprite/<产品> 广场模型图渲染（scripts/plaza.mjs）
 */
export type AdminTab = 'overview' | 'users' | 'imports' | 'trends' | 'content' | 'invites'

export type Route =
  | { name: 'home' }
  | { name: 'note'; id: string }
  | { name: 'admin'; tab: AdminTab; user?: string; job?: string }
  | { name: 'cover'; product: string; guide?: string; step?: number; zoom?: number }
  | { name: 'sprite'; product: string; guide?: string; step?: number }

const ADMIN_TABS: AdminTab[] = ['overview', 'users', 'imports', 'trends', 'content', 'invites']

export function parseRoute(hash: string): Route {
  const note = hash.match(/^#\/note\/([^/?#]+)/)
  if (note) return { name: 'note', id: decodeURIComponent(note[1]) }
  const admin = hash.match(/^#\/admin(?:\/([a-z]+))?(?:\/([^/?#]+))?/)
  if (admin) {
    const tab = ADMIN_TABS.find((t) => t === admin[1]) ?? 'overview'
    const sub = admin[2] ? decodeURIComponent(admin[2]) : undefined
    return tab === 'imports' ? { name: 'admin', tab, job: sub } : { name: 'admin', tab, user: sub }
  }
  const shot = hash.match(/^#\/(cover|sprite)\/([^/?#]+)(?:\/([^/?#]+)(?:\/(\d+)(?:\/([\d.]+))?)?)?/)
  if (shot) {
    const [, name, product, guide, step, zoom] = shot
    const base = { product: decodeURIComponent(product), guide, step: step ? Number(step) : undefined }
    return name === 'cover' ? { name, ...base, zoom: zoom ? Number(zoom) : undefined } : { name: 'sprite', ...base }
  }
  return { name: 'home' }
}

export const hrefOf = (r: Route) =>
  r.name === 'note' ? `#/note/${encodeURIComponent(r.id)}`
    : r.name === 'home' ? '#/'
      : r.name === 'admin' ? `#/admin/${r.tab}${[r.user ?? r.job].filter(Boolean).map((s) => `/${encodeURIComponent(s!)}`).join('')}`
        : `#/${r.name}/${encodeURIComponent(r.product)}`

/** 上一个路由是首页时，返回用 history.back()，首页的滚动位置和筛选都还在 */
let previous: Route | null = null
let current = parseRoute(location.hash)
window.addEventListener('hashchange', () => {
  previous = current
  current = parseRoute(location.hash)
})

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return useMemo(() => parseRoute(hash), [hash])
}

export function navigate(r: Route) {
  location.hash = hrefOf(r)
}

export const openNote = (id: string) => navigate({ name: 'note', id })

export function goHome() {
  if (previous?.name === 'home') history.back()
  else navigate({ name: 'home' })
}
