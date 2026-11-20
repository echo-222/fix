import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { CameraSpec, Callout, Fill, Finish, ManualSpec, PartState, Shape, SpecPart, SpecStep, Vec3 } from '../types'

/**
 * IKEA MALM 马尔姆 三斗抽屉柜（白色 80×48×78 cm，货号 903.546.43）
 * 说明书两份：柜体 AA-1971367-9（24 页，步骤 1–26）+ 抽屉 AA-1971377-2（8 页，步骤 1–9，每个抽屉做一遍）
 * 逐页转写：manuals-src/ikea-malm/transcript.md
 *
 * 场景：地面 y=0，观众在 +Z。墙面在 z = -420（只在「固定到墙上」之后出现）。
 * 柜体坐标 C：原点 = 立好的柜子底面中心，x 右、y 上、z 前（抽屉面板朝 +z）。
 *   所有柜体板件的几何直接写在 C 里，装好 = { parent: 'side-r', at: 0, rot: 0 }，
 *   整个柜子跟着右侧板（根零件）平放 / 立起 / 正面朝下 / 靠墙。
 *   平放 LIE：右侧板贴地、内面朝上、顶端朝 +x，C(x,y,z) → 世界 (-390+y, 395-x, z)，从 -z 方向看 = 说明书第 6–13 页视角。
 * 抽屉坐标 D：原点 = 抽屉面板底边中点的外表面，x 右、y 上、z 前（箱体在 -z）。
 *   装进柜子 = { parent: 'side-r', at: [0, 面板底边, 235] }。
 * 五金（偏心螺栓、木榫、钉子、螺丝）只画露在板外的一截，对接件落位到 ≈60% 时隐藏 = 「插进去了」。
 * 螺丝刀 / 铅笔的原点在尖端、局部 +y 指向手柄；够顶层（锁紧件、墙螺丝比顶层抽屉口高 ~10 mm）时
 * 工具略向下倾斜，从顶层抽屉口沿自身轴线伸进去（途经点按二次贝塞尔反推，见 reach）。
 * 推断尺寸（说明书只有图）：板厚 16、顶板 25、背板 3；塑料脚 5；底座前板高 80；抽屉面板 218 高、缝 3；
 * 前档高 45；抽屉侧板 140×440×12；防倾倒角码 x = ±300。依据见 transcript.md E 节。
 * 真实外观：板件本身就是规整的盒子，所以不用照片生成模型，只给材质（spec.finishes 按 fill，个别零件 / 子项单独写 finish）：
 *   白色饰面板、纤维板背板与抽屉底、白色塑料滑轨、镀锌五金、原木木榫和铅笔。
 */

// ---------- 小工具 ----------
type Item = Shape & { at?: Vec3; rot?: Vec3; fill?: Fill; finish?: Finish }
type Pose = { at: Vec3; rot: Vec3 }
const D2R = Math.PI / 180
const ZERO: Vec3 = [0, 0, 0]
const round = (v: number) => Math.round(v * 100) / 100
const quat = (rot: Vec3) => new Quaternion().setFromEuler(new Euler(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'XYZ'))
const euler = (q: Quaternion): Vec3 => {
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return [round(e.x / D2R), round(e.y / D2R), round(e.z / D2R)]
}
/** 局部点 p 在姿态 pose 下的世界坐标 */
const w = (pose: Pose, p: Vec3): Vec3 => {
  const v = new Vector3(...p).applyQuaternion(quat(pose.rot)).add(new Vector3(...pose.at))
  return [round(v.x), round(v.y), round(v.z)]
}
/** 局部 x / y / z 轴分别朝世界哪个方向 → 欧拉角 */
const basis = (x: Vec3, y: Vec3, z: Vec3): Vec3 =>
  euler(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(...x), new Vector3(...y), new Vector3(...z))))
/** 几何上的点 c（局部）落到世界 p 时零件的 at */
const placeAt = (c: Vec3, p: Vec3, rot: Vec3): Vec3 => {
  const v = new Vector3(...c).applyQuaternion(quat(rot))
  return [round(p[0] - v.x), round(p[1] - v.y), round(p[2] - v.z)]
}
/** 让局部 +y 指向 d（工具从尖端指向手柄） */
const aim = (d: Vec3): Vec3 => euler(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...d).normalize()))
/** 二次贝塞尔控制点 c → k=0.5 的途经点（via 作用在零件原点上） */
const viaC = (from: Vec3, to: Vec3, c: Vec3): Vec3 => [0, 1, 2].map((i) => round(0.25 * from[i] + 0.5 * c[i] + 0.25 * to[i])) as Vec3
/** 从 from 飞到 to、最后一段沿 d 反方向直线伸进去（控制点 = to + len·d） */
const reach = (from: Vec3, to: Vec3, d: Vec3, len: number): Vec3 => {
  const c = new Vector3(...to).addScaledVector(new Vector3(...d).normalize(), len)
  return viaC(from, to, [c.x, c.y, c.z])
}
/** 板件原点离几何很远：让几何中心 c（局部）在过渡一半时经过世界点 g，换算成原点的途经点 */
const viaAt = (c: Vec3, rotFrom: Vec3, rotTo: Vec3, g: Vec3): Vec3 => {
  const v = new Vector3(...c).applyQuaternion(quat(rotFrom).slerp(quat(rotTo), 0.5))
  return [round(g[0] - v.x), round(g[1] - v.y), round(g[2] - v.z)]
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
/** 几何中心 c 的轨迹用控制点 ctl 的二次曲线（from / to 是世界姿态），换算成原点 via */
const flyG = (c: Vec3, from: Pose, to: Pose, ctl: Vec3): Vec3 => viaAt(c, from.rot, to.rot, viaC(w(from, c), w(to, c), ctl))

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill?: Fill): Item => ({
  type: 'box',
  size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
  at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  ...(fill ? { fill } : {}),
})
const cyl = (axis: 'x' | 'y' | 'z', r: number, h: number, at: Vec3, fill?: Fill, r2?: number): Item => ({
  type: 'cylinder', axis, r, h, at, ...(r2 !== undefined ? { r2 } : {}), ...(fill ? { fill } : {}),
})
/** 圆形面片（锁紧件端面、钉头、孔） */
const disc = (r: number, at: Vec3, rot: Vec3, fill: Fill = 'dark'): Item => ({ type: 'hole', w: 2 * r, h: 2 * r, r, at, rot, fill })
const comp = (items: Item[]): Shape => ({ type: 'compound', items })
/** 只影响真实外观模式 */
const fin = (finish: Finish, items: Item[]): Item[] => items.map((it) => ({ ...it, finish }))
const show = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
/** 五金从偏移位置落到 0 */
const seat = (delay = 0, dur = 0.6): PartState => ({ visible: true, at: ZERO, delay, dur })
/** 在 t 秒时消失（插进对接件里） */
const gone = (t: number): PartState => ({ visible: false, delay: t, dur: 0.05 })
const DRAWER_CHIP = { label: '抽屉说明书', sub: 'AA-1971377-2' }

// ---------- 尺寸（柜体坐标 C，mm） ----------
const IN = 379
const OUT = 395
/** 三个抽屉面板底边：上 / 中 / 下 */
const FB = [530, 309, 88]
/** 三根前档 y 范围：上 / 中 / 下 */
const RAILS: [number, number][] = [[710, 755], [506, 551], [285, 330]]
const RAIL_Z: [number, number] = [199, 217]
const railMid = (i: number) => (RAILS[i][0] + RAILS[i][1]) / 2
/** 防倾倒：角码 x、墙上孔位 y（落在角码长孔 708–745 内、比顶层抽屉口 710 略高） */
const ANCHOR = { x: 300, y: 718 }
const CZ = -178
const WALL_FACE = -420

// ---------- 柜体姿态 ----------
const LIE: Pose = { at: [-390, 395, 0], rot: [0, 0, -90] }
const UPRIGHT: Pose = { at: ZERO, rot: ZERO }
const FACE: Pose = { at: [0, 240, -390], rot: [90, 0, 0] }
const AT_WALL: Pose = { at: [0, 0, CZ], rot: ZERO }
const ASIDE: Pose = { at: [900, 0, CZ], rot: ZERO }
const ON_R: PartState = { parent: 'side-r', at: ZERO, rot: ZERO }
const lie = (p: Vec3) => w(LIE, p)
const wall = (p: Vec3) => w(AT_WALL, p)
const face = (p: Vec3) => w(FACE, p)

// ---------- 抽屉姿态 ----------
const D_STAND: Pose = { at: [0, 0, 150], rot: [90, 0, 0] }
const D_CARTON: Pose = { at: [870, 273, 130], rot: [180, 0, 0] }
const stand = (p: Vec3) => w(D_STAND, p)
const carton = (p: Vec3) => w(D_CARTON, p)

// ---------- 工具原位（左前方地面） ----------
const SD_HOME: Pose = { at: [-650, 14, 480], rot: [90, 0, 0] }
const PEN_HOME: Pose = { at: [-720, 4, 480], rot: [90, 0, 0] }
const HAM_HOME: Pose = { at: [-1150, 14, 700], rot: [90, 0, 0] }
const DRILL_HOME: Pose = { at: [-1000, 35, 420], rot: [0, 0, 90] }
const home = (p: Pose, via: Vec3, delay = 0, dur = 1.4): PartState => ({ at: p.at, rot: p.rot, via, delay, dur })

// ---------- 零件几何 ----------
const sideShape = (s: 1 | -1): Shape => comp([
  bx(s * IN, s * OUT, 5, 755, -235, 235),
  ...FB.flatMap((fb): Item[] => fin('plastic-white', [
    bx(s * 372.5, s * IN, fb + 22, fb + 46, -225, 195, 'shade'),
    cyl('x', 8, 6, [s * 374.5, fb + 34, 185], 'shade'),
  ])),
  // 顶板的 4 个锁紧件在侧板内面
  ...[-150, 150].map((z) => disc(7.5, [s * (IN - 0.1), 721, z], [0, -s * 90, 0])),
])
const railsShape = comp([
  ...RAILS.map(([y0, y1]) => bx(-IN, IN, y0, y1, RAIL_Z[0], RAIL_Z[1])),
  ...RAILS.flatMap(([y0, y1]) => [-1, 1].map((s) => disc(7.5, [s * 345, (y0 + y1) / 2 + 11, RAIL_Z[0] - 0.1], [0, 180, 0]))),
])
const plateShape = (y0: number, y1: number, z1: number) => comp([
  bx(-IN, IN, y0, y1, -235, z1),
  ...[-1, 1].map((s) => disc(7.5, [s * 345, y1 + 0.1, -10], [-90, 0, 0])),
])
const BACK_Z: [number, number] = [-238, -235]
const backShape = comp([
  bx(-393, 393, 8, 690, ...BACK_Z),
  bx(-393, -330, 690, 745, ...BACK_Z),
  bx(-270, 270, 690, 745, ...BACK_Z),
  bx(330, 393, 690, 745, ...BACK_Z),
])
const NAILS: [number, number][] = [
  [-387, 20], [387, 20], [-387, 250], [387, 250], [-387, 480], [387, 480], [-387, 680], [387, 680],
  [-200, 93], [200, 93], [-200, 306], [200, 306], [-360, 737], [360, 737], [-150, 737], [150, 737],
]
/** 零件自身转 180° 让 +Z 朝柜背外侧（审计按零件 +Z 判断平面件朝向），所以 z 取正 */
const nailsShape = comp(NAILS.map(([x, y]) => disc(2.5, [x, y, 238.6], ZERO)))

/** 侧板内面伸出的偏心螺栓（螺杆 + 头），s = 1 右侧板 */
const boltX = (s: 1 | -1, y: number, z: number): Item[] => [
  cyl('x', 3.5, 14, [s * 372, y, z], 'shade'),
  cyl('x', 5, 6, [s * 362, y, z], 'shade'),
]
const RAIL_BOLTS = (s: 1 | -1) => RAILS.flatMap((_, i) => boltX(s, railMid(i) + 11, 208))
const PLATE_JOINTS = { bottom: 93, mid: 306 }
/** 横板 / 前档端面伸出的木榫，s = 1 伸向右侧板 */
const dowelX = (s: 1 | -1, y: number, z: number): Item => cyl('x', 4, 12, [s * 385, y, z], 'warm')
const plateDowels = (s: 1 | -1, y: number) => comp([dowelX(s, y, -150), dowelX(s, y, 130)])

const feetSide = (s: 1 | -1) => comp([[-215, -165], [165, 215]].map(([z0, z1]) => bx(s * 381, s * 393, 0, 5, z0, z1, 'shade')))
const feetPlinth = comp([[-340, -290], [290, 340]].map(([x0, x1]) => bx(x0, x1, 0, 5, 218, 230, 'shade')))
const bracketsShape = comp([-1, 1].flatMap((s): Item[] => [
  bx(s * 339, s * IN, 15, 75, 213, 215, 'shade'),
  bx(s * 377, s * IN, 15, 75, 175, 215, 'shade'),
  cyl('z', 4, 2, [s * 355, 30, 212], 'dark'), cyl('z', 4, 2, [s * 355, 60, 212], 'dark'),
  cyl('x', 4, 2, [s * 376, 30, 195], 'dark'), cyl('x', 4, 2, [s * 376, 60, 195], 'dark'),
]))
/** 防倾倒角码 106989：水平脚拧在顶板底面，竖直脚带长孔贴在柜背后 */
const wallBracketsShape = comp([-ANCHOR.x, ANCHOR.x].flatMap((x): Item[] => [
  bx(x - 20, x + 20, 752, 755, -240, -200, 'shade'),
  bx(x - 20, x - 10, 700, 755, -242, -240, 'shade'),
  bx(x + 10, x + 20, 700, 755, -242, -240, 'shade'),
  bx(x - 10, x + 10, 700, 708, -242, -240, 'shade'),
  bx(x - 10, x + 10, 745, 755, -242, -240, 'shade'),
  cyl('y', 7, 1, [x, 751.5, -218], 'shade'),
  cyl('y', 4.5, 3, [x, 749.5, -218], 'dark'),
]))

// ---------- 抽屉（D 坐标） ----------
const runnerItems = (s: 1 | -1): Item[] => [
  ...fin('plastic-white', [bx(s * 365, s * 367, 28, 42, -450, -24, 'shade'), cyl('x', 8, 4, [s * 369.5, 34, -440], 'shade')]),
  ...[-400, -240, -80].map((z) => cyl('x', 3, 1, [s * 367.5, 36, z], 'dark')),
]
const rodItems = (): Item[] => [
  bx(-7, 7, 33, 39, -454, -20, 'shade'),
  cyl('y', 3.5, 2, [0, 32, -440], 'dark'),
  cyl('y', 3.5, 2, [0, 32, -34], 'dark'),
]
const D_FRONT = bx(-377, 377, 0, 218, -16, 0)
const D_SIDE = (s: 1 | -1) => bx(s * 353, s * 365, 33, 173, -456, -16)
const D_BACK = bx(-353, 353, 42, 165, -456, -444)
const D_BOTTOM: Item = { ...bx(-353, 353, 39, 42, -456, -18), finish: 'fiberboard' }
const drawerShape = comp([D_FRONT, D_SIDE(-1), D_SIDE(1), D_BACK, D_BOTTOM, ...runnerItems(-1), ...runnerItems(1), ...rodItems()])
const dSideShape = (s: 1 | -1) => comp([
  D_SIDE(s),
  ...[60, 146].map((y) => disc(7.5, [s * 365.1, y, -50], [0, s * 90, 0])),
])
const DRAWER_FB: Record<string, number> = { 'drawer-2': FB[1], 'drawer-3': FB[2] }
/** 抽屉对准滑轨的位置：面板在柜前 525 mm，整个箱体都在柜外 */
const ALIGN_Z = 760

// ---------- 墙（墙局部：中心 (0, 650, -450)，正面 z = +30） ----------
const WALL_C: Vec3 = [0, 650, WALL_FACE - 30]
const WY = ANCHOR.y - WALL_C[1]
const anchors = (f: (x: number) => Item[]) => comp([-ANCHOR.x, ANCHOR.x].flatMap(f))

// ---------- 工具 ----------
const TOOL_BODY: Finish = { color: '#2f6f8f', roughness: 0.5 }
const screwdriverShape = comp([
  { ...cyl('y', 3, 110, [0, 55, 0], 'shade'), finish: 'steel' },
  { ...cyl('y', 14, 110, [0, 165, 0], 'warm', 12), finish: { color: '#c8372d', roughness: 0.45 } },
])
const pencilShape = comp([
  { ...cyl('y', 0.8, 16, [0, 8, 0], 'dark', 4), finish: 'plastic-black' },
  cyl('y', 4, 160, [0, 96, 0], 'warm'),
])
const hammerShape = comp([
  { type: 'box', size: [28, 100, 28], at: [0, 50, 0], fill: 'shade', finish: 'steel' },
  cyl('x', 12, 300, [164, 60, 0], 'warm'),
])
const drillShape = comp([
  ...fin('steel', [cyl('z', 4, 70, [0, 0, 35], 'shade'), cyl('z', 16, 40, [0, 0, 90], 'shade')]),
  { type: 'box', size: [70, 80, 190], at: [0, 0, 205], finish: TOOL_BODY },
  { type: 'box', size: [44, 130, 56], at: [0, -95, 240], finish: TOOL_BODY },
  { type: 'box', size: [70, 30, 90], at: [0, -170, 245], fill: 'shade', finish: 'plastic-black' },
])

// ---------- 五金托盘（清点用） ----------
const bag = (x0: number, x1: number, z0: number, z1: number): Item => ({ type: 'slab', w: x1 - x0, d: z1 - z0, h: 1, r: 10, at: [(x0 + x1) / 2, 0, (z0 + z1) / 2], fill: 'warm', finish: 'paper' })
const tray1Shape = comp([
  bag(-150, 150, -100, 100),
  cyl('x', 3.5, 22, [-87, 6, -50], 'shade'), cyl('x', 5, 6, [-101, 6, -50], 'shade'),
  cyl('x', 4, 30, [0, 5, -50], 'warm'),
  cyl('y', 7.5, 12, [95, 7, -50], 'shade'), { type: 'hole', w: 9, h: 2, at: [95, 13.1, -50], rot: [-90, 0, 0], fill: 'dark' },
  cyl('x', 2, 12, [-88, 5.5, 50], 'shade'), cyl('x', 4.5, 2.5, [-95.25, 5.5, 50], 'shade'),
  bx(-20, 20, 1, 3, 30, 70, 'shade'), bx(-20, 20, 3, 43, 68, 70, 'shade'),
  bx(65, 125, 1, 6, 44, 56, 'shade'), cyl('y', 2, 6, [80, 9, 50], 'shade'), cyl('y', 2, 6, [110, 9, 50], 'shade'),
])
const trayWShape = comp([
  bag(-150, 150, -80, 80),
  bx(-125, -65, 1, 4, -50, -10, 'shade'), bx(-125, -65, 4, 44, -50, -47, 'shade'),
  cyl('x', 2, 12, [6, 5, -30], 'shade'), cyl('x', 4, 3, [-1.5, 5, -30], 'shade'),
  cyl('y', 6, 1.5, [95, 1.75, -30], 'shade'),
  cyl('x', 2.5, 56, [-52, 6, 40], 'shade'), cyl('x', 5, 4, [-82, 6, 40], 'shade'),
  cyl('x', 4, 40, [60, 5, 40], 'shade'),
])
const tray2Shape = comp([
  bag(-300, -40, -80, 80),
  cyl('x', 3.5, 22, [-252, 6, -40], 'shade'), cyl('x', 5, 6, [-266, 6, -40], 'shade'),
  cyl('y', 7.5, 12, [-200, 7, -40], 'shade'),
  cyl('x', 4, 30, [-140, 5, -40], 'warm'),
  cyl('x', 2.5, 36, [-74, 6, -40], 'shade'), cyl('x', 5, 2, [-93, 6, -40], 'shade'),
  cyl('x', 1.75, 12, [-245, 4.5, 40], 'shade'), cyl('x', 3.5, 2, [-252, 4.5, 40], 'shade'),
  cyl('x', 2, 16, [-175, 5, 40], 'shade'), cyl('x', 4, 2, [-184, 5, 40], 'shade'),
  cyl('y', 5, 4, [-100, 3, 40], 'shade'),
  bx(0, 430, 0, 7, -70, -56, 'shade'), bx(0, 430, 0, 7, -40, -26, 'shade'),
  bx(0, 436, 0, 6, 20, 34, 'shade'),
])

// ---------- 平放位置 ----------
/** 包装 1 叠在右边（x≈840），从上到下按取用顺序：底座前板、前档、底板、隔板、顶板、背板 */
const PILE_X = 840
const PILE = {
  back: { rot: basis([0, 0, -1], [1, 0, 0], [0, -1, 0]), at: [PILE_X - 376.5, -235, 0] as Vec3 },
  top: { rot: [180, 0, 0] as Vec3, at: [PILE_X, 783, 0] as Vec3 },
  mid: { rot: ZERO, at: [PILE_X, -270, 18] as Vec3 },
  bottom: { rot: ZERO, at: [PILE_X, -41, 10] as Vec3 },
  rails: { rot: basis([0, 0, 1], [1, 0, 0], [0, 1, 0]), at: [PILE_X - 520, -139, 0] as Vec3 },
  plinth: { rot: basis([0, 0, 1], [-1, 0, 0], [0, -1, 0]), at: [PILE_X + 45, 311, 0] as Vec3 },
}
/** 另一块侧板内面朝上平放在右侧板后面，顶端同样朝 +x；装上去 = 绕自身长边翻面 180° */
const SIDE_L_FLOOR: Pose = { at: [-390, 395, -540], rot: basis([0, 1, 0], [1, 0, 0], [0, 0, -1]) }
/** 底座前板背面朝上放在后方装角码 */
const PLINTH_PREP: Pose = { at: [0, 233, -905], rot: [90, 0, 0] }
/** 顶板反面朝上放在后方（侧板 118788 腾出的位置） */
const TOP_PREP: Pose = { at: [0, 780, -540], rot: [180, 0, 0] }

/** 抽屉板件在前方一排（z ≥ 840） */
const STRIP = {
  front: { at: [-420, 0, 840] as Vec3, rot: [90, 0, 0] as Vec3 },
  sideA: { rot: basis([0, 1, 0], [0, 0, 1], [1, 0, 0]) },
  sideB: { rot: basis([0, -1, 0], [0, 0, 1], [-1, 0, 0]) },
  back: { at: [-420, -444, 1046.5] as Vec3, rot: [90, 0, 0] as Vec3 },
  /** 底板必须正对抽屉中线（x = 0）飞进两块侧板之间，否则会擦到侧板 */
  bottom: { at: [0, -39, 1837] as Vec3, rot: ZERO },
}
const SIDE_A_AT = placeAt([-359, 103, -236], [220, 6, 910], STRIP.sideA.rot)
const SIDE_B_AT = placeAt([359, 103, -236], [220, 6, 1080], STRIP.sideB.rot)
const RUNNER_ROT: Vec3 = [0, 90, 0]
const RUNNER_A_AT = placeAt([-368, 34, -237], [-420, 8, 1250], RUNNER_ROT)
const RUNNER_B_AT = placeAt([368, 34, -237], [-420, 8, 1290], RUNNER_ROT)
const ROD_AT = placeAt([0, 35, -237], [-420, 4, 1330], RUNNER_ROT)

// ---------- 零件 ----------
const parts: SpecPart[] = [
  // 柜体板件（几何在柜体坐标 C）
  { id: 'side-r', name: '右侧面板 118789', spec: '内侧已装 3 条柜体滑轨', shape: sideShape(1), at: LIE.at, rot: LIE.rot },
  { id: 'side-l', name: '左侧面板 118788', spec: '内侧已装 3 条柜体滑轨', shape: sideShape(-1), at: SIDE_L_FLOOR.at, rot: SIDE_L_FLOOR.rot },
  { id: 'rails', name: '前档 ×3', spec: '抽屉之间的横档，端部木榫 + 偏心锁紧件', shape: railsShape, ...PILE.rails },
  { id: 'plinth', name: '底座前板', shape: comp([bx(-IN, IN, 5, 85, 215, 233)]), ...PILE.plinth },
  { id: 'bottom', name: '底板', shape: plateShape(85, 101, 215), ...PILE.bottom },
  { id: 'mid', name: '中间隔板', shape: plateShape(298, 314, 199), ...PILE.mid },
  { id: 'top', name: '顶板', shape: comp([bx(-400, 400, 755, 780, -240, 240)]), ...PILE.top },
  { id: 'back', name: '背板', spec: '纤维板，上沿两个缺口让出防倾倒角码', shape: backShape, finish: 'fiberboard', ...PILE.back },

  // 柜体五金：只画露出来的一截
  { id: 'bolts-r1', name: '偏心螺栓 118331 ×3', spec: '右侧板 · 前档', parent: 'side-r', shape: comp(RAIL_BOLTS(1)), at: [-60, 0, 0], visible: false },
  { id: 'bolts-r2', name: '偏心螺栓 118331', spec: '右侧板 · 底板', parent: 'side-r', shape: comp(boltX(1, PLATE_JOINTS.bottom, -10)), at: [-60, 0, 0], visible: false },
  { id: 'bolts-r3', name: '偏心螺栓 118331', spec: '右侧板 · 中间隔板', parent: 'side-r', shape: comp(boltX(1, PLATE_JOINTS.mid, -10)), at: [-60, 0, 0], visible: false },
  { id: 'bolts-l', name: '偏心螺栓 118331 ×5', spec: '左侧板', parent: 'side-l', shape: comp([...RAIL_BOLTS(-1), ...boltX(-1, PLATE_JOINTS.bottom, -10), ...boltX(-1, PLATE_JOINTS.mid, -10)]), at: [60, 0, 0], visible: false },
  { id: 'bolts-top', name: '偏心螺栓 118331 ×4', spec: '顶板底面', parent: 'top', shape: comp([-387, 387].flatMap((x) => [-150, 150].flatMap((z): Item[] => [cyl('y', 3.5, 14, [x, 748, z], 'shade'), cyl('y', 5, 6, [x, 738, z], 'shade')]))), at: [0, -50, 0], visible: false },
  { id: 'dw-rails-r', name: '木榫 101345 ×3', spec: '前档右端', parent: 'rails', shape: comp(RAILS.map((_, i) => dowelX(1, railMid(i) - 11, 208))), at: [40, 0, 0], visible: false },
  { id: 'dw-rails-l', name: '木榫 101345 ×3', spec: '前档左端', parent: 'rails', shape: comp(RAILS.map((_, i) => dowelX(-1, railMid(i) - 11, 208))), at: [-40, 0, 0], visible: false },
  { id: 'dw-bottom-r', name: '木榫 101345 ×2', spec: '底板右端', parent: 'bottom', shape: plateDowels(1, PLATE_JOINTS.bottom), at: [40, 0, 0], visible: false },
  { id: 'dw-bottom-l', name: '木榫 101345 ×2', spec: '底板左端', parent: 'bottom', shape: plateDowels(-1, PLATE_JOINTS.bottom), at: [-40, 0, 0], visible: false },
  { id: 'dw-mid-r', name: '木榫 101345 ×2', spec: '隔板右端', parent: 'mid', shape: plateDowels(1, PLATE_JOINTS.mid), at: [40, 0, 0], visible: false },
  { id: 'dw-mid-l', name: '木榫 101345 ×2', spec: '隔板左端', parent: 'mid', shape: plateDowels(-1, PLATE_JOINTS.mid), at: [-40, 0, 0], visible: false },
  { id: 'dw-top', name: '木榫 101345 ×4', spec: '侧板顶端', parent: 'side-r', shape: comp([-387, 387].flatMap((x) => [-75, 75].map((z) => cyl('y', 4, 12, [x, 761, z], 'warm')))), at: [0, 40, 0], visible: false },
  { id: 'feet-r', name: '塑料脚 153548 ×2', parent: 'side-r', shape: feetSide(1), finish: 'plastic-grey', at: [0, -40, 0], visible: false },
  { id: 'feet-l', name: '塑料脚 153548 ×2', parent: 'side-l', shape: feetSide(-1), finish: 'plastic-grey', at: [0, -40, 0], visible: false },
  { id: 'feet-p', name: '塑料脚 153548 ×2', spec: '底座前板', parent: 'plinth', shape: feetPlinth, finish: 'plastic-grey', at: [0, -40, 0], visible: false },
  { id: 'brackets', name: '角码 10038685 ×2', spec: '每个 4 颗螺丝 155669（2 颗进底座前板、2 颗进侧板）', parent: 'plinth', shape: bracketsShape, at: [0, 0, -50], visible: false },
  { id: 'wall-brackets', name: '防倾倒角码 106989 ×2', spec: '螺丝 109049 + 垫圈 100823 拧在顶板底面', parent: 'top', shape: wallBracketsShape, at: [0, -50, 0], visible: false },
  { id: 'nails', name: '钉子 101221', spec: '共 30 颗（定位 3 + 钉满 27）', parent: 'back', shape: nailsShape, rot: [0, 180, 0], visible: false },

  // 墙与防倾倒
  { id: 'wall', name: '墙', shape: { type: 'box', size: [2600, 1300, 60] }, finish: 'wall', at: WALL_C, visible: false },
  { id: 'wall-marks', name: '铅笔记号 ×2', parent: 'wall', shape: comp([-ANCHOR.x, ANCHOR.x].map((x): Item => ({ type: 'text', text: '+', size: 16, at: [x, WY, 30.6] }))), visible: false },
  { id: 'wall-holes', name: '钻孔 Ø8 ×2', parent: 'wall', shape: anchors((x) => [{ ...disc(4, [x, WY, 30.7], ZERO), finish: 'hole' }]), visible: false },
  { id: 'plugs', name: '膨胀管 121714 ×2', parent: 'wall', shape: anchors((x) => [cyl('z', 4, 50, [x, WY, 5.4], 'shade')]), finish: 'plastic-grey', at: [0, 0, 80], visible: false },
  { id: 'wall-screws', name: '墙螺丝 109048 + 垫圈 100823 ×2', parent: 'plugs', shape: anchors((x) => [cyl('z', 2.5, 50, [x, WY, 7], 'shade'), cyl('z', 12, 1.5, [x, WY, 32.75], 'shade'), cyl('z', 5, 4, [x, WY, 35.5], 'dark')]), at: [0, 0, 60], visible: false },

  // 工具
  { id: 'screwdriver', name: '螺丝刀', spec: '十字 / 一字', shape: screwdriverShape, ...SD_HOME },
  { id: 'hammer', name: '锤子', shape: hammerShape, ...HAM_HOME },
  { id: 'drill', name: '电钻', spec: 'Ø8 mm 钻头（木墙用 Ø3）', shape: drillShape, ...DRILL_HOME },
  { id: 'pencil', name: '铅笔', shape: pencilShape, ...PEN_HOME },

  // 抽屉 1（拆成板件；几何在抽屉坐标 D）
  { id: 'd-front', name: '抽屉正面', shape: comp([D_FRONT]), ...STRIP.front },
  { id: 'd-side-a', name: '抽屉左侧板', shape: dSideShape(-1), at: SIDE_A_AT, rot: STRIP.sideA.rot },
  { id: 'd-side-b', name: '抽屉右侧板', shape: dSideShape(1), at: SIDE_B_AT, rot: STRIP.sideB.rot },
  { id: 'd-back', name: '抽屉背板', shape: comp([D_BACK]), ...STRIP.back },
  { id: 'd-bottom', name: '抽屉底板', spec: '纤维板', shape: comp([D_BOTTOM]), ...STRIP.bottom },
  { id: 'd-runner-a', name: '抽屉滑轨 118790', spec: '左', shape: comp(runnerItems(-1)), at: RUNNER_A_AT, rot: RUNNER_ROT },
  { id: 'd-runner-b', name: '抽屉滑轨 148601', spec: '右', shape: comp(runnerItems(1)), at: RUNNER_B_AT, rot: RUNNER_ROT },
  { id: 'd-rod', name: '支撑杆 123833', spec: '两端各 1 颗螺丝 105344', shape: comp(rodItems()), at: ROD_AT, rot: RUNNER_ROT },
  { id: 'd-bolts', name: '偏心螺栓 118331 ×4', spec: '抽屉正面内侧', parent: 'd-front', shape: comp([-359, 359].flatMap((x) => [60, 146].flatMap((y): Item[] => [cyl('z', 3.5, 14, [x, y, -23], 'shade'), cyl('z', 5, 6, [x, y, -33], 'shade')]))), at: [0, 0, -60], visible: false },
  { id: 'd-dw-a', name: '木榫 101345 ×2', spec: '左侧板前端', parent: 'd-side-a', shape: comp([85, 121].map((y) => cyl('z', 4, 10, [-359, y, -11], 'warm'))), at: [0, 0, 40], visible: false },
  { id: 'd-dw-b', name: '木榫 101345 ×2', spec: '右侧板前端', parent: 'd-side-b', shape: comp([85, 121].map((y) => cyl('z', 4, 10, [359, y, -11], 'warm'))), at: [0, 0, 40], visible: false },
  { id: 'd-pins', name: '钉销 110519 ×4', spec: '穿过侧板固定背板', parent: 'd-front', shape: comp([-1, 1].flatMap((s) => [70, 140].map((y) => cyl('x', 5, 3, [s * 366.5, y, -450], 'dark')))), visible: false },
  { id: 'd-stops', name: '止动件 115339 ×2', spec: '压入正面内侧，抽屉推到底时顶住前档', parent: 'd-front', shape: comp([-330, 330].map((x) => cyl('z', 5, 2, [x, 12, -17], 'dark'))), finish: 'plastic-white', visible: false },
  { id: 'd-label', name: '警示标签', spec: '贴在左侧板内面', parent: 'd-side-a', rot: [0, 90, 0], shape: comp([
    { type: 'hole', w: 80, h: 46, r: 3, at: [120, 103, -352.4], fill: 'warm', finish: 'paper' },
    { type: 'text', text: '⚠ 请固定在墙上', size: 7, at: [120, 103, -352.2] },
  ]), visible: false },

  // 另外两个抽屉：整体
  ...Object.entries(DRAWER_FB).map(([id, fb]): SpecPart => ({
    id, name: id === 'drawer-2' ? '抽屉 2（中层）' : '抽屉 3（底层）', spec: '同抽屉 1 组装好', parent: 'side-r',
    shape: drawerShape, at: [0, fb, ALIGN_Z], visible: false,
  })),

  // 道具
  { id: 'carton', name: '包装纸箱（当台面）', shape: { type: 'box', size: [840, 100, 460] }, at: [870, 50, 380], fill: 'warm', finish: 'cardboard', visible: false },
  { id: 'tray-1', name: '五金包 1', shape: tray1Shape, at: [-330, 0, 620], visible: false },
  { id: 'tray-w', name: '防倾倒安全配件 326949', shape: trayWShape, at: [30, 0, 620], visible: false },
  { id: 'tray-2', name: '五金包 2 + 抽屉滑轨 / 支撑杆', shape: tray2Shape, at: [520, 0, 620], visible: false },
]

// ---------- 状态快照 ----------
const CARCASS = ['side-l', 'rails', 'plinth', 'bottom', 'mid', 'top', 'back']
const SEATED = ['feet-r', 'feet-l', 'feet-p', 'brackets', 'wall-brackets']
const STRIP_IDS = ['d-front', 'd-side-a', 'd-side-b', 'd-back', 'd-bottom', 'd-runner-a', 'd-runner-b', 'd-rod']
const built = (root: Pose): Record<string, PartState> => ({
  'side-r': { at: root.at, rot: root.rot },
  ...Object.fromEntries(CARCASS.map((id) => [id, ON_R])),
  ...Object.fromEntries(SEATED.map((id) => [id, { visible: true, at: ZERO }])),
  nails: { visible: true },
})
const ANCHORED: Record<string, PartState> = {
  wall: { visible: true },
  'wall-holes': { visible: true },
  plugs: { visible: true, at: ZERO },
  'wall-screws': { visible: true, at: ZERO },
}
const ON_FRONT: PartState = { parent: 'd-front', at: ZERO, rot: ZERO }
const DRAWER_BUILT: Record<string, PartState> = {
  'd-front': { at: D_STAND.at, rot: D_STAND.rot },
  ...Object.fromEntries(['d-side-a', 'd-side-b', 'd-back', 'd-bottom'].map((id) => [id, ON_FRONT])),
  'd-label': { visible: true },
  'd-pins': { visible: true },
  'd-stops': { visible: true },
}

// ---------- 镜头 ----------
const BACK_DIR: Vec3 = [-0.45, 0.85, -1]
const LIE_VIEW: CameraSpec = { target: [40, 330, -150], dir: BACK_DIR, dist: 2700 }
const WALL_VIEW: CameraSpec = { target: [150, 420, -250], dir: [0.55, 0.42, 1], dist: 2700 }
const DRAWER_VIEW: CameraSpec = { target: [0, 200, 330], dir: [0.55, 0.75, 1], dist: 1700 }

// ---------- 够顶层的工具姿态 ----------
/** 顶板锁紧件（右侧板内面、靠前）：螺丝刀向左下前方倾斜，从顶层抽屉口伸进去 */
const TOP_CAM_TIP: Vec3 = [376.5, 721, 150]
const TOP_CAM_DIR: Vec3 = [-0.755, -0.352, 0.553]
/** 墙孔：铅笔 / 螺丝刀从顶层抽屉口斜伸进去，尖端顶在墙上 */
const ANCHOR_DIR: Vec3 = [-0.1, -0.17, 0.98]
const PEN_TIP: Vec3 = [ANCHOR.x, ANCHOR.y, WALL_FACE + 0.5]
const SD_WALL_TIP: Vec3 = wall([ANCHOR.x, ANCHOR.y, -234.3])
const PEN_VIA = reach(PEN_HOME.at, PEN_TIP, ANCHOR_DIR, 700)
const SD_WALL_VIA = reach(SD_HOME.at, SD_WALL_TIP, ANCHOR_DIR, 700)
const SD_TOP_VIA = reach(SD_HOME.at, TOP_CAM_TIP, TOP_CAM_DIR, 700)

// ---------- 指南 1：清点零件与工具 ----------
const trayCallouts = (part: string, list: [string, string, Vec3, Vec3][]): Callout[] =>
  list.map(([text, sub, at, offset]) => ({ part, text, sub, at, offset }))

const checkSteps: SpecStep[] = [
  {
    id: 'overview', title: '开箱：两个包装', page: 2,
    desc: '包装 1 是柜体：两块侧板（内侧已装好滑轨）、顶板、底板、中间隔板、3 根前档、底座前板、背板和五金包。包装 2 是 3 个抽屉的板件、滑轨和五金。',
    tip: '说明书第 2 页：家具倾倒可能导致严重或致命的伤害，这个柜子必须用随附的防倾倒配件固定在墙上。',
    camera: { target: [80, 0, 330], dir: [0.12, 1, 0.78], dist: 3900 },
    highlight: ['side-r', 'side-l', 'top', 'd-front'],
    callouts: [
      { part: 'side-r', text: '侧面板 ×2', sub: '118788 / 118789', at: [395, 380, 0], offset: [0, 60, 0] },
      { part: 'top', text: '柜体板件（包装 1）', sub: '顶板·底板·隔板·前档·背板', at: [0, 780, 0], offset: [-120, 90, 0] },
      { part: 'd-front', text: '抽屉板件 ×3（包装 2）', sub: '先只拆开一个', at: [0, 109, -16], offset: [0, 60, 0] },
      { part: 'screwdriver', text: '工具', sub: '螺丝刀·锤子·电钻·铅笔', at: [0, 110, 0], offset: [60, 60, 0] },
    ],
  },
  {
    id: 'tools', title: '准备工具', page: 3,
    desc: '需要十字、一字（或米字）螺丝刀，铅笔，锤子；固定到墙上还要电钻和 Ø8 mm（木墙 Ø3 mm）钻头。',
    tip: '说明书第 3–4 页：两人组装；在地毯或软垫上组装，避免磕坏板件。',
    camera: { target: [-930, 30, 600], dir: [0.3, 1, 0.75], dist: 1250 },
    highlight: ['screwdriver', 'hammer', 'drill', 'pencil'],
    callouts: [
      { part: 'screwdriver', text: '螺丝刀', sub: '十字 + 一字', at: [0, 165, 0], offset: [40, 50, 0] },
      { part: 'pencil', text: '铅笔', sub: '在墙上画孔位', at: [0, 100, 0], offset: [-30, 60, 0] },
      { part: 'hammer', text: '锤子', sub: '钉背板、敲膨胀管', at: [0, 50, 0], offset: [0, 60, 0] },
      { part: 'drill', text: '电钻', sub: 'Ø8 mm 钻头', at: [0, 0, 205], offset: [0, 70, 0] },
    ],
  },
  {
    id: 'bag-1', title: '清点五金包 1', page: 5,
    desc: '偏心螺栓 118331 ×14、木榫 101345 ×18、偏心锁紧件 117434 ×14、螺丝 155669 ×8、角码 10038685 ×2、塑料脚 153548 ×6，另有一小包钉子 101221。',
    camera: { target: 'tray-1', dir: [0.05, 1, 0.62], dist: 760 },
    highlight: ['tray-1'],
    zoom: { target: 'tray-1', offset: [-95, 6, -50], dir: [0.2, 1, 0.6], dist: 120, caption: '偏心螺栓 118331：一端螺纹拧进板里，球头被锁紧件卡住' },
    callouts: trayCallouts('tray-1', [
      ['偏心螺栓 118331', '×14', [-95, 6, -50], [0, 30, -40]],
      ['木榫 101345', '×18', [0, 5, -50], [0, 30, -40]],
      ['偏心锁紧件 117434', '×14', [95, 13, -50], [0, 30, -40]],
      ['螺丝 155669', '×8', [-92, 5, 50], [0, 45, 60]],
      ['角码 10038685', '×2', [0, 43, 69], [0, 30, 60]],
      ['塑料脚 153548', '×6', [95, 6, 50], [0, 45, 60]],
    ]),
  },
  {
    id: 'bag-wall', title: '清点防倾倒安全配件', page: 5,
    desc: '安全配件包 326949：防倾倒角码 106989 ×2、螺丝 109049 ×2、垫圈 100823 ×4、墙螺丝 109048 ×2、膨胀管 121714 ×2。先收好，第 14 页和固定到墙上时再用。',
    tip: '随附的墙螺丝和膨胀管只适合实心墙；空心墙、木墙请按墙体材质另配合适的五金。',
    camera: { target: 'tray-w', dir: [0.05, 1, 0.62], dist: 720 },
    highlight: ['tray-w'],
    zoom: { target: 'tray-w', offset: [-95, 20, -30], dir: [0.35, 0.8, 0.8], dist: 150, caption: '防倾倒角码 106989：竖脚上的长孔对准墙孔' },
    callouts: trayCallouts('tray-w', [
      ['防倾倒角码 106989', '×2', [-95, 44, -48], [0, 40, -55]],
      ['螺丝 109049', '×2', [2, 5, -30], [0, 45, -55]],
      ['垫圈 100823', '×4', [95, 2, -30], [0, 45, -55]],
      ['墙螺丝 109048', '×2', [-60, 6, 40], [0, 45, 55]],
      ['膨胀管 121714', '×2', [60, 5, 40], [0, 45, 55]],
    ]),
  },
  {
    id: 'bag-2', title: '清点抽屉五金（包装 2）', page: 3, chips: [DRAWER_CHIP],
    desc: '五金包 2 供 3 个抽屉：偏心螺栓 / 锁紧件 / 木榫各 ×12、钉销 110519 ×12、螺丝 100365 ×18 和 105344 ×6、止动件 115339 ×6；另有抽屉滑轨 118790 / 148601 ×3 对、支撑杆 123833 ×3。',
    camera: { target: 'tray-2', offset: [0, 0, 0], dir: [0.05, 1, 0.62], dist: 1250 },
    highlight: ['tray-2'],
    zoom: { target: 'tray-2', offset: [-170, 6, 0], dir: [0.15, 1, 0.55], dist: 260, caption: '每个抽屉用 4 套偏心螺栓 + 锁紧件 + 木榫' },
    callouts: trayCallouts('tray-2', [
      ['螺栓 / 锁紧件 / 木榫', '各 ×12', [-200, 13, -40], [0, 45, -70]],
      ['钉销 110519', '×12', [-80, 6, -40], [40, 45, -70]],
      ['螺丝 100365 / 105344', '×18 / ×6', [-210, 5, 40], [0, 45, 70]],
      ['止动件 115339', '×6', [-100, 5, 40], [30, 45, 70]],
      ['抽屉滑轨', '118790 / 148601 ×3 对', [300, 7, -48], [-70, 45, -70]],
      ['支撑杆 123833', '×3', [300, 6, 27], [-40, 45, 70]],
    ]),
  },
]

// ---------- 指南 2：组装柜体 ----------
/** 各板件几何中心（柜体坐标），换算途经点用 */
const G = {
  rails: [0, 520, 208] as Vec3,
  plinth: [0, 45, 224] as Vec3,
  bottom: [0, 93, -10] as Vec3,
  mid: [0, 306, -18] as Vec3,
  top: [0, 767.5, 0] as Vec3,
  back: [0, 376.5, -236.5] as Vec3,
  sideL: [-387, 380, 0] as Vec3,
}
const RAIL2_CAM: Vec3 = [345, railMid(1) + 11, 199]
const RAIL2_CAM_L: Vec3 = [-345, railMid(1) + 11, 199]
/** 底座角码拧进侧板的螺丝头（平放时朝上），螺丝刀竖直 */
const SD_BRACKET = lie([374.5, 60, 195])
/** 前档锁紧件在背面：螺丝刀从后上方落到前档背后，躺平朝 -z */
const SD_RAIL = lie([RAIL2_CAM[0], RAIL2_CAM[1], 198.5])
const SD_RAIL_C = add(SD_RAIL, [0, 3000, -450])

const cabinetSteps: SpecStep[] = [
  {
    id: 'bolts', title: '侧板拧入偏心螺栓', page: 6,
    desc: '两块侧板内面（带滑轨的一面）朝上平放，每块拧入 5 颗偏心螺栓 118331，共 10 颗。',
    tip: '用手或十字螺丝刀拧到底，球头留在外面，之后靠锁紧件卡住。',
    camera: { target: [0, 0, -280], dir: [-0.35, 1, -0.8], dist: 2200 },
    set: {
      'bolts-r1': seat(0, 0.8), 'bolts-r2': seat(0.3, 0.8), 'bolts-r3': seat(0.5, 0.8), 'bolts-l': seat(0.8, 0.8),
    },
    highlight: ['bolts-r1', 'bolts-r2', 'bolts-r3', 'bolts-l'],
    zoom: { target: lie([362, PLATE_JOINTS.mid, -10]), dir: [-0.35, 0.8, -0.6], dist: 110, caption: '118331 拧进侧板内面的预钻孔' },
    callouts: [
      { part: 'side-r', text: '右侧面板 118789', sub: '内面朝上', at: [IN, 600, 0], offset: [0, 60, 0] },
      { part: 'side-l', text: '左侧面板 118788', sub: '内面朝上', at: [-IN, 200, 0], offset: [0, 60, 0] },
      { part: 'bolts-r1', text: '偏心螺栓 118331', sub: '每块侧板 5 颗', at: [362, railMid(1) + 11, 208], offset: [180, 40, -40] },
    ],
  },
  {
    id: 'feet-plinth', title: '装塑料脚和底座角码', page: 7,
    desc: '两块侧板底端各压入 2 个塑料脚 153548；底座前板背面朝上，两端各用 2 颗螺丝 155669 装上角码 10038685，底边再压入 2 个塑料脚。',
    camera: { target: [-250, 50, -450], dir: [-0.4, 1, -0.7], dist: 2000 },
    set: {
      'feet-r': seat(0, 0.7), 'feet-l': seat(0.3, 0.7),
      plinth: { at: PLINTH_PREP.at, rot: PLINTH_PREP.rot, via: viaAt(G.plinth, PILE.plinth.rot, PLINTH_PREP.rot, [420, 450, -500]), delay: 0.5, dur: 1.7 },
      brackets: seat(2.3, 0.6), 'feet-p': seat(2.9, 0.6),
    },
    highlight: ['feet-r', 'feet-l', 'plinth', 'brackets', 'feet-p'],
    zoom: { target: w(PLINTH_PREP, [355, 45, 205]), dir: [0.5, 1, -0.6], dist: 200, caption: '角码一边贴底座前板背面，一边留给侧板' },
    callouts: [
      { part: 'feet-r', text: '塑料脚 153548', sub: '侧板底端 ×2', at: [387, 0, 190], offset: [-80, 0, -130] },
      { part: 'plinth', text: '底座前板', sub: '背面朝上', at: [-200, 45, 215], offset: [0, 60, -60] },
      { part: 'brackets', text: '角码 10038685', sub: '螺丝 155669 ×2', at: [-360, 45, 214], offset: [-40, 60, 0] },
    ],
  },
  {
    id: 'plinth', title: '底座前板装到右侧板', page: 8,
    desc: '底座前板竖立在右侧板 118789 的前下角，用 2 颗螺丝 155669 把角码拧在侧板上。',
    tip: '说明书第 8 页对照图：角码要和侧板前沿齐平（✓），伸出板边（✗）会顶住抽屉。',
    camera: { target: [-300, 250, 120], dir: [-0.55, 0.7, -0.9], dist: 1800 },
    set: {
      plinth: { ...ON_R, via: viaAt(G.plinth, PLINTH_PREP.rot, LIE.rot, [-345, 1000, -150]), dur: 1.8 },
      screwdriver: { at: SD_BRACKET, rot: ZERO, via: viaC(SD_HOME.at, SD_BRACKET, add(SD_BRACKET, [0, 2000, -300])), delay: 1.7, dur: 1.5 },
    },
    highlight: ['plinth', 'brackets', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: lie([376, 45, 200]), dir: [-0.6, 0.9, -0.3], dist: 160, caption: '角码竖脚贴在侧板内面，拧 2 颗 155669' },
    callouts: [
      { part: 'plinth', text: '底座前板', sub: '贴齐侧板前沿', at: [0, 85, 233], offset: [0, 80, 0] },
      { part: 'brackets', text: '角码 → 侧板', sub: '螺丝 155669 ×2', at: [377, 45, 195], offset: [-60, 60, -40] },
    ],
  },
  {
    id: 'rails', title: '插木榫，装 3 根前档', page: 9,
    desc: '3 根前档两端各插 1 个木榫 101345（共 6 个），竖起来插到右侧板的偏心螺栓和孔上。',
    camera: LIE_VIEW,
    set: {
      'dw-rails-r': seat(0, 0.6), 'dw-rails-l': seat(0.2, 0.6),
      rails: { ...ON_R, via: viaAt(G.rails, PILE.rails.rot, LIE.rot, [130, 1150, -100]), delay: 0.9, dur: 1.9 },
      'bolts-r1': gone(0.9 + 1.9 * 0.6),
    },
    highlight: ['rails', 'dw-rails-l'],
    zoom: { target: lie([379, railMid(1), 208]), dir: [-0.4, 0.5, -1], dist: 150, caption: '前档端部：木榫 + 偏心螺栓对准孔位' },
    callouts: [
      { part: 'rails', text: '前档 ×3', sub: '锁紧件孔朝里（朝背面）', at: [0, railMid(0), 199], offset: [0, 40, -80] },
      { part: 'dw-rails-l', text: '木榫 101345', sub: '每根两端各 1 个', at: [-385, railMid(1) - 11, 208], offset: [150, 50, -100] },
    ],
  },
  {
    id: 'rail-cams', title: '锁紧前档', page: 9,
    desc: '在 3 根前档上装入偏心锁紧件 117434，用一字螺丝刀顺时针拧紧，卡住侧板上的螺栓。',
    tip: '锁紧件箭头朝向螺栓孔放入，拧半圈左右就会感觉到卡紧。',
    camera: { target: lie([300, 500, 120]), dir: [-0.3, 0.8, -1], dist: 1300 },
    set: {
      screwdriver: { at: SD_RAIL, rot: [-90, 0, 0], via: viaC(SD_BRACKET, SD_RAIL, SD_RAIL_C), dur: 1.8 },
    },
    highlight: ['rails', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: lie(RAIL2_CAM), dir: [-0.3, 0.6, -1], dist: 130, caption: '偏心锁紧件 117434：顺时针拧紧' },
    callouts: [
      { part: 'rails', text: '锁紧件 ×3', sub: '117434，顺时针', at: [345, railMid(2) + 11, 199], offset: [0, 60, -60] },
    ],
  },
  {
    id: 'bottom', title: '装底板', page: 10,
    desc: '底板两端各插 2 个木榫（共 4 个），按说明书对照图把锁紧件孔朝上、插到侧板上，再拧紧 1 个锁紧件。',
    camera: LIE_VIEW,
    set: {
      'dw-bottom-r': seat(0, 0.6), 'dw-bottom-l': seat(0.2, 0.6),
      bottom: { ...ON_R, via: flyG(G.bottom, PILE.bottom, LIE, [-297, 1500, -1210]), delay: 0.9, dur: 1.9 },
      'bolts-r2': gone(0.9 + 1.9 * 0.6),
    },
    highlight: ['bottom', 'dw-bottom-l'],
    zoom: { target: lie([345, 101, -10]), dir: [0.6, 0.7, -0.8], dist: 140, caption: '底板上的锁紧件：顺时针拧紧' },
    callouts: [
      { part: 'bottom', text: '底板', sub: '木榫 ×4 · 锁紧件 ×1', at: [0, 101, -235], offset: [0, 60, -60] },
    ],
  },
  {
    id: 'mid', title: '装中间隔板', page: 11,
    desc: '中间隔板同样两端各插 2 个木榫，插到侧板上，拧紧 1 个锁紧件。',
    camera: LIE_VIEW,
    set: {
      'dw-mid-r': seat(0, 0.6), 'dw-mid-l': seat(0.2, 0.6),
      mid: { ...ON_R, via: viaAt(G.mid, PILE.mid.rot, LIE.rot, [-84, 1150, -150]), delay: 0.9, dur: 1.9 },
      'bolts-r3': gone(0.9 + 1.9 * 0.6),
    },
    highlight: ['mid', 'dw-mid-l'],
    zoom: { target: lie([345, 314, -10]), dir: [0.6, 0.7, -0.8], dist: 140, caption: '隔板上的锁紧件：顺时针拧紧' },
    callouts: [
      { part: 'mid', text: '中间隔板', sub: '木榫 ×4 · 锁紧件 ×1', at: [0, 314, -235], offset: [0, 60, -60] },
    ],
  },
  {
    id: 'side-l', title: '盖上另一块侧板', page: 12,
    desc: '把左侧板 118788 翻过来，螺栓对准前档、底板、隔板和底座前板的孔，整块压上去。',
    tip: '两人配合：一人扶住已经立起的横板，一人对准孔位往下压。',
    camera: { ...LIE_VIEW, dist: 3000 },
    set: {
      screwdriver: home(SD_HOME, viaC(SD_RAIL, SD_HOME.at, SD_RAIL_C), 0, 1.8),
      'side-l': { ...ON_R, via: viaAt(G.sideL, SIDE_L_FLOOR.rot, LIE.rot, [-10, 1300, -300]), delay: 1.2, dur: 2.4 },
      'bolts-l': gone(1.2 + 2.4 * 0.6),
      'dw-rails-l': gone(1.2 + 2.4 * 0.6), 'dw-bottom-l': gone(1.2 + 2.4 * 0.6), 'dw-mid-l': gone(1.2 + 2.4 * 0.6),
    },
    highlight: ['side-l'],
    callouts: [
      { part: 'side-l', text: '左侧面板 118788', sub: '翻面后压到横板上', at: [-395, 380, -235], offset: [0, 60, -60] },
    ],
  },
  {
    id: 'side-l-lock', title: '拧紧左侧的锁紧件', page: 13,
    desc: '用 2 颗螺丝 155669 把底座角码拧在左侧板上，再拧紧前档、底板、隔板上的 5 个锁紧件。',
    camera: { target: lie([-200, 500, 120]), dir: [-0.3, 0.8, -1], dist: 1500 },
    highlight: ['side-l', 'rails'],
    zoom: { target: lie(RAIL2_CAM_L), dir: [-0.3, -0.1, -1], dist: 150, caption: '左端锁紧件 ×5：一字螺丝刀顺时针拧紧' },
    callouts: [
      { part: 'rails', text: '锁紧件 ×5', sub: '前档 3 · 底板 1 · 隔板 1', at: [-345, railMid(0) + 11, 199], offset: [0, 60, -60] },
    ],
  },
  {
    id: 'top-prep', title: '顶板：螺栓和防倾倒角码', page: 14,
    desc: '顶板反面朝上，拧入 4 颗偏心螺栓 118331；后沿装 2 个防倾倒角码 106989（各用 1 颗螺丝 109049 + 垫圈 100823）。',
    tip: '防倾倒角码是这个柜子最重要的安全件，长孔那一边朝外（朝墙）。',
    camera: { target: [0, 40, -540], dir: [0.1, 1, -0.75], dist: 1700 },
    set: {
      top: { at: TOP_PREP.at, rot: TOP_PREP.rot, via: viaAt(G.top, PILE.top.rot, TOP_PREP.rot, [600, 900, -420]), dur: 1.6 },
      'bolts-top': seat(1.7, 0.7), 'wall-brackets': seat(2.3, 0.7),
    },
    highlight: ['top', 'bolts-top', 'wall-brackets'],
    zoom: { target: w(TOP_PREP, [ANCHOR.x, 730, -235]), dir: [0.4, 0.7, -1], dist: 220, caption: '防倾倒角码：水平脚拧在顶板底面，竖脚带长孔' },
    callouts: [
      { part: 'bolts-top', text: '偏心螺栓 ×4', sub: '118331', at: [-387, 738, 150], offset: [60, 60, 0] },
      { part: 'wall-brackets', text: '防倾倒角码 106989 ×2', sub: '螺丝 109049 + 垫圈 100823', at: [ANCHOR.x, 700, -241], offset: [-80, 30, 120] },
    ],
  },
  {
    id: 'stand-up', title: '立起柜体，插顶端木榫', page: 15,
    desc: '两人抬起，把柜体底座朝下立起来；两块侧板顶端各插 2 个木榫 101345（共 4 个）。',
    tip: '抬侧板，不要抓着前档使劲，避免拉坏刚锁紧的接口。',
    camera: { target: [0, 380, 0], dir: [0.5, 0.55, 1], dist: 3000 },
    set: {
      'side-r': { at: UPRIGHT.at, rot: UPRIGHT.rot, lift: 160, dur: 2.2 },
      'dw-top': seat(2.3, 0.6),
    },
    highlight: ['side-r', 'side-l', 'dw-top'],
    zoom: { target: [387, 761, 75], dir: [0.6, 0.8, 0.7], dist: 160, caption: '侧板顶端插木榫 ×4' },
    callouts: [
      { part: 'side-r', text: '柜体', sub: '底座朝下立起', at: [395, 600, 235], offset: [80, 40, 0] },
      { part: 'dw-top', text: '木榫 101345 ×4', at: [-387, 767, 75], offset: [-80, 60, 0] },
    ],
  },
  {
    id: 'top', title: '装顶板并锁紧', page: 16,
    desc: '按对照图把顶板前沿朝前盖到侧板顶端，螺栓插进侧板，再拧紧侧板内面的 4 个锁紧件。',
    tip: '顶层的锁紧件比顶层抽屉口略高，螺丝刀从抽屉口斜着伸进去拧。',
    camera: { target: [0, 560, -100], dir: [0.45, 0.8, 1], dist: 2600 },
    set: {
      top: { ...ON_R, via: viaAt(G.top, TOP_PREP.rot, ZERO, [0, 1400, -250]), dur: 2.2 },
      'bolts-top': gone(2.2 * 0.6), 'dw-top': gone(2.2 * 0.6),
      screwdriver: { at: TOP_CAM_TIP, rot: aim(TOP_CAM_DIR), via: SD_TOP_VIA, delay: 2.4, dur: 1.6 },
    },
    highlight: ['top', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: [378, 721, 150], dir: [-0.7, -0.15, 0.5], dist: 150, caption: '顶板锁紧件 ×4：从侧板内面拧紧' },
    callouts: [
      { part: 'top', text: '顶板', sub: '前沿朝前', at: [0, 780, 240], offset: [0, 70, 40] },
      { part: 'side-r', text: '锁紧件 ×4', sub: '侧板内面靠顶', at: [IN, 721, 150], offset: [120, 60, 60] },
    ],
  },
  {
    id: 'back', title: '放倒，铺上背板', page: 17,
    desc: '把柜体正面朝下放倒在软垫上，背板（两片相连的纤维板）光面朝外铺上去，缺口对准顶上的防倾倒角码。',
    camera: { target: [0, 300, 0], dir: [0.35, 1, 0.7], dist: 2700 },
    set: {
      screwdriver: home(SD_HOME, SD_TOP_VIA),
      'side-r': { at: FACE.at, rot: FACE.rot, lift: 120, delay: 1.5, dur: 2.0 },
      back: { ...ON_R, via: viaAt(G.back, PILE.back.rot, FACE.rot, [420, 1100, 0]), delay: 3.6, dur: 1.8 },
    },
    highlight: ['side-r', 'back'],
    callouts: [
      { part: 'back', text: '背板', sub: '缺口朝顶板一端', at: [0, 717, -238], offset: [0, 60, 0] },
    ],
  },
  {
    id: 'nails', title: '钉背板', page: 19,
    desc: '先在角上钉 3 颗钉子 101221 定位（说明书步骤 19–21），再沿四边、底板和隔板的位置钉满其余 27 颗，共 30 颗。',
    tip: '钉之前量对角线等长，柜体就是方正的。',
    camera: { target: face([0, 380, -238]), dir: [0.25, 1, 0.55], dist: 2000 },
    set: {
      nails: { visible: true },
      hammer: { at: face([-200, PLATE_JOINTS.bottom, -238.5]), rot: ZERO, via: [-700, 900, 300], dur: 1.6 },
    },
    highlight: ['nails', 'hammer'],
    actions: [{ type: 'shake', part: 'hammer', axis: 'y', amp: 15 }],
    zoom: { target: face([-200, PLATE_JOINTS.bottom, -238]), dir: [0.5, 1, 0.6], dist: 180, caption: '钉子钉在背板下面横板的位置' },
    callouts: [
      { part: 'nails', text: '钉子 101221', sub: '共 30 颗', at: [-387, 480, 238], offset: [80, 60, 0] },
    ],
  },
  {
    id: 'stand-again', title: '再把柜体立起来', page: 20,
    desc: '两人把柜体翻回直立。下一步把它固定到墙上。',
    camera: { target: [0, 420, -100], dir: [0.7, 0.5, -1], dist: 2900 },
    set: {
      hammer: home(HAM_HOME, [-700, 900, 400]),
      'side-r': { at: UPRIGHT.at, rot: UPRIGHT.rot, lift: 120, delay: 1.3, dur: 2.0 },
    },
    highlight: ['side-r', 'back', 'wall-brackets'],
    callouts: [
      { part: 'wall-brackets', text: '防倾倒角码', sub: '在柜背顶部', at: [ANCHOR.x, 730, -242], offset: [120, 60, 0] },
    ],
  },
]

// ---------- 指南 3：固定到墙上 ----------
const wallSteps: SpecStep[] = [
  {
    id: 'to-wall', title: '柜子靠墙放好', page: 20,
    desc: '把柜子推到要放的位置，背面贴墙，防倾倒角码的竖脚贴住墙面。',
    tip: '这一步不能省：不固定在墙上，拉出抽屉或孩子攀爬时柜子会倾倒。宜家 2016 年起在全球召回过未固定的 MALM 抽屉柜。',
    camera: WALL_VIEW,
    set: { 'side-r': { at: AT_WALL.at, rot: AT_WALL.rot, dur: 1.6 } },
    highlight: ['side-r'],
    callouts: [
      { part: 'top', text: '柜背贴墙', sub: '防倾倒角码竖脚贴住墙面', at: [ANCHOR.x, 780, -240], offset: [120, 70, 0] },
    ],
  },
  {
    id: 'mark', title: '透过长孔画记号', page: 20,
    desc: '铅笔从顶层抽屉口伸进去，透过两个角码的长孔在墙上各画一个记号。',
    camera: { target: [150, 600, -300], dir: [0.55, 0.32, 1], dist: 1900 },
    set: {
      pencil: { at: PEN_TIP, rot: aim(ANCHOR_DIR), via: PEN_VIA, dur: 1.8 },
      'wall-marks': { visible: true, delay: 1.9, dur: 0.3 },
    },
    highlight: ['pencil', 'wall-marks'],
    actions: [{ type: 'shake', part: 'pencil', axis: 'x', amp: 3 }],
    zoom: { target: [ANCHOR.x, ANCHOR.y, WALL_FACE], dir: [-0.5, 0.12, 1], dist: 170, caption: '铅笔尖穿过角码长孔，在墙上点一个记号' },
    callouts: [
      { part: 'rails', text: '铅笔从顶层抽屉口伸进去', sub: '左右两个长孔各画一个记号', at: [150, 710, 217], offset: [120, 60, 0] },
    ],
  },
  {
    id: 'move-away', title: '移开柜子', page: 21,
    desc: '收回铅笔，把柜子往旁边挪开，露出墙上的两个记号。',
    camera: { target: [400, 450, -300], dir: [0.3, 0.42, 1], dist: 2900 },
    set: {
      pencil: home(PEN_HOME, PEN_VIA, 0, 1.6),
      'side-r': { at: ASIDE.at, rot: ASIDE.rot, delay: 1.5, dur: 1.8 },
    },
    highlight: ['side-r', 'wall-marks'],
    callouts: [
      { part: 'wall-marks', text: '墙上的记号', at: [ANCHOR.x, WY, 30], offset: [0, 120, 60] },
    ],
  },
  {
    id: 'drill', title: '在记号处钻孔', page: 22,
    desc: '实心墙用 Ø8 mm 钻头钻 70 mm 深；空心墙 Ø8 mm 约 30 mm；木墙用 Ø3 mm 钻头约 30 mm。',
    tip: '说明书第 22 页：钻孔前确认墙里没有水管、电线和暖气管。不确定墙体材质时咨询专业人士，参见 www.IKEA.com/secure-it。',
    camera: { target: [0, 600, -420], dir: [0.35, 0.3, 1], dist: 1900 },
    set: {
      drill: { at: [ANCHOR.x, ANCHOR.y, WALL_FACE + 0.5], rot: ZERO, via: [-500, 900, 300], dur: 1.6 },
      'wall-holes': { visible: true, delay: 1.7, dur: 0.3 },
      'wall-marks': gone(1.7),
    },
    highlight: ['drill', 'wall-holes'],
    actions: [{ type: 'shake', part: 'drill', axis: 'z', amp: 5 }],
    zoom: { target: [ANCHOR.x - 30, ANCHOR.y, WALL_FACE], dir: [-0.8, 0.3, 1], dist: 220, caption: 'Ø8 mm 钻头对准记号，垂直于墙面' },
    callouts: [
      { part: 'wall-holes', text: '孔 ×2', sub: '实心墙 Ø8 × 70 mm', at: [-ANCHOR.x, WY, 30], offset: [-120, 80, 0] },
    ],
  },
  {
    id: 'plugs', title: '敲入膨胀管', page: 22,
    desc: '把 2 个膨胀管 121714 塞进孔里，用锤子轻轻敲到和墙面齐平。',
    tip: '膨胀管只适合实心墙（混凝土、砖）。空心墙用空心墙锚栓，木墙直接拧螺丝。',
    camera: { target: [0, 600, -420], dir: [0.35, 0.3, 1], dist: 1900 },
    set: {
      drill: home(DRILL_HOME, [-300, 700, 400], 0, 1.4),
      plugs: { visible: true, at: ZERO, delay: 0.3, dur: 0.9 },
      hammer: { at: [ANCHOR.x, ANCHOR.y, WALL_FACE + 1.5], rot: basis([0, -1, 0], [0, 0, 1], [-1, 0, 0]), via: [-200, 1000, 150], delay: 1.5, dur: 1.5 },
    },
    highlight: ['plugs', 'hammer'],
    actions: [{ type: 'shake', part: 'hammer', axis: 'y', amp: 10 }],
    zoom: { target: [ANCHOR.x - 25, ANCHOR.y, WALL_FACE], dir: [-0.9, 0.35, 1], dist: 220, caption: '膨胀管敲到与墙面齐平' },
    callouts: [
      { part: 'plugs', text: '膨胀管 121714 ×2', at: [-ANCHOR.x, WY, 30], offset: [-120, 80, 0] },
    ],
  },
  {
    id: 'screw', title: '推回原位，拧上墙螺丝', page: 23,
    desc: '把柜子推回墙边，墙螺丝 109048 套上垫圈 100823，穿过角码长孔拧进膨胀管，两边都拧紧。',
    tip: '拧好后试着往前拉柜顶，柜子应纹丝不动。搬家或换位置时要重新固定。',
    camera: { target: [100, 560, -300], dir: [0.5, 0.32, 1], dist: 2300 },
    set: {
      hammer: home(HAM_HOME, [-200, 1000, 300], 0, 1.4),
      'side-r': { at: AT_WALL.at, rot: AT_WALL.rot, delay: 0.8, dur: 1.8 },
      'wall-screws': { visible: true, at: ZERO, delay: 2.7, dur: 0.8 },
      screwdriver: { at: SD_WALL_TIP, rot: aim(ANCHOR_DIR), via: SD_WALL_VIA, delay: 2.6, dur: 1.8 },
    },
    highlight: ['wall-screws', 'screwdriver', 'wall-brackets'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: [ANCHOR.x, ANCHOR.y, WALL_FACE + 4], dir: [-0.5, 0.12, 1], dist: 170, caption: '墙螺丝 + 垫圈压住角码长孔' },
    callouts: [
      { part: 'rails', text: '墙螺丝 109048 + 垫圈 100823', sub: '螺丝刀从顶层抽屉口伸进去，左右各 1 颗', at: [150, 710, 217], offset: [140, 60, 0] },
    ],
  },
]

// ---------- 指南 4：组装抽屉 ----------
/** 抽屉零件几何中心（抽屉坐标） */
const GD = {
  sideA: [-359, 103, -236] as Vec3,
  sideB: [359, 103, -236] as Vec3,
  back: [0, 103.5, -450] as Vec3,
  bottom: [0, 40.5, -237] as Vec3,
  runnerA: [-368, 34, -237] as Vec3,
  runnerB: [368, 34, -237] as Vec3,
  rod: [0, 35, -237] as Vec3,
  drawer: [0, 109, -228] as Vec3,
}
const SD_DCAM = stand([365.5, 146, -50])
const SD_DCAM_VIA = viaC(SD_HOME.at, SD_DCAM, add(SD_DCAM, [600, 1300, 0]))
/** 背板、底板贴着侧板内面进去：最后一段要正对中线竖直落下 */
const BACK_VIA = flyG(GD.back, STRIP.back, D_STAND, add(stand(GD.back), [0, 950, 0]))
const D_BOTTOM_VIA = flyG(GD.bottom, STRIP.bottom, D_STAND, add(stand(GD.bottom), [0, 1060, 0]))
const HAM_PIN = stand([369, 140, -450])
const HAM_PIN_VIA = viaC(HAM_HOME.at, HAM_PIN, add(HAM_PIN, [500, 800, 0]))
const HAM_BACK_VIA = viaC(HAM_PIN, HAM_HOME.at, [569, 2000, 400])
const drawerSteps: SpecStep[] = [
  {
    id: 'front', title: '抽屉正面拧入螺栓', page: 4, chips: [DRAWER_CHIP],
    desc: '先只拆开一个抽屉的板件。抽屉正面内侧朝上平放，拧入 4 颗偏心螺栓 118331。',
    camera: DRAWER_VIEW,
    set: {
      'd-front': { at: D_STAND.at, rot: D_STAND.rot, lift: 60, dur: 1.4 },
      'd-bolts': seat(1.5, 0.7),
    },
    highlight: ['d-front', 'd-bolts'],
    zoom: { target: stand([359, 146, -30]), dir: [0.5, 1, 0.6], dist: 120, caption: '118331 拧进正面内侧两端' },
    callouts: [
      { part: 'd-front', text: '抽屉正面', sub: '内侧朝上', at: [0, 109, -16], offset: [0, 60, 0] },
      { part: 'd-bolts', text: '偏心螺栓 118331 ×4', at: [-359, 146, -36], offset: [-40, 70, 0] },
    ],
  },
  {
    id: 'sides', title: '插上两块侧板，贴警示标签', page: 4, chips: [DRAWER_CHIP],
    desc: '两块侧板前端各插 2 个木榫 101345，竖着插到正面的螺栓和孔上；左侧板内面贴上警示标签。',
    tip: '警示标签提醒：柜子必须固定在墙上，不要让孩子攀爬抽屉。',
    camera: DRAWER_VIEW,
    set: {
      'd-dw-a': seat(0, 0.6), 'd-dw-b': seat(0.15, 0.6), 'd-label': { visible: true, delay: 0.3, dur: 0.3 },
      'd-side-a': { ...ON_FRONT, via: viaAt(GD.sideA, STRIP.sideA.rot, D_STAND.rot, [-359, 750, 300]), delay: 0.8, dur: 1.8 },
      'd-side-b': { ...ON_FRONT, via: viaAt(GD.sideB, STRIP.sideB.rot, D_STAND.rot, [359, 750, 300]), delay: 1.0, dur: 1.8 },
      'd-bolts': gone(0.8 + 1.8 * 0.6),
    },
    highlight: ['d-side-a', 'd-side-b', 'd-label'],
    callouts: [
      { part: 'd-side-a', text: '左侧板', sub: '木榫 ×2', at: [-365, 173, -236], offset: [-60, 60, 0] },
      { part: 'd-side-b', text: '右侧板', sub: '木榫 ×2', at: [365, 173, -236], offset: [60, 60, 0] },
      { part: 'd-label', text: '警示标签', sub: '贴在左侧板内面', at: [120, 103, -353], offset: [140, 60, 0] },
    ],
  },
  {
    id: 'cams', title: '锁紧侧板', page: 5, chips: [DRAWER_CHIP],
    desc: '在两块侧板外面装入 4 个偏心锁紧件 117434，用一字螺丝刀顺时针拧紧。',
    camera: DRAWER_VIEW,
    set: { screwdriver: { at: SD_DCAM, rot: [0, 0, -90], via: SD_DCAM_VIA, dur: 1.6 } },
    highlight: ['d-side-b', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: stand([365, 146, -50]), dir: [1, 0.6, 0.4], dist: 130, caption: '侧板外面的锁紧件：顺时针拧紧' },
    callouts: [
      { part: 'd-side-b', text: '锁紧件 117434 ×4', sub: '每块侧板 2 个', at: [365, 60, -50], offset: [-60, 60, 40] },
    ],
  },
  {
    id: 'bottom', title: '插入抽屉底板', page: 5, chips: [DRAWER_CHIP],
    desc: '抽屉底板（纤维板）从上方沿两块侧板的槽插到底。',
    camera: DRAWER_VIEW,
    set: {
      screwdriver: home(SD_HOME, SD_DCAM_VIA),
      'd-bottom': { ...ON_FRONT, via: D_BOTTOM_VIA, delay: 0.8, dur: 2.0 },
    },
    highlight: ['d-bottom'],
    callouts: [
      { part: 'd-bottom', text: '抽屉底板', sub: '光面朝里', at: [0, 42, -456], offset: [0, 80, 0] },
    ],
  },
  {
    id: 'back', title: '滑入抽屉背板', page: 6, chips: [DRAWER_CHIP],
    desc: '抽屉背板对准两块侧板末端，推进两块侧板之间，下沿压住底板。',
    camera: DRAWER_VIEW,
    set: { 'd-back': { ...ON_FRONT, via: BACK_VIA, dur: 1.8 } },
    highlight: ['d-back'],
    callouts: [
      { part: 'd-back', text: '抽屉背板', sub: '端部缺口对准侧板', at: [0, 165, -456], offset: [0, 60, 60] },
    ],
  },
  {
    id: 'pins', title: '敲入钉销，压入止动件', page: 6, chips: [DRAWER_CHIP],
    desc: '用锤子把 4 个钉销 110519 穿过侧板敲进背板；再把 2 个止动件 115339 压进正面内侧靠两边的孔。',
    camera: { target: [100, 250, 250], dir: [1, 0.9, -0.08], dist: 1700 },
    set: {
      'd-pins': { visible: true, delay: 1.2, dur: 0.3 },
      'd-stops': { visible: true, delay: 1.4, dur: 0.3 },
      hammer: { at: HAM_PIN, rot: [0, 0, -90], via: HAM_PIN_VIA, dur: 1.6 },
    },
    highlight: ['d-pins', 'd-stops', 'hammer'],
    actions: [{ type: 'shake', part: 'hammer', axis: 'y', amp: 10 }],
    zoom: { target: stand([-330, 12, -17]), dir: [-0.3, 1, -0.35], dist: 150, caption: '止动件 115339 压进正面内侧，推到底时顶住前档' },
    callouts: [
      { part: 'd-pins', text: '钉销 110519 ×4', at: [366, 70, -450], offset: [80, 40, 80] },
      { part: 'd-stops', text: '止动件 115339 ×2', at: [-330, 12, -17], offset: [-80, 60, 0] },
    ],
  },
]

// ---------- 指南 5：装滑轨并推入抽屉 ----------
const SD_ROD = carton([0, 30.5, -440])
const SD_ROD_VIA = viaC(SD_HOME.at, SD_ROD, add(SD_ROD, [0, 1500, 0]))
const runnersSteps: SpecStep[] = [
  {
    id: 'runners', title: '翻过来装滑轨', page: 7, chips: [DRAWER_CHIP],
    desc: '抽屉翻转，底朝上放在纸箱（或桌面）边缘，让正面悬在外面。两块侧板底边各装 1 根滑轨（118790 左、148601 右），每根 3 颗螺丝 100365。',
    camera: { target: [870, 200, 380], dir: [0.4, 1, 0.9], dist: 1900 },
    set: {
      hammer: home(HAM_HOME, HAM_BACK_VIA, 0, 1.2),
      'd-front': { at: D_CARTON.at, rot: D_CARTON.rot, via: viaAt(GD.drawer, D_STAND.rot, D_CARTON.rot, [450, 750, 380]), delay: 1.2, dur: 2.0 },
      'd-runner-a': { ...ON_FRONT, via: viaAt(GD.runnerA, RUNNER_ROT, D_CARTON.rot, [502, 650, 367]), delay: 3.3, dur: 1.3 },
      'd-runner-b': { ...ON_FRONT, via: viaAt(GD.runnerB, RUNNER_ROT, D_CARTON.rot, [1238, 650, 367]), delay: 3.5, dur: 1.3 },
    },
    highlight: ['d-front', 'd-runner-a', 'd-runner-b'],
    zoom: { target: carton([-368, 36, -240]), dir: [-0.4, 1, 0.4], dist: 200, caption: '滑轨贴着侧板底边，滚轮在后端' },
    callouts: [
      { part: 'd-runner-a', text: '滑轨 118790', sub: '螺丝 100365 ×3', at: [-366, 28, -240], offset: [0, 70, 0] },
      { part: 'd-runner-b', text: '滑轨 148601', sub: '螺丝 100365 ×3', at: [366, 28, -240], offset: [0, 70, 0] },
    ],
  },
  {
    id: 'rod', title: '装支撑杆', page: 7, chips: [DRAWER_CHIP],
    desc: '支撑杆 123833 沿底板中线前后放：一端先拧 1 颗螺丝 105344 挂住杆端，转正后在另一端画记号，再拧 1 颗 105344。',
    camera: { target: [870, 200, 380], dir: [0.4, 1, 0.9], dist: 1900 },
    set: {
      'd-rod': { ...ON_FRONT, via: viaAt(GD.rod, RUNNER_ROT, D_CARTON.rot, [870, 650, 367]), dur: 1.4 },
      screwdriver: { at: SD_ROD, rot: ZERO, via: SD_ROD_VIA, delay: 1.5, dur: 1.5 },
    },
    highlight: ['d-rod', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: carton([0, 33, -440]), dir: [0.4, 1, 0.5], dist: 140, caption: '杆端卡在螺丝头上，拧紧 105344' },
    callouts: [
      { part: 'd-rod', text: '支撑杆 123833', sub: '两端各 1 颗 105344', at: [0, 33, -240], offset: [0, 80, 0] },
    ],
  },
  {
    id: 'align', title: '抽屉对准滑轨', page: 8, chips: [DRAWER_CHIP],
    desc: '把抽屉翻回正面朝上，抬到顶层开口前，两边滑轮对准柜体内的滑轨。',
    camera: { target: [100, 520, 200], dir: [0.75, 0.4, 1], dist: 2400 },
    set: {
      screwdriver: home(SD_HOME, SD_ROD_VIA),
      'd-front': { parent: 'side-r', at: [0, FB[0], ALIGN_Z], rot: ZERO, via: viaAt(GD.drawer, D_CARTON.rot, ZERO, [500, 950, 340]), lift: 300, delay: 0.9, dur: 2.2 },
    },
    highlight: ['d-front', 'd-runner-b'],
    callouts: [
      { part: 'd-front', text: '抽屉 1', sub: '对准顶层滑轨', at: [377, 218, 0], offset: [100, 60, 0] },
      { part: 'side-r', text: '柜体滑轨', at: [IN, FB[0] + 34, 195], offset: [120, 40, 60] },
    ],
  },
  {
    id: 'push', title: '水平推入抽屉', page: 8, chips: [DRAWER_CHIP],
    desc: '抽屉前端略抬起，让滑轮进入滑轨，然后水平推到底，止动件顶住前档。',
    camera: { target: [100, 600, 80], dir: [0.85, 0.35, 1], dist: 1900 },
    set: { 'd-front': { at: [0, FB[0], 235], dur: 1.6 } },
    highlight: ['d-front'],
    callouts: [
      { part: 'd-front', text: '推到底', sub: '面板与侧板前沿齐平', at: [377, 109, 0], offset: [100, 40, 0] },
    ],
  },
  {
    id: 'others', title: '另外两个抽屉', page: 24,
    desc: '按同样步骤组装好另外两个抽屉，分别推入中层和底层。',
    camera: { target: [0, 400, 0], dir: [0.6, 0.45, 1], dist: 2600 },
    set: {
      'drawer-2': { visible: true, at: [0, FB[1], 235], dur: 1.6 },
      'drawer-3': { visible: true, at: [0, FB[2], 235], delay: 0.9, dur: 1.6 },
    },
    highlight: ['drawer-2', 'drawer-3'],
    callouts: [
      { part: 'drawer-2', text: '抽屉 2', sub: '中层', at: [377, 109, 0], offset: [100, 40, 0] },
      { part: 'drawer-3', text: '抽屉 3', sub: '底层', at: [377, 109, 0], offset: [100, 40, 0] },
    ],
  },
  {
    id: 'done', title: '完成：安全使用', page: 24,
    desc: '组装完成。拉开顶层抽屉可以看到警示标签。',
    tip: '说明书第 2、24 页：重物放在下层抽屉；不要在柜顶放电视或重物；不要让孩子攀爬或悬挂在抽屉上；一次只拉开一个抽屉。',
    camera: { target: [0, 480, 0], dir: [0.35, 1.3, 1], dist: 2500 },
    set: { 'd-front': { at: [0, FB[0], 485], dur: 1.2 } },
    highlight: ['d-label'],
    orbit: true,
    callouts: [
      { part: 'd-label', text: '警示标签', sub: '在顶层抽屉左侧板内面', at: [120, 103, -353], offset: [-60, 140, 0] },
      { part: 'top', text: '已固定在墙上', sub: '防倾倒角码在柜顶背面', at: [ANCHOR.x, 780, -240], offset: [60, 120, 0] },
    ],
  },
]

export const ikeaMalm: ManualSpec = {
  id: 'ikea-malm',
  name: 'IKEA MALM 马尔姆 三斗抽屉柜',
  desc: '平板家具：柜体 + 3 个抽屉，含防倾倒固定到墙上',
  category: '平板家具',
  dims: { width: 800, depth: 480, height: 780 },
  source: {
    title: 'MALM 马尔姆 三斗抽屉柜 组装说明（柜体 AA-1971367-9 · 抽屉 AA-1971377-2）',
    url: 'https://resources.ikea.cn/cn/zh/assembly_instructions/malm-ma-er-mu-san-dou-chou-ti-gui-bai-se__AA-1971367-9-2.pdf',
    images: [],
  },
  package: [
    { name: '侧面板（118788 / 118789，已装滑轨）', qty: 2 },
    { name: '顶板', qty: 1 },
    { name: '底板 / 中间隔板', qty: 2 },
    { name: '前档', qty: 3 },
    { name: '底座前板', qty: 1 },
    { name: '背板', qty: 1, spec: '纤维板' },
    { name: '五金包 1', qty: 1, spec: '螺栓 14 · 木榫 18 · 锁紧件 14 · 螺丝 8 · 角码 2 · 塑料脚 6 · 钉子 30' },
    { name: '防倾倒安全配件 326949', qty: 1, spec: '角码 2 · 螺丝 2 · 垫圈 4 · 墙螺丝 2 · 膨胀管 2' },
    { name: '抽屉板件', qty: 3, spec: '正面 + 侧板 ×2 + 背板 + 底板' },
    { name: '抽屉滑轨 118790 / 148601', qty: 3, spec: '对' },
    { name: '支撑杆 123833', qty: 3 },
    { name: '五金包 2', qty: 1, spec: '螺栓 / 锁紧件 / 木榫各 12 · 钉销 12 · 螺丝 24 · 止动件 6' },
  ],
  params: [
    { label: '尺寸', value: '宽 80 × 深 48 × 高 78 cm' },
    { label: '抽屉内部', value: '宽 72 × 深 43 cm' },
    { label: '货号', value: '903.546.43', note: '白色' },
    { label: '包装', value: '2 件', note: '29.25 kg + 18.6 kg' },
    { label: '防倾倒', value: '必须固定在墙上', note: '随附五金只适合实心墙' },
    { label: '抽屉说明书', value: 'AA-1971377-2（8 页）', note: 'https://resources.ikea.cn/cn/zh/assembly_instructions/malm-ma-er-mu-san-dou-chou-ti-gui-bai-se__AA-1971377-2-2.pdf' },
  ],
  parts,
  guides: [
    { id: 'check', title: '清点零件与工具', kind: 'usage', start: show('tray-1', 'tray-w', 'tray-2'), steps: checkSteps },
    { id: 'cabinet', title: '组装柜体', kind: 'assembly', start: hide(...STRIP_IDS), steps: cabinetSteps },
    { id: 'wall', title: '固定到墙上（防倾倒）', kind: 'assembly', start: { ...built(UPRIGHT), ...hide(...STRIP_IDS), wall: { visible: true } }, steps: wallSteps },
    { id: 'drawer', title: '组装抽屉', kind: 'assembly', start: { ...built(AT_WALL), ...ANCHORED }, steps: drawerSteps },
    { id: 'runners', title: '装滑轨并推入抽屉', kind: 'assembly', start: { ...built(AT_WALL), ...ANCHORED, ...DRAWER_BUILT, carton: { visible: true } }, steps: runnersSteps },
  ],
  stageSize: 1500,
  finishes: { white: 'board-white', shade: 'zinc', dark: 'zinc', warm: 'wood' },
}
