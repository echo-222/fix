import {
  BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Shape as ThreeShape, ShapeGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { shellHeightAt, shellParams, shellPoint, shellTopY, type ShellShape } from '../../domain/manual/shell'
import type { Shape } from '../../domain/manual/types'
import { cached, withExtraEdges, withSilhouette } from '../geometries'

/** 俯视圆角矩形（x 向右、y 对应 -z） */
function roundRect(w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01))
  const s = new ThreeShape()
  const x0 = -w / 2
  const y0 = -h / 2
  s.moveTo(x0 + rr, y0)
  s.lineTo(x0 + w - rr, y0)
  if (rr) s.absarc(x0 + w - rr, y0 + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(x0 + w, y0 + h - rr)
  if (rr) s.absarc(x0 + w - rr, y0 + h - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(x0 + rr, y0 + h)
  if (rr) s.absarc(x0 + rr, y0 + h - rr, rr, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + rr)
  if (rr) s.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false)
  return s
}

function slabGeometry(w: number, d: number, h: number, r: number) {
  const g = new ExtrudeGeometry(roundRect(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 6 })
  g.rotateX(-Math.PI / 2)
  return withSilhouette(g)
}

/** 圆润外壳：顶面 N 圈 × M 段，竖直侧边，平底 */
function shellGeometry(s: ShellShape) {
  const N = 24
  const M = 96
  const pos: number[] = []
  const idx: number[] = []
  const add = (x: number, y: number, z: number) => {
    pos.push(x, y, z)
    return pos.length / 3 - 1
  }
  const b = shellParams(s).b
  const top = add(0, shellHeightAt(s, 0, 0), 0)
  const rings: number[][] = []
  for (let i = 1; i <= N; i++) {
    const u = Math.sin((i / N) * (Math.PI / 2))
    const ring: number[] = []
    for (let j = 0; j < M; j++) {
      const [x, z] = shellPoint(s, -Math.PI / 2 + (j / M) * Math.PI * 2, u)
      ring.push(add(x, shellHeightAt(s, u, z / b), z))
    }
    rings.push(ring)
  }
  const wall = rings[N - 1].map((v) => add(pos[v * 3], 0, pos[v * 3 + 2]))
  const bottom = add(0, 0, 0)
  const J = (j: number) => (j + 1) % M
  for (let j = 0; j < M; j++) idx.push(top, rings[0][J(j)], rings[0][j])
  for (let i = 0; i < N - 1; i++) {
    const a = rings[i]
    const d = rings[i + 1]
    for (let j = 0; j < M; j++) idx.push(a[j], d[J(j)], d[j], a[j], a[J(j)], d[J(j)])
  }
  const t = rings[N - 1]
  for (let j = 0; j < M; j++) idx.push(t[j], wall[J(j)], wall[j], t[j], t[J(j)], wall[J(j)])
  for (let j = 0; j < M; j++) idx.push(bottom, wall[j], wall[J(j)])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()

  const seams: number[] = []
  for (const line of s.seams ?? []) {
    for (let k = 0; k < line.length - 1; k++) {
      const [x0, z0] = line[k]
      const [x1, z1] = line[k + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5))
      for (let m = 0; m < n; m++) {
        const p = (t0: number): [number, number, number] => {
          const x = x0 + (x1 - x0) * t0
          const z = z0 + (z1 - z0) * t0
          return [x, shellTopY(s, x, z) + 0.12, z]
        }
        seams.push(...p(m / n), ...p((m + 1) / n))
      }
    }
  }
  return withSilhouette(seams.length ? withExtraEdges(g, seams) : g)
}

function cylinderGeometry(r: number, h: number, axis: 'x' | 'y' | 'z' = 'y', r2 = r) {
  const g = new CylinderGeometry(r2, r, h, 32, 1)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  return withSilhouette(g)
}

function boxGeometry(size: [number, number, number], chamfer = 0) {
  if (chamfer <= 0) return new BoxGeometry(...size)
  return withSilhouette(new RoundedBoxGeometry(size[0], size[1], size[2], 2, chamfer))
}

export function holeGeometry(w: number, h: number, r = Math.min(w, h) * 0.3) {
  return new ShapeGeometry(roundRect(w, h, r), 6)
}

/** 实体形体的几何（led / screen / text / compound / cable 由 ManualStage 单独处理） */
export function solidGeometry(shape: Shape): BufferGeometry | null {
  const key = `manual:${JSON.stringify(shape)}`
  switch (shape.type) {
    case 'box': return cached(key, () => boxGeometry(shape.size, shape.chamfer))
    case 'slab': return cached(key, () => slabGeometry(shape.w, shape.d, shape.h, shape.r ?? 0))
    case 'cylinder': return cached(key, () => cylinderGeometry(shape.r, shape.h, shape.axis, shape.r2))
    case 'shell': return cached(key, () => shellGeometry(shape))
    case 'hole': return cached(key, () => holeGeometry(shape.w, shape.h, shape.r))
    case 'led': return cached(key, () => new CircleGeometry(shape.r, 28))
    case 'screen': return cached(key, () => new PlaneGeometry(shape.w, shape.h))
    default: return null
  }
}
