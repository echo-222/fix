import { Euler, Quaternion, Vector3 } from 'three'
import type { Vec3 } from '../types'

/** 立体书教程共用的小工具：纸片轮廓、开窗、欧拉角换算。不导出 ManualSpec，不会出现在首页 */

export type P2 = [number, number]

const DEG = Math.PI / 180
export const round = (v: number, k = 100) => Math.round(v * k) / k

/** 俯视矩形 [x, z]，中心 (cx, cz) */
export function rect(w: number, d: number, cx = 0, cz = 0): P2[] {
  return [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]
}

/** 俯视圆（多边形），从 +x 起绕 +y 逆时针 */
export function circle(r: number, n = 40, cx = 0, cz = 0): P2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [round(cx + r * Math.cos(a)), round(cz - r * Math.sin(a))] as P2
  })
}

const area = (pts: P2[]) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length]
  return s + p[0] * q[1] - q[0] * p[1]
}, 0)

/**
 * 开窗的纸片：sheet 不支持挖洞，就从外框最近的一点拉一条零宽的「桥」进窗口，窗口反向绕一圈再原路出来。
 * 返回顶点和对应的 edges：外框第 i 条边用 outerEdges[i]，窗口一圈用 ringEdge，桥的两条边不画。
 * hole[0] 要选离外框最近的那一点，桥才不会横穿窗口
 */
export function windowed(outer: P2[], hole: P2[], outerEdges = 'h'.repeat(outer.length), ringEdge = 'h'): { points: P2[]; edges: string } {
  const h0 = hole[0]
  let best = { d: Infinity, i: 0, p: outer[0] }
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((h0[0] - a[0]) * ex + (h0[1] - a[1]) * ez) / (ex * ex + ez * ez)))
    const p: P2 = [round(a[0] + ex * t), round(a[1] + ez * t)]
    const d = Math.hypot(p[0] - h0[0], p[1] - h0[1])
    if (d < best.d) best = { d, i, p }
  }
  const ring = Math.sign(area(hole)) === Math.sign(area(outer)) ? [hole[0], ...hole.slice(1).reverse()] : hole
  // 每个顶点带上「从它到下一个顶点」那条边的画法
  const seq: [P2, string][] = outer.slice(0, best.i + 1).map((p, i) => [p, outerEdges[i]])
  const a = outer[best.i]
  if (a[0] !== best.p[0] || a[1] !== best.p[1]) seq.push([best.p, '-'])
  else seq[seq.length - 1][1] = '-'
  for (const p of ring) seq.push([p, ringEdge])
  seq.push([ring[0], '-'], [best.p, outerEdges[best.i]])
  outer.slice(best.i + 1).forEach((p, k) => seq.push([p, outerEdges[best.i + 1 + k]]))
  return { points: seq.map((s) => s[0]), edges: seq.map((s) => s[1]).join('') }
}

/** 四元数 → 欧拉角（度，XYZ），给 rot 用 */
export function euler(q: Quaternion): Vec3 {
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return [round(e.x / DEG, 1000), round(e.y / DEG, 1000), round(e.z / DEG, 1000)]
}

export const quat = (rot: Vec3) => new Quaternion().setFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ'))
export const axisQuat = (axis: Vector3 | Vec3, deg: number) =>
  new Quaternion().setFromAxisAngle(Array.isArray(axis) ? new Vector3(...axis).normalize() : axis.clone().normalize(), deg * DEG)
