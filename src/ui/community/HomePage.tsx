import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { create } from 'zustand'
import { changePassword } from '../../auth/api'
import { GROUP_ORDER, groupOf } from '../../community/groups'
import { arrange, queryScore } from '../../community/plaza'
import type { FeedPost } from '../../community/seed'
import { authorOf, commentCount, likeCount, useCommunity, useFeed } from '../../community/store'
import { HEAT_WEIGHT, HOT_CAT, useTrends } from '../../community/trends'
import { useApp } from '../../store'
import { IconCamera, IconCards, IconClose, IconEdit, IconLeft, IconPlaza, IconPlus, IconSearch } from '../icons'
import { ImportModal } from '../ImportModal'
import { Avatar } from './bits'
import { CardFeed } from './CardFeed'
import { ImportJobs, useImportJobs, useJobPolling } from './ImportJobs'
import { Plaza, type PlazaView } from './Plaza'
import { PublishModal } from './PublishModal'

type Mine = 'saved' | 'liked' | 'posts' | 'drafts'
/** all：全部说明书，品类筛选；mine：只看「我的」里的一类，品类那一行换成二级 tab */
type Scope = 'all' | 'mine'
type Mode = 'plaza' | 'cards'
type Sort = 'hot' | 'new'

const MINE_TABS: [Mine, string][] = [['saved', '收藏'], ['liked', '点赞'], ['posts', '发布'], ['drafts', '导入']]
const MINE_LABEL: Record<Mine, string> = { saved: '我的收藏', liked: '我赞过的', posts: '我发布的', drafts: '我导入的' }

const MODE_KEY = 'xiuligong-home-view'
function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'cards' ? 'cards' : 'plaza'
  } catch {
    return 'plaza'
  }
}

/** 首页的搜索、品类、「我的」、视图和各自的位置（广场视角 / 卡片滚动）：点开笔记再回来时还在。视图存 localStorage */
const useHomeUI = create<{
  cat: string; q: string; scope: Scope; mine: Mine; view: PlazaView | null; mode: Mode; sort: Sort; feedTop: number
}>()(() => ({
  cat: '全部', q: '', scope: 'all', mine: 'saved', view: null, mode: savedMode(), sort: 'hot', feedTop: 0,
}))

function setMode(mode: Mode) {
  useHomeUI.setState({ mode })
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch { /* 隐私模式存不了就只在本次有效 */ }
}

function ViewToggle() {
  const mode = useHomeUI((s) => s.mode)
  return (
    <div className="seg view-toggle" role="radiogroup" aria-label="视图">
      <button role="radio" aria-checked={mode === 'plaza'} className={mode === 'plaza' ? 'is-on' : ''} onClick={() => setMode('plaza')} title="3D 广场">
        <IconPlaza width={17} height={17} /><span>广场</span>
      </button>
      <button role="radio" aria-checked={mode === 'cards'} className={mode === 'cards' ? 'is-on' : ''} onClick={() => setMode('cards')} title="卡片列表">
        <IconCards width={16} height={16} /><span>卡片</span>
      </button>
    </div>
  )
}

function score(p: FeedPost, likes: number, comments: number) {
  const days = (Date.now() - new Date(p.createdAt).getTime()) / 86400000
  return Math.log10(likes + 1) * 10 + comments * 2 + Math.max(0, 10 - days) * 2.5 + (p.official ? 0 : 6)
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const say = useCommunity((s) => s.say)
  const [old, setOld] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await changePassword({ old, password: next })
      say('密码改好了，其他设备已退出登录')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  return (
    <form className="profile-pass" onSubmit={submit}>
      <input type="password" value={old} onChange={(e) => setOld(e.target.value)} placeholder="原密码" aria-label="原密码" autoComplete="current-password" autoFocus maxLength={72} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="新密码，至少 8 位" aria-label="新密码" autoComplete="new-password" maxLength={72} />
      {error && <p role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !old || next.length < 8}>{busy ? '请稍候…' : '确定修改'}</button>
    </form>
  )
}

function Profile({ onMine }: { onMine: (m: Mine) => void }) {
  const me = useCommunity((s) => s.me)
  const rename = useCommunity((s) => s.rename)
  const logout = useCommunity((s) => s.logout)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(me.name)
  const [pass, setPass] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setName(me.name)
    setPass(false)
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open, me.name])
  const go = (m: Mine) => {
    onMine(m)
    setOpen(false)
  }
  return (
    <div className="dropdown profile" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen(!open)} aria-label="我的">
        <Avatar user={me} size={34} />
      </button>
      {open && (
        <div className="dropdown-menu profile-menu">
          <div className="profile-head">
            <Avatar user={me} size={40} />
            <span>
              <b>{me.name}</b>
              <small>{me.email}{me.role === 'admin' ? ' · 管理员' : ''}</small>
            </span>
          </div>
          <form className="profile-name" onSubmit={(e) => { e.preventDefault(); rename(name); setOpen(false) }}>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-label="昵称" />
            <button className="btn primary" disabled={!name.trim() || name === me.name}>改昵称</button>
          </form>
          <div className="dropdown-sep" />
          {MINE_TABS.map(([id]) => (
            <button key={id} className="dropdown-item" onClick={() => go(id)}><b>{id === 'drafts' ? '我导入的（生成中、还没发布）' : MINE_LABEL[id]}</b></button>
          ))}
          <div className="dropdown-sep" />
          {me.role === 'admin' && <a className="dropdown-item" href="#/admin" onClick={() => setOpen(false)}><b>管理后台</b></a>}
          <button className="dropdown-item" onClick={() => setPass(!pass)} aria-expanded={pass}><b>修改密码</b></button>
          {pass && <PasswordForm onDone={() => setOpen(false)} />}
          <button className="dropdown-item is-quiet" onClick={logout}><b>退出登录</b></button>
        </div>
      )}
    </div>
  )
}

/** 右下角黑色「+」：点开从按钮上方依次弹出「发布笔记」「上传说明书」，选了就收起 */
function CreateFab() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openPublish = useCommunity((s) => s.openPublish)
  const toggle = useApp((s) => s.toggle)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    // 捕获阶段先拦下 Esc：只收起菜单，不顺带退出「我的」
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  const pick = (go: () => void) => {
    setOpen(false)
    go()
  }
  return (
    <div className={`fab ${open ? 'is-open' : ''}`} ref={ref}>
      <div className="fab-menu" role="menu" aria-label="发布" aria-hidden={!open} inert={!open}>
        <button role="menuitem" className="fab-item" data-act="upload" style={{ '--k': 1 } as CSSProperties} onClick={() => pick(() => toggle('importOpen'))}>
          <span className="fab-item-icon"><IconCamera width={18} height={18} /></span>
          <span className="fab-item-text"><b>上传说明书</b><small>PDF / 照片，AI 生成 3D 指导</small></span>
        </button>
        <button role="menuitem" className="fab-item" data-act="note" style={{ '--k': 0 } as CSSProperties} onClick={() => pick(() => openPublish({ note: true }))}>
          <span className="fab-item-icon"><IconEdit width={17} height={17} /></span>
          <span className="fab-item-text"><b>发布笔记</b><small>技巧、避坑、修好的经验</small></span>
        </button>
      </div>
      <button className="fab-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={open ? '收起' : '发布或上传说明书'} title={open ? '收起' : '发布 / 上传说明书'}>
        <IconPlus width={24} height={24} />
      </button>
    </div>
  )
}

const enterMine = (mine?: Mine) => useHomeUI.setState((s) => ({ scope: 'mine', mine: mine ?? s.mine }))
const leaveMine = () => useHomeUI.setState({ scope: 'all' })

function MineEmpty({ mine, q }: { mine: Mine; q: string }) {
  const openPublish = useCommunity((s) => s.openPublish)
  const toggle = useApp((s) => s.toggle)
  return (
    <div className="mine-empty" role="status">
      {q ? <><b>「{q}」在{MINE_LABEL[mine]}里没找到</b><p>换个词，或者清空搜索看全部。</p></>
        : mine === 'drafts' ? <><b>没有还没发布的说明书</b><p>上传说明书 PDF / 照片，生成的 3D 说明书会先放在这里。</p></>
          : mine === 'posts' ? <><b>还没有发布过</b><p>写一篇使用笔记，或者上传一份说明书生成 3D 版。</p></>
            : <><b>{mine === 'liked' ? '还没有点赞' : '还没有收藏'}</b><p>在说明书页面底部点 {mine === 'liked' ? '♡' : '☆'}，{mine === 'liked' ? '赞过' : '收藏'}的会出现在这里。</p></>}
      {!q && mine === 'drafts' && <button className="btn primary" onClick={() => toggle('importOpen')}><IconCamera width={15} height={15} /> 上传说明书</button>}
      {!q && mine === 'posts' && <button className="btn primary" onClick={() => openPublish({ note: true })}><IconEdit width={15} height={15} /> 写笔记</button>}
    </div>
  )
}

function summary(cards: FeedPost[]) {
  const manuals = cards.filter((p) => p.kind === 'manual')
  const tutorials = manuals.filter((p) => p.tutorial).length
  const notes = cards.filter((p) => p.kind === 'note').length
  return [`${manuals.length - tutorials} 份 3D 说明书`, tutorials > 0 && `${tutorials} 份 3D 教程`, `${notes} 篇使用笔记`].filter(Boolean).join(' · ')
}

export function HomePage() {
  const feed = useFeed()
  const db = useCommunity((s) => s.db)
  const me = useCommunity((s) => s.me)
  const publishOpen = useCommunity((s) => !!s.publishOpen)
  const openPublish = useCommunity((s) => s.openPublish)
  const importOpen = useApp((s) => s.importOpen)
  const toggle = useApp((s) => s.toggle)
  const { cat, q, scope, mine, mode, sort } = useHomeUI()
  const set = useHomeUI.setState
  const dq = useDebounced(q.trim(), 220)
  const inMine = scope === 'mine'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (useCommunity.getState().publishOpen) openPublish(false)
      else if (useApp.getState().importOpen) toggle('importOpen')
      else if (useHomeUI.getState().scope === 'mine') leaveMine()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPublish, toggle, set])

  const published = useMemo(() => feed.filter((p) => !p.draft), [feed])
  /** 广场上一份说明书一格：官方的、用户发布的、自己导入还没发布的（管理员看得到的别人的草稿不放） */
  const manuals = useMemo(() => feed.filter((p) => p.kind === 'manual' && !p.foreign), [feed])
  const jobs = useImportJobs((s) => s.jobs)
  const busy = jobs.some((j) => j.status === 'running')
  useJobPolling(true)
  // 导入弹窗关掉（比如点了「后台运行」）后马上刷新，刚开始的任务就出现在「导入」里
  useEffect(() => {
    if (!importOpen) useImportJobs.getState().load()
  }, [importOpen])
  const authorName = useMemo(() => (p: FeedPost) => authorOf(db, p.author).name, [db])
  // 后台联网监控到的市场热度：正火的说明书往前排，「热门」里只看它们
  const hot = useTrends((s) => s.hot)
  useEffect(() => {
    useTrends.getState().load()
    const t = setInterval(() => useTrends.getState().load(), 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  const heatOf = useMemo(() => (p: FeedPost) => (p.kind === 'manual' ? hot.get(p.product)?.heat ?? 0 : 0), [hot])
  const popularity = useMemo(() => {
    const s = new Map(feed.map((p) => [p.id, score(p, likeCount(db, p.id), commentCount(db, p)) + heatOf(p) * HEAT_WEIGHT]))
    return (p: FeedPost) => s.get(p.id) ?? 0
  }, [feed, db, heatOf])

  /** 品类那一行只放大类（电子产品、家用电器……），数量按广场上的说明书算；有热度数据时最前面加「热门」 */
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of manuals) counts.set(groupOf(p.category), (counts.get(groupOf(p.category)) ?? 0) + 1)
    const hotCount = manuals.filter((p) => heatOf(p) > 0).length
    return [...(hotCount ? [[HOT_CAT, hotCount] as const] : []), ...GROUP_ORDER.filter((g) => counts.has(g)).map((g) => [g, counts.get(g)!] as const)]
  }, [manuals, heatOf])

  const mineLists = useMemo<Record<Mine, FeedPost[]>>(() => ({
    saved: published.filter((p) => db.saves[p.id]?.includes(me.id)),
    liked: published.filter((p) => db.likes[p.id]?.includes(me.id)),
    posts: feed.filter((p) => p.author === me.id),
    drafts: feed.filter((p) => p.draft && !p.foreign),
  }), [feed, published, db, me.id])
  const mineList = inMine ? mineLists[mine] : null
  /** 「导入」里除了生成好的草稿，还有生成中的任务（卡片在上面） */
  const showJobs = inMine && mine === 'drafts' && jobs.length > 0
  /** 「我的」里不分品类 */
  const catOn = inMine ? '全部' : cat
  /** 「热门」：只看上了热榜的说明书，按热度排（最热的在广场中心） */
  const hotOn = catOn === HOT_CAT

  /** 广场：全部时一份说明书一格；「我的」里说明书和笔记都上广场（笔记借关联说明书的模型图或用自己的配图） */
  const plan = useMemo(
    () => arrange(mineList ?? manuals, hotOn
      ? { q: dq, cat: catOn, match: (p) => heatOf(p) > 0, popularity: heatOf, author: authorName }
      : { q: dq, cat: catOn, popularity, author: authorName }),
    [mineList, manuals, dq, catOn, hotOn, heatOf, popularity, authorName],
  )

  const noteCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of published) if (p.kind === 'note') m.set(p.product, (m.get(p.product) ?? 0) + 1)
    return m
  }, [published])

  /** 卡片视图：已发布的说明书和使用笔记混排；搜索时只留匹配的、最匹配的排第一，否则按推荐 / 最新 */
  const cards = useMemo(() => {
    let list = mineList ?? published
    if (hotOn) list = list.filter((p) => heatOf(p) > 0)
    else if (catOn !== '全部') list = list.filter((p) => groupOf(p.category) === catOn)
    const rank = hotOn ? heatOf : popularity
    if (dq) {
      return list
        .map((p) => ({ p, s: queryScore(p, dq, authorName(p)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || rank(b.p) - rank(a.p))
        .map((x) => x.p)
    }
    return [...list].sort(sort === 'new' ? (a, b) => b.createdAt.localeCompare(a.createdAt) : (a, b) => rank(b) - rank(a))
  }, [mineList, published, catOn, hotOn, heatOf, dq, sort, authorName, popularity])

  const filtering = !!dq || catOn !== '全部'
  const near = plan.order.filter((p) => plan.tone.get(p.id) === 'near').length
  const where = inMine ? MINE_LABEL[mine] : catOn !== '全部' ? catOn : ''
  const viewKey = `${scope}|${mine}|${dq}|${catOn}`
  const empty = !!mineList && !showJobs && (mineList.length === 0 || (mode === 'cards' && cards.length === 0))

  const feedHead = (
    <div className="feed-head">
      {dq ? (
        <p className="feed-summary">
          {cards.length > 0 ? <>「{dq}」找到 {cards.length} 篇{where && <>（{where}）</>}，最匹配的在左上角</> : <>没找到「{dq}」，换个词试试</>}
        </p>
      ) : (
        <>
          <div className="seg feed-sort" role="radiogroup" aria-label="排序">
            {([['hot', '推荐'], ['new', '最新']] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sort === id} className={sort === id ? 'is-on' : ''} onClick={() => set({ sort: id })}>{label}</button>
            ))}
          </div>
          <p className="feed-summary">
            {where && <b>{where} · </b>}
            {summary(cards)}
          </p>
        </>
      )}
    </div>
  )

  return (
    <div className={`plaza-page is-${mode}`}>
      {mode === 'plaza' ? (
        <Plaza
          order={plan.order}
          tone={plan.tone}
          notes={noteCount}
          focusKey={viewKey}
          initial={useHomeUI.getState().view}
          onLeave={(view) => set({ view })}
        />
      ) : (
        <>
          <CardFeed
            posts={cards}
            best={dq ? cards[0]?.id ?? null : null}
            head={showJobs ? <><ImportJobs />{feedHead}</> : feedHead}
            resetKey={`${viewKey}|${sort}`}
            initialTop={useHomeUI.getState().feedTop}
            onLeave={(feedTop) => set({ feedTop })}
          />
          <div className="feed-veil" aria-hidden />
        </>
      )}

      <header className="plaza-top">
        <a className="home-brand" href="#/" onClick={() => set({ cat: '全部', q: '', scope: 'all' })}>
          <span className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} width="32" height="32" alt="" />
          </span>
          <span className="brand-text"><b>懂了<em>Dongle</em></b></span>
        </a>
        <label className="search">
          <IconSearch width={17} height={17} />
          <input
            value={q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="搜说明书、教程、步骤：滤芯、配网、折纸、齿轮……"
            enterKeyHint="search"
          />
          {q && <button className="search-clear" onClick={() => set({ q: '' })} aria-label="清空"><IconClose width={14} height={14} /></button>}
        </label>
        <ViewToggle />
        <div className="home-actions me-group" role="group" aria-label="我的">
          {me.role === 'admin' && <a className="admin-btn" href="#/admin" title="管理后台">后台</a>}
          <button
            className={`mine-btn ${inMine ? 'is-on' : ''}`}
            onClick={() => (inMine ? leaveMine() : enterMine(busy ? 'drafts' : undefined))}
            aria-pressed={inMine}
            title={busy ? '有说明书正在生成，点开「导入」看进度' : undefined}
          >
            我的{busy && <i className="chip-busy" aria-label="有正在生成的" />}
          </button>
          <Profile onMine={enterMine} />
        </div>
      </header>

      {inMine ? (
        <nav className="plaza-cats is-mine" aria-label="我的">
          <button className="chip is-scope" onClick={leaveMine} title="回到全部说明书">
            <IconLeft width={14} height={14} />我的
          </button>
          <i className="cats-sep" aria-hidden />
          {MINE_TABS.map(([id, label]) => (
            <button key={id} className={`chip ${mine === id ? 'is-on' : ''}`} onClick={() => set({ mine: id })} aria-pressed={mine === id}>
              {label}
              {id === 'drafts' && busy && <i className="chip-busy" title="有正在生成的" />}
              <small>{mineLists[id].length + (id === 'drafts' ? jobs.length : 0)}</small>
            </button>
          ))}
        </nav>
      ) : (
        <nav className="plaza-cats" aria-label="品类">
          {[['全部', manuals.length] as const, ...categories].map(([c, n]) => (
            <button key={c} className={`chip ${cat === c ? 'is-on' : ''}`} onClick={() => set({ cat: cat === c && c !== '全部' ? '全部' : c })}>
              {c}<small>{n}</small>
            </button>
          ))}
        </nav>
      )}

      {mode === 'plaza' && filtering && !empty && (
        <p className="plaza-hint" role="status">
          {plan.best ? (
            <>
              <span>{dq ? <>「{dq}」最匹配</> : <>{catOn} · 最热</>}：<b>{plan.best.title}</b></span>
              {plan.hits > 1 && <span>周围 {plan.hits - 1} 份{dq ? '也匹配' : hotOn ? '也在热榜上' : '同一大类'}</span>}
              {near > 0 && <span>{near} 份相关</span>}
            </>
          ) : <span>没找到「{dq}」，换个词试试</span>}
        </p>
      )}

      {empty && mineList && <MineEmpty mine={mine} q={mineList.length ? dq : ''} />}
      {showJobs && mode === 'plaza' && <ImportJobs floating />}

      <CreateFab />

      {mode === 'plaza' && !filtering && !empty && (!mineList || mineList.length > 0) && <p className="plaza-tip">拖动浏览 · 点模型看 3D 演示</p>}

      {importOpen && <ImportModal />}
      {publishOpen && <PublishModal />}
    </div>
  )
}
