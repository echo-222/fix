import { Matrix4, Quaternion, Vector3 } from 'three'
import type { CutItem, Guide, HwItem, ModelBase, Part, PartGroup, Q4, Step, ToolSpec, V3 } from '../types'
import { CLAMP, COLLAR, MATERIAL, SHAFT, SHF, WOOD, type ShaftD, type ShaftMaterial, type Wood } from './specs'

export interface ShaftModel<C, I = unknown> extends ModelBase {
  config: C
  d: ShaftD
  boardT: number
  feet: 'leveler' | 'pad'
  info: I
}

export type FieldValue = string | number | boolean
export type Field<C> =
  | { type: 'num'; key: keyof C & string; label: string; min: number; max: number; step: number; unit?: string; show?: (c: C) => boolean }
  | { type: 'seg'; key: keyof C & string; label: string; options: { value: string | number; label: string; hint?: string }[]; show?: (c: C) => boolean }
  | { type: 'bool'; key: keyof C & string; label: string; hint?: string; show?: (c: C) => boolean }
export interface FieldGroup<C> {
  title: string
  fields: Field<C>[]
}

/** 按字段定义把数值夹到允许范围内 */
export function clampByFields<C extends object>(c: C, groups: FieldGroup<C>[]): C {
  const n = { ...c } as Record<string, FieldValue>
  for (const g of groups) {
    for (const f of g.fields) {
      if (f.type !== 'num') continue
      const v = Number(n[f.key])
      n[f.key] = Math.min(f.max, Math.max(f.min, Math.round((Number.isFinite(v) ? v : f.min) / f.step) * f.step))
    }
  }
  return n as C
}

export function basisQuat(x: V3, y: V3): Q4 {
  const X = new Vector3(...x).normalize()
  const Y = new Vector3(...y).normalize()
  const Z = new Vector3().crossVectors(X, Y)
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z))
  return [q.x, q.y, q.z, q.w]
}

export function yawQuat(dir: V3): Q4 {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-dir[2], dir[0]))
  return [q.x, q.y, q.z, q.w]
}

export const FLIP_X: Q4 = [1, 0, 0, 0]

export function toWorld(part: Part, local: V3): V3 {
  const v = new Vector3(...local)
  if (part.quaternion) v.applyQuaternion(new Quaternion(...part.quaternion))
  return [v.x + part.position[0], v.y + part.position[1], v.z + part.position[2]]
}

export function dirWorld(part: Part, local: V3): V3 {
  const v = new Vector3(...local)
  if (part.quaternion) v.applyQuaternion(new Quaternion(...part.quaternion))
  return [v.x, v.y, v.z]
}

export const keySize = (key: number) => key * 6.5
export const norm2 = (x: number, z: number): V3 => {
  const l = Math.hypot(x, z) || 1
  return [x / l, 0, z / l]
}

export class Builder {
  parts: Part[] = []
  constructor(private d: ShaftD, private material: ShaftMaterial) {}
  push(p: Part) {
    this.parts.push(p)
    return p.id
  }
  rod(id: string, name: string, group: PartGroup, length: number, axis: 'x' | 'y' | 'z', position: V3, enterFrom: V3, delay?: number) {
    const L = Math.round(length)
    return this.push({
      id, name, group, spec: `Ø${this.d} ${MATERIAL[this.material].short} · ${L}mm`,
      geo: { kind: 'rod', d: this.d, length: L, axis }, position, enterFrom, delay,
    })
  }
  /** 限位环，顶丝朝 dir 方向 */
  collar(id: string, position: V3, dir: V3, enterFrom: V3, delay?: number) {
    return this.push({
      id, name: '限位环', group: 'bracket', spec: `Ø${this.d} 顶丝式 · ${COLLAR[this.d].screw}`,
      geo: { kind: 'collar', d: this.d }, position, quaternion: yawQuat(dir), enterFrom, delay,
    })
  }
  board(id: string, name: string, wood: Wood, w: number, t: number, d: number, holes: [number, number][], position: V3, enterFrom: V3, delay?: number) {
    return this.push({
      id, name, group: 'top', spec: `${WOOD[wood].name} ${w}×${d}×${t}`,
      geo: { kind: 'board', w, t, d, holes, hd: this.d + 0.5 }, position, enterFrom, delay,
    })
  }
  get byId() {
    return Object.fromEntries(this.parts.map((p) => [p.id, p]))
  }
}

export function rodCutList(parts: Part[], note: (p: Part) => string | undefined, material: ShaftMaterial): CutItem[] {
  const map = new Map<string, CutItem>()
  for (const p of parts) {
    if (p.geo.kind !== 'rod') continue
    const base = p.name.replace(/^(左|右|前|后)+(侧)?/, '').replace(/^[左右前后]/, '')
    const key = `${p.geo.d}-${p.geo.length}-${base}`
    const item = map.get(key)
    if (item) item.qty++
    else map.set(key, { key, name: base, profile: `Ø${p.geo.d} ${MATERIAL[material].short}`, length: p.geo.length, qty: 1, note: note(p) })
  }
  return [...map.values()].sort((a, b) => b.length - a.length)
}

export function rodWeightPrice(parts: Part[], material: ShaftMaterial) {
  let kg = 0
  let cny = 0
  for (const p of parts) {
    if (p.geo.kind !== 'rod') continue
    const s = SHAFT[p.geo.d as ShaftD]
    kg += (s.kgPerM * p.geo.length) / 1000
    cny += ((s.pricePerM * p.geo.length) / 1000) * MATERIAL[material].priceK
  }
  return { kg, cny }
}

export function boardWeightPrice(wood: Wood, w: number, d: number, t: number) {
  const area = (w * d) / 1e6
  return { kg: area * (t / 1000) * WOOD[wood].density, cny: Math.round(WOOD[wood].pricePerM2 * area * (t / 18)) }
}

export const hwTotal = (hw: HwItem[]) => hw.reduce((s, h) => s + h.price * h.qty, 0)

/** 组装指南拼装器：记录零件首次出现的步骤 */
export class GuideBuilder {
  steps: Step[] = []
  installAt: Record<string, number> = {}
  add(s: Omit<Step, 'active'> & { active?: string[] }, newParts: string[] = []) {
    for (const id of newParts) this.installAt[id] = this.steps.length
    this.steps.push({ ...s, active: s.active?.length ? s.active : newParts })
  }
  build(summary: string): Guide {
    return { id: 'assembly', kind: 'assembly', title: '安装指南', summary, visibility: 'progressive', steps: this.steps, installAt: this.installAt }
  }
}

export function repairGuide(id: string, title: string, minutes: number, steps: Step[]): Guide {
  return { id, kind: 'repair', title, summary: `${steps.length} 步 · 约 ${minutes} 分钟`, visibility: 'all', steps, installAt: {} }
}

export const VIEW = {
  iso: [1.1, 0.8, 1.5] as V3,
  front: [0.35, 0.45, 1.6] as V3,
  frontLeft: [-1.25, 0.55, 1.0] as V3,
  frontRight: [1.25, 0.55, 1.0] as V3,
  low: [0.9, 0.22, 1.35] as V3,
  high: [0.8, 1.25, 1.1] as V3,
  side: [1.6, 0.4, 0.5] as V3,
  back: [0.9, 0.6, -1.35] as V3,
}

export function collarTool(collar: Part, d: ShaftD): ToolSpec {
  const dir = dirWorld(collar, [1, 0, 0])
  return { at: toWorld(collar, [COLLAR[d].od / 2, 0, 0]), axis: dir, size: keySize(COLLAR[d].key) }
}

/** T 型夹立柱孔凸台：截面边长与长度 */
export const teeBoss = (d: ShaftD) => ({ bs: CLAMP[d].a * 0.8, len: CLAMP[d].a * 0.9 })

/**
 * 夹具螺丝在零件局部坐标中的位置（与 geometries.ts 中的造型一致）：
 * 十字夹 a 瓣孔沿 X、位于 +Y；b 瓣孔沿 Z、位于 −Y。T 型夹通孔沿 X，立柱孔沿 +Y。
 */
export function screwLocal(kind: 'crossA' | 'crossB' | 'teeThrough' | 'teeBoss' | 'shf', d: ShaftD): { at: V3; axis: V3 } {
  const a = CLAMP[d].a
  switch (kind) {
    case 'crossA': return { at: [0, 0.75 * a + d / 4, a / 2], axis: [0, 0, 1] }
    case 'crossB': return { at: [a / 2, -(0.75 * a + d / 4), 0], axis: [1, 0, 0] }
    case 'teeThrough': return { at: [0, -(a + d) / 4, a / 2], axis: [0, 0, 1] }
    case 'teeBoss': {
      const { bs, len } = teeBoss(d)
      return { at: [bs / 2, a / 2 + len / 2, (d + bs) / 4], axis: [1, 0, 0] }
    }
    case 'shf': {
      const s = SHF[d]
      return { at: [6, -(s.T + (s.L - s.T) / 2), s.G / 2 + 2], axis: [1, 0, 0] }
    }
  }
}

export function screwTool(part: Part, kind: Parameters<typeof screwLocal>[0], d: ShaftD): ToolSpec {
  const s = screwLocal(kind, d)
  const key = kind === 'shf' ? SHF[d].key : CLAMP[d].key
  return { at: toWorld(part, s.at), axis: dirWorld(part, s.axis), size: keySize(key) }
}

export function overallDist(dims: ModelBase['dims']) {
  return Math.hypot(dims.width, dims.depth, dims.height) * 1.75
}

/** 爆炸图（与 Scene.tsx 中的 explode 偏移一致）的包围盒 */
function explodedBox(m: ModelBase) {
  const lo: V3 = [Infinity, Infinity, Infinity]
  const hi: V3 = [-Infinity, -Infinity, -Infinity]
  const k: V3 = [0.55, 0.35, 0.55]
  for (const p of m.parts) {
    const g = p.geo
    const half: V3 = [0, 0, 0]
    if (g.kind === 'rod') half['xyz'.indexOf(g.axis)] = g.length / 2
    else if (g.kind === 'board') half.splice(0, 3, g.w / 2, g.t / 2, g.d / 2)
    for (let i = 0; i < 3; i++) {
      const c = p.position[i] + (p.position[i] - m.center[i]) * k[i] + p.enterFrom[i] * 0.4
      lo[i] = Math.min(lo[i], c - half[i])
      hi[i] = Math.max(hi[i], c + half[i])
    }
  }
  return { lo, hi }
}

export function explodeStep(m: ModelBase, desc: string, tip?: string): Step {
  const { lo, hi } = explodedBox(m)
  const spanY = hi[1] - lo[1]
  const spanXZ = Math.hypot(hi[0] - lo[0], hi[2] - lo[2])
  // iso 视角俯角约 23°，进深也会占屏幕高度；竖直视场 30°
  const screenH = spanY * 0.92 + spanXZ * 0.4
  const D = Math.max(overallDist(m.dims) * 1.1, screenH * 2.65, spanXZ * 1.6)
  return {
    id: 'overview', title: '清点零件', desc,
    chips: [
      ...m.cutList.slice(0, 2).map((ci) => ({ label: `${ci.name} × ${ci.qty}`, sub: `${ci.profile} · ${ci.length}` })),
      ...m.hardware.filter((h) => h.unit !== '块').slice(0, 2).map((h) => ({ label: `${h.name} × ${h.qty}` })),
    ],
    active: [], motion: 'explode',
    focus: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2 - spanY * 0.04, (lo[2] + hi[2]) / 2], view: { dir: VIEW.iso, dist: D }, tip,
  }
}
