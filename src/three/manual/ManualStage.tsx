import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry, CanvasTexture, CircleGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  PlaneGeometry, Shape as ThreeShape, ShapeGeometry, SRGBColorSpace, Vector2, Vector3,
} from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { hasRealLook, type ManualModel, type ScenePart, type SceneStep } from '../../domain/manual/compile'
import { activeFrame, bakedState, ledLit, solvePose, stepTiming, type Pose, type StepTiming } from '../../domain/manual/pose'
import type { Callout, Fill, Finish, ScreenUI, Shape, Vec3 } from '../../domain/manual/types'
import { anim, useApp } from '../../store'
import { calloutScreen } from '../focus'
import { INK, LineMesh, MATS, SilhouetteLines, fillMat, lineMat, lookFlags, type FillTone, type LineTone } from '../LineArt'
import { finishMaterial } from './finishes'
import { ModelView, RealLighting } from './ModelView'
import { OrigamiView } from './OrigamiView'
import { drawScreen } from './screenUI'
import { solidGeometry } from './shapes'

const elapsed = () => (performance.now() - anim.start) / 1000
const DEG = Math.PI / 180

const FILL: Record<Fill, FillTone> = { white: 'fill', warm: 'fillWarm', shade: 'fillShade', dark: 'fillDark' }

/** 真实材质模式下怎么给几何体上材质；real = false 时一律线稿 */
interface Look {
  real: boolean
  byFill?: Partial<Record<Fill, Finish>>
}
const LINE_ART: Look = { real: false }

interface Stage extends Pose {
  scene: SceneStep
  timing: StepTiming
}
const StageContext = createContext<Stage | null>(null)
const useStage = () => useContext(StageContext)!

// ---------- 形体 ----------

function LedView({ id, shape, tone }: { id: string; shape: Extract<Shape, { type: 'led' }>; tone: LineTone }) {
  const stage = useStage()
  const mats = useMemo(() => ({
    face: new MeshBasicMaterial({ color: '#f3f0ea', side: DoubleSide }),
    halo: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide }),
  }), [])
  const halo = useRef<Mesh>(null)
  const geo = solidGeometry(shape)!
  const haloGeo = useMemo(() => new CircleGeometry(shape.r * 2.8, 32), [shape.r])
  useFrame(() => {
    const lit = ledLit(stage.scene, id, elapsed())
    mats.face.color.set(lit ?? '#f3f0ea')
    if (halo.current) {
      halo.current.visible = !!lit
      if (lit) mats.halo.color.set(lit)
    }
  })
  return (
    <group position={[0, 0, 0.25]}>
      <mesh geometry={geo} material={mats.face} />
      <mesh ref={halo} geometry={haloGeo} material={mats.halo} position={[0, 0, -0.1]} />
      <LineMesh geometry={geo} tone={tone} filled={false} />
    </group>
  )
}

/** 朝下的指示灯照在桌面上的光斑 */
function LedSpill({ id }: { id: string }) {
  const stage = useStage()
  const ref = useRef<Mesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }), [])
  const geo = useMemo(() => {
    const g = new CircleGeometry(26, 40)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  useFrame(() => {
    const mesh = ref.current
    const m = stage.mats.get(id)
    if (!mesh || !m) return
    const e = m.elements
    const lit = ledLit(stage.scene, id, elapsed())
    const down = e[9] < -0.6 && e[13] < 12
    mesh.visible = !!lit && down && stage.vis.get(id) !== false
    if (!mesh.visible) return
    mat.color.set(lit!)
    mat.opacity = 0.4 * (0.75 + 0.25 * Math.sin(elapsed() * 9))
    mesh.position.set(e[12], 0.3, e[14])
  })
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={2} />
}

const cursorGeo = (() => {
  const s = new ThreeShape()
  s.moveTo(0, 0)
  s.lineTo(0, -16)
  s.lineTo(4, -12.5)
  s.lineTo(7, -19)
  s.lineTo(9.5, -18)
  s.lineTo(6.5, -11.5)
  s.lineTo(11.5, -11.5)
  s.closePath()
  const g = new ShapeGeometry(s)
  g.scale(0.55, 0.55, 1)
  return g
})()

function ScreenView({ id, shape, tone }: { id: string; shape: Extract<Shape, { type: 'screen' }>; tone: LineTone }) {
  const stage = useStage()
  const { tex, ctx, canvas } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = Math.round((1024 * shape.h) / shape.w)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    return { tex, ctx: canvas.getContext('2d')!, canvas }
  }, [shape.w, shape.h])
  const mat = useMemo(() => new MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), [tex])
  const last = useRef<ScreenUI | null | undefined>(undefined)
  const cursor = useRef<Mesh>(null)
  const geo = solidGeometry(shape)!
  useFrame(() => {
    const ui = activeFrame(stage.scene, id, elapsed()).ui
    if (ui !== last.current) {
      last.current = ui
      drawScreen(ctx, ui, canvas.width, canvas.height)
      tex.needsUpdate = true
    }
    const c = cursor.current
    if (c) {
      c.visible = !!ui?.cursor
      const [dx, dz] = stage.glide
      c.position.set(shape.w * 0.12 + (dx / 42) * shape.w * 0.3, -shape.h * 0.05 - (dz / 20) * shape.h * 0.22, 0.3)
    }
  })
  return (
    <group>
      <mesh geometry={geo} material={mat} />
      <LineMesh geometry={geo} tone={tone} filled={false} />
      <mesh ref={cursor} geometry={cursorGeo} material={fillMat('fillDark')} />
    </group>
  )
}

const textCache = new Map<string, { tex: CanvasTexture; aspect: number }>()
function textTexture(text: string) {
  let t = textCache.get(text)
  if (!t) {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const font = `600 96px "PingFang SC", "Helvetica Neue", sans-serif`
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + 24
    c.width = w
    c.height = 128
    ctx.font = font
    ctx.fillStyle = INK
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 12, 68)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    t = { tex, aspect: w / 128 }
    textCache.set(text, t)
  }
  return t
}

function TextDecal({ shape }: { shape: Extract<Shape, { type: 'text' }> }) {
  const { tex, aspect } = textTexture(shape.text)
  const h = shape.size * 1.33
  const geo = useMemo(() => new PlaneGeometry(h * aspect, h), [h, aspect])
  const mat = useMemo(() => new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }), [tex])
  return <mesh geometry={geo} material={mat} position={[0, 0, 0.15]} renderOrder={1} />
}

function Solid({ geometry, tone, fill, finish, look, threshold }: { geometry: BufferGeometry; tone: LineTone; fill: Fill; finish?: Finish; look: Look; threshold?: number }) {
  const f = look.real ? finish ?? look.byFill?.[fill] : undefined
  if (!f) return <LineMesh geometry={geometry} tone={tone} fillTone={FILL[fill]} threshold={threshold} />
  return (
    <LineMesh geometry={geometry} tone={tone} filled={false} threshold={threshold}>
      <mesh geometry={geometry} material={finishMaterial(f)} />
    </LineMesh>
  )
}

/** 纸片：正反两面、一圈边线；每条边黑线 / 浅灰折痕 / 不画，跟着这一步的 edges 走 */
function SheetView({ id, shape, tone, fill = 'white', finish, look }: { id: string; shape: Extract<Shape, { type: 'sheet' }>; tone: LineTone; fill?: Fill; finish?: Finish; look: Look }) {
  const stage = useStage()
  const th = shape.th ?? 0.3
  const face = useMemo(() => {
    const g = new ShapeGeometry(new ThreeShape(shape.points.map(([x, z]) => new Vector2(x, -z))))
    g.rotateX(-Math.PI / 2)
    return g
  }, [shape.points])
  const lines = useMemo(() => {
    const make = () => {
      const l = new LineSegments2(new LineSegmentsGeometry(), MATS.ink)
      l.frustumCulled = false
      return l
    }
    return { hard: make(), soft: make(), last: undefined as string | null | undefined }
  }, [shape.points])
  lines.hard.material = lineMat(tone)
  lines.soft.material = lineMat(lookFlags.soft ? tone : 'crease')
  useFrame(() => {
    const edges = activeFrame(stage.scene, id, elapsed()).edges
    if (edges === lines.last) return
    lines.last = edges
    const seg = { h: [] as number[], s: [] as number[] }
    const n = shape.points.length
    for (let i = 0; i < n; i++) {
      const c = edges?.[i] ?? 'h'
      if (c === '-') continue
      const [x0, z0] = shape.points[i]
      const [x1, z1] = shape.points[(i + 1) % n]
      for (const y of [th + 0.02, -0.02]) seg[c === 's' ? 's' : 'h'].push(x0, y, z0, x1, y, z1)
    }
    for (const [k, l] of [['h', lines.hard], ['s', lines.soft]] as const) {
      l.visible = seg[k].length > 0
      if (!l.visible) continue
      l.geometry.dispose()
      l.geometry = new LineSegmentsGeometry().setPositions(seg[k])
    }
  })
  const lit = tone === 'accent' && !lookFlags.soft
  const back = shape.back ?? 'white'
  const material = (f: Fill, fin: Finish | undefined) => {
    const real = look.real ? fin ?? look.byFill?.[f] : undefined
    if (real) return finishMaterial(real)
    return fillMat(lit && (f === 'white' || f === 'warm') ? 'fillAccent' : FILL[f])
  }
  return (
    <group>
      <mesh geometry={face} material={material(fill, finish)} position={[0, th, 0]} />
      <mesh geometry={face} material={material(back, shape.backFinish)} />
      <primitive object={lines.hard} />
      <primitive object={lines.soft} />
    </group>
  )
}

function OrigamiNode({ id, shape, tone }: { id: string; shape: Extract<Shape, { type: 'origami' }>; tone: LineTone }) {
  const stage = useStage()
  const real = useApp((s) => s.realLook)
  return <OrigamiView id={id} shape={shape} tone={real ? 'ink' : tone} stage={stage} now={elapsed} />
}

function ShapeView({ id, shape, tone, fill, finish, look }: { id: string; shape: Shape; tone: LineTone; fill?: Fill; finish?: Finish; look: Look }) {
  switch (shape.type) {
    case 'sheet': return <SheetView id={id} shape={shape} tone={tone} fill={fill} finish={finish} look={look} />
    case 'origami': return <OrigamiNode id={id} shape={shape} tone={tone} />
    case 'compound':
      return (
        <>
          {shape.items.map((it, i) => (
            <group key={i} position={it.at ?? [0, 0, 0]} rotation={(it.rot ?? [0, 0, 0]).map((v) => v * DEG) as Vec3}>
              <ShapeView id={id} shape={it} tone={tone} fill={it.fill ?? (it.type === 'hole' ? undefined : fill)} finish={it.finish ?? (it.type === 'hole' ? undefined : finish)} look={look} />
            </group>
          ))}
        </>
      )
    case 'led': return <LedView id={id} shape={shape} tone={tone} />
    case 'screen': return <ScreenView id={id} shape={shape} tone={tone} />
    case 'text': return <TextDecal shape={shape} />
    case 'cable': return null
    case 'hole':
      return (
        <group position={[0, 0, 0.15]}>
          <Solid geometry={solidGeometry(shape)!} tone={tone} fill={fill ?? 'shade'} finish={finish} look={look} />
        </group>
      )
    default:
      return <Solid geometry={solidGeometry(shape)!} tone={tone} fill={fill ?? 'white'} finish={finish} look={look} threshold={shape.type === 'shell' ? 30 : undefined} />
  }
}

function PartNode({ part, tone, look, bare, register }: { part: ScenePart; tone: LineTone; look: Look; bare: boolean; register: (id: string, g: Group | null) => void }) {
  const proxy = <ShapeView id={part.id} shape={part.shape} tone={tone} fill={part.fill} finish={part.finish} look={look} />
  return (
    <group ref={(g) => register(part.id, g)} matrixAutoUpdate={false}>
      <group position={part.pivot ?? [0, 0, 0]}>
        {part.model && !bare
          ? <ModelView model={part.model} shape={part.shape} tone={tone} fillTone={FILL[part.fill ?? 'white']} fallback={proxy} />
          : proxy}
      </group>
    </group>
  )
}

// ---------- 线缆 ----------

const SEG = 64
const RAD = 10

function CableView({ part, tone, look }: { part: ScenePart; tone: LineTone; look: Look }) {
  const stage = useStage()
  const shape = part.shape as Extract<Shape, { type: 'cable' }>
  const r = shape.r ?? 1.8
  const finish = look.real ? part.finish ?? look.byFill?.[part.fill ?? 'white'] : undefined
  const group = useRef<Group>(null)
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array((SEG + 1) * (RAD + 1) * 3)
    const idx: number[] = []
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < RAD; j++) {
        const a = i * (RAD + 1) + j
        const b = (i + 1) * (RAD + 1) + j
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    writeTube(g, (u) => new Vector3(u * 100, 50, 0), r)
    return g
  }, [r])
  const work = useMemo(() => ({ a: new Vector3(), b: new Vector3(), da: new Vector3(), db: new Vector3(), ca: new Vector3(), cb: new Vector3(), v: new Vector3() }), [])
  useFrame(() => {
    const ma = stage.mats.get(shape.from.part)
    const mb = stage.mats.get(shape.to.part)
    const g = group.current
    if (!ma || !mb || !g) return
    g.visible = stage.vis.get(part.id) !== false && stage.vis.get(shape.from.part) !== false && stage.vis.get(shape.to.part) !== false
    if (!g.visible) return
    const { a, b, da, db, ca, cb, v } = work
    a.fromArray(shape.from.at).applyMatrix4(ma)
    b.fromArray(shape.to.at).applyMatrix4(mb)
    da.fromArray(shape.from.dir).transformDirection(ma)
    db.fromArray(shape.to.dir).transformDirection(mb)
    const L = Math.max(24, a.distanceTo(b) * 0.42 * (shape.slack ?? 1))
    ca.copy(a).addScaledVector(da, L)
    cb.copy(b).addScaledVector(db, L)
    writeTube(geo, (u) => {
      const w = 1 - u
      v.copy(a).multiplyScalar(w * w * w).addScaledVector(ca, 3 * w * w * u).addScaledVector(cb, 3 * w * u * u).addScaledVector(b, u * u * u)
      v.y = Math.max(v.y, r)
      return v
    }, r)
  }, -0.5)
  return (
    <group ref={group}>
      <mesh geometry={geo} material={finish ? finishMaterial(finish) : fillMat('fill')} frustumCulled={false} />
      <SilhouetteLines geometry={geo} tone={tone} dynamic />
    </group>
  )
}

const tubeTmp = { pts: Array.from({ length: SEG + 1 }, () => new Vector3()), t: new Vector3(), n: new Vector3(), b: new Vector3(), up: new Vector3() }
function writeTube(g: BufferGeometry, at: (u: number) => Vector3, r: number) {
  const { pts, t, n, b, up } = tubeTmp
  for (let i = 0; i <= SEG; i++) pts[i].copy(at(i / SEG))
  const arr = g.attributes.position.array as Float32Array
  n.set(0, 0, 0)
  for (let i = 0; i <= SEG; i++) {
    t.copy(pts[Math.min(SEG, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize()
    if (i === 0 || n.lengthSq() < 1e-6) {
      up.set(0, 1, 0)
      if (Math.abs(t.dot(up)) > 0.9) up.set(1, 0, 0)
      n.crossVectors(t, up).normalize()
    } else n.addScaledVector(t, -n.dot(t)).normalize()
    b.crossVectors(t, n)
    for (let j = 0; j <= RAD; j++) {
      const ang = (j / RAD) * Math.PI * 2
      const k = (i * (RAD + 1) + j) * 3
      const cs = Math.cos(ang) * r
      const sn = Math.sin(ang) * r
      arr[k] = pts[i].x + n.x * cs + b.x * sn
      arr[k + 1] = pts[i].y + n.y * cs + b.y * sn
      arr[k + 2] = pts[i].z + n.z * cs + b.z * sn
    }
  }
  g.attributes.position.needsUpdate = true
}

// ---------- 标注 ----------

/** 标注由 DOM 层（ui/CalloutLayer）绘制，这里每帧把锚点与标签位置投影到屏幕 */
function CalloutProjector({ callouts }: { callouts: Callout[] }) {
  const stage = useStage()
  const { camera, size } = useThree()
  const work = useMemo(() => ({ a: new Vector3(), b: new Vector3() }), [])
  useFrame(() => {
    const { a, b } = work
    const items = calloutScreen.items
    items.length = callouts.length
    const settled = elapsed() > stage.timing.settle * 0.7
    callouts.forEach((c, i) => {
      const it = (items[i] ??= { x1: 0, y1: 0, x2: 0, y2: 0, visible: false })
      const m = stage.mats.get(c.part)
      if (!m) {
        it.visible = false
        return
      }
      const o = c.offset ?? [0, 40, 0]
      a.fromArray(c.at ?? [0, 0, 0]).applyMatrix4(m)
      b.set(a.x + o[0], a.y + o[1], a.z + o[2]).project(camera)
      a.project(camera)
      it.x1 = ((a.x + 1) / 2) * size.width
      it.y1 = ((1 - a.y) / 2) * size.height
      it.x2 = ((b.x + 1) / 2) * size.width
      it.y2 = ((1 - b.y) / 2) * size.height
      it.visible = settled && stage.vis.get(c.part) !== false && a.z < 1 && b.z < 1
    })
    calloutScreen.scene = stage.scene
  })
  return null
}

// ---------- 细节圆窗：同一场景的近景 ----------

function ZoomCamera({ zoom }: { zoom: NonNullable<SceneStep['zoom']> }) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const t = new Vector3(...zoom.focus)
    camera.position.copy(t).addScaledVector(new Vector3(...zoom.dir).normalize(), zoom.dist)
    camera.up.set(0, 1, 0)
    if (Math.abs(zoom.dir[1]) > 0.9 * Math.hypot(...zoom.dir)) camera.up.set(0, 0, -1)
    camera.lookAt(t)
    camera.updateProjectionMatrix()
  }, [camera, zoom])
  return null
}

export function ManualDetailCanvas({ model, scene }: { model: ManualModel; scene: SceneStep }) {
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ fov: 28, near: 1, far: 5000, position: [200, 100, 200] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => gl.setClearColor('#ffffff')}
    >
      <ManualStage model={model} scene={scene} callouts={false} />
      {scene.zoom && <ZoomCamera zoom={scene.zoom} />}
    </Canvas>
  )
}

// ---------- 舞台 ----------

export function ManualStage({ model, scene, callouts = true, omit }: { model: ManualModel; scene: SceneStep; callouts?: boolean; omit?: Set<string> }) {
  const groups = useRef(new Map<string, Group>())
  const parts = model.scene.parts
  const drawn = omit ? parts.filter((p) => !omit.has(p.id)) : parts
  const timing = useMemo(() => stepTiming(parts.map((p) => p.id), scene), [scene, parts])
  const stage = useMemo<Stage>(() => ({ mats: new Map(), vis: new Map(), glide: [0, 0], scene, timing }), [])
  stage.scene = scene
  stage.timing = timing

  const realLook = useApp((s) => s.realLook)
  const real = useMemo(() => hasRealLook(model), [model]) && realLook
  const byFill = model.spec.finishes
  const look = useMemo<Look>(() => (real ? { real, byFill } : LINE_ART), [real, byFill])
  const { resting, bare } = useMemo(() => bakedState(parts, scene, timing), [parts, scene, timing])

  useFrame(() => {
    solvePose(scene, timing, elapsed(), stage)
    for (const [id, g] of groups.current) {
      const m = stage.mats.get(id)
      if (!m) continue
      g.matrix.copy(m)
      g.matrixWorldNeedsUpdate = true
      g.visible = stage.vis.get(id) !== false && !resting.has(id)
    }
  }, -1)

  const register = useMemo(() => (id: string, g: Group | null) => {
    if (g) groups.current.set(id, g)
    else groups.current.delete(id)
  }, [])
  const hi = new Set(scene.highlight)
  const toneOf = (id: string): LineTone => (hi.has(id) ? 'accent' : 'ink')

  return (
    <StageContext.Provider value={stage}>
      {real && <RealLighting />}
      {drawn.map((p) => (p.shape.type === 'cable'
        ? <CableView key={p.id} part={p} tone={toneOf(p.id)} look={look} />
        : <PartNode key={p.id} part={p} tone={toneOf(p.id)} look={look} bare={bare.has(p.id)} register={register} />))}
      {drawn.filter((p) => p.shape.type === 'led').map((p) => <LedSpill key={`spill-${p.id}`} id={p.id} />)}
      {callouts && <CalloutProjector callouts={scene.callouts} />}
    </StageContext.Provider>
  )
}
