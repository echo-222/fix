// 网页导入流水线的「真实外观」阶段：manual-to-3d skill 第 10 步的自动版。
//   AI 选零件、定参考图（产品照片 > 说明书里的产品图 > 文字描述）→ 服务器裁图、涂白、抹平要保持几何体的按键 / 屏幕 → scripts/tripo.mjs 生成 + 本地减面
//   → 六向图交给 AI 认正面和顶面 → 换算 rot、按包围盒比例选 fit → 交给流水线挂到零件的 model 上。
// 中间产物在 IMPORT_WORK_DIR/<job>/appearance/，成品 GLB 在 IMPORT_DIR/<id>/models/（见 imports.ts）。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import jpeg from 'jpeg-js'
import type { ViteDevServer } from 'vite'
import { IMPORT_DIR } from './imports.ts'
import type { Message, Part } from './llm.ts'
import { ORIENT_TASK, appearanceTask } from './manualSkill.ts'
import { coverBox } from './refImage.ts'

type Json = Record<string, any>
type Vec = [number, number, number]
type Box = [number, number, number, number]

const AXES: Record<string, Vec> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] }
/** 这些形体是功能件，保留几何体（编译器也会拦） */
const NO_MODEL = ['hole', 'led', 'screen', 'text', 'cable']
const NO_BAKE = ['led', 'screen', 'cable']
const FINISH_NAMES = ['plastic-white', 'plastic-grey', 'plastic-black', 'rubber', 'board-white', 'fiberboard', 'wood', 'cardboard', 'paper', 'wall', 'steel', 'zinc', 'hole']

export const tripoReady = (env: Record<string, string>) => !!env.TRIPO_API_KEY

export interface AppearanceCtx {
  server: ViteDevServer
  spec: Json
  pages: string[]
  photos: string[]
  /** manuals-src/imports/<job> */
  work: string
  /** 和写脚本同一份系统提示词（服务商前缀缓存） */
  system: string
  max: number
  call: <T>(messages: Message[], label: string) => Promise<T>
  log: (msg: string, level?: 'info' | 'ok' | 'warn') => void
  detail: (text: string | undefined) => void
  signal: AbortSignal
}

export interface AppearanceModel {
  part: string
  name: string
  source: 'photo' | 'page' | 'text'
  ok: boolean
  note?: string
}

export interface AppearanceResult {
  /** 零件 id → model 字段 */
  models: Record<string, Json>
  baked: string[]
  finishes?: Json
  credits: number
  report: AppearanceModel[]
}

export async function appearance(ctx: AppearanceCtx): Promise<AppearanceResult> {
  const { spec, work } = ctx
  const dir = join(work, 'appearance')
  const out = join(IMPORT_DIR, spec.id, 'models')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'refs'), { recursive: true })
  const result: AppearanceResult = { models: {}, baked: [], credits: 0, report: [] }

  // 1 选件 + 参考图
  const detail = ctx.pages.length <= 12 ? 'high' : 'low'
  const plan = await ctx.call<Json>([
    { role: 'system', content: ctx.system },
    {
      role: 'user',
      content: [
        { type: 'text', text: '当前脚本：\n' + JSON.stringify(spec) },
        ...ctx.photos.flatMap((url, i): Part[] => [{ type: 'text', text: `产品照片 ${i + 1}` }, { type: 'image_url', image_url: { url, detail: 'high' } }]),
        ...ctx.pages.flatMap((url, i): Part[] => [{ type: 'text', text: `第 ${i + 1} 页` }, { type: 'image_url', image_url: { url, detail } }]),
        { type: 'text', text: appearanceTask(ctx.max, ctx.photos.length) },
      ],
    },
  ], '外观选件')
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
  if (plan.notes) ctx.log(`外观：${plan.notes}`)
  result.finishes = validFinishes(plan.finishes)

  const byId = new Map<string, Json>(spec.parts.map((p: Json) => [p.id, p]))
  const picked: (Json & { name: string; ref?: string; aspect?: number })[] = []
  for (const m of Array.isArray(plan.models) ? plan.models : []) {
    const part = byId.get(m?.part)
    if (!part || NO_MODEL.includes(part.shape?.type) || picked.some((x) => x.part === part.id)) continue
    if (picked.length >= ctx.max) break
    const name = String(part.id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || `part-${picked.length + 1}`
    const list = m.source === 'photo' ? ctx.photos : m.source === 'page' ? ctx.pages : []
    const url = list[Math.round(Number(m.image)) - 1]
    let ref: string | undefined
    let aspect: number | undefined
    const box = boxOf(m.box)
    // 整机照片里的小部件：模型框不准、裁出来也太糊，不如按文字生成
    const tiny = m.source === 'photo' && box && (box[2] - box[0]) * (box[3] - box[1]) < 0.05
    if (tiny) ctx.log(`${part.name}：在照片里太小（框只占 ${Math.round((box[2] - box[0]) * (box[3] - box[1]) * 100)}%），改用文字生成`)
    // 说明书页必须框出零件：整页（文字、表格、别的图）拿去生成只会得到一堆碎片
    if (url && !tiny && (m.source === 'photo' || box)) {
      try {
        // 产品照片背景干净，框可以多放几轮直到框全；说明书页旁边就是文字和别的图，只放一点
        const boxes = (v: unknown) => (Array.isArray(v) ? v : []).map(boxOf).filter((b: Box | null): b is Box => !!b)
        const [erase, cover] = [boxes(m.erase), boxes(m.cover)]
        const img = m.source === 'photo' ? referenceImage(url, box, erase, cover, 0.25, 2) : referenceImage(url, box, erase, cover, 0.08)
        if (img && m.source === 'photo' && img.fill !== undefined && img.fill < 0.12) {
          ctx.log(`${part.name}：照片里框到的几乎是空白（前景 ${Math.round(img.fill * 100)}%），改用文字生成`)
        } else if (img) {
          ref = resolve(dir, 'refs', `${name}.jpg`)
          aspect = img.aspect
          writeFileSync(ref, img.jpg)
        }
      } catch (e) {
        ctx.log(`${part.name}：参考图处理失败（${(e as Error).message}），改用文字生成`, 'warn')
      }
    }
    const prompt = String(m.prompt ?? '').trim().slice(0, 900)
    if (!ref && !prompt) continue
    picked.push({ ...m, part: part.id, name, ref, aspect, prompt, source: ref ? m.source : 'text' })
  }
  if (!picked.length) {
    ctx.log('没有适合生成外观模型的零件', 'warn')
    return result
  }
  ctx.log(`生成 ${picked.length} 个外观模型：${picked.map((m) => `${byId.get(m.part)!.name}（${m.source === 'text' ? '文字' : m.source === 'photo' ? '产品照片' : `第 ${m.image} 页的图`}）`).join('、')}`)

  // 2 Tripo 生成 + 本地减面（scripts/tripo.mjs，和手工流程同一份脚本）
  const jobs = picked.map((m) => ({
    name: m.name,
    steps: [
      m.ref
        ? { type: 'image-to-model', image: m.ref, texture: true, pbr: true, texture_quality: 'detailed' }
        : { type: 'text-to-model', prompt: m.prompt, texture: true, pbr: true },
      { type: 'optimize', ratio: 0.03, error: 0.001, texture_size: 1024 },
    ],
  }))
  writeFileSync(join(dir, 'tripo.json'), JSON.stringify({ jobs }, null, 2))
  const failures = await runTripo(spec.id, dir, out, ctx)
  const tlog: Json = existsSync(join(dir, 'tripo.log.json')) ? JSON.parse(readFileSync(join(dir, 'tripo.log.json'), 'utf8')) : {}
  result.credits = Object.values(tlog).reduce((n: number, e: any) => n + (Number(e?.credits) || 0), 0)
  const made = picked.filter((m) => tlog[m.name]?.done && existsSync(join(out, `${m.name}.glb`)))
  for (const m of picked) {
    if (!made.includes(m)) result.report.push({ part: m.part, name: m.name, source: m.source, ok: false, note: failures[m.name] ?? tlog[m.name]?.error ?? '没有生成出来' })
  }
  if (!made.length) return result

  // 3 六向图 → 认正面和顶面
  const views = join(dir, 'views')
  ctx.detail('截六向图')
  const shot = await runViews(made.map((m) => join(out, `${m.name}.glb`)), views, ctx.signal)
  const sheets = shot && existsSync(views) ? readdirSync(views) : []
  const sheetOf = (name: string) => sheets.find((f) => f.endsWith(`-${name}.png`))
  let orient: Json = {}
  if (made.some((m) => sheetOf(m.name))) {
    ctx.detail(undefined)
    const content: Part[] = made.flatMap((m): Part[] => {
      const sheet = sheetOf(m.name)
      if (!sheet) return []
      const part = byId.get(m.part)!
      return [
        { type: 'text', text: `模型「${m.name}」= 零件 ${m.part}（${part.name}）。参考：${m.ref ? '下面这张图' : `文字描述「${m.prompt}」`}` },
        ...(m.ref ? [{ type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,' + readFileSync(m.ref).toString('base64'), detail: 'low' as const } }] : []),
        { type: 'text', text: `模型「${m.name}」的六向图：` },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + readFileSync(join(views, sheet)).toString('base64'), detail: 'high' } },
      ]
    })
    const r = await ctx.call<Json>([{ role: 'system', content: ctx.system }, { role: 'user', content: [...content, { type: 'text', text: ORIENT_TASK }] }], '外观定向')
    writeFileSync(join(dir, 'orient.json'), JSON.stringify(r, null, 2))
    for (const o of Array.isArray(r.models) ? r.models : []) if (o?.name) orient[o.name] = o
  } else ctx.log('六向图没截成，按 Tripo 的默认朝向（正面 +x、顶面 +y）挂', 'warn')

  // 4 换算 rot / fit
  const { shapeBounds } = await ctx.server.ssrLoadModule('/src/domain/manual/audit.ts')
  for (const m of made) {
    const o = orient[m.name] ?? {}
    const part = byId.get(m.part)!
    if (o.ok === false) {
      result.report.push({ part: m.part, name: m.name, source: m.source, ok: false, note: `不像这个零件：${o.issue || '形状不对'}` })
      continue
    }
    const size = glbSize(join(out, `${m.name}.glb`))
    const pb = shapeBounds(part.shape)
    const proxy: Vec = [0, 1, 2].map((k) => pb.max[k] - pb.min[k]) as Vec
    // AI 给的轴和默认轴比一比，和参考图高宽比明显对不上就用默认（AI 偶尔把直立的零件说成躺着）
    const notes: string[] = []
    const frame = (front: unknown, up: unknown, df: string, du: string, dims: Vec | null): [Vec, Vec] => {
      const said: [Vec, Vec] = [axis(front, df), axis(up, du)]
      const def: [Vec, Vec] = [AXES[df], AXES[du]]
      if (dot(said[0], said[1]) !== 0) return def
      if (!m.aspect || !dims || (said[0] === def[0] && said[1] === def[1])) return said
      if (aspectMiss(dims, ...said, m.aspect) <= aspectMiss(dims, ...def, m.aspect) + 0.35) return said
      notes.push(`AI 说的朝向（正面 ${front}、顶面 ${up}）和参考图比例对不上，按默认`)
      return def
    }
    // 零件局部坐标按脚本约定正面 +z、顶面 +y；Tripo 图生模型的输出是参考图的正面朝 +x、顶面朝 +y（已有说明书 22 个模型大多是 rot [0, -90, 0]）
    const [pf, pu] = frame(m.front, m.up, '+z', '+y', proxy)
    const [mf, mu] = frame(o.front, o.up, '+x', '+y', size)
    const R = rotation(mf, mu, pf, pu)!
    const model: Json = { src: `/imported/${spec.id}/models/${m.name}.glb`, rot: euler(R) }
    if (size) {
      const turned = R.map((row) => row.reduce((n, v, k) => n + Math.abs(v) * size[k], 0))
      const ratios = [0, 1, 2].filter((k) => turned[k] > 1e-6 && proxy[k] > 1).map((k) => proxy[k] / turned[k])
      const spread = ratios.length > 1 ? Math.max(...ratios) / Math.min(...ratios) : 1
      // 比例差这么多基本是生成歪了（参考图框错、生成出碎片），AI 看六向图也常说 ok
      if (spread > 2.5) {
        result.report.push({ part: m.part, name: m.name, source: m.source, ok: false, note: `模型和零件的比例差 ${spread.toFixed(1)} 倍，多半生成歪了` })
        continue
      }
      model.fit = spread <= 1.15 || spread > 1.6 ? 'contain' : 'stretch'
      if (spread > 1.6) notes.push(`模型和代理形状的比例差 ${spread.toFixed(1)} 倍，等比放进去了`)
    }
    const note = notes.join('；') || undefined
    result.models[m.part] = model
    result.report.push({ part: m.part, name: m.name, source: m.source, ok: true, note })
  }

  // 5 一物一画：模型零件的每个直接子零件要么 baked（长在模型里，原位时不单独画），要么 geometry（几何体，参考图里已经抹平）。
  //   步骤里要按 / 转 / 晃的件不能 baked：原位时只有模型里那一份，动作看不到
  const acted = new Set<string>(spec.guides.flatMap((g: Json) => (g.steps ?? []).flatMap((s: Json) => (s.actions ?? []).map((a: Json) => a.part))))
  const bakeable = new Set(Object.keys(result.models))
  for (const m of made) {
    if (!bakeable.has(m.part)) continue
    const said = new Set([...(Array.isArray(m.baked) ? m.baked : []), ...(Array.isArray(m.geometry) ? m.geometry : [])])
    const loose = spec.parts.filter((p: Json) => p.parent === m.part && p.shape?.type !== 'cable' && !said.has(p.id))
    if (loose.length) ctx.log(`${byId.get(m.part)!.name}：没说 ${loose.map((p: Json) => p.name).join('、')} 在不在模型里，按几何体画（模型里也有的话会叠两层）`, 'warn')
    for (const id of Array.isArray(m.baked) ? m.baked : []) {
      const child = byId.get(id)
      if (!child || child.parent !== m.part || NO_BAKE.includes(child.shape?.type)) continue
      if (acted.has(id)) ctx.log(`${child.name} 在步骤里要按 / 转，保持几何体，不 baked`, 'warn')
      else result.baked.push(id)
    }
  }
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2))
  return result
}

// ---------- 参考图 ----------

/** [x0, y0, x1, y1]，0–1 比例；模型偶尔给像素坐标（> 1），按 1000 刻度兜底 */
function boxOf(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const s = v.some((n) => n > 1.5) ? 1000 : 1
  const [a, b, c, d] = v.map((n) => Math.min(1, Math.max(0, n / s)))
  const box: Box = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
  return box[2] - box[0] > 0.02 && box[3] - box[1] > 0.02 ? box : null
}

type Img = { width: number; height: number; data: Uint8Array }
type Rect = [number, number, number, number]

/**
 * 按框裁出零件、把 erase 涂白，补成白底正方形（四周留白），缩放到 1024–2048 px 的 JPEG。
 * 模型给的框常常偏紧或偏松：背景是一片纯色（白底照片、说明书白纸）时，先把框往外放 grow（按框自身宽高的比例），再收紧到前景像素的范围；
 * 前景还顶着边就再放 rounds 次。按框的比例放，小零件不会一路长成整机。aspect 是最终裁出来的高 / 宽，用来核对朝向。
 */
/** erase：涂成白底（产品外面的引线、箭头、手）；cover：用周围外壳的颜色抹平（产品表面上要保持几何体的按键、屏幕） */
export function referenceImage(url: string, box: Box | null, erase: Box[], cover: Box[], grow = 0, rounds = 0): { jpg: Buffer; aspect: number; fill?: number } | null {
  const src: Img = jpeg.decode(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
  const W = src.width
  const H = src.height
  for (const [a, c, d, e] of cover) coverBox(src, [a * W, c * H, d * W, e * H])
  const holes = erase.map(([a, c, d, e]) => [a * W, c * H, d * W, e * H])
  const b = box ?? [0, 0, 1, 1]
  const pad = box ? 0.015 : 0
  const rect = (g: number): Rect => {
    const [mx, my] = [pad + g * (b[2] - b[0]), pad + g * (b[3] - b[1])]
    return [Math.max(0, Math.floor((b[0] - mx) * W)), Math.max(0, Math.floor((b[1] - my) * H)), Math.min(W, Math.ceil((b[2] + mx) * W)), Math.min(H, Math.ceil((b[3] + my) * H))]
  }
  let area = rect(grow)
  let fg = trim(src, area, holes)
  for (let i = 0; fg && grow && i < rounds; i++) {
    const [gx, gy] = [Math.round(grow * (b[2] - b[0]) * W), Math.round(grow * (b[3] - b[1]) * H)]
    const next: Rect = [
      fg[0] === area[0] ? Math.max(0, area[0] - gx) : area[0],
      fg[1] === area[1] ? Math.max(0, area[1] - gy) : area[1],
      fg[2] === area[2] ? Math.min(W, area[2] + gx) : area[2],
      fg[3] === area[3] ? Math.min(H, area[3] + gy) : area[3],
    ]
    if (next.every((v, k) => v === area[k])) break
    area = next
    fg = trim(src, area, holes) ?? fg
  }
  fg ??= grow ? trim(src, rect(0), holes) : null
  const [x0, y0, x1, y1] = fg ?? rect(0)
  const w = x1 - x0
  const h = y1 - y0
  if (w < 48 || h < 48) return null
  const side = Math.max(w, h) * 1.12
  const n = Math.round(Math.min(2048, Math.max(1024, side)))
  const k = side / n
  const ox = x0 - (side - w) / 2
  const oy = y0 - (side - h) / 2
  const data = new Uint8Array(n * n * 4).fill(255)
  const px = src.data
  for (let j = 0; j < n; j++) {
    const sy = oy + (j + 0.5) * k - 0.5
    if (sy < y0 || sy > y1 - 1) continue
    for (let i = 0; i < n; i++) {
      const sx = ox + (i + 0.5) * k - 0.5
      if (sx < x0 || sx > x1 - 1) continue
      if (holes.some(([a, c, d, e]) => sx >= a && sx <= d && sy >= c && sy <= e)) continue
      const fx = Math.floor(sx)
      const fy = Math.floor(sy)
      const tx = sx - fx
      const ty = sy - fy
      const fx1 = Math.min(fx + 1, W - 1)
      const fy1 = Math.min(fy + 1, H - 1)
      const o = (j * n + i) * 4
      for (let c = 0; c < 3; c++) {
        const p00 = px[(fy * W + fx) * 4 + c]
        const p10 = px[(fy * W + fx1) * 4 + c]
        const p01 = px[(fy1 * W + fx) * 4 + c]
        const p11 = px[(fy1 * W + fx1) * 4 + c]
        data[o + c] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty
      }
    }
  }
  return { jpg: Buffer.from(jpeg.encode({ width: n, height: n, data }, 92).data), aspect: h / w, fill: fg?.fill }
}

/**
 * 区域边缘大多是同一种颜色（背景）时，返回区域里和背景色差得多的像素的包围框（外扩 2%），fill 是框里前景像素的占比；
 * 背景杂（实拍场景）、或零件撑满了边缘，返回 null，照原框裁。
 */
function trim(img: Img, [x0, y0, x1, y1]: Rect, holes: number[][]): (Rect & { fill: number }) | null {
  const { width: W, data } = img
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 400))
  if (x1 - x0 < step * 8 || y1 - y0 < step * 8) return null
  const rgb = (x: number, y: number) => [data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]]
  const edge: number[][] = []
  for (let x = x0; x < x1; x += step) edge.push(rgb(x, y0), rgb(x, y1 - 1))
  for (let y = y0; y < y1; y += step) edge.push(rgb(x0, y), rgb(x1 - 1, y))
  const bg = [0, 1, 2].map((c) => edge.map((p) => p[c]).sort((a, z) => a - z)[edge.length >> 1])
  const far = (p: number[]) => Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > 40
  if (edge.filter(far).length > edge.length * 0.3) return null
  const cols = new Map<number, number>()
  const rows = new Map<number, number>()
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (!far(rgb(x, y)) || holes.some(([a, c, d, e]) => x >= a && x <= d && y >= c && y <= e)) continue
      cols.set(x, (cols.get(x) ?? 0) + 1)
      rows.set(y, (rows.get(y) ?? 0) + 1)
    }
  }
  // 至少 2 个采样点才算，免得一个噪点把框撑大
  const xs = [...cols].filter(([, n]) => n >= 2).map(([x]) => x)
  const ys = [...rows].filter(([, n]) => n >= 2).map(([y]) => y)
  if (!xs.length || !ys.length) return null
  const [a, c, d, e] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) + step, Math.max(...ys) + step]
  if ((d - a) * (e - c) < (x1 - x0) * (y1 - y0) * 0.02) return null
  const m = Math.round(Math.max(d - a, e - c) * 0.02)
  const hits = [...cols.values()].reduce((n, v) => n + v, 0)
  const rect: Rect = [Math.max(x0, a - m), Math.max(y0, c - m), Math.min(x1, d + m), Math.min(y1, e + m)]
  return Object.assign(rect, { fill: hits / Math.max(1, ((d - a) / step) * ((e - c) / step)) })
}

// ---------- 子进程：Tripo、六向图 ----------

function runTripo(id: string, dir: string, out: string, ctx: AppearanceCtx): Promise<Record<string, string>> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve('scripts/tripo.mjs'), id, '--dir', dir, '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] })
    const progress = new Map<string, string>()
    const failures: Record<string, string> = {}
    const lines = (b: Buffer) => b.toString().split('\n').map((l) => l.trim()).filter(Boolean)
    child.stdout.on('data', (b: Buffer) => {
      for (const l of lines(b)) {
        const run = l.match(/^([a-z0-9-]+) #\d+ [\w-]+\s+(\w+) (\d+)%/)
        if (run) progress.set(run[1], run[2] === 'success' ? '减面' : `${run[3]}%`)
        const fin = l.match(/^([a-z0-9-]+)\s+完成/)
        if (fin) progress.set(fin[1], '完成')
      }
      ctx.detail([...progress].map(([n, s]) => `${n} ${s}`).join(' · ') || '提交中')
    })
    child.stderr.on('data', (b: Buffer) => {
      for (const l of lines(b)) {
        const bad = l.match(/^([a-z0-9-]+)\s+失败：(.*)$/)
        if (bad) failures[bad[1]] = bad[2]
        else if (/未配置|余额|HTTP \d{3}/.test(l)) ctx.log(`Tripo：${l}`, 'warn')
      }
    })
    const kill = () => child.kill('SIGTERM')
    ctx.signal.addEventListener('abort', kill)
    child.on('exit', () => {
      ctx.signal.removeEventListener('abort', kill)
      ctx.detail(undefined)
      done(failures)
    })
  })
}

function runViews(files: string[], out: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve('scripts/model-views.mjs'), ...files, '--out', out], { stdio: 'ignore' })
    const kill = () => child.kill('SIGTERM')
    signal.addEventListener('abort', kill)
    child.on('exit', (code) => {
      signal.removeEventListener('abort', kill)
      done(code === 0)
    })
  })
}

// ---------- 朝向与尺寸 ----------

const axis = (v: unknown, fallback: string): Vec => AXES[String(v ?? '').trim().toLowerCase()] ?? AXES[fallback]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** 参考图的高宽比和尺寸在「顶面轴 : 右手轴」上的比差多少（取对数，0 = 完全吻合） */
export function aspectMiss(dims: Vec, front: Vec, up: Vec, aspect: number) {
  const ext = (v: Vec) => v.reduce((n, c, k) => n + Math.abs(c) * dims[k], 0)
  const w = ext(cross(up, front))
  const h = ext(up)
  return w > 1e-6 && h > 1e-6 ? Math.abs(Math.log(h / w / aspect)) : 0
}

/** 把模型的（正面, 顶面）转到零件的（正面, 顶面）的旋转矩阵；两根轴平行时返回 null */
export function rotation(mf: Vec, mu: Vec, pf: Vec, pu: Vec): number[][] | null {
  if (dot(mf, mu) !== 0 || dot(pf, pu) !== 0) return null
  const M = [mf, mu, cross(mf, mu)]
  const P = [pf, pu, cross(pf, pu)]
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => M.reduce((n, m, k) => n + P[k][i] * m[j], 0)))
}

/** 旋转矩阵 → XYZ 欧拉角（度），和 three.js Euler.setFromRotationMatrix 一致 */
export function euler(R: number[][]): Vec {
  const y = Math.asin(Math.max(-1, Math.min(1, R[0][2])))
  const [x, z] = Math.abs(R[0][2]) < 0.9999999 ? [Math.atan2(-R[1][2], R[2][2]), Math.atan2(-R[0][1], R[0][0])] : [Math.atan2(R[2][1], R[1][1]), 0]
  return [x, y, z].map((a) => Math.round((a * 180) / Math.PI) + 0) as Vec
}

/** GLB 整体包围盒尺寸（按节点变换），读 POSITION 访问器的 min / max */
export function glbSize(file: string): Vec | null {
  const buf = readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'glTF') return null
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)))
  const lo: Vec = [Infinity, Infinity, Infinity]
  const hi: Vec = [-Infinity, -Infinity, -Infinity]
  const visit = (idx: number, parent: number[]) => {
    const n = gltf.nodes[idx]
    const m = mul(parent, trs(n))
    if (n.mesh !== undefined) {
      for (const p of gltf.meshes[n.mesh].primitives) {
        const { min, max } = gltf.accessors[p.attributes.POSITION]
        if (!min || !max) continue
        for (let c = 0; c < 8; c++) {
          const v = apply(m, [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]])
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], v[k])
            hi[k] = Math.max(hi[k], v[k])
          }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m)
  }
  for (const r of gltf.scenes[gltf.scene ?? 0].nodes) visit(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  return Number.isFinite(lo[0]) ? (hi.map((v, k) => v - lo[k]) as Vec) : null
}

function mul(a: number[], b: number[]) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}

function trs(n: Json): number[] {
  if (n.matrix) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

const apply = (m: number[], [x, y, z]: number[]): Vec => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]

function validFinishes(v: unknown): Json | undefined {
  if (!v || typeof v !== 'object') return undefined
  const out: Json = {}
  for (const [fill, f] of Object.entries(v as Json)) {
    if (!['white', 'warm', 'shade', 'dark'].includes(fill)) continue
    if (typeof f === 'string' && FINISH_NAMES.includes(f)) out[fill] = f
    else if (f && typeof f === 'object' && /^#[0-9a-f]{6}$/i.test(String((f as Json).color))) out[fill] = f
  }
  return Object.keys(out).length ? out : undefined
}
