import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { Chip as StepChip, Guide, ModelBase, Q4, Step, V3 } from '../types'
import { origamiBounds, origamiOf } from './origami'
import { shellTopY, type ShellShape } from './shell'
import {
  FINISHES,
  type Action, type Callout, type CameraSpec, type Fill, type Finish, type Light, type ManualSpec, type OnSurface, type PartModel, type PartState,
  type ScreenUI, type Shape, type SpecGuide, type SpecPart, type Vec3, type ViewName,
} from './types'

export interface PartFrame {
  parent: string | null
  pos: Vec3
  quat: Q4
  visible: boolean
  light: Light
  color: string
  ui: ScreenUI | null
  /** sheet 各条边的画法（见 PartState.edges），null = 全部黑线 */
  edges: string | null
  /** origami 折到第几步 */
  fold: number
  /** 插在哪个接口（hole id），由 plug 写入，换父级 / 移动时清空 */
  plugged: string | null
  lift: number
  via: Vec3 | null
  /** 过渡时绕这个点（父零件局部坐标）转过去 */
  arc: NonNullable<PartState['arc']> | null
  delay: number
  dur: number
  /** 世界矩阵（列主序 16 个数），换父级时用来做世界空间插值 */
  world: number[]
}
export type Frame = Record<string, PartFrame>

export interface SceneStep {
  from: Frame
  to: Frame
  highlight: string[]
  actions: Action[]
  callouts: Callout[]
  zoom?: { focus: V3; dir: V3; dist: number; caption: string }
}

export interface ScenePart {
  id: string
  name: string
  spec?: string
  shape: Shape
  pivot?: Vec3
  fill?: Fill
  finish?: Finish
  model?: PartModel
  /** baked 零件的原位（spec 里写的父级 / 位置 / 姿态）：两端都在这里、这一步也没动时不单独画，否则父零件这一步画代理形状 */
  rest?: { parent: string | null; pos: Vec3; quat: Q4 }
}

/** 有外观模型或写了材质：「真实材质」开关才有区别 */
export function hasRealLook(model: { spec: ManualSpec; scene: { parts: ScenePart[] } }): boolean {
  return !!model.spec.finishes || model.scene.parts.some((p) => p.model || p.finish || (p.shape.type === 'compound' && p.shape.items.some((it) => it.finish)))
}

export interface ManualModel extends ModelBase {
  product: `manual:${string}`
  spec: ManualSpec
  /** 零件按父子关系排好序（父在前） */
  scene: { parts: ScenePart[]; stageSize: number }
  issues: string[]
}

export const VIEWS: Record<ViewName, V3> = {
  front: [0.25, 0.5, 1],
  iso: [1, 0.85, 1.2],
  top: [0.06, 1, 0.3],
  left: [-1, 0.5, 0.35],
  right: [1, 0.5, 0.35],
  back: [0.2, 0.6, -1],
  low: [0.6, 0.25, 1],
  under: [0.25, -1, 0.45],
}

const DEFAULT_DUR = 1.1
const DEG = Math.PI / 180

interface PartStateFull {
  parent: string | null
  pos: Vec3
  quat: Q4
  visible: boolean
  light: Light
  color: string
  ui: ScreenUI | null
  edges: string | null
  fold: number
  plugged: string | null
}

/** 插头局部轴 → 接口局部轴：+x → -z（指向接口内部），+y → +y，+z → +x */
const PLUG_ALIGN = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
const DEFAULT_BACK = 30

const finite = (v: number[]) => v.every((x) => Number.isFinite(x))
const isOn = (at: unknown): at is OnSurface => !!at && typeof at === 'object' && !Array.isArray(at) && 'on' in at

function quatOf(rot: Vec3 | undefined): Q4 {
  if (!rot) return [0, 0, 0, 1]
  const q = new Quaternion().setFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ'))
  return [q.x, q.y, q.z, q.w]
}

/** 校验 + 编译。issues 非空时模型仍可显示，但 check 脚本会失败 */
export function compileManual(spec: ManualSpec): { model: ManualModel; guides: Guide[] } {
  const issues: string[] = []
  const byId = new Map<string, SpecPart>()
  const checkFinish = (f: Finish | undefined, where: string) => {
    if (f === undefined) return
    if (typeof f === 'string' ? !(FINISHES as readonly string[]).includes(f) : !/^#[0-9a-f]{6}$/i.test(f.color)) {
      issues.push(`${where} 的 finish「${JSON.stringify(f)}」无效：可选 ${FINISHES.join(' / ')}，或 { color: '#rrggbb' }`)
    }
  }
  for (const [fill, f] of Object.entries(spec.finishes ?? {})) checkFinish(f, `finishes.${fill}`)
  for (const p of spec.parts) {
    if (byId.has(p.id)) issues.push(`零件 id 重复：${p.id}`)
    byId.set(p.id, p)
    if (p.model) {
      if (!/^\/.+\.(glb|gltf)$/i.test(p.model.src)) issues.push(`零件 ${p.id} 的 model.src 要写 public 下的绝对路径（/models/…/x.glb）`)
      if (['hole', 'led', 'screen', 'text', 'cable'].includes(p.shape.type)) issues.push(`零件 ${p.id} 是 ${p.shape.type}，这类功能件保留几何体，不要挂 model`)
    }
    checkFinish(p.finish, `零件 ${p.id}`)
    if (p.shape.type === 'compound') p.shape.items.forEach((it, i) => checkFinish(it.finish, `零件 ${p.id} 的第 ${i + 1} 个子形体`))
    for (const s of p.shape.type === 'compound' ? p.shape.items : [p.shape]) {
      if (s.type === 'poly' && (s.points.length < 3 || !finite(s.points.flat()) || !(s.h > 0))) issues.push(`零件 ${p.id} 的 poly 至少要 3 个有效顶点、h > 0`)
      if (s.type === 'sheet') {
        if (s.points.length < 3 || !finite(s.points.flat()) || !((s.th ?? 0.3) > 0)) issues.push(`零件 ${p.id} 的 sheet 至少要 3 个有效顶点、th > 0`)
        checkFinish(s.backFinish, `零件 ${p.id} 的背面`)
      }
      if (s.type === 'gear' && (!Number.isInteger(s.teeth) || s.teeth < 6 || !(s.r > 0) || !(s.h > 0))) issues.push(`零件 ${p.id} 的 gear 要求 teeth 为 ≥ 6 的整数、r 和 h > 0`)
      if (s.type === 'origami') {
        if (s !== p.shape) issues.push(`零件 ${p.id}：origami 要单独做一个零件，不能放进 compound`)
        for (const c of ['color', 'white'] as const) if (s[c] !== undefined && !/^#[0-9a-f]{6}$/i.test(s[c]!)) issues.push(`零件 ${p.id} 的 origami.${c} 要写 #rrggbb`)
        for (const e of origamiOf(s).errors) issues.push(`零件 ${p.id} 的折纸程序 ${e}`)
      }
    }
  }
  for (const p of spec.parts) {
    if (!p.baked) continue
    if (!p.parent || !byId.get(p.parent)?.model) issues.push(`零件 ${p.id} 写了 baked，但父零件没有外观模型（model）`)
    if (['led', 'screen', 'cable'].includes(p.shape.type)) issues.push(`零件 ${p.id} 是 ${p.shape.type}，功能件不要写 baked`)
  }
  const has = (id: string, where: string) => {
    if (byId.has(id)) return true
    issues.push(`${where} 引用了不存在的零件「${id}」`)
    return false
  }

  // 父子关系排序（父在前），顺便查环
  const order: SpecPart[] = []
  const mark = new Map<string, 1 | 2>()
  const visit = (p: SpecPart, chain: string[]) => {
    if (mark.get(p.id) === 2) return
    if (mark.get(p.id) === 1) {
      issues.push(`父子关系成环：${[...chain, p.id].join(' → ')}`)
      return
    }
    mark.set(p.id, 1)
    if (p.parent && has(p.parent, `零件 ${p.id} 的 parent`)) visit(byId.get(p.parent)!, [...chain, p.id])
    mark.set(p.id, 2)
    order.push(p)
  }
  spec.parts.forEach((p) => visit(p, []))

  const shapeOf = (id: string | null) => (id ? byId.get(id)?.shape : undefined)
  const resolveAt = (at: Vec3 | OnSurface | undefined, parent: string | null, where: string): Vec3 => {
    if (!at) return [0, 0, 0]
    if (!isOn(at)) {
      if (!finite(at)) issues.push(`${where} 的坐标不是有效数字`)
      return at
    }
    const ps = shapeOf(parent)
    if (ps?.type !== 'shell') {
      issues.push(`${where} 使用了 on（贴表面），但父零件不是 shell`)
      return [at.on[0], 0, at.on[1]]
    }
    return [at.on[0], shellTopY(ps as ShellShape, at.on[0], at.on[1]) + (at.dy ?? 0), at.on[1]]
  }

  for (const p of spec.parts) {
    if (p.shape.type === 'cable') {
      has(p.shape.from.part, `线缆 ${p.id}`)
      has(p.shape.to.part, `线缆 ${p.id}`)
    }
  }

  const initial = (): Record<string, PartStateFull> => Object.fromEntries(order.map((p) => [p.id, {
    parent: p.parent ?? null,
    pos: resolveAt(p.at, p.parent ?? null, `零件 ${p.id}`),
    quat: quatOf(p.rot),
    visible: p.visible ?? true,
    light: 'off' as Light,
    color: p.shape.type === 'led' ? p.shape.color ?? '#f5b400' : '#f5b400',
    ui: null,
    edges: null,
    fold: 0,
    plugged: null,
  }]))

  /** 按当前（运行时）父子关系求世界矩阵：插进后声明零件上的插头，父级要先算 */
  const worldOf = (state: Record<string, PartStateFull>) => {
    const out = new Map<string, Matrix4>()
    const busy = new Set<string>()
    const get = (id: string): Matrix4 => {
      const done = out.get(id)
      if (done) return done
      const s = state[id]
      const local = new Matrix4().compose(new Vector3(...s.pos), new Quaternion(...s.quat), new Vector3(1, 1, 1))
      busy.add(id)
      const m = s.parent && !busy.has(s.parent) ? get(s.parent).clone().multiply(local) : local
      busy.delete(id)
      out.set(id, m)
      return m
    }
    for (const p of order) get(p.id)
    return out
  }

  const apply = (state: Record<string, PartStateFull>, set: Record<string, PartState> | undefined, where: string) => {
    const trans: Record<string, Pick<PartFrame, 'lift' | 'via' | 'arc' | 'delay' | 'dur'>> = {}
    if (!set) return trans
    const world = worldOf(state)
    const autoVia: { id: string; hole: string; back: number }[] = []
    for (const [id, st] of Object.entries(set)) {
      if (!has(id, where)) continue
      const cur = state[id]
      const shape = byId.get(id)!.shape
      if (st.plug !== undefined) {
        const plug = typeof st.plug === 'string' ? { hole: st.plug } : st.plug
        if (!has(plug.hole, `${where} ${id}.plug`)) continue
        const hole = byId.get(plug.hole)!
        if (hole.shape.type !== 'hole') {
          issues.push(`${where}：${id}.plug 指向的 ${plug.hole} 不是接口（hole）`)
          continue
        }
        if (st.parent !== undefined || st.at || st.rot) {
          issues.push(`${where}：${id} 用了 plug，就不要再写 parent / at / rot（位置由接口决定）`)
          continue
        }
        if (plug.hole === id) continue
        const hs = state[plug.hole]
        const q = new Quaternion(...hs.quat).multiply(PLUG_ALIGN)
        if (plug.roll) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), plug.roll * DEG))
        const center = new Vector3(...(hole.pivot ?? [0, 0, 0])).applyQuaternion(new Quaternion(...hs.quat)).add(new Vector3(...hs.pos))
        const pos = new Vector3(plug.depth ?? 0, 0, 0).applyQuaternion(q).add(center)
        cur.parent = hs.parent
        cur.pos = [pos.x, pos.y, pos.z]
        cur.quat = [q.x, q.y, q.z, q.w]
        cur.plugged = plug.hole
        if (st.visible !== undefined) cur.visible = st.visible
        const back = plug.back ?? DEFAULT_BACK
        if (!st.via && back > 0) autoVia.push({ id, hole: plug.hole, back })
        if (st.arc) issues.push(`${where}：${id} 用了 plug，不能再写 arc`)
        trans[id] = { lift: st.lift ?? 0, via: st.via ?? null, arc: null, delay: st.delay ?? 0, dur: st.dur ?? DEFAULT_DUR }
        continue
      }
      if (st.parent !== undefined && st.parent !== null && !has(st.parent, `${where} ${id}.parent`)) continue
      if (st.parent !== undefined && st.parent === id) {
        issues.push(`${where}：零件 ${id} 不能以自己为父级`)
        continue
      }
      if (st.parent !== undefined || st.at || st.rot) cur.plugged = null
      const parent = st.parent === undefined ? cur.parent : st.parent
      if (parent !== cur.parent && !st.at) {
        // 换父级但没给位置：保持世界坐标不动
        const pw = parent ? world.get(parent)! : new Matrix4()
        const local = pw.clone().invert().multiply(world.get(id)!)
        const pos = new Vector3()
        const q = new Quaternion()
        local.decompose(pos, q, new Vector3())
        cur.pos = [pos.x, pos.y, pos.z]
        cur.quat = [q.x, q.y, q.z, q.w]
      }
      if (st.arc && (st.via || parent !== cur.parent)) issues.push(`${where}：${id} 的 arc 只能在父级不变、没有 via 时用`)
      if (st.arc && !(Array.isArray(st.arc) ? finite(st.arc) : finite([...st.arc.at, ...st.arc.axis]))) issues.push(`${where}：${id} 的 arc 不是有效数字`)
      cur.parent = parent
      if (st.at) cur.pos = resolveAt(st.at, parent, `${where} ${id}`)
      if (st.rot) cur.quat = quatOf(st.rot)
      if (st.visible !== undefined) cur.visible = st.visible
      if (st.light !== undefined) {
        if (shape.type !== 'led') issues.push(`${where}：${id} 不是指示灯（led），不能设置 light`)
        cur.light = st.light
      }
      if (st.color) cur.color = st.color
      if (st.ui !== undefined) {
        if (shape.type !== 'screen') issues.push(`${where}：${id} 不是屏幕（screen），不能设置 ui`)
        cur.ui = st.ui
      }
      if (st.edges !== undefined) {
        if (shape.type !== 'sheet') issues.push(`${where}：${id} 不是纸片（sheet），不能设置 edges`)
        else if (st.edges.length !== shape.points.length || /[^hs-]/.test(st.edges)) issues.push(`${where}：${id}.edges 要 ${shape.points.length} 个字符，只能是 h / s / -`)
        cur.edges = st.edges
      }
      let lift = st.lift ?? 0
      if (st.fold !== undefined) {
        if (shape.type !== 'origami') issues.push(`${where}：${id} 不是折纸（origami），不能设置 fold`)
        else {
          const d = origamiOf(shape)
          if (!Number.isInteger(st.fold) || st.fold < 0 || st.fold > d.steps) issues.push(`${where}：${id}.fold 要是 0–${d.steps} 的整数（ops 一共 ${d.steps} 步）`)
          else {
            // 往下翻的折法途中会碰到桌面：没写 lift 就按模拟出来的高度抬起整张纸
            if (st.lift === undefined) for (let k = Math.min(cur.fold, st.fold) + 1; k <= Math.max(cur.fold, st.fold); k++) lift = Math.max(lift, d.lifts[k])
            cur.fold = st.fold
          }
        }
      }
      trans[id] = { lift, via: st.via ?? null, arc: st.arc ?? null, delay: st.delay ?? 0, dur: st.dur ?? DEFAULT_DUR }
    }
    // 检查父子环（运行时换父级）
    for (const p of order) {
      const seen = new Set<string>()
      let c: string | null = p.id
      while (c) {
        if (seen.has(c)) {
          issues.push(`${where}：换父级后出现环（${[...seen].join(' → ')}）`)
          state[p.id].parent = null
          break
        }
        seen.add(c)
        c = state[c].parent
      }
    }
    if (autoVia.length) {
      const end = worldOf(state)
      for (const { id, hole, back } of autoVia) {
        const m = end.get(hole)!
        const n = new Vector3(0, 0, 1).transformDirection(m)
        const c = new Vector3(...(byId.get(hole)!.pivot ?? [0, 0, 0])).applyMatrix4(m).addScaledVector(n, back)
        trans[id].via = [c.x, c.y, c.z]
      }
    }
    return trans
  }

  const frameOf = (state: Record<string, PartStateFull>, trans: ReturnType<typeof apply>): Frame => {
    const world = worldOf(state)
    return Object.fromEntries(order.map((p) => {
      const s = state[p.id]
      const t = trans[p.id] ?? { lift: 0, via: null, arc: null, delay: 0, dur: DEFAULT_DUR }
      return [p.id, { ...s, pos: [...s.pos] as Vec3, quat: [...s.quat] as Q4, ...t, world: world.get(p.id)!.toArray() }]
    }))
  }

  const pointOf = (frame: Frame, target: string | Vec3, offset: Vec3 | undefined, where: string): V3 => {
    let p: Vec3 = [0, 0, 0]
    if (typeof target === 'string') {
      if (has(target, where)) {
        const m = new Matrix4().fromArray(frame[target].world)
        const shape = byId.get(target)!.shape
        // 折纸看向这一步折好的纸的中心
        const v = shape.type === 'origami' ? origamiBounds(origamiOf(shape), frame[target].fold).center.applyMatrix4(m) : new Vector3().setFromMatrixPosition(m)
        p = [v.x, v.y, v.z]
      }
    } else p = target
    const o = offset ?? [0, 0, 0]
    return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]
  }
  const dirOf = (d: CameraSpec['dir']): V3 => (typeof d === 'string' ? VIEWS[d] ?? VIEWS.iso : d)

  const startState = (g: SpecGuide) => {
    const s = initial()
    apply(s, spec.initial, '初始状态')
    apply(s, g.start, `指南 ${g.id} 的 start`)
    return s
  }

  const guideIds = new Set<string>()
  const guides: Guide[] = spec.guides.map((g) => {
    if (guideIds.has(g.id)) issues.push(`指南 id 重复：${g.id}`)
    guideIds.add(g.id)
    if (!g.steps.length) issues.push(`指南 ${g.id} 没有步骤`)
    const state = startState(g)
    let prev = frameOf(state, {})
    const stepIds = new Set<string>()
    const steps: Step[] = g.steps.map((s, i) => {
      const where = `指南 ${g.id} 第 ${i + 1} 步（${s.id}）`
      if (stepIds.has(s.id)) issues.push(`${where}：步骤 id 重复`)
      stepIds.add(s.id)
      const trans = apply(state, s.set, where)
      const to = frameOf(state, trans)
      for (const id of s.highlight ?? []) has(id, `${where} highlight`)
      for (const a of s.actions ?? []) has(a.part, `${where} ${a.type}`)
      for (const c of s.callouts ?? []) has(c.part, `${where} callout`)
      const focus = pointOf(to, s.camera.target, s.camera.offset, `${where} camera`)
      const zoom = s.zoom && {
        focus: pointOf(to, s.zoom.target, s.zoom.offset, `${where} zoom`),
        dir: dirOf(s.zoom.dir), dist: s.zoom.dist, caption: s.zoom.caption,
      }
      const marker = s.marker !== undefined ? pointOf(to, s.marker, undefined, `${where} marker`) : zoom?.focus
      const chips: StepChip[] = [...(s.chips ?? []), ...(s.page ? [{ label: '说明书', sub: `第 ${s.page} 页` }] : [])]
      const step: Step = {
        id: s.id, title: s.title, desc: s.desc, tip: s.tip, chips,
        active: s.highlight ?? [], motion: 'none',
        focus, view: { dir: dirOf(s.camera.dir), dist: s.camera.dist },
        marker, autoRotate: s.orbit,
        scene: { from: prev, to, highlight: s.highlight ?? [], actions: s.actions ?? [], callouts: s.callouts ?? [], zoom },
      }
      prev = to
      return step
    })
    const pages = [...new Set(g.steps.map((s) => s.page).filter((p): p is number => !!p))].sort((a, b) => a - b)
    return {
      id: g.id,
      kind: g.kind,
      title: g.title,
      summary: `${steps.length} 步${pages.length ? ` · 说明书第 ${pages.join('、')} 页` : ''}`,
      visibility: 'all',
      steps,
      installAt: {},
    } satisfies Guide
  })

  const first = guides[0]?.steps[0]
  const model: ManualModel = {
    product: `manual:${spec.id}`,
    name: spec.name,
    dims: spec.dims,
    parts: [],
    byId: {},
    cutList: [],
    cutTitle: '基本参数',
    cutNote: '',
    hardware: spec.package.map((p, i) => ({ key: `pkg-${i}`, name: p.name, spec: p.spec ?? '', qty: p.qty, unit: '件', price: 0 })),
    tools: [],
    stats: { weightKg: 0, priceCny: 0, minutes: 0 },
    warnings: issues,
    metrics: spec.params.map((p) => ({ label: p.label, value: p.value, note: p.note })),
    center: first?.focus ?? [0, 0, 0],
    designView: { focus: first?.focus ?? [0, 0, 0], dist: first?.view.dist ?? 800 },
    overlay: {},
    spec,
    scene: {
      parts: order.map((p) => ({
        id: p.id, name: p.name, spec: p.spec, shape: p.shape, pivot: p.pivot, fill: p.fill, finish: p.finish, model: p.model,
        ...(p.baked ? { rest: { parent: p.parent ?? null, pos: resolveAt(p.at, p.parent ?? null, `零件 ${p.id}`), quat: quatOf(p.rot) } } : {}),
      })),
      stageSize: spec.stageSize ?? 1200,
    },
    issues,
  }
  return { model, guides }
}
