import { Euler, Quaternion, Vector3 } from 'three'
import type { CameraSpec, Fill, Finish, ManualSpec, PartState, Shape, SpecPart, SpecStep, Vec3 } from '../types'

/**
 * IKEA KALLAX 卡莱克 格架单元（白色 77×147 cm，2×4 格）· 组装说明 AA-2703471-1-2（32 页）
 * 逐页转写：manuals-src/ikea-kallax/transcript.md
 *
 * 柜体坐标 U：原点 = 竖放时底面中心，x 右、y 上、z 前（格口朝 +z）。所有板件几何直接写在 U 里，
 *   装好 = { parent: 'end-a', at: 0, rot: 0 }，整个柜子跟着底端板 end-a（根零件）平躺 / 立起 / 靠墙。
 * 平躺 LIE（说明书第 8–20 页）：格口朝上，底端板在 +z（画面左），顶端在 -z；U(x,y,z) → 世界 (x, z+195, 732.5-y)。
 *   长侧板 A（竖放时左侧）在 -x（远处），长侧板 B 最后从 +x 压上。
 * 板件只平移、不转动：竖隔板沿 +z 推向端板 / 前一块层板，层板沿 -x 推向侧板 A，侧板 B 沿 -x 压上，端板 B 沿 +z 盖上。
 * 木榫 / 螺丝 / 脚垫：插在哪块板上就挂在哪块板上，对接板落位到 ≈65% 时隐藏 = 「插进去了」；螺丝只画板外的头。
 * 墙面 z = -400（只在固定到墙上时出现），柜背离墙 1 mm。
 *
 * 推断（说明书只有示意图）：
 *   外框板厚 39、内板 15、深 390；端板 765、长侧板 1387（夹在两端板之间）、层板 687、竖隔板 335.5（四格等高）。
 *   层板靠侧板上的 4 个木榫定位，竖隔板一端插在 4 个木榫上、另一端靠夹持；第 12 步 16 个 = 3 块层板前端各 4 + 竖隔板 4 自由端 4。
 *   4 个木榫沿板深等距（z = ±50 / ±150）；端板螺丝在侧板中心线 z = ±120。
 *   墙面固定件 115753：约 50×40×40 的 L 形，竖放时装在顶行两格（左格贴侧板 A 内面、右格贴竖隔板 4 右面）后缘，
 *   大孔翼贴墙；横放时装在侧板 B 内面（顶）第 1、4 格。墙螺丝不附带，示意为留 4 mm 间隙；p30 的「3x」按 2 个做。
 * 真实外观：板件是规整的盒子，只给材质（spec.finishes 按 fill，个别零件单独写 finish）：
 *   白色饰面板、原木木榫、镀锌螺丝 / 挂片、白色塑料固定件和盖帽、灰色脚垫、墙面、钻孔、工具手柄。
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
/** 让局部 +y 指向 d（工具从尖端指向手柄） */
const aim = (d: Vec3): Vec3 => euler(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...d).normalize()))
/** 二次贝塞尔控制点 c → k=0.5 的途经点 */
const viaC = (from: Vec3, to: Vec3, c: Vec3): Vec3 => [0, 1, 2].map((i) => round(0.25 * from[i] + 0.5 * c[i] + 0.25 * to[i])) as Vec3
/** 飞到 to，最后一段沿 d 反方向直线伸进去 */
const reach = (from: Vec3, to: Vec3, d: Vec3, len: number): Vec3 => {
  const c = new Vector3(...to).addScaledVector(new Vector3(...d).normalize(), len)
  return viaC(from, to, [c.x, c.y, c.z])
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill?: Fill): Item => ({
  type: 'box',
  size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
  at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  ...(fill ? { fill } : {}),
})
const cyl = (axis: 'x' | 'y' | 'z', r: number, h: number, at: Vec3, fill?: Fill, r2?: number): Item => ({
  type: 'cylinder', axis, r, h, at, ...(r2 !== undefined ? { r2 } : {}), ...(fill ? { fill } : {}),
})
const comp = (items: Item[]): Shape => ({ type: 'compound', items })
const fin = (finish: Finish, items: Item[]): Item[] => items.map((it) => ({ ...it, finish }))
const hide = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
/** 五金从偏移位置落到 0 */
const seat = (delay = 0, dur = 0.6): PartState => ({ visible: true, at: ZERO, delay, dur })
/** 在 t 秒时消失（被对接板盖住） */
const gone = (t: number): PartState => ({ visible: false, delay: t, dur: 0.05 })

// ---------- 尺寸（柜体坐标 U，mm） ----------
const XO = 382.5
const XI = 343.5
const ZB = -195
const ZF = 195
const TOP0 = 1426
const TOP1 = 1465
/** 竖隔板 1–4 的 y 范围（自下而上） */
const DIV: [number, number][] = [1, 2, 3, 4].map((k) => [39 + (k - 1) * 350.5, 39 + (k - 1) * 350.5 + 335.5])
/** 层板 1–3 的 y 范围 */
const SHELF: [number, number][] = [1, 2, 3].map((k) => [39 + k * 335.5 + (k - 1) * 15, 39 + k * 335.5 + (k - 1) * 15 + 15])
const shelfMid = (k: number) => SHELF[k][0] + 7.5
const DZ = [-150, -50, 50, 150]

// ---------- 姿态 ----------
const LIE: Pose = { at: [0, 195, 732.5], rot: [-90, 0, 0] }
const STAND: Pose = { at: [0, 3, 0], rot: ZERO }
const STAND_WALL: Pose = { at: [0, 3, -204], rot: ZERO }
const STAND_ASIDE: Pose = { at: [950, 3, 0], rot: ZERO }
/** 横放：侧板 A 朝下（8 个脚垫），底端板在 +x */
const HORIZ: Pose = { at: [732.5, 385.5, 0], rot: [0, 0, 90] }
const HORIZ_WALL: Pose = { at: [732.5, 385.5, -204], rot: [0, 0, 90] }
const HORIZ_OUT: Pose = { at: [732.5, 385.5, 600], rot: [0, 0, 90] }
const lie = (p: Vec3) => w(LIE, p)
const ON: PartState = { parent: 'end-a', at: ZERO, rot: ZERO }
/** 板件待装位置 = 平躺装好的位置平移 off（世界） */
const wait = (off: Vec3) => ({ at: add(LIE.at, off), rot: LIE.rot })
const DIV_OFF: Vec3 = [0, 0, -380]
const SHELF_OFF: Vec3 = [800, 0, 0]
const SIDE_B_OFF: Vec3 = [450, 0, 0]
const SIDE_B_CHECK: Vec3 = [-1000, 0, 0]
const END_B_OFF: Vec3 = [0, 0, -450]
const SIDE_A_OFF: Vec3 = [0, 0, -200]
/** 平躺的柜子离开 / 回到墙边：先拉到墙前 */
const wallVia = (a: Pose, b: Pose): Vec3 => viaC(a.at, b.at, [0, 3, 0])

// ---------- 板件几何 ----------
const board = (x0: number, x1: number, y0: number, y1: number) => comp([bx(x0, x1, y0, y1, ZB, ZF)])
const dowelsY = (yFace: number): Shape => comp(DZ.map((z) => cyl('y', 4, 15, [0, yFace + 7.5, z], 'warm')))
const dowelsX = (xFace: number, s: 1 | -1, y: number): Shape => comp(DZ.map((z) => cyl('x', 4, 15, [xFace + s * 7.5, y, z], 'warm')))
const screwHeads = (pts: [number, number][], y: number): Shape => comp(pts.map(([x, z]) => cyl('y', 6, 1, [x, y, z], 'shade')))

/** 墙面固定件 115753：xm = 贴板的面，s = 朝格内的方向，yc = 中心高度；大孔翼贴柜背（z = -195） */
const OPEN = 9
const HOLE_A = 28
const bracketItems = (xm: number, s: 1 | -1, yc: number): Item[] => {
  const X = (a: number) => xm + s * a
  return [
    ...fin('plastic-white', [
      bx(X(0), X(3), yc - 20, yc + 20, ZB, ZB + 40),
      bx(X(0), X(HOLE_A - OPEN), yc - 20, yc + 20, ZB, ZB + 3),
      bx(X(HOLE_A + OPEN), X(50), yc - 20, yc + 20, ZB, ZB + 3),
      bx(X(HOLE_A - OPEN), X(HOLE_A + OPEN), yc - 20, yc - OPEN, ZB, ZB + 3),
      bx(X(HOLE_A - OPEN), X(HOLE_A + OPEN), yc + OPEN, yc + 20, ZB, ZB + 3),
    ]),
    ...[-10, 10].map((t) => cyl('x', 4, 1.5, [X(3.75), yc + t, ZB + 23], 'shade')),
  ]
}
const capShape = (xm: number, s: 1 | -1, yc: number): Shape =>
  comp([bx(xm + s * 3.5, xm + s * 52, yc - 22, yc + 22, ZB + 8, ZB + 45)])
const V_FIX = { l: -XI, r: 7.5, y: 1380 }
const H_FIX = { x: XI, y: [207, 1258] }

// ---------- 墙（墙局部：中心 WALL_C，正面 z = +30 → 世界 z = -400） ----------
const WALL_C: Vec3 = [0, 950, -430]
const wl = (p: Vec3): Vec3 => [round(p[0] - WALL_C[0]), round(p[1] - WALL_C[1]), round(p[2] - WALL_C[2])]
const holeV = [V_FIX.l, V_FIX.r].map((xm) => w(STAND_WALL, [xm + HOLE_A, V_FIX.y, ZB]))
const holeH = H_FIX.y.map((yc) => w(HORIZ_WALL, [H_FIX.x - HOLE_A, yc, ZB]))
const marksShape = (hs: Vec3[]) => comp(hs.map((h): Item => ({ type: 'text', text: '+', size: 16, at: [wl(h)[0], wl(h)[1], 30.6] })))
const holesShape = (hs: Vec3[]) => comp(hs.map((h): Item => ({ type: 'hole', w: 6, h: 6, r: 3, at: [wl(h)[0], wl(h)[1], 30.7], fill: 'dark', finish: 'hole' })))
/** 墙螺丝（不附带）：拧紧时头部压住挂片，间隙状态 at = [0, 0, 4] */
const wallScrewShape = (hs: Vec3[]) => comp(hs.flatMap((h): Item[] => {
  const [x, y] = wl(h)
  return [cyl('z', 2.5, 30, [x, y, 21], 'shade'), cyl('z', 5.5, 2, [x, y, 37], 'shade')]
}))
/** 钥匙孔挂片 103693：中间大孔让螺丝头穿过 */
const keyholeShape = (hs: Vec3[]) => comp(hs.flatMap((h): Item[] => {
  const [x, y] = wl(h)
  return [
    bx(x - 15, x - 6, y - 22, y + 22, 34, 36), bx(x + 6, x + 15, y - 22, y + 22, 34, 36),
    bx(x - 6, x + 6, y + 6, y + 22, 34, 36), bx(x - 6, x + 6, y - 22, y - 6, 34, 36),
  ]
}))
const GAP: Vec3 = [0, 0, 4]

// ---------- 工具 ----------
const TOOL_BODY: Finish = { color: '#2f6f8f', roughness: 0.5 }
const KEY_STEEL: Finish = { color: '#3a3d42', roughness: 0.35, metalness: 0.7 }
const keyShape = comp(fin(KEY_STEEL, [cyl('y', 2.5, 30, [0, 15, 0], 'shade'), cyl('x', 2.5, 92, [44, 28, 0], 'shade')]))
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
const levelShape = comp([
  { type: 'box', size: [600, 25, 50], at: [0, 12.5, 0], finish: { color: '#e5b52b', roughness: 0.5 } },
  { type: 'box', size: [60, 12, 2], at: [0, 12.5, 25.5], fill: 'shade', finish: { color: '#9fd86b', roughness: 0.2 } },
])
const KEY_HOME: Pose = { at: [-20, 2.5, 1000], rot: [90, 0, 0] }
const SD_HOME: Pose = { at: [480, 14, 950], rot: [90, 0, 0] }
const PEN_HOME: Pose = { at: [580, 4, 950], rot: [90, 0, 0] }
const HAM_HOME: Pose = { at: [700, 14, 960], rot: [90, 0, 0] }
const DRILL_HOME: Pose = { at: [1080, 35, 900], rot: [0, 0, 90] }
const LEVEL_HOME: Pose = { at: [700, 0, 1250], rot: ZERO }
const home = (p: Pose, via: Vec3, delay = 0, dur = 1.4): PartState => ({ at: p.at, rot: p.rot, via, delay, dur })

// ---------- 五金托盘（清点用） ----------
const trayShape = comp([
  { type: 'slab', w: 380, d: 240, h: 1, r: 10, at: [0, 0, 0], fill: 'warm', finish: 'paper' },
  cyl('x', 3, 50, [-115, 7, -60], 'shade'), cyl('x', 6, 3, [-141.5, 7, -60], 'shade'),
  cyl('x', 4, 30, [-40, 5, -60], 'warm'),
  cyl('x', 2, 16, [40, 5, -60], 'shade'), cyl('x', 4, 2, [31, 5, -60], 'shade'),
  { ...bx(105, 135, 1, 3, -82, -38, 'shade'), finish: 'zinc' },
  { ...cyl('y', 11, 3, [-120, 2.5, 55], 'shade'), finish: 'plastic-grey' },
  ...fin('plastic-white', [bx(-50, -10, 1, 4, 35, 75), bx(-50, -10, 4, 44, 72, 75)]),
  { ...bx(40, 90, 1, 38, 35, 79), finish: 'plastic-white' },
])

// ---------- 零件 ----------
const parts: SpecPart[] = [
  // 板件（几何在 U）
  { id: 'end-a', name: '端板（底）', spec: '厚板 39 mm · 竖放时在底部', shape: board(-XO, XO, 0, 39), ...LIE },
  { id: 'side-a', name: '长侧板 A', spec: '厚板 39 mm · 竖放时在左侧', shape: board(-XO, -XI, 39, TOP0), ...wait(SIDE_A_OFF) },
  ...DIV.map(([y0, y1], i): SpecPart => ({ id: `div-${i + 1}`, name: `竖隔板 ${i + 1}`, spec: '薄板 15 mm', shape: board(-7.5, 7.5, y0, y1), ...wait(DIV_OFF) })),
  ...SHELF.map(([y0, y1], i): SpecPart => ({ id: `shelf-${i + 1}`, name: `层板 ${i + 1}`, spec: '薄板 15 mm', shape: board(-XI, XI, y0, y1), ...wait(SHELF_OFF) })),
  { id: 'side-b', name: '长侧板 B', spec: '厚板 39 mm · 竖放时在右侧', shape: board(XI, XO, 39, TOP0), ...wait(SIDE_B_OFF) },
  { id: 'end-b', name: '端板（顶）', spec: '厚板 39 mm', shape: board(-XO, XO, TOP0, TOP1), ...wait(END_B_OFF) },

  // 木榫 101339（每组 4 个）
  { id: 'dw-2', name: '木榫 101339 ×4', spec: '端板（底）内面 · 给竖隔板 1', parent: 'end-a', shape: dowelsY(39), at: [0, 40, 0], visible: false },
  { id: 'dw-3', name: '木榫 101339 ×4', spec: '侧板 A · 给层板 1', parent: 'side-a', shape: dowelsX(-XI, 1, shelfMid(0)), at: [40, 0, 0], visible: false },
  { id: 'dw-4', name: '木榫 101339 ×4', spec: '层板 1 · 给竖隔板 2', parent: 'shelf-1', shape: dowelsY(SHELF[0][1]), at: [0, 40, 0], visible: false },
  { id: 'dw-6', name: '木榫 101339 ×4', spec: '侧板 A · 给层板 2', parent: 'side-a', shape: dowelsX(-XI, 1, shelfMid(1)), at: [40, 0, 0], visible: false },
  { id: 'dw-7', name: '木榫 101339 ×4', spec: '层板 2 · 给竖隔板 3', parent: 'shelf-2', shape: dowelsY(SHELF[1][1]), at: [0, 40, 0], visible: false },
  { id: 'dw-9', name: '木榫 101339 ×4', spec: '侧板 A · 给层板 3', parent: 'side-a', shape: dowelsX(-XI, 1, shelfMid(2)), at: [40, 0, 0], visible: false },
  { id: 'dw-10', name: '木榫 101339 ×4', spec: '层板 3 · 给竖隔板 4', parent: 'shelf-3', shape: dowelsY(SHELF[2][1]), at: [0, 40, 0], visible: false },
  ...[0, 1, 2].map((k): SpecPart => ({ id: `dw-12-${k + 1}`, name: '木榫 101339 ×4', spec: `层板 ${k + 1} 前端 · 给侧板 B`, parent: `shelf-${k + 1}`, shape: dowelsX(XI, 1, shelfMid(k)), at: [40, 0, 0], visible: false })),
  { id: 'dw-12-4', name: '木榫 101339 ×4', spec: '竖隔板 4 自由端 · 给端板（顶）', parent: 'div-4', shape: dowelsY(TOP0), at: [0, 40, 0], visible: false },

  // 螺丝 104321/104322（只画头）、脚垫
  { id: 'sc-1', name: '螺丝 104321/104322 ×2', spec: '端板（底）→ 侧板 A', parent: 'end-a', shape: screwHeads([[-363, -120], [-363, 120]], -0.5), at: [0, -60, 0], visible: false },
  { id: 'sc-14a', name: '螺丝 104321/104322 ×2', spec: '端板（底）→ 侧板 B', parent: 'end-a', shape: screwHeads([[363, -120], [363, 120]], -0.5), at: [0, -60, 0], visible: false },
  { id: 'sc-14b', name: '螺丝 104321/104322 ×4', spec: '端板（顶）→ 两块侧板', parent: 'end-b', shape: screwHeads([[-363, -120], [-363, 120], [363, -120], [363, 120]], TOP1 + 0.5), at: [0, 60, 0], visible: false },
  { id: 'feet-v', name: '脚垫 153550 ×4', spec: '竖放：底端板', parent: 'end-a', shape: comp([-320, 320].flatMap((x) => [-150, 150].map((z) => cyl('y', 11, 3, [x, -1.5, z], 'shade')))), finish: 'plastic-grey', at: [0, -40, 0], visible: false },
  { id: 'feet-h', name: '脚垫 153550 ×8', spec: '横放：侧板 A 外面', parent: 'side-a', shape: comp([200, 560, 905, 1265].flatMap((y) => [-150, 150].map((z) => cyl('x', 11, 3, [-XO - 1.5, y, z], 'shade')))), finish: 'plastic-grey', at: [-40, 0, 0], visible: false },

  // 墙面固定（竖放）
  { id: 'fix-l', name: '墙面固定件 115753', spec: '左格 · 螺丝 100372 ×2 拧在侧板 A 内面', parent: 'side-a', shape: comp(bracketItems(V_FIX.l, 1, V_FIX.y)), at: [0, 0, 60], visible: false },
  { id: 'fix-r', name: '墙面固定件 115753', spec: '右格 · 螺丝 100372 ×2 拧在竖隔板 4 右面', parent: 'div-4', shape: comp(bracketItems(V_FIX.r, 1, V_FIX.y)), at: [0, 0, 60], visible: false },
  { id: 'cap-l', name: '盖帽 115754', parent: 'fix-l', shape: capShape(V_FIX.l, 1, V_FIX.y), finish: 'plastic-white', at: [0, 0, 60], visible: false },
  { id: 'cap-r', name: '盖帽 115754', parent: 'fix-r', shape: capShape(V_FIX.r, 1, V_FIX.y), finish: 'plastic-white', at: [0, 0, 60], visible: false },
  // 墙面固定（横放）
  { id: 'fix-h', name: '墙面固定件 115753 ×2', spec: '横放：从下面拧进顶部侧板 B', parent: 'side-b', shape: comp(H_FIX.y.flatMap((y) => bracketItems(H_FIX.x, -1, y))), at: [0, 0, 60], visible: false },
  { id: 'cap-h', name: '盖帽 115754 ×2', parent: 'fix-h', shape: comp(H_FIX.y.flatMap((y) => (capShape(H_FIX.x, -1, y) as { items: Item[] }).items)), finish: 'plastic-white', at: [0, 0, 60], visible: false },

  // 墙
  { id: 'wall', name: '墙', shape: { type: 'box', size: [3200, 1900, 60] }, finish: 'wall', at: WALL_C, visible: false },
  { id: 'marks-v', name: '铅笔记号 ×2', parent: 'wall', shape: marksShape(holeV), visible: false },
  { id: 'holes-v', name: '墙孔 ×2', parent: 'wall', shape: holesShape(holeV), visible: false },
  { id: 'screws-v', name: '墙螺丝 ×2（另购）', spec: '按墙体材质选择', parent: 'wall', shape: wallScrewShape(holeV), at: [0, 0, 60], visible: false },
  { id: 'keys-v', name: '钥匙孔挂片 103693 ×2', parent: 'wall', shape: keyholeShape(holeV), finish: 'zinc', at: [0, 0, 40], visible: false },
  { id: 'marks-h', name: '铅笔记号 ×2', parent: 'wall', shape: marksShape(holeH), visible: false },
  { id: 'screws-h', name: '墙螺丝 ×2（另购）', parent: 'wall', shape: wallScrewShape(holeH), at: [0, 0, 60], visible: false },
  { id: 'keys-h', name: '钥匙孔挂片 103693 ×2', parent: 'wall', shape: keyholeShape(holeH), finish: 'zinc', at: [0, 0, 40], visible: false },

  // 工具
  { id: 'key', name: '内六角扳手 100001', shape: keyShape, ...KEY_HOME },
  { id: 'screwdriver', name: '十字螺丝刀', shape: screwdriverShape, ...SD_HOME },
  { id: 'pencil', name: '铅笔', shape: pencilShape, ...PEN_HOME },
  { id: 'hammer', name: '锤子', spec: '轻敲木榫', shape: hammerShape, ...HAM_HOME },
  { id: 'drill', name: '电钻', spec: '按墙螺丝选钻头', shape: drillShape, ...DRILL_HOME },
  { id: 'level', name: '水平仪', shape: levelShape, ...LEVEL_HOME },
  { id: 'tray', name: '五金包', shape: trayShape, at: [-250, 0, 1050], visible: false },
]

// ---------- 状态快照 ----------
const BOARDS = ['side-a', 'div-1', 'div-2', 'div-3', 'div-4', 'shelf-1', 'shelf-2', 'shelf-3', 'side-b', 'end-b']
const LATER = BOARDS.slice(1)
const built = (root: Pose): Record<string, PartState> => ({
  'end-a': { at: root.at, rot: root.rot },
  ...Object.fromEntries(BOARDS.map((id) => [id, ON])),
  ...Object.fromEntries(['sc-1', 'sc-14a', 'sc-14b'].map((id) => [id, { visible: true, at: ZERO }])),
})

// ---------- 镜头 ----------
const LIE_VIEW: CameraSpec = { target: [150, 195, 0], dir: [1, 1, -0.3], dist: 3100 }
const STAND_VIEW: CameraSpec = { target: [0, 760, -150], dir: [0.45, 0.3, 1], dist: 2700 }

// ---------- 指南 1：清点零件与工具 ----------
const checkSteps: SpecStep[] = [
  {
    id: 'boards', title: '清点板件', page: 7,
    desc: '4 块厚板（2 块端板、2 块长侧板）和 7 块薄板（3 块层板、4 块竖隔板）。在软垫或纸箱上组装，板件立在边上。',
    tip: '说明书第 2 页：家具倾倒可能会导致严重甚至致命的压伤。为防止倾倒，请务必使用附带的上墙固定配件。',
    camera: { target: [250, 0, 0], dir: [0.7, 1, 0.55], dist: 3800 },
    highlight: ['end-a', 'side-a', 'side-b', 'end-b', 'shelf-1', 'div-1'],
    callouts: [
      { part: 'end-a', text: '端板 ×2', sub: '765 × 390 × 39', at: [0, 39, ZF], offset: [0, 120, 0] },
      { part: 'side-a', text: '长侧板 ×2', sub: '1387 × 390 × 39', at: [-XO, 700, ZF], offset: [0, 120, 0] },
      { part: 'shelf-2', text: '层板 ×3', sub: '687 × 390 × 15', at: [XI, 740, ZF], offset: [0, 120, 0] },
      { part: 'div-3', text: '竖隔板 ×4', sub: '336 × 390 × 15', at: [0, 900, ZF], offset: [0, 120, 0] },
    ],
  },
  {
    id: 'hardware', title: '清点五金', page: 5,
    desc: '螺丝 104321/104322 ×8、木榫 101339 ×44、内六角扳手 100001 ×1、螺丝 100372 ×4、钥匙孔挂片 103693 ×2、脚垫 153550 ×8。',
    camera: { target: [-180, 0, 1040], dir: [0.15, 1, 0.65], dist: 1100 },
    highlight: ['tray', 'key'],
    zoom: { target: [-155, 6, 990], dir: [0.2, 1, 0.6], dist: 120, caption: '螺丝 104321/104322：穿过端板拧进侧板端头，用内六角扳手' },
    callouts: [
      { part: 'tray', text: '螺丝 104321/104322', sub: '×8', at: [-120, 7, -60], offset: [-40, 40, -50] },
      { part: 'tray', text: '木榫 101339', sub: '×44', at: [-40, 5, -60], offset: [0, 40, -60] },
      { part: 'tray', text: '螺丝 100372', sub: '×4', at: [40, 5, -60], offset: [20, 40, -60] },
      { part: 'tray', text: '挂片 103693', sub: '×2', at: [120, 3, -60], offset: [60, 40, -40] },
      { part: 'tray', text: '脚垫 153550', sub: '×8', at: [-120, 4, 55], offset: [-40, 40, 60] },
      { part: 'key', text: '内六角扳手 100001', sub: '×1', at: [44, 28, 0], offset: [40, 40, 40] },
    ],
  },
  {
    id: 'wall-kit', title: '墙面固定件和盖帽', page: 6,
    desc: '墙面固定件 115753 ×2、盖帽 ×2（货号随颜色：115754 / 118673 / 118225 …）。上墙用的螺钉与螺塞不附带，请按墙体材质另购。',
    tip: '说明书第 2 页：如果不确定墙体用什么螺钉，请寻求专业意见。',
    camera: { target: [-215, 0, 1100], dir: [0.15, 1, 0.75], dist: 650 },
    highlight: ['tray'],
    zoom: { target: [-280, 20, 1112], dir: [0.5, 0.7, 0.9], dist: 160, caption: 'L 形固定件：一翼拧在板上，带大孔的一翼贴墙' },
    callouts: [
      { part: 'tray', text: '墙面固定件 115753', sub: '×2', at: [-30, 30, 74], offset: [-60, 50, 50] },
      { part: 'tray', text: '盖帽', sub: '×2', at: [65, 38, 57], offset: [60, 50, 50] },
    ],
  },
  {
    id: 'tools', title: '准备工具和场地', page: 4,
    desc: '需要十字螺丝刀、一字螺丝刀、铅笔、水平仪和锤子；内六角扳手随附。两人搬运，在软垫上组装。',
    tip: '说明书第 4 页：竖放的格架不固定会倾倒；一个人搬会受伤；直接放在硬地上会磕坏板件。',
    camera: { target: [560, 0, 1090], dir: [0.1, 1, 0.75], dist: 1900 },
    highlight: ['key', 'screwdriver', 'pencil', 'hammer', 'drill', 'level'],
    callouts: [
      { part: 'key', text: '内六角扳手', sub: '随附', at: [0, 15, 0], offset: [-30, 50, 0] },
      { part: 'screwdriver', text: '螺丝刀', sub: '十字 / 一字', at: [0, 165, 0], offset: [0, 60, 0] },
      { part: 'pencil', text: '铅笔', at: [0, 100, 0], offset: [20, 60, -40] },
      { part: 'hammer', text: '锤子', sub: '轻敲木榫', at: [0, 50, 0], offset: [40, 60, -30] },
      { part: 'drill', text: '电钻', sub: '墙上打孔', at: [0, 0, 205], offset: [0, 70, 0] },
      { part: 'level', text: '水平仪', sub: '横放时找平', at: [0, 25, 0], offset: [0, 60, 0] },
    ],
  },
]

// ---------- 指南 2：组装框架与隔板 ----------
const KEY_TIP_A = lie([-363, -1.3, 120])
const KEY_TIP_B = lie([363, TOP1 + 1.3, 120])
const KEY_VIA_A = reach(KEY_HOME.at, KEY_TIP_A, [0.1, 0.4, 1], 400)
const HAM_HIT = lie([0, 54.5, 150])
const HAM_VIA = viaC(HAM_HOME.at, HAM_HIT, [300, 1200, 300])
/** 推入一块板：在 d 秒出现在待装位置，平移落位；它盖住的木榫在 65% 时隐藏 */
const PUSH_D = 1.6
const push = (delay = 0): PartState => ({ visible: true, ...ON, delay, dur: PUSH_D })
const covered = (delay = 0) => gone(delay + PUSH_D * 0.65)
const dwZoomY = (y: number): CameraSpec & { caption: string } => ({ target: lie([0, y + 8, 100]), dir: [0.55, 0.8, -0.6], dist: 280, caption: '4 个木榫插进板面的孔，用锤子轻敲到底' })
const dwZoomX = (y: number): CameraSpec & { caption: string } => ({ target: lie([-336, y, 100]), dir: [1, 0.85, 0.15], dist: 280, caption: '侧板内面插 4 个木榫，给下一块层板' })

const frameSteps: SpecStep[] = [
  {
    id: 'l-frame', title: '端板和长侧板连成 L 形', page: 8,
    desc: '在软垫上把一块端板和一块长侧板立在边上，侧板端头顶住端板内面，用内六角扳手 100001 拧入 2 颗螺丝 104321/104322。',
    tip: '对照图：螺丝要从端板外面靠边的孔穿进去，拧进侧板端头的孔，别拧错孔。',
    camera: { target: [0, 195, 300], dir: [0.9, 0.9, 0.75], dist: 2600 },
    set: {
      'side-a': { ...ON, dur: 1.4 },
      'sc-1': seat(1.5, 0.7),
      key: { at: KEY_TIP_A, rot: aim([0, 0, 1]), via: KEY_VIA_A, delay: 2.2, dur: 1.4 },
    },
    highlight: ['end-a', 'side-a', 'sc-1', 'key'],
    actions: [{ type: 'spin', part: 'key', axis: 'y' }],
    zoom: { target: lie([-363, 0, 120]), dir: [0.6, 0.5, 1], dist: 170, caption: '螺丝 104321/104322 ×2：内六角扳手拧紧' },
    callouts: [
      { part: 'end-a', text: '端板', sub: '竖放时在底部', at: [0, 0, 0], offset: [120, 80, 0] },
      { part: 'side-a', text: '长侧板 A', sub: '立在边上', at: [-XO, 900, ZF], offset: [0, 90, 0] },
    ],
  },
  {
    id: 'dw-2', title: '端板内面敲入 4 个木榫', page: 9,
    desc: '在端板内面中间一列孔里插入 4 个木榫 101339，用锤子轻敲到底。',
    camera: LIE_VIEW,
    set: {
      key: home(KEY_HOME, KEY_VIA_A, 0, 1.2),
      'dw-2': seat(1.0, 0.7),
      hammer: { at: HAM_HIT, rot: aim([0, 0, -1]), via: HAM_VIA, delay: 1.0, dur: 1.4 },
    },
    highlight: ['dw-2', 'hammer'],
    actions: [{ type: 'shake', part: 'hammer', axis: 'y', amp: 8 }],
    zoom: dwZoomY(39),
    callouts: [{ part: 'dw-2', text: '木榫 101339 ×4', sub: '给竖隔板 1', at: [0, 54, -150], offset: [0, 60, -250] }],
  },
  {
    id: 'div-1', title: '推入竖隔板 1，侧板插木榫', page: 9,
    desc: '把竖隔板 1 对准端板上的木榫推到底（第 2 步）；再在侧板 A 内面插 4 个木榫，给层板 1（第 3 步）。',
    camera: LIE_VIEW,
    set: {
      hammer: home(HAM_HOME, HAM_VIA, 0, 1.2),
      'div-1': push(1.2), 'dw-2': covered(1.2),
      'dw-3': seat(3.0, 0.7),
    },
    highlight: ['div-1', 'dw-3'],
    zoom: dwZoomX(shelfMid(0)),
    callouts: [
      { part: 'div-1', text: '竖隔板 1', sub: '推向端板', at: [0, 200, ZF], offset: [0, 90, 0] },
      { part: 'dw-3', text: '木榫 ×4', sub: '给层板 1', at: [-336, shelfMid(0), ZF - 45], offset: [0, 90, 0] },
    ],
  },
  {
    id: 'shelf-1', title: '推入层板 1，再插木榫', page: 10,
    desc: '层板 1 贴着竖隔板 1 的端头推向侧板 A，插到木榫上（第 3 步）；然后在层板 1 另一面中间插 4 个木榫，给竖隔板 2（第 4 步）。',
    camera: LIE_VIEW,
    set: { 'shelf-1': push(0), 'dw-3': covered(0), 'dw-4': seat(1.8, 0.7) },
    highlight: ['shelf-1', 'dw-4'],
    zoom: dwZoomY(SHELF[0][1]),
    callouts: [
      { part: 'shelf-1', text: '层板 1', sub: '推向侧板 A', at: [XI, SHELF[0][1], ZF], offset: [0, 90, 0] },
      { part: 'dw-4', text: '木榫 ×4', sub: '给竖隔板 2', at: [0, SHELF[0][1] + 15, -150], offset: [0, 60, -250] },
    ],
  },
  {
    id: 'div-2', title: '推入竖隔板 2，侧板插木榫', page: 12,
    desc: '竖隔板 2 推到层板 1 的木榫上（第 5 步）；侧板 A 内面插 4 个木榫，给层板 2（第 6 步）。',
    camera: LIE_VIEW,
    set: { 'div-2': push(0), 'dw-4': covered(0), 'dw-6': seat(1.8, 0.7) },
    highlight: ['div-2', 'dw-6'],
    zoom: dwZoomX(shelfMid(1)),
    callouts: [
      { part: 'div-2', text: '竖隔板 2', at: [0, DIV[1][0] + 160, ZF], offset: [0, 90, 0] },
      { part: 'dw-6', text: '木榫 ×4', sub: '给层板 2', at: [-336, shelfMid(1), ZF - 45], offset: [0, 90, 0] },
    ],
  },
  {
    id: 'shelf-2', title: '推入层板 2，再插木榫', page: 12,
    desc: '层板 2 推向侧板 A（第 6 步）；层板 2 另一面插 4 个木榫，给竖隔板 3（第 7 步）。',
    camera: LIE_VIEW,
    set: { 'shelf-2': push(0), 'dw-6': covered(0), 'dw-7': seat(1.8, 0.7) },
    highlight: ['shelf-2', 'dw-7'],
    zoom: dwZoomY(SHELF[1][1]),
    callouts: [
      { part: 'shelf-2', text: '层板 2', at: [XI, SHELF[1][1], ZF], offset: [0, 90, 0] },
      { part: 'dw-7', text: '木榫 ×4', sub: '给竖隔板 3', at: [0, SHELF[1][1] + 15, -150], offset: [0, 60, -250] },
    ],
  },
  {
    id: 'div-3', title: '推入竖隔板 3，侧板插木榫', page: 14,
    desc: '竖隔板 3 推到层板 2 的木榫上（第 8 步）；侧板 A 内面插 4 个木榫，给层板 3（第 9 步）。',
    camera: LIE_VIEW,
    set: { 'div-3': push(0), 'dw-7': covered(0), 'dw-9': seat(1.8, 0.7) },
    highlight: ['div-3', 'dw-9'],
    zoom: dwZoomX(shelfMid(2)),
    callouts: [
      { part: 'div-3', text: '竖隔板 3', at: [0, DIV[2][0] + 160, ZF], offset: [0, 90, 0] },
      { part: 'dw-9', text: '木榫 ×4', sub: '给层板 3', at: [-336, shelfMid(2), ZF - 45], offset: [0, 90, 0] },
    ],
  },
  {
    id: 'shelf-3', title: '推入层板 3，再插木榫', page: 15,
    desc: '层板 3 推向侧板 A（第 9 步）；层板 3 另一面插 4 个木榫，给竖隔板 4（第 10 步）。',
    camera: LIE_VIEW,
    set: { 'shelf-3': push(0), 'dw-9': covered(0), 'dw-10': seat(1.8, 0.7) },
    highlight: ['shelf-3', 'dw-10'],
    zoom: dwZoomY(SHELF[2][1]),
    callouts: [
      { part: 'shelf-3', text: '层板 3', at: [XI, SHELF[2][1], ZF], offset: [0, 90, 0] },
      { part: 'dw-10', text: '木榫 ×4', sub: '给竖隔板 4', at: [0, SHELF[2][1] + 15, -150], offset: [0, 60, -250] },
    ],
  },
  {
    id: 'div-4', title: '推入竖隔板 4，插 16 个木榫', page: 17,
    desc: '竖隔板 4 推到层板 3 的木榫上（第 11 步）；然后 3 块层板的前端各插 4 个、竖隔板 4 的自由端插 4 个，共 16 个木榫（第 12 步）。',
    camera: { ...LIE_VIEW, dir: [1, 0.85, 0.2] },
    set: {
      'div-4': push(0), 'dw-10': covered(0),
      'dw-12-1': seat(1.8, 0.6), 'dw-12-2': seat(2.0, 0.6), 'dw-12-3': seat(2.2, 0.6), 'dw-12-4': seat(2.4, 0.6),
    },
    highlight: ['div-4', 'dw-12-1', 'dw-12-2', 'dw-12-3', 'dw-12-4'],
    zoom: { target: lie([351, shelfMid(1), 100]), dir: [1, 0.7, 0.2], dist: 300, caption: '层板前端各 4 个木榫，留给侧板 B' },
    callouts: [
      { part: 'div-4', text: '竖隔板 4', at: [0, DIV[3][0] + 160, ZF], offset: [0, 90, 0] },
      { part: 'dw-12-2', text: '木榫 ×16', sub: '层板前端 3×4 + 竖隔板 4 端头 4', at: [358, shelfMid(1), 150], offset: [0, 100, 0] },
    ],
  },
  {
    id: 'side-b', title: '压上长侧板 B', page: 19,
    desc: '第二块长侧板孔朝里，对准 3 块层板前端的 12 个木榫，两人一起均匀压到底。',
    tip: '对照小图：侧板上的孔朝内；先对准一端再慢慢压另一端。',
    camera: LIE_VIEW,
    set: { 'side-b': push(0), 'dw-12-1': covered(0), 'dw-12-2': covered(0), 'dw-12-3': covered(0) },
    highlight: ['side-b'],
    callouts: [{ part: 'side-b', text: '长侧板 B', sub: '孔朝里', at: [XO, 700, ZF], offset: [0, 90, 0] }],
  },
  {
    id: 'end-b', title: '盖上另一块端板，拧 6 颗螺丝', page: 20,
    desc: '另一块端板对准竖隔板 4 端头的木榫盖上，用内六角扳手拧 4 颗螺丝连两块侧板；第一块端板与侧板 B 之间再拧 2 颗，共 6 颗 104321/104322。',
    camera: { target: [100, 195, -150], dir: [0.8, 0.9, -0.7], dist: 2800 },
    set: {
      'end-b': push(0), 'dw-12-4': covered(0),
      'sc-14b': seat(1.7, 0.6), 'sc-14a': seat(1.9, 0.6),
      key: { at: KEY_TIP_B, rot: aim([0, 0, -1]), via: viaC(KEY_HOME.at, KEY_TIP_B, [800, 1000, -1100]), delay: 2.0, dur: 1.6 },
    },
    highlight: ['end-b', 'sc-14b', 'key'],
    actions: [{ type: 'spin', part: 'key', axis: 'y' }],
    zoom: { target: lie([363, TOP1, 120]), dir: [0.6, 0.5, -1], dist: 170, caption: '端板四角各 1 颗螺丝，另一端补 2 颗' },
    callouts: [
      { part: 'end-b', text: '端板（顶）', sub: '螺丝 ×4', at: [-200, TOP1, 0], offset: [0, 90, 0] },
    ],
  },
]

// ---------- 指南 3：竖放并固定到墙上 ----------
const FIX_L_SCREW = w(STAND, [V_FIX.l + 7.8, V_FIX.y - 10, ZB + 23])
const SD_FIX_DIR: Vec3 = [0.5, -0.1, 1]
const SD_FIX_VIA = reach(SD_HOME.at, FIX_L_SCREW, SD_FIX_DIR, 650)
const PEN_DIR: Vec3 = [0.3, -0.12, 1]
const PEN_TIP_V: Vec3 = [holeV[0][0], holeV[0][1], -399.5]
const PEN_VIA_V = reach(PEN_HOME.at, PEN_TIP_V, PEN_DIR, 700)
const DRILL_V: Vec3 = [holeV[0][0], holeV[0][1], -399.5]
const SD_GAP_V: Vec3 = [holeV[0][0], holeV[0][1], -387.8]
const SD_GAP_VIA = viaC(SD_HOME.at, SD_GAP_V, add(SD_GAP_V, [0, 500, 800]))
const SD_TIGHT_DIR: Vec3 = [0.25, -0.1, 1]
const SD_TIGHT_V: Vec3 = [holeV[1][0], holeV[1][1], -387.8]
const SD_TIGHT_VIA = reach(SD_HOME.at, SD_TIGHT_V, SD_TIGHT_DIR, 700)
const zoomHole = (h: Vec3, caption: string, dir: Vec3 = [0.35, -0.2, 1]): CameraSpec & { caption: string } => ({ target: [h[0], h[1], -395], dir, dist: 200, caption })

const verticalSteps: SpecStep[] = [
  {
    id: 'feet', title: '竖放：底端板压 4 个脚垫', page: 21,
    desc: '决定竖放时，在底端板（第一块端板）外面四角压入 4 个脚垫 153550。',
    camera: { target: lie([0, 0, 0]), dir: [0.75, 0.6, 1], dist: 1700 },
    set: { 'feet-v': seat(0, 0.8) },
    highlight: ['feet-v'],
    zoom: { target: lie([320, -2, 150]), dir: [0.5, 0.5, 1], dist: 130, caption: '脚垫 153550：用手按进去' },
    callouts: [{ part: 'feet-v', text: '脚垫 153550 ×4', sub: '底端板四角', at: [-320, -3, 150], offset: [-60, 80, 60] }],
  },
  {
    id: 'stand-up', title: '两人把格架立起来', page: 21,
    desc: '两人抬起，底端板朝下立起格架。',
    tip: '说明书第 4 页：两人搬运，不要一个人抬。',
    camera: { target: [0, 700, 150], dir: [0.8, 0.45, 1], dist: 3900 },
    set: { 'end-a': { at: STAND.at, rot: STAND.rot, lift: 320, dur: 2.4 } },
    highlight: ['end-a', 'side-a', 'side-b', 'end-b'],
    callouts: [{ part: 'side-b', text: '竖放', sub: '77 × 147 cm', at: [XO, 1100, ZF], offset: [150, 60, 0] }],
  },
  {
    id: 'brackets', title: '顶行两格装墙面固定件', page: 22,
    desc: '用十字螺丝刀把 2 个墙面固定件 115753 各用 2 颗螺丝 100372 拧在顶行两格的后缘：左格拧在侧板内面，右格拧在中间竖隔板上，带大孔的一翼贴着柜背。',
    tip: '说明书第 22 页：这件家具必须固定在墙上，否则可能倾倒。',
    camera: { target: [-150, 1250, -100], dir: [0.4, 0.15, 1], dist: 1500 },
    set: {
      wall: { visible: true },
      'fix-l': seat(0, 0.7), 'fix-r': seat(0.3, 0.7),
      screwdriver: { at: FIX_L_SCREW, rot: aim(SD_FIX_DIR), via: SD_FIX_VIA, delay: 1.0, dur: 1.6 },
    },
    highlight: ['fix-l', 'fix-r', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: { target: w(STAND, [V_FIX.l + 20, V_FIX.y, ZB + 10]), dir: [0.35, -0.12, 1], dist: 190, caption: '固定件 115753：2 颗 100372 拧在侧板内面，大孔翼贴柜背' },
    callouts: [
      { part: 'fix-l', text: '固定件 115753', sub: '左格 · 贴侧板', at: [V_FIX.l + 25, V_FIX.y - 20, ZB], offset: [-120, -160, 60] },
      { part: 'fix-r', text: '固定件 115753', sub: '右格 · 贴竖隔板', at: [V_FIX.r + 25, V_FIX.y - 20, ZB], offset: [120, -160, 60] },
    ],
  },
  {
    id: 'mark', title: '靠墙，透过大孔画记号', page: 23,
    desc: '把格架推到墙边放好，用铅笔透过两个固定件的大孔在墙上各画一个记号。',
    camera: STAND_VIEW,
    set: {
      screwdriver: home(SD_HOME, SD_FIX_VIA, 0, 1.2),
      'end-a': { at: STAND_WALL.at, rot: STAND_WALL.rot, delay: 0.6, dur: 1.4 },
      pencil: { at: PEN_TIP_V, rot: aim(PEN_DIR), via: PEN_VIA_V, delay: 2.1, dur: 1.6 },
      'marks-v': { visible: true, delay: 3.6, dur: 0.3 },
    },
    highlight: ['pencil', 'marks-v'],
    actions: [{ type: 'shake', part: 'pencil', axis: 'x', amp: 3 }],
    zoom: zoomHole(holeV[0], '铅笔穿过固定件的大孔，在墙上点记号'),
    callouts: [{ part: 'fix-r', text: '两个大孔各画 1 个记号', at: [V_FIX.r + HOLE_A, V_FIX.y, ZB], offset: [250, -220, 100] }],
  },
  {
    id: 'move-away', title: '移开格架', page: 24,
    desc: '收回铅笔，把格架从墙边挪开，露出墙上的两个记号。',
    camera: { target: [450, 700, -200], dir: [0.3, 0.35, 1], dist: 3400 },
    set: {
      pencil: home(PEN_HOME, PEN_VIA_V, 0, 1.4),
      'end-a': { at: STAND_ASIDE.at, rot: STAND_ASIDE.rot, via: wallVia(STAND_WALL, STAND_ASIDE), delay: 1.4, dur: 1.8 },
    },
    highlight: ['end-a', 'marks-v'],
    callouts: [{ part: 'marks-v', text: '墙上的记号 ×2', at: wl(holeV[0]), offset: [-150, -250, 150] }],
  },
  {
    id: 'drill', title: '按墙体在记号处打孔', page: 24,
    desc: '上墙用的螺钉与螺塞需另外购买：按墙体材质选择，需要时用电钻在两个记号处打孔、塞入螺塞。',
    tip: '打孔前确认墙里没有水管、电线。不确定墙体用什么五金时请寻求专业意见。',
    camera: { target: [-150, 1200, -380], dir: [0.4, 0.2, 1], dist: 1400 },
    set: {
      drill: { at: DRILL_V, rot: ZERO, via: [300, 1300, 300], dur: 1.6 },
      'holes-v': { visible: true, delay: 1.7, dur: 0.3 },
      'marks-v': gone(1.7),
    },
    highlight: ['drill', 'holes-v'],
    actions: [{ type: 'shake', part: 'drill', axis: 'z', amp: 5 }],
    zoom: zoomHole(holeV[0], '钻头垂直于墙面，对准记号', [-0.7, 0.3, 1]),
    callouts: [{ part: 'holes-v', text: '墙孔 ×2', at: wl(holeV[1]), offset: [120, 100, 0] }],
  },
  {
    id: 'wall-screws', title: '拧入墙螺丝，留出间隙', page: 24,
    desc: '在两个孔里拧入合适的墙螺丝（不附带），不要拧到底，螺丝头和墙面之间留几毫米间隙，用来挂挂片。',
    tip: '对照图：螺丝头离开墙面 ✓；拧到贴墙 ✗。',
    camera: { target: [-150, 1200, -380], dir: [0.4, 0.2, 1], dist: 1400 },
    set: {
      drill: home(DRILL_HOME, [600, 1300, 400], 0, 1.4),
      'screws-v': { visible: true, at: GAP, delay: 1.2, dur: 0.8 },
      screwdriver: { at: SD_GAP_V, rot: aim([0, 0, 1]), via: SD_GAP_VIA, delay: 1.2, dur: 1.6 },
    },
    highlight: ['screws-v', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y' }],
    zoom: zoomHole(holeV[0], '螺丝头留出间隙，不要拧到底', [-1, 0.25, 0.6]),
    callouts: [{ part: 'screws-v', text: '墙螺丝 ×2（另购）', sub: '按墙体材质选择', at: wl(holeV[1]), offset: [120, 100, 0] }],
  },
  {
    id: 'push-back', title: '格架推回墙边', page: 25,
    desc: '把格架推回原位，墙螺丝头从固定件的大孔里穿过来。',
    camera: STAND_VIEW,
    set: {
      screwdriver: home(SD_HOME, SD_GAP_VIA, 0, 1.4),
      'end-a': { at: STAND_WALL.at, rot: STAND_WALL.rot, via: wallVia(STAND_ASIDE, STAND_WALL), delay: 1.3, dur: 2.0 },
    },
    highlight: ['end-a', 'fix-l', 'fix-r'],
    zoom: zoomHole(holeV[1], '螺丝头从大孔里穿出'),
    callouts: [{ part: 'end-a', text: '推回原位', at: [XO, 700, ZF], offset: [120, 60, 0] }],
  },
  {
    id: 'hang', title: '挂上钥匙孔挂片，拧紧', page: 25,
    desc: '把钥匙孔挂片 103693 挂到螺丝头上，滑进固定件；格架可以上下、左右微调，位置合适后拧紧墙螺丝。',
    camera: { target: [-150, 1250, -250], dir: [0.4, 0.1, 1], dist: 1500 },
    set: {
      'keys-v': { visible: true, at: ZERO, dur: 0.9 },
      screwdriver: { at: SD_TIGHT_V, rot: aim(SD_TIGHT_DIR), via: SD_TIGHT_VIA, delay: 0.9, dur: 1.6 },
      'screws-v': { at: ZERO, delay: 2.6, dur: 0.6 },
    },
    highlight: ['keys-v', 'screwdriver'],
    actions: [{ type: 'spin', part: 'screwdriver', axis: 'y', delay: 2.6 }],
    zoom: zoomHole(holeV[1], '挂片挂在螺丝头上，可上下左右微调，再拧紧'),
    callouts: [{ part: 'keys-v', text: '挂片 103693 ×2', sub: '上下 / 左右可调', at: wl(holeV[0]), offset: [-150, 150, 150] }],
  },
  {
    id: 'caps', title: '盖上盖帽，完成', page: 25,
    desc: '收起螺丝刀，把盖帽推到两个固定件上。格架已经固定在墙上，可以放东西了。',
    tip: '顶部最多承重 25 kg。搬家或换位置时要重新固定。',
    camera: { target: [0, 760, -200], dir: [0.5, 0.35, 1], dist: 2800 },
    set: {
      screwdriver: home(SD_HOME, SD_TIGHT_VIA, 0, 1.4),
      'cap-l': seat(1.3, 0.7), 'cap-r': seat(1.5, 0.7),
    },
    highlight: ['cap-l', 'cap-r'],
    orbit: true,
    callouts: [{ part: 'cap-r', text: '盖帽 ×2', at: [V_FIX.r + 50, V_FIX.y - 22, ZB + 45], offset: [150, -220, 150] }],
  },
]

// ---------- 指南 4：横放 ----------
const PEN_TIP_H: Vec3 = [holeH[0][0], holeH[0][1], -399.5]
const PEN_DIR_H: Vec3 = [-0.25, -0.15, 1]
const PEN_VIA_H = reach(PEN_HOME.at, PEN_TIP_H, PEN_DIR_H, 700)
const LEVEL_ON: Vec3 = [0, 768, -204]
const H_VIEW: CameraSpec = { target: [0, 450, -200], dir: [0.4, 0.4, 1], dist: 2800 }

const horizontalSteps: SpecStep[] = [
  {
    id: 'feet-h', title: '横放：长侧板压 8 个脚垫', page: 26,
    desc: '决定横放时，在作为底面的长侧板 A 外面压入 8 个脚垫 153550。',
    camera: { target: [-382, 195, 0], dir: [-1, 0.7, 0.35], dist: 2600 },
    set: { 'feet-h': seat(0, 0.8) },
    highlight: ['feet-h'],
    zoom: { target: lie([-385, 200, 150]), dir: [-1, 0.5, 0.4], dist: 130, caption: '脚垫 153550 ×8：沿长边两排' },
    callouts: [{ part: 'feet-h', text: '脚垫 153550 ×8', at: [-XO - 3, 905, 150], offset: [-60, 100, 0] }],
  },
  {
    id: 'turn-h', title: '放平，顶部装墙面固定件', page: 27,
    desc: '两人把格架横过来放平。2 个墙面固定件 115753 从下面拧进顶部侧板 B 的内面（两端的格子里），各 2 颗螺丝 100372，大孔翼贴柜背。',
    tip: '说明书第 27 页：横放也必须固定在墙上。',
    camera: { target: [0, 450, 0], dir: [0.35, 0.02, 1], dist: 3000 },
    set: {
      'end-a': { at: HORIZ.at, rot: HORIZ.rot, lift: 450, dur: 2.6 },
      'fix-h': seat(2.8, 0.7),
    },
    highlight: ['end-a', 'fix-h'],
    zoom: { target: w(HORIZ, [XI - 20, H_FIX.y[0], ZB + 10]), dir: [-0.3, -0.25, 1], dist: 200, caption: '固定件拧在顶板底面，大孔翼贴柜背' },
    callouts: [{ part: 'fix-h', text: '固定件 115753 ×2', sub: '螺丝 100372 ×4', at: [XI - 25, H_FIX.y[1], ZB], offset: [-150, -150, 150] }],
  },
  {
    id: 'mark-h', title: '靠墙找平，画记号', page: 28,
    desc: '格架推到墙边，用水平仪在顶面找平，铅笔透过两个固定件的大孔在墙上画记号。',
    camera: H_VIEW,
    set: {
      wall: { visible: true },
      'end-a': { at: HORIZ_WALL.at, rot: HORIZ_WALL.rot, dur: 1.4 },
      level: { at: LEVEL_ON, rot: ZERO, via: [400, 1100, 600], delay: 1.4, dur: 1.4 },
      pencil: { at: PEN_TIP_H, rot: aim(PEN_DIR_H), via: PEN_VIA_H, delay: 2.6, dur: 1.6 },
      'marks-h': { visible: true, delay: 4.1, dur: 0.3 },
    },
    highlight: ['level', 'pencil', 'marks-h'],
    zoom: zoomHole(holeH[0], '铅笔穿过大孔点记号', [-0.35, -0.2, 1]),
    callouts: [{ part: 'level', text: '水平仪', sub: '顶面找平', at: [0, 25, 0], offset: [0, 120, 80] }],
  },
  {
    id: 'screws-h', title: '移开，拧墙螺丝留间隙', page: 29,
    desc: '移开格架，按墙体在记号处打孔，拧入 2 颗墙螺丝（不附带），螺丝头留出间隙。',
    camera: { target: [0, 600, -300], dir: [0.3, 0.45, 1], dist: 2600 },
    set: {
      level: home(LEVEL_HOME, [400, 1100, 600], 0, 1.2),
      pencil: home(PEN_HOME, PEN_VIA_H, 0, 1.2),
      'end-a': { at: HORIZ_OUT.at, rot: HORIZ_OUT.rot, delay: 1.2, dur: 1.6 },
      'screws-h': { visible: true, at: GAP, delay: 2.9, dur: 0.8 },
    },
    highlight: ['screws-h', 'marks-h'],
    zoom: zoomHole(holeH[1], '螺丝头留出间隙，不要拧到底', [-1, 0.3, 0.6]),
    callouts: [{ part: 'screws-h', text: '墙螺丝 ×2（另购）', at: wl(holeH[1]), offset: [0, 150, 80] }],
  },
  {
    id: 'hang-h', title: '推回，挂片、拧紧、盖帽', page: 30,
    desc: '格架推回墙边，挂片 103693 挂到螺丝头上滑进固定件，微调后拧紧，再盖上盖帽。',
    camera: { ...H_VIEW, dir: [0.4, 0.15, 1] },
    set: {
      'end-a': { at: HORIZ_WALL.at, rot: HORIZ_WALL.rot, dur: 1.6 },
      'keys-h': { visible: true, at: ZERO, delay: 1.7, dur: 0.8 },
      'screws-h': { at: ZERO, delay: 2.6, dur: 0.6 },
      'cap-h': seat(3.3, 0.7),
    },
    highlight: ['end-a', 'cap-h'],
    orbit: true,
    zoom: zoomHole(holeH[0], '挂片可上下左右微调，拧紧后盖上盖帽', [-0.35, -0.25, 1]),
    callouts: [{ part: 'cap-h', text: '盖帽 ×2', at: [XI - 52, H_FIX.y[0], ZB + 45], offset: [0, -150, 150] }],
  },
]

export const ikeaKallax: ManualSpec = {
  id: 'ikea-kallax',
  name: 'IKEA KALLAX 卡莱克 格架单元 77×147 cm 白色',
  desc: '平板家具：2×4 格，木榫 + 8 颗螺丝，竖放 / 横放并固定到墙上',
  category: '平板家具',
  dims: { width: 765, depth: 390, height: 1465 },
  source: {
    title: 'KALLAX 卡莱克 格架单元 组装说明 AA-2703471-1-2',
    url: 'https://resources.ikea.cn/cn/zh/assembly_instructions/kallax-qia-lai-ke-ge-jia-dan-yuan-bai-se__AA-2703471-1-2.pdf',
    images: [],
  },
  package: [
    { name: '端板', qty: 2, spec: '765 × 390 × 39 mm' },
    { name: '长侧板', qty: 2, spec: '1387 × 390 × 39 mm' },
    { name: '层板', qty: 3, spec: '687 × 390 × 15 mm' },
    { name: '竖隔板', qty: 4, spec: '336 × 390 × 15 mm' },
    { name: '螺丝 104321/104322', qty: 8 },
    { name: '木榫 101339', qty: 44 },
    { name: '内六角扳手 100001', qty: 1 },
    { name: '螺丝 100372', qty: 4 },
    { name: '钥匙孔挂片 103693', qty: 2 },
    { name: '脚垫 153550', qty: 8, spec: '竖放用 4 个，横放用 8 个' },
    { name: '墙面固定件 115753', qty: 2 },
    { name: '盖帽 115754 等（按颜色）', qty: 2 },
  ],
  params: [
    { label: '尺寸', value: '宽 76.5 × 深 39 × 高 146.5 cm', note: '横放时 146.5 × 76.5' },
    { label: '格子', value: '2 × 4 格', note: '每格内净约 33.5 × 33.5 cm（推断）' },
    { label: '重量', value: '29.6 kg' },
    { label: '顶部承重', value: '≤ 25 kg' },
    { label: '墙面固定', value: '必须固定', note: '墙螺钉与螺塞不附带，按墙体材质另购' },
  ],
  parts,
  guides: [
    { id: 'check', title: '清点零件与工具', kind: 'usage', start: { 'side-b': { at: add(LIE.at, SIDE_B_CHECK) }, tray: { visible: true } }, steps: checkSteps },
    { id: 'frame', title: '组装框架与隔板', kind: 'assembly', start: hide(...LATER), steps: frameSteps },
    { id: 'vertical', title: '竖放并固定到墙上', kind: 'assembly', start: built(LIE), steps: verticalSteps },
    { id: 'horizontal', title: '横放并固定到墙上', kind: 'assembly', start: built(LIE), steps: horizontalSteps },
  ],
  stageSize: 1500,
  finishes: { white: 'board-white', shade: 'zinc', dark: 'zinc', warm: 'wood' },
}