// 网页导入说明书 → 3D 交互演示（前端）：PDF 在浏览器里转成逐页图 + 文字层，交给开发服务器的流水线
// （server/manualPipeline.ts，内置 manual-to-3d skill），轮询进度，完成后打开生成的说明书。

import type { PDFPageProxy } from 'pdfjs-dist'
import { withBase } from '../base'
import { apiFetch } from '../net'

export type Stage = 'classify' | 'transcribe' | 'author' | 'check' | 'repair' | 'save' | 'appearance' | 'shoot' | 'review' | 'done'

/** 分流结果：说明书 / 折纸 / 立体书 / 物理原理 / 机械结构 / 自由生成，外加型材家具和做不了 */
export type Verdict = 'manual' | 'origami' | 'popup' | 'physics' | 'mechanism' | 'free' | 'desk' | 'reject'

export const VERDICT_LABEL: Record<Verdict, string> = {
  manual: '产品说明书', origami: '折纸', popup: '立体书', physics: '物理原理', mechanism: '机械结构', free: '其他', desk: '型材家具', reject: '做不了',
}

export interface ManualJob {
  id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  stage: Stage
  detail?: string
  log: { t: number; msg: string; level: 'info' | 'ok' | 'warn' | 'error' }[]
  model: string
  usage: { input: number; output: number; cached: number; calls: number }
  kind?: 'scene' | 'parametric_desk' | 'not_manual'
  route?: { verdict: Verdict; label: string; skill?: string; guess?: Verdict; confidence: number; subject: string; reason: string }
  review: boolean
  appearance: boolean
  /** 外观模型：哪些零件挂上了（source：参考图来自产品照片 / 说明书页 / 文字描述） */
  models?: { part: string; name: string; source: 'photo' | 'page' | 'text'; ok: boolean; note?: string }[]
  credits?: number
  manualId?: string
  name?: string
  summary?: { pages: number; parts: number; guides: { title: string; kind: string; steps: number }[]; inferred: string[] }
  problems: string[]
  warnings: string[]
  error?: string
  created: number
  input?: { fileName?: string; pages: number; photos: number; hint?: string }
  finished?: number
  legacy?: boolean
}

/** 任务列表里的一条（不带日志；problems / models 是个数） */
export type JobBrief = Omit<ManualJob, 'log' | 'warnings' | 'summary' | 'problems' | 'models'> & { problems: number; models: number }

/** 生成的各个阶段（弹窗进度条、「我的 · 导入」卡片共用） */
export const JOB_STAGES: [Stage, string][] = [
  ['classify', '判断类型、选生成方法'],
  ['transcribe', '逐页读资料'],
  ['author', '搭 3D 场景、写每一步'],
  ['check', '编译 + 场景审计'],
  ['repair', '按审计问题自动修正'],
  ['save', '保存到我的导入'],
  ['appearance', '生成真实外观（Tripo）'],
  ['shoot', '逐步截图'],
  ['review', '对照原页复核'],
]

/** 这个任务会走的阶段：没勾截图复核、没开真实外观的不算 */
export const jobStages = (job: Pick<ManualJob, 'review' | 'appearance'> | null) =>
  JOB_STAGES.filter(([s]) => (job?.review !== false || (s !== 'shoot' && s !== 'review')) && (s !== 'appearance' || !!job?.appearance))

export interface PdfPages {
  /** 逐张图（data URL）：普通页一张；大幅面页 = 整页缩略 + 若干高清局部 */
  pages: string[]
  texts: string[]
  /** 每张图来自原文件第几页 */
  numbers: number[]
  /** 每张图的说明（「整页缩略」「局部 2/6 · 第 1 行第 2 列」），普通页为空 */
  notes: string[]
  total: number
}

/** 超过这个尺寸（pt，A4 长边 842）的页按块切：快速指南常是一整张海报，缩到 1600px 小字就糊了 */
const TILE = 900
const OVERLAP = 0.06

/** "3-12, 15" → [3..12, 15]，超出范围的页丢掉 */
export function parseRange(spec: string, total: number): number[] {
  const out = new Set<number>()
  for (const part of spec.split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*[-–~]\s*(\d+))?$/)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= total) out.add(i)
  }
  return [...out].sort((x, y) => x - y)
}

/**
 * 用 legacy 版：现代版直接用 Map.getOrInsertComputed、Promise.withResolvers 这些新 API，Safari 上渲染就报错；legacy 版带 core-js 补齐。
 * 它没补的是 for await 读 ReadableStream（getTextContent 要用，Safari 不支持），这里补上。
 */
async function pdfjs() {
  if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value: async function* (this: ReadableStream) {
        const reader = this.getReader()
        let done = false
        try {
          for (;;) {
            const r = await reader.read()
            if ((done = r.done)) return
            yield r.value
          }
        } finally {
          if (done) reader.releaseLock()
          else await reader.cancel()
        }
      },
    })
  }
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

export async function pdfPageCount(file: File) {
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const n = doc.numPages
  await doc.destroy()
  return n
}

/** 把页面上 [x, y, w, h]（pt）这块渲染成长边 maxSide 的 JPEG */
async function renderRegion(page: PDFPageProxy, [x, y, w, h]: number[], maxSide: number) {
  const scale = maxSide / Math.max(w, h)
  const viewport = page.getViewport({ scale, offsetX: -x * scale, offsetY: -y * scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** 渲染指定页为长边 maxSide 的 JPEG（大幅面页另加高清局部），同时抽出文字层（扫描件没有文字层，返回空串） */
export async function pdfToPages(file: File, pages: number[], onPage?: (done: number) => void, maxSide = 1600): Promise<PdfPages> {
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: PdfPages = { pages: [], texts: [], numbers: [], notes: [], total: doc.numPages }
  const push = (url: string, n: number, text: string, note: string) => {
    out.pages.push(url)
    out.numbers.push(n)
    out.texts.push(text)
    out.notes.push(note)
  }
  try {
    for (const [i, n] of pages.entries()) {
      const page = await doc.getPage(n)
      const { width: w, height: h } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim()
      const cols = Math.ceil(w / TILE)
      const rows = Math.ceil(h / TILE)
      const tiled = Math.max(w, h) > TILE * 1.4
      push(await renderRegion(page, [0, 0, w, h], maxSide), n, text, tiled ? `整页缩略（后面 ${cols * rows} 张是高清局部）` : '')
      if (tiled) {
        const tw = w / cols
        const th = h / rows
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = Math.max(0, c * tw - tw * OVERLAP)
            const y = Math.max(0, r * th - th * OVERLAP)
            const region = [x, y, Math.min(w, (c + 1) * tw + tw * OVERLAP) - x, Math.min(h, (r + 1) * th + th * OVERLAP) - y]
            push(await renderRegion(page, region, maxSide), n, '', `局部 ${r * cols + c + 1}/${cols * rows} · 第 ${r + 1} 行第 ${c + 1} 列`)
          }
        }
      }
      page.cleanup()
      onPage?.(i + 1)
    }
  } finally {
    await doc.destroy()
  }
  return out
}

async function json<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || `请求失败（${r.status}）`)
  return data as T
}

export interface JobRequest {
  pages: string[]
  texts?: string[]
  /** 只传一份 PDF 时每张图的原页码 */
  pageNumbers?: number[]
  /** 每张图的说明（大幅面页切出来的局部） */
  pageNotes?: string[]
  hint?: string
  showPages: boolean
  review: boolean
  /** 用 Tripo 生成真实外观模型 */
  appearance: boolean
  /** 产品照片（外观模型的参考图） */
  photos?: string[]
  fileName?: string
}

export async function startManualJob(input: JobRequest) {
  const r = await apiFetch('/api/manual/jobs', { body: input })
  return (await json<{ id: string }>(r)).id
}

export const getManualJob = async (id: string) => json<ManualJob>(await apiFetch(`/api/manual/jobs/${id}`))

/** 自己还在跑的和最近一天结束的任务 */
export const listManualJobs = async () => (await json<{ jobs: JobBrief[] }>(await apiFetch('/api/manual/jobs'))).jobs

/** 任务存下来的上传图（第 n 张原页 / 产品照片），只有发起的人和管理员拿得到 */
export const jobImageUrl = (id: string, n = 1, dir: 'pages' | 'photos' = 'pages') => withBase(`/api/manual/jobs/${id}/${dir}/${n}`)

const DISMISSED_KEY = 'xiuligong-dismissed-jobs'

/** 没成功的任务看过原因、点了「返回」以后，「我的 · 导入」里就不再列它 */
export function dismissedJobs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function dismissJob(id: string) {
  const ids = [...dismissedJobs(), id].slice(-100)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch { /* 隐私模式存不了就算了 */ }
}

export const cancelManualJob = async (id: string) => json(await apiFetch(`/api/manual/jobs/${id}/cancel`, { method: 'POST' }))

export const deleteImportedManual = async (id: string) => json(await apiFetch(`/api/manual/imported/${id}`, { method: 'DELETE' }))

/** 弹窗关掉后任务仍在服务器上跑；重新打开时接着显示 */
export const JOB_KEY = 'xiuligong-import-job'

/** 打开刚生成的说明书：整页重载，让启动流程把它注册进说明书库 */
/** 整页重新加载（新导入的说明书要在启动时注册），打开这份说明书的笔记；note 是发布后的笔记 id */
export function openImported(id: string, note?: string) {
  sessionStorage.removeItem(JOB_KEY)
  const url = new URL(location.href)
  url.searchParams.set('open', `manual:${id}`)
  url.hash = note ? `#/note/${encodeURIComponent(note)}` : ''
  location.href = url.toString()
}
