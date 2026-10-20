import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { Chip as StepChip, Guide, ModelBase, Q4, Step, V3 } from '../types'
import { shellTopY, type ShellShape } from './shell'
import type {
  Action, Callout, CameraSpec, Fill, Light, ManualSpec, OnSurface, PartState, ScreenUI, Shape, SpecGuide, SpecPart, Vec3, ViewName,
} from './types'

export interface PartFrame {
  parent: string | null
  pos: Vec3
  quat: Q4
  visible: boolean
  light: Light
  color: string
  ui: ScreenUI | null
  lift: number
  via: Vec3 | null
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
}

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
  for (const p of spec.parts) {
    if (byId.has(p.id)) issues.push(`零件 id 重复：${p.id}`)
    byId.set(p.id, p)
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
  }]))

  const worldOf = (state: Record<string, PartStateFull>) => {
    const out = new Map<string, Matrix4>()
    for (const p of order) {
      const s = state[p.id]
      const local = new Matrix4().compose(new Vector3(...s.pos), new Quaternion(...s.quat), new Vector3(1, 1, 1))
      const parent = s.parent ? out.get(s.parent) : undefined
      out.set(p.id, parent ? parent.clone().multiply(local) : local)
    }
    return out
  }

  const apply = (state: Record<string, PartStateFull>, set: Record<string, PartState> | undefined, where: string) => {
    const trans: Record<string, Pick<PartFrame, 'lift' | 'via' | 'delay' | 'dur'>> = {}
    if (!set) return trans
    const world = worldOf(state)
    for (const [id, st] of Object.entries(set)) {
      if (!has(id, where)) continue
      const cur = state[id]
      const shape = byId.get(id)!.shape
      if (st.parent !== undefined && st.parent !== null && !has(st.parent, `${where} ${id}.parent`)) continue
      if (st.parent !== undefined && st.parent === id) {
        issues.push(`${where}：零件 ${id} 不能以自己为父级`)
        continue
      }
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
      trans[id] = { lift: st.lift ?? 0, via: st.via ?? null, delay: st.delay ?? 0, dur: st.dur ?? DEFAULT_DUR }
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
    return trans
  }

  const frameOf = (state: Record<string, PartStateFull>, trans: ReturnType<typeof apply>): Frame => {
    const world = worldOf(state)
    return Object.fromEntries(order.map((p) => {
      const s = state[p.id]
      const t = trans[p.id] ?? { lift: 0, via: null, delay: 0, dur: DEFAULT_DUR }
      return [p.id, { ...s, pos: [...s.pos] as Vec3, quat: [...s.quat] as Q4, ...t, world: world.get(p.id)!.toArray() }]
    }))
  }

  const pointOf = (frame: Frame, target: string | Vec3, offset: Vec3 | undefined, where: string): V3 => {
    let p: Vec3 = [0, 0, 0]
    if (typeof target === 'string') {
      if (has(target, where)) {
        const m = new Matrix4().fromArray(frame[target].world)
        const v = new Vector3().setFromMatrixPosition(m)
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
      parts: order.map((p) => ({ id: p.id, name: p.name, spec: p.spec, shape: p.shape, pivot: p.pivot, fill: p.fill })),
      stageSize: spec.stageSize ?? 1200,
    },
    issues,
  }
  return { model, guides }
}
