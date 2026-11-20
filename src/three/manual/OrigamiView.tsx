import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Matrix4, MeshBasicMaterial,
  RepeatWrapping, SRGBColorSpace, Vector3,
} from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import type { SceneStep } from '../../domain/manual/compile'
import { foldFrame, origamiOf, type OrigamiData } from '../../domain/manual/origami'
import { progressAt, type StepTiming } from '../../domain/manual/pose'
import type { OrigamiShape } from '../../domain/manual/types'
import { HIGHLIGHT, lineMat, lookFlags, type LineTone } from '../LineArt'

/**
 * 一整张折纸：每帧按 foldFrame 求出各块面的姿态，画成一张连续的纸。
 * 面 = 上下两层 + 纸边一圈侧面（厚度）；相邻两块面之间的折痕用 Hermite 曲面弯过去（折边是圆的，翻折途中也不断开）；
 * 明暗按法线现算（光从左上前方来，和广场模型图一致），带一层纸纹；地面上投一层淡影子。
 * 线：纸边和折边黑线，压平的旧折痕浅灰，还没折出来的折痕不画；本步翻动的面上奶黄色、描边加粗。
 */

const LIGHT = new Vector3(-0.4, 1.7, 1.3).normalize()
const UV = 1 / 90
const SEG = 8
const CORE = new Color('#e3ddd0')
const HOT = new Color(HIGHLIGHT)
const WHITE = new Color('#ffffff')

const shade = (n: Vector3) => 0.56 + 0.44 * Math.max(0, n.dot(LIGHT))

let grain: CanvasTexture | null = null
function grainTexture() {
  if (grain) return grain
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const fiber = new Float32Array(size * size)
  for (let n = 0; n < 900; n++) {
    const x = rnd() * size
    const y = rnd() * size
    const a = rnd() * Math.PI
    const len = 6 + rnd() * 18
    const s = 0.5 + rnd() * 0.5
    for (let t = 0; t < len; t++) {
      const px = Math.floor(x + Math.cos(a) * t + size) % size
      const py = Math.floor(y + Math.sin(a) * t + size) % size
      fiber[py * size + px] += s
    }
  }
  for (let i = 0; i < size * size; i++) {
    const v = 255 - rnd() * 7 - fiber[i] * 4
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(232, v)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  grain = new CanvasTexture(c)
  grain.wrapS = grain.wrapT = RepeatWrapping
  grain.colorSpace = SRGBColorSpace
  grain.anisotropy = 4
  return grain
}

/** 本步翻动的面 */
function movers(d: OrigamiData, from: number, to: number): Set<number> {
  if (from === to) return new Set()
  if (to === from + 1) return new Set(d.moving[to])
  if (from === to + 1) return new Set(d.moving[from])
  const A = d.frames[from]
  const B = d.frames[to]
  return new Set(d.faces.flatMap((_, i) => (A[i].equals(B[i]) ? [] : [i])))
}

interface Buffers {
  pos: number[]
  col: number[]
  uv: number[]
  ink: number[]
  hot: number[]
  crease: number[]
  shadow: number[]
}

const w = {
  v: new Vector3(), n: new Vector3(), e: new Vector3(), t: new Vector3(), c: new Color(),
  ta: new Vector3(), tb: new Vector3(), na: new Vector3(),
}

/** 纸面坐标里，边 p → q 朝面外的单位法向（面中心在另一侧） */
function outward(pts: [number, number][], p: [number, number], q: [number, number]): [number, number] {
  const cx = pts.reduce((s, v) => s + v[0], 0) / pts.length
  const cz = pts.reduce((s, v) => s + v[1], 0) / pts.length
  const ex = q[0] - p[0]
  const ez = q[1] - p[1]
  const len = Math.hypot(ex, ez) || 1
  let ox = ez / len
  let oz = -ex / len
  if ((p[0] - cx) * ox + (p[1] - cz) * oz < 0) {
    ox = -ox
    oz = -oz
  }
  return [ox, oz]
}

function build(d: OrigamiData, mats: Matrix4[], hot: Set<number>, tint: boolean, allHot: boolean, shown: number, markScale: (born: number) => number): Buffers {
  const b: Buffers = { pos: [], col: [], uv: [], ink: [], hot: [], crease: [], shadow: [] }
  const top = new Color(d.top)
  const bottom = new Color(d.bottom)
  const hsl = { h: 0, s: 0, l: 0 }
  const colorOf = (base: Color, n: Vector3, isHot: boolean, out: Color) => {
    out.copy(base)
    // 彩纸混奶黄会发灰，改成提亮
    if (isHot && tint) {
      if (base.getHSL(hsl).s > 0.25) out.lerp(WHITE, 0.3)
      else out.lerp(HOT, 0.42)
    }
    return out.multiplyScalar(shade(n))
  }
  const vert = (p: Vector3, c: Color, u = 0, v = 0) => {
    b.pos.push(p.x, p.y, p.z)
    b.col.push(c.r, c.g, c.b)
    b.uv.push(u * UV, v * UV)
  }
  const seg = (list: number[], a: Vector3, c: Vector3) => list.push(a.x, a.y, a.z, c.x, c.y, c.z)
  const lp = (x: number, y: number, z: number, m: Matrix4) => new Vector3(x, y, z).applyMatrix4(m)

  d.faces.forEach((face, i) => {
    const M = mats[i]
    const n = face.pts.length
    const N = new Vector3(0, 1, 0).transformDirection(M)
    const isHot = hot.has(i)
    const cTop = colorOf(top, N, isHot, new Color())
    const cBot = colorOf(bottom, N.clone().negate(), isHot, new Color())
    const T = face.pts.map(([x, z]) => lp(x, d.th, z, M))
    const B = face.pts.map(([x, z]) => lp(x, 0, z, M))
    for (let j = 1; j + 1 < n; j++) {
      const [p0, p1, p2] = [face.pts[0], face.pts[j], face.pts[j + 1]]
      vert(T[0], cTop, ...p0)
      vert(T[j], cTop, ...p1)
      vert(T[j + 1], cTop, ...p2)
      vert(B[0], cBot, ...p0)
      vert(B[j + 1], cBot, ...p2)
      vert(B[j], cBot, ...p1)
      for (const k of [0, j, j + 1]) {
        const p = T[k].y < B[k].y ? T[k] : B[k]
        b.shadow.push(p.x - (LIGHT.x * p.y) / LIGHT.y, p.z - (LIGHT.z * p.y) / LIGHT.y)
      }
    }
    face.born.forEach((born, j) => {
      if (born >= 0) return
      const j2 = (j + 1) % n
      const [ox, oz] = outward(face.pts, face.pts[j], face.pts[j2])
      const on = new Vector3(ox, 0, oz).transformDirection(M)
      const c = colorOf(CORE, on, isHot, new Color())
      vert(T[j], c)
      vert(B[j], c)
      vert(T[j2], c)
      vert(T[j2], c)
      vert(B[j], c)
      vert(B[j2], c)
      const list = isHot || allHot ? b.hot : b.ink
      seg(list, T[j], T[j2])
      seg(list, B[j], B[j2])
    })
  })

  // 折痕：两块面贴在一起就是一条线（压平的旧折痕画浅灰），分开了就弯过去
  const hermite = (P0: Vector3, T0: Vector3, P1: Vector3, T1: Vector3, u: number, out: Vector3) => {
    const u2 = u * u
    const u3 = u2 * u
    return out.copy(P0).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(T0, u3 - 2 * u2 + u).addScaledVector(P1, -2 * u3 + 3 * u2).addScaledVector(T1, u3 - u2)
  }
  const dHermite = (P0: Vector3, T0: Vector3, P1: Vector3, T1: Vector3, u: number, out: Vector3) => {
    const u2 = u * u
    return out.copy(P0).multiplyScalar(6 * u2 - 6 * u).addScaledVector(T0, 3 * u2 - 4 * u + 1).addScaledVector(P1, -6 * u2 + 6 * u).addScaledVector(T1, 3 * u2 - 2 * u)
  }
  for (const link of d.links) {
    const Ma = mats[link.a]
    const Mb = mats[link.b]
    const mid = d.th / 2
    const gapP = lp(link.p[0], mid, link.p[1], Ma).distanceTo(lp(link.p[0], mid, link.p[1], Mb))
    const gapQ = lp(link.q[0], mid, link.q[1], Ma).distanceTo(lp(link.q[0], mid, link.q[1], Mb))
    const isHot = hot.has(link.a) || hot.has(link.b)
    if (gapP < 0.03 && gapQ < 0.03) {
      if (link.born >= 1 && link.born <= shown) {
        seg(b.crease, lp(link.p[0], d.th, link.p[1], Ma), lp(link.q[0], d.th, link.q[1], Ma))
        seg(b.crease, lp(link.p[0], 0, link.p[1], Ma), lp(link.q[0], 0, link.q[1], Ma))
      }
      continue
    }
    const [ox, oz] = outward(d.faces[link.a].pts, link.p, link.q)
    const Ta = w.ta.set(ox, 0, oz).transformDirection(Ma).clone()
    const Tb = w.tb.set(-ox, 0, -oz).transformDirection(Mb).clone()
    const Na = w.na.set(0, 1, 0).transformDirection(Ma).clone()
    const cos = Math.max(-1, Math.min(1, -Ta.dot(Tb)))
    const theta = Math.acos(cos)
    const gain = theta < 1e-3 ? 1 : (2 * Math.tan(theta / 4)) / Math.sin(theta / 2)
    for (const [y, base, sign] of [[d.th, top, 1], [0, bottom, -1]] as const) {
      const ends = [link.p, link.q].map(([x, z]) => {
        const P0 = lp(x, y, z, Ma)
        const P1 = lp(x, y, z, Mb)
        const L = P0.distanceTo(P1) * gain
        return { P0, P1, T0: Ta.clone().multiplyScalar(L), T1: Tb.clone().multiplyScalar(-L) }
      })
      const rows: { p: Vector3; q: Vector3; c: Color }[] = []
      let flip = 0
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG
        const [ep, eq] = ends
        const p = hermite(ep.P0, ep.T0, ep.P1, ep.T1, u, new Vector3())
        const q = hermite(eq.P0, eq.T0, eq.P1, eq.T1, u, new Vector3())
        const t = dHermite(ep.P0, ep.T0, ep.P1, ep.T1, u, w.t).add(dHermite(eq.P0, eq.T0, eq.P1, eq.T1, u, w.n))
        const e = w.e.copy(q).sub(p)
        const nrm = new Vector3().crossVectors(t, e)
        if (nrm.lengthSq() < 1e-10) nrm.copy(Na).multiplyScalar(sign)
        nrm.normalize()
        if (!flip) flip = nrm.dot(Na) * sign < 0 ? -1 : 1
        nrm.multiplyScalar(flip)
        rows.push({ p, q, c: colorOf(base, nrm, isHot, new Color()) })
      }
      for (let s = 0; s < SEG; s++) {
        const r0 = rows[s]
        const r1 = rows[s + 1]
        vert(r0.p, r0.c, ...link.p)
        vert(r1.p, r1.c, ...link.p)
        vert(r0.q, r0.c, ...link.q)
        vert(r0.q, r0.c, ...link.q)
        vert(r1.p, r1.c, ...link.p)
        vert(r1.q, r1.c, ...link.q)
      }
      seg(isHot ? b.hot : b.ink, rows[SEG / 2].p, rows[SEG / 2].q)
    }
  }

  // 画在纸上的点
  for (const m of d.marks) {
    const s = markScale(m.born)
    if (s <= 0) continue
    const M = mats[m.face]
    const y = m.side > 0 ? d.th + 0.05 : -0.05
    const c = w.c.set(m.color)
    const center = lp(m.at[0], y, m.at[1], M)
    const r = m.r * s
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2
      const a1 = ((i + 1) / 20) * Math.PI * 2
      vert(center, c)
      vert(lp(m.at[0] + r * Math.cos(a0), y, m.at[1] + r * Math.sin(a0), M), c)
      vert(lp(m.at[0] + r * Math.cos(a1), y, m.at[1] + r * Math.sin(a1), M), c)
    }
  }
  return b
}

const SHADOW_PX = 512
const SHADOW_COLOR = '#3a3428'

interface ShadowLayer {
  ctx: CanvasRenderingContext2D
  tex: CanvasTexture
  geo: BufferGeometry
}

function shadowLayer(): ShadowLayer {
  const c = document.createElement('canvas')
  c.width = c.height = SHADOW_PX
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const geo = new BufferGeometry()
  geo.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0], 2))
  return { ctx: c.getContext('2d')!, tex, geo }
}

/** 各层投影三角形画进一张画布再糊开：层叠的地方只算一层，不会一格一格地变深 */
function paintShadow(s: ShadowLayer, tris: number[]) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < tris.length; i += 2) {
    x0 = Math.min(x0, tris[i])
    x1 = Math.max(x1, tris[i])
    z0 = Math.min(z0, tris[i + 1])
    z1 = Math.max(z1, tris[i + 1])
  }
  const span = Math.max(x1 - x0, z1 - z0, 1) * 1.16 + 8
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  x0 = cx - span / 2
  z0 = cz - span / 2
  const k = SHADOW_PX / span
  const { ctx } = s
  ctx.clearRect(0, 0, SHADOW_PX, SHADOW_PX)
  ctx.filter = 'blur(4px)'
  ctx.fillStyle = SHADOW_COLOR
  ctx.beginPath()
  // 同一个方向绕：非零环绕规则下就是并集
  for (let i = 0; i + 5 < tris.length; i += 6) {
    const ax = (tris[i] - x0) * k
    const ay = (tris[i + 1] - z0) * k
    let bx = (tris[i + 2] - x0) * k
    let by = (tris[i + 3] - z0) * k
    let qx = (tris[i + 4] - x0) * k
    let qy = (tris[i + 5] - z0) * k
    if ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax) < 0) [bx, by, qx, qy] = [qx, qy, bx, by]
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(qx, qy)
    ctx.closePath()
  }
  ctx.fill()
  ctx.filter = 'none'
  s.tex.needsUpdate = true
  const X1 = x0 + span
  const Z1 = z0 + span
  s.geo.setAttribute('position', new Float32BufferAttribute([x0, 0.02, z0, X1, 0.02, z0, x0, 0.02, Z1, X1, 0.02, z0, X1, 0.02, Z1, x0, 0.02, Z1], 3))
  s.geo.computeBoundingSphere()
}

function setLines(l: LineSegments2, list: number[]) {
  l.visible = list.length > 0
  if (!l.visible) return
  l.geometry.dispose()
  l.geometry = new LineSegmentsGeometry().setPositions(list)
}

export function OrigamiView({ id, shape, tone, stage, now }: {
  id: string
  shape: OrigamiShape
  tone: LineTone
  stage: { scene: SceneStep; timing: StepTiming }
  now: () => number
}) {
  const d = useMemo(() => origamiOf(shape), [shape])
  const r = useMemo(() => {
    const line = () => {
      const l = new LineSegments2(new LineSegmentsGeometry(), lineMat('ink'))
      l.frustumCulled = false
      return l
    }
    return {
      geo: new BufferGeometry(),
      mat: new MeshBasicMaterial({ vertexColors: true, map: grainTexture(), side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      shadow: shadowLayer(),
      shadowMat: new MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      ink: line(),
      hot: line(),
      crease: line(),
      mats: [] as Matrix4[],
      last: '',
    }
  }, [d])
  useEffect(() => () => {
    r.geo.dispose()
    r.mat.dispose()
    r.shadow.geo.dispose()
    r.shadow.tex.dispose()
    r.shadowMat.dispose()
    for (const l of [r.ink, r.hot, r.crease]) l.geometry.dispose()
  }, [r])
  const soft = lookFlags.soft
  r.ink.material = lineMat('ink')
  r.hot.material = lineMat(tone === 'accent' ? 'accent' : 'ink')
  r.crease.material = lineMat(soft ? 'ink' : 'crease')
  r.shadowMat.map = r.shadow.tex
  r.shadowMat.opacity = soft ? 0.2 : 0.14

  useFrame(() => {
    const { scene, timing } = stage
    const f = scene.from[id]
    const g = scene.to[id]
    if (!f || !g) return
    const k = progressAt(scene, timing, id, now())
    const key = `${f.fold}|${g.fold}|${k.toFixed(4)}|${tone}`
    if (key === r.last) return
    r.last = key
    foldFrame(d, f.fold, g.fold, k, r.mats)
    const moving = tone === 'accent' ? movers(d, f.fold, g.fold) : new Set<number>()
    const lo = Math.min(f.fold, g.fold)
    const hi = Math.max(f.fold, g.fold)
    const shown = k >= 1 ? g.fold : f.fold
    const grow = (born: number) => (born <= lo ? 1 : born <= hi ? (g.fold >= born ? k : 1 - k) : 0)
    const b = build(d, r.mats, moving, !soft, tone === 'accent' && moving.size === 0, shown, grow)
    r.geo.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
    r.geo.setAttribute('color', new Float32BufferAttribute(b.col, 3))
    r.geo.setAttribute('uv', new Float32BufferAttribute(b.uv, 2))
    r.geo.computeBoundingBox()
    r.geo.computeBoundingSphere()
    paintShadow(r.shadow, b.shadow)
    setLines(r.ink, b.ink)
    setLines(r.hot, b.hot)
    setLines(r.crease, b.crease)
  })

  return (
    <group>
      {/* 纸自己画投影（shadowLayer），不进舞台地面投影，免得叠两层 */}
      <mesh geometry={r.geo} material={r.mat} frustumCulled={false} userData={{ noShadow: true }} />
      <mesh geometry={r.shadow.geo} material={r.shadowMat} frustumCulled={false} renderOrder={-1} />
      <primitive object={r.ink} />
      <primitive object={r.hot} />
      <primitive object={r.crease} />
    </group>
  )
}
