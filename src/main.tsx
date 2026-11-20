import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchAuth, type AuthInfo, type Me } from './auth/api'
import { loadImported } from './domain/manual/library/imported'
import { AuthPanel } from './ui/auth/AuthPanel'
import './styles.css'

/** 等待页至少停这么久，动画能完整拼好一次，不会一闪而过 */
const SPLASH_MIN_MS = 1300
/** #/cover/…、#/sprite/… 是截图脚本要的纯 3D 画面，不用登录 */
const shot = /^#\/(cover|sprite)\//.test(location.hash)

const splash = document.getElementById('splash')
const tip = document.getElementById('splash-tip')

function hideSplash(since: number) {
  if (!splash) return
  setTimeout(() => {
    splash.classList.add('is-out')
    setTimeout(() => splash.remove(), 500)
  }, shot ? 0 : Math.max(0, SPLASH_MIN_MS - (performance.now() - since)))
}

/** 没登录：等待页原地变成登录页（灯泡停在亮着的样子），登录成功后变回等待页接着加载 */
function signIn(info: AuthInfo): Promise<Me> {
  const slot = document.getElementById('splash-auth')!
  splash?.classList.add('is-auth')
  splash?.removeAttribute('role')
  splash?.setAttribute('aria-label', '登录懂了 Dongle')
  return new Promise((resolve) => {
    const root = createRoot(slot)
    const done = (me: Me) => {
      root.unmount()
      splash?.classList.remove('is-auth')
      splash?.setAttribute('role', 'status')
      splash?.setAttribute('aria-label', '正在加载')
      resolve(me)
    }
    root.render(
      <StrictMode>
        <AuthPanel info={info} onDone={done} />
      </StrictMode>,
    )
  })
}

function offline() {
  if (tip) tip.innerHTML = '连不上服务器，<a href="">点这里重试</a>'
  splash?.classList.add('is-offline')
}

// ?open=manual:<id>（导入完成后打开）：换成对应笔记的路由（笔记 id 规则见 community/seed.ts 的 noteIdOf）
const url = new URL(location.href)
const open = url.searchParams.get('open')
if (open) {
  url.searchParams.delete('open')
  if (!url.hash.startsWith('#/note/')) url.hash = `#/note/${encodeURIComponent(`m-${open.replace(/^manual:/, '')}`)}`
  history.replaceState(null, '', url)
}

async function boot() {
  // 网页导入的说明书要在说明书库（以及 store 恢复上次打开的产品）之前注册好，所以 App 晚一步加载。
  // 导入的说明书按账号可见（没发布的只有自己看得到）：没登录时取不到，登录以后再取一次
  const [info] = await Promise.all([shot ? null : fetchAuth(), loadImported()])
  if (!shot && !info) return offline()
  let me = info?.user ?? null
  let since = 0
  if (!shot && !me) {
    me = await signIn(info!)
    since = performance.now()
    await loadImported()
  }
  const [{ default: App }, { useCommunity, startPresence }] = await Promise.all([import('./App'), import('./community/store')])
  await useCommunity.getState().load(me)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  if (me) startPresence()
  requestAnimationFrame(() => hideSplash(since))
}

boot()
