import { Matrix4, Quaternion, Vector3 } from 'three'
import type { PartFrame, ScenePart, SceneStep } from './compile'
import type { Light } from './types'

/**
 * 某一步在 t 秒时所有零件的世界矩阵与可见性。
 * ManualStage 每帧调用，audit.ts 用同一份代码抽样过渡途中的姿态，保证审计看到的就是画面上的。
 */
export interface Pose {
  mats: Map<string, Matrix4>
  vis: Map<string, boolean>
  /** glide 动作当前的桌面偏移（x, z），屏幕光标同步 */
  glide: [number, number]
}

export interface StepTiming {
  /** 父级在前 */
  order: string[]
  /** 本步位置 / 姿态 / 可见性 / 折纸步数有变化的零件；位置不变但写了 via / lift 的零件走一个来回（拔出再插回、拿起再放下） */
  changed: Set<string>
  /** 所有过渡结束的时刻（秒），动作默认从这里开始 */
  settle: number
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const glideAt = (t: number): [number, number] => [42 * Math.sin(t * 1.5), 20 * Math.sin(t * 3)]

export function sameTransform(a: Pick<PartFrame, 'parent' | 'pos' | 'quat'>, b: Pick<PartFrame, 'parent' | 'pos' | 'quat'>) {
  return a.parent === b.parent && a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-6) && a.quat.every((v, i) => Math.abs(v - b.quat[i]) < 1e-6)
}

export function stepTiming(ids: string[], scene: SceneStep): StepTiming {
  // 新旧父级都要先算：延迟换父级的零件在出发前跟着旧父级走
  const order: string[] = []
  const state = new Map<string, 1 | 2>()
  const visit = (id: string) => {
    if (state.get(id)) return
    state.set(id, 1)
    for (const p of [scene.from[id]?.parent, scene.to[id]?.parent]) if (p && !state.get(p)) visit(p)
    state.set(id, 2)
    order.push(id)
  }
  ids.forEach(visit)
  const changed = new Set(ids.filter((id) => {
    const f = scene.from[id]
    const g = scene.to[id]
    return !sameTransform(f, g) || f.visible !== g.visible || g.via !== null || g.lift > 0 || f.fold !== g.fold
  }))
  let settle = 0
  for (const id of ids) {
    const g = scene.to[id]
    const f = scene.from[id]
    if (changed.has(id) || f.light !== g.light || f.ui !== g.ui || f.edges !== g.edges) settle = Math.max(settle, g.delay + (changed.has(id) ? g.dur : 0))
  }
  return { order, changed, settle }
}

/**
 * baked 零件（长在父零件的外观模型里）这一步怎么画：待在原位就不单独画（resting）；
 * 一旦被挪动或被按 / 转 / 晃（actions），模型里那一份就不对了，父零件这一步改画代理形状（bare），它的 baked 零件全部单独画。
 */
export function bakedState(parts: Pick<ScenePart, 'id' | 'rest'>[], scene: SceneStep, timing: StepTiming) {
  const still = new Set<string>()
  const bare = new Set<string>()
  const acted = new Set(scene.actions.map((a) => a.part))
  for (const p of parts) {
    if (!p.rest) continue
    if (!timing.changed.has(p.id) && !acted.has(p.id) && sameTransform(scene.from[p.id], p.rest) && sameTransform(scene.to[p.id], p.rest)) still.add(p.id)
    else if (p.rest.parent) bare.add(p.rest.parent)
  }
  const resting = new Set(parts.filter((p) => still.has(p.id) && !bare.has(p.rest!.parent ?? '')).map((p) => p.id))
  return { resting, bare }
}

/** 零件在 t 时刻的过渡进度（缓动后，0 → 1）；没有变化的零件恒为 1 */
export function progressAt(scene: SceneStep, timing: StepTiming, id: string, t: number) {
  const g = scene.to[id]
  return timing.changed.has(id) ? easeInOut(clamp01((t - g.delay) / g.dur)) : 1
}

/** 这一步状态在 t 时刻生效的那一份（灯 / 屏幕在过渡开始时切换） */
export const activeFrame = (scene: SceneStep, id: string, t: number) => (t >= scene.to[id].delay ? scene.to[id] : scene.from[id])

export function ledLit(scene: SceneStep, id: string, t: number) {
  const to = scene.to[id]
  const f = activeFrame(scene, id, t)
  const phase = f === to ? t - to.delay : t + 10
  const blink = (phase * 2.4) % 1 < 0.55
  const L: Light = f.light
  return L === 'on' || (L === 'blink' && blink) || (L === 'blinkThenOff' && phase < 3.6 && blink) ? f.color : null
}

const tmp = {
  p0: new Vector3(), p1: new Vector3(), p: new Vector3(), c: new Vector3(), s: new Vector3(),
  q0: new Quaternion(), q1: new Quaternion(), q: new Quaternion(), d: new Quaternion(), qi: new Quaternion(),
  u: new Vector3(), ax: new Vector3(),
  local: new Matrix4(), m: new Matrix4(), one: new Vector3(1, 1, 1),
}
const IDENTITY = new Matrix4()
const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }
const DEG = Math.PI / 180
/** spin 缺省转速（圈 / 秒） */
const SPIN = 4 / (Math.PI * 2)

/** swing / slide 的波形：sin(2π(t / period + phase))，clip 只留一个半波 */
function wave(at: number, period = 2, phase = 0, clip?: 'pos' | 'neg') {
  const v = Math.sin(Math.PI * 2 * (at / period + phase))
  return clip === 'pos' ? Math.max(0, v) : clip === 'neg' ? Math.min(0, v) : v
}

export function solvePose(scene: SceneStep, timing: StepTiming, t: number, pose: Pose) {
  const { mats, vis } = pose
  const { p0, p1, p, c, s, q0, q1, q, d, qi, u, ax, local, m, one } = tmp
  pose.glide = [0, 0]
  for (const id of timing.order) {
    const f = scene.from[id]
    const g = scene.to[id]
    const moving = timing.changed.has(id)
    const k = progressAt(scene, timing, id, t)
    const parentW = g.parent ? mats.get(g.parent) ?? IDENTITY : IDENTITY
    const world = mats.get(id) ?? new Matrix4()
    if (moving && g.arc && f.parent === g.parent && !g.via) {
      // 绕 arc 点转：p = c + R(kθ)(p0 - c)，终点和纯转动的差按进度补上；给了 axis 就按右手定则从这个方向转（翻 180° 时不会从桌面底下绕）
      q0.fromArray(f.quat)
      d.copy(q1.fromArray(g.quat)).multiply(qi.copy(q0).invert())
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
      const half = Math.sqrt(Math.max(0, 1 - d.w * d.w))
      let theta = half < 1e-7 ? 0 : 2 * Math.acos(Math.min(1, d.w))
      u.set(d.x, d.y, d.z)
      if (half < 1e-7) u.set(1, 0, 0)
      else u.divideScalar(half)
      const arc = Array.isArray(g.arc) ? { at: g.arc, axis: null } : g.arc
      if (arc.axis && theta > 1e-6 && u.dot(ax.fromArray(arc.axis)) < 0) {
        u.negate()
        theta = Math.PI * 2 - theta
      }
      c.fromArray(arc.at)
      p0.fromArray(f.pos).sub(c)
      s.copy(p0).applyQuaternion(d).add(c)
      p1.fromArray(g.pos).sub(s)
      q.setFromAxisAngle(u, theta * k)
      p.copy(p0).applyQuaternion(q).add(c).addScaledVector(p1, k)
      q.multiply(q0)
      world.multiplyMatrices(parentW, local.compose(p, q, one))
    } else if (!moving || (f.parent === g.parent && !g.via)) {
      p.fromArray(f.pos).lerp(p1.fromArray(g.pos), k)
      q.fromArray(f.quat).slerp(q1.fromArray(g.quat), k)
      world.multiplyMatrices(parentW, local.compose(p, q, one))
    } else {
      const oldW = f.parent ? mats.get(f.parent) ?? IDENTITY : IDENTITY
      m.multiplyMatrices(oldW, local.compose(p0.fromArray(f.pos), q0.fromArray(f.quat), one)).decompose(p0, q0, s)
      m.multiplyMatrices(parentW, local.compose(p1.fromArray(g.pos), q1.fromArray(g.quat), one)).decompose(p1, q1, s)
      if (g.via) {
        c.fromArray(g.via).multiplyScalar(2).addScaledVector(p0, -0.5).addScaledVector(p1, -0.5)
        p.copy(p0).multiplyScalar((1 - k) * (1 - k)).addScaledVector(c, 2 * (1 - k) * k).addScaledVector(p1, k * k)
      } else p.lerpVectors(p0, p1, k)
      q.slerpQuaternions(q0, q1, k)
      world.compose(p, q, one)
    }
    if (moving && g.lift) world.elements[13] += g.lift * Math.sin(Math.PI * k)
    for (const a of scene.actions) {
      if (a.part !== id) continue
      const at = t - (a.delay ?? timing.settle)
      if (at < 0) continue
      if (a.type === 'press') {
        const cyc = at % 1.6
        const down = cyc < 0.12 ? cyc / 0.12 : cyc < 0.3 ? 1 : cyc < 0.45 ? 1 - (cyc - 0.3) / 0.15 : 0
        world.multiply(m.makeTranslation(0, -(a.depth ?? 1.2) * down, 0))
      } else if (a.type === 'spin') {
        world.multiply(m.makeRotationAxis(AXES[a.axis ?? 'x'], -at * Math.PI * 2 * (a.speed ?? SPIN)))
      } else if (a.type === 'swing') {
        const w = wave(at, a.period, a.phase, a.clip)
        const amp = a.amp * DEG
        world.multiply(m.makeRotationAxis(AXES[a.axis ?? 'z'], a.crank ? Math.asin(Math.sin(amp) * w) : amp * w))
      } else if (a.type === 'slide') {
        const x = Math.PI * 2 * (at / (a.period ?? 2) + (a.phase ?? 0))
        const d = a.rod ? a.amp * Math.sin(x) + Math.sqrt(Math.max(0, a.rod * a.rod - (a.amp * Math.cos(x)) ** 2)) - a.rod : a.amp * wave(at, a.period, a.phase, a.clip)
        const ax = AXES[a.axis ?? 'y']
        world.multiply(m.makeTranslation(ax.x * d, ax.y * d, ax.z * d))
      } else if (a.type === 'shake') {
        const amp = (a.amp ?? 1.5) * Math.sin(at * 18) * (at % 2 < 0.8 ? 1 : 0)
        const ax = AXES[a.axis ?? 'x']
        world.multiply(m.makeTranslation(ax.x * amp, ax.y * amp, ax.z * amp))
      } else if (a.type === 'glide') {
        const [dx, dz] = glideAt(at)
        pose.glide = [dx, dz]
        world.premultiply(m.makeTranslation(dx, 0, dz))
      }
    }
    mats.set(id, world)
    const own = f.visible === g.visible ? g.visible : g.visible ? t >= g.delay : k < 1
    vis.set(id, own && (!g.parent || vis.get(g.parent) !== false))
  }
}
