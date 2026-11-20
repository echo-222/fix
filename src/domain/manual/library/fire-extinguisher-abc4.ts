import type { CameraSpec, Finish, ManualSpec, PartState, Shape, SpecPart, Vec3 } from '../types'

/**
 * 手提式干粉灭火器 MF/ABC4（4 kg）· 南京洪湖消防 MF/ABCE4
 * 主资料：洪湖《手提式干粉灭火器使用维修手册》（6 页 PDF），逐页转写见 manuals-src/fire-extinguisher-abc4/transcript.md
 * 交叉核对（只写进 tip，并注明出处）：
 * - 国家消防救援局《灭火器的正确使用方法，关键时刻用得上！》https://www.119.gov.cn/kp/hzyf/jt/2022/19951.shtml
 * - 应急管理部《应对家庭突发火灾常备“五件宝”》https://www.mem.gov.cn/kp/shaq/201903/t20190328_365925.shtml
 * - 少量地方消防救援机构的科普 / 答复（聊城经开区、湖南总队、江苏总队、尤溪、闽侯），原文存档在 manuals-src/…/web/sources.md
 * - 压力表色区与刻度、铭牌上的火灾类别取自洪湖官网 MF/ABCE4 产品图（http://www.njhonghu.com/product/36.html）
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。
 * 灭火器局部：原点在瓶底中心；正面（铭牌、压力表）朝 +z；软管接头和软管在左（-x）；压把、提把朝右（+x）。
 * 使用场景：火盆在 x = +1500，灭火位置在 x = -1500（相距 3 m），风从 -x 吹向 +x（灭火位置在上风）；
 * 墙和托架在左后方（x = -2100，墙面 z = -930）。
 *
 * 推断（资料没有给出）：
 * - 外形：瓶体 Ø140 mm、到阀门顶 467 mm、压把翘起时约 520 mm，按产品图比例与常见 4 kg 规格推断。
 * - 压把转轴在阀门左上方、长约 98 mm、松开时上翘 32°；保险销在转轴右侧穿过压把与阀门；铅封挂在拉环外侧；
 *   软管约 Ø12 mm、喷嘴长约 74 mm，平时卡在瓶身左侧腰带上。以上位置照产品图估计。
 * - 压力表刻度 0–2.5 MPa 在表盘上的角度按产品图估计（红 0–1.0 / 绿 1.0–1.4 / 黄 1.4–2.5）。
 * - 托架高度取底部 600 mm（手册只要求顶部 ≤ 1.5 m、底部 ≥ 0.08 m）；灭火时灭火器提在离地 150 mm（场景里不画人）。
 * - 火盆、火焰、余烬、地面 3 m 标线、风向箭头都是讲步骤用的道具；射流画成实心锥体，末端停在火焰根部前面一点。
 *
 * 外观模型：照洪湖官网 MF/ABCE4 产品图生成（models/fire-extinguisher-abc4/tripo.json，来源 refs/sources.json）。
 * 参考图涂掉了喷射软管、喷嘴、压把和保险销，模型只有瓶身、阀门、下提把和压力表；这些涂掉的件都用几何体单独做，
 * 压力表另叠一块几何表盘（指针要转）。
 */

// ---------- 小工具 ----------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => mul(a, 1 / len(a))
const RAD = Math.PI / 180
const r1 = (v: number) => Math.round(v * 10) / 10

/** 绕 y 轴转 yaw 度（与 rot: [0, yaw, 0] 一致） */
const yawed = (p: Vec3, yaw: number): Vec3 => {
  const c = Math.cos(yaw * RAD)
  const s = Math.sin(yaw * RAD)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

const show = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: false }]))

// ---------- 材质 ----------

const RED_PAINT: Finish = { color: '#d42a20', roughness: 0.35 }
const LEVER_PAINT: Finish = { color: '#c62f26', roughness: 0.3, metalness: 0.55 }
const PIN_YELLOW: Finish = { color: '#f2c200', roughness: 0.45 }
const LEAD: Finish = { color: '#9aa0a6', roughness: 0.55, metalness: 0.6 }
const FLAME: Finish = { color: '#ff6a1a', roughness: 0.9 }
const FLAME_CORE: Finish = { color: '#ffc21a', roughness: 0.9 }
const POWDER: Finish = { color: '#f3f0e8', roughness: 1 }
const OIL: Finish = { color: '#2a1d12', roughness: 0.2 }
const TAPE: Finish = { color: '#f2c200', roughness: 0.7 }
const WIND_BLUE: Finish = { color: '#2f6fd6', roughness: 0.6 }

// ---------- 灭火器尺寸（局部坐标） ----------

const BODY_R = 69.6
const H = 467
/** 压把转轴（阀门左上方） */
const PIVOT: Vec3 = [-7, 466, 0]
const LEVER_UP: Vec3 = [0, 0, 32]
const LEVER_DOWN: Vec3 = [0, 0, 3]
/** 保险销在灭火器局部的位置（压把松开时），与在压把局部的位置 */
const PIN_EXT: Vec3 = [13.2, 475.1, 0]
const PIN_ON_LEVER: Vec3 = (() => {
  const d = sub(PIN_EXT, PIVOT)
  const c = Math.cos(-LEVER_UP[2] * RAD)
  const s = Math.sin(-LEVER_UP[2] * RAD)
  return [r1(d[0] * c - d[1] * s), r1(d[0] * s + d[1] * c), 0]
})()
const GAUGE_AT: Vec3 = [8, 445, 64.5]
const NUT_AT: Vec3 = [-26, 449, 0]
const NOZZLE_STOW: Vec3 = [-82, 175, 0]
const NOZZLE_LEN = 74

/** 压力（MPa）→ 指针偏离竖直的角度（顺时针为正），刻度按产品图估：红 0–1.0、绿 1.0–1.4、黄 1.4–2.5 */
const gaugeAngle = (mpa: number) =>
  mpa <= 1 ? -60 + 40 * mpa : mpa <= 1.4 ? -20 + ((mpa - 1) / 0.4) * 40 : 20 + ((mpa - 1.4) / 1.1) * 40
const needle = (mpa: number, extra: PartState = {}): PartState => ({ rot: [0, 0, r1(-gaugeAngle(mpa))], dur: 1.0, ...extra })

const zoneSeg = (deg: number, color: string): Shape & { at: Vec3; rot: Vec3; finish: Finish } => ({
  type: 'box', size: [4.6, 2.8, 0.6], at: [r1(12.5 * Math.sin(deg * RAD)), r1(12.5 * Math.cos(deg * RAD)), 3.2], rot: [0, 0, -deg], finish: { color, roughness: 0.5 },
})

/** 拉环：8 段围成一圈，环面水平（x-z 平面） */
const ringItems = (c: Vec3, R: number) =>
  Array.from({ length: 8 }, (_, k) => {
    const phi = k * 45
    return {
      type: 'box' as const, size: [6.6, 2.2, 2.2] as Vec3,
      at: [r1(c[0] + R * Math.cos(phi * RAD)), c[1], r1(c[2] + R * Math.sin(phi * RAD))] as Vec3,
      rot: [0, phi - 90, 0] as Vec3, finish: PIN_YELLOW,
    }
  })

// ---------- 场景布局（世界坐标） ----------

const FIRE: Vec3 = [1500, 0, 0]
const OIL_Y = 110.5
const KNOW_AT: Vec3 = [0, 0, 0]
const WALL_Z = -930
const BRACKET_X = -2100
const SEAT_Y = 600
const ON_BRACKET: Vec3 = [BRACKET_X, SEAT_Y, -838]
const OFF_BRACKET_VIA: Vec3 = [BRACKET_X + 40, SEAT_Y + 45, -640]
const HOLD_Y = 150
const HOLD1: Vec3 = [-2000, HOLD_Y, -430]
const OP: Vec3 = [-1500, HOLD_Y, 0]
const OP_YAW = 90
const CHECK_AT: Vec3 = [BRACKET_X, 0, -500]
const NEAR: Vec3 = [600, HOLD_Y, 0]
/** 放平：瓶轴沿 +x 躺在地上，表盘朝上 */
const LYING: PartState = { at: [-1750, 73.6, 0], rot: [-90, 0, -90], lift: 90, dur: 1.6 }

/** 喷嘴握在手里：喷嘴局部 -y（出粉方向）对准 toward，射流长 jetLen 时末端中心落在 tip + jetLen·d */
function aim(hand: Vec3, toward: Vec3) {
  const d = unit(sub(toward, hand))
  const rot: Vec3 = [0, r1(Math.atan2(-d[2], d[0]) / RAD), r1(Math.acos(-d[1]) / RAD)]
  const tip = add(hand, mul(d, NOZZLE_LEN))
  return { hand, rot, tip, d }
}
const HAND_OP: Vec3 = [-1320, 470, 140]
const AIM_ROOT = aim(HAND_OP, [1262, 120, 40])
const JET_LEN = Math.round(len(sub([1262, 120, 40], AIM_ROOT.tip)))
const AIM_HIGH = aim(HAND_OP, [1285, 410, 40])
const HAND_NEAR: Vec3 = [880, 540, 130]
const AIM_SPLASH = aim(HAND_NEAR, [1300, 150, 40])
const JET_NEAR_LEN = Math.round(len(sub([1300, 150, 40], AIM_SPLASH.tip)))

const nozzleAt = (a: ReturnType<typeof aim>, extra: PartState = {}): PartState => ({ parent: null, at: a.hand, rot: a.rot, ...extra })
const STOWED: PartState = { parent: 'ext', at: NOZZLE_STOW, rot: [0, 0, 0] }

// ---------- 零件 ----------

const extParts: SpecPart[] = [
  {
    id: 'ext', name: '手提式干粉灭火器', spec: 'MF/ABCE4 · 4±0.08 kg ABC 干粉 · 氮气 1.2 MPa',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: BODY_R, h: 410, at: [0, 205, 0] },
        { type: 'slab', w: 139.2, d: 145.6, h: 38, r: 69, at: [0, 9, 0] },
        { type: 'cylinder', r: BODY_R, r2: 36, h: 22, at: [0, 421, 0] },
        { type: 'cylinder', r: 16, h: 36, at: [0, 449, 0], fill: 'shade', finish: 'steel' },
        { type: 'box', size: [76.9, 12, 14], at: [52.95, 448, 0], finish: LEVER_PAINT },
        { type: 'cylinder', r: 18.5, h: 14, axis: 'z', at: [8, 445, 57], fill: 'shade', finish: 'steel' },
      ],
    },
    finish: RED_PAINT,
    model: { src: '/models/fire-extinguisher-abc4/extinguisher.glb', rot: [0, -90, 0], fit: 'contain' },
  },
  {
    id: 'gauge', name: '压力指示器（压力表）', spec: '0–2.5 MPa · 绿区 1.0–1.4 · 额定 1.2 MPa（20 ℃）', parent: 'ext',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 19.5, h: 5, axis: 'z', fill: 'shade', finish: 'steel' },
        { type: 'cylinder', r: 17, h: 0.8, axis: 'z', at: [0, 0, 2.7], finish: 'plastic-white' },
        zoneSeg(-50, '#d63b2f'), zoneSeg(-30, '#d63b2f'),
        zoneSeg(-10, '#2f9e44'), zoneSeg(10, '#2f9e44'),
        zoneSeg(30, '#f2c218'), zoneSeg(50, '#f2c218'),
      ],
    },
    at: GAUGE_AT,
  },
  {
    id: 'needle', name: '压力表指针', parent: 'gauge',
    shape: { type: 'compound', items: [{ type: 'box', size: [1.3, 12.5, 0.6], at: [0, 6.25, 0] }, { type: 'cylinder', r: 1.8, h: 1, axis: 'z' }] },
    at: [0, 0, 3.9], rot: needle(1.2).rot, fill: 'dark', finish: 'plastic-black',
  },
  {
    id: 'lever', name: '压把（上）', spec: '按下到位才喷射；下面的提把用来提', parent: 'ext',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [98, 7, 13], at: [49, 0, 0], chamfer: 1.5 },
        { type: 'cylinder', r: 3, h: 18, axis: 'z', fill: 'shade', finish: 'steel' },
      ],
    },
    at: PIVOT, rot: LEVER_UP, finish: LEVER_PAINT,
  },
  {
    id: 'pin', name: '保险销', spec: '黄色拉环 · 穿过压把与阀门', parent: 'lever',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 1.6, h: 26, axis: 'z', at: [0, 0, 4], fill: 'shade', finish: 'steel' },
        ...ringItems([0, 0, 25], 8),
      ],
    },
    at: PIN_ON_LEVER, rot: [0, 0, -LEVER_UP[2]], fill: 'warm', finish: PIN_YELLOW,
  },
  {
    id: 'seal', name: '铅封', spec: '保险装置完好的标志', parent: 'pin',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [0.8, 0.8, 5], at: [0, 0, -2.5] },
        { type: 'cylinder', r: 4.5, h: 2.4, at: [0, 0, 4.5] },
      ],
    },
    at: [0, 0, 38], fill: 'shade', finish: LEAD,
  },
  { id: 'hose-nut', name: '软管接头', parent: 'ext', shape: { type: 'cylinder', r: 7.5, h: 18, axis: 'x' }, at: NUT_AT, fill: 'shade', finish: 'steel' },
  {
    id: 'nozzle', name: '喷嘴', spec: '平时卡在瓶身左侧腰带上', parent: 'ext',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 8, h: 12, at: [0, -6, 0], fill: 'shade', finish: 'steel' },
        { type: 'cylinder', r: 7.5, h: 46, at: [0, -35, 0] },
        { type: 'cylinder', r: 4.5, r2: 7.5, h: 16, at: [0, -66, 0] },
      ],
    },
    at: NOZZLE_STOW, fill: 'dark', finish: 'plastic-black',
  },
  { id: 'clip', name: '喷嘴卡扣', parent: 'ext', shape: { type: 'box', size: [4, 16, 18], chamfer: 1 }, at: [-71.8, 130, 0], fill: 'dark', finish: 'plastic-black' },
  {
    id: 'hose', name: '喷射软管', spec: '约 Ø12 mm 橡胶管',
    shape: { type: 'cable', from: { part: 'hose-nut', at: [-9, 0, 0], dir: [-1, 0, 0] }, to: { part: 'nozzle', at: [0, 0, 0], dir: [0, 1, 0] }, r: 6.2, slack: 0.8 },
    fill: 'dark', finish: 'rubber',
  },
  {
    id: 'jet', name: '干粉射流', parent: 'nozzle',
    shape: { type: 'cylinder', r: 70, r2: 6, h: JET_LEN }, at: [0, -NOZZLE_LEN - JET_LEN / 2, 0], finish: POWDER, visible: false,
  },
  {
    id: 'jet-near', name: '干粉射流（近距离冲击液面）', parent: 'nozzle',
    shape: { type: 'cylinder', r: 28, r2: 6, h: JET_NEAR_LEN }, at: [0, -NOZZLE_LEN - JET_NEAR_LEN / 2, 0], finish: POWDER, visible: false,
  },
]

const propParts: SpecPart[] = [
  {
    id: 'pan', name: '钢制火盆（道具）', spec: '盛着燃烧的可燃液体',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 165, r2: 205, h: 104, at: [0, 52, 0] },
        { type: 'cylinder', r: 215, h: 6, at: [0, 107, 0] },
        { type: 'cylinder', r: 200, h: 1, at: [0, OIL_Y, 0], fill: 'dark', finish: OIL },
      ],
    },
    at: FIRE, fill: 'shade', finish: 'steel',
  },
  {
    id: 'flame', name: '火焰', parent: 'pan',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 120, r2: 0, h: 420, at: [0, 210, 0] },
        { type: 'cylinder', r: 78, r2: 0, h: 290, at: [-100, 145, 35] },
        { type: 'cylinder', r: 70, r2: 0, h: 250, at: [105, 125, -25] },
        { type: 'cylinder', r: 60, r2: 0, h: 200, at: [20, 100, -115] },
        { type: 'cylinder', r: 66, r2: 0, h: 250, at: [-5, 125, 60], finish: FLAME_CORE },
      ],
    },
    at: [0, OIL_Y + 0.5, 0], fill: 'warm', finish: FLAME,
  },
  {
    id: 'flame-low', name: '火焰（被压下去）', parent: 'pan',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 100, r2: 0, h: 150, at: [0, 75, 0] },
        { type: 'cylinder', r: 60, r2: 0, h: 95, at: [-90, 47.5, 40], finish: FLAME_CORE },
        { type: 'cylinder', r: 55, r2: 0, h: 80, at: [95, 40, -20] },
      ],
    },
    at: [0, OIL_Y + 0.5, 0], fill: 'warm', finish: FLAME, visible: false,
  },
  { id: 'ember-1', name: '余烬', parent: 'pan', shape: { type: 'led', r: 10, color: '#ff5a14' }, at: [50, OIL_Y + 0.7, 60], rot: [-90, 0, 0], visible: false },
  { id: 'ember-2', name: '余烬', parent: 'pan', shape: { type: 'led', r: 8, color: '#ff5a14' }, at: [-80, OIL_Y + 0.7, -40], rot: [-90, 0, 0], visible: false },
  {
    id: 'dist', name: '3 m 距离标线（道具）',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 3000, d: 8, h: 1 },
        { type: 'slab', w: 8, d: 70, h: 1, at: [-1500, 0, 0] },
        { type: 'slab', w: 8, d: 70, h: 1, at: [1500, 0, 0] },
        { type: 'text', text: '3 m', size: 110, at: [0, 1.5, 80], rot: [-90, 0, 0] },
      ],
    },
    at: [0, 0, 340], finish: TAPE, visible: false,
  },
  {
    id: 'wind', name: '风向箭头（道具）',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 600, d: 36, h: 1, at: [-40, 0, 0] },
        { type: 'box', size: [130, 1, 130], at: [300, 0.5, 0], rot: [0, 45, 0] },
        { type: 'text', text: '风向', size: 90, at: [-40, 1.5, 100], rot: [-90, 0, 0] },
      ],
    },
    at: [0, 0, 640], finish: WIND_BLUE, visible: false,
  },
  { id: 'wall', name: '墙面', shape: { type: 'slab', w: 1200, d: 30, h: 1700 }, at: [BRACKET_X, 0, WALL_Z - 15], finish: 'wall' },
  {
    id: 'bracket', name: '灭火器托架', spec: '顶部离地 ≤ 1.5 m · 底部 ≥ 0.08 m',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [90, 170, 5], at: [0, 520, 2.5] },
        { type: 'box', size: [150, 5, 162], at: [0, SEAT_Y - 2.5, 86] },
        { type: 'box', size: [6, 140, 6], at: [-50, 537, 47], rot: [36.5, 0, 0] },
        { type: 'box', size: [6, 140, 6], at: [50, 537, 47], rot: [36.5, 0, 0] },
      ],
    },
    parent: 'wall', at: [0, 0, 15], fill: 'shade', finish: 'zinc',
  },
]

const parts: SpecPart[] = [...extParts, ...propParts]

// ---------- 状态 ----------

const extAt = (at: Vec3, yaw = 0, extra: PartState = {}): PartState => ({ at, rot: [0, yaw, 0], ...extra })
const PIN_PULLED = (base: Vec3, yaw: number): PartState => ({ parent: null, at: add(base, yawed(add(PIN_EXT, [0, 0, 90]), yaw)), rot: [0, yaw, 0], dur: 1.0 })
const FIRE_ON = { ...show('flame'), ...hide('flame-low', 'ember-1', 'ember-2') }
const PROPS_OFF = hide('flame', 'flame-low', 'ember-1', 'ember-2', 'dist', 'wind')
const AT_OP_READY: Record<string, PartState> = {
  ext: extAt(OP, OP_YAW),
  pin: { visible: false },
  ...show('dist', 'wind'),
}

// ---------- 镜头 ----------

const extTop = (at: Vec3, yaw = 0): Vec3 => add(at, yawed([5, 450, 20], yaw))
const KNOW: CameraSpec = { target: [0, 270, 0], dir: [0.5, 0.3, 1], dist: 1550 }
const KNOW_TOP: CameraSpec = { target: [10, 445, 30], dir: [0.35, 0.4, 1], dist: 560 }
const KNOW_LEFT: CameraSpec = { target: [-60, 300, 20], dir: [-0.6, 0.3, 1], dist: 1100 }
const KNOW_FRONT: CameraSpec = { target: [0, 260, 0], dir: [0.1, 0.15, 1], dist: 1250 }

const OVER: CameraSpec = { target: [-400, 380, -250], dir: [0.12, 0.42, 1], dist: 5600 }
const WALL_VIEW: CameraSpec = { target: [-2020, 640, -620], dir: [0.5, 0.3, 1], dist: 2400 }
const HOLD_TOP: CameraSpec = { target: extTop(HOLD1), dir: [0.4, 0.35, 1], dist: 720 }
const GRIP: CameraSpec = { target: [-1380, 420, 60], dir: [0.3, 0.45, 1], dist: 1350 }
const SPRAY: CameraSpec = { target: [0, 320, 0], dir: [0.02, 0.32, 1], dist: 4600 }
const FIRE_VIEW: CameraSpec = { target: [1450, 200, 0], dir: [-0.35, 0.75, 1], dist: 1500 }

const CHECK: CameraSpec = { target: [BRACKET_X, 280, -500], dir: [0.35, 0.3, 1], dist: 1400 }
const CHECK_TOP: CameraSpec = { target: extTop(CHECK_AT), dir: [0.35, 0.4, 1], dist: 620 }
const CHECK_LOW: CameraSpec = { target: [BRACKET_X, 230, -500], dir: [0.35, 0.1, 1], dist: 1300 }

const OP_VIEW: CameraSpec = { target: [-1450, 330, 0], dir: [0.3, 0.4, 1], dist: 1700 }
const NEAR_VIEW: CameraSpec = { target: [1080, 300, 0], dir: [0.12, 0.4, 1], dist: 1700 }

const zoomGauge = (caption: string, dist = 120) => ({ target: 'gauge', dir: [0.1, 0.12, 1] as Vec3, dist, caption })
const zoomPin = (caption: string, dist = 150) => ({ target: 'pin', offset: [0, 0, 22] as Vec3, dir: [0.35, 0.6, 1] as Vec3, dist, caption })

// ---------- 说明书 ----------

export const fireExtinguisherAbc4: ManualSpec = {
  id: 'fire-extinguisher-abc4',
  name: '手提式干粉灭火器 MF/ABC4（4 kg）',
  desc: '认识压力表与保险销，提、拔、握、压四步灭火，每月检查与常见错误',
  category: '安全应急',
  dims: { width: 161, depth: 146, height: 520 },
  source: {
    title: '南京洪湖消防器材制造有限公司《手提式干粉灭火器使用维修手册》',
    url: 'https://cdn.fuwucms.com/a/369156300195/files/20250320092359089.pdf',
    images: [],
  },
  package: [
    { name: '手提式干粉灭火器', qty: 1, spec: 'MF/ABCE4（旧型号 MFZ/ABC4）· 带喷射软管、喷嘴、保险销与铅封' },
    { name: '使用维修手册', qty: 1 },
  ],
  params: [
    { label: '型号', value: 'MF/ABCE4', note: '手册第 2 页参数表；执行标准 GB 4351-2023（产品铭牌）' },
    { label: '灭火级别', value: '2A · 55B · C · E' },
    { label: '药剂充装量', value: '4 ± 0.08 kg' },
    { label: '灭火剂', value: 'ABC 干粉', note: '75% 磷酸二氢铵 + 15% 硫酸铵（公布值）' },
    { label: '有效喷射时间', value: '17 ± 3 s' },
    { label: '驱动气体', value: '氮气' },
    { label: '额定工作压力', value: '1.2 MPa（20 ℃）' },
    { label: '水压试验压力', value: '2.1 MPa' },
    { label: '使用温度', value: '-30 ～ +60 ℃' },
    { label: '外形', value: '约 Ø140 × 520 mm', note: '按产品图比例推断，手册未标注' },
  ],
  parts,
  initial: { ext: extAt(KNOW_AT), ...hide('flame-low', 'ember-1', 'ember-2') },
  stageSize: 2600,
  finishes: { white: 'plastic-white', shade: 'steel', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 认识灭火器 =================
    {
      id: 'know', title: '认识灭火器', kind: 'usage',
      start: { ...PROPS_OFF },
      steps: [
        {
          id: 'k-parts', title: '由瓶体、阀门、压力指示器和喷射软管组成', page: 2,
          desc: '手提式干粉灭火器主要由瓶体、干粉灭火剂、驱动气体、阀门、压力指示器、吸管和喷射软管（喷嘴）组成。阀门开启后，瓶内的干粉在氮气压力作用下经吸管从喷射软管（喷嘴）喷出。',
          camera: KNOW, orbit: true,
          highlight: ['ext'],
          callouts: [
            { part: 'ext', text: '瓶体', sub: '4 kg ABC 干粉 + 氮气', at: [BODY_R, 250, 0], offset: [170, 40, 0] },
            { part: 'ext', text: '阀门', at: [0, 455, 0], offset: [-170, 150, 0] },
            { part: 'gauge', text: '压力指示器', offset: [190, 60, 0] },
            { part: 'pin', text: '保险销', at: [0, 0, 25], offset: [130, 170, 0] },
            { part: 'nozzle', text: '喷射软管 · 喷嘴', at: [0, -40, 0], offset: [-190, -40, 0] },
          ],
        },
        {
          id: 'k-gauge', title: '压力表：指针在绿区才能用', page: 2,
          desc: '额定工作压力 1.2 MPa（20 ℃）。表盘分三段：绿区 1.0–1.4 MPa 为正常；红区 0–1.0 MPa 压力不足，需再充装；黄区 1.4–2.5 MPa 为超压。',
          tip: '色区刻度取自洪湖官网该型号的产品图（表盘印「再充装」「超压」）；手册第 4 页要求压力指示器指示在可工作的压力范围。',
          camera: KNOW_TOP,
          highlight: ['gauge', 'needle'],
          zoom: zoomGauge('指针在绿区 = 压力正常'),
          chips: [{ label: '绿区', sub: '1.0–1.4 MPa 正常' }, { label: '红区', sub: '0–1.0 压力不足' }, { label: '黄区', sub: '1.4–2.5 超压' }],
        },
        {
          id: 'k-pin', title: '保险销和铅封：防止误喷', page: 4,
          desc: '黄色拉环的保险销穿过压把和阀门，把压把锁住；拉环上挂着铅封。铅封、保险销等保险装置应完好，用的时候先拔掉保险销才能压下压把。',
          camera: KNOW_TOP,
          highlight: ['pin', 'seal'],
          zoom: zoomPin('保险销锁住压把 · 铅封完好'),
          callouts: [
            { part: 'pin', text: '保险销', at: [0, 0, 25], offset: [120, 60, 0] },
            { part: 'seal', text: '铅封', at: [0, 0, 4.5], offset: [130, -30, 0] },
          ],
        },
        {
          id: 'k-lever', title: '上面是压把，下面是提把', page: 3,
          desc: '阀门上有两片把手：上面的压把按下到位才会喷射；下面的提把用来提起和握持。手册写作「一手握住灭火器阀门的提压把」。',
          camera: KNOW_TOP,
          highlight: ['lever'],
          callouts: [
            { part: 'lever', text: '压把', sub: '按下 = 喷射', at: [70, 0, 0], offset: [-20, 60, 0] },
            { part: 'ext', text: '提把', sub: '提着走', at: [75, 448, 0], offset: [10, -70, 0] },
          ],
        },
        {
          id: 'k-hose', title: '喷射软管和喷嘴卡在瓶身左侧', page: 2,
          desc: '喷射软管从阀门左侧的接头引出，沿瓶身垂下，喷嘴平时卡在瓶身左侧的腰带卡扣上。使用时取下喷嘴，握紧喷嘴对准火焰根部。',
          tip: '江苏省消防救援总队：一般 4 公斤以上的灭火器都必须配备软管，且软管长度不得低于 40 cm。',
          camera: KNOW_LEFT,
          highlight: ['hose', 'nozzle', 'hose-nut'],
          callouts: [
            { part: 'hose-nut', text: '软管接头', offset: [-130, 60, 0] },
            { part: 'nozzle', text: '喷嘴', sub: '卡在腰带上', at: [0, -40, 0], offset: [-140, -30, 0] },
          ],
        },
        {
          id: 'k-class', title: '看铭牌：A、B、C、E 类火都能扑救', page: 2,
          desc: 'ABC 干粉灭火器能扑救一般固体物质（A）、可燃液体（B）、可燃气体和蒸气（C）的初起火灾；干粉电绝缘性能好，还能在 1 m 以外扑救电压不超过 1000 V 的带电设备（E）。',
          tip: '干粉喷射后有细小颗粒残留，精密仪器、仪表场所不适用（手册第 3 页）。尤溪县消防救援大队：D 类金属火灾不能用它，一般用沙土覆盖。',
          camera: KNOW_FRONT,
          highlight: ['ext'],
          callouts: [{ part: 'ext', text: '铭牌', sub: '适用火灾类别 · 操作说明', at: [0, 260, BODY_R], offset: [190, 60, 0] }],
          chips: [{ label: 'A', sub: '固体' }, { label: 'B', sub: '可燃液体' }, { label: 'C', sub: '气体 / 蒸气' }, { label: 'E', sub: '带电 · 1 m 外 ≤ 1000 V' }],
        },
      ],
    },

    // ================= 使用方法 =================
    {
      id: 'use', title: '使用方法：提、拔、握、压', kind: 'usage',
      start: { ext: extAt(ON_BRACKET), ...FIRE_ON, ...hide('dist', 'wind') },
      steps: [
        {
          id: 'u-fire', title: '发现初起火情，就近取灭火器', page: 3,
          desc: '火盆里的可燃液体着火了。灭火器挂在墙上的托架上，离火有一段距离。发现火情要迅速取用灭火器扑救初起火灾。',
          tip: '国家消防救援局：牢记「救早灭小」，若火势较大一定要尽快撤离，并及时报警。',
          camera: OVER,
          highlight: ['flame', 'ext'],
          callouts: [
            { part: 'flame', text: '初起火', sub: '火盆里的可燃液体', at: [0, 420, 0], offset: [0, 280, 0] },
            { part: 'ext', text: '灭火器', sub: '墙上托架', at: [0, H, 0], offset: [0, 420, 0] },
          ],
        },
        {
          id: 'u-lift', title: '提起灭火器，保持直立', page: 3,
          desc: '握住下面的提把，把灭火器从托架上提下来，保持瓶身直立（瓶身操作说明第 ① 条：直立灭火器）。',
          tip: '应急管理部：使用灭火器前应先上下摇晃几次，使干粉松动。',
          camera: WALL_VIEW,
          set: { ext: extAt(HOLD1, 0, { via: OFF_BRACKET_VIA, dur: 1.8 }) },
          actions: [{ type: 'shake', part: 'ext', axis: 'y', amp: 14, delay: 2.0 }],
          highlight: ['ext'],
        },
        {
          id: 'u-pin', title: '迅速拔出保险销', page: 3,
          desc: '拉住黄色拉环，把保险销整根拔出来，铅封随之拉断。拔掉保险销后压把才能按下去。',
          camera: HOLD_TOP,
          set: { pin: PIN_PULLED(HOLD1, 0) },
          highlight: ['pin', 'seal'],
          zoom: { target: 'lever', offset: [20, 0, 40], dir: [0.4, 0.5, 1], dist: 200, caption: '拔掉保险销，铅封拉断' },
        },
        {
          id: 'u-move', title: '移到上风位置，离火 3 m', page: 3,
          desc: '提着灭火器移动到上风位置、距离火源 3 m 处，让风把干粉吹向火焰，烟和热气吹离自己。',
          tip: '国家消防救援局：一定站在上风口灭火。应急管理部：灭火时要背对逃生通道方向，站在上风口。',
          camera: OVER,
          set: { ext: extAt(OP, OP_YAW, { lift: 60, dur: 2.2 }), pin: { visible: false, dur: 0.3 }, ...show('dist', 'wind') },
          highlight: ['ext', 'dist', 'wind'],
          callouts: [
            { part: 'dist', text: '3 m', sub: '到火源的距离', at: [-700, 0, 0], offset: [0, 260, 0] },
            { part: 'wind', text: '风向', sub: '人在上风', at: [260, 0, 0], offset: [0, 300, 0] },
          ],
          chips: [{ label: '3 m', sub: '离火距离' }, { label: '上风位置' }],
        },
        {
          id: 'u-grip', title: '一手握提压把，一手握喷嘴对准火焰根部', page: 3,
          desc: '一手握住灭火器阀门的提压把，另一手从卡扣上取下喷嘴、握紧喷射软管的喷嘴，对准火焰根部。',
          camera: GRIP,
          set: { nozzle: nozzleAt(AIM_ROOT, { dur: 1.5 }) },
          highlight: ['nozzle', 'hose'],
          callouts: [{ part: 'nozzle', text: '喷嘴对准火焰根部', at: [0, -70, 0], offset: [60, 150, 0] }],
        },
        {
          id: 'u-press', title: '按下压把，必须压到位', page: 3,
          desc: '用力按下压把直到压到位，阀门开启，干粉从喷嘴喷向火焰根部。',
          camera: SPRAY,
          set: { lever: { rot: LEVER_DOWN, dur: 0.6 }, jet: { visible: true, delay: 0.6 } },
          highlight: ['lever', 'jet'],
          zoom: { target: 'lever', offset: [0, 0, -40], dir: [-1, 0.45, 0.25], dist: 260, caption: '压把压到位 = 开始喷射' },
          chips: [{ label: '有效喷射时间', sub: '17 ± 3 s' }, { label: '药剂', sub: '4 ± 0.08 kg' }],
        },
        {
          id: 'u-sweep', title: '对准火焰根部左右扫射，不要冲击液面', page: 3,
          desc: '可燃液体在容器里燃烧时，应对准火焰根部左右晃动扫射，不可直接冲击液面，以防液体飞溅、造成灭火困难。火焰被一点点压下去。',
          tip: '若可燃液体流淌燃烧，应对准火焰根部由近而远、左右扫射，向前快速推进，直到火焰全部扑灭（手册第 3 页）。',
          camera: SPRAY,
          set: { flame: { visible: false, delay: 2.4, dur: 0.1 }, 'flame-low': { visible: true, delay: 2.6 } },
          actions: [{ type: 'shake', part: 'nozzle', axis: 'z', amp: 55 }],
          highlight: ['nozzle', 'jet', 'flame-low'],
          callouts: [{ part: 'pan', text: '左右扫射火焰根部', at: [0, 120, 0], offset: [-150, 450, 0] }],
        },
        {
          id: 'u-corner', title: '注意死角，以免复燃', page: 3,
          desc: '火焰压灭后继续根据火情来回扫射，照顾到火盆边缘等死角，直到余烬熄灭，以免复燃。',
          camera: FIRE_VIEW,
          set: { 'flame-low': { visible: false, dur: 0.6 }, ...show('ember-1', 'ember-2'), 'ember-1': { visible: true, light: 'blinkThenOff', color: '#ff5a14', delay: 0.6 }, 'ember-2': { visible: true, light: 'blinkThenOff', color: '#ff5a14', delay: 0.6 } },
          actions: [{ type: 'shake', part: 'nozzle', axis: 'z', amp: 55 }],
          highlight: ['ember-1', 'ember-2', 'pan'],
          callouts: [{ part: 'pan', text: '盆沿死角', sub: '余烬要扫灭', at: [-200, 110, 0], offset: [-120, 220, 0] }],
        },
        {
          id: 'u-after', title: '火灭后松开压把，用过的灭火器送修', page: 3,
          desc: '确认火焰全部扑灭后松开压把，喷射停止。灭火器只能一次性使用：一经开启就不再密封，不论喷出多少都必须送维修单位维修。',
          tip: '贮压式灭火器严禁非专业人员随意拆卸（手册第 3 页）。',
          camera: OP_VIEW,
          set: { lever: { rot: LEVER_UP, dur: 0.6 }, jet: { visible: false, dur: 0.6 }, ...hide('ember-1', 'ember-2') },
          highlight: ['lever'],
          zoom: { target: 'lever', offset: [0, 0, -40], dir: [-1, 0.45, 0.25], dist: 260, caption: '松开压把 = 停止喷射' },
          chips: [{ label: '一经开启', sub: '必须送维修单位' }],
        },
      ],
    },

    // ================= 检查与保养 =================
    {
      id: 'check', title: '每月检查与保养', kind: 'usage',
      start: { ext: extAt(ON_BRACKET), ...PROPS_OFF },
      steps: [
        {
          id: 'c-month', title: '每个月定期检查一次', page: 4,
          desc: '灭火器的检查和维护由经过培训的人员承担，每个月定期检查一次。把灭火器从托架上取下来，放在地上逐项看。',
          camera: CHECK,
          set: { ext: extAt(CHECK_AT, 0, { via: OFF_BRACKET_VIA, dur: 1.8 }) },
          highlight: ['ext'],
          chips: [{ label: '每月一次' }, { label: '经培训的人员' }],
        },
        {
          id: 'c-green', title: '看压力表：指针在绿区', page: 4,
          desc: '压力指示器应指示在可工作的压力范围内，也就是指针落在绿区（1.0–1.4 MPa）。表盘外观应无变形、破损、断裂。',
          camera: CHECK_TOP,
          highlight: ['gauge', 'needle'],
          zoom: zoomGauge('指针在绿区 = 合格'),
          chips: [{ label: '绿区', sub: '1.0–1.4 MPa' }, { label: '额定', sub: '1.2 MPa（20 ℃）' }],
        },
        {
          id: 'c-red', title: '指针在红区：压力不足，送修', page: 5,
          desc: '指针掉进红区说明驱动气体压力不足，多半有泄漏，喷不出足够的干粉。灭火剂泄漏的灭火器应及时送维修单位维修、再充装。',
          tip: '表盘红区印着「再充装」（洪湖官网产品图）。应急管理部：要定期检查，看是否过期或者压力不足。',
          camera: CHECK_TOP,
          set: { needle: needle(0.6) },
          highlight: ['needle'],
          zoom: zoomGauge('红区 = 压力不足，送修再充装'),
        },
        {
          id: 'c-yellow', title: '指针在黄区：超压，送修', page: 4,
          desc: '指针在黄区（1.4–2.5 MPa）表示压力超出正常范围，同样不在可工作的压力范围，应送维修单位检查。',
          tip: '六安市消防救援支队：指针在黄色区域属于压力过高，超出太多有爆炸风险，应及时维修。',
          camera: CHECK_TOP,
          set: { needle: needle(1.9) },
          highlight: ['needle'],
          zoom: zoomGauge('黄区 = 超压，送修'),
        },
        {
          id: 'c-seal', title: '铅封、保险销完好', page: 4,
          desc: '铅封、保险销等保险装置应完好：保险销插到底，铅封没有断开或缺失。（指针回到绿区，演示正常的灭火器。）',
          camera: CHECK_TOP,
          set: { needle: needle(1.2) },
          highlight: ['pin', 'seal'],
          zoom: zoomPin('铅封、保险销完好'),
        },
        {
          id: 'c-hose', title: '喷射软管、喷嘴无龟裂变形', page: 4,
          desc: '喷射软管、喷嘴应完好，无明显龟裂、变形、损坏；接头没有松动。软管和喷嘴是易损关键零部件，坏了要由维修机构更换原型号配件。',
          camera: { target: [BRACKET_X - 70, 300, -480], dir: [-0.6, 0.3, 1], dist: 1000 },
          actions: [{ type: 'shake', part: 'nozzle', axis: 'x', amp: 3 }],
          highlight: ['hose', 'nozzle'],
          zoom: { target: 'nozzle', offset: [0, -30, 0], dir: [-0.7, 0.2, 1], dist: 170, caption: '软管、喷嘴无龟裂' },
        },
        {
          id: 'c-body', title: '瓶体、阀门无锈蚀磕伤，铭牌清晰', page: 4,
          desc: '阀门无变形、锈蚀、裂纹；瓶体无明显磕伤、划伤、锈蚀（特别是瓶底和焊缝）和泄漏，钢印等永久性标志清晰；铭牌完整、清晰可辨。',
          camera: CHECK_LOW,
          highlight: ['ext'],
          callouts: [
            { part: 'ext', text: '瓶底、焊缝', sub: '查锈蚀', at: [0, 20, BODY_R], offset: [-200, 40, 0] },
            { part: 'ext', text: '铭牌', sub: '完整清晰', at: [0, 260, BODY_R], offset: [190, 40, 0] },
            { part: 'ext', text: '阀门', sub: '无变形裂纹', at: [0, 450, 0], offset: [-170, 70, 0] },
          ],
        },
        {
          id: 'c-life', title: '出厂满 3 年首次维修，之后最长 2 年', page: 5,
          desc: '灭火器自出厂日起满 3 年应首次维修；维修出厂后最长使用 2 年。永久性标志不能识别、瓶体被火烧过、涂层脱落超过 1/3、瓶底圈有腐蚀凹坑、达到最高报废年限等情况，应报废更换。',
          tip: '湖南省消防救援总队答复：干粉灭火器出厂 5 年首次维修、之后每 2 年检修，强制报废年限 10 年。当地消防要求更严时按当地执行。',
          camera: CHECK,
          highlight: ['ext'],
          chips: [{ label: '首次维修', sub: '出厂满 3 年' }, { label: '维修后', sub: '最长 2 年' }, { label: '涂层脱落 > 1/3', sub: '报废' }, { label: '瓶体被火烧过', sub: '报废' }],
        },
        {
          id: 'c-back', title: '放回原位：铭牌朝外、阀门向上', page: 3,
          desc: '检查后按原设置点放回托架：铭牌朝外、阀门向上，稳固、便于取用、不影响安全疏散。托架安装高度要让灭火器顶部离地不大于 1.5 m、底部离地不小于 0.08 m。',
          tip: '存放在通风干燥处，严禁火烤、避免日光暴晒（手册第 3 页）。应急管理部：不可放在卫生间或者暖气上。',
          camera: WALL_VIEW,
          set: { ext: extAt(ON_BRACKET, 0, { via: OFF_BRACKET_VIA, dur: 1.8 }) },
          highlight: ['ext', 'bracket'],
          chips: [{ label: '顶部离地', sub: '≤ 1.5 m' }, { label: '底部离地', sub: '≥ 0.08 m' }],
        },
      ],
    },

    // ================= 常见错误 =================
    {
      id: 'mistakes', title: '常见错误', kind: 'repair',
      start: { ...AT_OP_READY, ...FIRE_ON },
      steps: [
        {
          id: 'm-flat', title: '✗ 放平或倒着用', page: 3,
          desc: '灭火器必须直立操作，不可放平或倒置使用。瓶内的干粉要经吸管才能喷出，放倒后喷不出灭火剂。',
          camera: OP_VIEW,
          set: { ext: LYING },
          highlight: ['ext'],
          callouts: [{ part: 'ext', text: '✗ 不可放平 / 倒置', at: [0, 300, 0], offset: [0, 260, 0] }],
        },
        {
          id: 'm-upright', title: '✓ 立起来，直立操作', page: 3,
          desc: '把灭火器扶正，提着提把保持直立，再按使用方法操作。',
          camera: OP_VIEW,
          set: { ext: extAt(OP, OP_YAW, { lift: 90, dur: 1.6 }) },
          highlight: ['ext'],
        },
        {
          id: 'm-high', title: '✗ 对着火焰上部、中部喷', page: 3,
          desc: '干粉喷向火焰上部或中部，只是穿过火苗、浪费灭火剂，火压不下去。',
          tip: '聊城经济技术开发区消防救援大队：对准火焰中部、上部只是浪费灭火剂，应该对准火焰的根部。',
          camera: SPRAY,
          set: { nozzle: nozzleAt(AIM_HIGH, { dur: 1.4 }), lever: { rot: LEVER_DOWN, dur: 0.6, delay: 1.4 }, jet: { visible: true, delay: 2.0 } },
          highlight: ['nozzle', 'jet'],
          callouts: [{ part: 'flame', text: '✗ 对准上部', sub: '浪费灭火剂', at: [0, 330, 0], offset: [0, 350, 0] }],
        },
        {
          id: 'm-root', title: '✓ 对准火焰根部扫射', page: 3,
          desc: '喷嘴压低，对准火焰根部左右扫射，火焰很快被压下去。',
          camera: SPRAY,
          set: { nozzle: nozzleAt(AIM_ROOT, { dur: 1.0 }), flame: { visible: false, delay: 2.2, dur: 0.1 }, 'flame-low': { visible: true, delay: 2.4 } },
          actions: [{ type: 'shake', part: 'nozzle', axis: 'z', amp: 55, delay: 1.1 }],
          highlight: ['nozzle', 'jet'],
          callouts: [{ part: 'pan', text: '✓ 对准根部', at: [-150, 120, 0], offset: [-120, 420, 0] }],
        },
        {
          id: 'm-near', title: '✗ 凑得太近、直冲液面', page: 3,
          desc: '容器里的液体着火时，不可把干粉直接冲向液面：冲击会让燃烧的液体飞溅，火反而扩大、更难扑灭。应站在 3 m 处对准火焰根部左右晃动扫射。',
          camera: NEAR_VIEW,
          set: {
            jet: { visible: false, dur: 0.2 },
            ext: extAt(NEAR, OP_YAW, { delay: 0.3, dur: 2.0 }),
            nozzle: nozzleAt(AIM_SPLASH, { delay: 0.3, dur: 2.0 }),
            'flame-low': { visible: false, delay: 2.3, dur: 0.1 },
            flame: { visible: true, delay: 2.5 },
            'jet-near': { visible: true, delay: 2.3 },
          },
          highlight: ['nozzle', 'jet-near', 'flame'],
          callouts: [{ part: 'pan', text: '✗ 冲击液面', sub: '液体飞溅', at: [-150, 110, 0], offset: [-80, 480, 0] }],
        },
        {
          id: 'm-rehang', title: '✗ 喷过一下就挂回去', page: 3,
          desc: '灭火器只能一次性使用：一经开启就不再密封，哪怕只喷了一下也必须送维修单位维修，不能直接挂回原处备用。保险销没了、铅封断了，就说明它被开启过。',
          tip: '被开启使用过的灭火器应及时维修（手册第 5 页）。',
          camera: WALL_VIEW,
          set: {
            'jet-near': { visible: false, dur: 0.2 },
            lever: { rot: LEVER_UP, dur: 0.5 },
            nozzle: { ...STOWED, via: add(NEAR, yawed([-125, 330, 10], OP_YAW)), delay: 0.3, dur: 1.4 },
            ...hide('flame', 'dist', 'wind'),
            ext: extAt(ON_BRACKET, 0, { via: OFF_BRACKET_VIA, delay: 1.8, dur: 2.4 }),
          },
          highlight: ['ext', 'lever'],
          callouts: [{ part: 'lever', text: '✗ 保险销、铅封已没有', sub: '已开启 = 必须送修', at: [30, 0, 0], offset: [260, -120, 0] }],
        },
      ],
    },
  ],
}
