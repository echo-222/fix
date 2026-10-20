import { Grid, Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Matrix4, Quaternion, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { isManualModel, type AnyModel } from '../domain/products'
import type { Guide, Motion, Part, Step, ToolSpec, V3 } from '../domain/types'
import { anim, currentGuide, useApp } from '../store'
import { focusScreen } from './focus'
import { getGeometry, getHexKey } from './geometries'
import { ACCENT, INK, LineMesh, type LineTone } from './LineArt'
import { ManualStage } from './manual/ManualStage'

type Status = 'installed' | 'active' | 'ghost' | 'hidden' | 'suggest' | 'explode'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const elapsed = () => (performance.now() - anim.start) / 1000

const DELAY: Record<Part['group'], number> = { leg: 0, beam: 0.3, brace: 0.45, bracket: 0.85, foot: 0, top: 0, accessory: 0.2 }

export function designStep(m: AnyModel): Step {
  return {
    id: 'design', title: '自定义设计', desc: '', chips: [], active: [], motion: 'none',
    focus: m.designView.focus,
    view: { dir: [1.1, 0.75, 1.5], dist: m.designView.dist },
    overlays: ['dims'],
  }
}

/** 倒置姿态：绕 z 轴转 180°，转轴在半高处，使原来的顶面落到地面 */
const flipPoint = (p: V3, h: number): V3 => [-p[0], h - p[1], p[2]]
const flipDir = (v: V3): V3 => [-v[0], -v[1], v[2]]

function posed(step: Step, h: number): Step {
  if (step.pose !== 'flipped') return step
  return {
    ...step,
    focus: flipPoint(step.focus, h),
    marker: step.marker && flipPoint(step.marker, h),
    tool: step.tool && { ...step.tool, at: flipPoint(step.tool.at, h), axis: flipDir(step.tool.axis) },
  }
}

export function useCurrentStep(): { step: Step; guide: Guide; design: boolean; index: number } {
  const guides = useApp((s) => s.guides)
  const guideId = useApp((s) => s.guideId)
  const stepIndex = useApp((s) => s.stepIndex)
  const panel = useApp((s) => s.panel)
  const model = useApp((s) => s.model)
  const guide = currentGuide({ guides, guideId })
  const index = Math.min(stepIndex, guide.steps.length - 1)
  const design = panel === 'design'
  const step = useMemo(() => (design ? designStep(model) : guide.steps[index]), [design, model, guide, index])
  return { step, guide, design, index }
}

function PartView({ part, status, motion, center, label }: {
  part: Part; status: Status; motion: Motion; center: V3; label: boolean
}) {
  const ref = useRef<Group>(null)
  const geo = getGeometry(part.geo)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = elapsed()
    let k = 0
    let v: V3 = [0, 0, 0]
    if (status === 'active' && motion === 'enter') {
      k = 1 - easeOut(clamp01((t - (part.delay ?? DELAY[part.group])) / 0.9))
      v = part.enterFrom
    } else if (status === 'active' && motion === 'swap') {
      k = 0.4 * (0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 2.4))
      v = part.enterFrom
    } else if (status === 'explode') {
      k = easeInOut(clamp01(t / 1.4))
      v = [
        (part.position[0] - center[0]) * 0.55 + part.enterFrom[0] * 0.4,
        (part.position[1] - center[1]) * 0.35 + part.enterFrom[1] * 0.4,
        (part.position[2] - center[2]) * 0.55 + part.enterFrom[2] * 0.4,
      ]
    }
    g.position.set(part.position[0] + v[0] * k, part.position[1] + v[1] * k, part.position[2] + v[2] * k)
  })
  if (status === 'hidden') return null
  const tone: LineTone = status === 'active' ? 'accent' : status === 'ghost' ? 'ghost' : status === 'suggest' ? 'suggest' : 'ink'
  const filled = status !== 'ghost' && status !== 'suggest'
  return (
    <group ref={ref} position={part.position} quaternion={part.quaternion ?? [0, 0, 0, 1]}>
      <LineMesh geometry={geo} tone={tone} filled={filled} fillTone={part.group === 'top' ? 'fillWarm' : 'fill'} />
      {label && (
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`part-label ${status === 'suggest' ? 'is-suggest' : ''}`}>
            <b>{part.name}</b>
            <span>{part.spec}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

function Furniture({ step, guide, design, index }: { step: Step; guide: Guide; design: boolean; index: number }) {
  const model = useApp((s) => s.model)
  const showGhost = useApp((s) => s.showGhost)
  const showLabels = useApp((s) => s.showLabels)
  const group = useRef<Group>(null)
  const mats = useMemo(() => ({ shear: new Matrix4(), rot: new Matrix4(), t: new Matrix4() }), [])
  const angle = useRef(0)
  const lastProduct = useRef(model.product)
  const center = model.center
  const active = useMemo(() => new Set(step.active), [step])
  const flipped = !design && step.pose === 'flipped'

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const target = flipped ? Math.PI : 0
    if (lastProduct.current !== model.product) {
      lastProduct.current = model.product
      angle.current = target
    }
    angle.current += (target - angle.current) * (1 - Math.exp(-dt * 4.5))
    if (Math.abs(target - angle.current) < 1e-3) angle.current = target
    const { shear, rot, t } = mats
    if (step.motion === 'wiggle') {
      const k = Math.sin(elapsed() * 5.5) * 0.014
      shear.set(1, k, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    } else shear.identity()
    const h = model.dims.height
    g.matrix.makeTranslation(0, h / 2, 0)
    g.matrix.multiply(rot.makeRotationZ(angle.current))
    g.matrix.multiply(t.makeTranslation(0, -h / 2, 0))
    g.matrix.multiply(shear)
    g.matrixWorldNeedsUpdate = true
  })

  const statusOf = (p: Part): Status => {
    if (design) return 'installed'
    if (step.motion === 'explode') return 'explode'
    if (guide.visibility === 'all') return active.has(p.id) ? 'active' : 'installed'
    const at = guide.installAt[p.id] ?? 0
    if (at < index) return 'installed'
    if (at === index) return 'active'
    return showGhost ? 'ghost' : 'hidden'
  }
  const labelable = (p: Part) => p.group !== 'bracket' && p.geo.kind !== 'cap' && p.geo.kind !== 'plate' && p.geo.kind !== 'rodCap'

  return (
    <group ref={group} matrixAutoUpdate={false}>
      {model.parts.map((p) => {
        const st = statusOf(p)
        return (
          <PartView
            key={p.id}
            part={p}
            status={st}
            motion={step.motion}
            center={center}
            label={showLabels && labelable(p) && (st === 'active' || (design && p.group !== 'foot'))}
          />
        )
      })}
      {step.suggest?.map((p) => (
        <PartView key={`s-${p.id}`} part={p} status="suggest" motion="none" center={center} label={showLabels && labelable(p)} />
      ))}
    </group>
  )
}

function Tool({ tool, stepKey }: { tool: ToolSpec; stepKey: string }) {
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const scale = (tool.size / 40) * 1.5
  const q = useMemo(() => {
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...tool.axis).normalize())
    return [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number]
  }, [tool.axis])
  useFrame(() => {
    if (!outer.current || !inner.current) return
    const t = elapsed() - 0.9
    const p = easeOut(clamp01(t / 0.7))
    const d = (1 - p) * 160 * scale
    outer.current.position.set(tool.at[0] + tool.axis[0] * d, tool.at[1] + tool.axis[1] * d, tool.at[2] + tool.axis[2] * d)
    const spin = t > 0.7 ? (t - 0.7) * 2.4 : 0
    inner.current.rotation.y = 0.6 + (spin % (Math.PI * 0.75))
    outer.current.visible = t > -0.2
  })
  return (
    <group ref={outer} quaternion={q} key={stepKey}>
      <group ref={inner}>
        <LineMesh geometry={getHexKey(scale)} tone="inkBold" />
      </group>
    </group>
  )
}

function FocusRing({ at }: { at: V3 }) {
  return (
    <Html position={at} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="focus-ring" />
    </Html>
  )
}

/** 工程图式尺寸线：两端短刻度 + 中间数值，tick 为刻度方向 */
function DimLine({ a, b, label, tick }: { a: V3; b: V3; label: string; tick: V3 }) {
  const t = (p: V3, s: number): V3 => [p[0] + tick[0] * s, p[1] + tick[1] * s, p[2] + tick[2] * s]
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  return (
    <group>
      <Line points={[a, b]} color={INK} lineWidth={1} />
      <Line points={[t(a, -22), t(a, 22)]} color={INK} lineWidth={1} />
      <Line points={[t(b, -22), t(b, 22)]} color={INK} lineWidth={1} />
      <Html position={mid} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
        <div className="dim-label">{label}</div>
      </Html>
    </group>
  )
}

function Overlays({ step }: { step: Step }) {
  const model = useApp((s) => s.model)
  const { width, depth, height } = model.dims
  const diag = model.overlay.diag
  const load = model.overlay.load
  const o = step.overlays ?? []
  const W = width / 2
  const Dz = depth / 2
  const gap = Math.max(80, Math.min(110, width * 0.12))
  return (
    <group>
      {o.includes('dims') && (
        <>
          <DimLine a={[-W, 1, Dz + gap]} b={[W, 1, Dz + gap]} label={`${Math.round(width)}`} tick={[0, 0, 1]} />
          <DimLine a={[W + gap, 1, -Dz]} b={[W + gap, 1, Dz]} label={`${Math.round(depth)}`} tick={[1, 0, 0]} />
          <DimLine a={[W + gap, 0, Dz + gap]} b={[W + gap, height, Dz + gap]} label={`${Math.round(height)}`} tick={[1, 0, 0]} />
        </>
      )}
      {o.includes('diagonals') && diag && (() => {
        const { y, x, front, back, zc } = diag
        const Df = front - back
        const len = Math.round(Math.hypot(x * 2, Df))
        return (
          <>
            <Line points={[[-x, y, front], [x, y, back]]} color={ACCENT} lineWidth={1.6} dashed dashSize={30} gapSize={18} />
            <Line points={[[x, y, front], [-x, y, back]]} color={ACCENT} lineWidth={1.6} dashed dashSize={30} gapSize={18} />
            <Html position={[-x * 0.5, y, zc + Df * 0.25]} center style={{ pointerEvents: 'none' }}>
              <div className="dim-label is-accent">A {len}</div>
            </Html>
            <Html position={[x * 0.5, y, zc + Df * 0.25]} center style={{ pointerEvents: 'none' }}>
              <div className="dim-label is-accent">B {len}</div>
            </Html>
          </>
        )
      })()}
      {o.includes('load') && load && (
        <group>
          {[-0.33, 0, 0.33].flatMap((fx) => (load.d > 0 ? [-0.2, 0.2] : [0]).map((fz) => {
            const x = fx * load.w
            const z = fz * load.d
            const y0 = load.y
            return (
              <group key={`${fx}-${fz}`}>
                <Line points={[[x, y0 + 180, z], [x, y0, z]]} color={ACCENT} lineWidth={1.6} />
                <Line points={[[x - 14, y0 + 26, z], [x, y0, z], [x + 14, y0 + 26, z]]} color={ACCENT} lineWidth={1.6} />
              </group>
            )
          }))}
          <Html position={[0, load.y + 230, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="dim-label is-accent">{load.kg}kg</div>
          </Html>
        </group>
      )}
    </group>
  )
}

function CameraRig({ step, stepKey }: { step: Step; stepKey: string }) {
  const { camera, size } = useThree()
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const fly = useRef<{ fp: Vector3; ft: Vector3; tp: Vector3; tt: Vector3; t0: number } | null>(null)

  useEffect(() => {
    if (!controls) return
    const tt = new Vector3(...step.focus)
    const dir = new Vector3(...step.view.dir).normalize()
    const aspect = size.width / Math.max(1, size.height)
    const dist = step.view.dist * (aspect < 1.25 ? Math.min(2.2, 1.25 / aspect) : 1)
    fly.current = { fp: camera.position.clone(), ft: controls.target.clone(), tp: tt.clone().addScaledVector(dir, dist), tt, t0: performance.now() }
    const cancel = () => {
      fly.current = null
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [stepKey, controls, size.width, size.height])

  useFrame(() => {
    if (!controls) return
    controls.autoRotate = !!step.autoRotate && !fly.current
    controls.autoRotateSpeed = 0.7
    const f = fly.current
    if (!f) return
    const p = easeInOut(clamp01((performance.now() - f.t0) / 1100))
    camera.position.lerpVectors(f.fp, f.tp, p)
    controls.target.lerpVectors(f.ft, f.tt, p)
    controls.update()
    if (p >= 1) fly.current = null
  })
  return null
}

/** 侧边面板打开时把投影中心左移，避免模型被面板遮住 */
function PanelOffset({ shifted }: { shifted: boolean }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as import('three').PerspectiveCamera
    if (shifted && size.width > 760) cam.setViewOffset(size.width, size.height, 190, 0, size.width, size.height)
    else cam.clearViewOffset()
  }, [camera, shifted, size.width, size.height])
  return null
}

function FocusProjector({ at, enabled }: { at: V3; enabled: boolean }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    v.set(...at).project(camera)
    focusScreen.x = ((v.x + 1) / 2) * size.width
    focusScreen.y = ((1 - v.y) / 2) * size.height
    focusScreen.visible = enabled && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
  })
  return null
}

function SceneContent() {
  const { step: raw, guide, design, index } = useCurrentStep()
  const model = useApp((s) => s.model)
  const step = useMemo(() => (design ? raw : posed(raw, model.dims.height)), [raw, design, model])
  const showDetail = useApp((s) => s.showDetail)
  const panel = useApp((s) => s.panel)
  const viewNonce = useApp((s) => s.viewNonce)
  const stepKey = `${guide.id}:${index}:${design}:${step.id}:${viewNonce}`
  const manual = isManualModel(model) ? model : null
  const focusAt = step.tool?.at ?? step.marker ?? step.focus
  const hasDetail = !design && (!!step.detail || !!step.scene?.zoom) && showDetail
  const showRing = !design && step.motion !== 'explode' && (!!step.tool || !!step.marker || (!!step.detail && !step.autoRotate))
  return (
    <>
      {manual && step.scene
        ? <ManualStage model={manual} scene={step.scene} />
        : <Furniture step={step} guide={guide} design={design} index={index} />}
      {!design && step.tool && <Tool key={stepKey} tool={step.tool} stepKey={stepKey} />}
      {showRing && <FocusRing at={focusAt} />}
      {!manual && <Overlays step={step} />}
      <Grid
        args={[20000, 20000]}
        position={[0, -0.5, 0]}
        cellSize={manual ? 50 : 100}
        cellThickness={0.6}
        cellColor="#ece8e0"
        sectionSize={manual ? 250 : 500}
        sectionThickness={1}
        sectionColor="#ddd7cc"
        fadeDistance={manual ? manual.scene.stageSize * 3 : Math.max(model.dims.width, model.dims.height) * 5}
        fadeStrength={2}
        infiniteGrid
      />
      <CameraRig step={step} stepKey={stepKey} />
      <PanelOffset shifted={panel !== 'none'} />
      <FocusProjector at={focusAt} enabled={hasDetail} />
    </>
  )
}

export function MainCanvas() {
  const manual = useApp((s) => isManualModel(s.model))
  return (
    <Canvas
      className="main-canvas"
      flat
      dpr={[1, 2]}
      camera={{ fov: 30, near: 10, far: 40000, position: [2400, 1800, 3200] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => gl.setClearColor('#fbfaf7')}
    >
      <SceneContent />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={manual ? 40 : 150} maxDistance={12000} />
    </Canvas>
  )
}
