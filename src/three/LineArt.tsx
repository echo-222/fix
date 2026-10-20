import { useFrame } from '@react-three/fiber'
import { useMemo, type ReactNode } from 'react'
import { DoubleSide, MeshBasicMaterial, Vector3, type BufferGeometry, type InterleavedBufferAttribute } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { getEdges, getOutlines, hasSilhouette, type CylOutline } from './geometries'

export const INK = '#161616'
export const ACCENT = '#e8462f'

const fill = (color: string) =>
  new MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: DoubleSide })

export const MATS = {
  fill: fill('#ffffff'),
  fillWarm: fill('#fcfaf5'),
  fillAccent: fill('#fff3f0'),
  fillShade: fill('#ebe7df'),
  fillDark: fill('#3a3835'),
  ink: new LineMaterial({ color: INK, linewidth: 1.15 }),
  inkBold: new LineMaterial({ color: INK, linewidth: 1.6 }),
  accent: new LineMaterial({ color: ACCENT, linewidth: 1.9 }),
  ghost: new LineMaterial({ color: '#cfc9be', linewidth: 1, transparent: true, opacity: 0.38, depthWrite: false }),
  suggest: new LineMaterial({ color: ACCENT, linewidth: 1.4, dashed: true, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.9 }),
}

export type LineTone = 'ink' | 'inkBold' | 'accent' | 'ghost' | 'suggest'
export type FillTone = 'fill' | 'fillWarm' | 'fillAccent' | 'fillShade' | 'fillDark'

const cam = new Vector3()
const axis = new Vector3()
const toCam = new Vector3()
const side = new Vector3()
const base = new Vector3()

/** 圆柱侧面轮廓：每帧按相机位置求两条切线 */
function CylinderOutlines({ list, tone }: { list: CylOutline[]; tone: LineTone }) {
  const line = useMemo(() => {
    const g = new LineSegmentsGeometry()
    g.setPositions(new Float32Array(list.length * 12))
    const l = new LineSegments2(g, MATS.ink)
    l.frustumCulled = false
    return l
  }, [list])
  line.material = MATS[tone]
  useFrame(({ camera }) => {
    line.updateWorldMatrix(true, false)
    cam.copy(camera.position)
    line.worldToLocal(cam)
    const attr = line.geometry.attributes.instanceStart as InterleavedBufferAttribute
    const arr = attr.data.array as Float32Array
    list.forEach((o, i) => {
      axis.set(...o.a)
      base.set(...o.c)
      toCam.copy(cam).sub(base)
      toCam.addScaledVector(axis, -toCam.dot(axis))
      const dist = toCam.length()
      if (dist <= o.r) return
      toCam.normalize()
      side.crossVectors(axis, toCam).normalize()
      const k = o.r / dist
      const along = o.r * k
      const across = o.r * Math.sqrt(1 - k * k)
      for (let s = 0; s < 2; s++) {
        const sign = s === 0 ? 1 : -1
        const px = base.x + toCam.x * along + side.x * across * sign
        const py = base.y + toCam.y * along + side.y * across * sign
        const pz = base.z + toCam.z * along + side.z * across * sign
        const j = i * 12 + s * 6
        arr[j] = px - axis.x * o.h / 2
        arr[j + 1] = py - axis.y * o.h / 2
        arr[j + 2] = pz - axis.z * o.h / 2
        arr[j + 3] = px + axis.x * o.h / 2
        arr[j + 4] = py + axis.y * o.h / 2
        arr[j + 5] = pz + axis.z * o.h / 2
      }
    })
    attr.data.needsUpdate = true
    if (tone === 'suggest') line.computeLineDistances()
  })
  return <primitive object={line} />
}

interface Topology {
  /** 原始顶点 → 焊接后顶点 */
  remap: Uint32Array
  verts: Float32Array
  faces: Uint32Array
  /** 每条内部边：v0, v1, f0, f1 */
  edges: Uint32Array
  normals: Float32Array
  offsets: Float32Array
}

const topoCache = new WeakMap<BufferGeometry, Topology>()

function buildTopology(g: BufferGeometry): Topology {
  const pos = g.attributes.position.array as ArrayLike<number>
  const count = g.attributes.position.count
  const key = new Map<string, number>()
  const remap = new Uint32Array(count)
  const verts: number[] = []
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(pos[i * 3] * 1e3)},${Math.round(pos[i * 3 + 1] * 1e3)},${Math.round(pos[i * 3 + 2] * 1e3)}`
    let v = key.get(k)
    if (v === undefined) {
      v = verts.length / 3
      key.set(k, v)
      verts.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    }
    remap[i] = v
  }
  const index = g.index ? (g.index.array as ArrayLike<number>) : null
  const triCount = index ? index.length / 3 : count / 3
  const faces = new Uint32Array(triCount * 3)
  for (let i = 0; i < triCount * 3; i++) faces[i] = remap[index ? index[i] : i]
  const edgeMap = new Map<number, number[]>()
  const nv = verts.length / 3
  for (let f = 0; f < triCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = faces[f * 3 + e]
      const b = faces[f * 3 + ((e + 1) % 3)]
      if (a === b) continue
      const k = a < b ? a * nv + b : b * nv + a
      const list = edgeMap.get(k)
      if (list) list.push(f)
      else edgeMap.set(k, [a, b, f])
    }
  }
  const edges: number[] = []
  for (const l of edgeMap.values()) if (l.length === 4) edges.push(l[0], l[1], l[2], l[3])
  return {
    remap, verts: new Float32Array(verts), faces, edges: new Uint32Array(edges),
    normals: new Float32Array(triCount * 3), offsets: new Float32Array(triCount),
  }
}

function updateNormals(t: Topology) {
  const { verts: v, faces, normals, offsets } = t
  for (let f = 0; f < faces.length / 3; f++) {
    const a = faces[f * 3] * 3
    const b = faces[f * 3 + 1] * 3
    const c = faces[f * 3 + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    normals[f * 3] = nx
    normals[f * 3 + 1] = ny
    normals[f * 3 + 2] = nz
    offsets[f] = nx * v[a] + ny * v[a + 1] + nz * v[a + 2]
  }
}

/**
 * 通用曲面轮廓线：相邻两个三角面一个朝向相机、一个背向相机，公共边即轮廓。
 * dynamic：几何体顶点每帧变化（线缆），需重新计算面法线。
 */
export function SilhouetteLines({ geometry, tone, dynamic = false }: { geometry: BufferGeometry; tone: LineTone; dynamic?: boolean }) {
  const topo = useMemo(() => {
    let t = topoCache.get(geometry)
    if (!t) {
      t = buildTopology(geometry)
      updateNormals(t)
      topoCache.set(geometry, t)
    }
    return t
  }, [geometry])
  const line = useMemo(() => {
    const g = new LineSegmentsGeometry()
    g.setPositions(new Float32Array(Math.max(1, topo.edges.length / 4) * 6))
    const l = new LineSegments2(g, MATS.ink)
    l.frustumCulled = false
    return l
  }, [topo])
  line.material = MATS[tone]
  const front = useMemo(() => new Uint8Array(topo.offsets.length), [topo])
  useFrame(({ camera }) => {
    if (dynamic) {
      const pos = geometry.attributes.position.array as ArrayLike<number>
      const { remap, verts } = topo
      for (let i = 0; i < remap.length; i++) {
        const v = remap[i] * 3
        verts[v] = pos[i * 3]
        verts[v + 1] = pos[i * 3 + 1]
        verts[v + 2] = pos[i * 3 + 2]
      }
      updateNormals(topo)
    }
    line.updateWorldMatrix(true, false)
    cam.copy(camera.position)
    line.worldToLocal(cam)
    const { normals: n, offsets, edges, verts } = topo
    for (let f = 0; f < offsets.length; f++) {
      front[f] = n[f * 3] * cam.x + n[f * 3 + 1] * cam.y + n[f * 3 + 2] * cam.z - offsets[f] > 0 ? 1 : 0
    }
    const attr = line.geometry.attributes.instanceStart as InterleavedBufferAttribute
    const arr = attr.data.array as Float32Array
    let k = 0
    for (let e = 0; e < edges.length; e += 4) {
      if (front[edges[e + 2]] === front[edges[e + 3]]) continue
      const a = edges[e] * 3
      const b = edges[e + 1] * 3
      arr[k++] = verts[a]
      arr[k++] = verts[a + 1]
      arr[k++] = verts[a + 2]
      arr[k++] = verts[b]
      arr[k++] = verts[b + 1]
      arr[k++] = verts[b + 2]
    }
    line.geometry.instanceCount = k / 6
    attr.data.needsUpdate = true
  })
  return <primitive object={line} />
}

export function LineMesh({
  geometry, tone = 'ink', filled = true, fillTone = 'fill', threshold, children,
}: {
  geometry: BufferGeometry
  tone?: LineTone
  filled?: boolean
  fillTone?: FillTone
  threshold?: number
  children?: ReactNode
}) {
  const line = useMemo(() => {
    const l = new LineSegments2(getEdges(geometry, threshold), MATS.ink)
    l.computeLineDistances()
    return l
  }, [geometry, threshold])
  line.material = MATS[tone]
  const outlines = getOutlines(geometry)
  return (
    <group>
      {filled && <mesh geometry={geometry} material={MATS[fillTone]} />}
      <primitive object={line} />
      {outlines && <CylinderOutlines list={outlines} tone={tone} />}
      {hasSilhouette(geometry) && <SilhouetteLines geometry={geometry} tone={tone} />}
      {children}
    </group>
  )
}
