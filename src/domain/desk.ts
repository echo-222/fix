import { Matrix4, Quaternion, Vector3 } from 'three'
import {
  BOLT_LEN, BRACKET_PRICE, E_ALU, HEX_KEY, PROFILES, sectionSize,
  type BoltSize, type ProfileId,
} from './profiles'
import type { CutItem, HwItem, ModelBase, Part, PartGroup, Q4, Rating, V3 } from './types'

export type TopMaterial = 'plywood' | 'bamboo' | 'eco'

export interface DeskConfig {
  name: string
  width: number
  depth: number
  height: number
  /** 桌面四周超出框架的距离 */
  overhang: number
  legProfile: ProfileId
  beamProfile: ProfileId
  connector: 'bracket' | 'internal'
  feet: 'leveler' | 'caster'
  lowerBrace: 'none' | 'u' | 'full'
  braceHeight: number
  centerBeam: 'auto' | 'on' | 'off'
  cableTray: boolean
  backFrame: boolean
  backFrameHeight: number
  slotCover: boolean
  topMaterial: TopMaterial
  topThickness: number
  color: 'silver' | 'black'
  loadKg: number
}

export const DEFAULT_CONFIG: DeskConfig = {
  name: '铝型材书桌',
  width: 1200,
  depth: 600,
  height: 750,
  overhang: 30,
  legProfile: '4040',
  beamProfile: '4040',
  connector: 'bracket',
  feet: 'leveler',
  lowerBrace: 'u',
  braceHeight: 150,
  centerBeam: 'auto',
  cableTray: false,
  backFrame: false,
  backFrameHeight: 450,
  slotCover: true,
  topMaterial: 'plywood',
  topThickness: 25,
  color: 'silver',
  loadKg: 60,
}

export const LIMITS = {
  width: [600, 2400],
  depth: [400, 1000],
  height: [450, 1200],
  overhang: [0, 150],
  braceHeight: [80, 400],
  backFrameHeight: [200, 900],
  topThickness: [18, 40],
  loadKg: [10, 200],
} as const

export const PRESETS: { id: string; name: string; desc: string; config: Partial<DeskConfig> }[] = [
  { id: 'study', name: '标准书桌', desc: '1200×600×750 · 4040 · U 型下撑', config: { name: '铝型材书桌', width: 1200, depth: 600, height: 750, legProfile: '4040', beamProfile: '4040', lowerBrace: 'u', feet: 'leveler', backFrame: false, cableTray: false } },
  { id: 'gaming', name: '电竞桌', desc: '1600×800 · 4080 主梁 · 线槽 + 灯架', config: { name: '电竞桌', width: 1600, depth: 800, height: 750, legProfile: '4040', beamProfile: '4080', lowerBrace: 'u', cableTray: true, backFrame: true, backFrameHeight: 500 } },
  { id: 'standing', name: '站立工作台', desc: '1000×600×1050 · 4080 腿 · 四周下撑', config: { name: '站立工作台', width: 1000, depth: 600, height: 1050, legProfile: '4080', beamProfile: '4040', lowerBrace: 'full', braceHeight: 180, backFrame: false, cableTray: false } },
  { id: 'kids', name: '儿童学习桌', desc: '1000×550×640 · 3030 · 脚轮', config: { name: '儿童学习桌', width: 1000, depth: 550, height: 640, legProfile: '3030', beamProfile: '3030', lowerBrace: 'u', feet: 'caster', backFrame: false, cableTray: false, topThickness: 18 } },
  { id: 'bench', name: '重载工作台', desc: '1800×750×850 · 4080 · 全框', config: { name: '重载工作台', width: 1800, depth: 750, height: 850, legProfile: '4080', beamProfile: '4080', lowerBrace: 'full', braceHeight: 160, centerBeam: 'on', topThickness: 30, loadKg: 150 } },
]

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)))

export function normalizeConfig(c: DeskConfig): DeskConfig {
  const n: DeskConfig = { ...c }
  n.width = clamp(n.width, LIMITS.width)
  n.depth = clamp(n.depth, LIMITS.depth)
  n.height = clamp(n.height, LIMITS.height)
  n.overhang = clamp(n.overhang, LIMITS.overhang)
  n.braceHeight = clamp(n.braceHeight, LIMITS.braceHeight)
  n.backFrameHeight = clamp(n.backFrameHeight, LIMITS.backFrameHeight)
  n.topThickness = clamp(n.topThickness, LIMITS.topThickness)
  n.loadKg = clamp(n.loadKg, LIMITS.loadKg)
  if (n.legProfile === '2020') n.legProfile = '3030'
  const legM = PROFILES[n.legProfile].module
  if (PROFILES[n.beamProfile].module > legM) n.beamProfile = n.legProfile
  return n
}

/** 横梁能用哪些型材：截面宽度不能超过桌腿 */
export function beamOptionsFor(leg: ProfileId): ProfileId[] {
  const m = PROFILES[leg].module
  return (['2020', '3030', '4040', '4080'] as ProfileId[]).filter((p) => PROFILES[p].module <= m)
}

export interface Analysis {
  beamSpan: number
  sagUniform: number
  sagPoint: number
  sagRating: Rating
  wobbleIndex: number
  wobbleRating: Rating
  warnings: string[]
}

export interface JointRef {
  id: string
  beamId: string
  corner: V3
  beamDir: V3
  brackets: string[]
}

export interface DeskModel extends ModelBase {
  product: 'desk'
  config: DeskConfig
  frame: {
    Wf: number; Df: number; zc: number; front: number; back: number
    legTop: number; footH: number; legLen: number
    lx: number; lz: number; bw: number; bh: number; sw: number; sh: number
    yTopBeam: number; yBrace: number
    hasCenter: boolean
    legX: number; legZf: number; legZb: number
  }
  joints: Record<'sideL' | 'sideR' | 'long' | 'brace' | 'center' | 'back', JointRef[]>
  legs: { fl: string; fr: string; bl: string; br: string }
  topFixings: number
  slotCoverM: number
  analysis: Analysis
  bolt: BoltSize
  hexKey: number
}

const TOP_MATERIAL: Record<TopMaterial, { name: string; density: number; pricePerM2: number }> = {
  plywood: { name: '多层实木板', density: 600, pricePerM2: 280 },
  bamboo: { name: '竹集成板', density: 700, pricePerM2: 360 },
  eco: { name: '免漆生态板', density: 650, pricePerM2: 180 },
}
export const TOP_MATERIAL_NAMES = Object.fromEntries(
  Object.entries(TOP_MATERIAL).map(([k, v]) => [k, v.name]),
) as Record<TopMaterial, string>

const r05 = (v: number) => Math.round(v * 2) / 2

function basisQuat(x: V3, y: V3): Q4 {
  const X = new Vector3(...x).normalize()
  const Y = new Vector3(...y).normalize()
  const Z = new Vector3().crossVectors(X, Y)
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z))
  return [q.x, q.y, q.z, q.w]
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]

export function generateDesk(input: DeskConfig): DeskModel {
  const c = normalizeConfig(input)
  const leg = PROFILES[c.legProfile]
  const beam = PROFILES[c.beamProfile]
  const braceP = c.beamProfile === '4080' ? PROFILES['4040'] : beam
  const legSec = sectionSize(leg)
  const lx = legSec.w
  const lz = legSec.h
  const bw = sectionSize(beam).w
  const bh = sectionSize(beam).h
  const sw = sectionSize(braceP).w
  const sh = sectionSize(braceP).h
  const upP = c.legProfile === '4080' ? PROFILES['4040'] : leg
  const us = upP.module

  const T = c.topThickness
  const front = c.depth / 2 - c.overhang
  const back = c.backFrame ? -c.depth / 2 : -c.depth / 2 + c.overhang
  const Wf = c.width - 2 * c.overhang
  const Df = front - back
  const zc = (front + back) / 2
  const legTop = c.height - T
  const footH = c.feet === 'leveler' ? 22 : 78
  const legLen = legTop - footH
  const yTopBeam = legTop - bh / 2
  const yBrace = Math.min(Math.max(c.braceHeight, footH + sh), legTop - bh - 120)

  const legX = Wf / 2 - lx / 2
  const legZf = front - lz / 2
  const legZb = back + lz / 2
  const longLen = Wf - 2 * lx
  const shortLen = Df - 2 * lz
  const hasCenter = c.centerBeam === 'on' || (c.centerBeam === 'auto' && Wf > 1300)

  const parts: Part[] = []
  const joints: DeskModel['joints'] = { sideL: [], sideR: [], long: [], brace: [], center: [], back: [] }
  const bracketsPerJoint = c.connector === 'bracket' ? (beam.module >= 40 ? 2 : 1) : 0

  const push = (p: Part) => {
    parts.push(p)
    return p.id
  }

  const profilePart = (
    id: string, name: string, group: PartGroup, profile: ProfileId, length: number,
    axis: 'x' | 'y' | 'z', position: V3, enterFrom: V3,
  ) =>
    push({
      id, name, group, spec: `${profile} · ${r05(length)}mm`,
      geo: { kind: 'profile', profile, length: r05(length), axis },
      position, enterFrom,
    })

  // 一根横梁两端的连接：角码放在梁下方；40 系列再在内侧加一个
  const addBeamJoints = (
    bucket: JointRef[], beamId: string, center: V3, axis: 'x' | 'z', length: number,
    height: number, width: number, inward: V3, module: number, ends: (-1 | 1)[] = [-1, 1],
  ) => {
    const axisVec: V3 = axis === 'x' ? [1, 0, 0] : [0, 0, 1]
    for (const s of ends) {
      const end = add(center, mul(axisVec, (s * length) / 2))
      const beamDir = mul(axisVec, -s)
      const corner: V3 = [end[0], end[1] - height / 2, end[2]]
      const jid = `${beamId}-j${s > 0 ? 'b' : 'a'}`
      const ids: string[] = []
      if (bracketsPerJoint > 0) {
        ids.push(push({
          id: `${jid}-under`, name: '角码', group: 'bracket', spec: `${module} 系列压铸角码`,
          geo: { kind: 'bracket', size: module },
          position: corner, quaternion: basisQuat(beamDir, [0, -1, 0]), enterFrom: [0, -70, 0],
        }))
        if (bracketsPerJoint > 1) {
          const sideCorner = add(end, mul(inward, width / 2))
          ids.push(push({
            id: `${jid}-side`, name: '角码', group: 'bracket', spec: `${module} 系列压铸角码`,
            geo: { kind: 'bracket', size: module },
            position: sideCorner, quaternion: basisQuat(beamDir, inward), enterFrom: mul(inward, 70),
          }))
        }
      }
      bucket.push({ id: jid, beamId, corner, beamDir, brackets: ids })
    }
  }

  // 桌腿
  const legsDef = [
    ['fl', -legX, legZf, '左前桌腿'],
    ['fr', legX, legZf, '右前桌腿'],
    ['bl', -legX, legZb, '左后桌腿'],
    ['br', legX, legZb, '右后桌腿'],
  ] as const
  for (const [k, x, z, name] of legsDef) {
    profilePart(`leg-${k}`, name, 'leg', c.legProfile, legLen, 'y', [x, footH + legLen / 2, z], [0, 260, 0])
  }

  // 左右上横梁（沿进深）
  for (const s of [-1, 1] as const) {
    const side = s < 0 ? 'L' : 'R'
    const x = s * (Wf / 2 - bw / 2)
    const id = `beam-side${side}`
    profilePart(id, s < 0 ? '左侧上横梁' : '右侧上横梁', 'beam', c.beamProfile, shortLen, 'z', [x, yTopBeam, zc], [0, 220, 0])
    addBeamJoints(s < 0 ? joints.sideL : joints.sideR, id, [x, yTopBeam, zc], 'z', shortLen, bh, bw, [-s, 0, 0], beam.module)
    if (c.lowerBrace !== 'none') {
      const bid = `brace-side${side}`
      const bx = s * (Wf / 2 - sw / 2)
      profilePart(bid, s < 0 ? '左侧下横撑' : '右侧下横撑', 'brace', braceP.id, shortLen, 'z', [bx, yBrace, zc], [-s * 200, 0, 0])
      addBeamJoints(s < 0 ? joints.sideL : joints.sideR, bid, [bx, yBrace, zc], 'z', shortLen, sh, sw, [-s, 0, 0], braceP.module)
    }
  }

  // 前后上横梁（沿宽度）
  for (const s of [1, -1] as const) {
    const z = s > 0 ? front - bw / 2 : back + bw / 2
    const id = s > 0 ? 'beam-front' : 'beam-back'
    profilePart(id, s > 0 ? '前横梁' : '后横梁', 'beam', c.beamProfile, longLen, 'x', [0, yTopBeam, z], [0, 0, s * 320])
    addBeamJoints(joints.long, id, [0, yTopBeam, z], 'x', longLen, bh, bw, [0, 0, -s], beam.module)
  }

  // 下横撑（后 / 前）
  if (c.lowerBrace !== 'none') {
    const sides: (1 | -1)[] = c.lowerBrace === 'full' ? [-1, 1] : [-1]
    for (const s of sides) {
      const z = s > 0 ? front - sw / 2 : back + sw / 2
      const id = s > 0 ? 'brace-front' : 'brace-back'
      profilePart(id, s > 0 ? '前下横撑' : '后下横撑', 'brace', braceP.id, longLen, 'x', [0, yBrace, z], [0, 0, s * 260])
      addBeamJoints(joints.brace, id, [0, yBrace, z], 'x', longLen, sh, sw, [0, 0, -s], braceP.module)
    }
  }

  // 中间加强梁
  if (hasCenter) {
    const len = Df - 2 * bw
    profilePart('beam-center', '中间加强梁', 'beam', braceP.id, len, 'z', [0, legTop - sh / 2, zc], [0, -260, 0])
    addBeamJoints(joints.center, 'beam-center', [0, legTop - sh / 2, zc], 'z', len, sh, sw, [1, 0, 0], braceP.module)
  }

  // 脚
  const feetKind = c.feet === 'leveler' ? 'leveler' : 'caster'
  for (const [k, x, z, name] of legsDef) {
    push({
      id: `foot-${k}`, name: c.feet === 'leveler' ? `${name.slice(0, 2)}脚杯` : `${name.slice(0, 2)}脚轮`,
      group: 'foot', spec: c.feet === 'leveler' ? `${leg.endTap} 调节脚杯` : `2 寸刹车万向轮`,
      geo: { kind: feetKind, size: footH } as Part['geo'],
      position: [x, footH, z], enterFrom: [0, -140, 0],
    })
  }

  // 桌面
  push({
    id: 'top', name: '桌面板', group: 'top',
    spec: `${TOP_MATERIAL[c.topMaterial].name} ${c.width}×${c.depth}×${T}`,
    geo: { kind: 'board', w: c.width, t: T, d: c.depth },
    position: [0, legTop + T / 2, 0], enterFrom: [0, 420, 0],
  })

  // 线槽
  if (c.cableTray) {
    const len = Math.min(longLen - 120, 1000)
    const w = 110
    const h = 70
    push({
      id: 'tray', name: '理线槽', group: 'accessory', spec: `钢制线槽 ${Math.round(len)}mm`,
      geo: { kind: 'tray', length: len, w, h },
      position: [0, legTop - bh - 8, back + bw + w / 2 + 10], enterFrom: [0, -220, 0],
    })
  }

  // 后挂架（显示器 / 灯架）
  if (c.backFrame) {
    const y0 = legTop - 260
    const y1 = c.height + c.backFrameHeight
    const upLen = y1 - y0
    const z = back - us / 2
    for (const s of [-1, 1] as const) {
      const side = s < 0 ? 'L' : 'R'
      const x = s * (Wf / 2 - us / 2)
      profilePart(`up-${side}`, s < 0 ? '挂架左立柱' : '挂架右立柱', 'accessory', upP.id, upLen, 'y', [x, y0 + upLen / 2, z], [0, 420, 0])
      push({
        id: `plate-${side}`, name: '连接板', group: 'accessory', spec: `${upP.module} 系列连接板`,
        geo: { kind: 'plate', w: (lz + us) * 0.9, h: 140, t: 4 },
        position: [s * (Wf / 2 + 2), legTop - 150, back], enterFrom: [s * 140, 0, 0],
      })
      push({
        id: `cap-${side}`, name: '端盖', group: 'accessory', spec: `${upP.module}×${upP.module} 端盖`,
        geo: { kind: 'cap', w: us, d: us },
        position: [x, y1 + 1.5, z], enterFrom: [0, 80, 0],
      })
    }
    const barLen = Wf - 2 * us
    profilePart('up-bar', '挂架横杆', 'accessory', upP.id, barLen, 'x', [0, y1 - us / 2, z], [0, 260, 0])
    addBeamJoints(joints.back, 'up-bar', [0, y1 - us / 2, z], 'x', barLen, us, us, [0, 0, 1], upP.module)
  }

  const byId = Object.fromEntries(parts.map((p) => [p.id, p]))

  // ---------- 切割清单 ----------
  const cutMap = new Map<string, CutItem>()
  for (const p of parts) {
    if (p.geo.kind !== 'profile') continue
    const baseName = p.group === 'leg' ? '桌腿立柱' : p.name.replace(/^(左|右|前|后)(侧)?/, '').replace(/^挂架(左|右)/, '挂架')
    const key = `${p.geo.profile}-${p.geo.length}-${baseName}`
    const item = cutMap.get(key)
    if (item) item.qty++
    else {
      let note: string | undefined
      if (p.group === 'leg') note = `底端中心孔攻丝 ${leg.endTap}（装${c.feet === 'leveler' ? '脚杯' : '脚轮'}）`
      else if (c.connector === 'internal' && p.group !== 'accessory') note = '两端加工内置连接件扳手孔'
      cutMap.set(key, { key, name: baseName, profile: p.geo.profile, length: p.geo.length, qty: 1, note })
    }
  }
  const cutList = [...cutMap.values()].sort((a, b) => b.length - a.length)

  // ---------- 五金 ----------
  const allJoints = Object.values(joints).flat()
  const lateJoints = [...joints.center, ...joints.back]
  const bracketCount = parts.filter((p) => p.group === 'bracket').length
  const bracketsBySize = new Map<number, number>()
  for (const p of parts) if (p.geo.kind === 'bracket') bracketsBySize.set(p.geo.size, (bracketsBySize.get(p.geo.size) ?? 0) + 1)
  const bolt = beam.bolt
  const topFixings = (longLen > 1000 ? 3 : 2) * 2 + 2 + (hasCenter ? 2 : 0)
  const hardware: HwItem[] = []
  const lateBracketCount = lateJoints.length * bracketsPerJoint
  if (c.connector === 'bracket') {
    for (const [size, qty] of bracketsBySize) {
      hardware.push({ key: `bracket-${size}`, name: '压铸角码', spec: `${size} 系列 L 型（带定位筋）`, qty, price: BRACKET_PRICE[size] ?? 2 })
    }
    hardware.push({ key: 'bolt', name: '内六角螺丝', spec: `${bolt}×${BOLT_LEN[bolt]} DIN912`, qty: bracketCount * 2, price: 0.15 })
    hardware.push({ key: 'tnut', name: '滑入式 T 型螺母', spec: `${bolt} · ${beam.slot} 槽 · 框架接头预装`, qty: (bracketCount - lateBracketCount) * 2, price: 0.2 })
  } else {
    hardware.push({ key: 'internal', name: '内置锚式连接件', spec: `${beam.module} 系列（含 ${bolt} 螺丝）`, qty: allJoints.length, price: 3.5 })
  }
  const dropIn = lateBracketCount * 2 + topFixings + (c.cableTray ? 2 : 0) + (c.backFrame ? 8 : 0)
  hardware.push({ key: 'dropin', name: '弹片 T 型螺母（落槽式）', spec: `${bolt} · 框架闭合后安装`, qty: dropIn, price: 0.35 })
  hardware.push({ key: 'fix', name: '桌面固定片', spec: 'L 型 20×20 + 木螺丝 ST4.2×16', qty: topFixings, price: 0.6 })
  hardware.push(
    c.feet === 'leveler'
      ? { key: 'feet', name: '调节脚杯', spec: `${leg.endTap}×40 · Ø40 尼龙底`, qty: 4, price: 3 }
      : { key: 'feet', name: '万向脚轮', spec: `2 寸 · ${leg.endTap} 丝杆 · 带刹车`, qty: 4, price: 12 },
  )
  if (c.cableTray) hardware.push({ key: 'tray', name: '理线槽', spec: '钢制网篮 / 折弯线槽', qty: 1, price: 35 })
  if (c.backFrame) {
    hardware.push({ key: 'plate', name: '连接板', spec: `${upP.module} 系列 4 孔`, qty: 2, price: 4 })
    hardware.push({ key: 'platebolt', name: '内六角螺丝', spec: `${bolt}×${BOLT_LEN[bolt]}（连接板用）`, qty: 8, price: 0.15 })
    hardware.push({ key: 'cap', name: '端盖', spec: `${upP.module}×${upP.module} 黑色 ABS`, qty: 2, price: 0.5 })
  }
  const visibleSlotLen = parts
    .filter((p) => p.geo.kind === 'profile')
    .reduce((s, p) => s + (p.geo.kind === 'profile' ? p.geo.length * (p.group === 'leg' ? 2 : 1) : 0), 0)
  const slotCoverM = Math.ceil(visibleSlotLen / 1000)
  if (c.slotCover) hardware.push({ key: 'cover', name: '槽封条', spec: `${beam.slot} 槽 · ${c.color === 'black' ? '黑' : '灰'}色 PVC`, qty: slotCoverM, unit: '米', price: 1.5 })
  const topArea = (c.width * c.depth) / 1e6
  hardware.push({
    key: 'top', name: '桌面板', spec: `${TOP_MATERIAL[c.topMaterial].name} ${c.width}×${c.depth}×${T}mm`,
    qty: 1, price: Math.round(TOP_MATERIAL[c.topMaterial].pricePerM2 * topArea * (T / 25)),
  })

  const keys = new Set<number>([HEX_KEY[bolt], HEX_KEY[leg.bolt]])
  const tools = [
    `内六角扳手 ${[...keys].sort().join(' / ')}mm（球头更顺手）`,
    '十字螺丝刀（桌面固定片）',
    '卷尺 + 直角尺（检查方正）',
    '水平仪（手机水平仪 App 亦可）',
    c.feet === 'leveler' ? '开口扳手 13mm（锁紧脚杯螺母）' : '无需额外工具安装脚轮',
    `${leg.endTap} 丝锥（若商家未代攻丝）`,
  ]

  // ---------- 结构评估 ----------
  const topWeight = topArea * (T / 1000) * TOP_MATERIAL[c.topMaterial].density
  const L = longLen + lx
  const q = ((c.loadKg + topWeight) * 9.81) / 2 / L
  const EI = E_ALU * beam.Ix
  const sagUniform = (5 * q * L ** 4) / (384 * EI)
  const sagPoint = (30 * 9.81 * L ** 3) / (48 * EI)
  const sagRating: Rating =
    sagUniform <= 1 && sagPoint <= 2 ? { level: 'good', label: '刚性优秀' }
      : sagUniform <= 2.5 && sagPoint <= 4 ? { level: 'ok', label: '合格' }
        : { level: 'warn', label: '偏软，建议换更大横梁' }
  const braceFactor = { none: 1, u: 1.8, full: 2.2 }[c.lowerBrace]
  const jointFactor = c.connector === 'internal' ? 1.1 : bracketsPerJoint > 1 ? 1.3 : 1
  const wobbleIndex = legLen / Math.min(lx, lz) / braceFactor / jointFactor
  const wobbleRating: Rating =
    wobbleIndex < 8.5 ? { level: 'good', label: '稳固' } : wobbleIndex < 13 ? { level: 'ok', label: '轻微晃动' } : { level: 'warn', label: '易晃动' }

  const warnings: string[] = []
  if (sagRating.level === 'warn') warnings.push(`横梁跨度 ${Math.round(L)}mm，${c.beamProfile} 下挠偏大：建议改用 ${c.beamProfile === '4040' ? '4080 竖放' : '4040 / 4080'}。`)
  if (wobbleRating.level === 'warn') warnings.push(c.lowerBrace === 'none' ? '没有下横撑时桌子前后晃动明显，建议加 U 型下横撑。' : '桌腿细长，建议换更粗的桌腿型材或改为四周下横撑。')
  if (!hasCenter && Wf > 1300) warnings.push('桌宽超过 1.3m，建议加中间加强梁防止桌面中部下沉。')
  if (c.feet === 'caster' && c.height > 900) warnings.push('脚轮 + 高桌面重心偏高，推动时容易倾倒，建议改用脚杯。')
  if (c.overhang > 100) warnings.push('桌面外伸超过 100mm，边缘按压时会翘起，建议控制在 30–80mm。')
  if (c.depth - c.overhang * 2 < 400 && c.lowerBrace !== 'none') warnings.push('进深较小，侧面下横撑可能碰脚。')
  if (c.height < 680 || c.height > 780) {
    if (c.height < 1000) warnings.push('国标 GB/T 3326 推荐坐姿桌高 680–760mm，请确认使用者身高。')
  }

  // ---------- 汇总 ----------
  const profileKg = parts.reduce((s, p) => s + (p.geo.kind === 'profile' ? (PROFILES[p.geo.profile].kgPerM * p.geo.length) / 1000 : 0), 0)
  const profileCny = parts.reduce((s, p) => s + (p.geo.kind === 'profile' ? (PROFILES[p.geo.profile].pricePerM * p.geo.length) / 1000 : 0), 0)
  const hwCny = hardware.reduce((s, h) => s + h.price * h.qty, 0)
  const weightKg = profileKg + topWeight + bracketCount * 0.06 + 0.4
  const minutes = Math.round(15 + allJoints.length * 3 + 4 * 2 + topFixings * 1.5 + (c.cableTray ? 5 : 0) + (c.backFrame ? 12 : 0))

  const totalH = c.height + (c.backFrame ? c.backFrameHeight : 0)
  return {
    product: 'desk',
    name: c.name,
    dims: { width: c.width, depth: c.depth, height: c.height },
    config: c,
    parts,
    byId,
    frame: { Wf, Df, zc, front, back, legTop, footH, legLen, lx, lz, bw, bh, sw, sh, yTopBeam, yBrace, hasCenter, legX, legZf, legZb },
    joints,
    legs: { fl: 'leg-fl', fr: 'leg-fr', bl: 'leg-bl', br: 'leg-br' },
    topFixings,
    slotCoverM,
    cutList,
    cutTitle: '型材切割清单（欧标 6063-T5，两端切平去毛刺，公差 ±0.5mm）',
    cutNote: `下单时备注：两端切平去毛刺，长度公差 ±0.5mm；桌腿底端中心孔攻丝 ${leg.endTap}。欧标 ${c.beamProfile} 槽宽 ${beam.slot}mm，配件需选同系列。`,
    hardware,
    tools,
    analysis: { beamSpan: L, sagUniform, sagPoint, sagRating, wobbleIndex, wobbleRating, warnings },
    warnings,
    metrics: [
      { label: `横梁下挠（${c.loadKg}kg 均布）`, value: `${sagUniform.toFixed(2)}mm`, note: sagRating.label, level: sagRating.level },
      { label: '晃动指数', value: wobbleIndex.toFixed(1), note: wobbleRating.label, level: wobbleRating.level },
    ],
    stats: { weightKg, priceCny: Math.round(profileCny + hwCny), minutes },
    center: [0, c.height / 2, zc],
    designView: {
      focus: [0, c.height * 0.5 + (c.backFrame ? c.backFrameHeight * 0.3 : 0), 0],
      dist: Math.hypot(c.width, c.depth, totalH) * 1.9,
    },
    overlay: {
      diag: { y: legTop + 1, x: Wf / 2, front, back, zc },
      load: { y: c.height + 6, w: c.width, d: c.depth, kg: c.loadKg },
    },
    bolt,
    hexKey: HEX_KEY[bolt],
  }
}
