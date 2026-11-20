import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { Guide, Step } from '../types'
import type { Frame, ManualModel, ScenePart } from './compile'
import { foldFrame, origamiCloud, origamiOf, type OrigamiData } from './origami'
import { bakedState, progressAt, sameTransform, solvePose, stepTiming, type Pose, type StepTiming } from './pose'
import { gearDepth, gearDims, gearOutline, polySdf } from './profile'
import { shellHeightAt, shellParams, shellPoint, shellTopY, type ShellShape } from './shell'
import type { Shape, SpecStep, Vec3 } from './types'

/**
 * 场景审计：把每个指南的每一步按「静止」和「过渡途中」逐帧摆出来，检查画面讲不讲得通。
 * 穿地、穿插、插接、镜头与细节窗看不看得到、指示灯朝向、标注越界……全部为 0 才算通过。
 * 姿态由 pose.ts 求出，和 ManualStage 画出来的是同一份。
 */

export type Severity = 'error' | 'warn' | 'note'
export type CheckId = 'floor' | 'through' | 'flight' | 'plug' | 'view' | 'zoom' | 'led' | 'callout' | 'mirror' | 'step' | 'hover'

export const CHECKS: { id: CheckId; label: string; severity: Severity }[] = [
  { id: 'floor', label: '穿地', severity: 'error' },
  { id: 'through', label: '穿插（静止）', severity: 'error' },
  { id: 'flight', label: '穿插 / 穿地（过渡途中）', severity: 'error' },
  { id: 'plug', label: '插接', severity: 'error' },
  { id: 'view', label: '镜头', severity: 'error' },
  { id: 'zoom', label: '细节窗', severity: 'error' },
  { id: 'led', label: '指示灯', severity: 'error' },
  { id: 'callout', label: '标注', severity: 'error' },
  { id: 'mirror', label: '镜像文字', severity: 'warn' },
  { id: 'step', label: '步骤', severity: 'warn' },
  { id: 'hover', label: '悬空（手持姿态？）', severity: 'note' },
]

export interface Finding {
  check: CheckId
  severity: Severity
  guide: string
  /** 出现在哪些步（从 1 开始） */
  steps: number[]
  message: string
}

export interface AuditReport {
  findings: Finding[]
  errors: number
  warnings: number
  stats: { steps: number; frames: number; parts: number }
}

/** 容差（mm） */
export const TOL = { floor: 0.5, through: 0.8, occlude: 0.3, hover: 1 }

/** 画布尺寸与细节圆窗位置，取自 styles.css（桌面 1440×900、手机 390×844 时的 .viewport 与 .detail） */
const VIEWPORTS = [
  { name: '桌面', w: 1392, h: 600, inset: { right: 18, top: 16, size: 270 }, severity: 'error' as Severity },
  { name: '手机', w: 370, h: 520, inset: { right: 10, top: 10, size: 132 }, severity: 'warn' as Severity },
]
const MAIN_FOV = 30
const ZOOM_FOV = 28
const SMALL_PART = 15
const MAX_CALLOUTS = 6
const MAX_STEP_SECONDS = 6
const FLIGHT_SAMPLES = 12
/** 字高小于这个像素数时读不出来，不查镜像 */
const MIN_GLYPH_PX = 7

// ---------- 形体：采样点 + 内部深度 ----------

interface Solid {
  id: string
  flat: boolean
  /** 零件局部坐标的表面采样点 */
  cloud: Vector3[]
  /** 零件局部坐标的点在形体内部多深（mm），外部 ≤ 0 */
  inside: (p: Vector3) => number
  min: Vector3
  max: Vector3
  size: number
  /** 折纸：采样点按这一帧折到的样子现算；不参与穿插、不挡视线 */
  paper?: OrigamiData
}

const lin = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1)))
const cnt = (len: number) => Math.min(7, Math.max(2, Math.ceil(len / 5) + 1))
const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z)
const OUT = () => -Infinity

function sdfRoundRect(x: number, z: number, w: number, d: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, d / 2))
  const qx = Math.abs(x) - (w / 2 - rr)
  const qz = Math.abs(z) - (d / 2 - rr)
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr
}

function roundRectOutline(w: number, d: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, d / 2))
  const pts: [number, number][] = []
  const corners: [number, number, number][] = [[w / 2 - rr, d / 2 - rr, 0], [-(w / 2 - rr), d / 2 - rr, 90], [-(w / 2 - rr), -(d / 2 - rr), 180], [w / 2 - rr, -(d / 2 - rr), 270]]
  for (const [cx, cz, a0] of corners) for (const a of lin(a0, a0 + 90, 5)) pts.push([cx + rr * Math.cos(a * DEG), cz + rr * Math.sin(a * DEG)])
  for (const x of lin(-w / 2 + rr, w / 2 - rr, cnt(w))) pts.push([x, d / 2], [x, -d / 2])
  for (const z of lin(-d / 2 + rr, d / 2 - rr, cnt(d))) pts.push([w / 2, z], [-w / 2, z])
  return pts
}

const DEG = Math.PI / 180

/** extent：平面类形体的真实尺寸（采样点故意缩在内侧，不能用来量大小） */
function shapeSolid(shape: Shape): Pick<Solid, 'flat' | 'cloud' | 'inside'> & { extent?: number } {
  switch (shape.type) {
    case 'box': {
      const [hx, hy, hz] = shape.size.map((v) => v / 2)
      const cloud: Vector3[] = []
      for (const y of lin(-hy, hy, cnt(2 * hy))) for (const z of lin(-hz, hz, cnt(2 * hz))) cloud.push(v3(hx, y, z), v3(-hx, y, z))
      for (const x of lin(-hx, hx, cnt(2 * hx))) for (const z of lin(-hz, hz, cnt(2 * hz))) cloud.push(v3(x, hy, z), v3(x, -hy, z))
      for (const x of lin(-hx, hx, cnt(2 * hx))) for (const y of lin(-hy, hy, cnt(2 * hy))) cloud.push(v3(x, y, hz), v3(x, y, -hz))
      return { flat: false, cloud, inside: (p) => Math.min(hx - Math.abs(p.x), hy - Math.abs(p.y), hz - Math.abs(p.z)) }
    }
    case 'slab': {
      const { w, d, h } = shape
      const r = shape.r ?? 0
      const cloud: Vector3[] = []
      for (const [x, z] of roundRectOutline(w, d, r)) for (const y of lin(0, h, cnt(h))) cloud.push(v3(x, y, z))
      for (const x of lin(-w / 2, w / 2, cnt(w))) for (const z of lin(-d / 2, d / 2, cnt(d))) {
        if (sdfRoundRect(x, z, w, d, r) <= 0.01) cloud.push(v3(x, 0, z), v3(x, h, z))
      }
      return { flat: false, cloud, inside: (p) => Math.min(p.y, h - p.y, -sdfRoundRect(p.x, p.z, w, d, r)) }
    }
    case 'cylinder': {
      const { r, h } = shape
      const r2 = shape.r2 ?? r
      const axis = shape.axis ?? 'y'
      const radius = (a: number) => r + (r2 - r) * (a / h + 0.5)
      const at = (a: number, c: number, s: number) => (axis === 'y' ? v3(c, a, s) : axis === 'x' ? v3(-a, c, s) : v3(c, s, a))
      const split = (p: Vector3) => (axis === 'y' ? { a: p.y, rho: Math.hypot(p.x, p.z) } : axis === 'x' ? { a: -p.x, rho: Math.hypot(p.y, p.z) } : { a: p.z, rho: Math.hypot(p.x, p.y) })
      const cloud: Vector3[] = []
      for (const a of lin(-h / 2, h / 2, cnt(h))) for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2
        cloud.push(at(a, radius(a) * Math.cos(t), radius(a) * Math.sin(t)))
      }
      cloud.push(at(-h / 2, 0, 0), at(h / 2, 0, 0))
      return { flat: false, cloud, inside: (p) => { const { a, rho } = split(p); return Math.min(radius(a) - rho, h / 2 - Math.abs(a)) } }
    }
    case 'shell': {
      const s = shape as ShellShape
      const k = shellParams(s)
      const cloud: Vector3[] = []
      for (const u of [0, 0.4, 0.7, 0.9, 1]) for (let i = 0; i < 24; i++) {
        const [x, z] = shellPoint(s, -Math.PI / 2 + (i / 24) * Math.PI * 2, u)
        cloud.push(v3(x, shellHeightAt(s, u, z / k.b), z))
        if (u === 1) cloud.push(v3(x, k.base / 2, z), v3(x, 0, z))
        if (u === 0.4 || u === 0.7) cloud.push(v3(x, 0, z))
      }
      cloud.push(v3(0, 0, 0))
      return {
        flat: false, cloud,
        inside: (p) => {
          if (p.y < 0) return p.y
          const ax = k.a * (1 - k.taper * (1 - p.z / k.b) / 2)
          const u = Math.pow(Math.pow(Math.abs(p.x / ax), k.n) + Math.pow(Math.abs(p.z / k.b), k.n), 1 / k.n)
          return Math.min(p.y, shellTopY(s, p.x, p.z) - p.y, (1 - u) * Math.min(ax, k.b))
        },
      }
    }
    case 'sheet':
    case 'poly': {
      const points = shape.points
      const h = shape.type === 'poly' ? shape.h : shape.th ?? 0.3
      const cloud: Vector3[] = []
      for (let i = 0; i < points.length; i++) {
        const [ax, az] = points[i]
        const [bx, bz] = points[(i + 1) % points.length]
        for (const t of lin(0, 1, cnt(Math.hypot(bx - ax, bz - az))).slice(0, -1)) {
          for (const y of lin(0, h, cnt(h))) cloud.push(v3(ax + (bx - ax) * t, y, az + (bz - az) * t))
        }
      }
      const xs = points.map((p) => p[0])
      const zs = points.map((p) => p[1])
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
      for (const x of lin(x0, x1, cnt(x1 - x0))) for (const z of lin(z0, z1, cnt(z1 - z0))) {
        if (polySdf(points, x, z) < -0.01) cloud.push(v3(x, 0, z), v3(x, h, z))
      }
      return { flat: false, cloud, inside: (p) => Math.min(p.y, h - p.y, -polySdf(points, p.x, p.z)) }
    }
    case 'gear': {
      const { teeth, r, h } = shape
      const axis = shape.axis ?? 'y'
      const bore = shape.bore ?? 0
      // 与 shapes.ts 的挤出方向一致：平面坐标 (u, v) + 轴向 a
      const toLocal = (u: number, v: number, a: number) => (axis === 'y' ? v3(u, a, -v) : axis === 'x' ? v3(a, v, -u) : v3(u, v, a))
      const split = (p: Vector3) => (axis === 'y' ? { u: p.x, v: -p.z, a: p.y } : axis === 'x' ? { u: -p.z, v: p.y, a: p.x } : { u: p.x, v: p.y, a: p.z })
      const { root } = gearDims(teeth, r)
      const cloud: Vector3[] = []
      for (const a of lin(-h / 2, h / 2, cnt(h))) {
        for (const [u, v] of gearOutline(teeth, r)) cloud.push(toLocal(u, v, a))
      }
      for (const a of [-h / 2, h / 2]) for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2
        const rho = Math.max(bore + 0.5, root * 0.6)
        cloud.push(toLocal(rho * Math.cos(t), rho * Math.sin(t), a))
      }
      return {
        flat: false, cloud,
        inside: (p) => {
          const { u, v, a } = split(p)
          return Math.min(h / 2 - Math.abs(a), gearDepth(teeth, r, bore, u, v))
        },
      }
    }
    case 'compound': {
      const items = shape.items.map((it) => {
        const m = new Matrix4().compose(v3(...(it.at ?? [0, 0, 0])), new Quaternion().setFromEuler(new Euler(...((it.rot ?? [0, 0, 0]).map((a) => a * DEG) as Vec3), 'XYZ')), v3(1, 1, 1))
        return { m, inv: m.clone().invert(), solid: shapeSolid(it) }
      })
      const tmp = new Vector3()
      return {
        flat: items.every((it) => it.solid.flat),
        cloud: items.flatMap((it) => it.solid.cloud.map((p) => p.clone().applyMatrix4(it.m))),
        inside: (p) => Math.max(...items.map((it) => it.solid.inside(tmp.copy(p).applyMatrix4(it.inv)))),
      }
    }
    case 'origami': {
      const d = origamiOf(shape)
      return { flat: false, cloud: origamiCloud(d, d.frames[0]), inside: OUT }
    }
    case 'hole':
    case 'screen': {
      const hw = shape.w / 2
      const hh = shape.h / 2
      const cloud = lin(-hw * 0.85, hw * 0.85, 3).flatMap((x) => lin(-hh * 0.85, hh * 0.85, 3).map((y) => v3(x, y, 0)))
      return { flat: true, cloud, inside: OUT, extent: Math.max(shape.w, shape.h) }
    }
    case 'led':
      return { flat: true, cloud: [v3(0, 0, 0), ...lin(0, 300, 6).map((a) => v3(shape.r * 0.7 * Math.cos(a * DEG), shape.r * 0.7 * Math.sin(a * DEG), 0))], inside: OUT, extent: shape.r * 2 }
    case 'text': {
      const len = [...shape.text].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 1 : 0.6), 0)
      const hw = (shape.size * 1.33 * len) / 2
      const hh = (shape.size * 1.33) / 2
      return { flat: true, cloud: [v3(0, 0, 0), v3(-hw * 0.8, -hh * 0.6, 0), v3(hw * 0.8, -hh * 0.6, 0), v3(-hw * 0.8, hh * 0.6, 0), v3(hw * 0.8, hh * 0.6, 0)], inside: OUT, extent: 2 * hw }
    }
    case 'cable':
      return { flat: true, cloud: [], inside: OUT }
  }
}

/** 形体在局部坐标里的包围盒（不含 pivot），外观模型按它对齐 */
export function shapeBounds(shape: Shape): { min: Vec3; max: Vec3 } {
  const min = v3(Infinity, Infinity, Infinity)
  const max = v3(-Infinity, -Infinity, -Infinity)
  for (const p of shapeSolid(shape).cloud) {
    min.min(p)
    max.max(p)
  }
  return { min: min.toArray(), max: max.toArray() }
}

function partSolid(part: ScenePart): Solid {
  const base = shapeSolid(part.shape)
  const pivot = v3(...(part.pivot ?? [0, 0, 0]))
  const cloud = base.cloud.map((p) => p.clone().add(pivot))
  const tmp = new Vector3()
  const min = v3(Infinity, Infinity, Infinity)
  const max = v3(-Infinity, -Infinity, -Infinity)
  for (const p of cloud) {
    min.min(p)
    max.max(p)
  }
  const size = base.extent ?? (cloud.length ? Math.max(max.x - min.x, max.y - min.y, max.z - min.z) : 0)
  return {
    id: part.id, flat: base.flat, cloud, inside: (p) => base.inside(tmp.copy(p).sub(pivot)), min, max, size,
    ...(part.shape.type === 'origami' ? { paper: origamiOf(part.shape) } : {}),
  }
}

/** 折纸零件这一帧每块面的变换 */
type FoldMats = (id: string, paper: OrigamiData) => Matrix4[]

// ---------- 一帧场景 ----------

interface Placed {
  solid: Solid
  world: Matrix4
  inv: Matrix4
  pts: Vector3[]
  min: Vector3
  max: Vector3
}

class Snapshot {
  placed = new Map<string, Placed>()
  constructor(solids: Map<string, Solid>, mats: Map<string, Matrix4>, vis: (id: string) => boolean, folds?: FoldMats) {
    for (const [id, solid] of solids) {
      if (!vis(id) || !solid.cloud.length) continue
      const world = mats.get(id)!.clone()
      const local = solid.paper && folds ? origamiCloud(solid.paper, folds(id, solid.paper)) : solid.cloud
      const pts = local.map((p) => p.clone().applyMatrix4(world))
      const min = v3(Infinity, Infinity, Infinity)
      const max = v3(-Infinity, -Infinity, -Infinity)
      for (const p of pts) {
        min.min(p)
        max.max(p)
      }
      this.placed.set(id, { solid, world, inv: world.clone().invert(), pts, min, max })
    }
  }

  get solids() {
    return [...this.placed.values()].filter((p) => !p.solid.flat)
  }

  /** a 的采样点进入 b 的最大深度，反之亦然，取大 */
  depth(a: Placed, b: Placed) {
    if (a.min.x > b.max.x || b.min.x > a.max.x || a.min.y > b.max.y || b.min.y > a.max.y || a.min.z > b.max.z || b.min.z > a.max.z) return 0
    const tmp = new Vector3()
    let d = 0
    for (const p of a.pts) d = Math.max(d, b.solid.inside(tmp.copy(p).applyMatrix4(b.inv)))
    for (const p of b.pts) d = Math.max(d, a.solid.inside(tmp.copy(p).applyMatrix4(a.inv)))
    return d
  }

  /** 从 from 看 to 这条线段（末端留 1.5 mm）是否被某个实体挡住 */
  occluded(from: Vector3, to: Vector3, skip: string) {
    const dir = to.clone().sub(from)
    const len = dir.length() - 1.5
    if (len <= 0) return false
    dir.normalize()
    const o = new Vector3()
    const d = new Vector3()
    const p = new Vector3()
    for (const pl of this.solids) {
      if (pl.solid.id === skip) continue
      o.copy(from).applyMatrix4(pl.inv)
      d.copy(from).addScaledVector(dir, len).applyMatrix4(pl.inv).sub(o)
      let t0 = 0
      let t1 = 1
      for (const ax of ['x', 'y', 'z'] as const) {
        const lo = pl.solid.min[ax] - 0.5
        const hi = pl.solid.max[ax] + 0.5
        if (Math.abs(d[ax]) < 1e-9) {
          if (o[ax] < lo || o[ax] > hi) t1 = -1
        } else {
          let a = (lo - o[ax]) / d[ax]
          let b = (hi - o[ax]) / d[ax]
          if (a > b) [a, b] = [b, a]
          t0 = Math.max(t0, a)
          t1 = Math.min(t1, b)
        }
        if (t0 > t1) break
      }
      if (t0 > t1) continue
      const segLen = d.length()
      const ext = pl.solid.max.clone().sub(pl.solid.min)
      const stepT = Math.max(0.3, Math.min(ext.x, ext.y, ext.z) / 4) / Math.max(segLen, 1e-6)
      for (let t = t0; t <= t1; t += stepT) {
        if (pl.solid.inside(p.copy(o).addScaledVector(d, t)) > TOL.occlude) return true
      }
    }
    return false
  }
}

// ---------- 镜头 ----------

interface View {
  cam: PerspectiveCamera
  w: number
  h: number
  round: boolean
}

function makeView(focus: Vec3 | number[], dir: Vec3 | number[], dist: number, fov: number, w: number, h: number, round: boolean): View {
  const cam = new PerspectiveCamera(fov, w / h, 1, 50000)
  const d = v3(dir[0], dir[1], dir[2]).normalize()
  const f = v3(focus[0], focus[1], focus[2])
  cam.position.copy(f).addScaledVector(d, dist)
  if (round && Math.abs(d.y) > 0.9) cam.up.set(0, 0, -1)
  cam.lookAt(f)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return { cam, w, h, round }
}

function mainView(step: Step, vp: (typeof VIEWPORTS)[number]) {
  const aspect = vp.w / vp.h
  const dist = step.view.dist * (aspect < 1.25 ? Math.min(2.2, 1.25 / aspect) : 1)
  return makeView(step.focus, step.view.dir, dist, MAIN_FOV, vp.w, vp.h, false)
}

/** 投影到画布像素；在镜头背后时返回 null */
function toScreen(view: View, p: Vector3) {
  const c = p.clone().applyMatrix4(view.cam.matrixWorldInverse)
  if (c.z > -1) return null
  const n = p.clone().project(view.cam)
  return { x: ((n.x + 1) / 2) * view.w, y: ((1 - n.y) / 2) * view.h, nx: n.x, ny: n.y }
}

function inFrame(view: View, p: Vector3, margin = 0) {
  const s = toScreen(view, p)
  if (!s) return false
  if (view.round) return Math.hypot(s.nx, s.ny) <= 0.95
  return s.x >= margin && s.x <= view.w - margin && s.y >= margin && s.y <= view.h - margin
}

function underInset(vp: (typeof VIEWPORTS)[number], x: number, y: number) {
  const { right, top, size } = vp.inset
  return x >= vp.w - right - size && y <= top + size + 22
}

/** 零件在这个镜头里能不能看到：至少一个采样点在画面内、没被挡住；flat 零件还要正面朝向镜头 */
function seen(snap: Snapshot, view: View, id: string, margin = 0) {
  const pl = snap.placed.get(id)
  if (!pl) return false
  const facing = pl.solid.flat ? frontFacing(pl.world, view.cam.position) : true
  if (!facing) return false
  return pl.pts.some((p) => inFrame(view, p, margin) && !snap.occluded(view.cam.position, p, id))
}

function frontFacing(world: Matrix4, eye: Vector3) {
  const n = v3(0, 0, 1).transformDirection(world)
  const o = v3(0, 0, 0).applyMatrix4(world)
  return n.dot(eye.clone().sub(o).normalize()) > 0.12
}

const centerOf = (pl: Placed) => pl.min.clone().add(pl.max).multiplyScalar(0.5)

// ---------- 结果收集：同一问题连续多步只报一次 ----------

class Collector {
  private map = new Map<string, Finding>()
  add(check: CheckId, severity: Severity, guide: string, step: number, key: string, message: string) {
    const k = `${check}|${severity}|${guide}|${key}`
    const f = this.map.get(k)
    if (f) {
      if (!f.steps.includes(step)) f.steps.push(step)
    } else this.map.set(k, { check, severity, guide, steps: [step], message })
  }
  get findings() {
    return [...this.map.values()]
  }
}

// ---------- 主流程 ----------

const ancestorOf = (frame: Frame, a: string, b: string) => {
  for (let p = frame[b]?.parent; p; p = frame[p]?.parent) if (p === a) return true
  return false
}
const related = (frame: Frame, a: string, b: string) => ancestorOf(frame, a, b) || ancestorOf(frame, b, a)

function restVisible(frame: Frame) {
  const memo = new Map<string, boolean>()
  const vis = (id: string): boolean => {
    let v = memo.get(id)
    if (v === undefined) {
      const f = frame[id]
      v = f.visible && (!f.parent || vis(f.parent))
      memo.set(id, v)
    }
    return v
  }
  return vis
}

export function auditManual(model: ManualModel, guides: Guide[]): AuditReport {
  const spec = model.spec
  const parts = model.scene.parts
  const names = new Map(parts.map((p) => [p.id, p.name]))
  const label = (id: string) => `${names.get(id) ?? id}（${id}）`
  const solids = new Map(parts.filter((p) => p.shape.type !== 'cable').map((p) => [p.id, partSolid(p)]))
  const ids = parts.map((p) => p.id)
  const out = new Collector()
  let frames = 0
  let steps = 0

  guides.forEach((guide, gi) => {
    const specGuide = spec.guides[gi]
    guide.steps.forEach((step, si) => {
      const scene = step.scene
      if (!scene) return
      steps++
      const n = si + 1
      const sstep: SpecStep = specGuide.steps[si]
      const add = (check: CheckId, severity: Severity, key: string, message: string) => out.add(check, severity, guide.id, n, key, message)

      // ---- 静止（本步结束） ----
      const vis = restVisible(scene.to)
      const mats = new Map(ids.map((id) => [id, new Matrix4().fromArray(scene.to[id].world)]))
      const snap = new Snapshot(solids, mats, vis, (id, d) => d.frames[scene.to[id].fold])
      frames++

      for (const pl of snap.solids) {
        const low = Math.min(...pl.pts.map((p) => p.y))
        if (low < -TOL.floor) add('floor', 'error', pl.solid.id, `${label(pl.solid.id)} 低于地面 ${(-low).toFixed(1)} mm`)
      }

      const list = snap.solids
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].solid.id
          const b = list[j].solid.id
          if (related(scene.to, a, b)) continue
          const d = snap.depth(list[i], list[j])
          if (d > TOL.through) add('through', 'error', `${a}|${b}`, `${label(a)} × ${label(b)} 穿插 ${d.toFixed(1)} mm`)
        }
      }

      for (const pl of snap.solids) {
        const f = scene.to[pl.solid.id]
        if (f.parent) continue
        const low = Math.min(...pl.pts.map((p) => p.y))
        if (low > TOL.hover) add('hover', 'note', pl.solid.id, `${label(pl.solid.id)} 离地 ${low.toFixed(0)} mm，没有东西托着`)
      }

      const holes = new Map<string, string[]>()
      for (const id of ids) {
        const h = scene.to[id].plugged
        if (!h || !vis(id)) continue
        holes.set(h, [...(holes.get(h) ?? []), id])
        if (!vis(h)) add('plug', 'error', `${id}|hidden`, `${label(id)} 插在看不见的接口 ${label(h)} 上`)
      }
      for (const [h, list] of holes) if (list.length > 1) add('plug', 'error', h, `${list.map(label).join('、')} 同时插在 ${label(h)}`)

      // ---- 镜头 ----
      const views = VIEWPORTS.map((vp) => ({ vp, view: mainView(step, vp) }))
      const desk = views[0].view
      const zoom = scene.zoom && makeView(scene.zoom.focus, scene.zoom.dir, scene.zoom.dist, ZOOM_FOV, 300, 300, true)

      for (const id of scene.highlight) {
        const pl = snap.placed.get(id)
        if (!pl) {
          const leaving = restVisible(scene.from)(id)
          if (solids.has(id) && !leaving) add('view', 'error', `${id}|hidden`, `高亮的 ${label(id)} 在本步始终是隐藏的`)
          continue
        }
        const c = centerOf(pl)
        for (const { vp, view } of views) {
          const s = toScreen(view, c)
          if (!s || !inFrame(view, c, 12)) add('view', vp.severity, `${id}|frame|${vp.name}`, `${vp.name}：高亮的 ${label(id)} 不在画面里`)
          else if (zoom && underInset(vp, s.x, s.y)) add('view', 'warn', `${id}|inset|${vp.name}`, `${vp.name}：高亮的 ${label(id)} 被右上角细节窗挡住`)
        }
        if (!seen(snap, desk, id) && !(zoom && seen(snap, zoom, id))) {
          add('view', 'warn', `${id}|hidden-view`, `高亮的 ${label(id)} 在主画面${zoom ? '和细节窗' : ''}里都被挡住或背对镜头`)
        }
        if (pl.solid.size < SMALL_PART && !zoom) add('step', 'warn', `${id}|small`, `高亮的 ${label(id)} 只有 ${pl.solid.size.toFixed(1)} mm，需要细节窗（zoom）`)
      }

      if (scene.zoom && zoom) {
        const target = sstep.zoom?.target
        if (typeof target === 'string') {
          const pl = snap.placed.get(target)
          if (!pl) add('zoom', 'error', `${target}|hidden`, `细节窗对准的 ${label(target)} 是隐藏的`)
          else {
            if (!seen(snap, zoom, target)) add('zoom', 'error', `${target}|unseen`, `细节窗里看不到 ${label(target)}（被挡住或背对镜头）`)
            const frac = pl.solid.size / 2 / (scene.zoom.dist * Math.tan((ZOOM_FOV / 2) * DEG))
            if (frac < 0.05) add('zoom', 'warn', `${target}|far`, `细节窗里 ${label(target)} 太小（占窗口 ${(frac * 100).toFixed(0)}%），把 zoom.dist 调近`)
          }
        }
      }

      for (const id of ids) {
        if (parts.find((p) => p.id === id)!.shape.type !== 'led') continue
        const f = scene.from[id]
        const g = scene.to[id]
        if (g.light === 'off' || !vis(id)) continue
        const turnedOn = f.light !== g.light || f.color !== g.color
        if (!turnedOn && !scene.highlight.includes(id)) continue
        if (!seen(snap, desk, id) && !(zoom && seen(snap, zoom, id))) add('led', 'error', id, `${label(id)} 在本步亮 / 闪，但主画面和细节窗都看不到它的正面`)
        if (turnedOn && !scene.highlight.includes(id) && sstep.zoom?.target !== id) add('step', 'warn', `${id}|led-hl`, `${label(id)} 的灯在本步变化，但没有高亮也没有细节窗`)
      }

      for (const [view, where, fov] of [[desk, '主画面', MAIN_FOV], ...(zoom ? [[zoom, '细节窗', ZOOM_FOV]] : [])] as [View, string, number][]) {
        for (const [id, pl] of snap.placed) {
          const shape = parts.find((p) => p.id === id)!.shape
          if (shape.type !== 'text') continue
          const o = v3(0, 0, 0).applyMatrix4(pl.world)
          const dist = view.cam.position.distanceTo(o)
          const glyph = ((shape.size * 1.33) / (2 * dist * Math.tan((fov / 2) * DEG))) * view.h
          if (glyph < MIN_GLYPH_PX || !inFrame(view, o) || snap.occluded(view.cam.position, o, id)) continue
          const n = v3(0, 0, 1).transformDirection(pl.world)
          if (n.dot(view.cam.position.clone().sub(o).normalize()) < -0.12) add('mirror', 'warn', `${id}|${where}`, `${where}里的文字 ${label(id)} 是反的（从背面看，检查 rot）`)
        }
      }

      const boxes: { x0: number; y0: number; x1: number; y1: number; i: number }[] = []
      scene.callouts.forEach((c, i) => {
        const pl = snap.placed.get(c.part)
        const hidden = !vis(c.part)
        if (hidden) {
          add('callout', 'error', `${c.text}|hidden`, `标注「${c.text}」指向的 ${label(c.part)} 是隐藏的`)
          return
        }
        const anchor = v3(...(c.at ?? [0, 0, 0])).applyMatrix4(mats.get(c.part)!)
        const o = c.offset ?? [0, 40, 0]
        const tip = anchor.clone().add(v3(o[0], o[1], o[2]))
        const chars = [...c.text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 1 : 0.58), 0)
        const subChars = c.sub ? [...c.sub].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 1 : 0.58), 0) : 0
        const bw = Math.max(chars * 12.5, subChars * 10.5) + 18
        const bh = c.sub ? 36 : 22
        for (const { vp, view } of views) {
          const a = toScreen(view, anchor)
          const t = toScreen(view, tip)
          if (!a || !inFrame(view, anchor, 4)) {
            add('callout', vp.severity, `${c.text}|anchor|${vp.name}`, `${vp.name}：标注「${c.text}」的锚点在画面外`)
            continue
          }
          if (!t || t.x - bw / 2 < 0 || t.x + bw / 2 > vp.w || t.y - bh / 2 < 0 || t.y + bh / 2 > vp.h) {
            add('callout', vp.severity, `${c.text}|label|${vp.name}`, `${vp.name}：标注「${c.text}」的标签超出画面`)
            continue
          }
          if (zoom && underInset(vp, t.x + bw / 2, t.y - bh / 2)) add('callout', 'warn', `${c.text}|inset|${vp.name}`, `${vp.name}：标注「${c.text}」被细节窗挡住`)
          if (vp === VIEWPORTS[0]) boxes.push({ x0: t.x - bw / 2, y0: t.y - bh / 2, x1: t.x + bw / 2, y1: t.y + bh / 2, i })
        }
        if (pl && snap.occluded(desk.cam.position, anchor, c.part) && !pl.pts.some((p) => !snap.occluded(desk.cam.position, p, c.part))) {
          add('callout', 'warn', `${c.text}|occluded`, `标注「${c.text}」指向的 ${label(c.part)} 被挡住了`)
        }
      })
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) {
            add('callout', 'warn', `${a.i}|${b.i}|overlap`, `桌面：标注「${scene.callouts[a.i].text}」和「${scene.callouts[b.i].text}」重叠`)
          }
        }
      }
      if (scene.callouts.length > MAX_CALLOUTS) add('callout', 'warn', 'count', `本步有 ${scene.callouts.length} 个标注，超过 ${MAX_CALLOUTS} 个`)

      // ---- 步骤写法 ----
      if (!sstep.page && spec.genre !== 'tutorial' && (spec.source.images.length || spec.source.url)) add('step', 'warn', 'page', '没有写 page（说明书页码），无法溯源')
      const timing = stepTiming(ids, scene)
      const moved = [...timing.changed].filter((id) => solids.get(id) && !solids.get(id)!.flat)
      if (moved.length && !scene.highlight.length && !scene.callouts.length) add('step', 'warn', 'no-highlight', '本步有零件移动，但没有高亮也没有标注，读者不知道看哪里')
      if (timing.settle > MAX_STEP_SECONDS) add('step', 'warn', 'long', `本步过渡要 ${timing.settle.toFixed(1)} 秒，超过 ${MAX_STEP_SECONDS} 秒，考虑拆成两步`)
      // 一物一画：baked 零件待在原位时只有外观模型里那一份，几何体不画，高亮看不到；
      // 按 / 转 / 晃它时整个父零件这一步换成代理形状，按一下小按键整机就变成方块
      const { resting } = bakedState(parts, scene, timing)
      for (const id of new Set(scene.highlight)) {
        if (resting.has(id)) add('step', 'warn', `${id}|baked`, `${label(id)} 是 baked（长在父零件的外观模型里，原位时不单独画），本步高亮它却看不到：要单独演示的件做成几何体（生成外观模型前在参考图里用外壳颜色抹平它），去掉 baked`)
      }
      const bareAnyway = bakedState(parts, { ...scene, actions: [] }, timing).bare
      for (const a of scene.actions) {
        const parent = parts.find((p) => p.id === a.part)?.rest?.parent
        if (parent && !bareAnyway.has(parent)) add('step', 'warn', `${a.part}|baked-act`, `${label(a.part)} 是 baked，本步${a.type === 'press' ? '按' : '动'}它时整个 ${label(parent)} 换成代理形状（外观模型这一步不显示）：按键、旋钮这类小件做成几何体（参考图里抹平）；手柄、盖子这类大件本来一动就换代理形状，确认这一步可以接受`)
      }
      for (const id of Object.keys(sstep.set ?? {})) {
        const f = scene.from[id]
        const g = scene.to[id]
        if (!f || !g) continue
        const same = sameTransform(f, g) && f.visible === g.visible && f.light === g.light && f.color === g.color && f.ui === g.ui && f.edges === g.edges && f.fold === g.fold && !g.via && !g.lift
        if (same) add('step', 'warn', `${id}|noop`, `set 里写了 ${label(id)}，但它在本步没有任何变化`)
      }

      // ---- 过渡途中 ----
      frames += flight(scene, timing, solids, label, add)
    })
  })

  const findings = out.findings
  return {
    findings,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warn').length,
    stats: { steps, frames, parts: parts.length },
  }
}

function flight(
  scene: NonNullable<Step['scene']>,
  timing: StepTiming,
  solids: Map<string, Solid>,
  label: (id: string) => string,
  add: (check: CheckId, severity: Severity, key: string, message: string) => void,
) {
  if (!timing.changed.size) return 0
  const t0 = Math.min(...[...timing.changed].map((id) => scene.to[id].delay))
  const t1 = timing.settle
  if (t1 <= t0) return 0
  const pose: Pose = { mats: new Map(), vis: new Map(), glide: [0, 0] }
  const moving = (id: string, t: number) => {
    for (let p: string | null = id; p; p = scene.to[p].parent) {
      if (timing.changed.has(p)) {
        const k = progressAt(scene, timing, p, t)
        if (k > 0 && k < 1) return true
      }
    }
    return false
  }
  let frames = 0
  const buf = new Map<string, Matrix4[]>()
  for (let i = 0; i < FLIGHT_SAMPLES; i++) {
    const t = t0 + ((t1 - t0) * (i + 0.5)) / FLIGHT_SAMPLES
    solvePose(scene, timing, t, pose)
    const folds: FoldMats = (id, d) => {
      const out = buf.get(id) ?? []
      buf.set(id, out)
      return foldFrame(d, scene.from[id].fold, scene.to[id].fold, progressAt(scene, timing, id, t), out)
    }
    const snap = new Snapshot(solids, pose.mats, (id) => pose.vis.get(id) !== false, folds)
    frames++
    const list = snap.solids
    for (const pl of list) {
      if (!moving(pl.solid.id, t)) continue
      const low = Math.min(...pl.pts.map((p) => p.y))
      if (low < -TOL.floor) add('flight', 'error', `${pl.solid.id}|floor`, `${label(pl.solid.id)} 在过渡中穿进地面 ${(-low).toFixed(1)} mm（加大 lift 或调整姿态）`)
    }
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a].solid.id
        const B = list[b].solid.id
        if (!moving(A, t) && !moving(B, t)) continue
        const inFrom = related(scene.from, A, B)
        const inTo = related(scene.to, A, B)
        if (inFrom && inTo) {
          // 同一个宿主上换接口：途中不能穿过宿主；同一接口里推进 / 拔插是预期的
          const plugMover = [A, B].find((id) => timing.changed.has(id) && scene.from[id].plugged !== scene.to[id].plugged)
          if (!plugMover) continue
          const k = progressAt(scene, timing, plugMover, t)
          if (k < 0.2 || k > 0.8) continue
        } else if (inFrom || inTo) {
          // 装上 / 取下：只在离开旧父级之后、贴上新父级之前检查
          const movers = [A, B].filter((id) => timing.changed.has(id) && scene.from[id].parent !== scene.to[id].parent)
          const pick = movers.length ? movers : [A, B].filter((id) => timing.changed.has(id))
          const k = Math.max(...pick.map((id) => progressAt(scene, timing, id, t)))
          if (inTo && k > 0.8) continue
          if (inFrom && k < 0.2) continue
        }
        const d = snap.depth(list[a], list[b])
        if (d > TOL.through) add('flight', 'error', `${A}|${B}`, `${label(A)} × ${label(B)} 在过渡中穿插 ${d.toFixed(1)} mm（加 via 绕开，或调整 delay 让它们错开）`)
      }
    }
  }
  return frames
}

const ranges = (steps: number[]) => {
  const s = [...steps].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `#${s[i]}–${s[j]}` : `#${s[i]}`)
    i = j
  }
  return out.join(', ')
}

/** 文字报告：每项检查一行计数，问题逐条列出，最后一行 audit passed / audit failed */
export function formatReport(report: AuditReport): string[] {
  const lines: string[] = []
  for (const c of CHECKS) {
    const list = report.findings.filter((f) => f.check === c.id)
    const errors = list.filter((f) => f.severity === 'error').length
    const warns = list.filter((f) => f.severity === 'warn').length
    const notes = list.filter((f) => f.severity === 'note').length
    const count = c.severity === 'note' ? `${notes} 条（只需阅读，不算失败）` : `${errors} problems${warns ? ` · ${warns} warnings` : ''}`
    lines.push(`  ${c.label}: ${count}`)
    for (const f of list) {
      const mark = f.severity === 'error' ? '✗' : f.severity === 'warn' ? '!' : '·'
      lines.push(`    ${mark} ${f.guide} ${ranges(f.steps)}  ${f.message}`)
    }
  }
  const { steps, frames, parts } = report.stats
  lines.push(`  audit · ${parts} 零件 · ${steps} 步 · ${frames} 帧`)
  lines.push(report.errors ? `  audit failed: ${report.errors} problems` : `  audit passed${report.warnings ? `（${report.warnings} warnings 请逐条看过）` : ''}`)
  return lines
}
