import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { withBase } from '../../base'
import meta from '../../community/plaza.json'
import { slugOf, type FeedPost } from '../../community/seed'
import { authorOf, compact, likeCount, useCommunity } from '../../community/store'
import { useTrends } from '../../community/trends'
import { hrefOf } from '../../router'
import { IconCube3d, IconEdit, IconHeart } from '../icons'
import { Avatar, Badge, stepsOf } from './bits'

const BUILT_IN = meta as Record<string, unknown>

/** 封面：笔记自己的第一张图；说明书用 covers/<id>.webp；没配图的笔记借关联说明书的封面 */
function coverOf(p: FeedPost) {
  if (p.images[0]) return withBase(p.images[0])
  const slug = slugOf(p.product)
  return BUILT_IN[slug] ? `${import.meta.env.BASE_URL}covers/${slug}.webp` : null
}

/** 图的高宽比：几种比例错开排出瀑布流，同一篇每次都一样 */
const RATIOS = [1.25, 1, 1.15, 0.86, 1.25, 1.08]
function ratioOf(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return RATIOS[h % RATIOS.length]
}

const columnsFor = (w: number) => (w < 560 ? 2 : w < 860 ? 3 : w < 1140 ? 4 : w < 1480 ? 5 : 6)

function Card({ post, best }: { post: FeedPost; best: boolean }) {
  const db = useCommunity((s) => s.db)
  const me = useCommunity((s) => s.me)
  const like = useCommunity((s) => s.like)
  const author = authorOf(db, post.author)
  const liked = !!db.likes[post.id]?.includes(me.id)
  const cover = coverOf(post)
  const steps = stepsOf(post)
  const hot = useTrends((s) => (post.kind === 'manual' ? s.hot.get(post.product) : undefined))
  return (
    <article className={`fcard ${best ? 'is-best' : ''}`}>
      <a className="fcard-link" href={hrefOf({ name: 'note', id: post.id })}>
        <span className={`fcard-media ${post.images[0] ? 'is-photo' : ''}`} style={{ aspectRatio: `1 / ${ratioOf(post.id)}` }}>
          {cover ? <img src={cover} alt="" loading="lazy" draggable={false} /> : <IconCube3d width={34} height={34} strokeWidth={1.2} />}
          <span className="fcard-tags">
            {best && <em className="is-best">最匹配</em>}
            {hot && <em className="is-hot" title={hot.why || `热度 ${hot.heat}`}>热门 No.{hot.rank}</em>}
            {post.draft && <em className="is-draft">未发布</em>}
            <em>{post.category}</em>
          </span>
          <span className="fcard-kind">
            {post.kind === 'manual'
              ? <><IconCube3d width={13} height={13} strokeWidth={1.8} /> 3D · {steps} 步</>
              : <><IconEdit width={12} height={12} /> 使用笔记</>}
          </span>
        </span>
        <b className="fcard-title">{post.title}</b>
      </a>
      <div className="fcard-meta">
        <Avatar user={author} size={20} />
        <span className="fcard-author">{author.name}</span>
        <Badge user={author} />
        {post.draft ? <span className="fcard-local">只有你看得到</span> : (
          <button className={`fcard-like ${liked ? 'is-on' : ''}`} onClick={() => like(post.id)} aria-pressed={liked} aria-label={liked ? '取消点赞' : '点赞'}>
            <IconHeart width={14} height={14} filled={liked} /> {compact(likeCount(db, post.id))}
          </button>
        )}
      </div>
    </article>
  )
}

/**
 * 首页的卡片视图（瀑布流）：说明书和使用笔记混排。按估算高度把卡片依次塞进最矮的一列，
 * 阅读顺序大致从左到右、从上到下，排第一的（最匹配 / 最热）总在左上角。
 */
export function CardFeed({ posts, best, head, resetKey, initialTop, onLeave }: {
  posts: FeedPost[]
  best: string | null
  head: ReactNode
  resetKey: string
  initialTop: number
  onLeave: (top: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(() => columnsFor(window.innerWidth))

  useLayoutEffect(() => {
    const el = box.current!
    el.scrollTop = initialTop
    const ro = new ResizeObserver(() => setCols(columnsFor(el.clientWidth)))
    ro.observe(el)
    return () => {
      ro.disconnect()
      onLeave(el.scrollTop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 换搜索词 / 品类 / 排序：回到顶上
  const lastKey = useRef(resetKey)
  useLayoutEffect(() => {
    if (lastKey.current === resetKey) return
    lastKey.current = resetKey
    box.current?.scrollTo({ top: 0 })
  }, [resetKey])

  const columns = useMemo(() => {
    const out = Array.from({ length: cols }, () => ({ h: 0, items: [] as FeedPost[] }))
    for (const p of posts) {
      const c = out.reduce((a, b) => (b.h < a.h - 0.01 ? b : a))
      c.items.push(p)
      c.h += ratioOf(p.id) + 0.5
    }
    return out.map((c) => c.items)
  }, [posts, cols])

  return (
    <div className="feed" ref={box}>
      <div className="feed-inner">
        {head}
        <div className="feed-cols">
          {columns.map((list, k) => (
            <div className="feed-col" key={k}>
              {list.map((p) => <Card key={p.id} post={p} best={p.id === best} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
