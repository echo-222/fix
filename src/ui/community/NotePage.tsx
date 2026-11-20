import { useLayoutEffect } from 'react'
import { findPost, useCommunity, useFeed } from '../../community/store'
import { isManualProduct } from '../../domain/manual/library'
import type { ProductId } from '../../domain/types'
import { goHome } from '../../router'
import { defaultLook, useApp } from '../../store'
import { IconLeft } from '../icons'
import { ManualView } from '../ManualView'

const playable = (p: string): p is ProductId => ['desk', 'shelf', 'table', 'rack'].includes(p) || isManualProduct(p)

/** 点开一篇笔记：切到它关联的说明书，页面就是原来的说明书页 */
export function NotePage({ id }: { id: string }) {
  const feed = useFeed()
  const status = useCommunity((s) => s.status)
  const post = findPost(feed, id)
  const product = useApp((s) => s.product)
  const ok = !!post && playable(post.product)

  useLayoutEffect(() => {
    if (!post || !playable(post.product)) return
    const app = useApp.getState()
    if (app.product !== post.product) app.setProduct(post.product)
    // 再次打开同一份也回到默认的展示方式（上次切成线稿不带过来）
    else useApp.setState({ realLook: defaultLook(app) })
    // 用户写的笔记，进来先把笔记正文摊开；官方说明书直接看 3D
    const wide = window.innerWidth > 760
    const open = post.kind === 'note' || (wide && post.draft)
    useApp.setState({ panel: open ? 'note' : useApp.getState().panel === 'note' ? 'none' : useApp.getState().panel })
    document.title = `${post.title} · 懂了 Dongle`
    return () => {
      document.title = '懂了 Dongle · 3D 说明书社区'
    }
  }, [post?.id])

  if (!post || !ok) {
    if (status === 'loading') return null
    return (
      <div className="page">
        <div className="card is-empty">
          <div className="missing">
            <b>{post ? '这份说明书已经不在了' : '找不到这篇笔记'}</b>
            <p>{post ? '关联的说明书可能被删除了。' : '可能已经被作者删除，或者链接不完整。'}</p>
            <button className="btn primary" onClick={goHome}><IconLeft width={16} height={16} /> 回到社区</button>
          </div>
        </div>
      </div>
    )
  }
  // 切换产品要等 store 换好模型，这一帧先不渲染，免得旧模型闪一下
  if (product !== post.product) return null
  return <ManualView post={post} />
}
