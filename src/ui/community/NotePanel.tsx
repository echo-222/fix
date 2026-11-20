import { useEffect, useRef, useState } from 'react'
import { withBase } from '../../base'
import type { Comment } from '../../community/db'
import type { FeedPost } from '../../community/seed'
import { authorOf, commentCount, commentsOf, compact, likeCount, saveCount, timeAgo, useCommunity } from '../../community/store'
import { goHome } from '../../router'
import { useApp } from '../../store'
import { IconBox, IconChat, IconClose, IconHeart, IconStar, IconTrash, IconWrench } from '../icons'
import { Avatar, Badge } from './bits'

/** 点赞 / 收藏 / 评论（打开笔记抽屉）：放在底部控制条左侧，抽屉顶栏里放不带评论的那份 */
export function NoteActions({ post, comment = true }: { post: FeedPost; comment?: boolean }) {
  const db = useCommunity((s) => s.db)
  const me = useCommunity((s) => s.me)
  const like = useCommunity((s) => s.like)
  const save = useCommunity((s) => s.save)
  const panel = useApp((s) => s.panel)
  const setPanel = useApp((s) => s.setPanel)
  const liked = !!db.likes[post.id]?.includes(me.id)
  const saved = !!db.saves[post.id]?.includes(me.id)
  if (post.draft) {
    return (
      <div className="note-actions">
        <button className={panel === 'note' ? 'is-active' : ''} onClick={() => setPanel('note')}><IconChat width={16} height={16} /><span>笔记</span></button>
      </div>
    )
  }
  return (
    <div className="note-actions">
      <button className={liked ? 'is-liked' : ''} onClick={() => like(post.id)} aria-label="点赞" title={liked ? '取消点赞' : '点赞'} aria-pressed={liked}>
        <IconHeart width={16} height={16} filled={liked} /><span>{compact(likeCount(db, post.id))}</span>
      </button>
      <button className={saved ? 'is-saved' : ''} onClick={() => save(post.id)} aria-label="收藏" title={saved ? '取消收藏' : '收藏'} aria-pressed={saved}>
        <IconStar width={16} height={16} filled={saved} /><span>{compact(saveCount(db, post.id))}</span>
      </button>
      {comment && (
        <button className={panel === 'note' ? 'is-active' : ''} onClick={() => setPanel('note')} aria-label="笔记与评论" title="笔记与评论">
          <IconChat width={16} height={16} /><span>{commentCount(db, post)}</span>
        </button>
      )}
    </div>
  )
}

/** 笔记与评论：从页面底部升起，盖住步骤说明和控制条。一直挂着，开合靠 CSS 过渡 */
export function NoteSheet({ post }: { post: FeedPost }) {
  const db = useCommunity((s) => s.db)
  const me = useCommunity((s) => s.me)
  const like = useCommunity((s) => s.like)
  const comment = useCommunity((s) => s.comment)
  const uncomment = useCommunity((s) => s.uncomment)
  const unpost = useCommunity((s) => s.unpost)
  const openPublish = useCommunity((s) => s.openPublish)
  const open = useApp((s) => s.panel === 'note')
  const setGuide = useApp((s) => s.setGuide)
  const guideId = useApp((s) => s.guideId)
  const guides = useApp((s) => s.guides)
  const [shown, setShown] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)
  const [dragY, setDragY] = useState(0)
  const drag = useRef<{ y: number; dy: number; grip: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listEnd = useRef<HTMLDivElement>(null)

  const author = authorOf(db, post.author)
  const all = commentsOf(db, post)
  const ids = new Set(all.map((c) => c.id))
  const roots = all.filter((c) => !c.replyTo || !ids.has(c.replyTo))
  const repliesOf = (id: string) => all.filter((c) => c.replyTo === id)
  const mine = post.author === me.id
  const close = () => {
    if (useApp.getState().panel === 'note') useApp.getState().setPanel('note')
  }

  // 晚一帧再加 is-open，刚进页面就打开时也有升起的过渡
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(open))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      await comment(post.id, t, replyTo?.id)
      setText('')
      setReplyTo(null)
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch {
      // toast 里已经提示
    }
    setSending(false)
  }

  const item = (c: Comment, child = false) => {
    const u = authorOf(db, c.author)
    const liked = !!db.likes[c.id]?.includes(me.id)
    const n = likeCount(db, c.id)
    const parent = child && c.replyTo ? all.find((x) => x.id === c.replyTo) : null
    return (
      <div className={`comment ${child ? 'is-reply' : ''}`} key={c.id}>
        <Avatar user={u} size={child ? 22 : 28} />
        <div className="comment-main">
          <div className="comment-head">
            <b>{u.name}</b>
            <Badge user={u} />
            {c.author === post.author && !u.badge && <em className="user-badge is-soft">作者</em>}
          </div>
          <p>
            {parent && parent.replyTo && <span className="reply-to">回复 {authorOf(db, parent.author).name}：</span>}
            {c.text}
          </p>
          <div className="comment-foot">
            <span>{timeAgo(c.createdAt)}</span>
            <button className="link-btn" onClick={() => setReplyTo(c)}>回复</button>
            {c.author === me.id && <button className="link-btn" onClick={() => confirm('删除这条评论？') && uncomment(c.id)}>删除</button>}
            <button className={`comment-like ${liked ? 'is-on' : ''}`} onClick={() => like(c.id)} aria-label="赞评论" aria-pressed={liked}>
              <IconHeart width={13} height={13} filled={liked} />{n > 0 ? n : ''}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section
      className={`note-sheet ${shown ? 'is-open' : ''} ${post.draft ? 'is-single' : ''}`}
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      inert={!shown}
      aria-hidden={!shown}
      aria-label="笔记与评论"
    >
      <header
        className="sheet-head"
        onPointerDown={(e) => {
          const t = e.target as HTMLElement
          if (t.closest('button')) return
          drag.current = { y: e.clientY, dy: 0, grip: !!t.closest('.sheet-grip') }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.dy = Math.max(0, e.clientY - drag.current.y)
          setDragY(drag.current.dy)
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          setDragY(0)
          if (d && (d.dy > 70 || (d.grip && d.dy < 4))) close()
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragY(0)
        }}
      >
        <i className="sheet-grip" title="收起" />
        <h3>{post.draft ? '未发布的说明书' : '笔记与评论'}</h3>
        <div className="sheet-head-actions">
          {!post.draft && <NoteActions post={post} comment={false} />}
          <button className="round small" onClick={close} aria-label="收起" title="收起"><IconClose /></button>
        </div>
      </header>

      <div className="sheet-body">
        <div className="sheet-note">
          <div className="note-author">
            <Avatar user={author} size={34} />
            <span>
              <b>{author.name}<Badge user={author} /></b>
              <small>{post.foreign ? '管理员查看' : post.draft ? '只有你看得到' : timeAgo(post.createdAt)} · {post.category}</small>
            </span>
          </div>
          <h2 className="note-h">{post.title}</h2>
          {post.images.length > 0 && (
            <div className={`note-images n${Math.min(post.images.length, 3)}`}>
              {post.images.map((src, i) => (
                <a key={i} href={withBase(src)} target="_blank" rel="noreferrer"><img src={withBase(src)} alt={`图片 ${i + 1}`} /></a>
              ))}
            </div>
          )}
          {post.body && <p className="note-text">{post.body}</p>}
          <div className="note-tags">{post.tags.map((t) => <span key={t}>#{t}</span>)}</div>

          {post.foreign && (
            <div className="notice">这是其他用户导入的（或已被导入的人删除），没有发布，只有管理员看得到。生成记录在管理后台「生成」里。</div>
          )}
          {post.draft && !post.foreign && (
            <div className="notice">
              这份说明书是你导入的，还没发布，别人看不到。发布以后会出现在社区首页，大家可以点赞、评论。
              <div className="notice-actions">
                <button className="btn primary" onClick={() => openPublish({ product: post.product })}>发布到社区</button>
              </div>
            </div>
          )}

          {guides.length > 0 && (
            <div className="panel-section">
              <h4>{post.tutorial ? '这份教程的指南' : '这份说明书的指南'}</h4>
              {guides.map((g) => (
                <button key={g.id} className={`menu-item ${g.id === guideId ? 'is-active' : ''}`} onClick={() => setGuide(g.id)}>
                  {g.kind === 'repair' ? <IconWrench /> : <IconBox />}
                  <span><b>{g.title}</b><small>{g.summary}</small></span>
                </button>
              ))}
            </div>
          )}

          {mine && (
            <button
              className="link-btn danger"
              onClick={async () => {
                if (!confirm('删除这篇笔记？评论和点赞也会一起删除。')) return
                await unpost(post.id)
                goHome()
              }}
            >
              <IconTrash width={14} height={14} /> 删除这篇笔记
            </button>
          )}
        </div>

        {!post.draft && (
          <div className="sheet-comments comments">
            <h4>共 {all.length} 条评论</h4>
            {roots.map((c) => (
              <div className="comment-thread" key={c.id}>
                {item(c)}
                {repliesOf(c.id).flatMap(function walk(r): ReturnType<typeof item>[] {
                  return [item(r, true), ...repliesOf(r.id).flatMap(walk)]
                })}
              </div>
            ))}
            {all.length === 0 && <p className="comments-empty">还没有评论，来说两句吧。</p>}
            <div ref={listEnd} />
          </div>
        )}
      </div>

      {!post.draft && (
        <form className="comment-box" onSubmit={(e) => { e.preventDefault(); send() }}>
          {replyTo && (
            <div className="replying">
              回复 <b>{authorOf(db, replyTo.author).name}</b>：{replyTo.text.slice(0, 24)}{replyTo.text.length > 24 ? '…' : ''}
              <button type="button" onClick={() => setReplyTo(null)} aria-label="取消回复"><IconClose width={12} height={12} /></button>
            </div>
          )}
          <div className="comment-input">
            <Avatar user={me} size={28} />
            <input ref={inputRef} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? '写下你的回复…' : '说点什么…'} />
            <button className="btn primary" disabled={!text.trim() || sending}>发送</button>
          </div>
        </form>
      )}
    </section>
  )
}
