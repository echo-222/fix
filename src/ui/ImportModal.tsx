import { useEffect, useRef, useState } from 'react'
import {
  IMPORT_FIELDS, VALUE_LABELS, analyzeManual, compressImage, demoResult, getAiStatus, type ImportResult,
} from '../ai/manual'
import { useApp } from '../store'
import { IconCamera, IconCheck, IconClose, IconSpark, IconUpload } from './icons'

type Phase = 'pick' | 'analyzing' | 'result' | 'error'

const STAGES = ['读取图片', '识别文字与图示', '提取零件表', '推断结构与尺寸', '生成 3D 安装步骤']

function fmt(v: unknown) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '有' : '无'
  return VALUE_LABELS[String(v)] ?? String(v)
}

export function ImportModal() {
  const toggle = useApp((s) => s.toggle)
  const applyImported = useApp((s) => s.applyImported)
  const setPanel = useApp((s) => s.setPanel)
  const [phase, setPhase] = useState<Phase>('pick')
  const [images, setImages] = useState<string[]>([])
  const [hint, setHint] = useState('')
  const [stage, setStage] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<{ configured: boolean; model: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAiStatus().then(setStatus)
  }, [])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const list = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).map((f) => compressImage(f)))
    setImages((prev) => [...prev, ...list].slice(0, 8))
  }

  const run = async (demo: boolean) => {
    setPhase('analyzing')
    setStage(0)
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), demo ? 550 : 1600)
    try {
      const minDelay = new Promise((r) => setTimeout(r, demo ? 2800 : 1200))
      const r = demo || !status?.configured
        ? demoResult(demo ? undefined : '未配置 AI 服务（.env.local 中的 AI_API_KEY），以下是示例解析结果，用来演示流程。')
        : await analyzeManual(images, hint || undefined)
      await minDelay
      setResult(r)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    } finally {
      clearInterval(timer)
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
    if (thenDesign) setPanel('design')
  }

  const supported = result?.spec.category === 'aluminum_desk' || result?.spec.category === 'aluminum_other'

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && toggle('importOpen')}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>导入说明书</h3>
            <small>
              {status === null ? '检测 AI 服务…' : status.configured ? `AI 模型：${status.model}` : '演示模式 · 未配置 AI 服务'}
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
              {images.length === 0 ? (
                <>
                  <div className="drop-art" aria-hidden>
                    <svg viewBox="0 0 120 80" width="120" height="80" fill="none" stroke="#161616" strokeWidth="1.4">
                      <rect x="18" y="8" width="52" height="66" rx="3" fill="#fff" />
                      <rect x="40" y="4" width="52" height="66" rx="3" fill="#fff" />
                      <path d="M50 22h32M50 30h24M50 52h32M50 60h18" />
                      <rect x="52" y="36" width="10" height="10" />
                      <path d="M62 41h18" stroke="#e8462f" />
                    </svg>
                  </div>
                  <p>把说明书每一页拍清楚，或从相册选择</p>
                  <small>支持 JPG / PNG / HEIC，最多 8 页。也可以上传商品详情页截图。</small>
                </>
              ) : (
                <div className="thumbs">
                  {images.map((src, i) => (
                    <div className="thumb" key={i}>
                      <img src={src} alt={`第 ${i + 1} 页`} />
                      <button onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="移除"><IconClose width={12} height={12} /></button>
                      <span>{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="drop-actions">
                <button className="btn ghost" onClick={() => camRef.current?.click()}><IconCamera width={16} height={16} /> 拍照</button>
                <button className="btn ghost" onClick={() => fileRef.current?.click()}><IconUpload width={16} height={16} /> 上传图片</button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            <label className="hint-field">
              <span>补充说明（可选）</span>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="例如：想改成 1.4 米宽，桌面用 25mm 竹板" />
            </label>
            <p className="field-note">第一版只支持铝型材桌子。解析结果会以「参数」的形式给你确认，识别不准的地方可以直接改。</p>
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="modal-body analyzing">
            <div className="scan">
              {images[0] ? <img src={images[0]} alt="" /> : <div className="scan-placeholder" />}
              <i className="scan-line" />
            </div>
            <ol className="stages">
              {STAGES.map((s, i) => (
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
              <b>解析失败</b>
              <p>{error}</p>
            </div>
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
              <div className="notice warn">这份说明书看起来不是铝型材家具。第一版只支持铝型材桌子，可以先用识别到的尺寸生成一张铝型材桌参考。</div>
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
              <button className="btn ghost" onClick={() => run(true)}>没有说明书？用示例</button>
              <button className="btn primary" disabled={images.length === 0} onClick={() => run(false)}>
                <IconSpark width={16} height={16} /> 开始解析
              </button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button className="btn ghost" onClick={() => setPhase('pick')}>返回</button>
              <button className="btn primary" onClick={() => run(true)}>改用示例数据</button>
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
