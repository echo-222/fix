import { Html, Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { BoxGeometry, ExtrudeGeometry, Group, Matrix4, Quaternion, Shape, Vector3 } from 'three'
import { PROFILES, type BoltSize, type ProfileId } from '../domain/profiles'
import { screwLocal } from '../domain/shaft/common'
import { CLAMP, COLLAR, SHAFT, SHF, type ShaftD } from '../domain/shaft/specs'
import type { DetailKind, V3 } from '../domain/types'
import { useApp } from '../store'
import { cached, cyl, getGeometry, getHexKey, merge } from './geometries'
import { ACCENT, INK, LineMesh } from './LineArt'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const loop = (period: number) => (performance.now() / 1000) % period

const BOLT_D: Record<BoltSize, number> = { M5: 5, M6: 6, M8: 8 }

function slotDims(pid: ProfileId) {
  const p = PROFILES[pid]
  const m = p.module
  return { m, H: p.rows * m, W: p.cols * m, o: p.slot / 2, neck: m * 0.1, cav: m * 0.27, cavD: m * 0.22 }
}

/** 滑入式 T 型螺母，坐标与横放型材（axis x）顶部槽一致 */
function tnutGeometry(pid: ProfileId) {
  const { H, o, neck, cav, cavD } = slotDims(pid)
  const y0 = H / 2 - neck
  const s = new Shape()
  s.moveTo(-cav * 0.9, y0 - 0.3)
  s.lineTo(-o * 0.85, y0 - 0.3)
  s.lineTo(-o * 0.85, H / 2 - 0.6)
  s.lineTo(o * 0.85, H / 2 - 0.6)
  s.lineTo(o * 0.85, y0 - 0.3)
  s.lineTo(cav * 0.9, y0 - 0.3)
  s.lineTo(cav * 0.5, y0 - cavD * 0.85)
  s.lineTo(-cav * 0.5, y0 - cavD * 0.85)
  s.closePath()
  const len = slotDims(pid).m * 0.45
  const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: false })
  g.translate(0, 0, -len / 2)
  g.rotateY(Math.PI / 2)
  return g
}

/** 弹片 / 旋入式螺母：窄边可穿过槽口，旋转 90° 后卡住 */
function dropinGeometry(pid: ProfileId) {
  const { H, o, neck, cav, cavD } = slotDims(pid)
  const g = new BoxGeometry(cav * 1.75, cavD * 0.7, o * 1.6)
  g.translate(0, H / 2 - neck - cavD * 0.4, 0)
  return g
}

/** 内六角圆柱头螺丝：原点在螺丝头底面，螺杆沿 -Y */
function boltGeometry(size: BoltSize, len = 16) {
  const d = BOLT_D[size]
  return merge([cyl(d * 0.8, d * 0.8, d, d / 2, 20), cyl(d * 0.42, d * 0.42, 0.6, d + 0.3, 6), cyl(d / 2, d / 2, len, -len / 2, 14)])
}

function woodScrewGeometry() {
  return merge([cyl(4, 2, 3, 1.5, 16), cyl(2.1, 2.1, 14, -7, 10), cyl(2.1, 0.4, 4, -16, 10)])
}

const FlipContext = createContext(false)

/** 零件倒着装时（边几倒装、挂衣杆顶部 T 型夹）：内容绕 Z 轴转 180°，相机同步镜像 */
function Flip({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <FlipContext.Provider value={on}>
      <group rotation={[0, 0, on ? Math.PI : 0]}>{children}</group>
    </FlipContext.Provider>
  )
}

function DetailCamera({ pos, target, zoom = 1 }: { pos: V3; target: V3; zoom?: number }) {
  const camera = useThree((s) => s.camera)
  const flipped = useContext(FlipContext)
  useLayoutEffect(() => {
    const f = (v: V3) => (flipped ? new Vector3(-v[0], -v[1], v[2]) : new Vector3(...v))
    const t = f(target)
    const p = f(pos).sub(t).multiplyScalar(1 / zoom).add(t)
    camera.position.copy(p)
    camera.lookAt(t)
    camera.updateProjectionMatrix()
  }, [camera, pos, target, zoom, flipped])
  return null
}

function Anim({ children, update }: { children: ReactNode; update: (g: Group) => void }) {
  const ref = useRef<Group>(null)
  useFrame(() => ref.current && update(ref.current))
  return <group ref={ref}>{children}</group>
}

const quatFromBasis = (x: V3, y: V3) => {
  const X = new Vector3(...x)
  const Y = new Vector3(...y)
  const Z = new Vector3().crossVectors(X, Y)
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z))
  return [q.x, q.y, q.z, q.w] as [number, number, number, number]
}

function HexKeyAnim({ at, axis, scale, delay, period }: { at: V3; axis: V3; scale: number; delay: number; period: number }) {
  const q = useMemo(() => {
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...axis))
    return [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number]
  }, [axis])
  return (
    <Anim
      update={(g) => {
        const t = loop(period) - delay
        const p = easeOut(clamp01(t / 0.6))
        const d = (1 - p) * 70 * scale
        g.position.set(at[0] + axis[0] * d, at[1] + axis[1] * d, at[2] + axis[2] * d)
        g.visible = t > 0
        const inner = g.children[0] as Group
        inner.quaternion.fromArray(q)
        inner.rotateY(0.7 + (t > 0.6 ? Math.sin((t - 0.6) * 3) * 0.9 : 0))
      }}
    >
      <group>
        <LineMesh geometry={getHexKey(scale)} tone="inkBold" />
      </group>
    </Anim>
  )
}

function TNutDetail({ pid }: { pid: ProfileId }) {
  const { H, m } = slotDims(pid)
  const bolt = PROFILES[pid].bolt
  const prof = getGeometry({ kind: 'profile', profile: pid, length: 160, axis: 'x', full: true })
  const nut = cached(`tnut-${pid}`, () => tnutGeometry(pid))
  const b = cached(`bolt-${bolt}`, () => boltGeometry(bolt))
  return (
    <>
      <DetailCamera pos={[260, 150, 230]} target={[50, 0, 0]} zoom={40 / m} />
      <LineMesh geometry={prof} />
      <Anim update={(g) => { g.position.x = 160 - easeOut(clamp01(loop(4) / 1.4)) * 135 }}>
        <LineMesh geometry={nut} tone="accent" fillTone="fillAccent" />
      </Anim>
      <Anim
        update={(g) => {
          const t = loop(4)
          const k = easeOut(clamp01((t - 1.7) / 0.8))
          g.visible = t > 1.6
          g.position.set(25, H / 2 + (1 - k) * 46, 0)
          g.rotation.y = t > 1.7 ? (t - 1.7) * 5 : 0
        }}
      >
        <LineMesh geometry={b} />
      </Anim>
    </>
  )
}

function DropInDetail({ pid }: { pid: ProfileId }) {
  const { H, m } = slotDims(pid)
  const prof = getGeometry({ kind: 'profile', profile: pid, length: 160, axis: 'x', full: true })
  const nut = cached(`dropin-${pid}`, () => dropinGeometry(pid))
  return (
    <>
      <DetailCamera pos={[85, 115, 125]} target={[0, H / 2 - 2, 0]} zoom={40 / m} />
      <LineMesh geometry={prof} />
      <Anim
        update={(g) => {
          const t = loop(3.6)
          const drop = easeOut(clamp01(t / 0.9))
          const turn = easeOut(clamp01((t - 1.1) / 0.7))
          g.position.y = (1 - drop) * 40
          g.rotation.y = turn * (Math.PI / 2)
        }}
      >
        <LineMesh geometry={nut} tone="accent" fillTone="fillAccent" />
      </Anim>
      <Html position={[0, H / 2 + 34, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">放入 → 旋转 90°</div>
      </Html>
    </>
  )
}

function CornerFrame({ legPid, beamPid }: { legPid: ProfileId; beamPid: ProfileId }) {
  const lm = PROFILES[legPid].module
  const bh = PROFILES[beamPid].rows * PROFILES[beamPid].module
  const leg = getGeometry({ kind: 'profile', profile: legPid, length: 180, axis: 'y', full: true })
  const beam = getGeometry({ kind: 'profile', profile: beamPid, length: 160, axis: 'x', full: true })
  return (
    <>
      <group position={[0, 0, 0]}><LineMesh geometry={leg} /></group>
      <group position={[lm / 2 + 80, 90 - bh / 2, 0]}><LineMesh geometry={beam} /></group>
    </>
  )
}

function BracketDetail({ legPid, beamPid }: { legPid: ProfileId; beamPid: ProfileId }) {
  const lm = PROFILES[legPid].module
  const bm = PROFILES[beamPid].module
  const bh = PROFILES[beamPid].rows * bm
  const br = getGeometry({ kind: 'bracket', size: bm })
  const q = useMemo(() => quatFromBasis([1, 0, 0], [0, -1, 0]), [])
  const corner: V3 = [lm / 2, 90 - bh, 0]
  const t = bm * 0.14
  return (
    <>
      <DetailCamera pos={[250, -10, 300]} target={[55, 40, 0]} zoom={1.05} />
      <CornerFrame legPid={legPid} beamPid={beamPid} />
      <Anim update={(g) => { g.position.set(corner[0], corner[1] - (1 - easeOut(clamp01(loop(4.2) / 0.9))) * 50, corner[2]) }}>
        <group quaternion={q}><LineMesh geometry={br} tone="accent" fillTone="fillAccent" /></group>
      </Anim>
      <HexKeyAnim at={[corner[0] + t + 0.5, corner[1] - bm * 0.55, 0]} axis={[1, 0, 0]} scale={bm / 40} delay={1.1} period={4.2} />
    </>
  )
}

function InternalDetail({ legPid, beamPid }: { legPid: ProfileId; beamPid: ProfileId }) {
  const lm = PROFILES[legPid].module
  const bm = PROFILES[beamPid].module
  const bh = PROFILES[beamPid].rows * bm
  const hole: V3 = [lm / 2 + bm * 0.8, 90 - bh - 0.4, 0]
  const ring = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    return [hole[0] + Math.cos(a) * 4, hole[1], hole[2] + Math.sin(a) * 4] as V3
  })
  return (
    <>
      <DetailCamera pos={[240, -140, 260]} target={[50, 40, 0]} />
      <CornerFrame legPid={legPid} beamPid={beamPid} />
      <Line points={ring} color={ACCENT} lineWidth={1.6} />
      <HexKeyAnim at={hole} axis={[0, -1, 0]} scale={bm / 40} delay={0.4} period={3.6} />
      <Html position={[hole[0] + 40, hole[1] - 30, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">工艺孔</div>
      </Html>
    </>
  )
}

function FootDetail({ legPid, kind }: { legPid: ProfileId; kind: 'leveler' | 'caster' }) {
  const leg = getGeometry({ kind: 'profile', profile: legPid, length: 200, axis: 'y', full: true })
  const size = kind === 'leveler' ? 22 : 78
  const foot = getGeometry({ kind, size } as { kind: 'leveler'; size: number })
  const travel = kind === 'leveler' ? 50 : 30
  return (
    <>
      <DetailCamera
        pos={kind === 'leveler' ? [150, 55, 200] : [230, 30, 290]}
        target={kind === 'leveler' ? [0, 8, 0] : [0, -25, 0]}
      />
      <group position={[0, 100, 0]}><LineMesh geometry={leg} /></group>
      <Anim
        update={(g) => {
          const t = loop(4)
          const k = easeOut(clamp01(t / 1.8))
          g.position.y = -(1 - k) * travel
          g.rotation.y = kind === 'leveler' ? k * Math.PI * 4 : 0
        }}
      >
        <LineMesh geometry={foot} tone="accent" fillTone="fillAccent" />
      </Anim>
    </>
  )
}

function TopScrewDetail({ beamPid, t: T }: { beamPid: ProfileId; t: number }) {
  const bm = PROFILES[beamPid].module
  const bh = PROFILES[beamPid].rows * bm
  const beam = getGeometry({ kind: 'profile', profile: beamPid, length: 240, axis: 'x', full: true })
  const board = getGeometry({ kind: 'board', w: 260, t: T, d: 200 })
  const plate = getGeometry({ kind: 'bracket', size: 20 })
  const screw = cached('woodscrew', woodScrewGeometry)
  const q = useMemo(() => quatFromBasis([0, 0, 1], [0, -1, 0]), [])
  const zf = bm / 2
  return (
    <>
      <DetailCamera pos={[95, -125, 165]} target={[0, -12, 22]} />
      <group position={[0, -bh / 2, 0]}><LineMesh geometry={beam} /></group>
      <group position={[0, T / 2, 30]}><LineMesh geometry={board} fillTone="fillWarm" /></group>
      <group position={[0, 0, zf]} quaternion={q}><LineMesh geometry={plate} /></group>
      <Anim
        update={(g) => {
          const t = loop(3.6)
          const k = easeOut(clamp01(t / 1.6))
          g.position.set(0, -2.8 - (1 - k) * 40, zf + 11)
          g.rotation.y = k * Math.PI * 5
        }}
      >
        <group rotation={[Math.PI, 0, 0]}><LineMesh geometry={screw} tone="accent" fillTone="fillAccent" /></group>
      </Anim>
    </>
  )
}

function SquareDetail() {
  const w = 200
  const d = 120
  const dot = useRef<Group>(null)
  useFrame(() => {
    if (!dot.current) return
    const t = loop(4)
    const a = t < 2
    const k = easeOut(clamp01((t % 2) / 1.5))
    const [x0, z0, x1, z1] = a ? [-w, d, w, -d] : [w, d, -w, -d]
    dot.current.position.set(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k)
  })
  return (
    <>
      <DetailCamera pos={[0, 1150, 260]} target={[0, 0, 20]} />
      <Line points={[[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d], [-w, 0, -d]]} color={INK} lineWidth={2} />
      <Line points={[[-w, 0, d], [w, 0, -d]]} color={ACCENT} lineWidth={1.6} dashed dashSize={12} gapSize={8} />
      <Line points={[[w, 0, d], [-w, 0, -d]]} color={ACCENT} lineWidth={1.6} dashed dashSize={12} gapSize={8} />
      <group ref={dot}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[7, 20]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
      </group>
      <Html position={[0, 0, d + 46]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">A = B（误差 ≤ 2mm）</div>
      </Html>
    </>
  )
}

function PlateDetail({ legPid }: { legPid: ProfileId }) {
  const m = PROFILES[legPid].module
  const upPid: ProfileId = legPid === '4080' ? '4040' : legPid
  const lz = PROFILES[legPid].rows * m
  const us = PROFILES[upPid].module
  const leg = getGeometry({ kind: 'profile', profile: legPid, length: 200, axis: 'y', full: true })
  const up = getGeometry({ kind: 'profile', profile: upPid, length: 280, axis: 'y', full: true })
  const plate = getGeometry({ kind: 'plate', w: (lz + us) * 0.9, h: 120, t: 4 })
  const bolt = cached('bolt-M6-8', () => boltGeometry('M6', 8))
  const qb = useMemo(() => quatFromBasis([0, -1, 0], [1, 0, 0]), [])
  // 螺丝位置相对连接板中心：两颗在桌腿上，两颗在立柱上
  const bolts: [number, number][] = [[30, us / 2], [-30, us / 2], [30, -lz / 2], [-30, -lz / 2]]
  return (
    <>
      <DetailCamera pos={[330, 90, 120]} target={[0, 10, -30]} />
      <group position={[0, -20, 0]}><LineMesh geometry={leg} /></group>
      <group position={[0, 30, -lz / 2 - us / 2]}><LineMesh geometry={up} /></group>
      <Anim update={(g) => { g.position.set(m / 2 + 2 + (1 - easeOut(clamp01(loop(4) / 1))) * 70, 0, -us / 2) }}>
        <LineMesh geometry={plate} tone="accent" fillTone="fillAccent" />
        {bolts.map(([y, z], i) => (
          <Anim key={i} update={(g) => { g.visible = loop(4) > 1.2 + i * 0.25 }}>
            <group position={[2, y, z]} quaternion={qb}><LineMesh geometry={bolt} /></group>
          </Anim>
        ))}
      </Anim>
    </>
  )
}

function TrayDetail({ beamPid }: { beamPid: ProfileId }) {
  const bm = PROFILES[beamPid].module
  const bh = PROFILES[beamPid].rows * bm
  const beam = getGeometry({ kind: 'profile', profile: beamPid, length: 260, axis: 'x', full: true })
  const tray = getGeometry({ kind: 'tray', length: 200, w: 110, h: 70 })
  return (
    <>
      <DetailCamera pos={[220, -80, 300]} target={[0, -40, 40]} />
      <group position={[0, bh / 2, 0]}><LineMesh geometry={beam} /></group>
      <Anim update={(g) => { g.position.set(0, -6 - (1 - easeOut(clamp01(loop(3.6) / 1.4))) * 90, bm / 2 + 65) }}>
        <LineMesh geometry={tray} tone="accent" fillTone="fillAccent" />
      </Anim>
    </>
  )
}

function WobbleDetail({ legPid, beamPid }: { legPid: ProfileId; beamPid: ProfileId }) {
  const lm = PROFILES[legPid].module
  const leg = getGeometry({ kind: 'profile', profile: legPid, length: 300, axis: 'y', full: true })
  const beam = getGeometry({ kind: 'profile', profile: beamPid, length: 320 - lm * 2, axis: 'x', full: true })
  const ref = useRef<Group>(null)
  const mtx = useMemo(() => new Matrix4(), [])
  useFrame(() => {
    if (!ref.current) return
    mtx.set(1, Math.sin(performance.now() / 1000 * 4) * 0.08, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    ref.current.matrix.copy(mtx)
    ref.current.matrixWorldNeedsUpdate = true
  })
  return (
    <>
      <DetailCamera pos={[0, 175, 1050]} target={[0, 165, 0]} />
      <group ref={ref} matrixAutoUpdate={false}>
        <group position={[-160 + lm / 2, 150, 0]}><LineMesh geometry={leg} /></group>
        <group position={[160 - lm / 2, 150, 0]}><LineMesh geometry={leg} /></group>
        <group position={[0, 300 - 20, 0]}><LineMesh geometry={beam} tone="accent" /></group>
      </group>
      <Line points={[[-120, 340, 0], [120, 340, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[-100, 352, 0], [-120, 340, 0], [-100, 328, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[100, 352, 0], [120, 340, 0], [100, 328, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[-260, 0, 0], [260, 0, 0]]} color="#b7b1a6" lineWidth={1} />
    </>
  )
}

function SagDetail({ beamPid }: { beamPid: ProfileId }) {
  const beam = getGeometry({ kind: 'profile', profile: beamPid, length: 460, axis: 'x', full: true })
  const bh = PROFILES[beamPid].rows * PROFILES[beamPid].module
  const curve = useMemo(() => Array.from({ length: 31 }, (_, i) => {
    const x = -230 + (i / 30) * 460
    const u = (x + 230) / 460
    return [x, -bh / 2 - 6 - 26 * 4 * u * (1 - u), 0] as V3
  }), [bh])
  return (
    <>
      <DetailCamera pos={[0, 60, 820]} target={[0, -10, 0]} />
      <LineMesh geometry={beam} />
      <Line points={curve} color={ACCENT} lineWidth={1.6} dashed dashSize={10} gapSize={7} />
      <Anim update={(g) => { g.position.y = Math.sin(performance.now() / 260) * 5 }}>
        {[-120, 0, 120].map((x) => (
          <group key={x}>
            <Line points={[[x, bh / 2 + 90, 0], [x, bh / 2 + 10, 0]]} color={ACCENT} lineWidth={1.6} />
            <Line points={[[x - 9, bh / 2 + 24, 0], [x, bh / 2 + 10, 0], [x + 9, bh / 2 + 24, 0]]} color={ACCENT} lineWidth={1.6} />
          </group>
        ))}
      </Anim>
      <Line points={[[-250, -bh / 2 - 60, 0], [-210, -bh / 2 - 60, 0]]} color={INK} lineWidth={1} />
      <Line points={[[210, -bh / 2 - 60, 0], [250, -bh / 2 - 60, 0]]} color={INK} lineWidth={1} />
    </>
  )
}

function CapDetail({ legPid }: { legPid: ProfileId }) {
  const pid: ProfileId = legPid === '4080' ? '4040' : legPid
  const m = PROFILES[pid].module
  const up = getGeometry({ kind: 'profile', profile: pid, length: 200, axis: 'y', full: true })
  const cap = getGeometry({ kind: 'cap', w: m, d: m })
  return (
    <>
      <DetailCamera pos={[150, 220, 190]} target={[0, 70, 0]} />
      <LineMesh geometry={up} />
      <Anim update={(g) => { g.position.y = 101.5 + (1 - easeOut(clamp01(loop(3) / 1))) * 50 }}>
        <LineMesh geometry={cap} tone="accent" fillTone="fillAccent" />
      </Anim>
    </>
  )
}

// ---------- 光轴家具 ----------

const keyScale = (key: number) => (key * 6.5 / 40) * 1.5
const rodGeo = (d: number, length: number, axis: 'x' | 'y' | 'z' = 'y') => getGeometry({ kind: 'rod', d, length, axis })

function PencilMark({ d, y }: { d: number; y: number }) {
  const pts = useMemo(() => Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2
    return [Math.cos(a) * (d / 2 + 0.3), y, Math.sin(a) * (d / 2 + 0.3)] as V3
  }), [d, y])
  return <Line points={pts} color={ACCENT} lineWidth={1.4} dashed dashSize={2} gapSize={1.5} />
}

function RodFootDetail({ d }: { d: ShaftD }) {
  const foot = getGeometry({ kind: 'leveler', size: 22 })
  return (
    <>
      <DetailCamera pos={[130, 45, 170]} target={[0, 5, 0]} />
      <group position={[0, 110, 0]}><LineMesh geometry={rodGeo(d, 220)} /></group>
      <Anim update={(g) => {
        const k = easeOut(clamp01(loop(4) / 1.8))
        g.position.y = -(1 - k) * 45
        g.rotation.y = k * Math.PI * 4
      }}>
        <LineMesh geometry={foot} tone="accent" fillTone="fillAccent" />
      </Anim>
      <Html position={[0, 60, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">{SHAFT[d].endTap} 攻丝孔</div>
      </Html>
    </>
  )
}

function RodCapDetail({ d, bottom }: { d: ShaftD; bottom: boolean }) {
  const cap = getGeometry({ kind: 'rodCap', d })
  const q: [number, number, number, number] = bottom ? [0, 0, 0, 1] : [1, 0, 0, 0]
  const s = bottom ? -1 : 1
  return (
    <>
      <DetailCamera pos={[110, s * 70 + 10, 150]} target={[0, s * 2, 0]} zoom={12 / d} />
      <group position={[0, -s * 100, 0]}><LineMesh geometry={rodGeo(d, 200)} /></group>
      <Anim update={(g) => { g.position.y = s * (3 + (1 - easeOut(clamp01(loop(3) / 0.9))) * 45) }}>
        <group quaternion={q}><LineMesh geometry={cap} tone="accent" fillTone="fillAccent" /></group>
      </Anim>
    </>
  )
}

function CollarDetail({ d }: { d: ShaftD }) {
  const col = COLLAR[d]
  const geo = getGeometry({ kind: 'collar', d })
  return (
    <>
      <DetailCamera pos={[150, 70, 120]} target={[0, 4, 0]} zoom={12 / d} />
      <LineMesh geometry={rodGeo(d, 260)} />
      <PencilMark d={d} y={-col.w / 2} />
      <Anim update={(g) => { g.position.y = (1 - easeOut(clamp01(loop(4.2) / 1.2))) * 80 }}>
        <LineMesh geometry={geo} tone="accent" fillTone="fillAccent" />
      </Anim>
      <HexKeyAnim at={[col.od / 2, 0, 0]} axis={[1, 0, 0]} scale={keyScale(col.key)} delay={1.4} period={4.2} />
      <Html position={[0, -col.w / 2 - 16, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">对齐铅笔标记</div>
      </Html>
    </>
  )
}

function ShelfDetail({ d, t, clamp }: { d: ShaftD; t: number; clamp: boolean }) {
  const col = COLLAR[d]
  const geo = getGeometry({ kind: 'collar', d })
  const board = getGeometry({ kind: 'board', w: 170, t, d: 140, holes: [[60, 45]], hd: d + 0.5 })
  const keyY = clamp ? col.w / 2 : -t - col.w / 2
  return (
    <>
      <DetailCamera pos={[200, 60, 220]} target={[-10, 0, -10]} zoom={12 / d} />
      <LineMesh geometry={rodGeo(d, 300)} />
      <group position={[0, -t - col.w / 2, 0]}><LineMesh geometry={geo} /></group>
      <Anim update={(g) => { g.position.set(-60, -t / 2 + (1 - easeOut(clamp01(loop(4.6) / 1.2))) * 120, -45) }}>
        <LineMesh geometry={board} tone="accent" fillTone="fillWarm" />
      </Anim>
      {clamp && (
        <Anim update={(g) => {
          const t2 = loop(4.6)
          g.visible = t2 > 1.3
          g.position.y = col.w / 2 + (1 - easeOut(clamp01((t2 - 1.3) / 0.8))) * 70
        }}>
          <LineMesh geometry={geo} tone="accent" fillTone="fillAccent" />
        </Anim>
      )}
      <HexKeyAnim at={[col.od / 2, keyY, 0]} axis={[1, 0, 0]} scale={keyScale(col.key)} delay={clamp ? 2.4 : 1.6} period={4.6} />
    </>
  )
}

function FlangeDetail({ d, t, withRod }: { d: ShaftD; t: number; withRod: boolean }) {
  const s = SHF[d]
  const flange = getGeometry({ kind: 'flange', d })
  const board = getGeometry({ kind: 'board', w: 200, t, d: 150 })
  const screw = cached('woodscrew', woodScrewGeometry)
  const scr = screwLocal('shf', d)
  return (
    <>
      <DetailCamera pos={[150, -120, 175]} target={[0, -18, 0]} zoom={12 / d} />
      <group position={[-40, t / 2, -30]}><LineMesh geometry={board} fillTone="fillWarm" /></group>
      {withRod ? (
        <>
          <LineMesh geometry={flange} />
          <Anim update={(g) => { g.position.y = -101 - (1 - easeOut(clamp01(loop(4.2) / 1.2))) * 70 }}>
            <LineMesh geometry={rodGeo(d, 200)} tone="accent" fillTone="fillAccent" />
          </Anim>
          <HexKeyAnim at={scr.at} axis={scr.axis} scale={keyScale(s.key)} delay={1.5} period={4.2} />
        </>
      ) : (
        <>
          <Anim update={(g) => { g.position.y = -(1 - easeOut(clamp01(loop(4.2) / 1)) ) * 50 }}>
            <LineMesh geometry={flange} tone="accent" fillTone="fillAccent" />
          </Anim>
          {[-s.B / 2, s.B / 2].map((x, i) => (
            <Anim key={x} update={(g) => {
              const t2 = loop(4.2) - 1.2 - i * 0.5
              const k = easeOut(clamp01(t2 / 1))
              g.visible = t2 > 0
              g.position.set(x, -s.T - (1 - k) * 28, 0)
              g.rotation.y = k * Math.PI * 5
            }}>
              <group rotation={[Math.PI, 0, 0]}><LineMesh geometry={screw} /></group>
            </Anim>
          ))}
        </>
      )}
    </>
  )
}

function TClampDetail({ d }: { d: ShaftD }) {
  const a = CLAMP[d].a
  const tee = getGeometry({ kind: 'tclamp', d })
  const scr = screwLocal('teeBoss', d)
  return (
    <>
      <DetailCamera pos={[170, 100, 200]} target={[0, 28, 0]} zoom={16 / d} />
      <LineMesh geometry={rodGeo(d, 240, 'x')} />
      <Anim update={(g) => { g.position.x = (1 - easeOut(clamp01(loop(4.6) / 1.1))) * 110 }}>
        <LineMesh geometry={tee} tone="accent" fillTone="fillAccent" />
      </Anim>
      <Anim update={(g) => {
        const t2 = loop(4.6)
        g.visible = t2 > 1.2
        g.position.y = a / 2 + 90 + (1 - easeOut(clamp01((t2 - 1.2) / 0.9))) * 90
      }}>
        <LineMesh geometry={rodGeo(d, 180)} />
      </Anim>
      <HexKeyAnim at={scr.at} axis={scr.axis} scale={keyScale(CLAMP[d].key)} delay={2.4} period={4.6} />
      <Html position={[0, -a / 2 - 18, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">盲孔朝向立柱</div>
      </Html>
    </>
  )
}

function CrossDetail({ d }: { d: ShaftD }) {
  const a = CLAMP[d].a
  const geo = getGeometry({ kind: 'cross', d })
  const scr = screwLocal('crossA', d)
  return (
    <>
      <DetailCamera pos={[190, 120, 210]} target={[0, 4, 0]} zoom={16 / d} />
      <group position={[0, -a / 2, 0]}><LineMesh geometry={rodGeo(d, 240, 'z')} /></group>
      <Anim update={(g) => { g.position.z = (1 - easeOut(clamp01(loop(4.6) / 1.1))) * 110 }}>
        <LineMesh geometry={geo} tone="accent" fillTone="fillAccent" />
      </Anim>
      <Anim update={(g) => {
        const t2 = loop(4.6)
        g.visible = t2 > 1.2
        g.position.set((1 - easeOut(clamp01((t2 - 1.2) / 1))) * 200, a / 2, 0)
      }}>
        <LineMesh geometry={rodGeo(d, 240, 'x')} />
      </Anim>
      <HexKeyAnim at={scr.at} axis={scr.axis} scale={keyScale(CLAMP[d].key)} delay={2.5} period={4.6} />
    </>
  )
}

function LevelDetail() {
  const board = getGeometry({ kind: 'board', w: 300, t: 18, d: 120 })
  const level = cached('spirit-level', () => new BoxGeometry(200, 22, 26))
  const bubble = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  useFrame(() => {
    const t = loop(4.4)
    const k = easeOut(clamp01((t - 0.6) / 2))
    if (tilt.current) tilt.current.rotation.z = (1 - k) * 0.06
    if (bubble.current) bubble.current.position.x = (1 - k) * 26
  })
  const vial: V3[] = [[-34, 4, 13.2], [34, 4, 13.2], [34, 18, 13.2], [-34, 18, 13.2], [-34, 4, 13.2]]
  return (
    <>
      <DetailCamera pos={[0, 140, 340]} target={[0, 14, 0]} />
      <group ref={tilt}>
        <group position={[0, -9, 0]}><LineMesh geometry={board} fillTone="fillWarm" /></group>
        <group position={[0, 11, 0]}>
          <LineMesh geometry={level} />
        </group>
        <Line points={vial} color={INK} lineWidth={1} />
        <Line points={[[-9, 4, 13.3], [-9, 18, 13.3]]} color={INK} lineWidth={1} />
        <Line points={[[9, 4, 13.3], [9, 18, 13.3]]} color={INK} lineWidth={1} />
        <group ref={bubble} position={[0, 11, 13.4]}>
          <mesh scale={[1.6, 1, 1]}>
            <circleGeometry args={[5, 20]} />
            <meshBasicMaterial color={ACCENT} />
          </mesh>
        </group>
      </group>
      <Html position={[0, -44, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="detail-note">气泡居中</div>
      </Html>
    </>
  )
}

function RodWobbleDetail({ d }: { d: ShaftD }) {
  const rod = rodGeo(Math.max(d, 12), 300)
  const board = getGeometry({ kind: 'board', w: 340, t: 18, d: 90 })
  const ref = useRef<Group>(null)
  const mtx = useMemo(() => new Matrix4(), [])
  useFrame(() => {
    if (!ref.current) return
    mtx.set(1, Math.sin(performance.now() / 1000 * 4) * 0.08, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    ref.current.matrix.copy(mtx)
    ref.current.matrixWorldNeedsUpdate = true
  })
  return (
    <>
      <DetailCamera pos={[0, 200, 1050]} target={[0, 165, 0]} />
      <group ref={ref} matrixAutoUpdate={false}>
        <group position={[-140, 150, 0]}><LineMesh geometry={rod} /></group>
        <group position={[140, 150, 0]}><LineMesh geometry={rod} /></group>
        <group position={[0, 309, 0]}><LineMesh geometry={board} tone="accent" fillTone="fillWarm" /></group>
      </group>
      <Line points={[[-120, 360, 0], [120, 360, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[-100, 372, 0], [-120, 360, 0], [-100, 348, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[100, 372, 0], [120, 360, 0], [100, 348, 0]]} color={ACCENT} lineWidth={1.6} />
      <Line points={[[-260, 0, 0], [260, 0, 0]]} color="#b7b1a6" lineWidth={1} />
    </>
  )
}

function DetailContent({ kind, flipped }: { kind: DetailKind; flipped: boolean }) {
  const config = useApp((s) => s.config)
  const model = useApp((s) => s.model)
  const legPid = config.legProfile
  const beamPid = config.beamProfile
  const shaft = 'd' in model ? model : null
  const d: ShaftD = shaft ? shaft.d : 12
  const t = shaft ? shaft.boardT || 18 : 18
  switch (kind) {
    case 'collar': return <CollarDetail d={d} />
    case 'shelf': return <ShelfDetail d={d} t={t} clamp />
    case 'shelfRest': return <ShelfDetail d={d} t={t} clamp={false} />
    case 'flange': return <Flip on={flipped}><FlangeDetail d={d} t={t} withRod={false} /></Flip>
    case 'flangeRod': return <Flip on={flipped}><FlangeDetail d={d} t={t} withRod /></Flip>
    case 'tclamp': return <TClampDetail d={d} />
    case 'tclampTop': return <Flip on><TClampDetail d={d} /></Flip>
    case 'cross': return <CrossDetail d={d} />
    case 'rodFoot': return <Flip on={flipped}><RodFootDetail d={d} /></Flip>
    case 'rodCap': return <RodCapDetail d={d} bottom={false} />
    case 'rodPad': return <RodCapDetail d={d} bottom={!flipped} />
    case 'level': return <LevelDetail />
    case 'rodWobble': return <RodWobbleDetail d={d} />
  }
  switch (kind) {
    case 'tnut': return <TNutDetail pid={beamPid === '4080' ? '4040' : beamPid} />
    case 'dropin': return <DropInDetail pid={beamPid === '4080' ? '4040' : beamPid} />
    case 'bracket': return <BracketDetail legPid={legPid} beamPid={beamPid} />
    case 'internal': return <InternalDetail legPid={legPid} beamPid={beamPid} />
    case 'leveler': return <FootDetail legPid={legPid} kind="leveler" />
    case 'caster': return <FootDetail legPid={legPid} kind="caster" />
    case 'topScrew': return <TopScrewDetail beamPid={beamPid} t={config.topThickness} />
    case 'square': return <SquareDetail />
    case 'plate': return <PlateDetail legPid={legPid} />
    case 'tray': return <TrayDetail beamPid={beamPid} />
    case 'wobble': return <WobbleDetail legPid={legPid} beamPid={beamPid} />
    case 'sag': return <SagDetail beamPid={beamPid} />
    case 'cap': return <CapDetail legPid={legPid} />
  }
}

export function DetailCanvas({ kind, flipped = false }: { kind: DetailKind; flipped?: boolean }) {
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ fov: 28, near: 1, far: 5000, position: [200, 100, 200] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => gl.setClearColor('#ffffff')}
    >
      <DetailContent key={`${kind}-${flipped}`} kind={kind} flipped={flipped} />
    </Canvas>
  )
}
