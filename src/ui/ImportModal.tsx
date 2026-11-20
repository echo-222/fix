import { useEffect, useRef, useState } from 'react'
import {
  IMPORT_FIELDS, VALUE_LABELS, analyzeManual, compressImage, demoResult, getAiStatus, type AiStatus, type ImportResult,
} from '../ai/manual'
import {
  JOB_KEY, VERDICT_LABEL, cancelManualJob, deleteImportedManual, dismissJob, getManualJob, jobImageUrl, jobStages, openImported, parseRange, pdfPageCount,
  pdfToPages, startManualJob, type ManualJob,
} from '../ai/manualImport'
import { noteIdOf } from '../community/seed'
import { openNote } from '../router'
import { useApp } from '../store'
import { PostForm } from './community/PostForm'
import { IconCamera, IconCheck, IconClose, IconSpark, IconUpload } from './icons'

/**
 * 导入资料。主流程：照片 / PDF → 开发服务器上的流水线：先分流（说明书 / 折纸 / 立体书 / 物理原理 / 机械结构 / 其他），
 * 再按对应的 skill 生成 3D 交互演示，存进「我导入的说明书」。识别成铝型材桌时，可以转到原来的参数化流程（能改尺寸）。
 */
type Phase = 'pick' | 'preparing' | 'running' | 'finished' | 'analyzing' | 'result' | 'error'

const DESK_STAGES = ['读取图片', '识别文字与图示', '提取零件表', '推断结构与尺寸', '生成 3D 安装步骤']
const MAX_PAGES = 40
const DESK_MAX = 8
const MAX_PHOTOS = 4

interface Pdf {
  file: File
  total: number
  range: string
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '有' : '无'
  return VALUE_LABELS[String(v)] ?? String(v)
}

const SOURCE_LABEL = { photo: '按产品照片', page: '按说明书里的图', text: '按文字描述' } as const

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const kTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n))

export function ImportModal() {
  const toggle = useApp((s) => s.toggle)
  const applyImported = useApp((s) => s.applyImported)
  const setPanel = useApp((s) => s.setPanel)
  const resumeId = useRef(sessionStorage.getItem(JOB_KEY))
  const [phase, setPhase] = useState<Phase>(resumeId.current ? 'running' : 'pick')
  const [images, setImages] = useState<string[]>([])
  const [pdf, setPdf] = useState<Pdf | null>(null)
  const [hint, setHint] = useState('')
  const [showPages, setShowPages] = useState(true)
  const [review, setReview] = useState(true)
  const [appearance, setAppearance] = useState(true)
  const [photos, setPhotos] = useState<string[]>([])
  const [prep, setPrep] = useState({ done: 0, total: 0 })
  const [prepared, setPrepared] = useState<string[]>([])
  const [jobId, setJobId] = useState<string | null>(resumeId.current)
  const [job, setJob] = useState<ManualJob | null>(null)
  const furthest = useRef(0)
  const [stage, setStage] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<AiStatus | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAiStatus().then(setStatus)
  }, [])

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    const pics = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).map((f) => compressImage(f, 2048)))
    setPhotos((prev) => [...prev, ...pics].slice(0, MAX_PHOTOS))
  }

  // 任务在服务器上跑，弹窗只是轮询；关掉再打开（同一标签页）会接着显示
  useEffect(() => {
    if (!jobId) return
    let stop = false
    let timer = 0
    const tick = async () => {
      try {
        const j = await getManualJob(jobId)
        if (stop) return
        setJob(j)
        if (j.status === 'running') {
          timer = window.setTimeout(tick, 1500)
          return
        }
        // 结果看过了，「我的 · 导入」里不再列这个任务；生成好的说明书等它作为草稿载入后自然就不列了
        if (j.status !== 'done' || j.kind !== 'scene') dismissJob(j.id)
        if (j.status === 'done') return setPhase('finished')
        sessionStorage.removeItem(JOB_KEY)
        setError(j.status === 'cancelled' ? (j.manualId ? '已取消。取消前已经保存了一版（还没做截图复核），可以直接打开。' : '已取消。') : j.error || '生成失败')
        setPhase('error')
      } catch (e) {
        if (stop) return
        sessionStorage.removeItem(JOB_KEY)
        dismissJob(jobId)
        setError(`查不到这个任务（开发服务器重启过？）：${e instanceof Error ? e.message : e}`)
        setPhase('error')
      }
    }
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [jobId])

  const pdfPages = pdf ? parseRange(pdf.range, pdf.total) : []
  const pageCount = pdfPages.length + images.length

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const list = [...files]
    const doc = list.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (doc) {
      try {
        const total = await pdfPageCount(doc)
        setPdf({ file: doc, total, range: `1-${Math.min(total, 20)}` })
      } catch (e) {
        setError(`PDF 打不开：${e instanceof Error ? e.message : e}`)
        setPhase('error')
        return
      }
    }
    const pics = await Promise.all(list.filter((f) => f.type.startsWith('image/')).map((f) => compressImage(f)))
    setImages((prev) => [...prev, ...pics].slice(0, MAX_PAGES))
  }

  /** PDF 选中的页渲染成图（带文字层，大幅面页切块），照片排在后面 */
  const collect = async (limit = MAX_PAGES, strict = true) => {
    const want = pdfPages.slice(0, limit)
    setPrep({ done: 0, total: want.length })
    const r = pdf && want.length
      ? await pdfToPages(pdf.file, want, (done) => setPrep({ done, total: want.length }))
      : { pages: [], texts: [], numbers: [], notes: [] }
    if (strict && r.pages.length > limit) throw new Error(`大幅面页切块后共 ${r.pages.length} 张图，超过一次 ${limit} 张的上限：少选几页再试。`)
    const extra = images.slice(0, Math.max(0, limit - r.pages.length))
    return {
      pages: [...r.pages, ...extra],
      texts: [...r.texts, ...extra.map(() => '')],
      pageNumbers: pdf && !extra.length ? r.numbers : undefined,
      pageNotes: r.notes.some(Boolean) ? [...r.notes, ...extra.map(() => '')] : undefined,
    }
  }

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e))
    setPhase('error')
  }

  const start = async () => {
    setPhase('preparing')
    try {
      const input = await collect()
      setPrepared(input.pages)
      const tripo = appearance && !!status?.tripo
      const id = await startManualJob({ ...input, hint: hint.trim() || undefined, showPages, review, appearance: tripo, photos: tripo && photos.length ? photos : undefined, fileName: pdf?.file.name })
      sessionStorage.setItem(JOB_KEY, id)
      furthest.current = 0
      setJob(null)
      setJobId(id)
      setPhase('running')
    } catch (e) {
      fail(e)
    }
  }

  /** 原来的铝型材桌参数化流程（最多 8 页） */
  const runDesk = async (demo: boolean, pages?: string[]) => {
    try {
      let list = pages ?? []
      if (!demo && !pages) {
        setPhase('preparing')
        list = (await collect(DESK_MAX, false)).pages
      }
      setPhase('analyzing')
      setStage(0)
      const timer = setInterval(() => setStage((s) => Math.min(DESK_STAGES.length - 1, s + 1)), demo ? 550 : 1600)
      try {
        const minDelay = new Promise((r) => setTimeout(r, demo ? 2800 : 1200))
        const r = demo || !status?.configured
          ? demoResult(demo ? undefined : '未配置 AI 服务（.env.local 中的 AI_API_KEY），以下是示例解析结果，用来演示流程。')
          : await analyzeManual(list.slice(0, DESK_MAX), hint || undefined)
        await minDelay
        setResult(r)
        setPhase('result')
      } finally {
        clearInterval(timer)
      }
    } catch (e) {
      fail(e)
    }
  }

  const apply = (thenDesign: boolean) => {
    if (!result) return
    applyImported(result.config, {
      kind: result.mode,
      title: result.config.name,
      notes: result.spec.warnings,
      manualSteps: result.spec.steps.length ? result.spec.steps : undefined,
    })
    openNote(noteIdOf('desk'))
    if (thenDesign) setPanel('design')
  }

  const reset = () => {
    sessionStorage.removeItem(JOB_KEY)
    setJobId(null)
    setJob(null)
    setError('')
    setPhase('pick')
  }

  const remove = async () => {
    if (!job?.manualId || !confirm(`删除「${job.name ?? job.manualId}」？`)) return
    try {
      await deleteImportedManual(job.manualId)
      dismissJob(job.id)
      sessionStorage.removeItem(JOB_KEY)
      location.reload()
    } catch (e) {
      fail(e)
    }
  }

  const openResult = (note?: string) => {
    if (job?.manualId) openImported(job.manualId, note)
  }

  const stages = jobStages(job)
  const at = job ? stages.findIndex(([s]) => s === job.stage) : 0
  // 复核后会回到「审计 / 修正」：进度条不往回退
  if (at > furthest.current) furthest.current = at
  const current = job?.status === 'done' ? stages.length : furthest.current
  const elapsed = job ? (job.status === 'running' ? Date.now() - job.created : job.log.at(-1)?.t ?? 0) : 0
  // 从「我的 · 导入」点进来接着看的任务，浏览器里没有页面图：用服务器存下的第一页
  const preview = prepared[0] ?? images[0] ?? (jobId && job?.input?.pages ? jobImageUrl(jobId) : undefined)

  const supported = result?.spec.category === 'aluminum_desk' || result?.spec.category === 'aluminum_other'
  const manualReady = !!status?.manual
  const tooMany = pageCount > MAX_PAGES

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && toggle('importOpen')}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>导入说明书 / 教程</h3>
            <small>
              {status === null
                ? '检测 AI 服务…'
                : manualReady
                  ? `AI 模型：${status.manualModel ?? status.model}`
                  : status.configured
                    ? '资料 → 3D 只能在开发服务器上运行'
                    : '演示模式 · 未配置 AI 服务'}
            </small>
          </div>
          <button className="round small" onClick={() => toggle('importOpen')} aria-label="关闭"><IconClose /></button>
        </div>

        {phase === 'pick' && (
          <div className="modal-body">
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addFiles(e.dataTransfer.files)
              }}
            >
              {!pdf && images.length === 0 ? (
                <>
                  <div className="drop-art" aria-hidden>
                    <svg viewBox="0 0 120 80" width="120" height="80" fill="none" stroke="#8a8a8a" strokeWidth="1.4">
                      <rect x="18" y="8" width="52" height="66" rx="3" fill="#f5f5f3" />
                      <rect x="40" y="4" width="52" height="66" rx="3" fill="#fff" />
                      <path d="M50 22h32M50 30h24M50 52h32M50 60h18" />
                      <rect x="52" y="36" width="10" height="10" fill="#f8e8a8" stroke="#161616" />
                      <path d="M62 41h18" stroke="#161616" />
                    </svg>
                  </div>
                  <p>上传说明书、教程或讲义 PDF，或把每一页拍清楚</p>
                  <small>PDF / JPG / PNG，一次最多 {MAX_PAGES} 页。产品说明书、折纸图解、立体书做法、物理实验、机械原理，菜谱、手工等其他教程也可以。</small>
                </>
              ) : (
                <>
                  {pdf && (
                    <div className="pdf-card">
                      <div className="pdf-icon" aria-hidden>PDF</div>
                      <div className="pdf-info">
                        <b title={pdf.file.name}>{pdf.file.name}</b>
                        <small>共 {pdf.total} 页 · 已选 {pdfPages.length} 页</small>
                      </div>
                      <label className="pdf-range">
                        <span>页码</span>
                        <input value={pdf.range} onChange={(e) => setPdf({ ...pdf, range: e.target.value })} placeholder="例如 3-12, 15" />
                      </label>
                      <button className="round small" onClick={() => setPdf(null)} aria-label="移除 PDF"><IconClose width={14} height={14} /></button>
                    </div>
                  )}
                  {images.length > 0 && (
                    <div className="thumbs">
                      {images.map((src, i) => (
                        <div className="thumb" key={i}>
                          <img src={src} alt={`照片 ${i + 1}`} />
                          <button onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="移除"><IconClose width={12} height={12} /></button>
                          <span>{pdfPages.length + i + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="drop-actions">
                <button className="btn ghost" onClick={() => camRef.current?.click()}><IconCamera width={16} height={16} /> 拍照</button>
                <button className="btn ghost" onClick={() => fileRef.current?.click()}><IconUpload width={16} height={16} /> 上传 PDF / 图片</button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
              <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            {tooMany && <div className="notice warn">一次最多 {MAX_PAGES} 页，现在选了 {pageCount} 页。长手册只选安装 / 使用相关的页码。</div>}
            <label className="hint-field">
              <span>补充说明（可选）</span>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="例如：只做安装部分；这是折纸图解；第 5 页的图看不清，是侧面" />
            </label>
            {status?.tripo && appearance && (
              <div className="hint-field">
                <span>产品照片（可选）<small>一两张清楚的整机照片（官网图、自己拍的都行，3/4 角度最好），真实外观会像得多；不传就用说明书里的图或文字描述生成</small></span>
                <div className="form-images">
                  {photos.map((src, i) => (
                    <div className="thumb" key={i}>
                      <img src={src} alt={`产品照片 ${i + 1}`} />
                      <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="移除"><IconClose width={12} height={12} /></button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button className="thumb-add" onClick={() => photoRef.current?.click()}><IconCamera width={18} height={18} /><small>加照片</small></button>
                  )}
                </div>
                <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
              </div>
            )}
            <label className="check-field">
              <input type="checkbox" checked={showPages} onChange={(e) => setShowPages(e.target.checked)} />
              <span>在「原说明书」里展示这些页面<small>自己拍的或已获授权的才勾；不勾也能按页码溯源</small></span>
            </label>
            <label className="check-field">
              <input type="checkbox" checked={appearance && !!status?.tripo} disabled={!status?.tripo} onChange={(e) => setAppearance(e.target.checked)} />
              <span>
                用 Tripo 生成真实外观模型
                <small>{status?.tripo ? '主体和大件换成按照片 / 说明书图重建的 3D 模型，多花 3–5 分钟，每件约 20–40 积分；折纸、立体书、物理、机械类由引擎精确建模，会自动跳过' : '没配置 TRIPO_API_KEY（见 .env.example），只用几何体建模'}</small>
              </span>
            </label>
            <label className="check-field">
              <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
              <span>生成后逐步截图，再让 AI 对照原页复核一轮<small>效果更好，多花几分钟</small></span>
            </label>
            {status && !manualReady && (
              <div className="notice warn">
                {status.configured
                  ? '资料 → 3D 要用开发服务器（npm run dev）运行：它会写文件、跑审计和截图。'
                  : '还没配置 AI 服务：在 .env.local 里填 AI_API_KEY（换别家 OpenAI 兼容服务时再填 AI_BASE_URL、AI_MANUAL_MODEL），重启开发服务器。'}
              </div>
            )}
            <p className="field-note">
              AI 先判断资料属于哪一类：产品说明书、折纸、立体书、物理原理、机械结构各有一套内置方法（skill），都不是就按通用的自由生成方法来做。然后逐页读资料，搭出 3D 场景并写好每一步动作，再用场景审计（穿插、悬空、插接、镜头）自动检查修正。通常 5–15 分钟，可以关掉弹窗，后台继续；在「我的 · 导入」里点它就能回来看进度。
              {' '}铝型材桌想改尺寸？<button className="link-btn" disabled={!pageCount} onClick={() => runDesk(false)}>按参数化方式解析</button>
            </p>
          </div>
        )}

        {phase === 'preparing' && (
          <div className="modal-body analyzing">
            <div className="scan">
              {preview ? <img src={preview} alt="" /> : <div className="scan-placeholder" />}
              <i className="scan-line" />
            </div>
            <div>
              <b>正在把 PDF 转成图片</b>
              <p className="job-meta">{prep.done} / {prep.total} 页</p>
            </div>
          </div>
        )}

        {phase === 'running' && (
          <div className="modal-body">
            <div className="analyzing">
              <div className="scan">
                {preview ? <img src={preview} alt="" /> : <div className="scan-placeholder" />}
                <i className="scan-line" />
              </div>
              <div className="job-progress">
                <ol className="stages">
                  {stages.map(([s, label], i) => (
                    <li key={s} className={i < current ? 'done' : i === current ? 'doing' : ''}>
                      <span>{i < current ? <IconCheck width={14} height={14} /> : i + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
                <p className="job-meta">
                  {job?.name ? `${job.name} · ` : ''}{clock(elapsed)}
                  {job?.detail ? ` · ${job.detail}` : ''}
                </p>
              </div>
            </div>
            {job?.route && <RouteCard route={job.route} />}
            {job && job.log.length > 0 && <JobLog job={job} open />}
          </div>
        )}

        {phase === 'finished' && job && (
          <div className="modal-body result">
            {job.kind === 'parametric_desk' ? (
              <>
                <div className="notice">这份看起来是铝型材桌的说明书，更适合用参数化方式生成：尺寸、板材、配件都可以改。</div>
                {!prepared.length && <p className="field-note">页面图片没留在浏览器里（刷新过），返回重新上传即可。</p>}
              </>
            ) : job.kind === 'not_manual' ? (
              <div className="error-box">
                <b>没认出能做成 3D 演示的内容</b>
                <p>{job.route?.reason || '上传的图片看不出讲的是什么。'} 换成清楚的说明书、图解或教程页再试，也可以在补充说明里写明这是什么。</p>
              </div>
            ) : (
              <>
                <div className="result-head">
                  <div>
                    <small>由 {job.model} 生成 · 用时 {clock(elapsed)}</small>
                    <h4>{job.name ?? job.manualId}</h4>
                  </div>
                </div>
                {job.route && <RouteCard route={job.route} />}
                {job.summary && (
                  <>
                    <table className="bom">
                      <thead><tr><th>指南</th><th>步数</th></tr></thead>
                      <tbody>
                        {job.summary.guides.map((g) => (
                          <tr key={g.title}><td>{g.title}</td><td className="mono">{g.steps}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="job-meta">
                      {job.summary.pages} 页 · {job.summary.parts} 个零件 · 调用 {job.usage.calls} 次 · 输入 {kTok(job.usage.input)} / 输出 {kTok(job.usage.output)} tokens
                    </p>
                    {job.appearance && (
                      <p className="job-meta">
                        {job.models?.some((m) => m.ok)
                          ? `真实外观：${job.models.filter((m) => m.ok).length} 个零件换成了 Tripo 模型（${[...new Set(job.models.filter((m) => m.ok).map((m) => SOURCE_LABEL[m.source]))].join('、')}）`
                          : '真实外观：没有生成成功，先用几何体'}
                        {job.credits ? ` · ${job.credits} 积分` : ''}
                      </p>
                    )}
                  </>
                )}
                {job.problems.length > 0 && (
                  <div className="notice warn">还有 {job.problems.length} 个审计问题没修掉：可以先打开看，个别步骤可能有穿插或镜头没对准。</div>
                )}
                {job.problems.length > 0 && (
                  <details className="parts-found">
                    <summary>未修掉的问题（{job.problems.length}）</summary>
                    <ul>{job.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </details>
                )}
                {!!job.summary?.inferred.length && (
                  <details className="parts-found">
                    <summary>原文没写、AI 推断的内容（{job.summary.inferred.length}）</summary>
                    <ul>{job.summary.inferred.map((p) => <li key={p}>{p}</li>)}</ul>
                  </details>
                )}
                {job.kind === 'scene' && job.manualId && (
                  <div className="publish-inline">
                    <h4>发布到社区</h4>
                    <p className="field-note">发布后会出现在首页，大家可以看 3D 演示、点赞和评论。也可以先不发布，它会留在「我的 · 导入」里，只有你看得到。</p>
                    <PostForm
                      product={`manual:${job.manualId}`}
                      lockProduct
                      kind="manual"
                      defaultTitle={job.name ?? ''}
                      submitLabel="发布并打开 →"
                      onDone={(id) => openResult(id)}
                    />
                  </div>
                )}
              </>
            )}
            <JobLog job={job} />
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="modal-body analyzing">
            <div className="scan">
              {preview ? <img src={preview} alt="" /> : <div className="scan-placeholder" />}
              <i className="scan-line" />
            </div>
            <ol className="stages">
              {DESK_STAGES.map((s, i) => (
                <li key={s} className={i < stage ? 'done' : i === stage ? 'doing' : ''}>
                  <span>{i < stage ? <IconCheck width={14} height={14} /> : i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}

        {phase === 'error' && (
          <div className="modal-body">
            <div className="error-box">
              <b>没有完成</b>
              <p>{error}</p>
            </div>
            {job && job.log.length > 0 && <JobLog job={job} />}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="modal-body result">
            {result.note && <div className="notice">{result.note}</div>}
            <div className="result-head">
              <div>
                <small>{result.mode === 'ai' ? `由 ${result.model} 解析` : '示例解析'}</small>
                <h4>{result.spec.productName}</h4>
              </div>
              <div className="confidence">
                <small>识别把握</small>
                <div className="bar"><i style={{ width: `${Math.round(result.spec.confidence * 100)}%` }} /></div>
                <b>{Math.round(result.spec.confidence * 100)}%</b>
              </div>
            </div>
            {!supported && (
              <div className="notice warn">这份说明书看起来不是铝型材家具。参数化方式只支持铝型材桌子，可以先用识别到的尺寸生成一张铝型材桌参考。</div>
            )}
            <table className="bom params">
              <thead><tr><th>参数</th><th>值</th><th>来源</th></tr></thead>
              <tbody>
                {IMPORT_FIELDS.map(([k, label, unit]) => {
                  const src = result.sources[k]
                  const v = (result.config as unknown as Record<string, unknown>)[k]
                  return (
                    <tr key={k} className={src === 'default' ? 'is-default' : ''}>
                      <td>{label}</td>
                      <td className="mono">{fmt(v)}{typeof v === 'number' ? unit : ''}</td>
                      <td>
                        {src === 'manual'
                          ? <span className="src manual" title={result.spec.evidence[k]}>说明书{result.spec.evidence[k] ? ' ⓘ' : ''}</span>
                          : <span className="src default">默认值</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {result.spec.parts.length > 0 && (
              <details className="parts-found">
                <summary>说明书零件表（{result.spec.parts.length} 项）</summary>
                <ul>
                  {result.spec.parts.map((p, i) => <li key={i}>{p.name} {p.spec} <b>×{p.qty}</b></li>)}
                </ul>
              </details>
            )}
            {result.spec.warnings.length > 0 && (
              <ul className="warnings">{result.spec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}
          </div>
        )}

        <div className="modal-foot">
          {phase === 'pick' && (
            <>
              <button className="btn ghost" onClick={() => runDesk(true)}>没有说明书？用示例</button>
              <button className="btn primary" disabled={!pageCount || tooMany || !manualReady} onClick={start}>
                <IconSpark width={16} height={16} /> 生成 3D 交互说明书
              </button>
            </>
          )}
          {phase === 'running' && (
            <>
              <button className="btn ghost" onClick={() => jobId && cancelManualJob(jobId).catch(fail)}>取消</button>
              <button className="btn primary" onClick={() => toggle('importOpen')}>后台运行</button>
            </>
          )}
          {phase === 'finished' && job && (
            job.kind === 'scene' && job.manualId ? (
              <>
                <button className="btn ghost" onClick={remove}>删除</button>
                <button className="btn ghost" onClick={reset}>再导入一份</button>
                <button className="btn ghost" onClick={() => openResult()}>先不发布，打开看看</button>
              </>
            ) : (
              <>
                <button className="btn ghost" onClick={reset}>返回</button>
                {job.kind === 'parametric_desk' && (
                  <button className="btn primary" disabled={!prepared.length} onClick={() => { sessionStorage.removeItem(JOB_KEY); runDesk(false, prepared) }}>按参数化方式解析</button>
                )}
              </>
            )
          )}
          {phase === 'error' && (
            <>
              <button className="btn ghost" onClick={reset}>返回</button>
              {job?.manualId
                ? <button className="btn primary" onClick={() => openResult()}>打开已保存的版本 →</button>
                : <button className="btn primary" onClick={() => runDesk(true)}>看看示例</button>}
            </>
          )}
          {phase === 'result' && (
            <>
              <button className="btn ghost" onClick={() => apply(true)}>先调整参数</button>
              <button className="btn primary" onClick={() => apply(false)}>生成 3D 安装指导 →</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 分流结果：认成哪一类、用哪份 skill、为什么 */
function RouteCard({ route }: { route: NonNullable<ManualJob['route']> }) {
  return (
    <div className="route-card">
      <div className="route-head">
        <b>{route.label}</b>
        {route.skill && <code>{route.skill}</code>}
        <small>把握 {Math.round(route.confidence * 100)}%</small>
      </div>
      {route.subject && <p>{route.subject}</p>}
      {route.guess && <p className="route-note">AI 觉得像「{VERDICT_LABEL[route.guess]}」，但把握不够，改用自由生成。</p>}
      {route.reason && <small>{route.reason}</small>}
    </div>
  )
}

function JobLog({ job, open }: { job: ManualJob; open?: boolean }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [job.log.length])
  return (
    <details className="job-log" open={open}>
      <summary>运行记录（{job.log.length}）</summary>
      <ol ref={ref}>
        {job.log.map((l, i) => (
          <li key={i} className={l.level}><time>{clock(l.t)}</time>{l.msg}</li>
        ))}
      </ol>
    </details>
  )
}
