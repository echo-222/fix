import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { openImported } from '../../ai/manualImport'
import { noteIdOf } from '../../community/seed'
import { navigate } from '../../router'
import {
  TREND_CHANNELS, useAdmin,
  type ChannelHeat, type TrendAction, type TrendBrand, type TrendChannel, type TrendChannelRun, type TrendItem, type TrendScan, type TrendSettings, type TrendSignal, type TrendStatus,
} from './data'
import { ago, clock } from './format'

/**
 * 后台「热度」（#/admin/trends）：分渠道（电商·新闻 / 小红书 / B 站）联网扫描市场热度 → 够线的自动找官方说明书生成 → 审计零问题、截图复核通过就发到广场。
 * 从上到下：这期各渠道的风向和调度状态、品牌榜（可导出 CSV）、上榜的产品（热度走势、适合度、渠道和来源、状态和操作）、设置、扫描记录。
 */

const STATUS: Record<TrendStatus, [string, string]> = {
  new: ['新发现', ''],
  existing: ['库里已有', 'is-ok'],
  queued: ['排队中', 'is-run'],
  sourcing: ['找说明书', 'is-run'],
  generating: ['生成中', 'is-run'],
  published: ['已上架', 'is-ok'],
  held: ['待确认', 'is-used'],
  failed: ['没成功', 'is-off'],
  ignored: ['已忽略', ''],
}

type Filter = 'all' | 'todo' | 'busy' | 'live' | 'ignored'
const FILTERS: [Filter, string, (i: TrendItem) => boolean][] = [
  ['all', '全部', (i) => i.status !== 'ignored'],
  ['todo', '待处理', (i) => i.status === 'new' || i.status === 'held' || i.status === 'failed'],
  ['busy', '生成中', (i) => i.status === 'queued' || i.status === 'sourcing' || i.status === 'generating'],
  ['live', '在广场上', (i) => i.status === 'published' || i.status === 'existing'],
  ['ignored', '已忽略', (i) => i.status === 'ignored'],
]

const later = (ms: number) => (ms <= 60_000 ? '马上' : ms < 3600_000 ? `${Math.round(ms / 60_000)} 分钟后` : `${(ms / 3600_000).toFixed(ms < 36_000_000 ? 1 : 0)} 小时后`)
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
const kTok = (n = 0) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
/** 和服务端 trends.ts 的 norm 一样：名字归一后比 */
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-_·•.,，。、:：;；()（）【】[\]「」『』'"‘’“”/\\+|!！?？]+/g, '')
const CHANNEL_IDS = Object.keys(TREND_CHANNELS) as TrendChannel[]

/** 渠道标签；给了热度就带上 */
function Ch({ id, heat }: { id: TrendChannel; heat?: number }) {
  return <span className={`adm-ch is-${id}`} title={heat === undefined ? undefined : `${TREND_CHANNELS[id]}热度 ${heat}`}>{TREND_CHANNELS[id]}{heat !== undefined && <b>{heat}</b>}</span>
}

function Channels({ list, heat }: { list: TrendChannel[]; heat: ChannelHeat }) {
  return list.length ? <span className="adm-chs">{list.map((c) => <Ch key={c} id={c} heat={heat[c]} />)}</span> : null
}

function Signals({ list, max }: { list: TrendSignal[]; max: number }) {
  return (
    <>
      {list.slice(0, max).map((g) => (
        <a key={g.url} href={g.url} target="_blank" rel="noreferrer" title={g.title}>{g.ch && list.some((x) => x.ch !== g.ch) && <i className={`adm-ch-dot is-${g.ch}`} />}{g.title || host(g.url)}</a>
      ))}
    </>
  )
}

/** 品牌榜导出成 CSV（带 BOM，Excel 直接打开不乱码） */
function exportBrands(list: TrendBrand[]) {
  const head = ['排名', '品牌', '热度', '渠道', '品类', '为什么火', '眼下爆款', '我们榜上的产品', '官网', '别名', '来源']
  const rows = list.map((b, i) => [
    i + 1, b.name, b.live, b.channels.map((c) => `${TREND_CHANNELS[c]} ${b.channelHeat[c] ?? ''}`.trim()).join(' / '), b.categories.join('、'), b.why,
    b.products.join('、'), b.items.map((x) => x.name).join('、'), b.officialSite, b.aliases.join('、'), b.signals.map((g) => g.url).join(' '),
  ])
  const csv = '\ufeff' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `懂了品牌榜-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Panel({ title, extra, className = '', id, children }: { title: ReactNode; extra?: ReactNode; className?: string; id?: string; children: ReactNode }) {
  return (
    <section className={`adm-panel ${className}`} id={id}>
      <header><h3>{title}</h3>{extra}</header>
      {children}
    </section>
  )
}

/** 最近几次扫描的热度走势 */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 54
  const h = 18
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 1 - (v / 100) * (h - 2)).toFixed(1)}`).join(' ')
  return (
    <svg className="adm-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`走势：${values.join(' → ')}`}>
      <polyline points={pts} />
    </svg>
  )
}

function Meter({ value, line }: { value: number; line: number }) {
  return (
    <span className={`adm-meter ${value >= line ? 'is-over' : ''}`} title={`门槛 ${line}`}>
      <i style={{ width: `${value}%` }} />
      <b>{value}</b>
    </span>
  )
}

function Actions({ it, act }: { it: TrendItem; act: (a: TrendAction) => void }) {
  const id = it.product?.replace(/^manual:/, '')
  const b = (label: string, a: TrendAction, cls = 'adm-del is-soft') => <button className={cls} onClick={() => act(a)}>{label}</button>
  const open = it.post && it.postLive
    ? <a className="adm-del is-soft" href={`#/note/${encodeURIComponent(it.post)}`}>打开</a>
    : it.matched && it.product ? <a className="adm-del is-soft" href={`#/note/${encodeURIComponent(noteIdOf(it.product))}`}>打开</a>
    : id && it.status === 'held' ? <button className="adm-del is-soft" onClick={() => openImported(id)}>看 3D</button> : null
  const job = it.job && <button className="adm-del is-soft" onClick={() => navigate({ name: 'admin', tab: 'imports', job: it.job! })}>{it.status === 'generating' ? '看进度' : '看生成'}</button>
  switch (it.status) {
    case 'new':
    case 'failed':
      return <>{b(it.status === 'failed' ? '重新生成' : '生成', 'produce', 'adm-del is-go')}{job}{b('忽略', 'ignore')}</>
    case 'existing':
      return <>{open}{b('忽略', 'ignore')}</>
    case 'queued':
      return <>{b('忽略', 'ignore')}</>
    case 'sourcing':
    case 'generating':
      return <>{job}{b('取消', 'cancel', 'adm-del')}</>
    case 'held':
      return <>{b('上架', 'publish', 'adm-del is-go')}{open}{job}{b('重新生成', 'produce')}{b('忽略', 'ignore')}</>
    case 'published':
      return <>{open}{job}{b('下架', 'unpublish', 'adm-del')}</>
    case 'ignored':
      return <>{b('恢复', 'restore')}</>
  }
}

function SettingsForm({ s, tripo }: { s: TrendSettings; tripo: boolean }) {
  const trend = useAdmin((x) => x.trend)
  const [f, setF] = useState(s)
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(s), [s])
  const set = <K extends keyof TrendSettings>(k: K, v: TrendSettings[K]) => setF((x) => ({ ...x, [k]: v }))
  const dirty = JSON.stringify(f) !== JSON.stringify(s)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    if (await trend('settings', f)) useAdmin.getState().say('设置已保存')
    setBusy(false)
  }
  const num = (k: 'minHeat' | 'minDemo' | 'dailyLimit' | 'count' | 'brandCount', min: number, max: number) => (
    <input type="number" min={min} max={max} value={f[k]} onChange={(e) => set(k, Number(e.target.value))} />
  )
  const BRIEF: Record<TrendChannel, string> = { market: '电商榜、众筹、发布会、媒体', xhs: '合作笔记、种草爆文、投放榜', bili: '恰饭视频、分区排行、热搜' }
  const toggle = (c: TrendChannel, on: boolean) => set('channels', CHANNEL_IDS.filter((x) => (x === c ? on : f.channels.includes(x))))
  return (
    <form className="adm-form adm-trend-form" onSubmit={submit}>
      <div className="adm-trend-chpick is-wide">
        <span>信号来源<small>每个来源单独联网搜一遍（并行），各花一份搜索费用</small></span>
        {CHANNEL_IDS.map((c) => {
          const on = f.channels.includes(c)
          const last = on && f.channels.length === 1
          return (
            <label key={c} className={`adm-check ${last ? 'is-off' : ''}`} title={last ? '至少留一个' : undefined}>
              <input type="checkbox" checked={on} disabled={last} onChange={(e) => toggle(c, e.target.checked)} />
              <span><Ch id={c} /><small>{BRIEF[c]}</small></span>
            </label>
          )
        })}
      </div>
      <label className="adm-check"><input type="checkbox" checked={f.auto} onChange={(e) => set('auto', e.target.checked)} /><span>自动监控<small>定时扫描，够线的自动生成</small></span></label>
      <label><span>扫描间隔</span>
        <select value={f.intervalHours} onChange={(e) => set('intervalHours', Number(e.target.value))}>
          {[3, 6, 12, 24, 48, 72].map((h) => <option key={h} value={h}>每 {h} 小时</option>)}
        </select>
      </label>
      <label><span>每天最多自动生成</span>{num('dailyLimit', 0, 50)}</label>
      <label><span>热度门槛</span>{num('minHeat', 0, 100)}</label>
      <label><span>适合度门槛</span>{num('minDemo', 0, 100)}</label>
      <label><span>每个来源找几款</span>{num('count', 3, 30)}</label>
      <label><span>品牌榜每个来源几个</span>{num('brandCount', 5, 30)}</label>
      <label className="adm-check"><input type="checkbox" checked={f.autoPublish} onChange={(e) => set('autoPublish', e.target.checked)} /><span>复核通过自动上架<small>审计零问题 + 截图复核通过</small></span></label>
      <label className={`adm-check ${tripo ? '' : 'is-off'}`} title={tripo ? undefined : '服务器没配 TRIPO_API_KEY'}>
        <input type="checkbox" checked={f.appearance && tripo} disabled={!tripo} onChange={(e) => set('appearance', e.target.checked)} />
        <span>写实外观<small>{tripo ? '用 Tripo 生成外观模型（耗积分）' : '没配 TRIPO_API_KEY，只出线稿'}</small></span>
      </label>
      <label><span>地区</span><input value={f.region} onChange={(e) => set('region', e.target.value)} maxLength={30} /></label>
      <label className="is-wide"><span>关注方向</span><input value={f.focus} onChange={(e) => set('focus', e.target.value)} maxLength={400} /></label>
      <button className="btn primary" disabled={busy || !dirty}>{busy ? '保存中…' : '保存设置'}</button>
    </form>
  )
}

function ScanLine({ s }: { s: TrendScan }) {
  const d = s.data
  if (s.status === 'running') return <span className="adm-dim">扫描中，已经 {Math.round((Date.now() - Date.parse(s.at)) / 1000)} 秒（联网搜索一般要一两分钟）</span>
  if (s.status === 'error') return <span className="adm-bad">{s.error}</span>
  const bad = d.channels?.filter((c) => !c.ok) ?? []
  return (
    <span>
      {d.channels && d.channels.length > 1 && `${d.channels.length - bad.length} 个来源 · `}
      {s.found} 款上榜{d.fresh ? ` · ${d.fresh} 款新面孔` : ''}{d.brands ? ` · 品牌 ${d.brands} 个` : ''}{s.queued ? ` · ${s.queued} 款排进生成` : ''}
      {d.seconds !== undefined && ` · 用时 ${d.seconds} 秒`}{d.usage && ` · 入 ${kTok(d.usage.input)} 出 ${kTok(d.usage.output)}`}
      {d.citations?.length ? ` · 引用 ${d.citations.length} 个网页` : ''}
      {bad.length > 0 && <span className="adm-bad">{` · ${bad.map((c) => TREND_CHANNELS[c.id]).join('、')}没扫成`}</span>}
    </span>
  )
}

/** 这期每个来源的风向 */
function ChannelNews({ runs }: { runs: TrendChannelRun[] }) {
  return (
    <div className="adm-trend-chans">
      {runs.map((c) => (
        <div key={c.id} className={`adm-trend-chan ${c.ok ? '' : 'is-bad'}`}>
          <Ch id={c.id} />
          <div>
            <p>{c.ok ? c.summary || '（这个来源没给总结）' : `没扫成：${c.error}`}</p>
            {c.ok && (
              <small>
                {c.items} 款 · {c.brands} 个品牌{c.bili && ` · 接口取到 ${c.bili.videos} 条视频、${c.bili.hot} 个热搜`} · {c.seconds} 秒{c.usage && ` · 入 ${kTok(c.usage.input)} 出 ${kTok(c.usage.output)}`}
                {c.warn && <span className="adm-bad"> · {c.warn}</span>}
              </small>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 品牌榜：按衰减后的热度排；点品牌名展开来源，点「看产品」把下面的上榜产品筛成这个品牌 */
function BrandPanel({ list, onPick }: { list: TrendBrand[]; onPick: (b: TrendBrand) => void }) {
  const trend = useAdmin((s) => s.trend)
  const [open, setOpen] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const active = list.filter((b) => b.status === 'active')
  const ignored = list.length - active.length
  const shown = showIgnored ? list : active
  return (
    <Panel
      title={<>品牌榜 <em>{active.length}</em></>}
      className="adm-span"
      extra={
        <div className="adm-chips">
          {ignored > 0 && <button className={`chip ${showIgnored ? 'is-on' : ''}`} onClick={() => setShowIgnored(!showIgnored)}>已忽略<small>{ignored}</small></button>}
          <button className="btn" disabled={!active.length} onClick={() => exportBrands(active)}>导出 CSV</button>
        </div>
      }
    >
      {shown.length ? (
        <div className="adm-table-wrap">
          <table className="adm-table is-static adm-trend-table adm-brand-table">
            <thead><tr><th className="num">#</th><th>品牌</th><th>热度</th><th>来源</th><th>为什么火</th><th>眼下爆款</th><th /></tr></thead>
            <tbody>
              {shown.map((b, i) => {
                const more = open === b.key
                const listed = new Set(b.items.map((x) => norm(x.name)))
                const others = b.products.filter((p) => !listed.has(norm(p)))
                return (
                  <tr key={b.key} className={`${more ? 'is-open' : ''} ${b.status === 'ignored' ? 'is-dim' : ''}`}>
                    <td className="num">{b.status === 'ignored' ? '—' : i + 1}</td>
                    <td>
                      <button className="adm-trend-name" onClick={() => setOpen(more ? null : b.key)} title="展开看来源">
                        <b>{b.name}</b>
                        <small>{[b.categories.join('、'), b.aliases.length ? `也叫 ${b.aliases.slice(0, 3).join('、')}` : ''].filter(Boolean).join(' · ')}</small>
                      </button>
                    </td>
                    <td>
                      <span className="adm-heat">
                        <b>{b.live}</b>
                        {b.delta !== null && b.delta !== 0 && <em className={b.delta > 0 ? 'is-up' : 'is-down'}>{b.delta > 0 ? '▲' : '▼'}{Math.abs(b.delta)}</em>}
                        <Spark values={b.history} />
                      </span>
                    </td>
                    <td><Channels list={b.channels} heat={b.channelHeat} /></td>
                    <td>
                      {more ? (
                        <div className="adm-trend-why">
                          <p>{b.why || '—'}</p>
                          <span className="adm-trend-src"><Signals list={b.signals} max={6} /></span>
                          <p><b>时间</b>{clock(b.firstSeen)} 第一次上榜 · 最近一次 {ago(b.lastSeen)}{b.officialSite ? ` · 官网 ${b.officialSite}` : ''}</p>
                        </div>
                      ) : <small className="adm-trend-line">{b.why}</small>}
                    </td>
                    <td>
                      <span className="adm-trend-prods">
                        {b.items.slice(0, more ? 8 : 3).map((x) => <button key={x.key} className="is-ours" title={`在上榜产品里 · 热度 ${x.live}`} onClick={() => onPick(b)}>{x.name}</button>)}
                        {others.slice(0, more ? 6 : Math.max(0, 3 - b.items.length)).map((p) => <span key={p}>{p}</span>)}
                      </span>
                    </td>
                    <td>
                      <span className="adm-trend-act">
                        {b.items.length > 0 && <button className="adm-del is-soft" onClick={() => onPick(b)}>看产品</button>}
                        <button className="adm-del is-soft" onClick={() => trend(`brands/${encodeURIComponent(b.key)}`, { action: b.status === 'ignored' ? 'restore' : 'ignore' })}>{b.status === 'ignored' ? '恢复' : '忽略'}</button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="adm-empty">{list.length ? '都忽略了' : '还没有品牌榜：扫描一次就有'}</p>}
    </Panel>
  )
}

export function TrendsTab() {
  const t = useAdmin((s) => s.trends)
  const trend = useAdmin((s) => s.trend)
  const [f, setF] = useState<Filter>('all')
  const [ch, setCh] = useState<TrendChannel | ''>('')
  const [brand, setBrand] = useState<TrendBrand | null>(null)
  const [probing, setProbing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const busy = !!t && (!!t.state.scanning || t.items.some((i) => i.status === 'queued' || i.status === 'sourcing' || i.status === 'generating') || t.scans[0]?.status === 'running')
  // 扫描、生成中勤刷新；其余靠实时推送里的 trend* / import* 动态
  useEffect(() => {
    const k = setInterval(() => useAdmin.getState().refresh('trends'), busy ? 3000 : 30_000)
    return () => clearInterval(k)
  }, [busy])
  if (!t) return <p className="adm-empty">加载中…</p>
  const { state: st, settings: s } = t
  const last = st.lastScan
  const lastDone = t.scans.find((x) => x.status === 'done')
  const scanning = !!st.scanning || last?.status === 'running'
  const probe = st.search.probe
  const act = (it: TrendItem, a: TrendAction) => {
    if (a === 'unpublish' && !confirm(`把《${it.name}》从广场下架？（说明书留着，可以再上架）`)) return
    if (a === 'cancel' && !confirm(`取消《${it.name}》的生成？`)) return
    trend(`items/${encodeURIComponent(it.key)}`, { action: a })
  }
  const test = FILTERS.find(([id]) => id === f)![2]
  const brandNames = brand && new Set([brand.name, ...brand.aliases].map(norm))
  const scoped = t.items.filter((i) => (!ch || i.channels.includes(ch)) && (!brandNames || brandNames.has(norm(i.brand))))
  const list = scoped.filter(test)
  const rank = new Map(t.items.filter((i) => i.status !== 'ignored').map((i, k) => [i.key, k + 1]))
  const pick = (b: TrendBrand) => {
    setBrand(b)
    setF('all')
    document.getElementById('adm-trend-items')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="adm-grid adm-trends">
      {!st.ready && (
        <div className="adm-banner adm-span" role="status">
          <b>热榜还不能用</b>
          <p>服务器没配置 AI_API_KEY，或者不是开发服务器 / 线上服务器（vite preview 上不能扫描和生成）。</p>
        </div>
      )}
      <Panel
        title="市场风向"
        className="adm-span adm-trend-head"
        extra={
          <div className="adm-trend-btns">
            <button className="btn" disabled={probing} onClick={async () => {
              setProbing(true)
              await trend('probe')
              setProbing(false)
            }}>{probing ? '检测中…' : '检测联网'}</button>
            <button className="btn primary" disabled={scanning || !st.ready} onClick={() => trend('scan')}>{scanning ? '扫描中…' : '立即扫描'}</button>
          </div>
        }
      >
        {lastDone?.data.channels?.length
          ? <ChannelNews runs={lastDone.data.channels} />
          : <p className="adm-trend-summary">{lastDone?.summary || (scanning ? '正在联网搜索这期的热门产品……' : '还没扫描过。点「立即扫描」看看现在市场上什么最火。')}</p>}
        {lastDone?.data.warn && !lastDone.data.channels && <p className="adm-bad">{lastDone.data.warn}</p>}
        <ul className="adm-trend-meta">
          <li><b>上次扫描</b>{last ? <>{ago(last.at)}（{last.trigger === 'auto' ? '自动' : '手动'}）· <ScanLine s={last} /></> : '—'}</li>
          <li><b>信号来源</b><span className="adm-chs">{s.channels.map((c) => <Ch key={c} id={c} />)}</span></li>
          <li><b>自动监控</b>{s.auto ? <>开 · 每 {s.intervalHours} 小时 · 下次 {st.nextScanAt ? later(st.nextScanAt - Date.now()) : '—'}</> : <span className="adm-dim">关（只能手动扫描、手动点生成）</span>}</li>
          <li><b>今天</b>自动生成 {st.usedToday.started} / {s.dailyLimit} 份 · 找说明书 {st.usedToday.tried} 次 · 热度 ≥ {s.minHeat}、适合度 ≥ {s.minDemo} 才自动生成 · {s.autoPublish ? '复核通过自动上架' : '生成好都等你确认'}</li>
          <li><b>联网搜索</b><span className="mono">{st.search.model ?? '—'}</span>{st.search.label ? ` · ${st.search.label}` : ' · 还没试通过'}
            {probe && (probe.ok
              ? <span className={probe.searched === false ? 'adm-bad' : 'adm-good'}> · {clock(probe.at)} 检测{probe.searched === false ? '：模型没调用搜索' : '通过'}{probe.sample.headline && <>：<a href={probe.sample.url} target="_blank" rel="noreferrer">{probe.sample.headline}</a></>}</span>
              : <span className="adm-bad"> · {clock(probe.at)} 检测失败：{probe.error}</span>)}
          </li>
          <li><b>调度</b>{st.worker ? <>进程 {st.worker.pid}{st.worker.self ? '（就是这台服务）' : '（另一个服务进程）'}</> : <span className="adm-dim">还没有进程在调度（开发服务器、线上服务器起来后自动接上）</span>}</li>
        </ul>
      </Panel>

      <BrandPanel list={t.brands} onPick={pick} />

      <Panel title={<>上榜产品 <em>{t.items.filter((i) => i.status !== 'ignored').length}</em></>} className="adm-span" id="adm-trend-items"
        extra={
          <div className="adm-chips">
            {brand && <button className="chip is-on" onClick={() => setBrand(null)} title="取消品牌筛选">品牌：{brand.name} ×</button>}
            <select className="adm-trend-chsel" value={ch} onChange={(e) => setCh(e.target.value as TrendChannel | '')} aria-label="按来源筛">
              <option value="">全部来源</option>
              {CHANNEL_IDS.map((c) => <option key={c} value={c}>{TREND_CHANNELS[c]}</option>)}
            </select>
            {FILTERS.map(([id, label, fn]) => <button key={id} className={`chip ${f === id ? 'is-on' : ''}`} onClick={() => setF(id)}>{label}<small>{scoped.filter(fn).length}</small></button>)}
          </div>
        }>
        {list.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table is-static adm-trend-table">
              <thead><tr><th className="num">#</th><th>产品</th><th>热度</th><th>适合做演示</th><th>来源</th><th>状态</th><th /></tr></thead>
              <tbody>
                {list.map((it) => {
                  const [label, tone] = STATUS[it.status]
                  const more = open === it.key
                  return (
                    <tr key={it.key} className={more ? 'is-open' : undefined}>
                      <td className="num">{rank.get(it.key) ?? '—'}</td>
                      <td>
                        <button className="adm-trend-name" onClick={() => setOpen(more ? null : it.key)} title="展开看理由">
                          <b>{it.name}</b>
                          <small>{[it.brand, it.model, it.category].filter(Boolean).join(' · ')}</small>
                        </button>
                        {more ? (
                          <div className="adm-trend-why">
                            <p><b>为什么热</b>{it.heatWhy || '—'}</p>
                            <p><b>演示什么</b>{it.demoWhy || '—'}</p>
                            <p><b>时间</b>{clock(it.firstSeen)} 第一次上榜 · 最近一次 {ago(it.lastSeen)}{it.startedAt ? ` · ${clock(it.startedAt)} 开始生成` : ''}</p>
                          </div>
                        ) : it.heatWhy && <small className="adm-trend-line">{it.heatWhy}</small>}
                      </td>
                      <td>
                        <span className="adm-heat">
                          <b>{it.live}</b>
                          {it.delta !== null && it.delta !== 0 && <em className={it.delta > 0 ? 'is-up' : 'is-down'}>{it.delta > 0 ? '▲' : '▼'}{Math.abs(it.delta)}</em>}
                          <Spark values={it.history} />
                        </span>
                      </td>
                      <td title={it.demoWhy}><Meter value={it.demo} line={s.minDemo} /></td>
                      <td>
                        <span className="adm-trend-src">
                          <Channels list={it.channels} heat={it.channelHeat} />
                          <Signals list={it.signals} max={more ? 6 : 1} />
                          {!more && it.signals.length > 1 && <small>另 {it.signals.length - 1} 条</small>}
                          {it.source && <small>说明书：<a href={it.source.url} target="_blank" rel="noreferrer">{host(it.source.url)}</a> · {it.source.kind.toUpperCase()} {it.source.pages} 页{it.source.total > it.source.pages ? `（共 ${it.source.total}）` : ''}</small>}
                          {!it.source && more && it.officialSite && <small>官网 {it.officialSite}</small>}
                        </span>
                      </td>
                      <td>
                        <span className="adm-tags"><span className={`adm-state ${tone}`}>{label}</span>{it.auto && it.status !== 'existing' && <em title="自动排进生成的，算每日额度">自动</em>}</span>
                        {it.note && <small className="adm-trend-note">{it.note}</small>}
                      </td>
                      <td><span className="adm-trend-act"><Actions it={it} act={(a) => act(it, a)} /></span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="adm-empty">{t.items.length ? '没有符合条件的' : '还没有上榜的产品'}</p>}
      </Panel>

      <Panel title="设置" className="adm-span">
        <SettingsForm s={s} tripo={st.tripo} />
      </Panel>

      <Panel title={<>扫描记录 <em>{t.scans.length}</em></>} className="adm-span">
        {t.scans.length ? (
          <ul className="adm-list">
            {t.scans.map((x) => (
              <li key={x.id}>
                <span>
                  <b>{x.trigger === 'auto' ? '自动' : '手动'} · {x.status === 'running' ? '扫描中' : x.status === 'done' ? '完成' : '失败'}{x.mode ? <small className="mono"> {x.mode}</small> : null}</b>
                  <small><ScanLine s={x} />{x.summary && x.status === 'done' ? ` —— ${x.summary}` : ''}</small>
                </span>
                <time>{clock(x.at)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="adm-empty">还没有扫描记录</p>}
      </Panel>
    </div>
  )
}
