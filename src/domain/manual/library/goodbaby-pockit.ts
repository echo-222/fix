import type { CameraSpec, ManualSpec, PartState, Shape, SpecPart, Vec3 } from '../types'

/**
 * 好孩子 POCKIT 口袋车（gb GOLD，说明书 18 页，全部是图示、没有文字）
 * 第 4–5 页展开，第 6–7 页折叠，第 8–9 页最小折叠，第 10–12 页安全带，第 13 页刹车，第 14 页前轮，第 16–17 页布套拆卸。
 *
 * 坐标：地面 y=0；长度沿 z，推车前方（孩子面朝的方向）为 -z，推的人站在 +z；宽度沿 x，孩子的左手边为 -x（零件后缀 -l）。
 * 侧面铰链都绕 x 轴转。约定「段」零件（前腿、靠背管、把手管、后腿、后轮支架）都从自己的铰链点沿局部 +y 伸出，
 * rot[0] = 这一段相对父级的转角，世界角 a 的方向是 (y, z) = (cos a, sin a)：0 朝上，90 朝后，180 朝下，-90 朝前。
 *
 * 车架是两棵对称的铰链树（左右各一棵），父级转动带动子级：
 *   前腿 leg（根）→ 前轮座 fhead → 前轮叉 fork（万向）→ 前轮
 *                → 侧铰链 hinge（「咔哒」锁）→ 靠背管 mid → 把手管 up → 横杆半段 bar（中间折点）→ 遮阳篷
 *                                                                      → 握把 grip → 折叠按钮
 *                                   → 后腿 rleg → 后轮支架 rarm（最小折叠时向前翻）→ 后轮
 * 宽度方向合拢 = 两棵树整体沿 x 平移，横杆两半绕把手管 V 形折起。布面（座椅 / 靠背 / 头部 / 篮子 / 遮阳篷）按薄布处理，
 * 用面片建模，合拢时允许互相重叠（代表布料堆叠）；铝管、铰链、轮子、按钮、插扣都是实体，参与穿插审计。
 *
 * 尺寸来源：
 *   - 官方（gb 2020 目录 / Red Dot 申报）：折叠 30 × 18 × 35 cm，4.3 kg，轮径 12 cm（双轮），储物篮 ≤ 5 kg。
 *   - 推断：展开约 高 100 × 长 58 × 宽 45 cm；铰链位置、各段管长、座高按图示比例估计。
 *   - 折叠机构按图示简化（真车铰链更多），本模型折好后约 高 38 × 长 35 × 宽 28 cm，比官方数字略大。
 *   - 刹车为后轮联动、只有一个踏板（第 6、13 页图示只画一处），放在右后轮是推断。
 */

type Side = 'l' | 'r'
type Mirror = 1 | -1
type Pose = Record<string, PartState>

const SIDES: [Side, Mirror][] = [['l', 1], ['r', -1]]
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const r1 = (v: number) => Math.round(v * 10) / 10

// ---------- 尺寸（mm） ----------
const WHEEL_R = 60
/** 前轮轴相对前轮座原点：向下 76、向后拖 16（脚轮拖距） */
const FORK = { pivot: 20, drop: 56, trail: 16 }
const TILT = 30
/** 前腿、靠背管、把手管长度（侧面看三段几乎在一条直线上，从前轮一直到把手） */
const D1 = 340
const D2 = 330
const D3 = 325
/** 前腿管中心离中线：展开 / 合拢 */
const ZS = 160
const ZF = 76
/** 相对前腿管的横向偏移（正 = 向内）：靠背管、把手管（相对靠背管）、后腿管、侧铰链中心 */
const OFF = { mid: 30, up: 22, rleg: -46, hinge: -8 }
/** 横杆半段从把手管内侧 12 mm 起，留出 V 形折起时和握把之间的间隙 */
const BAR0 = 12
const BAR = ZS - OFF.mid - OFF.up - 2 - BAR0
const RA = 120
const Z_REAR = 120

/** 展开时前轮座原点（y, z）：前轮轴在 (60, -300) */
const C_U: [number, number] = [WHEEL_R + FORK.pivot + FORK.drop, -300 - FORK.trail]
const J1U: [number, number] = [C_U[0] + D1 * Math.cos(rad(TILT)), C_U[1] + D1 * Math.sin(rad(TILT))]
const KNEE: [number, number] = [WHEEL_R + RA, Z_REAR]
const RL = Math.round(Math.hypot(KNEE[0] - J1U[0], KNEE[1] - J1U[1]))
const RLEG_W = deg(Math.atan2(KNEE[1] - J1U[1], KNEE[0] - J1U[0]))

/** 各段的相对转角 */
const ANG = {
  rleg: r1(RLEG_W - TILT),
  rarm: r1(180 - RLEG_W),
  /** 最小折叠：后轮支架向前翻 90° */
  rarmFold: r1(270 - RLEG_W),
  /** 向下推把手：靠背管向后下方折到世界 150°，把手管保持竖直 */
  midPush: 120,
  upPush: -140,
  /** 车架收拢：前腿前倾到 -35°，靠背管 160°，把手管 10°，后腿 140° */
  legF: -35,
  midF: 195,
  upF: -150,
  rlegF: 175,
}

/** 收拢后前轮座原点：前轮刚好着地 */
const FH_F = rad(ANG.legF - TILT)
const AXLE_F_Y = -(FORK.pivot + FORK.drop) * Math.cos(FH_F) - FORK.trail * Math.sin(FH_F)
const C_F: [number, number] = [r1(WHEEL_R - AXLE_F_Y + 0.5), 48]
const J1F: [number, number] = [C_F[0] + D1 * Math.cos(rad(ANG.legF)), C_F[1] + D1 * Math.sin(rad(ANG.legF))]

/** 世界点（y, z）换算到「在 J 点、转了 a 度」的父级局部坐标 */
function local(j: [number, number], a: number, p: [number, number]): [number, number] {
  const dy = p[0] - j[0]
  const dz = p[1] - j[1]
  const c = Math.cos(rad(a))
  const s = Math.sin(rad(a))
  return [r1(dy * c + dz * s), r1(-dy * s + dz * c)]
}

// ---------- 小件位置 ----------
const FLOCK = { off: 0, on: 9 }
const RLOCK = { up: 60, down: 44 }
const BRAKE = { off: -20, on: 12 }
const HOOK = { open: 90, shut: 0, x: 43 }
const CANOPY = { open: -130, fold: 40, stow: 170 }
const SEAT_AT = local(J1U, TILT, [J1U[0] + 8, J1U[1] - 12])
const BASKET_AT = local(J1U, TILT, [300, -60])
/** 收拢后篮子竖着塞在座椅布后面：上沿贴着侧铰链，向下 220、向后 110 */
const BASKET_F = local(J1F, ANG.legF, [J1F[0] - 4, J1F[1] + 12])

// ---------- 形体 ----------
const twin = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: WHEEL_R, h: 12, axis: 'x', at: [-14, 0, 0] },
    { type: 'cylinder', r: WHEEL_R, h: 12, axis: 'x', at: [14, 0, 0] },
    { type: 'cylinder', r: 22, h: 13, axis: 'x', at: [-14, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 22, h: 13, axis: 'x', at: [14, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 8, h: 40, axis: 'x', fill: 'shade' },
  ],
})

function sideParts(k: Side, m: Mirror): SpecPart[] {
  const s = k === 'l' ? '左' : '右'
  const x = (v: number) => m * v
  const ex = (v: Vec3): Vec3 => [m * v[0], v[1], v[2]]
  return [
    // 前腿 + 前轮
    {
      id: `leg-${k}`, name: `前腿管（${s}）`, spec: '铝管 · 前轮座到侧铰链',
      shape: { type: 'box', size: [20, D1, 20], chamfer: 4 }, pivot: [0, D1 / 2, 0], at: [x(-ZS), C_U[0], C_U[1]], rot: [TILT, 0, 0],
    },
    { id: `fhead-${k}`, name: `前轮座（${s}）`, parent: `leg-${k}`, shape: { type: 'box', size: [14, 34, 34], chamfer: 3 }, pivot: [0, -3, 0], rot: [-TILT, 0, 0], fill: 'shade' },
    { id: `flock-${k}`, name: `前轮定向锁扣（${s}）`, spec: '上推 = 定向，下拨 = 万向', parent: `fhead-${k}`, shape: { type: 'box', size: [12, 6, 8], chamfer: 1 }, at: [0, FLOCK.off, 21], fill: 'dark' },
    { id: `fork-${k}`, name: `前轮叉（${s}）`, parent: `fhead-${k}`, shape: { type: 'box', size: [10, 64, 30], chamfer: 2 }, pivot: [0, -30, 8], at: [0, -FORK.pivot, 0] },
    { id: `fwheel-${k}`, name: `前轮（${s}）`, spec: '双轮 Ø120 mm', parent: `fork-${k}`, shape: twin(), at: [0, -FORK.drop, FORK.trail] },

    // 侧铰链 + 靠背管 + 把手管
    { id: `hinge-${k}`, name: `侧铰链（${s}）`, spec: '拉起把手时「咔哒」锁定', parent: `leg-${k}`, shape: { type: 'cylinder', r: 24, h: 96, axis: 'x' }, pivot: [x(OFF.hinge), 0, 0], at: [0, D1, 0], fill: 'shade' },
    {
      id: `mid-${k}`, name: `靠背管（${s}）`, parent: `hinge-${k}`,
      shape: {
        type: 'compound',
        items: [
          { type: 'box', size: [18, D2, 18], chamfer: 4, at: [0, D2 / 2, 0] },
          { type: 'cylinder', r: 13, h: 40, axis: 'x', at: [x(11), D2, 0], fill: 'shade' },
        ],
      },
      at: [x(OFF.mid), 0, 0],
    },
    { id: `up-${k}`, name: `把手管（${s}）`, parent: `mid-${k}`, shape: { type: 'box', size: [18, D3, 18], chamfer: 4 }, pivot: [0, D3 / 2, 0], at: [x(OFF.up), D2, 0] },
    { id: `bar-${k}`, name: `把手横杆（${s}半）`, spec: '中间有折点', parent: `up-${k}`, shape: { type: 'cylinder', r: 11, h: BAR, axis: 'x' }, pivot: [x(BAR0 + BAR / 2), 0, 0], at: [0, D3, 0] },
    { id: `grip-${k}`, name: `握把（${s}）`, parent: `up-${k}`, shape: { type: 'cylinder', r: 16, h: 66, axis: 'x' }, pivot: [x(-44), 0, 0], at: [0, D3, 0], fill: 'shade' },
    { id: `btn-${k}`, name: `折叠按钮（${s}）`, spec: '握把端头', parent: `grip-${k}`, shape: { type: 'cylinder', r: 9, h: 4, axis: 'y' }, at: [x(-79), 0, 0], rot: [0, 0, m * 90], fill: 'dark' },

    // 后腿 + 后轮
    { id: `rleg-${k}`, name: `后腿管（${s}）`, parent: `hinge-${k}`, shape: { type: 'box', size: [18, RL, 18], chamfer: 4 }, pivot: [0, RL / 2, 0], at: [x(OFF.rleg), 0, 0], rot: [ANG.rleg, 0, 0] },
    { id: `rlock-${k}`, name: `后轮释放键（${s}）`, spec: '向下推 = 后轮可翻折', parent: `rleg-${k}`, shape: { type: 'box', size: [6, 18, 12], chamfer: 1 }, at: [x(-12.5), RL - RLOCK.up, 0], fill: 'dark' },
    {
      id: `rarm-${k}`, name: `后轮支架（${s}）`, parent: `rleg-${k}`,
      shape: {
        type: 'compound',
        items: [
          { type: 'box', size: [18, RA, 18], chamfer: 4, at: [0, RA / 2, 0] },
          { type: 'cylinder', r: 12, h: 22, axis: 'x', fill: 'shade' },
        ],
      },
      at: [0, RL, 0], rot: [ANG.rarm, 0, 0],
    },
    { id: `rwheel-${k}`, name: `后轮（${s}）`, spec: '双轮 Ø120 mm', parent: `rarm-${k}`, shape: twin(), at: [0, RA, 0] },

    // 布面（薄布 → 面片）
    {
      id: `seat-${k}`, name: `座椅布（${s}半）`, spec: '坐垫 + 腿托', parent: `hinge-${k}`,
      shape: {
        type: 'compound',
        items: [
          { type: 'hole', w: 148, h: 220, r: 12, at: [x(74), 110, 0] },
          { type: 'hole', w: 148, h: 120, r: 12, at: [x(74), 250, -52], rot: [-60, 0, 0] },
        ],
      },
      at: [x(12), SEAT_AT[0], SEAT_AT[1]], rot: [-120, 0, 0],
    },
    { id: `back-${k}`, name: `靠背布（${s}半）`, parent: `mid-${k}`, shape: { type: 'hole', w: 138, h: 290, r: 14 }, pivot: [x(-69), 145, 0], at: [x(-8), 40, -10], rot: [0, m * 180, 0] },
    { id: `head-${k}`, name: `头部靠布（${s}半）`, parent: `up-${k}`, shape: { type: 'hole', w: 116, h: 280, r: 14 }, pivot: [x(-58), 140, 0], at: [x(-8), 12, -10], rot: [0, m * 180, 0] },
    {
      id: `basket-${k}`, name: `储物篮（${s}半）`, spec: '最大承重 5 kg', parent: `hinge-${k}`,
      shape: {
        type: 'compound',
        items: [
          { type: 'hole', w: 146, h: 220, r: 10, at: [x(73), -110, -110], rot: [-90, 0, 0] },
          { type: 'hole', w: 146, h: 110, r: 8, at: [x(73), -55, -220], fill: 'white' },
          { type: 'hole', w: 146, h: 110, r: 8, at: [x(73), -55, 0], fill: 'white' },
          { type: 'hole', w: 220, h: 110, r: 8, at: [0, -55, -110], rot: [0, 90, 0], fill: 'white' },
        ],
      },
      at: [x(14), BASKET_AT[0], BASKET_AT[1]], rot: [-TILT, 0, 0],
    },
    { id: `canopy-${k}`, name: `遮阳篷（${s}半）`, parent: `bar-${k}`, shape: { type: 'hole', w: 114, h: 270, r: 18 }, pivot: [x(51), 135, 0], rot: [CANOPY.open, 0, 0], fill: 'warm' },
    { id: `pad-${k}`, name: `肩垫（${s}）`, parent: `back-${k}`, shape: { type: 'hole', w: 30, h: 88, r: 10 }, at: [x(-88), 168, 3], fill: 'dark' },
    {
      id: `belt-${k}`, name: `肩带（${s}）`,
      shape: { type: 'cable', from: { part: `back-${k}`, at: ex([-88, 238, 4]), dir: [0, 0, 1] }, to: { part: `tongue-${k}`, at: [-24, 0, 0], dir: [-1, 0, 0] }, r: 5, slack: 1.1 },
    },
    {
      id: `tongue-${k}`, name: `插舌（${s}）`, parent: 'buckle',
      shape: {
        type: 'compound',
        items: [
          { type: 'box', size: [18, 2.5, 13], at: [9, 0, 0], fill: 'shade' },
          { type: 'box', size: [24, 8, 20], chamfer: 2, at: [-12, 0, 0] },
        ],
      },
    },
  ]
}

const parts: SpecPart[] = [
  ...sideParts('l', 1),
  ...sideParts('r', -1),
  { id: 'brake', name: '刹车踏板', spec: '后轮联动 · 踩下锁定', parent: 'rarm-r', shape: { type: 'box', size: [12, 7, 30], chamfer: 2 }, pivot: [0, 0, -15], at: [0, RA - 40, -9], rot: [BRAKE.off, 0, 0], fill: 'dark' },
  // 五点式安全带：插扣在座椅中线、靠前；两个插舌插在插扣上沿
  { id: 'buckle', name: '安全带插扣', spec: '五点式', parent: 'seat-l', shape: { type: 'cylinder', r: 22, h: 14, axis: 'z' }, at: [148, 110, 24], rot: [-60, 0, 0] },
  { id: 'buckle-btn', name: '插扣按钮', parent: 'buckle', shape: { type: 'cylinder', r: 11, h: 3, axis: 'y' }, at: [0, 0, 8.5], rot: [90, 0, 0], fill: 'shade' },
  { id: 'slot-l', name: '左插口', parent: 'buckle', shape: { type: 'hole', w: 14, h: 4, r: 1 }, at: [-15.6, -15.6, 0], rot: [90, -45, 0], fill: 'dark' },
  { id: 'slot-r', name: '右插口', parent: 'buckle', shape: { type: 'hole', w: 14, h: 4, r: 1 }, at: [15.6, -15.6, 0], rot: [90, 45, 0], fill: 'dark' },
  { id: 'crotch', name: '裆带', parent: 'buckle', shape: { type: 'hole', w: 24, h: 60, r: 4 }, at: [0, 50, -3], fill: 'dark' },
  // 折叠锁钩：左铰链内侧，合拢后扣住右铰链内侧的挡块
  {
    id: 'hook', name: '折叠锁钩', spec: '合拢后锁住左右两半', parent: 'hinge-l',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [62, 6, 12], chamfer: 1.5, at: [31, 0, 0] },
        { type: 'box', size: [7, 14, 12], chamfer: 1.5, at: [58.5, -8, 0] },
      ],
    },
    at: [HOOK.x, r1(27 * Math.cos(rad(35))), r1(27 * Math.sin(rad(35)))], rot: [35, 0, HOOK.open], fill: 'dark',
  },
  { id: 'catch', name: '锁钩挡块', parent: 'hinge-r', shape: { type: 'box', size: [7, 10, 12], chamfer: 1 }, at: [-43.5, r1(17 * Math.cos(rad(35))), r1(17 * Math.sin(rad(35)))], rot: [35, 0, 0], fill: 'dark' },
]

// ---------- 姿态 ----------
const each = (f: (k: Side, m: Mirror) => Pose): Pose => Object.assign({}, ...SIDES.map(([k, m]) => f(k, m)))
function merge(...poses: Pose[]): Pose {
  const out: Pose = {}
  for (const p of poses) for (const [id, st] of Object.entries(p)) out[id] = { ...out[id], ...st }
  return out
}
const legAt = (m: Mirror, half: number, c: [number, number]): Vec3 => [m * -half, c[0], c[1]]

const BRAKE_ON: Pose = { brake: { rot: [BRAKE.on, 0, 0], dur: 0.5 } }
const BRAKE_OFF: Pose = { brake: { rot: [BRAKE.off, 0, 0], dur: 0.5 } }
const FRONT_LOCK: Pose = each((k) => ({
  [`flock-${k}`]: { at: [0, FLOCK.on, 21], dur: 0.5 },
  [`fork-${k}`]: { rot: [0, 0, 0], delay: 0.3, dur: 0.8 },
}))
const FRONT_FREE: Pose = each((k) => ({ [`flock-${k}`]: { at: [0, FLOCK.off, 21], dur: 0.5 } }))
const CANOPY_FOLD: Pose = each((k) => ({ [`canopy-${k}`]: { rot: [CANOPY.fold, 0, 0], dur: 1.3 } }))
const CANOPY_OPEN: Pose = each((k) => ({ [`canopy-${k}`]: { rot: [CANOPY.open, 0, 0], dur: 1.3 } }))
const REAR_FOLD: Pose = each((k) => ({
  [`rlock-${k}`]: { at: [k === 'l' ? -12.5 : 12.5, RL - RLOCK.down, 0], dur: 0.4 },
  [`rarm-${k}`]: { rot: [ANG.rarmFold, 0, 0], delay: 0.5, dur: 1.2 },
}))
const REAR_DOWN: Pose = each((k) => ({
  [`rarm-${k}`]: { rot: [ANG.rarm, 0, 0], dur: 1.2 },
  [`rlock-${k}`]: { at: [k === 'l' ? -12.5 : 12.5, RL - RLOCK.up, 0], delay: 1.0, dur: 0.3 },
}))
const PUSH: Pose = each((k) => ({
  [`mid-${k}`]: { rot: [ANG.midPush, 0, 0], dur: 1.8 },
  [`up-${k}`]: { rot: [ANG.upPush, 0, 0], dur: 1.8 },
}))
const RAISE: Pose = each((k) => ({
  [`mid-${k}`]: { rot: [0, 0, 0], dur: 1.6 },
  [`up-${k}`]: { rot: [0, 0, 0], dur: 1.6 },
}))
const COLLAPSE: Pose = each((k, m) => ({
  [`leg-${k}`]: { at: legAt(m, ZS, C_F), rot: [ANG.legF, 0, 0], lift: 20, dur: 1.8 },
  [`mid-${k}`]: { rot: [ANG.midF, 0, 0], dur: 1.8 },
  [`up-${k}`]: { rot: [ANG.upF, 0, 0], dur: 1.8 },
  [`rleg-${k}`]: { rot: [ANG.rlegF, 0, 0], dur: 1.8 },
  [`canopy-${k}`]: { rot: [CANOPY.stow, 0, 0], dur: 1.8 },
  [`seat-${k}`]: { rot: [-150, 0, 0], dur: 1.8 },
  [`basket-${k}`]: { at: [m * 14, BASKET_F[0], BASKET_F[1]], rot: [-55, 0, 0], dur: 1.8 },
}))
const PULL: Pose = each((k, m) => ({
  [`leg-${k}`]: { at: legAt(m, ZS, C_U), rot: [TILT, 0, 0], lift: 20, dur: 1.8 },
  [`mid-${k}`]: { rot: [ANG.midPush, 0, 0], dur: 1.8 },
  [`up-${k}`]: { rot: [ANG.upPush, 0, 0], dur: 1.8 },
  [`rleg-${k}`]: { rot: [ANG.rleg, 0, 0], dur: 1.8 },
  [`canopy-${k}`]: { rot: [CANOPY.fold, 0, 0], dur: 1.8 },
  [`seat-${k}`]: { rot: [-120, 0, 0], dur: 1.8 },
  [`basket-${k}`]: { at: [m * 14, BASKET_AT[0], BASKET_AT[1]], rot: [-TILT, 0, 0], dur: 1.8 },
}))
const V = { bar: 85, seat: 55, back: 60, head: 60, basket: 50 }
const CLOSE: Pose = each((k, m) => ({
  [`leg-${k}`]: { at: legAt(m, ZF, C_F), delay: 0.5, dur: 1.2 },
  [`bar-${k}`]: { rot: [0, m * V.bar, 0], dur: 1.0 },
  [`seat-${k}`]: { rot: [-150, m * V.seat, 0], dur: 1.2 },
  [`back-${k}`]: { rot: [0, m * (180 + V.back), 0], dur: 1.2 },
  [`head-${k}`]: { rot: [0, m * (180 + V.head), 0], dur: 1.2 },
  [`basket-${k}`]: { rot: [-55, 0, m * -V.basket], dur: 1.2 },
}))
const OPEN: Pose = each((k, m) => ({
  [`leg-${k}`]: { at: legAt(m, ZS, C_F), dur: 1.2 },
  [`bar-${k}`]: { rot: [0, 0, 0], delay: 0.9, dur: 1.0 },
  [`seat-${k}`]: { rot: [-150, 0, 0], delay: 0.4, dur: 1.2 },
  [`back-${k}`]: { rot: [0, m * 180, 0], delay: 0.4, dur: 1.2 },
  [`head-${k}`]: { rot: [0, m * 180, 0], delay: 0.4, dur: 1.2 },
  [`basket-${k}`]: { rot: [-55, 0, 0], delay: 0.4, dur: 1.2 },
}))
const HOOK_SHUT: Pose = { hook: { rot: [35, 0, HOOK.shut], dur: 0.8 } }
const HOOK_OPEN: Pose = { hook: { rot: [35, 0, HOOK.open], dur: 0.8 } }

const FOLDED = merge(BRAKE_ON, FRONT_LOCK, CANOPY_FOLD, REAR_FOLD, PUSH, COLLAPSE, CLOSE, HOOK_SHUT)
const SWIVELED: Pose = { 'fork-l': { rot: [0, 28, 0] }, 'fork-r': { rot: [0, 22, 0] } }

// ---------- 镜头 ----------
const OPEN_VIEW: CameraSpec = { target: [0, 500, -90], dir: [0.8, 0.5, -1], dist: 2700 }
const SIDE_VIEW: CameraSpec = { target: [0, 480, -60], dir: [1, 0.4, -0.25], dist: 2500 }
/** 把手推下后（高度只剩约 60 cm）的侧视 */
const PUSHED_VIEW: CameraSpec = { target: [0, 330, -40], dir: [1, 0.42, -0.3], dist: 2000 }
const COLLAPSE_VIEW: CameraSpec = { target: [0, 200, 0], dir: [1, 0.45, -0.35], dist: 1400 }
const FOLDED_VIEW: CameraSpec = { target: [0, 200, 0], dir: [0.85, 0.6, -1], dist: 1300 }
const HANDLE_VIEW: CameraSpec = { target: [0, 960, 170], dir: [0.4, 0.55, 1], dist: 1100 }
const BRAKE_VIEW: CameraSpec = { target: [ZS, 220, 80], dir: [0.7, 0.45, 1], dist: 1400 }
const FRONT_VIEW: CameraSpec = { target: [0, 120, -300], dir: [0.55, 0.45, -1], dist: 1300 }
const SEAT_VIEW: CameraSpec = { target: [0, 580, -170], dir: [0.3, 0.45, -1], dist: 1500 }
const zoomOf = (target: string, dir: Vec3, dist: number, caption: string) => ({ target, dir, dist, caption })

export const goodbabyPockit: ManualSpec = {
  id: 'goodbaby-pockit',
  name: '好孩子 POCKIT 口袋车',
  desc: '两步折叠的超小口袋婴儿推车 · 双轮 · 五点式安全带 · 前轮可定向',
  category: '婴儿推车',
  dims: { width: 452, depth: 578, height: 1008 },
  source: { title: 'gb GOLD POCKIT 使用说明书', url: 'http://img.gb-online.com/gbo/manuals/pockit_manual_vbycwp', images: [] },
  package: [
    { name: 'POCKIT 推车', qty: 1, spec: '出厂为折叠状态，带遮阳篷、储物篮、五点式安全带' },
    { name: '使用说明书', qty: 1, spec: '18 页图示' },
  ],
  params: [
    { label: '折叠尺寸', value: '30 × 18 × 35 cm', note: '官方 · 吉尼斯 2014 最小折叠童车' },
    { label: '整车重量', value: '4.3 kg', note: '官方（Red Dot 申报）' },
    { label: '折叠方式', value: '两步折叠（2 × 2 D）', note: '先前后收拢，再左右合拢' },
    { label: '车轮', value: '四组双轮 Ø12 cm', note: '前轮万向可锁定，后轮联动刹车' },
    { label: '储物篮', value: '最大承重 5 kg', note: '官方目录' },
    { label: '安全带', value: '五点式', note: '肩垫可调高度，肩带 / 裆带可调长度' },
    { label: '展开尺寸', value: '约 100 × 58 × 45 cm', note: '高 × 长 × 宽，按图示推断' },
    { label: '售后热线', value: '400-828-0000', note: '说明书封底' },
  ],
  parts,
  initial: {
    'tongue-l': { plug: 'slot-l' },
    'tongue-r': { plug: 'slot-r' },
  },
  stageSize: 1500,
  guides: [
    {
      id: 'unfold', title: '展开推车', kind: 'usage',
      start: FOLDED,
      steps: [
        {
          id: 'unf-overview', title: '认识折叠状态', page: 4,
          desc: '最小折叠后的 POCKIT：把手横杆和锁钩在顶部，四组双轮收在两侧，可以自己立住。官方折叠尺寸 30 × 18 × 35 cm。',
          camera: FOLDED_VIEW, orbit: true,
          callouts: [
            { part: 'grip-r', text: '握把', offset: [70, 60, 0] },
            { part: 'hook', text: '锁钩（已扣上）', offset: [-60, 90, 0] },
            { part: 'fwheel-r', text: '前轮', offset: [90, 10, 40] },
            { part: 'rwheel-r', text: '后轮（已收起）', offset: [90, -10, -60] },
          ],
          chips: [{ label: '折叠', sub: '30 × 18 × 35 cm' }],
        },
        {
          id: 'unf-hook', title: '向上翻开锁钩', page: 4,
          desc: '把车顶部的锁钩向上翻开（开锁图标），左右两半才能分开。',
          camera: FOLDED_VIEW,
          set: HOOK_OPEN,
          highlight: ['hook'],
          zoom: zoomOf('hook', [0.5, 1, -0.6], 260, '锁钩向上翻 = 开锁'),
        },
        {
          id: 'unf-open', title: '向两侧打开', page: 4,
          desc: '两手握住左右两半向外打开，把手横杆中间的折点随之伸直。',
          camera: { ...FOLDED_VIEW, dist: 1700 },
          set: OPEN,
          highlight: ['bar-l', 'bar-r'],
        },
        {
          id: 'unf-pull', title: '握住把手，拉出车身前部', page: 4,
          desc: 'a 握住两端握把，b 把车身前部（座椅和前轮）向外拉出，前后支架张开成 A 字，前轮落地。',
          camera: PUSHED_VIEW,
          set: PULL,
          highlight: ['leg-r', 'rleg-r'],
          callouts: [
            { part: 'grip-r', text: 'a 握住把手', offset: [0, 120, 80] },
            { part: 'fwheel-r', text: 'b 拉出前部', offset: [0, 120, -120] },
          ],
        },
        {
          id: 'unf-raise', title: '向上拉起把手，听到「咔哒」', page: 5,
          desc: '把把手向上拉到底，两侧铰链发出「咔哒」声，靠背和把手管锁成一条直线。',
          camera: SIDE_VIEW,
          set: RAISE,
          highlight: ['up-r', 'mid-r', 'hinge-r'],
          zoom: zoomOf('hinge-r', [1, 0.35, 0.2], 300, '侧铰链「咔哒」= 已锁定'),
          chips: [{ label: '咔哒', sub: '左右两侧' }],
        },
        {
          id: 'unf-rear', title: '向下翻出后轮', page: 5,
          desc: '把两个后轮支架向下翻到底，各「咔哒」一声（2x，两侧都要做）。',
          camera: { target: [0, 160, 60], dir: [1, 0.45, 0.35], dist: 1500 },
          set: REAR_DOWN,
          highlight: ['rarm-r', 'rarm-l'],
          zoom: zoomOf('rarm-r', [1, 0.3, 0.25], 420, '后轮支架翻下「咔哒」×2'),
        },
        {
          id: 'unf-done', title: '展开完成', page: 5,
          desc: '放下遮阳篷，推车展开完成（第 5 页图 ✓）。推行前先抬起刹车踏板。',
          camera: OPEN_VIEW, orbit: true,
          set: CANOPY_OPEN,
          highlight: ['canopy-l', 'canopy-r'],
          callouts: [
            { part: 'canopy-r', text: '遮阳篷', at: [-50, 200, 0], offset: [80, 120, 0] },
            { part: 'hinge-r', text: '侧铰链已锁', offset: [140, 40, 0] },
            { part: 'basket-r', text: '储物篮', sub: '≤ 5 kg', at: [-73, -55, -220], offset: [120, -40, -60] },
          ],
          tip: '两侧铰链、两个后轮支架都要听到「咔哒」才算锁好；没锁到位不要让孩子乘坐。',
        },
      ],
    },
    {
      id: 'fold', title: '折叠推车（最小折叠）', kind: 'usage',
      start: SWIVELED,
      steps: [
        {
          id: 'fold-brake', title: '踩下刹车', page: 6,
          desc: '先把后轮的刹车踏板向下踩到底，「咔哒」锁住（锁图标）。',
          camera: BRAKE_VIEW,
          set: BRAKE_ON,
          highlight: ['brake'],
          zoom: zoomOf('brake', [0.6, 0.5, 1], 220, '踏板踩下「咔哒」= 刹住'),
        },
        {
          id: 'fold-front', title: '锁定前轮方向', page: 6,
          desc: '两个前轮的定向锁扣向上推，「咔哒」锁住，前轮回正只能前后滚（2x，两侧都做）。',
          camera: FRONT_VIEW,
          set: FRONT_LOCK,
          highlight: ['flock-r', 'flock-l', 'fwheel-r', 'fwheel-l'],
          zoom: zoomOf('flock-r', [0.6, 0.5, 1], 150, '锁扣上推 = 定向'),
        },
        {
          id: 'fold-canopy', title: '收起遮阳篷', page: 6,
          desc: '把遮阳篷向后上方翻起收好。',
          camera: { target: [0, 820, 120], dir: [0.5, 0.12, 1], dist: 2000 },
          set: CANOPY_FOLD,
          highlight: ['canopy-l', 'canopy-r'],
        },
        {
          id: 'fold-rear', title: '最小折叠：向前收起后轮', page: 8,
          desc: '一手提起车尾，a 把后腿上的释放键向下推，b 后轮支架向前上方翻起，「咔哒」（2x，两侧都做）。',
          camera: { target: [0, 200, 40], dir: [1, 0.45, 0.4], dist: 1500 },
          set: REAR_FOLD,
          highlight: ['rlock-r', 'rarm-r', 'rarm-l'],
          zoom: zoomOf('rlock-r', [1, 0.4, 0.3], 220, 'a 释放键下推 → b 后轮前翻'),
          tip: '标准折叠（第 6–7 页）跳过这一步：后轮保持展开，折好后稍高一些。',
        },
        {
          id: 'fold-buttons', title: '按住把手两端的按钮', page: 6,
          desc: 'a 双手同时按住两端握把上的折叠按钮，保持按住。',
          camera: HANDLE_VIEW,
          actions: [{ type: 'press', part: 'btn-l', depth: 2.5 }, { type: 'press', part: 'btn-r', depth: 2.5 }],
          highlight: ['btn-l', 'btn-r'],
          zoom: zoomOf('btn-r', [1, 0.35, 0.5], 160, '握把端头的折叠按钮'),
        },
        {
          id: 'fold-push', title: '把靠背向下推', page: 7,
          desc: 'b 按住按钮的同时把把手向下推：靠背在侧铰链处向后下方折下，把手落到座椅高度。',
          camera: PUSHED_VIEW,
          set: PUSH,
          highlight: ['mid-r', 'up-r'],
          callouts: [{ part: 'hinge-r', text: '侧铰链', sub: '靠背从这里折下', offset: [0, 160, -120] }],
        },
        {
          id: 'fold-collapse', title: '前后支架收拢', page: 9,
          desc: '继续下压，前腿前倾、后腿向前合拢，车架收成一个小包，前轮着地立住。',
          camera: COLLAPSE_VIEW,
          set: COLLAPSE,
          highlight: ['leg-r', 'rleg-r'],
        },
        {
          id: 'fold-close', title: '左右两半向内合拢', page: 7,
          desc: '把左右两半向中间合拢，把手横杆在中间折点处折起，布面向外鼓出。',
          camera: FOLDED_VIEW,
          set: CLOSE,
          highlight: ['bar-l', 'bar-r'],
        },
        {
          id: 'fold-lock', title: '扣上锁钩', page: 7,
          desc: '把顶部锁钩向下扣到对侧挡块上（锁图标），折叠完成，可以提着走或立着放。',
          camera: FOLDED_VIEW,
          set: HOOK_SHUT,
          highlight: ['hook', 'catch'],
          zoom: zoomOf('hook', [0.5, 1, -0.6], 260, '锁钩扣上 = 锁住'),
          chips: [{ label: '折叠', sub: '30 × 18 × 35 cm（官方）' }],
        },
      ],
    },
    {
      id: 'brake-wheel', title: '刹车与前轮', kind: 'usage',
      start: SWIVELED,
      steps: [
        {
          id: 'bw-brake-on', title: '踩下刹车踏板', page: 13,
          desc: '脚踩后轮上的刹车踏板，「咔哒」一声锁住，两个后轮同时刹住。',
          camera: BRAKE_VIEW,
          set: BRAKE_ON,
          highlight: ['brake'],
          zoom: zoomOf('brake', [0.6, 0.5, 1], 220, '向下踩 = 锁'),
          tip: '停车（哪怕只停一下）都先踩下刹车。',
        },
        {
          id: 'bw-brake-off', title: '抬起刹车踏板', page: 13,
          desc: '用脚尖把踏板向上勾起，「咔哒」一声解锁，即可推行。',
          camera: BRAKE_VIEW,
          set: BRAKE_OFF,
          highlight: ['brake'],
          zoom: zoomOf('brake', [0.6, 0.5, 1], 220, '向上抬 = 开锁'),
        },
        {
          id: 'bw-lock', title: '前轮定向：锁扣上推', page: 14,
          desc: '把前轮座后面的锁扣向上推，「咔哒」锁住，前轮回正、只能前后直行。两个前轮都要锁。',
          camera: FRONT_VIEW,
          set: FRONT_LOCK,
          highlight: ['flock-r', 'flock-l'],
          zoom: zoomOf('flock-r', [0.6, 0.5, 1], 150, '上推 = 定向'),
          tip: '官方资料：前万向轮锁定后在不平路面上更稳。',
        },
        {
          id: 'bw-free', title: '前轮万向：锁扣下拨', page: 14,
          desc: '把锁扣向下拨开，前轮可以 360° 转向，在平地上转弯更灵活。',
          camera: FRONT_VIEW,
          set: FRONT_FREE,
          actions: [{ type: 'spin', part: 'fork-r', axis: 'y' }, { type: 'spin', part: 'fork-l', axis: 'y' }],
          highlight: ['flock-r', 'fwheel-r'],
          zoom: zoomOf('flock-r', [0.6, 0.5, 1], 150, '下拨 = 万向 360°'),
        },
      ],
    },
    {
      id: 'harness', title: '五点式安全带', kind: 'usage',
      steps: [
        {
          id: 'hn-press', title: '按下插扣按钮', page: 10,
          desc: '按下插扣中间的圆形按钮，「咔哒」一声开锁。',
          camera: SEAT_VIEW,
          actions: [{ type: 'press', part: 'buckle-btn', depth: 1.5 }],
          highlight: ['buckle-btn'],
          zoom: zoomOf('buckle', [0.2, 0.75, -1], 150, '按中间圆钮 = 开锁'),
        },
        {
          id: 'hn-out', title: '拔出两个插舌', page: 10,
          desc: '按住按钮，把左右两个插舌向上拔出，就可以把孩子抱进 / 抱出。',
          camera: SEAT_VIEW,
          set: {
            'tongue-l': { plug: { hole: 'slot-l', depth: -40, back: 0 }, dur: 0.9 },
            'tongue-r': { plug: { hole: 'slot-r', depth: -40, back: 0 }, dur: 0.9 },
          },
          highlight: ['tongue-l', 'tongue-r'],
          zoom: zoomOf('buckle', [0.2, 0.75, -1], 280, '插舌向上方两侧拔出'),
        },
        {
          id: 'hn-in', title: '插回插舌，听到「咔哒」', page: 10,
          desc: '孩子坐好后，把两个插舌分别插回插扣，听到「咔哒」声即锁定（锁图标）。',
          camera: SEAT_VIEW,
          set: {
            'tongue-l': { plug: { hole: 'slot-l', back: 0 }, dur: 0.9 },
            'tongue-r': { plug: { hole: 'slot-r', back: 0 }, delay: 0.4, dur: 0.9 },
          },
          actions: [{ type: 'shake', part: 'tongue-l', axis: 'x', amp: 1.2 }],
          highlight: ['tongue-l', 'tongue-r'],
          zoom: zoomOf('buckle', [0.2, 0.75, -1], 150, '「咔哒」= 已锁定'),
          tip: '澳洲版（第 12 页 AUS）多一步：先把肩带扣套回腰带插舌，再一起插入插扣。',
        },
        {
          id: 'hn-pad', title: '调节肩垫位置', page: 11,
          desc: '肩垫可以沿肩带上下移动，对准孩子的肩膀；肩垫也可以翻开取下。',
          camera: SEAT_VIEW,
          set: {
            'pad-l': { at: [-88, 200, 3], dur: 0.9 },
            'pad-r': { at: [88, 200, 3], dur: 0.9 },
          },
          highlight: ['pad-l', 'pad-r'],
        },
        {
          id: 'hn-adjust', title: '调节肩带和裆带长度', page: 11,
          desc: '肩带、裆带上的调节扣：a 翻起调节扣，b 向下拉带子收紧，松紧以能插进一指为宜。',
          camera: SEAT_VIEW,
          actions: [{ type: 'shake', part: 'buckle', axis: 'y', amp: 2 }],
          highlight: ['belt-l', 'belt-r', 'crotch'],
          zoom: zoomOf('buckle', [0.2, 0.75, -1], 220, 'a 翻起调节扣 → b 下拉收紧'),
        },
      ],
    },
    {
      id: 'care', title: '布套拆洗与使用前检查', kind: 'repair',
      steps: [
        {
          id: 'care-a', title: 'a 解开靠背两侧按扣', page: 16,
          desc: '靠背布两侧各有一排按扣扣在靠背管上，逐个解开（2x，两侧）。',
          camera: OPEN_VIEW,
          set: each((k, m) => ({ [`back-${k}`]: { at: [m * 4, 40, -18], dur: 0.8 } })),
          highlight: ['back-r', 'back-l'],
          zoom: { target: [ZS - OFF.mid, 600, -60], dir: [1, 0.3, -0.6], dist: 300, caption: '靠背管上的按扣' },
        },
        {
          id: 'care-b', title: 'b 解开座位下方按扣', page: 16,
          desc: '座位前方下面两侧的按扣也解开（2x）。',
          camera: OPEN_VIEW,
          set: each((k, m) => ({ [`seat-${k}`]: { at: [m * 16, SEAT_AT[0] + 4, SEAT_AT[1] - 6], dur: 0.8 } })),
          highlight: ['seat-r', 'seat-l'],
          zoom: { target: [ZS - 20, 410, -300], dir: [1, 0.2, -0.8], dist: 320, caption: '座位下方两侧按扣' },
        },
        {
          id: 'care-c', title: 'c 解开侧铰链处的绑带', page: 16,
          desc: '靠背后面绕在侧铰链上的绑带，打开按扣松开（2x）。',
          camera: { target: [0, 430, -140], dir: [1, 0.45, 0.6], dist: 1600 },
          highlight: ['hinge-r', 'hinge-l'],
          zoom: zoomOf('hinge-r', [1, 0.4, 0.6], 300, '铰链处绑带按扣'),
        },
        {
          id: 'care-d', title: 'd 取下横杆处的挂扣', page: 17,
          desc: '头部靠布顶端挂在把手横杆上的两个挂扣，向上取下（2x）。',
          camera: { target: [0, 860, 60], dir: [0.4, 0.45, -1], dist: 1400 },
          set: each((k, m) => ({ [`head-${k}`]: { at: [m * -8, 2, -24], dur: 0.8 } })),
          highlight: ['head-r', 'head-l'],
          zoom: { target: [60, 985, 165], dir: [0.4, 0.6, -1], dist: 300, caption: '横杆上的挂扣向上取下' },
        },
        {
          id: 'care-e', title: 'e 向前抽出布套，f 揭起坐垫', page: 17,
          desc: '把整块布套向前抽出，再把坐垫从座板的魔术贴上揭起，布套可以单独清洗。',
          camera: OPEN_VIEW,
          set: {
            ...each((k, m) => ({
              [`seat-${k}`]: { at: [m * 16, SEAT_AT[0] - 30, SEAT_AT[1] - 60], visible: false, dur: 1.2 },
              [`back-${k}`]: { at: [m * 4, 10, -70], visible: false, dur: 1.2 },
              [`head-${k}`]: { at: [m * -8, -20, -76], visible: false, dur: 1.2 },
              [`belt-${k}`]: { visible: false, dur: 1.2 },
            })),
          },
          highlight: ['seat-r', 'back-r', 'head-r'],
        },
        {
          id: 'care-check', title: '装回后检查：铰链、后轮、刹车', page: 5,
          desc: '按相反顺序装回布套。使用前检查：两侧铰链和两个后轮支架都已「咔哒」锁定，刹车踩下能刹住，安全带插扣能锁紧。',
          camera: OPEN_VIEW,
          set: {
            ...each((k, m) => ({
              [`seat-${k}`]: { at: [m * 12, SEAT_AT[0], SEAT_AT[1]], visible: true, dur: 1.0 },
              [`back-${k}`]: { at: [m * -8, 40, -10], visible: true, dur: 1.0 },
              [`head-${k}`]: { at: [m * -8, 12, -10], visible: true, dur: 1.0 },
              [`belt-${k}`]: { visible: true, dur: 1.0 },
            })),
          },
          actions: [{ type: 'shake', part: 'hinge-r', axis: 'y', amp: 1.5 }, { type: 'shake', part: 'hinge-l', axis: 'y', amp: 1.5 }],
          highlight: ['hinge-r', 'hinge-l', 'rarm-r', 'brake'],
          tip: '有零件松动、损坏或锁不住时停止使用，联系好孩子售后：400-828-0000（说明书封底）。',
        },
      ],
    },
  ],
}
