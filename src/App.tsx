import { lazy, Suspense, useEffect } from 'react'
import { useCommunity } from './community/store'
import { navigate, useRoute } from './router'
import { Toast } from './ui/community/bits'
import { CoverView } from './ui/community/CoverView'
import { HomePage } from './ui/community/HomePage'
import { NotePage } from './ui/community/NotePage'
import { SpriteView } from './ui/community/SpriteView'

const AdminPage = lazy(() => import('./ui/admin/AdminPage').then((m) => ({ default: m.AdminPage })))

/** 不是管理员却打开了 #/admin：回首页 */
function NotAdmin() {
  useEffect(() => navigate({ name: 'home' }), [])
  return null
}

/** 社区首页 → 点开笔记 → 说明书页面；#/admin 管理后台；#/cover/… 和 #/sprite/… 是给截图脚本用的纯 3D 画面 */
export default function App() {
  const route = useRoute()
  const admin = useCommunity((s) => s.me.role === 'admin')
  if (route.name === 'cover') return <CoverView product={route.product} guide={route.guide} step={route.step} zoom={route.zoom} />
  if (route.name === 'sprite') return <SpriteView product={route.product} guide={route.guide} step={route.step} />
  return (
    <>
      {route.name === 'admin' ? (
        admin ? <Suspense fallback={null}><AdminPage tab={route.tab} user={route.user} job={route.job} /></Suspense> : <NotAdmin />
      ) : route.name === 'note' ? <NotePage key={route.id} id={route.id} /> : <HomePage />}
      <Toast />
    </>
  )
}
