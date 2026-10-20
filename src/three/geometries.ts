import {
  BoxGeometry, BufferGeometry, CylinderGeometry, EdgesGeometry, ExtrudeGeometry, Path, Shape,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { PROFILES, type ProfileId } from '../domain/profiles'
import { CLAMP, COLLAR, SHF, type ShaftD } from '../domain/shaft/specs'
import type { GeoSpec } from '../domain/types'

/**
 * 欧标型材截面：四边 T 型槽 + 倒角 + 中心孔。
 * simple 版只保留槽口，整桌视角下线条更干净；特写使用完整 T 型腔。
 */
export function profileShape(id: ProfileId, simple = false): Shape {
  const p = PROFILES[id]
  const m = p.module
  const W = p.cols * m
  const H = p.rows * m
  const o = p.slot / 2
  const neck = m * (simple ? 0.16 : 0.1)
  const cav = m * 0.27
  const cavD = m * 0.22
  const ch = simple ? 0 : m * 0.05
  const corners: [number, number][] = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]]
  const pts: [number, number][] = []
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = corners[i]
    const [ex, ey] = corners[(i + 1) % 4]
    const len = Math.hypot(ex - sx, ey - sy)
    const dx = (ex - sx) / len
    const dy = (ey - sy) / len
    const nx = -dy
    const ny = dx
    const P = (u: number, v: number): [number, number] => [sx + dx * u + nx * v, sy + dy * u + ny * v]
    if (ch > 0) pts.push(P(ch, 0))
    else pts.push(P(0, 0))
    const count = Math.round(len / m)
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) * m
      if (simple) pts.push(P(t - o, 0), P(t - o, neck), P(t + o, neck), P(t + o, 0))
      else {
        pts.push(
          P(t - o, 0), P(t - o, neck), P(t - cav, neck), P(t - cav * 0.55, neck + cavD),
          P(t + cav * 0.55, neck + cavD), P(t + cav, neck), P(t + o, neck), P(t + o, 0),
        )
      }
    }
    if (ch > 0) pts.push(P(len - ch, 0))
  }
  const shape = new Shape()
  shape.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1])
  shape.closePath()
  for (let cx = 0; cx < p.cols; cx++) {
    for (let cy = 0; cy < p.rows; cy++) {
      const hole = new Path()
      hole.absarc(-W / 2 + (cx + 0.5) * m, -H / 2 + (cy + 0.5) * m, p.centerHole / 2, 0, Math.PI * 2, true)
      shape.holes.push(hole)
    }
  }
  return shape
}

function profileGeometry(id: ProfileId, length: number, axis: 'x' | 'y' | 'z', full = false) {
  const g = new ExtrudeGeometry(profileShape(id, !full), { depth: length, bevelEnabled: false, curveSegments: 8 })
  g.translate(0, 0, -length / 2)
  if (axis === 'y') g.rotateX(-Math.PI / 2)
  if (axis === 'x') g.rotateY(Math.PI / 2)
  return g
}

/** 压铸角码：局部 X 沿横梁、Y 沿桌腿面，原点在内角 */
function bracketGeometry(size: number) {
  const a = size * 0.9
  const t = size * 0.14
  const s = new Shape()
  s.moveTo(0, 0)
  s.lineTo(a, 0)
  s.lineTo(a, t)
  s.lineTo(t, a)
  s.lineTo(0, a)
  s.closePath()
  const h = new Path()
  h.moveTo(t * 1.25, t * 1.25)
  h.lineTo(t * 1.25, a - t * 1.5)
  h.lineTo(a - t * 1.5, t * 1.25)
  h.closePath()
  s.holes.push(h)
  const w = size * 0.72
  const g = new ExtrudeGeometry(s, { depth: w, bevelEnabled: false })
  g.translate(0, 0, -w / 2)
  return g
}

function cyl(rTop: number, rBot: number, h: number, y: number, seg = 28) {
  const g = new CylinderGeometry(rTop, rBot, h, seg, 1)
  g.translate(0, y, 0)
  return g
}

function merge(list: BufferGeometry[]) {
  const norm = list.map((g) => (g.index ? g.toNonIndexed() : g))
  for (const g of norm) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
  }
  return mergeGeometries(norm, false)!
}

/** 调节脚杯：原点在桌腿底面，向下延伸 size */
function levelerGeometry(size: number) {
  return merge([
    cyl(4, 4, 12, -6, 12),
    cyl(6.5, 6.5, 5, -4.5, 6),
    cyl(8, 17, 5, -size + 9.5),
    cyl(19, 19, 7, -size + 3.5),
  ])
}

function casterGeometry(size: number) {
  const fork = (x: number) => {
    const g = new BoxGeometry(3, 40, 24)
    g.translate(x, -36, 6)
    return g
  }
  const wheel = new CylinderGeometry(25, 25, 16, 28, 1)
  wheel.rotateZ(Math.PI / 2)
  wheel.translate(0, -size + 25, 9)
  const hub = new CylinderGeometry(8, 8, 22, 16, 1)
  hub.rotateZ(Math.PI / 2)
  hub.translate(0, -size + 25, 9)
  const brake = new BoxGeometry(14, 4, 16)
  brake.translate(0, -22, -14)
  return merge([cyl(4, 4, 10, -5, 12), cyl(18, 18, 6, -13), cyl(14, 16, 3, -17.5), fork(-11), fork(11), wheel, hub, brake])
}

/** 板材：holes 为板面上的通孔中心 [x, z] */
function boardGeometry(w: number, t: number, d: number, holes: [number, number][] = [], hd = 12) {
  const r = 8
  const s = new Shape()
  const x0 = -w / 2
  const y0 = -d / 2
  s.moveTo(x0 + r, y0)
  s.lineTo(x0 + w - r, y0)
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r)
  s.lineTo(x0 + w, y0 + d - r)
  s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d)
  s.lineTo(x0 + r, y0 + d)
  s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r)
  s.lineTo(x0, y0 + r)
  s.quadraticCurveTo(x0, y0, x0 + r, y0)
  for (const [hx, hz] of holes) {
    const h = new Path()
    h.absarc(hx, -hz, hd / 2, 0, Math.PI * 2, true)
    s.holes.push(h)
  }
  const g = new ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: holes.length ? 18 : 4 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -t / 2, 0)
  return g
}

// ---------- 光轴与配套件 ----------

/** 圆柱轮廓（局部坐标）：EdgesGeometry 画不出圆柱侧面的轮廓线，由 LineMesh 按视角实时补上 */
export interface CylOutline {
  c: [number, number, number]
  a: [number, number, number]
  r: number
  h: number
}
const outlineReg = new WeakMap<BufferGeometry, CylOutline[]>()
export const getOutlines = (g: BufferGeometry) => outlineReg.get(g)
function withOutlines(g: BufferGeometry, list: CylOutline[]) {
  outlineReg.set(g, list)
  return g
}

/** 圆环 / 圆管：沿 Y 轴，y 从 y0 到 y0 + h */
function tube(ro: number, ri: number, h: number, y0: number, seg = 28) {
  const s = new Shape()
  s.absarc(0, 0, ro, 0, Math.PI * 2, false)
  if (ri > 0) {
    const p = new Path()
    p.absarc(0, 0, ri, 0, Math.PI * 2, true)
    s.holes.push(p)
  }
  const g = new ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: seg })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const

function rodGeometry(d: number, length: number, axis: 'x' | 'y' | 'z') {
  const g = new CylinderGeometry(d / 2, d / 2, length, 24, 1)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  return withOutlines(g, [{ c: [0, 0, 0], a: [...AX[axis]], r: d / 2, h: length }])
}

/** 顶丝式限位环：轴向 Y，顶丝朝 +X */
function collarGeometry(d: number, od: number, w: number, screw: number) {
  const ring = tube(od / 2, d / 2, w, -w / 2)
  const hole = new CylinderGeometry(screw * 0.5, screw * 0.5, 1.2, 12, 1)
  hole.rotateZ(Math.PI / 2)
  hole.translate(od / 2 - 0.2, 0, 0)
  return withOutlines(merge([ring, hole]), [{ c: [0, 0, 0], a: [0, 1, 0], r: od / 2, h: w }])
}

/** 橡胶端盖 / 脚套：闭口端在 y=0，开口朝 +Y */
function rodCapGeometry(d: number) {
  const r = d / 2 + 2.5
  const h = Math.max(12, d)
  const g = merge([cyl(r, r, h - 2, (h - 2) / 2 + 2, 24), cyl(r, r - 1.2, 2, 1, 24)])
  return withOutlines(g, [{ c: [0, (h - 2) / 2 + 2, 0], a: [0, 1, 0], r, h: h - 2 }])
}

/**
 * SHF 法兰支座：安装面在 y=0（贴板底），法兰与轴套向 −Y 延伸。
 * 夹紧耳在 +Z 侧，螺丝沿 X。
 */
function flangeGeometry(d: number, s: { W: number; L: number; T: number; F: number; G: number; B: number; S: number }) {
  const sh = new Shape()
  const r = s.F / 2
  const hx = s.W / 2 - r
  sh.moveTo(-hx, -r)
  sh.lineTo(hx, -r)
  sh.absarc(hx, 0, r, -Math.PI / 2, Math.PI / 2, false)
  sh.lineTo(-hx, r)
  sh.absarc(-hx, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false)
  for (const x of [-s.B / 2, s.B / 2]) {
    const p = new Path()
    p.absarc(x, 0, s.S / 2, 0, Math.PI * 2, true)
    sh.holes.push(p)
  }
  const bore = new Path()
  bore.absarc(0, 0, d / 2, 0, Math.PI * 2, true)
  sh.holes.push(bore)
  const plate = new ExtrudeGeometry(sh, { depth: s.T, bevelEnabled: false, curveSegments: 16 })
  plate.rotateX(Math.PI / 2)
  const bh = s.L - s.T
  const boss = tube(s.G / 2, d / 2, bh, -s.L, 24)
  const ear = new BoxGeometry(12, bh, 8)
  ear.translate(0, -s.T - bh / 2, s.G / 2 + 1)
  const head = new CylinderGeometry(2.6, 2.6, 2.4, 12, 1)
  head.rotateZ(Math.PI / 2)
  head.translate(7.2, -s.T - bh / 2, s.G / 2 + 2)
  return withOutlines(merge([plate, boss, ear, head]), [{ c: [0, -s.T - bh / 2, 0], a: [0, 1, 0], r: s.G / 2, h: bh }])
}

/** 方块夹瓣：孔沿 axis，中心在 (0, y, 0) */
function clampLobe(a: number, d: number, axis: 'x' | 'y' | 'z', size = a) {
  const s = new Shape()
  s.moveTo(-size / 2, -size / 2)
  s.lineTo(size / 2, -size / 2)
  s.lineTo(size / 2, size / 2)
  s.lineTo(-size / 2, size / 2)
  s.closePath()
  const p = new Path()
  p.absarc(0, 0, d / 2, 0, Math.PI * 2, true)
  s.holes.push(p)
  const g = new ExtrudeGeometry(s, { depth: a, bevelEnabled: false, curveSegments: 20 })
  g.translate(0, 0, -a / 2)
  if (axis === 'x') g.rotateY(Math.PI / 2)
  if (axis === 'y') g.rotateX(Math.PI / 2)
  return g
}

function screwHead(screw: number, at: [number, number, number], axis: 'x' | 'z') {
  const g = new CylinderGeometry(screw * 0.8, screw * 0.8, 2.2, 14, 1)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  else g.rotateX(Math.PI / 2)
  g.translate(at[0] + (axis === 'x' ? 1.1 : 0), at[1], at[2] + (axis === 'z' ? 1.1 : 0))
  return g
}

/** 十字夹：上瓣孔沿 X（y=+a/2），下瓣孔沿 Z（y=−a/2），螺丝位置与 domain/shaft/common.screwLocal 一致 */
function crossGeometry(d: number, a: number, screw: number) {
  const A = clampLobe(a, d, 'x')
  A.translate(0, a / 2, 0)
  const B = clampLobe(a, d, 'z')
  B.translate(0, -a / 2, 0)
  const ya = 0.75 * a + d / 4
  return merge([A, B, screwHead(screw, [0, ya, a / 2], 'z'), screwHead(screw, [a / 2, -ya, 0], 'x')])
}

/** T 型夹：通孔沿 X（中心在原点），立柱盲孔沿 +Y */
function teeGeometry(d: number, a: number, screw: number) {
  const bs = a * 0.8
  const len = a * 0.9
  const A = clampLobe(a, d, 'x')
  const boss = clampLobe(len, d, 'y', bs)
  boss.translate(0, a / 2 + len / 2, 0)
  return merge([
    A, boss,
    screwHead(screw, [0, -(a + d) / 4, a / 2], 'z'),
    screwHead(screw, [bs / 2, a / 2 + len / 2, (d + bs) / 4], 'x'),
  ])
}

/** 线槽：顶部开口的 U 槽，原点在顶面中心 */
function trayGeometry(length: number, w: number, h: number) {
  const t = 2
  const s = new Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(-w / 2, -h)
  s.lineTo(w / 2, -h)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2 + 14, 0)
  s.lineTo(w / 2 + 14, t)
  s.lineTo(w / 2 - t, t)
  s.lineTo(w / 2 - t, -h + t)
  s.lineTo(-w / 2 + t, -h + t)
  s.lineTo(-w / 2 + t, 0)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false })
  g.translate(0, 0, -length / 2)
  g.rotateY(Math.PI / 2)
  return g
}

export function buildGeometry(spec: GeoSpec): BufferGeometry {
  switch (spec.kind) {
    case 'profile': return profileGeometry(spec.profile, spec.length, spec.axis, spec.full)
    case 'bracket': return bracketGeometry(spec.size)
    case 'leveler': return levelerGeometry(spec.size)
    case 'caster': return casterGeometry(spec.size)
    case 'board': return boardGeometry(spec.w, spec.t, spec.d, spec.holes, spec.hd)
    case 'tray': return trayGeometry(spec.length, spec.w, spec.h)
    case 'plate': return new BoxGeometry(spec.t, spec.h, spec.w)
    case 'cap': return new BoxGeometry(spec.w, 3, spec.d)
    case 'rod': return rodGeometry(spec.d, spec.length, spec.axis)
    case 'collar': {
      const c = COLLAR[spec.d as ShaftD]
      return collarGeometry(spec.d, c.od, c.w, Number(c.screw.slice(1)))
    }
    case 'flange': return flangeGeometry(spec.d, SHF[spec.d as ShaftD])
    case 'cross': {
      const c = CLAMP[spec.d as ShaftD]
      return crossGeometry(spec.d, c.a, Number(c.screw.slice(1)))
    }
    case 'tclamp': {
      const c = CLAMP[spec.d as ShaftD]
      return teeGeometry(spec.d, c.a, Number(c.screw.slice(1)))
    }
    case 'rodCap': return rodCapGeometry(spec.d)
  }
}

const geoCache = new Map<string, BufferGeometry>()
const edgeCache = new WeakMap<BufferGeometry, LineSegmentsGeometry>()

export function getGeometry(spec: GeoSpec): BufferGeometry {
  const key = JSON.stringify(spec)
  let g = geoCache.get(key)
  if (!g) {
    g = buildGeometry(spec)
    geoCache.set(key, g)
  }
  return g
}

/** 曲面轮廓：没有硬边的曲面（外壳、线缆）由 LineMesh 每帧按视角求轮廓边 */
const silhouetteReg = new WeakSet<BufferGeometry>()
export const hasSilhouette = (g: BufferGeometry) => silhouetteReg.has(g)
export function withSilhouette(g: BufferGeometry) {
  silhouetteReg.add(g)
  return g
}

/** 额外线条（分模线、丝印框）：与硬边合并绘制 */
const extraEdgeReg = new WeakMap<BufferGeometry, number[]>()
export function withExtraEdges(g: BufferGeometry, segments: number[]) {
  extraEdgeReg.set(g, segments)
  return g
}

export function getEdges(geo: BufferGeometry, threshold = 35): LineSegmentsGeometry {
  let e = edgeCache.get(geo)
  if (!e) {
    const edges = new EdgesGeometry(geo, threshold)
    const base = edges.attributes.position.array as Float32Array
    const extra = extraEdgeReg.get(geo)
    const all = extra ? new Float32Array([...base, ...extra]) : base
    e = new LineSegmentsGeometry().setPositions(all)
    edges.dispose()
    edgeCache.set(geo, e)
  }
  return e
}

/** L 型内六角扳手，短臂沿 +Y（插入端在原点），长臂沿 +X */
export function hexKeyGeometry(scale: number) {
  const r = 3.2 * scale
  const short = 28 * scale
  const long = 95 * scale
  const a = new CylinderGeometry(r, r, short, 6, 1)
  a.translate(0, short / 2, 0)
  const b = new CylinderGeometry(r, r, long, 6, 1)
  b.rotateZ(Math.PI / 2)
  b.translate(long / 2 - r * 0.3, short, 0)
  return merge([a, b])
}

const keyCache = new Map<number, BufferGeometry>()
export function getHexKey(scale: number) {
  const k = Math.round(scale * 100) / 100
  let g = keyCache.get(k)
  if (!g) {
    g = hexKeyGeometry(k)
    keyCache.set(k, g)
  }
  return g
}

/** 一次性几何（详情小场景使用），同样走缓存 */
export function cached(key: string, make: () => BufferGeometry) {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}

export { cyl, merge, tube, withOutlines }
