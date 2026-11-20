// 网页导入资料 → 3D 交互演示的服务端流水线（skill 的自动版）：
//   分流（判断是说明书 / 折纸 / 立体书 / 物理原理 / 机械结构 / 其他，见 skillRouter.ts，决定用哪份 skill）
//   → 转写（读图）→ 写场景脚本 → 编译校验 + 场景审计 → 按问题自动修复（多轮）→ 保存到 IMPORT_DIR/<id>/（见 imports.ts）
//   → 配了 Tripo 且这条链路需要时，生成真实外观模型挂到零件上（server/appearance.ts）
//   → 可选：无头浏览器逐步截图，把联系表和原页一起交给模型复核，再修一轮。
// 每个任务的上传图和中间产物（原页、照片、转写、每轮脚本、审计结果、截图）留在 IMPORT_WORK_DIR/<job>/（本地是 manuals-src/imports/，已 gitignore），
// 进度和结果存进 import_jobs（importJobs.ts），重启不丢，管理后台能看到所有人的。
// 任务记着是谁发起的：进度、取消、删除只有本人（和管理员）能做。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ViteDevServer } from 'vite'
import { appearance, tripoReady, type AppearanceModel } from './appearance.ts'
import type { Me } from './auth.ts'
import { logEvent } from './events.ts'
import { cancelRequested, loadJob, requestCancel, runningCount, saveJob } from './importJobs.ts'
import { IMPORT_DIR, IMPORT_WORK_DIR, mayEdit, readIndex, writeIndex } from './imports.ts'
import { chatJson, llmConfig, LlmError, type LlmConfig, type Message, type Part, type Usage } from './llm.ts'
import { TRANSCRIBE_LEAD, authorTask, repairTask, reviewTaskFor, systemFor, transcribeSystem } from './manualSkill.ts'
import { CLASSIFY_LEAD, ROUTES, classified, classifySystem, type Route, type Verdict } from './skillRouter.ts'

type Env = Record<string, string>
type Json = Record<string, any>

export interface JobInput {
  /** 逐页图片（data URL，JPEG） */
  pages: string[]
  /** PDF 每页抽出的文字（可选，和 pages 一一对应） */
  texts?: string[]
  /** 只传了一份 PDF 时，每页在原文件里的页码：保存时步骤的 page 和原页图都换成它，网页上的「第 N 页」就和原文件对得上 */
  pageNumbers?: number[]
  /** 每张图的说明：大幅面页切成「整页缩略 + 高清局部」时标出是哪一块 */
  pageNotes?: string[]
  hint?: string
  /** 在网页「原说明书」面板展示上传的页面（自己拍的 / 已获授权才勾） */
  showPages?: boolean
  /** 保存后截图复核一轮 */
  review?: boolean
  /** 用 Tripo 生成真实外观模型（需要 TRIPO_API_KEY） */
  appearance?: boolean
  /** 用户另传的产品照片（data URL，JPEG）：外观模型的参考图，不当说明书页 */
  photos?: string[]
  fileName?: string
  /** 资料出处（热榜自动生成时是品牌官网的说明书地址）；不给就记成「用户上传」 */
  source?: { title: string; url?: string }
}

export type Stage = 'classify' | 'transcribe' | 'author' | 'check' | 'repair' | 'save' | 'appearance' | 'shoot' | 'review' | 'done'

export interface Job {
  id: string
  /** 发起的人（用户 id） */
  owner: string
  created: number
  status: 'running' | 'done' | 'error' | 'cancelled'
  stage: Stage
  /** 当前阶段的细节（已生成字数、第几轮） */
  detail?: string
  log: { t: number; msg: string; level: 'info' | 'ok' | 'warn' | 'error' }[]
  model: string
  usage: Usage & { calls: number }
  /** 结果类型：scene = 生成了 3D 演示；parametric_desk = 型材家具，转参数化流程；not_manual = 做不了 */
  kind?: 'scene' | 'parametric_desk' | 'not_manual'
  /** 分流结果：走哪条链路、用哪份 skill、为什么 */
  route?: { verdict: Verdict; label: string; skill?: string; guess?: Verdict; confidence: number; subject: string; reason: string }
  /** 是否带截图复核、真实外观（前端据此决定显示几个阶段） */
  review: boolean
  appearance: boolean
  /** 外观模型：挂上了哪些、哪些没成 */
  models?: AppearanceModel[]
  /** Tripo 实际扣的积分 */
  credits?: number
  manualId?: string
  name?: string
  summary?: { pages: number; parts: number; guides: { title: string; kind: string; steps: number }[]; inferred: string[] }
  /** 最终仍未修掉的审计问题 / 警告 */
  problems: string[]
  warnings: string[]
  error?: string
  /** 上传了什么（文件名、页数、照片数、补充说明）：图本身在 IMPORT_WORK_DIR/<任务号>/pages、photos */
  input?: { fileName?: string; pages: number; photos: number; hint?: string }
  finished?: number
  /** 有任务表之前的导入，按中间产物补登记的（没有日志） */
  legacy?: boolean
}

const MAX_REPAIR = 4
const MAX_REVIEW_REPAIR = 2
/** 这个模块实例在跑的任务（能直接取消）；进度和历史都存在 import_jobs 里（importJobs.ts） */
const jobs = new Map<string, { job: Job; abort: AbortController }>()

const allowed = (job: Job, me: Me) => job.owner === me.id || me.role === 'admin'

export function publicJob(id: string, me: Me) {
  const live = jobs.get(id)?.job
  const job = live ?? loadJob(id)
  return job && allowed(job, me) ? job : undefined
}

export const runningJobs = runningCount

export function cancelJob(id: string, me: Me) {
  const job = publicJob(id, me)
  if (!job || job.status !== 'running') return false
  const live = jobs.get(id)
  if (!live) return requestCancel(id)
  live.abort.abort()
  live.job.status = 'cancelled'
  saveJob(live.job)
  return true
}

/** 内存里只留在跑的和刚结束的；结束超过一天的清掉（库里还有） */
const KEEP_MS = 24 * 3600 * 1000
/** 进度写进库的间隔，兼作心跳 */
const BEAT_MS = 2000

export function startJob(env: Env, server: ViteDevServer, input: JobInput, owner: string): Job {
  const cfg = llmConfig(env)
  if (!cfg) throw new Error('未配置 AI_API_KEY')
  for (const [k, j] of jobs) if (j.job.status !== 'running' && Date.now() - j.job.created > KEEP_MS) jobs.delete(k)
  const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6)
  const job: Job = {
    id, owner, created: Date.now(), status: 'running', stage: 'classify', log: [], model: cfg.model, review: !!input.review,
    appearance: !!input.appearance && tripoReady(env),
    usage: { input: 0, output: 0, cached: 0, calls: 0 }, problems: [], warnings: [],
    input: { fileName: input.fileName, pages: input.pages.length, photos: input.photos?.length ?? 0, hint: input.hint?.trim() || undefined },
  }
  const abort = new AbortController()
  jobs.set(id, { job, abort })
  saveJob(job)
  logEvent(owner, 'import_start', null, input.fileName ?? `${input.pages.length} 页图片`)
  const beat = setInterval(() => {
    if (cancelRequested(id) && !abort.signal.aborted) {
      abort.abort()
      job.status = 'cancelled'
    }
    saveJob(job)
  }, BEAT_MS)
  run(job, input, cfg, server, abort.signal, Number(env.TRIPO_MAX_PARTS) || 4)
    .catch((e) => {
      if (job.status === 'cancelled') {
        job.detail = undefined
        return log(job, job.manualId ? '已取消；复核前保存的版本留着，可以在「我的 · 导入」里打开' : '已取消', 'warn')
      }
      job.status = 'error'
      job.error = e instanceof Error ? e.message : String(e)
      log(job, job.error, 'error')
      logEvent(job.owner, 'import_fail', job.manualId ? `manual:${job.manualId}` : null, job.error.slice(0, 120))
    })
    .finally(() => {
      clearInterval(beat)
      job.finished = Date.now()
      job.detail = undefined
      saveJob(job)
    })
  return job
}

function log(job: Job, msg: string, level: Job['log'][number]['level'] = 'info') {
  job.log.push({ t: Date.now() - job.created, msg, level })
}

// ---------- 主流程 ----------

async function run(job: Job, input: JobInput, cfg: LlmConfig, server: ViteDevServer, signal: AbortSignal, maxModels: number) {
  const work = join(IMPORT_WORK_DIR, job.id)
  mkdirSync(work, { recursive: true })
  const dump = (name: string, data: unknown) => writeFileSync(join(work, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  // 上传的原页和产品照片都留一份：用户没勾「展示原页」也在，管理后台和「我的 · 导入」的缩略图从这里取
  const keep = (dir: 'pages' | 'photos', list: string[] = []) => {
    if (!list.length) return
    mkdirSync(join(work, dir), { recursive: true })
    list.forEach((url, i) => {
      const ext = url.match(/^data:image\/(png|webp)/)?.[1] ?? 'jpg'
      writeFileSync(join(work, dir, `${String(i + 1).padStart(2, '0')}.${ext}`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
    })
  }
  keep('pages', input.pages)
  keep('photos', input.photos)
  dump('input.json', { fileName: input.fileName, hint: input.hint, pages: input.pages.length, photos: input.photos?.length ?? 0, showPages: input.showPages, review: input.review, appearance: job.appearance })

  const lib = await loadLibrary(server)
  /** 取消后停在下一个阶段边界：模型请求会被 signal 打断，但截图、审计这些本地步骤要自己查 */
  const alive = () => {
    if (signal.aborted) throw new Error('已取消')
  }
  const call = async <T,>(messages: Message[], label: string) => {
    const t0 = Date.now()
    const r = await chatJson<T>(cfg, messages, { signal, onProgress: (n) => (job.detail = `${label} · 已生成 ${n.toLocaleString()} 字`) }).catch((e) => {
      if (e instanceof LlmError && e.raw !== undefined) dump(`raw-${label}.txt`, e.raw)
      throw e
    })
    job.usage.calls++
    job.usage.input += r.usage.input
    job.usage.output += r.usage.output
    job.usage.cached += r.usage.cached
    job.detail = undefined
    log(job, `${label}：${((Date.now() - t0) / 1000).toFixed(0)} 秒 · 输入 ${r.usage.input.toLocaleString()} / 输出 ${r.usage.output.toLocaleString()} tokens`)
    return r.data
  }
  const pageParts = (detail: 'high' | 'low', textLimit = 8000) =>
    input.pages.flatMap((url, i): Part[] => [
      { type: 'text', text: `第 ${i + 1} 页${input.pageNumbers ? `（原文件第 ${input.pageNumbers[i]} 页）` : ''}${input.pageNotes?.[i] ? `（${input.pageNotes[i]}）` : ''}${input.texts?.[i]?.trim() ? `（PDF 文字层：${input.texts[i].trim().slice(0, textLimit)}）` : ''}` },
      { type: 'image_url', image_url: { url, detail } },
    ])
  const hint = input.hint?.trim() ? `\n用户补充说明：${input.hint.trim()}` : ''
  const about = `共 ${input.pages.length} 页${input.fileName ? `，文件名 ${input.fileName}` : ''}。`

  // 0 分流：低清图 + 文字层开头就够判断类型，决定后面用哪份 skill
  job.stage = 'classify'
  log(job, `判断资料类型（${input.pages.length} 页，${cfg.model}）`)
  const verdict = classified(await call<Json>([
    { role: 'system', content: classifySystem() },
    { role: 'user', content: [{ type: 'text', text: `${CLASSIFY_LEAD}资料${about}${hint}` }, ...pageParts('low', 600)] },
  ], '分流'))
  dump('classify.json', verdict)
  const info = verdict.route ? ROUTES[verdict.route] : undefined
  job.route = {
    verdict: verdict.verdict, label: info?.label ?? (verdict.verdict === 'desk' ? '型材家具' : '做不了'), skill: info?.skill,
    guess: verdict.guess !== verdict.verdict ? verdict.guess : undefined, confidence: verdict.confidence, subject: verdict.subject, reason: verdict.reason,
  }
  if (!verdict.route) {
    job.kind = verdict.verdict === 'desk' ? 'parametric_desk' : 'not_manual'
    job.stage = 'done'
    job.status = 'done'
    log(job, verdict.verdict === 'desk' ? '这是尺寸可调的型材家具，改用参数化建模' : `没有能做成 3D 演示的内容：${verdict.reason || '看不出讲的是什么'}`, 'warn')
    return
  }
  const route: Route = verdict.route
  const R = ROUTES[route]
  job.kind = 'scene'
  const lowered = verdict.guess !== route ? `（模型判断是「${ROUTES[verdict.guess as Route]?.label ?? verdict.guess}」，把握 ${Math.round(verdict.confidence * 100)}% 太低，改走自由生成）` : `（把握 ${Math.round(verdict.confidence * 100)}%）`
  log(job, `分流为「${R.label}」${lowered}，用 ${R.skill} skill${verdict.subject ? `：${verdict.subject}` : ''}`, 'ok')
  if (job.appearance && !R.appearance) {
    job.appearance = false
    log(job, `「${R.label}」不需要真实外观模型（形状由引擎精确生成），跳过 Tripo`)
  }

  // 1 转写
  job.stage = 'transcribe'
  log(job, `逐页转写 ${input.pages.length} 页`)
  const transcript = await call<Json>([
    { role: 'system', content: transcribeSystem(route) },
    { role: 'user', content: [{ type: 'text', text: `${TRANSCRIBE_LEAD} ${input.pages.length} 页${input.fileName ? `，文件名 ${input.fileName}` : ''}，分流为「${R.label}」。${hint}` }, ...pageParts('high')] },
  ], '转写')
  dump('transcript.json', transcript)
  job.name = transcript.product?.name
  const unsupported = Object.values(transcript).flatMap((v) => (v && typeof v === 'object' && Array.isArray((v as Json).unsupported) ? (v as Json).unsupported : []))
    .concat(Array.isArray(transcript.unsupported) ? transcript.unsupported : [])
  log(job, `识别为「${job.name ?? verdict.subject ?? '未知'}」· ${transcript.rows?.length ?? 0} 条指令 · ${transcript.entities?.length ?? 0} 个实体 · ${transcript.guides?.length ?? 0} 个指南${unsupported.length ? ` · ${unsupported.length} 处引擎做不了、会简化` : ''}`, 'ok')

  // 2 写场景脚本
  job.stage = 'author'
  const system = systemFor(route, lib.examples[route], lib.categories)
  log(job, `按 ${R.skill} skill 建模、写指南与步骤`)
  const draft = await call<Json>([
    { role: 'system', content: system },
    { role: 'user', content: [{ type: 'text', text: '逐页转写：\n' + JSON.stringify(transcript) }, ...pageParts('low'), { type: 'text', text: authorTask(route) + hint }] },
  ], '写脚本')
  const id = pickId(draft, transcript, lib.ids)
  // 外观流程挂的模型：每次补丁之后重新挂上（补丁整体替换零件时会把 model 丢掉）；复核可以改 rot / fit / crop，不能换 src、不能自己加
  let models: Record<string, Json> = {}
  let baked = new Set<string>()
  const dress = (s: Json) => {
    for (const p of s.parts) {
      const m = models[p.id]
      if (m) {
        p.model = p.model?.src === m.src ? { ...m, ...pick(p.model, ['rot', 'fit', 'crop', 'align']) } : m
        models[p.id] = p.model
      } else delete p.model
      if (baked.has(p.id) && models[p.parent]) p.baked = true
      else delete p.baked
    }
    return s
  }
  const tidy = (raw: Json) => dress(normalize(raw, transcript, id, input.pages.length, route))
  let spec = tidy(draft)
  log(job, `脚本：${spec.parts.length} 个零件 · ${spec.guides.length} 个指南 · ${spec.guides.reduce((n: number, g: Json) => n + (g.steps?.length ?? 0), 0)} 步`)
  dump('spec-0.json', spec)

  // 3 校验 + 审计 + 修复
  const repair = async (rounds: number, tag: string) => {
    for (let round = 1; ; round++) {
      alive()
      job.stage = 'check'
      await fitOrigamiCameras(server, spec)
      const r = await check(server, spec)
      dump(`${tag}-check-${round}.json`, r)
      job.problems = r.problems
      job.warnings = r.warnings
      if (!r.problems.length) {
        log(job, `审计通过${r.warnings.length ? `（${r.warnings.length} 条警告）` : ''}`, 'ok')
        return
      }
      log(job, `发现 ${r.problems.length} 个问题${round > rounds ? '，已到修复上限' : ''}`, 'warn')
      if (round > rounds) return
      job.stage = 'repair'
      job.detail = `第 ${round} / ${rounds} 轮`
      const patch = await call<Json>([
        { role: 'system', content: system },
        { role: 'user', content: '当前脚本：\n' + JSON.stringify(spec) + '\n\n' + repairTask([...r.problems, ...r.warnings.map((w) => '（警告）' + w)].slice(0, 80), round) },
      ], `修复第 ${round} 轮`)
      dump(`${tag}-patch-${round}.json`, patch)
      if (patch.notes) log(job, `修改：${patch.notes}`)
      spec = tidy(applyPatch(spec, patch))
    }
  }
  await repair(MAX_REPAIR, 'audit')

  // 4 保存
  alive()
  job.stage = 'save'
  save(spec, input, job, transcript)
  log(job, `已保存：${spec.id}`, 'ok')

  // 5 真实外观（Tripo）：失败不影响已经保存的几何体版本
  if (job.appearance) {
    job.stage = 'appearance'
    try {
      const r = await appearance({
        server, spec, pages: input.pages, photos: input.photos ?? [], work, system, max: maxModels, call, signal,
        log: (msg, level) => log(job, msg, level),
        detail: (text) => (job.detail = text),
      })
      alive()
      job.models = r.report
      job.credits = r.credits
      for (const m of r.report.filter((x) => !x.ok)) log(job, `外观模型 ${m.name} 没挂上：${m.note}`, 'warn')
      if (Object.keys(r.models).length) {
        const before = job.problems.length
        const attach = async (withBaked: boolean) => {
          models = structuredClone(r.models)
          baked = new Set(withBaked ? r.baked : [])
          const next = dress(structuredClone(spec))
          if (!next.finishes && r.finishes) next.finishes = r.finishes
          return { next, result: await check(server, next) }
        }
        let a = await attach(true)
        if (a.result.problems.length > before && r.baked.length) a = await attach(false)
        if (a.result.problems.length > before) {
          models = {}
          baked = new Set()
          log(job, `挂上外观模型后审计多出 ${a.result.problems.length - before} 个问题，先不挂：${a.result.problems[0]}`, 'warn')
        } else {
          spec = a.next
          job.problems = a.result.problems
          job.warnings = a.result.warnings
          save(spec, input, job, transcript)
          log(job, `外观模型已挂上：${Object.keys(models).length} 个零件${baked.size ? `（${baked.size} 个子零件 baked）` : ''} · Tripo ${r.credits} 积分`, 'ok')
        }
      }
    } catch (e) {
      if (signal.aborted) throw e
      log(job, `外观模型没有生成：${e instanceof Error ? e.message : e}`, 'warn')
    }
  }

  // 6 截图复核：还剩几个审计问题（穿插、穿地）也照样看，镜头、朝向这些只有截图看得出来；复核后问题变多才退回。
  // 脚本本身不合法（结构 / 编译错误）时页面打不开，跳过
  const broken = job.problems.some((p) => !p.startsWith('[') || /^\[(脚本校验|编译出错)\]/.test(p))
  if (input.review && broken) log(job, '脚本还有结构问题，跳过截图复核', 'warn')
  if (input.review && !broken) {
    job.stage = 'shoot'
    const out = join(work, 'shots')
    rmSync(out, { recursive: true, force: true })
    const ok = await shoot(spec.id, out, job, signal, Object.keys(models).length > 0)
    alive()
    const sheets = ok ? readdirSync(out).filter((f) => f.endsWith('-sheet.png')).sort() : []
    if (sheets.length) {
      job.stage = 'review'
      const images: Part[] = sheets.flatMap((f): Part[] => [
        { type: 'text', text: `联系表：${f.replace('-sheet.png', '')}` },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + readFileSync(join(out, f)).toString('base64'), detail: 'high' } },
      ])
      const patch = await call<Json>([
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: '当前脚本：\n' + JSON.stringify(spec) }, ...images, { type: 'text', text: route === 'manual' ? '说明书原页：' : `上传的原页（${R.label}）：` }, ...pageParts('low'), { type: 'text', text: reviewTaskFor(route, 1) }] },
      ], '视觉复核')
      dump('review-patch.json', patch)
      log(job, `复核：${patch.notes ?? '无说明'}`)
      if (hasChanges(patch)) {
        const before = spec
        const beforeProblems = job.problems
        const beforeWarnings = job.warnings
        spec = tidy(applyPatch(spec, patch))
        await repair(MAX_REVIEW_REPAIR, 'review')
        if (job.problems.length > beforeProblems.length) {
          // 复核改坏了就退回复核前的版本
          spec = before
          job.problems = beforeProblems
          job.warnings = beforeWarnings
          log(job, '复核后的修改让审计问题变多了，保留复核前的版本', 'warn')
        }
        save(spec, input, job, transcript)
      }
    } else log(job, '截图没有成功，跳过视觉复核', 'warn')
  }

  alive()
  dump('spec-final.json', spec)
  job.stage = 'done'
  job.status = 'done'
  log(job, job.problems.length ? `完成，但还有 ${job.problems.length} 个审计问题（画面可能有穿插）` : '完成', job.problems.length ? 'warn' : 'ok')
  logEvent(job.owner, 'import', `manual:${spec.id}`, spec.name)
}

// ---------- 库、校验、审计 ----------

async function loadLibrary(server: ViteDevServer) {
  const { MANUALS, CATEGORY_ORDER } = await server.ssrLoadModule('/src/domain/manual/library/index.ts')
  const { IMPORTED_CATEGORY } = await server.ssrLoadModule('/src/domain/manual/library/imported.ts')
  const ids = new Set<string>((MANUALS as Json[]).map((m) => m.id))
  for (const m of readIndex().manuals) ids.add(m.id)
  const byId = new Map((MANUALS as Json[]).map((m) => [m.id, m]))
  const mouse = byId.get('mouse-bt54') ?? (MANUALS as Json[])[0]
  // 样板里去掉要模型别写的字段：source 由服务器填，外观模型由外观流程生成；
  // 折纸镜头只留 dir（导入时服务器按纸的形状补 target / dist），和要模型写的格式一致
  const sample = (route: Route) => JSON.stringify(ROUTES[route].examples.map((id) => byId.get(id)).filter(Boolean).map((m) => {
    const s = structuredClone(m) as Json
    delete s.source
    for (const p of s.parts ?? []) { delete p.model; delete p.baked }
    if (route === 'origami') for (const g of s.guides) for (const st of g.steps) st.camera = { dir: st.camera.dir }
    return s
  }))
  const examples = Object.fromEntries((Object.keys(ROUTES) as Route[]).map((r) => [r, r === 'manual' ? JSON.stringify(mouse) : sample(r)])) as Record<Route, string>
  const categories = (CATEGORY_ORDER as string[]).filter((c) => c !== IMPORTED_CATEGORY)
  return { ids, examples, categories }
}

const SHAPES: Record<string, string[]> = {
  box: ['size'], slab: ['w', 'd', 'h'], cylinder: ['r', 'h'], shell: ['w', 'l', 'h'], hole: ['w', 'h'],
  led: ['r'], screen: ['w', 'h'], text: ['text', 'size'], compound: ['items'], cable: ['from', 'to'],
  poly: ['points', 'h'], sheet: ['points'], gear: ['teeth', 'r', 'h'], origami: ['size', 'ops'],
}

/**
 * 折纸步骤的镜头只写了 dir（或缺 target / dist）时，按那一步纸折成的形状补上：模型算不出折过的纸在哪、多大。
 * 编译不过（折纸程序有错）时先给个能编译的缺省值，让审计把真正的错报出来
 */
async function fitOrigamiCameras(server: ViteDevServer, spec: Json) {
  const paper = (spec.parts ?? []).find((p: Json) => p?.shape?.type === 'origami')
  if (!paper) return
  const auto = (spec.guides ?? []).flatMap((g: Json) => (g.steps ?? [])
    .filter((s: Json) => !s.camera || s.camera.target === undefined || typeof s.camera.dist !== 'number')
    .map((s: Json) => ({ g, s })))
  if (!auto.length) return
  const dirOf = (c: Json) => (Array.isArray(c?.dir) && c.dir.length === 3 && c.dir.every(Number.isFinite) ? c.dir : [0.35, 1, 0.75])
  const size = [paper.shape.size].flat().map(Number).filter(Number.isFinite)
  for (const { s } of auto) s.camera = { target: paper.id, dir: dirOf(s.camera), dist: Math.round(Math.max(150, ...size) * 3) }
  try {
    const { compileManual } = await server.ssrLoadModule('/src/domain/manual/compile.ts')
    const { origamiOf, origamiView } = await server.ssrLoadModule('/src/domain/manual/origami.ts')
    const d = origamiOf(paper.shape)
    if (d.errors.length) return
    const { guides } = compileManual(spec)
    for (const { g, s } of auto) {
      const to = guides.find((x: Json) => x.id === g.id)?.steps.find((x: Json) => x.id === s.id)?.scene.to[paper.id]
      if (to) s.camera = origamiView(d, to.fold, s.camera.dir, { pos: to.pos, quat: to.quat })
    }
  } catch {
    // 编译错误交给 check() 报
  }
}

function shapeIssues(shape: Json, where: string): string[] {
  if (!shape || typeof shape !== 'object') return [`${where} 缺少 shape`]
  const need = SHAPES[shape.type]
  if (!need) return [`${where} 的 shape.type「${shape.type}」不存在（可选：${Object.keys(SHAPES).join(' / ')}）`]
  const out = need.filter((k) => shape[k] === undefined).map((k) => `${where} 的 ${shape.type} 缺少 ${k}`)
  if (shape.type === 'box' && !(Array.isArray(shape.size) && shape.size.length === 3)) out.push(`${where} 的 box.size 要写 [x, y, z]`)
  if (shape.type === 'origami' && !Array.isArray(shape.ops)) out.push(`${where} 的 origami.ops 要是 op 数组`)
  if ((shape.type === 'poly' || shape.type === 'sheet') && !(Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.every((p: unknown) => Array.isArray(p) && p.length === 2)))
    out.push(`${where} 的 ${shape.type}.points 要是至少 3 个 [x, z] 顶点`)
  if (shape.type === 'compound') (shape.items ?? []).forEach((it: Json, i: number) => out.push(...shapeIssues(it, `${where}.items[${i}]`)))
  return out
}

/** 编译前的结构检查：模型偶尔漏字段，直接编译会抛异常，不如把缺什么告诉它 */
function structure(spec: Json): string[] {
  const out: string[] = []
  if (!Array.isArray(spec.parts) || !spec.parts.length) out.push('parts 为空')
  if (!Array.isArray(spec.guides) || !spec.guides.length) out.push('guides 为空')
  for (const p of spec.parts ?? []) {
    if (!p.id || !p.name) out.push(`零件缺少 id 或 name：${JSON.stringify(p).slice(0, 80)}`)
    out.push(...shapeIssues(p.shape, `零件 ${p.id}`))
  }
  for (const g of spec.guides ?? []) {
    if (!['usage', 'assembly', 'repair'].includes(g.kind)) out.push(`指南 ${g.id} 的 kind 只能是 usage / assembly / repair`)
    if (!Array.isArray(g.steps)) {
      out.push(`指南 ${g.id} 缺少 steps`)
      continue
    }
    for (const s of g.steps) {
      const c = s.camera
      if (!c || c.target === undefined || c.dir === undefined || typeof c.dist !== 'number') out.push(`${g.id} / ${s.id}：camera 要写 { target, dir, dist }`)
      if (!s.title || !s.desc) out.push(`${g.id} / ${s.id}：缺少 title 或 desc`)
    }
  }
  return out
}

async function check(server: ViteDevServer, spec: Json): Promise<{ problems: string[]; warnings: string[] }> {
  const shape = structure(spec)
  if (shape.length) return { problems: shape, warnings: [] }
  const { compileManual } = await server.ssrLoadModule('/src/domain/manual/compile.ts')
  const { auditManual, CHECKS } = await server.ssrLoadModule('/src/domain/manual/audit.ts')
  try {
    const { model, guides } = compileManual(spec)
    const issues: string[] = [...model.issues]
    for (const g of guides) {
      for (const [i, s] of g.steps.entries()) {
        if (![...s.focus, s.view.dist, ...s.view.dir].every(Number.isFinite)) issues.push(`${g.id} #${i + 1} ${s.id}：镜头参数不是有效数字`)
        if (!Object.values(s.scene.to).some((f: any) => f.visible)) issues.push(`${g.id} #${i + 1} ${s.id}：没有可见零件`)
      }
    }
    if (issues.length) return { problems: issues.map((m) => '[脚本校验] ' + m), warnings: [] }
    const report = auditManual(model, guides)
    const label = (id: string) => (CHECKS as { id: string; label: string }[]).find((c) => c.id === id)?.label ?? id
    const line = (f: Json) => `[${label(f.check)}] ${f.guide} 第 ${f.steps.join(',')} 步：${f.message}`
    return {
      problems: report.findings.filter((f: Json) => f.severity === 'error').map(line),
      warnings: report.findings.filter((f: Json) => f.severity === 'warn').map(line),
    }
  } catch (e) {
    return { problems: [`[编译出错] ${(e as Error).message}`], warnings: [] }
  }
}

// ---------- 脚本整理与补丁 ----------

const slug = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

function pickId(raw: Json, transcript: Json, taken: Set<string>) {
  let id = slug(raw.id) || slug(transcript.product?.idHint) || 'manual'
  if (!/^[a-z]/.test(id)) id = 'm-' + id
  let unique = id
  for (let n = 2; taken.has(unique); n++) unique = `${id}-${n}`
  return unique
}

function normalize(raw: Json, transcript: Json, id: string, pages: number, route: Route): Json {
  const spec: Json = { ...raw, id }
  spec.name ||= transcript.product?.name || (route === 'manual' ? '导入的说明书' : '导入的演示')
  spec.desc ||= transcript.product?.desc || ''
  const fixed = ROUTES[route].category
  const named = [spec.category, transcript.product?.category, transcript.plan?.category].find((c) => typeof c === 'string' && c.trim() && c.trim().length <= 8)
  spec.category = fixed ?? named?.trim() ?? '其他'
  if (route === 'manual') delete spec.genre
  else if (ROUTES[route].category || spec.genre !== 'manual') spec.genre = 'tutorial'
  // 模型在别的链路里也可能用了折纸程序：按折纸处理品类和镜头
  const origami = Array.isArray(spec.parts) && spec.parts.some((p: Json) => p?.shape?.type === 'origami')
  if (origami) {
    spec.category = '折纸'
    spec.genre = 'tutorial'
  }
  const d = spec.dims ?? transcript.dims ?? {}
  spec.dims = { width: Number(d.width) || 0, depth: Number(d.depth) || 0, height: Number(d.height) || 0 }
  spec.package = Array.isArray(spec.package) ? spec.package : transcript.package ?? []
  spec.params = Array.isArray(spec.params) ? spec.params : transcript.params ?? []
  spec.parts = Array.isArray(spec.parts) ? spec.parts : []
  spec.guides = Array.isArray(spec.guides) ? spec.guides : []
  // 缺了标题或镜头的步骤（补丁漏写）补个能用的默认值：保存下来的草稿至少能打开，不会让页面报错
  const root = spec.parts.find((p: Json) => p?.id && !p.parent)?.id ?? spec.parts[0]?.id
  const span = Math.max(spec.dims.width, spec.dims.depth, spec.dims.height) || 300
  for (const g of spec.guides) for (const s of g.steps ?? []) {
    if (typeof s.page === 'number') s.page = Math.min(Math.max(1, Math.round(s.page)), pages)
    s.title ||= s.desc || s.id
    s.desc ||= s.title
    const c = s.camera
    // 折纸的镜头由 fitOrigamiCameras 按纸的形状补
    if (root && !origami && (!c || c.target === undefined || c.dir === undefined || typeof c.dist !== 'number')) {
      s.camera = { target: c?.target ?? (Array.isArray(s.highlight) ? s.highlight[0] : undefined) ?? root, dir: c?.dir ?? [0.5, 0.45, 1], dist: typeof c?.dist === 'number' ? c.dist : Math.round(span * 2.4) }
    }
  }
  return spec
}

/** 按 id 合并：补丁只写了要改的字段时，别的字段（title、camera、shape…）不会丢；值写 null 表示删掉这个字段 */
function merge<T extends Json>(old: T | undefined, item: T): T {
  const out: Json = old ? { ...old, ...item } : { ...item }
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k]
  return out as T
}

function upsert<T extends Json>(list: T[], item: T, after?: string) {
  const i = list.findIndex((x) => x.id === item.id)
  if (i >= 0) list[i] = merge(list[i], item)
  else {
    const j = after ? list.findIndex((x) => x.id === after) : -1
    if (j >= 0) list.splice(j + 1, 0, item)
    else list.push(item)
  }
}

const pick = (o: Json, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

const hasChanges = (p: Json) => ['parts', 'removeParts', 'initial', 'guides', 'steps', 'removeSteps', 'top'].some((k) => p[k] && (!Array.isArray(p[k]) || p[k].length))

const TOP_FIELDS = ['name', 'desc', 'category', 'dims', 'stageSize', 'package', 'params', 'notes']

export function applyPatch(spec: Json, patch: Json): Json {
  const s: Json = structuredClone(spec)
  for (const k of TOP_FIELDS) if (patch.top?.[k] !== undefined) s[k] = patch.top[k]
  if (Array.isArray(patch.removeParts)) s.parts = s.parts.filter((p: Json) => !patch.removeParts.includes(p.id))
  for (const p of patch.parts ?? []) if (p?.id) upsert(s.parts, p)
  if (patch.initial && typeof patch.initial === 'object') s.initial = patch.initial
  for (const g of patch.guides ?? []) {
    if (!g?.id) continue
    // 指南按补丁里的步骤列表重排 / 删步，列出的每一步再和原来同 id 的步骤合并
    const old = s.guides.find((x: Json) => x.id === g.id)
    const steps = Array.isArray(g.steps) ? g.steps.filter((st: Json) => st?.id).map((st: Json) => merge(old?.steps?.find((o: Json) => o.id === st.id), st)) : old?.steps
    upsert(s.guides, { ...g, steps })
  }
  for (const r of patch.removeSteps ?? []) {
    const g = s.guides.find((x: Json) => x.id === r.guide)
    if (g) g.steps = g.steps.filter((st: Json) => st.id !== r.id)
  }
  for (const r of patch.steps ?? []) {
    const g = s.guides.find((x: Json) => x.id === r.guide)
    if (g && r.step?.id) upsert(g.steps, r.step, r.after)
  }
  return s
}

// ---------- 保存 ----------

function save(spec: Json, input: JobInput, job: Job, transcript: Json) {
  const dir = join(IMPORT_DIR, spec.id)
  mkdirSync(dir, { recursive: true })
  const label = (i: number) => input.pageNumbers?.[i] ?? i + 1
  const images: { src: string; pages: string }[] = []
  if (input.showPages) {
    for (const f of existsSync(dir) ? readdirSync(dir) : []) if (/^p\d+\.jpg$/.test(f)) rmSync(join(dir, f))
    input.pages.forEach((url, i) => {
      const name = `p${String(i + 1).padStart(2, '0')}.jpg`
      writeFileSync(join(dir, name), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
      images.push({ src: `/imported/${spec.id}/${name}`, pages: `第 ${label(i)} 页${input.pageNotes?.[i] ? ` · ${input.pageNotes[i]}` : ''}` })
    })
  }
  // 模型写的 page 是上传顺序；存盘时换成原文件页码（内存里的 spec 不动，复核还要按上传顺序对页）
  const guides = spec.guides.map((g: Json) => ({ ...g, steps: g.steps.map((s: Json) => (typeof s.page === 'number' ? { ...s, page: label(s.page - 1) } : s)) }))
  const title = input.source?.title ?? (input.fileName ? `用户上传：${input.fileName}` : job.route?.verdict === 'manual' ? '用户上传的说明书' : '用户上传的资料')
  const out = { ...spec, guides, source: { title, ...(input.source?.url ? { url: input.source.url } : {}), images }, imported: { job: job.id, model: job.model, at: new Date().toISOString() } }
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(out, null, 2))
  const index = readIndex()
  index.manuals = index.manuals.filter((m) => m.id !== spec.id)
  index.manuals.push({ id: spec.id, name: spec.name, created: new Date().toISOString(), job: job.id, owner: job.owner })
  writeIndex(index)
  job.manualId = spec.id
  job.name = spec.name
  job.summary = {
    pages: input.pages.length,
    parts: spec.parts.length,
    guides: spec.guides.map((g: Json) => ({ title: g.title, kind: g.kind, steps: g.steps.length })),
    inferred: Array.isArray(transcript.inferred) ? transcript.inferred.map(String) : [],
  }
}

/** 只在清单里标删除，文件留着给管理员看（imports.ts 里删了的只有管理员看得到） */
export function deleteImported(id: string, me: Me) {
  if (!/^[a-z0-9-]+$/.test(id)) return false
  const index = readIndex()
  const entry = index.manuals.find((m) => m.id === id)
  if (!entry || entry.deleted || !mayEdit(entry, me)) return false
  entry.deleted = new Date().toISOString()
  entry.deletedBy = me.id
  writeIndex(index)
  logEvent(me.id, 'import_delete', `manual:${id}`, entry.name)
  return true
}

// ---------- 截图 ----------

/** 截图脚本这么久没有新输出就当卡死（无头 Chrome 偶尔不回 CDP 消息）：杀掉、跳过视觉复核，任务照常结束 */
const SHOOT_IDLE_MS = 5 * 60 * 1000

function shoot(id: string, out: string, job: Job, signal: AbortSignal, real: boolean): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve('scripts/shoot-manuals.mjs'), id, '--out', out, ...(real ? ['--real'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] })
    let n = 0
    let problem = ''
    let stalled = false
    const kill = () => {
      child.kill('SIGTERM')
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 5000).unref()
    }
    let idle: ReturnType<typeof setTimeout> | undefined
    const watch = () => {
      clearTimeout(idle)
      idle = setTimeout(() => ((stalled = true), kill()), SHOOT_IDLE_MS)
    }
    watch()
    child.stdout.on('data', (b: Buffer) => {
      watch()
      n += (b.toString().match(/ → /g) ?? []).length
      problem ||= b.toString().match(/✗ (.*)/)?.[1] ?? ''
      job.detail = `已截 ${n} 张`
    })
    child.stderr.on('data', (b: Buffer) => (problem ||= b.toString().split('\n').find((l) => /Error|错/.test(l))?.trim().slice(0, 200) ?? ''))
    signal.addEventListener('abort', kill)
    child.on('exit', (code) => {
      clearTimeout(idle)
      signal.removeEventListener('abort', kill)
      job.detail = undefined
      if (signal.aborted) return done(false)
      if (stalled) {
        log(job, `截图卡住了（截到 ${n} 张后 ${SHOOT_IDLE_MS / 60000} 分钟没动静），跳过视觉复核`, 'warn')
        return done(false)
      }
      log(job, code === 0 ? `截图 ${n} 张` : `截图 ${n} 张，但截图脚本退出码 ${code}${problem ? `：${problem}` : ''}`, code === 0 ? 'info' : 'warn')
      done(code === 0 || existsSync(out))
    })
  })
}
