import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, PMREMGenerator, Quaternion, SRGBColorSpace, Vector3, type Material, type Object3D } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { withBase } from '../../base'
import { shapeBounds } from '../../domain/manual/audit'
import type { PartModel, Shape, Vec3 } from '../../domain/manual/types'
import { useApp } from '../../store'
import { withSilhouette } from '../geometries'
import { LineMesh, SilhouetteLines, type FillTone, type LineTone } from '../LineArt'

const DEG = Math.PI / 180
/** AI 网格曲面细碎：折角阈值比几何体（35°）高，只留真正的硬边；轮廓判断前把面法线平滑几轮 */
const CREASE = 70
const SMOOTH = 4

interface Fitted {
  /** 线稿用：只有位置，已变换到零件局部坐标（mm） */
  lines: BufferGeometry
  /** 真实材质用：保留原材质，几何在 GLB 场景坐标里，外面套 fit 矩阵 */
  meshes: { geometry: BufferGeometry; material: Material | Material[] }[]
  fit: Matrix4
}

const fitted = new Map<string, Fitted>()

/** gltf-transform 等工具默认交错存储（位置 / 法线 / UV 挤在一个缓冲里）；线稿和主轴计算直接读 .array，要先拆成紧凑的 xyz */
function bareCopy(geometry: BufferGeometry) {
  const g = new BufferGeometry()
  const p = geometry.attributes.position
  const xyz = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) xyz.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3)
  g.setAttribute('position', new BufferAttribute(xyz, 3))
  if (geometry.index) g.setIndex(geometry.index)
  return g
}

const mergeAll = (gs: BufferGeometry[]) => (gs.length === 1 ? gs[0].clone() : mergeGeometries(gs, false)!)

function fitModel(root: Object3D, model: PartModel, shape: Shape): Fitted {
  root.updateWorldMatrix(true, true)
  let meshes: Fitted['meshes'] = []
  root.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) meshes.push({ geometry: m.geometry.clone().applyMatrix4(m.matrixWorld), material: m.material })
  })
  let lines = mergeAll(meshes.map((m) => bareCopy(m.geometry)))

  const rot = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(...(model.rot ?? [0, 0, 0]).map((a) => a * DEG) as [number, number, number], 'XYZ')))
  if (model.align) rot.multiply(snapToAxes(lines.attributes.position.array as ArrayLike<number>))
  lines.applyMatrix4(rot)
  const whole = new Box3().setFromBufferAttribute(lines.attributes.position as never)
  if (model.crop) {
    const span = whole.getSize(new Vector3())
    const at = (f: Vec3 | undefined, d: number) => new Vector3(...(f ?? [d, d, d])).multiply(span).add(whole.min)
    const keep = new Box3(at(model.crop.min, 0), at(model.crop.max, 1))
    const cuts = (model.crop.cut ?? []).map((c) => new Box3(at(c.min, 0), at(c.max, 1)))
    const clipped = meshes.map((m) => ({ ...clipMesh(m.geometry, rot, whole, keep, cuts, m.material), material: twoSided(m.material) }))
    meshes = clipped.flatMap((c) => [{ geometry: c.geometry, material: c.material }, ...(c.cap ? [{ geometry: c.cap, material: CAP }] : [])])
    lines = mergeAll(meshes.map((m) => bareCopy(m.geometry))).applyMatrix4(rot)
  }
  const box = new Box3().setFromBufferAttribute(lines.attributes.position as never)
  if (box.isEmpty()) throw new Error(`${model.src} 裁切之后没有剩下三角形，检查 crop`)

  let place: Matrix4
  if (model.frame) {
    const fmin = new Vector3(...model.frame.min)
    const s = new Vector3(...model.frame.max).sub(fmin).divide(whole.getSize(new Vector3()))
    place = new Matrix4().makeTranslation(fmin.x, fmin.y, fmin.z)
      .multiply(new Matrix4().makeScale(s.x, s.y, s.z))
      .multiply(new Matrix4().makeTranslation(-whole.min.x, -whole.min.y, -whole.min.z))
  } else {
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const pb = shapeBounds(shape)
    const pmin = new Vector3(...pb.min)
    const pmax = new Vector3(...pb.max)
    const psize = pmax.clone().sub(pmin)
    const pcenter = pmin.clone().add(pmax).multiplyScalar(0.5)
    const ratio = (a: number, b: number) => (b > 1e-6 ? a / b : Infinity)
    const r = new Vector3(ratio(psize.x, size.x), ratio(psize.y, size.y), ratio(psize.z, size.z))
    const k = Math.min(r.x, r.y, r.z)
    const s = model.fit === 'stretch' ? new Vector3(...[r.x, r.y, r.z].map((v) => (Number.isFinite(v) ? v : k))) : new Vector3(k, k, k)
    place = new Matrix4().makeTranslation(pcenter.x, pcenter.y, pcenter.z)
      .multiply(new Matrix4().makeScale(s.x, s.y, s.z))
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
  }
  lines.applyMatrix4(place)
  lines.computeVertexNormals()
  return { lines: withSilhouette(lines, SMOOTH), meshes, fit: place.multiply(rot) }
}

// ---------- 裁切 ----------

/** 封口：颜色按切口一圈的贴图取样，写在顶点色里 */
const CAP = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, side: DoubleSide })

const twoSidedCache = new WeakMap<Material, Material>()
/** 切过的块用双面材质：生成模型的壳不总是封闭的，切口边上补不上的小豁口露出的是壳内侧（暗面），而不是透到背景 */
function twoSided(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) return material.map((m) => twoSided(m) as Material)
  if (material.side === DoubleSide) return material
  let m = twoSidedCache.get(material)
  if (!m) {
    m = material.clone()
    m.side = DoubleSide
    twoSidedCache.set(material, m)
  }
  return m
}

/** 多边形的一个顶点：p 是 rot 之后的位置（判断用），v 是所有属性拼在一起（插值用），i 是原网格里的顶点号（新切出来的没有） */
interface Vert { p: Vector3; v: Float64Array; i?: number }
/** 半空间 sign·(p[axis] − value) ≥ 0 */
interface HalfSpace { axis: number; value: number; sign: 1 | -1 }
/** 要补封口的一个切面：落在 rect 范围里、又不在 skip 里（已经挖掉的块）的那部分；out 是封口朝外的法线（rot 之后） */
interface CutFace extends HalfSpace { rect: Box3; skip: Box3[]; out: Vector3 }

const side = (h: HalfSpace, p: Vector3) => h.sign * (p.getComponent(h.axis) - h.value)

function lerpVert(a: Vert, b: Vert, t: number): Vert {
  const v = new Float64Array(a.v.length)
  for (let k = 0; k < v.length; k++) v[k] = a.v[k] + (b.v[k] - a.v[k]) * t
  return { p: a.p.clone().lerp(b.p, t), v }
}

/** Sutherland–Hodgman：凸多边形按平面分成里外两半（落在平面上的点两边都有） */
function split(poly: Vert[], h: HalfSpace): [Vert[], Vert[]] {
  const ins: Vert[] = []
  const outs: Vert[] = []
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]
    const b = poly[(k + 1) % poly.length]
    const sa = side(h, a.p)
    const sb = side(h, b.p)
    if (sa >= 0) ins.push(a)
    if (sa <= 0) outs.push(a)
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const x = lerpVert(a, b, sa / (sa - sb))
      ins.push(x)
      outs.push(x)
    }
  }
  return [ins, outs]
}

const boxSides = (b: Box3): HalfSpace[] => [0, 1, 2].flatMap((axis) => [
  { axis, value: b.min.getComponent(axis), sign: 1 as const },
  { axis, value: b.max.getComponent(axis), sign: -1 as const },
])

/** 线段 a→b 落在盒子里的参数区间 [t0, t1]（Liang–Barsky），不相交返回 null；skipAxis 那根轴不判断 */
function inBox(a: Vector3, b: Vector3, box: Box3, skipAxis = -1): [number, number] | null {
  let t0 = 0, t1 = 1
  for (let axis = 0; axis < 3; axis++) {
    if (axis === skipAxis) continue
    const pa = a.getComponent(axis), dp = b.getComponent(axis) - pa
    const lo = box.min.getComponent(axis), hi = box.max.getComponent(axis)
    if (Math.abs(dp) < 1e-12) {
      if (pa < lo || pa > hi) return null
      continue
    }
    let ta = (lo - pa) / dp, tb = (hi - pa) / dp
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 >= t1) return null
  }
  return [t0, t1]
}

/** 三角形和切面的交线段：截到 rect 里，再去掉落在 skip 盒子里的部分 */
function faceSegments(tri: Vert[], f: CutFace): [Vert, Vert][] {
  const d = tri.map((t) => t.p.getComponent(f.axis) - f.value)
  const pts: Vert[] = []
  for (let k = 0; k < 3; k++) {
    const a = tri[k], b = tri[(k + 1) % 3]
    const da = d[k], db = d[(k + 1) % 3]
    if (da === 0) pts.push(a)
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) pts.push(lerpVert(a, b, da / (da - db)))
  }
  if (pts.length < 2) return []
  const [a, b] = pts
  const span = inBox(a.p, b.p, f.rect, f.axis)
  if (!span) return []
  let parts: [number, number][] = [span]
  for (const s of f.skip) {
    const hit = inBox(a.p, b.p, s)
    if (!hit) continue
    parts = parts.flatMap(([t0, t1]) => [[t0, Math.min(t1, hit[0])], [Math.max(t0, hit[1]), t1]] as [number, number][]).filter(([t0, t1]) => t1 > t0)
  }
  return parts.map(([t0, t1]) => [t0 > 0 ? lerpVert(a, b, t0) : a, t1 < 1 ? lerpVert(a, b, t1) : b] as [Vert, Vert])
    .filter(([x, y]) => x.p.distanceToSquared(y.p) > 0)
}

/**
 * 把网格裁到 keep 里、再挖掉 cuts（都在 rot 之后的坐标里判断）：跨边界的三角形沿面切开、属性线性插值，
 * 完全在里面的三角形原样保留（顶点共用，法线照旧平滑）。切口按连通的一圈从中心扇形补平面封口，
 * 不然零件拆开、折起来时能看到锯齿边和空心的壳。
 */
function clipMesh(g: BufferGeometry, rot: Matrix4, whole: Box3, keep: Box3, cuts: Box3[], material: Material | Material[]) {
  const names = Object.keys(g.attributes)
  const attrs = names.map((n) => g.attributes[n])
  const offsets: number[] = []
  let stride = 0
  for (const a of attrs) {
    offsets.push(stride)
    stride += a.itemSize
  }
  const posAt = offsets[names.indexOf('position')]
  const uvAt = names.includes('uv') ? offsets[names.indexOf('uv')] : -1
  const count = g.attributes.position.count
  const read = (i: number): Vert => {
    const v = new Float64Array(stride)
    attrs.forEach((a, k) => {
      for (let c = 0; c < a.itemSize; c++) v[offsets[k] + c] = a.getComponent(i, c)
    })
    return { p: new Vector3(v[posAt], v[posAt + 1], v[posAt + 2]).applyMatrix4(rot), v, i }
  }

  const tol = whole.getSize(new Vector3()).length() * 1e-6
  const keepSides = boxSides(keep).filter((h) => (h.sign > 0 ? h.value > whole.min.getComponent(h.axis) + tol : h.value < whole.max.getComponent(h.axis) - tol))
  const within = (h: HalfSpace) => h.value > keep.min.getComponent(h.axis) - tol && h.value < keep.max.getComponent(h.axis) + tol
  const faces: CutFace[] = [
    ...keepSides.map((h) => ({ ...h, rect: keep, skip: cuts, out: new Vector3().setComponent(h.axis, -h.sign) })),
    ...cuts.flatMap((c, j) => boxSides(c).filter(within).map((h) => ({ ...h, rect: c.clone().intersect(keep), skip: cuts.filter((_, k) => k !== j), out: new Vector3().setComponent(h.axis, h.sign) }))),
  ].filter((f) => !f.rect.isEmpty())

  const extra: Vert[] = []
  const indexOf = (v: Vert) => {
    if (v.i === undefined) {
      v.i = count + extra.length
      extra.push(v)
    }
    return v.i
  }
  const tris: number[] = []
  const segs: [Vert, Vert][][] = faces.map(() => [])
  const triBox = new Box3()
  const at = (t: number) => (g.index ? g.index.getX(t) : t)
  const total = g.index ? g.index.count : count
  const cache = new Map<number, Vert>()
  const vert = (i: number) => {
    let v = cache.get(i)
    if (!v) cache.set(i, (v = read(i)))
    return v
  }
  for (let t = 0; t < total; t += 3) {
    const tri = [vert(at(t)), vert(at(t + 1)), vert(at(t + 2))]
    triBox.setFromPoints(tri.map((x) => x.p))
    const inside = keepSides.every((h) => tri.every((x) => side(h, x.p) > 0))
    const touched = cuts.filter((c) => c.intersectsBox(triBox))
    if (inside && !touched.length) {
      tris.push(tri[0].i!, tri[1].i!, tri[2].i!)
      continue
    }
    let poly: Vert[] = tri
    for (const h of keepSides) {
      poly = split(poly, h)[0]
      if (poly.length < 3) break
    }
    if (poly.length < 3) continue
    let pieces = [poly]
    for (const c of touched) {
      const next: Vert[][] = []
      for (const piece of pieces) {
        let rest = piece
        for (const h of boxSides(c)) {
          const [ins, outs] = split(rest, h)
          if (outs.length >= 3) next.push(outs)
          rest = ins
          if (rest.length < 3) break
        }
      }
      pieces = next
    }
    for (const piece of pieces) {
      const ids = piece.map(indexOf)
      for (let k = 1; k + 1 < ids.length; k++) tris.push(ids[0], ids[k], ids[k + 1])
    }
    faces.forEach((f, k) => segs[k].push(...faceSegments(tri, f)))
  }

  // 只留用到的顶点：包围盒按顶点算，留着裁掉的顶点会让不写 frame 的零件按整个模型对齐
  const remap = new Int32Array(count + extra.length).fill(-1)
  const used: number[] = []
  const index = tris.map((i) => {
    if (remap[i] < 0) {
      remap[i] = used.length
      used.push(i)
    }
    return remap[i]
  })
  const out = new BufferGeometry()
  attrs.forEach((a, k) => {
    const arr = new Float32Array(used.length * a.itemSize)
    used.forEach((i, j) => {
      for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = i < count ? a.getComponent(i, c) : extra[i - count].v[offsets[k] + c]
    })
    out.setAttribute(names[k], new BufferAttribute(arr, a.itemSize))
  })
  out.setIndex(index)
  return { geometry: out, cap: buildCaps(faces, segs, rot, posAt, uvAt, tol, material) }
}

/** 每个切面上的交线段按端点连成一圈一圈，每圈从中心扇形铺满；颜色取这一圈贴图的平均色再压暗一点 */
function buildCaps(faces: CutFace[], segs: [Vert, Vert][][], rot: Matrix4, posAt: number, uvAt: number, tol: number, material: Material | Material[]) {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const back = new Matrix4().copy(rot).invert()
  const sample = texelSampler(material)
  const base = (Array.isArray(material) ? material[0] : material) as MeshStandardMaterial
  const q = tol * 20
  const key = (p: Vector3) => `${Math.round(p.x / q)},${Math.round(p.y / q)},${Math.round(p.z / q)}`
  faces.forEach((f, k) => {
    const list = segs[k]
    if (!list.length) return
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      parent.set(x, r)
      return r
    }
    for (const [a, b] of list) {
      for (const x of [key(a.p), key(b.p)]) if (!parent.has(x)) parent.set(x, x)
      parent.set(find(key(a.p)), find(key(b.p)))
    }
    const groups = new Map<string, [Vert, Vert][]>()
    for (const s of list) {
      const r = find(key(s[0].p))
      const g = groups.get(r)
      if (g) g.push(s)
      else groups.set(r, [s])
    }
    const normal = f.out.clone().transformDirection(back)
    for (const group of groups.values()) {
      const c = new Vector3()
      const v = new Float64Array(group[0][0].v.length)
      let rgb = [0, 0, 0]
      for (const [a, b] of group) {
        for (const x of [a, b]) {
          c.add(x.p)
          for (let j = 0; j < v.length; j++) v[j] += x.v[j]
          if (sample && uvAt >= 0) rgb = sample(x.v[uvAt], x.v[uvAt + 1]).map((ch, j) => rgb[j] + ch)
        }
      }
      const n = group.length * 2
      c.divideScalar(n)
      for (let j = 0; j < v.length; j++) v[j] /= n
      const color = sample && uvAt >= 0
        ? new Color().setRGB(rgb[0] / n / 255, rgb[1] / n / 255, rgb[2] / n / 255, SRGBColorSpace)
        : (base.color?.clone() ?? new Color(0.3, 0.3, 0.3))
      color.multiplyScalar(0.8)
      const edge = new Vector3()
      const tri = new Vector3()
      for (const [a0, b0] of [...group, ...closeGaps(group, key)]) {
        let [a, b] = [a0, b0]
        tri.subVectors(a.p, c).cross(edge.subVectors(b.p, c))
        if (tri.lengthSq() === 0) continue
        if (tri.dot(f.out) < 0) [a, b] = [b, a]
        for (const x of [v, a.v, b.v]) {
          pos.push(x[posAt], x[posAt + 1], x[posAt + 2])
          nrm.push(normal.x, normal.y, normal.z)
          col.push(color.r, color.g, color.b)
        }
      }
    }
  })
  if (!pos.length) return null
  const cap = new BufferGeometry()
  cap.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  cap.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  cap.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  // 和裁过的网格合并成线稿时要求都有索引
  cap.setIndex([...Array(pos.length / 3).keys()])
  return cap
}

/**
 * 模型的壳常有小破口，切出来的一圈会断开几处：把落单的端点就近两两连上，不然扇形会缺一角露出背景。
 * 只连比整圈尺寸小得多的缺口，免得把两条本来分开的弧硬连成一片
 */
function closeGaps(group: [Vert, Vert][], key: (p: Vector3) => string): [Vert, Vert][] {
  const ends = new Map<string, { at: Vert; n: number }>()
  const size = new Box3()
  for (const s of group) {
    for (const x of s) {
      const k = key(x.p)
      const e = ends.get(k)
      if (e) e.n++
      else ends.set(k, { at: x, n: 1 })
      size.expandByPoint(x.p)
    }
  }
  const loose = [...ends.values()].filter((e) => e.n % 2).map((e) => e.at)
  const reach = size.getSize(new Vector3()).length() * 0.25
  const out: [Vert, Vert][] = []
  while (loose.length > 1) {
    const a = loose.pop()!
    let best = -1
    for (let j = 0; j < loose.length; j++) if (best < 0 || a.p.distanceToSquared(loose[j].p) < a.p.distanceToSquared(loose[best].p)) best = j
    if (a.p.distanceTo(loose[best].p) <= reach) out.push([a, loose[best]])
    loose.splice(best, 1)
  }
  return out
}

const texels = new WeakMap<object, { w: number; h: number; data: Uint8ClampedArray } | null>()

/** 读底色贴图（缩到 ≤256 像素就够取平均色）；glTF 的 UV 原点在左上，flipY = false */
function texelSampler(material: Material | Material[]) {
  const img = ((Array.isArray(material) ? material[0] : material) as MeshStandardMaterial).map?.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (!img?.width || typeof document === 'undefined') return null
  let t = texels.get(img)
  if (t === undefined) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(256, img.width)
      canvas.height = Math.min(256, img.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      t = { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data }
    } catch {
      t = null
    }
    texels.set(img, t)
  }
  if (!t) return null
  const { w, h, data } = t
  return (u: number, v: number) => {
    const x = Math.min(w - 1, Math.floor((((u % 1) + 1) % 1) * w))
    const y = Math.min(h - 1, Math.floor((((v % 1) + 1) % 1) * h))
    const i = (y * w + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
}

/** 主成分分析求模型三根主轴，返回把它们分别转到最近坐标轴的旋转（保持右手系） */
function snapToAxes(pos: ArrayLike<number>): Matrix4 {
  const n = pos.length / 3
  const m = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) m[k] += pos[i * 3 + k] / n
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r][c] += (pos[i * 3 + r] - m[r]) * (pos[i * 3 + c] - m[c])
  }
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 32; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-12) continue
      const t = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p])
      const c = Math.cos(t)
      const s = Math.sin(t)
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q]
        v[k][p] = c * vkp - s * vkq
        v[k][q] = s * vkp + c * vkq
      }
    }
  }
  const axes = [0, 1, 2].map((i) => ({ len: a[i][i], dir: new Vector3(v[0][i], v[1][i], v[2][i]) })).sort((x, y) => y.len - x.len)
  const target: Vector3[] = []
  const used = new Set<number>()
  for (const { dir } of axes) {
    let best = -1
    for (let k = 0; k < 3; k++) if (!used.has(k) && (best < 0 || Math.abs(dir.getComponent(k)) > Math.abs(dir.getComponent(best)))) best = k
    used.add(best)
    if (dir.getComponent(best) < 0) dir.negate()
    target.push(new Vector3().setComponent(best, 1))
  }
  const from = new Matrix4().makeBasis(axes[0].dir, axes[1].dir, axes[2].dir)
  const to = new Matrix4().makeBasis(target[0], target[1], target[2])
  // 手性不一致时只能翻最短轴（厚度方向）
  if (from.determinant() * to.determinant() < 0) to.makeBasis(target[0], target[1], target[2].negate())
  const snap = to.multiply(from.transpose())
  // 方形截面时两根主轴方向不确定，转了反而更歪：包围盒明显变小才采用（与 model:info 的判断一致）
  const volume = (m?: Matrix4) => {
    const box = new Box3()
    const p = new Vector3()
    for (let i = 0; i < n; i++) box.expandByPoint(m ? p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m) : p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]))
    const s = box.getSize(p)
    return s.x * s.y * s.z
  }
  return volume() > volume(snap) * 1.18 ? snap : new Matrix4()
}

function FittedModel({ model, shape, tone, fillTone }: { model: PartModel; shape: Shape; tone: LineTone; fillTone: FillTone }) {
  const gltf = useGLTF(withBase(model.src), false, true)
  const real = useApp((s) => s.realLook)
  const data = useMemo(() => {
    const key = JSON.stringify([model, shape])
    let f = fitted.get(key)
    if (!f) {
      const root = model.node ? gltf.scene.getObjectByName(model.node) : gltf.scene
      if (!root) throw new Error(`${model.src} 里没有节点 ${model.node}`)
      f = fitModel(root, model, shape)
      fitted.set(key, f)
    }
    return f
  }, [gltf, model, shape])
  const group = useMemo(() => {
    const g = new Group()
    g.matrixAutoUpdate = false
    g.matrix.copy(data.fit)
    for (const m of data.meshes) g.add(new Mesh(m.geometry, m.material))
    return g
  }, [data])

  if (!real) return <LineMesh geometry={data.lines} tone={tone} fillTone={fillTone} threshold={CREASE} />
  return (
    <group>
      <primitive object={group} />
      <SilhouetteLines geometry={data.lines} tone={tone} />
    </group>
  )
}

/** 截图脚本等 window.__modelsPending 归零再拍：占位（加载中）挂载期间计数 +1 */
function Pending({ children }: { children: ReactNode }) {
  useEffect(() => {
    const w = window as unknown as { __modelsPending?: number }
    w.__modelsPending = (w.__modelsPending ?? 0) + 1
    return () => {
      w.__modelsPending = (w.__modelsPending ?? 1) - 1
    }
  }, [])
  return <>{children}</>
}

class Fallback extends Component<{ src: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.warn(`外观模型 ${this.props.src} 加载失败，改用几何体：`, e)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function ModelView({ model, shape, tone, fillTone, fallback }: { model: PartModel; shape: Shape; tone: LineTone; fillTone: FillTone; fallback: ReactNode }) {
  return (
    <Fallback src={model.src} fallback={fallback}>
      <Suspense fallback={<Pending>{fallback}</Pending>}>
        <FittedModel model={model} shape={shape} tone={tone} fillTone={fillTone} />
      </Suspense>
    </Fallback>
  )
}

/** 真实材质需要环境光：用 three 自带的 RoomEnvironment，不依赖外部 HDR */
export function RealLighting() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}
