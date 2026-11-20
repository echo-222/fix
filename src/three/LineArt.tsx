import { useFrame } from '@react-three/fiber'
import { useMemo, type ReactNode } from 'react'
import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry, type InterleavedBufferAttribute } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { getEdges, getOutlines, hasSilhouette, silhouetteSmooth, type CylOutline } from './geometries'

export const INK = '#161616'
/** 指示色（方向箭头、拖动轨迹）：和界面一样只用黑；本步操作的零件靠加粗黑线 + 奶黄填色区分 */
export const ACCENT = INK
export const HIGHLIGHT = '#f8e8a8'

/** 光从左上方来（和界面阴影、地面投影同一个方向），指向光源 */
export const LIGHT_DIR = new Vector3(-0.55, 1.6, 0.35).normalize()
/** 背光面最多压暗多少（线性色值）：顶面≈白，正面略灰，右侧面最暗 */
const SHADE_DEPTH = 0.42

/**
 * 线稿面的明暗：按世界坐标里的面朝向和固定光向算，不靠场景灯光，所以主舞台、细节圆窗、封面渲染都一样。
 * 几何体没有法线（线缆管）时用屏幕导数求面法线。
 */
function shaded(m: MeshBasicMaterial) {
  m.onBeforeCompile = (s) => {
    s.uniforms.shadeLight = { value: LIGHT_DIR }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShadeN;\nvarying vec3 vShadeP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShadeN = mat3(modelMatrix) * normal;\nvShadeP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 shadeLight;\nvarying vec3 vShadeN;\nvarying vec3 vShadeP;')
      .replace('#include <opaque_fragment>', `
        vec3 shadeN = vShadeN;
        if (dot(shadeN, shadeN) < 1e-8) {
          shadeN = cross(dFdx(vShadeP), dFdy(vShadeP));
          if (dot(shadeN, cameraPosition - vShadeP) < 0.0) shadeN = -shadeN;
        } else if (!gl_FrontFacing) shadeN = -shadeN;
        float shadeK = 0.5 - 0.5 * dot(normalize(shadeN), shadeLight);
        outgoingLight *= 1.0 - ${SHADE_DEPTH.toFixed(2)} * shadeK * shadeK;
        #include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'shaded'
  return m
}

const fill = (color: string) =>
  shaded(new MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: DoubleSide }))

export const MATS = {
  fill: fill('#ffffff'),
  fillWarm: fill('#fbf8ef'),
  fillAccent: fill(HIGHLIGHT),
  fillShade: fill('#ececea'),
  fillDark: fill('#3a3a3a'),
  ink: new LineMaterial({ color: INK, linewidth: 0.8 }),
  inkBold: new LineMaterial({ color: INK, linewidth: 1.15 }),
  accent: new LineMaterial({ color: INK, linewidth: 1.7 }),
  ghost: new LineMaterial({ color: '#c8c8c8', linewidth: 0.8, transparent: true, opacity: 0.38, depthWrite: false }),
  suggest: new LineMaterial({ color: '#8a8a8a', linewidth: 1.2, dashed: true, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.9 }),
  /** 压过又摊平的折痕 */
  crease: new LineMaterial({ color: '#b4b1a8', linewidth: 0.7 }),
}

export type LineTone = 'ink' | 'inkBold' | 'accent' | 'ghost' | 'suggest' | 'crease'
export type FillTone = 'fill' | 'fillWarm' | 'fillAccent' | 'fillShade' | 'fillDark'

/**
 * 柔光外观（广场模型图 #/sprite）：面换成受光材质，描边换成很淡的细线，没有红色高亮。
 * 只在渲染页挂载前打开，运行中不切换。
 */
export const lookFlags = { soft: false }

const softFill = (color: string) =>
  new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: DoubleSide })

const SOFT: Record<FillTone, MeshStandardMaterial> = {
  fill: softFill('#efefed'),
  fillWarm: softFill('#efe5c8'),
  fillAccent: softFill('#efe5c8'),
  fillShade: softFill('#d3d3d0'),
  fillDark: softFill('#4a4a4a'),
}
const SOFT_LINE = new LineMaterial({ color: '#9c9c9c', linewidth: 0.8, transparent: true, opacity: 0.45 })

export const lineMat = (tone: LineTone) => (lookFlags.soft ? SOFT_LINE : MATS[tone])
export const fillMat = (tone: FillTone) => (lookFlags.soft ? SOFT[tone] : MATS[tone])

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
  line.material = lineMat(tone)
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

function updateNormals(t: Topology, smooth = 0) {
  const { verts: v, faces, normals, offsets, edges } = t
  const nf = faces.length / 3
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 3] * 3
    const b = faces[f * 3 + 1] * 3
    const c = faces[f * 3 + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    normals[f * 3] = uy * wz - uz * wy
    normals[f * 3 + 1] = uz * wx - ux * wz
    normals[f * 3 + 2] = ux * wy - uy * wx
  }
  // 未归一化的叉积按面积加权，和相邻面相加即面积加权平均
  for (let it = 0; it < smooth; it++) {
    const next = Float32Array.from(normals)
    for (let e = 0; e < edges.length; e += 4) {
      const f0 = edges[e + 2] * 3
      const f1 = edges[e + 3] * 3
      for (let k = 0; k < 3; k++) {
        next[f0 + k] += normals[f1 + k]
        next[f1 + k] += normals[f0 + k]
      }
    }
    normals.set(next)
  }
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 3] * 3
    const b = faces[f * 3 + 1] * 3
    const c = faces[f * 3 + 2] * 3
    const cx = smooth ? (v[a] + v[b] + v[c]) / 3 : v[a]
    const cy = smooth ? (v[a + 1] + v[b + 1] + v[c + 1]) / 3 : v[a + 1]
    const cz = smooth ? (v[a + 2] + v[b + 2] + v[c + 2]) / 3 : v[a + 2]
    offsets[f] = normals[f * 3] * cx + normals[f * 3 + 1] * cy + normals[f * 3 + 2] * cz
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
      updateNormals(t, silhouetteSmooth(geometry))
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
  line.material = lineMat(tone)
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
  line.material = lineMat(tone)
  const outlines = getOutlines(geometry)
  // 本步操作的浅色零件涂奶黄；深色件（黑色外壳、线缆）保持原色，只靠加粗线
  const lit = tone === 'accent' && !lookFlags.soft && (fillTone === 'fill' || fillTone === 'fillWarm')
  return (
    <group>
      {filled && <mesh geometry={geometry} material={fillMat(lit ? 'fillAccent' : fillTone)} />}
      <primitive object={line} />
      {outlines && <CylinderOutlines list={outlines} tone={tone} />}
      {hasSilhouette(geometry) && <SilhouetteLines geometry={geometry} tone={tone} />}
      {children}
    </group>
  )
}
