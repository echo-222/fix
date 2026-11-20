import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { VERDICT_LABEL, cancelManualJob, jobImageUrl, jobStages, openImported } from '../../ai/manualImport'
import { withBase } from '../../base'
import { useCommunity, useFeed } from '../../community/store'
import { navigate, type AdminTab } from '../../router'
import { Avatar } from '../community/bits'
import { IconSearch } from '../icons'
import { connectLive, useAdmin, type AdminEvent, type AdminJob, type AdminUser, type Invite, type JobDetail, type Overview } from './data'
import { ago, clock, describe, deviceOf, isOnline, pageName, toneOf } from './format'
import { TrendsTab } from './TrendsTab'
import './admin.css'

/**
 * 管理后台（#/admin/…，只有管理员看得到入口，接口也只认管理员）：
 * 概览（数字、趋势、在线的人、热门、实时动态）· 用户（列表、详情、停用 / 下线 / 设管理员 / 清空内容）
 * · 生成（所有人用 AI 生成的任务：原页、日志、中间产物、结果，被用户删掉的也在）
 * · 热度（联网监控市场热度，自动生成热门产品发到广场，见 TrendsTab.tsx）
 * · 内容（删笔记、删评论）· 邀请码（生成、停用、看谁用了）。动态靠 SSE 实时推过来。
 */
const TABS: [AdminTab, string][] = [['overview', '概览'], ['users', '用户'], ['imports', '生成'], ['trends', '热度'], ['content', '内容'], ['invites', '邀请码']]

/** 说明书 / 笔记 id → 标题：社区里能看到的 + 后台列表里拿到的 */
function useTitles() {
  const feed = useFeed()
  const content = useAdmin((s) => s.content)
  const details = useAdmin((s) => s.details)
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const p of feed) m.set(p.id, p.title)
    for (const p of content?.posts ?? []) m.set(p.id, p.title)
    for (const d of Object.values(details)) for (const p of d.posts) m.set(p.id, p.title)
    return (id: string) => m.get(id) ?? (id.startsWith('c-') ? '一条评论' : id.startsWith('p-') ? '已删除的笔记' : id)
  }, [feed, content, details])
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非 https（局域网开发）没有剪贴板接口
    const t = document.createElement('textarea')
    t.value = text
    document.body.append(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
  useAdmin.getState().say('已复制')
}

const inviteLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?invite=${code}`

function Panel({ title, extra, className = '', children }: { title: ReactNode; extra?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`adm-panel ${className}`}>
      <header><h3>{title}</h3>{extra}</header>
      {children}
    </section>
  )
}

const Loading = () => <p className="adm-empty">加载中…</p>

function UserLink({ id, name }: { id: string | null; name: string | null }) {
  if (!id) return <b className="adm-who is-anon">访客</b>
  return <a className="adm-who" href={`#/admin/users/${encodeURIComponent(id)}`}>{name ?? '已删除的用户'}</a>
}

function Feed({ events, hideWho }: { events: AdminEvent[]; hideWho?: boolean }) {
  const titleOf = useTitles()
  /** 打开页面之后推过来的那些闪一下 */
  const [base] = useState(() => events[0]?.id ?? 0)
  if (!events.length) return <p className="adm-empty">还没有动态</p>
  return (
    <ol className="adm-feed">
      {events.map((e) => {
        const s = describe(e, titleOf)
        return (
          <li key={e.id} className={`is-${toneOf(e.kind)}${e.id > base ? ' is-new' : ''}`}>
            <time title={new Date(e.at).toLocaleString()}>{clock(e.at)}</time>
            <i aria-hidden />
            <p>
              {!hideWho && <><UserLink id={e.user_id} name={e.name} /> </>}
              {s.verb}
              {s.object && <> <b>《{s.object}》</b></>}
              {s.quote && <> <q>{s.quote}</q></>}
            </p>
            {e.ip && <small>{e.ip}</small>}
          </li>
        )
      })}
    </ol>
  )
}

// ---------- 概览 ----------

function Trend({ data }: { data: Overview['trend'] }) {
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + 8 * 3600_000 - (13 - i) * 86400_000).toISOString().slice(0, 10))
  const by = new Map(data.map((d) => [d.d, d]))
  const rows = days.map((d) => ({ d, r: by.get(d)?.registered ?? 0, a: by.get(d)?.active ?? 0 }))
  const max = Math.max(1, ...rows.map((x) => Math.max(x.r, x.a)))
  const W = 20
  return (
    <figure className="adm-trend">
      <svg viewBox={`0 0 ${14 * W} 96`} role="img" aria-label="最近 14 天新注册和活跃人数">
        {rows.map((x, i) => {
          const ha = (x.a / max) * 72
          const hr = (x.r / max) * 72
          return (
            <g key={x.d} transform={`translate(${i * W} 0)`}>
              <title>{`${x.d}：活跃 ${x.a}，新注册 ${x.r}`}</title>
              <rect x={3} y={78 - ha} width={8} height={Math.max(ha, 1)} rx={2.5} className="is-active" />
              <rect x={11} y={78 - hr} width={6} height={Math.max(hr, 1)} rx={2.5} className="is-reg" />
              {i % 2 === 1 && <text x={10} y={92}>{Number(x.d.slice(8))}</text>}
            </g>
          )
        })}
      </svg>
      <figcaption><span><i className="is-active" />活跃</span><span><i className="is-reg" />新注册</span></figcaption>
    </figure>
  )
}

function MailBanner({ codes }: { codes: Overview['codes'] }) {
  return (
    <div className="adm-banner" role="status">
      <b>邮件服务还没配置</b>
      <p>验证码不会发到用户邮箱。在服务器的 /etc/dongle.env（本地开发是 .env.local）里填好 SMTP_HOST / SMTP_USER / SMTP_PASS，重启服务后就会自动发。在那之前，下面是还没过期的验证码，可以转告对方：</p>
      {codes.length ? (
        <ul>
          {codes.map((c) => (
            <li key={`${c.email}-${c.purpose}`}>
              <span>{c.email}</span><em>{c.purpose === 'register' ? '注册' : '重设密码'}</em>
              <button className="adm-code" onClick={() => copy(c.plain)} title="复制">{c.plain}</button>
              <small>{ago(c.created_at)}</small>
            </li>
          ))}
        </ul>
      ) : <p className="adm-dim">现在没有等着用的验证码</p>}
    </div>
  )
}

function OverviewTab() {
  const o = useAdmin((s) => s.overview)
  const live = useAdmin((s) => s.live)
  const titleOf = useTitles()
  if (!o) return <Loading />
  const s = o.stats
  const cards: [string, number, string?][] = [
    ['注册用户', s.users, [s.today ? `今天 +${s.today}` : '今天还没有新用户', s.banned ? `已停用 ${s.banned}` : ''].filter(Boolean).join(' · ')],
    ['当前在线', s.online, '2 分钟内有动静'],
    ['24 小时活跃', s.active],
    ['今天打开说明书', s.views, '同一人同一篇 10 分钟内算一次'],
    ['收藏', s.saves],
    ['点赞', s.likes],
    ['评论', s.comments],
    ['用户发布', s.manuals + s.notes, `${s.manuals} 份说明书 · ${s.notes} 篇笔记`],
    ['AI 生成', s.imports, [`今天 ${s.importsToday}`, s.importing ? `${s.importing} 个在跑` : ''].filter(Boolean).join(' · ')],
    ['剩余邀请名额', s.invitesLeft],
  ]
  return (
    <div className="adm-overview">
      {o.verify && !o.mail && <MailBanner codes={o.codes} />}
      <section className="adm-stats">
        {cards.map(([label, n, sub]) => (
          <div key={label} className="adm-stat">
            <small>{label}</small>
            <b>{n}</b>
            {sub && <span>{sub}</span>}
          </div>
        ))}
      </section>
      <div className="adm-cols">
        <div className="adm-col">
          <Panel title="最近 14 天"><Trend data={o.trend} /></Panel>
          <Panel title={<>在线 <em>{o.online.length}</em></>}>
            {o.online.length ? (
              <ul className="adm-people">
                {o.online.map((u) => (
                  <li key={u.id}>
                    <a href={`#/admin/users/${u.id}`}>
                      <Avatar user={u} size={30} />
                      <span><b>{u.name}</b><small>正在看 {pageName(u.last_page, titleOf)}</small></span>
                      <time>{ago(u.last_seen)}</time>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="adm-empty">现在没人在线</p>}
          </Panel>
          <Panel title="热门" extra={<small>打开 · 收藏 · 点赞</small>}>
            {o.hot.length ? (
              <ol className="adm-hot">
                {o.hot.map((h) => (
                  <li key={h.target}>
                    <a href={`#/note/${encodeURIComponent(h.target)}`}>{titleOf(h.target)}</a>
                    <span>{h.views} · {h.saves} · {h.likes}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="adm-empty">还没有数据</p>}
          </Panel>
        </div>
        <Panel title="实时动态" className="adm-live-panel" extra={<small>有新动态会自动出现在最上面</small>}>
          <Feed events={live} />
        </Panel>
      </div>
    </div>
  )
}

// ---------- 用户 ----------

type UserFilter = 'all' | 'online' | 'admin' | 'banned'

function StatusTag({ u }: { u: Pick<AdminUser, 'status' | 'role' | 'last_seen'> }) {
  return (
    <span className="adm-tags">
      {u.status === 'banned' ? <em className="is-banned">已停用</em> : isOnline(u.last_seen) ? <em className="is-online">在线</em> : <em>离线</em>}
      {u.role === 'admin' && <em className="is-admin">管理员</em>}
    </span>
  )
}

function UsersTab() {
  const users = useAdmin((s) => s.users)
  const titleOf = useTitles()
  const [q, setQ] = useState('')
  const [f, setF] = useState<UserFilter>('all')
  if (!users) return <Loading />
  const k = q.trim().toLowerCase()
  const counts = {
    all: users.length,
    online: users.filter((u) => isOnline(u.last_seen) && u.status === 'active').length,
    admin: users.filter((u) => u.role === 'admin').length,
    banned: users.filter((u) => u.status === 'banned').length,
  }
  const list = users.filter((u) =>
    (f === 'all' || (f === 'online' ? isOnline(u.last_seen) && u.status === 'active' : f === 'admin' ? u.role === 'admin' : u.status === 'banned'))
    && (!k || u.name.toLowerCase().includes(k) || u.email.includes(k) || (u.invite ?? '').toLowerCase().includes(k)))
  return (
    <div>
      <div className="adm-bar">
        <label className="adm-search"><IconSearch width={15} height={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜昵称、邮箱、邀请码" /></label>
        <div className="adm-chips">
          {([['all', '全部'], ['online', '在线'], ['admin', '管理员'], ['banned', '已停用']] as const).map(([id, label]) => (
            <button key={id} className={`chip ${f === id ? 'is-on' : ''}`} onClick={() => setF(id)}>{label}<small>{counts[id]}</small></button>
          ))}
        </div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>用户</th><th>状态</th><th>邀请码</th><th>注册</th><th>最近</th><th className="num">收藏</th><th className="num">点赞</th><th className="num">评论</th><th className="num">发布</th><th className="num">打开</th></tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} onClick={() => navigate({ name: 'admin', tab: 'users', user: u.id })}>
                <td><span className="adm-user"><Avatar user={u} size={30} /><span><b>{u.name}</b><small>{u.email}</small></span></span></td>
                <td><StatusTag u={u} /></td>
                <td className="mono">{u.invite ?? '—'}</td>
                <td>{clock(u.created_at)}</td>
                <td><span className="adm-seen">{ago(u.last_seen)}{isOnline(u.last_seen) && <small>{pageName(u.last_page, titleOf)}</small>}</span></td>
                <td className="num">{u.saves}</td>
                <td className="num">{u.likes}</td>
                <td className="num">{u.comments}</td>
                <td className="num">{u.posts}</td>
                <td className="num">{u.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="adm-empty">{users.length ? '没有符合条件的用户' : '还没有人注册'}</p>}
      </div>
    </div>
  )
}

function UserView({ id }: { id: string }) {
  const d = useAdmin((s) => s.details[id])
  const act = useAdmin((s) => s.act)
  const remove = useAdmin((s) => s.remove)
  const loadUser = useAdmin((s) => s.loadUser)
  const me = useCommunity((s) => s.me)
  const titleOf = useTitles()
  const [temp, setTemp] = useState<{ id: string; password: string } | null>(null)
  useEffect(() => {
    loadUser(id)
  }, [id, loadUser])
  if (!d) return <Loading />
  const u = d.user
  const self = u.id === me.id
  const resetPassword = async () => {
    if (!confirm(`给「${u.name}」重置密码？会生成一个临时密码，TA 所有设备都会下线。`)) return
    const password = await act(id, 'passwd')
    if (password) setTemp({ id, password })
  }
  const ban = () => {
    const reason = prompt(`停用「${u.name}」：填个原因（登录时会提示对方，可以不填）`, '')
    if (reason !== null) act(id, 'ban', { reason })
  }
  const purge = () => {
    if (confirm(`删除「${u.name}」发布的全部 ${u.posts} 篇笔记和 ${u.comments} 条评论？删了不能恢复。`)) act(id, 'purge')
  }
  const role = () => {
    const to = u.role === 'admin' ? 'user' : 'admin'
    if (confirm(to === 'admin' ? `把「${u.name}」设为管理员？对方能看到这个后台、处理所有用户。` : `取消「${u.name}」的管理员？`)) act(id, 'role', { role: to })
  }
  const delComment = async (cid: string) => {
    if (!confirm('删除这条评论（连同下面的回复）？')) return
    await remove('comment', cid)
    loadUser(id)
  }
  const delPost = async (pid: string, title: string) => {
    if (!confirm(`删除笔记《${title}》（连同评论）？`)) return
    await remove('post', pid)
    loadUser(id)
  }
  return (
    <div className="adm-user-view">
      <a className="adm-back" href="#/admin/users">← 全部用户</a>
      <section className="adm-panel adm-profile">
        <Avatar user={u} size={56} />
        <div>
          <h2>{u.name} <StatusTag u={u} /></h2>
          <p className="mono">{u.email}</p>
          <dl>
            <div><dt>注册</dt><dd>{clock(u.created_at)}</dd></div>
            <div><dt>邀请码</dt><dd className="mono">{u.invite ?? '—'}</dd></div>
            <div><dt>最近活跃</dt><dd>{ago(u.last_seen)}</dd></div>
            <div><dt>{isOnline(u.last_seen) ? '正在看' : '最后在看'}</dt><dd>{pageName(u.last_page, titleOf)}</dd></div>
            <div><dt>IP</dt><dd className="mono">{u.last_ip ?? '—'}</dd></div>
          </dl>
          {u.status === 'banned' && <p className="adm-banned">已停用{u.ban_reason ? `：${u.ban_reason}` : ''}</p>}
          {temp?.id === id && (
            <p className="adm-temp">
              临时密码 <button className="adm-code" onClick={() => copy(temp.password)} title="复制">{temp.password}</button>
              <span>只显示这一次。发给 TA，登录后在右上角头像菜单「修改密码」里换掉</span>
            </p>
          )}
        </div>
        <div className="adm-actions">
          {u.status === 'banned'
            ? <button className="btn" onClick={() => act(id, 'unban')}>恢复账号</button>
            : <button className="btn is-danger" onClick={ban} disabled={self}>停用账号</button>}
          <button className="btn" onClick={() => confirm(`让「${u.name}」所有设备退出登录？`) && act(id, 'kick')} disabled={!d.sessions.length}>强制下线</button>
          <button className="btn" onClick={resetPassword} disabled={self} title={self ? '自己的密码在右上角头像菜单里改' : undefined}>重置密码</button>
          <button className="btn" onClick={role} disabled={self}>{u.role === 'admin' ? '取消管理员' : '设为管理员'}</button>
          <button className="btn" onClick={purge} disabled={!u.posts && !u.comments}>清空内容</button>
        </div>
      </section>
      <div className="adm-grid">
        <Panel title={<>收藏 <em>{d.saves.length}</em></>}>
          <TargetList rows={d.saves} titleOf={titleOf} empty="还没有收藏" />
        </Panel>
        <Panel title={<>点赞 <em>{d.likes.length}</em></>}>
          <TargetList rows={d.likes} titleOf={titleOf} empty="还没有点赞" />
        </Panel>
        <Panel title={<>发布 <em>{d.posts.length}</em></>}>
          {d.posts.length ? (
            <ul className="adm-list">
              {d.posts.map((p) => (
                <li key={p.id}>
                  <a href={`#/note/${encodeURIComponent(p.id)}`}>{p.kind === 'manual' ? '说明书' : '笔记'} · {p.title}</a>
                  <time>{clock(p.created_at)}</time>
                  <button className="adm-del" onClick={() => delPost(p.id, p.title)}>删除</button>
                </li>
              ))}
            </ul>
          ) : <p className="adm-empty">还没有发布</p>}
        </Panel>
        <Panel title={<>评论 <em>{d.comments.length}</em></>}>
          {d.comments.length ? (
            <ul className="adm-list">
              {d.comments.map((c) => (
                <li key={c.id}>
                  <span><q>{c.text}</q><small>在《{titleOf(c.post_id)}》</small></span>
                  <time>{clock(c.created_at)}</time>
                  <button className="adm-del" onClick={() => delComment(c.id)}>删除</button>
                </li>
              ))}
            </ul>
          ) : <p className="adm-empty">还没有评论</p>}
        </Panel>
        <Panel title={<>登录设备 <em>{d.sessions.length}</em></>}>
          {d.sessions.length ? (
            <ul className="adm-list">
              {d.sessions.map((s) => (
                <li key={s.id}>
                  <span><b>{deviceOf(s.ua)}</b><small>{s.ip ?? '—'} · {clock(s.created_at)} 登录</small></span>
                  <time>{ago(s.last_seen)}</time>
                </li>
              ))}
            </ul>
          ) : <p className="adm-empty">没有登录中的设备</p>}
        </Panel>
        <Panel title="行为记录" className="adm-span">
          <Feed events={d.events} hideWho />
        </Panel>
      </div>
    </div>
  )
}

function TargetList({ rows, titleOf, empty }: { rows: { target: string; created_at: string }[]; titleOf: (id: string) => string; empty: string }) {
  if (!rows.length) return <p className="adm-empty">{empty}</p>
  return (
    <ul className="adm-list">
      {rows.map((r) => (
        <li key={r.target}>
          <a href={`#/note/${encodeURIComponent(r.target)}`}>{titleOf(r.target)}</a>
          <time>{clock(r.created_at)}</time>
        </li>
      ))}
    </ul>
  )
}

// ---------- 生成 ----------

type JobFilter = 'all' | 'running' | 'done' | 'failed' | 'deleted'

const jobTitle = (j: Pick<AdminJob, 'name' | 'route' | 'input'>) => j.name || j.route?.subject || j.input?.fileName || '未命名'
const jobFailed = (j: Pick<AdminJob, 'status' | 'kind'>) => j.status === 'error' || j.status === 'cancelled' || (j.status === 'done' && j.kind !== 'scene')
const kTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n))
const span = (ms: number) => (ms < 3600_000 ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : `${(ms / 3600_000).toFixed(1)} 小时`)
const duration = (j: Pick<AdminJob, 'status' | 'created' | 'finished'>) =>
  j.status === 'running' ? span(Date.now() - j.created) : j.finished ? span(j.finished - j.created) : '—'

function jobState(j: Pick<AdminJob, 'status' | 'kind' | 'error'>): [string, string] {
  if (j.status === 'running') return ['生成中', 'is-run']
  if (j.status === 'cancelled') return ['已取消', 'is-off']
  if (j.status === 'error') return [j.error?.startsWith('服务器重启') ? '中断' : '失败', 'is-off']
  if (j.kind === 'not_manual') return ['没认出内容', 'is-off']
  if (j.kind === 'parametric_desk') return ['转参数化', 'is-used']
  return ['完成', 'is-ok']
}

function JobTags({ j }: { j: Pick<AdminJob, 'status' | 'kind' | 'error' | 'legacy'> & { deleted?: string | null } }) {
  const [label, tone] = jobState(j)
  return (
    <span className="adm-tags">
      <span className={`adm-state ${tone}`}>{label}</span>
      {j.deleted && <em className="is-banned" title={`用户 ${clock(j.deleted)} 删了；文件都还在`}>用户已删</em>}
      {j.legacy && <em title="有任务记录之前的导入，按留下的文件补登记的">早期</em>}
    </span>
  )
}

const JOB_FILTERS: [JobFilter, string, (j: AdminJob) => boolean][] = [
  ['all', '全部', () => true],
  ['running', '生成中', (j) => j.status === 'running'],
  ['done', '完成', (j) => j.status === 'done' && j.kind === 'scene'],
  ['failed', '没成功', jobFailed],
  ['deleted', '用户已删', (j) => !!j.deleted],
]

function ImportsTab() {
  const jobs = useAdmin((s) => s.imports)
  const [q, setQ] = useState('')
  const [f, setF] = useState<JobFilter>('all')
  const running = !!jobs?.some((j) => j.status === 'running')
  // 有在跑的就勤刷新（阶段、用时在变），其余靠实时推送里的 import* 动态
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => useAdmin.getState().refresh('imports'), 4000)
    return () => clearInterval(t)
  }, [running])
  if (!jobs) return <Loading />
  const k = q.trim().toLowerCase()
  const test = JOB_FILTERS.find(([id]) => id === f)![2]
  const list = jobs.filter((j) => test(j) && (!k || [jobTitle(j), j.input?.fileName, j.ownerName, j.ownerEmail, j.id, j.manualId, j.route?.label].some((s) => s?.toLowerCase().includes(k))))
  return (
    <div>
      <div className="adm-bar">
        <label className="adm-search"><IconSearch width={15} height={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题、文件名、用户、任务号" /></label>
        <div className="adm-chips">
          {JOB_FILTERS.map(([id, label, t]) => (
            <button key={id} className={`chip ${f === id ? 'is-on' : ''}`} onClick={() => setF(id)}>{label}<small>{jobs.filter(t).length}</small></button>
          ))}
        </div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>开始</th><th>用户</th><th>生成的</th><th>类型</th><th>状态</th><th className="num">页</th><th className="num">tokens</th><th className="num">用时</th></tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} onClick={() => navigate({ name: 'admin', tab: 'imports', job: j.id })}>
                <td>{clock(new Date(j.created).toISOString())}</td>
                <td onClick={(e) => e.stopPropagation()}>{j.owner ? <UserLink id={j.owner} name={j.ownerName} /> : <span className="adm-dim">不明</span>}</td>
                <td>
                  <span className="adm-job">
                    <b>{jobTitle(j)}</b>
                    <small>{j.status === 'running' ? `${jobStages(j).find(([s]) => s === j.stage)?.[1] ?? j.stage}${j.detail ? ` · ${j.detail}` : ''}` : j.input?.fileName ?? j.id}</small>
                  </span>
                </td>
                <td>{j.route ? <em className="adm-kind">{j.route.label}</em> : <span className="adm-dim">—</span>}</td>
                <td><JobTags j={j} /></td>
                <td className="num">{j.input?.pages || '—'}</td>
                <td className="num">{j.usage.calls ? kTok(j.usage.input + j.usage.output) : '—'}</td>
                <td className="num">{duration(j)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="adm-empty">{jobs.length ? '没有符合条件的任务' : '还没有人用 AI 生成过'}</p>}
      </div>
    </div>
  )
}

function Shots({ id, dir, n }: { id: string; dir: 'pages' | 'photos'; n: number }) {
  return (
    <div className="adm-shots">
      {Array.from({ length: n }, (_, i) => (
        <a key={i} href={jobImageUrl(id, i + 1, dir)} target="_blank" rel="noreferrer" title="看原图">
          <img src={jobImageUrl(id, i + 1, dir)} alt={`第 ${i + 1} 张`} loading="lazy" />
          <small>{i + 1}</small>
        </a>
      ))}
    </div>
  )
}

function jobOutcome(d: JobDetail) {
  const j = d.job
  if (j.status === 'running') return `${jobStages(j).find(([s]) => s === j.stage)?.[1] ?? j.stage}${j.detail ? ` · ${j.detail}` : ''}`
  if (j.error) return j.error
  if (j.kind === 'not_manual') return '没认出能做成 3D 演示的内容'
  if (j.kind === 'parametric_desk') return '认出是铝型材家具，让用户转去参数化解析'
  if (j.summary) return `读了 ${j.summary.pages} 页，搭了 ${j.summary.parts} 个零件，${j.summary.guides.length} 套教程共 ${j.summary.guides.reduce((n, g) => n + g.steps, 0)} 步`
  return j.status === 'done' ? '已完成' : '—'
}

function ImportView({ id }: { id: string }) {
  const d = useAdmin((s) => s.jobs[id])
  const loadJob = useAdmin((s) => s.loadJob)
  const running = d?.job.status === 'running'
  useEffect(() => {
    loadJob(id)
  }, [id, loadJob])
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => loadJob(id), 2500)
    return () => clearInterval(t)
  }, [id, running, loadJob])
  if (!d) return <Loading />
  const j = d.job
  const stages = jobStages(j)
  const at = Math.max(0, stages.findIndex(([s]) => s === j.stage))
  const fileUrl = (name: string) => withBase(`/api/admin/imports/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`)
  const cancel = async () => {
    if (!confirm(`取消「${jobTitle(j)}」的生成？`)) return
    await cancelManualJob(id).catch((e) => useAdmin.getState().say(String(e)))
    loadJob(id)
  }
  return (
    <div className="adm-user-view adm-job-view">
      <a className="adm-back" href="#/admin/imports">← 全部生成</a>
      <section className="adm-panel adm-profile">
        <div className="adm-job-cover">{d.pages ? <img src={jobImageUrl(id)} alt="" /> : <span>没存原页</span>}</div>
        <div>
          <h2>{jobTitle(j)} <JobTags j={{ ...j, deleted: d.imported?.deleted }} /></h2>
          <p className={jobFailed(j) ? 'adm-banned' : undefined}>{jobOutcome(d)}</p>
          {running && <div className="adm-job-bar" title={`${at + 1}/${stages.length}`}><i style={{ width: `${Math.round(((at + 0.5) / stages.length) * 100)}%` }} /></div>}
          <dl>
            <div><dt>用户</dt><dd>{j.owner ? <UserLink id={j.owner} name={d.ownerName} /> : '不明'}{d.ownerEmail && <small className="mono"> {d.ownerEmail}</small>}</dd></div>
            <div><dt>开始</dt><dd>{clock(new Date(j.created).toISOString())}</dd></div>
            <div><dt>用时</dt><dd>{duration(j)}</dd></div>
            <div><dt>模型</dt><dd className="mono">{j.model || '—'}</dd></div>
            <div><dt>调用</dt><dd className="mono">{j.usage.calls} 次 · 入 {kTok(j.usage.input)}（缓存 {kTok(j.usage.cached)}）· 出 {kTok(j.usage.output)}</dd></div>
            {!!j.credits && <div><dt>Tripo</dt><dd className="mono">{j.credits} credits</dd></div>}
            <div><dt>任务号</dt><dd className="mono">{id}</dd></div>
          </dl>
          {d.imported?.deleted && <p className="adm-banned">用户 {clock(d.imported.deleted)} 删除了这份说明书（只是从 TA 的导入里拿掉，文件都还在，下面可以打开）</p>}
        </div>
        <div className="adm-actions">
          {d.imported && <button className="btn primary" onClick={() => openImported(d.imported!.id)}>打开 3D 演示</button>}
          {running && <button className="btn is-danger" onClick={cancel}>取消生成</button>}
          {j.owner && <a className="btn" href={`#/admin/users/${encodeURIComponent(j.owner)}`}>看这个用户</a>}
        </div>
      </section>
      <div className="adm-grid">
        <Panel title="输入">
          <dl className="adm-kv">
            <div><dt>文件</dt><dd>{j.input?.fileName ?? '（直接传的图片）'}</dd></div>
            <div><dt>页数</dt><dd>{j.input?.pages ?? d.pages} 张图{j.input?.photos ? ` · 产品照片 ${j.input.photos} 张` : ''}</dd></div>
            <div><dt>选项</dt><dd>{[j.review ? '截图复核' : '不复核', j.appearance ? '真实外观' : '线稿'].join(' · ')}</dd></div>
            {j.input?.hint && <div><dt>补充说明</dt><dd>{j.input.hint}</dd></div>}
          </dl>
        </Panel>
        <Panel title="类型判断">
          {j.route ? (
            <dl className="adm-kv">
              <div><dt>判为</dt><dd><em className="adm-kind">{j.route.label}</em>{j.route.skill && <span className="mono adm-dim">{j.route.skill}</span>}</dd></div>
              <div><dt>把握</dt><dd>{Math.round(j.route.confidence * 100)}%{j.route.guess && j.route.guess !== j.route.verdict ? `（AI 觉得像「${VERDICT_LABEL[j.route.guess]}」，把握不够改走自由生成）` : ''}</dd></div>
              {j.route.subject && <div><dt>内容</dt><dd>{j.route.subject}</dd></div>}
              {j.route.reason && <div><dt>理由</dt><dd>{j.route.reason}</dd></div>}
            </dl>
          ) : <p className="adm-empty">{j.legacy ? '早期任务没有分类记录' : '还没判断'}</p>}
        </Panel>
        {d.pages > 0 && <Panel title={<>上传的原页 <em>{d.pages}</em></>} className="adm-span"><Shots id={id} dir="pages" n={d.pages} /></Panel>}
        {d.photos > 0 && <Panel title={<>产品照片 <em>{d.photos}</em></>} className="adm-span"><Shots id={id} dir="photos" n={d.photos} /></Panel>}
        {j.summary && (
          <Panel title="生成结果">
            <ul className="adm-list">
              {j.summary.guides.map((g) => <li key={g.title}><span><b>{g.title}</b><small>{g.kind}</small></span><time>{g.steps} 步</time></li>)}
            </ul>
            {j.summary.inferred.length > 0 && <p className="adm-note">资料里没写、AI 推断的：{j.summary.inferred.join('；')}</p>}
          </Panel>
        )}
        {(j.problems.length > 0 || j.warnings.length > 0 || !!j.models?.length) && (
          <Panel title="问题与提醒">
            <ul className="adm-list is-comments">
              {j.problems.map((p, i) => <li key={`p${i}`}><span><b className="adm-bad">审计</b><small>{p}</small></span></li>)}
              {j.warnings.map((w, i) => <li key={`w${i}`}><span><b>提醒</b><small>{w}</small></span></li>)}
              {j.models?.map((m) => <li key={m.part}><span><b className={m.ok ? undefined : 'adm-bad'}>外观 · {m.name}</b><small>{m.ok ? `参考图来自${m.source === 'photo' ? '产品照片' : m.source === 'page' ? '说明书页' : '文字描述'}` : m.note ?? '没生成成功'}</small></span></li>)}
            </ul>
          </Panel>
        )}
        <Panel title={<>日志 <em>{j.log.length}</em></>} className="adm-span">
          {j.log.length ? (
            <ol className="adm-log">
              {j.log.map((l, i) => <li key={i} className={`is-${l.level}`}><time>{span(l.t)}</time><span>{l.msg}</span></li>)}
            </ol>
          ) : <p className="adm-empty">{j.legacy ? '早期任务没有留下日志，看下面的中间产物' : '还没有日志'}</p>}
        </Panel>
        <Panel title={<>中间产物 <em>{d.files.length}</em></>} className="adm-span" extra={<small>转写稿、每轮脚本、审计结果、模型原始回复</small>}>
          {d.files.length ? (
            <ul className="adm-files">
              {d.files.map((f) => <li key={f}><a href={fileUrl(f)} target="_blank" rel="noreferrer">{f}</a></li>)}
            </ul>
          ) : <p className="adm-empty">没有中间文件</p>}
        </Panel>
      </div>
    </div>
  )
}

// ---------- 内容 ----------

function ContentTab() {
  const c = useAdmin((s) => s.content)
  const remove = useAdmin((s) => s.remove)
  const titleOf = useTitles()
  if (!c) return <Loading />
  return (
    <div className="adm-grid">
      <Panel title={<>用户发布 <em>{c.posts.length}</em></>} className="adm-span">
        {c.posts.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table is-static">
              <thead><tr><th>标题</th><th>作者</th><th>发布</th><th className="num">评论</th><th className="num">点赞</th><th className="num">收藏</th><th /></tr></thead>
              <tbody>
                {c.posts.map((p) => (
                  <tr key={p.id}>
                    <td><a href={`#/note/${encodeURIComponent(p.id)}`}><em className="adm-kind">{p.kind === 'manual' ? '说明书' : '笔记'}</em>{p.title}</a></td>
                    <td><UserLink id={p.author} name={p.name} /></td>
                    <td>{clock(p.created_at)}</td>
                    <td className="num">{p.comments}</td>
                    <td className="num">{p.likes}</td>
                    <td className="num">{p.saves}</td>
                    <td><button className="adm-del" onClick={() => confirm(`删除《${p.title}》（连同评论）？`) && remove('post', p.id)}>删除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="adm-empty">还没有用户发布内容</p>}
      </Panel>
      <Panel title={<>最新评论 <em>{c.comments.length}</em></>} className="adm-span">
        {c.comments.length ? (
          <ul className="adm-list is-comments">
            {c.comments.map((x) => (
              <li key={x.id}>
                <span><q>{x.text}</q><small><UserLink id={x.author} name={x.name} /> 在 <a href={`#/note/${encodeURIComponent(x.post_id)}`}>《{titleOf(x.post_id)}》</a></small></span>
                <time>{clock(x.created_at)}</time>
                <button className="adm-del" onClick={() => confirm('删除这条评论（连同下面的回复）？') && remove('comment', x.id)}>删除</button>
              </li>
            ))}
          </ul>
        ) : <p className="adm-empty">还没有评论</p>}
      </Panel>
    </div>
  )
}

// ---------- 邀请码 ----------

function inviteState(i: Invite) {
  if (i.disabled) return ['已停用', 'is-off']
  if (i.expires_at && i.expires_at < new Date().toISOString()) return ['已过期', 'is-off']
  if (i.uses >= i.max_uses) return ['已用完', 'is-used']
  return ['可用', 'is-ok']
}

function InvitesTab() {
  const invites = useAdmin((s) => s.invites)
  const fresh = useAdmin((s) => s.fresh)
  const create = useAdmin((s) => s.createInvites)
  const toggle = useAdmin((s) => s.toggleInvite)
  const [count, setCount] = useState(5)
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await create({ count, maxUses, days, note })
    setBusy(false)
  }
  return (
    <div className="adm-grid">
      <Panel title="生成邀请码" className="adm-span">
        <form className="adm-form" onSubmit={submit}>
          <label><span>个数</span><input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
          <label><span>每个可用次数</span><input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} /></label>
          <label><span>有效期</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={0}>不限</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option>
            </select>
          </label>
          <label className="is-wide"><span>备注</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="比如：第一批内测、某某群" maxLength={40} /></label>
          <button className="btn primary" disabled={busy}>{busy ? '生成中…' : '生成'}</button>
        </form>
        {fresh.length > 0 && (
          <div className="adm-fresh">
            <p>新生成的 {fresh.length} 个邀请码，发给对方链接就行（打开直接进注册页、填好邀请码）：</p>
            <ul>
              {fresh.map((c) => (
                <li key={c}><b className="mono">{c}</b><span className="mono">{inviteLink(c)}</span><button className="btn" onClick={() => copy(inviteLink(c))}>复制链接</button></li>
              ))}
            </ul>
            <button className="btn" onClick={() => copy(fresh.map(inviteLink).join('\n'))}>全部复制</button>
          </div>
        )}
      </Panel>
      <Panel title={<>全部邀请码 <em>{invites?.length ?? 0}</em></>} className="adm-span">
        {!invites ? <Loading /> : invites.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table is-static">
              <thead><tr><th>邀请码</th><th>备注</th><th>状态</th><th className="num">已用</th><th>谁用了</th><th>生成</th><th>有效期</th><th /></tr></thead>
              <tbody>
                {invites.map((i) => {
                  const [label, tone] = inviteState(i)
                  return (
                    <tr key={i.code}>
                      <td><button className="adm-code" onClick={() => copy(inviteLink(i.code))} title="复制邀请链接">{i.code}</button></td>
                      <td>{i.note || <span className="adm-dim">—</span>}</td>
                      <td><span className={`adm-state ${tone}`}>{label}</span></td>
                      <td className="num">{i.uses} / {i.max_uses}</td>
                      <td>{i.users.length ? i.users.map((u, k) => <span key={u.id}>{k > 0 && '、'}<UserLink id={u.id} name={u.name} /></span>) : <span className="adm-dim">—</span>}</td>
                      <td>{clock(i.created_at)}</td>
                      <td>{i.expires_at ? clock(i.expires_at) : '不限'}</td>
                      <td><button className="adm-del is-soft" onClick={() => toggle(i.code, !i.disabled)}>{i.disabled ? '启用' : '停用'}</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="adm-empty">还没有邀请码，在上面生成一批</p>}
      </Panel>
    </div>
  )
}

// ---------- 页面 ----------

export function AdminPage({ tab, user, job }: { tab: AdminTab; user?: string; job?: string }) {
  const me = useCommunity((s) => s.me)
  const connected = useAdmin((s) => s.connected)
  const error = useAdmin((s) => s.error)
  const online = useAdmin((s) => s.overview?.stats.online)
  const total = useAdmin((s) => s.overview?.stats.users)
  const importing = useAdmin((s) => s.overview?.stats.importing)

  useEffect(() => connectLive(), [])
  useEffect(() => {
    useAdmin.getState().refresh('overview')
  }, [])
  useEffect(() => {
    if (tab !== 'overview') useAdmin.getState().refresh(tab)
  }, [tab])
  useEffect(() => {
    document.title = '管理后台 · 懂了 Dongle'
    return () => {
      document.title = '懂了 Dongle · 3D 说明书社区'
    }
  }, [])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => useAdmin.getState().say(''), 3200)
    return () => clearTimeout(t)
  }, [error])

  return (
    <div className="adm">
      <header className="adm-top">
        <a className="adm-brand" href="#/" title="回到社区">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} width="30" height="30" alt="" />
          <b>懂了<em>管理后台</em></b>
        </a>
        <nav className="adm-tabs seg" aria-label="后台分区">
          {TABS.map(([id, label]) => (
            <a key={id} href={`#/admin/${id}`} className={tab === id ? 'is-on' : ''} aria-current={tab === id ? 'page' : undefined}>
              {label}{id === 'users' && total !== undefined && <small>{total}</small>}
              {id === 'imports' && !!importing && <small className="is-busy" title="正在生成">{importing}</small>}
            </a>
          ))}
        </nav>
        <span className={`adm-live ${connected ? 'is-on' : ''}`} title={connected ? '新的动态会实时推过来' : '正在连接实时推送'}>
          <i />{connected ? `实时 · ${online ?? 0} 人在线` : '连接中…'}
        </span>
        <a className="btn adm-exit" href="#/">返回社区</a>
        <Avatar user={me} size={32} />
      </header>
      <main className="adm-main">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && (user ? <UserView id={user} /> : <UsersTab />)}
        {tab === 'imports' && (job ? <ImportView id={job} /> : <ImportsTab />)}
        {tab === 'trends' && <TrendsTab />}
        {tab === 'content' && <ContentTab />}
        {tab === 'invites' && <InvitesTab />}
      </main>
      {error && <div className="toast" role="status">{error}</div>}
    </div>
  )
}
