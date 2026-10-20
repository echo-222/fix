import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry, CanvasTexture, CircleGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, Quaternion, Shape as ThreeShape, ShapeGeometry, SRGBColorSpace, Vector3,
} from 'three'
import type { ManualModel, PartFrame, ScenePart, SceneStep } from '../../domain/manual/compile'
import type { Callout, Fill, Light, ScreenUI, Shape, Vec3 } from '../../domain/manual/types'
import { anim } from '../../store'
import { calloutScreen } from '../focus'
import { INK, LineMesh, MATS, SilhouetteLines, type FillTone, type LineTone } from '../LineArt'
import { drawScreen } from './screenUI'
import { solidGeometry } from './shapes'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const elapsed = () => (performance.now() - anim.start) / 1000
const DEG = Math.PI / 180

const FILL: Record<Fill, FillTone> = { white: 'fill', warm: 'fillWarm', shade: 'fillShade', dark: 'fillDark' }

interface Stage {
  mats: Map<string, Matrix4>
  vis: Map<string, boolean>
  /** glide 动作当前的桌面偏移（x, z），屏幕光标同步 */
  glide: [number, number]
  scene: SceneStep
  settle: number
}
const StageContext = createContext<Stage | null>(null)
const useStage = () => useContext(StageContext)!

const glideAt = (t: number): [number, number] => [42 * Math.sin(t * 1.5), 20 * Math.sin(t * 3)]

function sameTransform(a: PartFrame, b: PartFrame) {
  return a.parent === b.parent && a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-6) && a.quat.every((v, i) => Math.abs(v - b.quat[i]) < 1e-6)
}

/** 这一步状态在 t 时刻生效的那一份（灯 / 屏幕在过渡开始时切换） */
const activeFrame = (scene: SceneStep, id: string, t: number) => (t >= scene.to[id].delay ? scene.to[id] : scene.from[id])

function ledLit(scene: SceneStep, id: string, t: number) {
  const to = scene.to[id]
  const f = activeFrame(scene, id, t)
  const phase = f === to ? t - to.delay : t + 10
  const blink = (phase * 2.4) % 1 < 0.55
  const L: Light = f.light
  return L === 'on' || (L === 'blink' && blink) || (L === 'blinkThenOff' && phase < 3.6 && blink) ? f.color : null
}

// ---------- 每帧求所有零件的世界矩阵 ----------

const tmp = {
  p0: new Vector3(), p1: new Vector3(), p: new Vector3(), c: new Vector3(), s: new Vector3(),
  q0: new Quaternion(), q1: new Quaternion(), q: new Quaternion(),
  local: new Matrix4(), m: new Matrix4(), one: new Vector3(1, 1, 1), axis: new Vector3(),
}
const IDENTITY = new Matrix4()
const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

function solve(stage: Stage, order: string[], changed: Set<string>, t: number) {
  const { scene, mats, vis } = stage
  const { p0, p1, p, c, s, q0, q1, q, local, m, one } = tmp
  stage.glide = [0, 0]
  for (const id of order) {
    const f = scene.from[id]
    const g = scene.to[id]
    const moving = changed.has(id)
    const k = moving ? easeInOut(clamp01((t - g.delay) / g.dur)) : 1
    const parentW = g.parent ? mats.get(g.parent) ?? IDENTITY : IDENTITY
    const world = mats.get(id) ?? new Matrix4()
    if (!moving || (f.parent === g.parent && !g.via)) {
      p.fromArray(f.pos).lerp(p1.fromArray(g.pos), k)
      q.fromArray(f.quat).slerp(q1.fromArray(g.quat), k)
      world.multiplyMatrices(parentW, local.compose(p, q, one))
    } else {
      m.fromArray(f.world).decompose(p0, q0, s)
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
      const at = t - (a.delay ?? stage.settle)
      if (at < 0) continue
      if (a.type === 'press') {
        const cyc = at % 1.6
        const down = cyc < 0.12 ? cyc / 0.12 : cyc < 0.3 ? 1 : cyc < 0.45 ? 1 - (cyc - 0.3) / 0.15 : 0
        world.multiply(m.makeTranslation(0, -(a.depth ?? 1.2) * down, 0))
      } else if (a.type === 'spin') {
        world.multiply(m.makeRotationAxis(AXES[a.axis ?? 'x'], -at * 4))
      } else if (a.type === 'shake') {
        const amp = (a.amp ?? 1.5) * Math.sin(at * 18) * (at % 2 < 0.8 ? 1 : 0)
        const ax = AXES[a.axis ?? 'x']
        world.multiply(m.makeTranslation(ax.x * amp, ax.y * amp, ax.z * amp))
      } else if (a.type === 'glide') {
        const [dx, dz] = glideAt(at)
        stage.glide = [dx, dz]
        world.premultiply(m.makeTranslation(dx, 0, dz))
      }
    }
    mats.set(id, world)
    const own = f.visible === g.visible ? g.visible : g.visible ? t >= g.delay : k < 1
    vis.set(id, own && (!g.parent || vis.get(g.parent) !== false))
  }
}

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
      <mesh ref={cursor} geometry={cursorGeo} material={MATS.fillDark} />
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

function ShapeView({ id, shape, tone, fill }: { id: string; shape: Shape; tone: LineTone; fill?: Fill }) {
  switch (shape.type) {
    case 'compound':
      return (
        <>
          {shape.items.map((it, i) => (
            <group key={i} position={it.at ?? [0, 0, 0]} rotation={(it.rot ?? [0, 0, 0]).map((v) => v * DEG) as Vec3}>
              <ShapeView id={id} shape={it} tone={tone} fill={it.fill ?? (it.type === 'hole' ? undefined : fill)} />
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
          <LineMesh geometry={solidGeometry(shape)!} tone={tone} fillTone={FILL[fill ?? 'shade']} />
        </group>
      )
    default:
      return <LineMesh geometry={solidGeometry(shape)!} tone={tone} fillTone={FILL[fill ?? 'white']} threshold={shape.type === 'shell' ? 30 : undefined} />
  }
}

function PartNode({ part, tone, register }: { part: ScenePart; tone: LineTone; register: (id: string, g: Group | null) => void }) {
  return (
    <group ref={(g) => register(part.id, g)} matrixAutoUpdate={false}>
      <group position={part.pivot ?? [0, 0, 0]}>
        <ShapeView id={part.id} shape={part.shape} tone={tone} fill={part.fill} />
      </group>
    </group>
  )
}

// ---------- 线缆 ----------

const SEG = 64
const RAD = 10

function CableView({ part, tone }: { part: ScenePart; tone: LineTone }) {
  const stage = useStage()
  const shape = part.shape as Extract<Shape, { type: 'cable' }>
  const r = shape.r ?? 1.8
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
      <mesh geometry={geo} material={MATS.fill} frustumCulled={false} />
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
    const settled = elapsed() > stage.settle * 0.7
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

export function ManualStage({ model, scene, callouts = true }: { model: ManualModel; scene: SceneStep; callouts?: boolean }) {
  const groups = useRef(new Map<string, Group>())
  const stage = useMemo<Stage>(() => ({ mats: new Map(), vis: new Map(), glide: [0, 0], scene, settle: 0 }), [])
  const parts = model.scene.parts
  const { order, changed, settle } = useMemo(() => {
    const depth = (id: string) => {
      let d = 0
      for (let p = scene.to[id]?.parent; p && d < 64; p = scene.to[p]?.parent) d++
      return d
    }
    const order = parts.map((p) => p.id).sort((a, b) => depth(a) - depth(b))
    const changed = new Set(parts.filter((p) => !sameTransform(scene.from[p.id], scene.to[p.id]) || scene.from[p.id].visible !== scene.to[p.id].visible).map((p) => p.id))
    let settle = 0
    for (const p of parts) {
      const g = scene.to[p.id]
      const f = scene.from[p.id]
      if (changed.has(p.id) || f.light !== g.light || f.ui !== g.ui) settle = Math.max(settle, g.delay + (changed.has(p.id) ? g.dur : 0))
    }
    return { order, changed, settle }
  }, [scene, parts])
  stage.scene = scene
  stage.settle = settle

  useFrame(() => {
    solve(stage, order, changed, elapsed())
    for (const [id, g] of groups.current) {
      const m = stage.mats.get(id)
      if (!m) continue
      g.matrix.copy(m)
      g.matrixWorldNeedsUpdate = true
      g.visible = stage.vis.get(id) !== false
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
      {parts.map((p) => (p.shape.type === 'cable'
        ? <CableView key={p.id} part={p} tone={toneOf(p.id)} />
        : <PartNode key={p.id} part={p} tone={toneOf(p.id)} register={register} />))}
      {parts.filter((p) => p.shape.type === 'led').map((p) => <LedSpill key={`spill-${p.id}`} id={p.id} />)}
      {callouts && <CalloutProjector callouts={scene.callouts} />}
    </StageContext.Provider>
  )
}
