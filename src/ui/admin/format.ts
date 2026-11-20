import type { AdminEvent } from './data'

/** 行为流水的一句话：「<谁> 收藏了《戴森 V12》」——verb 动作，object 对象（书名号里），quote 引用的原文 */
export interface Said {
  verb: string
  object?: string
  quote?: string
}

export function describe(e: AdminEvent, titleOf: (id: string) => string): Said {
  const t = e.target ? titleOf(e.target) : undefined
  const d = e.detail ?? undefined
  switch (e.kind) {
    case 'register': return { verb: '注册了', quote: d }
    case 'login': return { verb: '登录了' }
    case 'logout': return { verb: '退出了登录' }
    case 'login_fail': return { verb: '登录失败', quote: d }
    case 'reset': return { verb: '重设了密码' }
    case 'passwd': return { verb: '改了密码' }
    case 'code': return { verb: '申请了验证码', quote: d }
    case 'view': return { verb: '打开了', object: t }
    case 'like': return { verb: e.target?.startsWith('c-') ? '赞了一条评论' : '点赞了', object: e.target?.startsWith('c-') ? undefined : t }
    case 'unlike': return { verb: '取消点赞', object: e.target?.startsWith('c-') ? undefined : t }
    case 'save': return { verb: '收藏了', object: t }
    case 'unsave': return { verb: '取消收藏', object: t }
    case 'comment': return { verb: '评论了', object: t, quote: d }
    case 'uncomment': return { verb: '删了自己的评论', object: t }
    case 'post': return { verb: '发布了笔记', object: d ?? t }
    case 'publish': return { verb: '发布了说明书', object: d ?? t }
    case 'import': return { verb: '用 AI 生成了', object: d ?? t }
    case 'import_start': return { verb: '开始用 AI 生成', quote: d }
    case 'import_fail': return { verb: 'AI 生成失败', quote: d }
    case 'import_delete': return { verb: '删除了导入的说明书', object: d ?? t }
    case 'trend_scan': return { verb: '扫描了市场热度', quote: d }
    case 'trend_scan_fail': return { verb: '扫描市场热度失败', quote: d }
    case 'trend_probe': return { verb: '检测了联网搜索', quote: d }
    case 'trend_settings': return { verb: '改了热榜设置', quote: d }
    case 'trend_queue': return { verb: '把热门产品排进生成', object: d }
    case 'trend_generate': return { verb: '找到官方说明书，开始生成', quote: d }
    case 'trend_publish': return { verb: '把热门产品发到了广场', object: d ?? t }
    case 'trend_unpublish': return { verb: '从广场下架了热门产品', object: d ?? t }
    case 'trend_hold': return { verb: '生成好了，等管理员确认', quote: d }
    case 'trend_fail': return { verb: '热门产品没做成', quote: d }
    case 'unpost': return { verb: '删了自己的笔记', object: d ?? t }
    case 'rename': return { verb: '改名为', quote: d }
    case 'admin:ban': return { verb: '停用了账号', quote: d }
    case 'admin:unban': return { verb: '恢复了账号', quote: d }
    case 'admin:kick': return { verb: '让这个账号所有设备下线', quote: d }
    case 'admin:passwd': return { verb: '重置了密码', quote: d }
    case 'admin:role': return { verb: '改了角色', quote: d?.replace(/admin$/, '设为管理员').replace(/user$/, '设为普通用户') }
    case 'admin:purge': return { verb: '清空了内容', quote: d }
    case 'admin:invite': return { verb: '生成了邀请码', quote: d }
    case 'admin:invite_off': return { verb: '停用了邀请码', quote: d }
    case 'admin:invite_on': return { verb: '启用了邀请码', quote: d }
    case 'admin:unpost': return { verb: '删除了笔记', object: d }
    case 'admin:uncomment': return { verb: '删除了评论', quote: d }
    default: return { verb: e.kind, quote: d }
  }
}

/** 动态分几类上色：账号、互动、内容、管理 */
export const toneOf = (kind: string) =>
  kind.startsWith('admin:') ? 'admin'
    : /^(register|login|logout|login_fail|reset|code)$/.test(kind) ? 'account'
      : /^(post|publish|unpost|comment|uncomment|import\w*|trend\w*)$/.test(kind) ? 'content'
        : 'touch'

export function pageName(page: string | null, titleOf: (id: string) => string) {
  if (!page || page === '#/' || page === '#') return '首页'
  const note = page.match(/^#\/note\/([^/?#]+)/)
  if (note) return `《${titleOf(decodeURIComponent(note[1]))}》`
  if (page.startsWith('#/admin')) return '管理后台'
  return page
}

export function deviceOf(ua: string | null) {
  if (!ua) return '未知设备'
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '其他'
  const app = /MicroMessenger/.test(ua) ? '微信' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl/i.test(ua) ? '脚本' : '浏览器'
  return `${os} · ${app}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 今天的只显示时分，今年的显示月-日 时:分 */
export function clock(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const n = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === n.toDateString()) return hm
  return `${d.getFullYear() === n.getFullYear() ? '' : `${d.getFullYear()}-`}${d.getMonth() + 1}-${d.getDate()} ${hm}`
}

export function ago(iso: string | null) {
  if (!iso) return '从没来过'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} 天前`
  return clock(iso)
}

export const ONLINE_MS = 2 * 60_000
export const isOnline = (lastSeen: string | null) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS
