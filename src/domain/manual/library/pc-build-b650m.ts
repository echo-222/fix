import type { CameraSpec, Fill, ManualSpec, PartModel, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 电脑装机操作清单 · 以微星 MAG B650M MORTAR WIFI（MS-7D76，Micro-ATX）为例
 * 依据：官方《MAG B650M MORTAR WIFI 使用手册》多语言合订本，简体中文部分为 PDF 第 359–408 页；
 * 每步 page 写的是 PDF 页码（= 中文印刷页 + 358），直接对应官方 PDF。
 *
 * 场景：桌面 y=0，观众在 +Z。主板盒在左前（主板平放在盒上完成外安装），开放式中塔机箱在右后，
 * 显示器在左后，电源 / 显卡 / 小零件摆在桌上。
 * 机箱局部：原点在底面中心，前面板 +x、后面板（I/O、挡片、电源位）-x，侧板拆掉的开口朝 +z，主板托盘在 z=-101。
 * 主板局部：原点在 PCB 中心，PCB 底面 y=0、元件面 +y；俯视时 I/O 在 -x，CPU_PWR 上沿在 -z，PCIe 在 +z
 *   （与说明书第 383 页组件概述图同向）。装进机箱：rot [90,0,0]，主板 -z → 世界 +y，元件面 → 世界 +z。
 * 位置取自第 383 页组件概述图（244 mm 板宽按比例量取）与第 368 页螺丝孔图；第 384 页给出 CPU 中心到最近内存槽 53.6 mm。
 *
 * 推断（说明书未给）：机箱 450 × 210 × 450 mm 及后部开孔布局；配件按一套常见搭配举例——微星 RTX 4060 VENTUS 2X 显卡、
 * 微星 MAG A650BN 电源、AMD Wraith Stealth 原装散热器、金士顿 FURY Beast DDR5 内存（外观模型照这几款的官方图生成）；
 * 插座 / 压杆 / 压板、内存槽间距、各插针高度按 AM5 / DDR5 常见规格；
 * EZ Debug 灯正常开机时依次闪过（说明书只给含义）；排障处理对照说明书各安装页。
 * VGA 灯说明书为白色，画面里用浅蓝表示「亮」（白底上纯白看不出亮灭）。
 */

type Item = Shape & { at?: Vec3; rot?: Vec3; fill?: Fill }
const bx = (size: Vec3, at: Vec3, fill?: Fill, chamfer?: number): Item => ({ type: 'box', size, at, fill, chamfer })
const cy = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', fill?: Fill): Item => ({ type: 'cylinder', r, h, axis, at, fill })
const hl = (w: number, h: number, at: Vec3, rot: Vec3, fill?: Fill): Item => ({ type: 'hole', w, h, at, rot, fill })

// ---------- 世界布局 ----------
const CASE_AT: Vec3 = [200, 0, -120]
const BOX_AT: Vec3 = [-300, 0, 60]
const BOX_H = 60
/** 主板在盒上 / 机箱里（机箱局部）的位置 */
const MB_BOX: Vec3 = [BOX_AT[0], BOX_H, BOX_AT[2]]
const MB_CASE: Vec3 = [-94, 306, -95]
const UP: Vec3 = [90, 0, 0]

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
/** via 是二次贝塞尔在 k = 0.5 经过的点；反推出让控制点落在 c 的 via（c 在终点正上方 = 末段垂直落下） */
const ctrl = (p0: Vec3, p1: Vec3, c: Vec3): Vec3 => [(c[0] + (p0[0] + p1[0]) / 2) / 2, (c[1] + (p0[1] + p1[1]) / 2) / 2, (c[2] + (p0[2] + p1[2]) / 2) / 2]
const caseW = (x: number, y: number, z: number): Vec3 => add(CASE_AT, [x, y, z])
/** 主板局部 → 世界：主板平放在盒上 */
const onBox = (x: number, y: number, z: number): Vec3 => add(MB_BOX, [x, y, z])
/** 主板局部 → 世界：主板装在机箱里（rot [90,0,0]：局部 (x,y,z) → 机箱 (x,-z,y)） */
const inCase = (x: number, y: number, z: number): Vec3 => caseW(MB_CASE[0] + x, MB_CASE[1] - z, MB_CASE[2] + y)

// ---------- 主板尺寸（主板局部，mm） ----------
const T = 1.6
const SOCK = { x: 3, z: -36, top: T + 5 }
const DIMM = { a1: 56.5, a2: 64.5, b1: 73.5, b2: 81.5, z: -27, top: T + 9 }
const PCIE = { x: -34.5, z: 62, top: T + 11 }
const M2 = { x: -58.2, y: T + 3, z: 39.5 }
const ATX = { x: 110, z: -34, top: T + 16 }
const EPS = { x: -73.5, z: -113.5, top: T + 16 }
const FAN = { x: 46, z: -102, top: T + 6 }
const JFP = { x: 55.73, z: 116, top: T + 8.5 }
const USB3 = { x: 111, z: 72, top: T + 9 }
const LED_X = 118
/** 第 368 页 8 个螺丝孔 */
const HOLES: [number, number][] = [[-89, -116], [42.6, -116], [113, -116], [-106, 40], [44, 40], [113, 40], [-106, 87], [45, 105]]

// ---------- 颜色 ----------
const RED = '#ff3b30'
const YELLOW = '#f5b400'
const WHITE_LIT = '#8fb4ff'
const GREEN = '#22b04b'

// 外观模型：Tripo 用真实产品的官方图生成（型号与图片来源见 models/pc-build-b650m/refs/sources.json）。
// 生成结果的朝向用 model:info + /scripts/model-views.html 逐个看过，rot 把模型轴转到下面各零件的局部轴。
/** 金士顿 FURY Beast DDR5：模型直立、金手指朝 -y、长边沿 z → 零件局部金手指朝 +x */
const RAM_MODEL: PartModel = { src: '/models/pc-build-b650m/ram.glb', rot: [0, 0, 90], fit: 'stretch' }

// ---------- 桌面摆放（世界坐标） ----------
const CPU_DESK: Vec3 = [-110, 0, 240]
const RAM1_DESK: Vec3 = [-370, 3, 240]
const RAM2_DESK: Vec3 = [-220, 3, 240]
const SSD_DESK: Vec3 = [-60, 1.1, 300]
const COOLER_DESK: Vec3 = [-60, 0, 60]
const CAP_DESK: Vec3 = [-300, -1.2, 330]
const SINK_DESK: Vec3 = [-60, 0, 150]
const PASTE_DESK: Vec3 = [-80, 10, 175]

// ---------- 姿态 ----------
const CPU_IN: PartState = { parent: 'mb', at: [SOCK.x, SOCK.top - 1.5, SOCK.z], rot: [0, 0, 0] }
const COOLER_ON: PartState = { parent: 'mb', at: [SOCK.x, SOCK.top - 1.5 + 3.8 + 0.8, SOCK.z], rot: [0, 0, 0] }
const SSD_FLAT: PartState = { parent: 'mb', at: [M2.x, M2.y, M2.z], rot: [0, 180, 0] }
const CAP_ASIDE: PartState = { parent: null, at: CAP_DESK, rot: [0, 0, 0] }
const SINK_ON: PartState = { parent: 'mb', at: [-17, 7.4, M2.z], rot: [0, 0, 0] }
const SINK_ASIDE: PartState = { parent: null, at: SINK_DESK, rot: [0, 0, 0] }
/** 主板在盒上时各安装点的世界坐标（算 via 用） */
const W = {
  cpu: onBox(SOCK.x, SOCK.top - 1.5, SOCK.z),
  cap: onBox(SOCK.x, SOCK.top, SOCK.z),
  a2: onBox(DIMM.a2, DIMM.top + 0.05, DIMM.z),
  b2: onBox(DIMM.b2, DIMM.top + 0.05, DIMM.z),
  m2: onBox(M2.x, M2.y, M2.z),
  sink: onBox(-17, 7.4, M2.z),
  cooler: onBox(SOCK.x, SOCK.top - 1.5 + 3.8 + 0.8, SOCK.z),
}
const SINK_VIA = ctrl(W.sink, SINK_DESK, add(W.sink, [0, 250, 0]))
/** 前面板跳线先放在机箱底板上（机箱局部）；JFP1 上方被显卡挡住，只能从显卡下方水平插进去 */
const JFP_TOP_DESK: Vec3 = [-20, 5.3, 60]
const JFP_BOT_DESK: Vec3 = [-20, 5.3, 80]
const jfpVia = (from: Vec3, rowZ: number): Vec3 => {
  const hole = inCase(JFP.x, JFP.top + 0.05, rowZ)
  return ctrl(caseW(...from), hole, add(hole, [0, 0, 60]))
}
const LEVER_UP: Vec3 = [-95, 0, 0]
const PLATE_OPEN: Vec3 = [-105, 0, 0]
const LATCH_OPEN: Vec3 = [-30, 0, 0]
const PCIE_LATCH_OPEN: Vec3 = [0, 0, -35]
const CLIP_LOCK: Vec3 = [0, 180, 0]
const MB_OUTSIDE: PartState = { parent: null, at: caseW(MB_CASE[0] + 10, MB_CASE[1], MB_CASE[2] + 250), rot: UP, lift: 60, dur: 2 }
const MB_NEAR: PartState = { parent: 'case', at: [MB_CASE[0] + 10, MB_CASE[1], MB_CASE[2]], rot: UP, dur: 1.8 }
const MB_FINAL: PartState = { parent: 'case', at: MB_CASE, rot: UP }
const PSU_OUTSIDE: PartState = { parent: null, at: caseW(-147, 4, 200), rot: [0, 0, 0], lift: 40, dur: 1.6 }
const PSU_IN: PartState = { parent: 'case', at: [-147, 4, 0], rot: [0, 0, 0] }
const GPU_OUTSIDE: PartState = { parent: null, at: caseW(-128.5, 244, -82.35 + 200), rot: [0, 90, 0], lift: 120, dur: 2 }
const COVERS_AT: Vec3 = [-220.25, 227, -35]
const COVERS_ASIDE: PartState = { parent: null, at: [300, 0.8, 170], rot: [0, 0, 90] }
const PCI_SCREWS_AT: Vec3 = [-214, 226, 28.3]
const SCREWS_ASIDE: PartState = { parent: null, at: [250, 3.4, 200], rot: [0, 0, 90] }
const DRIVER_DESK: PartState = { parent: null, at: [200, 14, 250], rot: [0, 0, 90] }
/** 螺丝刀尖抵在主板右上角螺丝孔（第 368 页 3 号孔）上，刀身朝 +z 伸出机箱开口 */
const DRIVER_MB: PartState = { parent: null, at: inCase(HOLES[2][0], T + 2.5, HOLES[2][1]), rot: UP, dur: 1.8 }
/** 螺丝刀尖抵在显卡挡片螺丝上 */
const DRIVER_PCI: PartState = { parent: null, at: caseW(-214, 236, 30.3), rot: UP, dur: 1.8 }

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [20, 140, -40], dir: [0.12, 0.75, 1], dist: 1950 }
const DESK_TOOLS: CameraSpec = { target: [20, 170, -60], dir: [0.3, 0.5, 1], dist: 1750 }
const BOARD_TOP: CameraSpec = { target: onBox(0, 10, 0), dir: [0.12, 1, 0.55], dist: 640 }
const SOCKET_CAM: CameraSpec = { target: onBox(SOCK.x, 22, SOCK.z), dir: [0.45, 0.85, 1], dist: 380 }
const DIMM_CAM: CameraSpec = { target: onBox(68, 24, DIMM.z), dir: [0.55, 0.75, 1], dist: 470 }
const M2_CAM: CameraSpec = { target: onBox(-20, 12, M2.z), dir: [0.3, 0.9, 1], dist: 380 }
const M2_WIDE: CameraSpec = { target: onBox(90, 20, 80), dir: [0.3, 0.9, 1], dist: 640 }
const CASE_CAM: CameraSpec = { target: caseW(-20, 250, -60), dir: [0.3, 0.32, 1], dist: 1250 }
const CASE_IN: CameraSpec = { target: inCase(10, 20, 0), dir: [0.3, 0.12, 1], dist: 900 }
const PSU_CAM: CameraSpec = { target: caseW(-120, 90, 20), dir: [0.35, 0.45, 1], dist: 900 }
const GPU_CAM: CameraSpec = { target: caseW(-110, 230, 0), dir: [0.35, 0.25, 1], dist: 820 }
const REAR_CAM: CameraSpec = { target: caseW(-226, 60, 40), dir: [-1, 0.45, 0.55], dist: 520 }
const POST_CAM: CameraSpec = { target: [-60, 270, -220], dir: [0.12, 0.18, 1], dist: 1750 }
const SCREEN_CAM: CameraSpec = { target: 'screen', dir: [0.1, 0.12, 1], dist: 900 }
const zoomLeds = (caption: string, dir: Vec3 = [0.25, 0.3, 1]) => ({ target: 'led-dram', offset: [0, -3, 0] as Vec3, dir, dist: 95, caption })

// ---------- 屏幕 ----------
const POST: ScreenUI = {
  app: 'MSI', title: 'MAG B650M MORTAR WIFI',
  items: [
    { text: 'Press DEL key to enter Setup Menu', sub: 'Delete', state: 'selected' },
    { text: 'F11 to enter Boot Menu', sub: 'F11', state: 'muted' },
  ],
}
const BIOS: ScreenUI = {
  app: 'MSI Click BIOS', title: 'EZ Mode · BIOS 模式：UEFI',
  items: [
    { text: 'CPU', sub: 'AMD Ryzen 7000 系列', state: 'done' },
    { text: '内存', sub: 'DDR5 × 2 · DIMMA2 + DIMMB2', state: 'done' },
    { text: '启动设备', sub: 'M.2 SSD · M2_1', state: 'done' },
  ],
}
const BIOS_F6: ScreenUI = {
  app: 'MSI Click BIOS', title: 'Load Optimized Defaults?',
  items: [
    { text: 'F6 载入优化设置默认值', state: 'selected' },
    { text: 'F10 保存更改并重新启动', state: 'muted' },
  ],
  button: 'Yes', buttonActive: true,
}

// ---------- 插头（原点在插头与外壳交界，插头朝局部 +x） ----------
const plug = (prong: Vec3, body: Vec3): Shape => ({
  type: 'compound',
  items: [bx(prong, [prong[0] / 2, 0, 0], 'dark'), bx(body, [-body[0] / 2, 0, 0], undefined, 0.8)],
})
const dupont = (len: number): Shape => ({
  type: 'compound',
  items: [bx([14, 2.3, len], [-1, 0, -2.6], 'dark'), bx([14, 2.3, len], [-1, 0, 2.6], 'dark')],
})

// ---------- 主板（PCB + 不会动的元件合成一个零件） ----------
const MB_SHAPE: Shape = {
  type: 'compound',
  items: [
    { type: 'slab', w: 244, d: 244, h: T, r: 3, at: [0, 0, 0] },
    // I/O 挡块、供电散热片、芯片组散热片
    bx([31, 40, 142], [-115.5, T + 20, -43], 'shade', 2),
    bx([24, 30, 92], [-87, T + 15, -56], 'shade', 2),
    bx([56, 26, 26], [-45, T + 13, -94], 'shade', 2),
    bx([26, 9, 26], [66, T + 4.5, 78], 'shade', 1.5),
    // AM5 插座底座 + 散热器固定模块
    bx([50, 5, 60], [SOCK.x, T + 2.5, SOCK.z], 'shade'),
    bx([64, 7, 8], [SOCK.x, T + 3.5, SOCK.z - 37]),
    bx([64, 7, 8], [SOCK.x, T + 3.5, SOCK.z + 37]),
    // 内存槽 ×4 + A1 / B1 卡扣
    bx([6.5, 9, 142], [DIMM.a1, T + 4.5, DIMM.z]),
    bx([6.5, 9, 142], [DIMM.a2, T + 4.5, DIMM.z]),
    bx([6.5, 9, 142], [DIMM.b1, T + 4.5, DIMM.z]),
    bx([6.5, 9, 142], [DIMM.b2, T + 4.5, DIMM.z]),
    bx([6.5, 10, 4], [DIMM.a1, T + 5, -100]),
    bx([6.5, 10, 4], [DIMM.b1, T + 5, -100]),
    // PCIe：PCI_E1 x16、PCI_E2 x1、PCI_E3 x16（x4）
    bx([89, 11, 7.5], [PCIE.x, T + 5.5, PCIE.z]),
    bx([25, 11, 7.5], [-66.5, T + 5.5, 81]),
    bx([89, 11, 7.5], [PCIE.x, T + 5.5, 100]),
    bx([6, 7, 7.5], [13, T + 3.5, 100]),
    // M2_1 接口与 2280 螺柱、M2_2 散热片
    bx([5.7, 4.5, 22], [M2.x - 2.95, T + 2.25, M2.z], 'dark'),
    cy(2.5, 1.8, [21, T + 0.9, M2.z], 'y', 'shade'),
    bx([86, 7, 24], [-5, T + 3.5, 80], 'shade', 1.5),
    // 电源 / 风扇 / 前面板 / USB 插针
    bx([10, 16, 52], [ATX.x, T + 8, ATX.z]),
    bx([18.5, 16, 10], [EPS.x, T + 8, EPS.z]),
    bx([18.5, 16, 10], [-55, T + 8, EPS.z]),
    bx([10, 6, 5], [FAN.x, T + 3, FAN.z]),
    bx([13, 2.5, 5.5], [57, T + 1.25, JFP.z], 'dark'),
    bx([12.7, 6, 5.1], [57, T + 5.5, JFP.z], 'shade'),
    bx([9, 9, 21], [USB3.x, T + 4.5, USB3.z]),
    bx([13, 8.5, 5.5], [-99.5, T + 4.25, 116], 'shade'),
    bx([12, 8.5, 5.5], [4.5, T + 4.25, 116], 'shade'),
    bx([12, 8.5, 5.5], [25, T + 4.25, 116], 'shade'),
    bx([5, 6, 2.5], [-36, T + 3, 116.5], 'shade'),
    // SATA、纽扣电池
    bx([16, 14, 32], [114, T + 7, 100]),
    bx([30, 8, 7], [83, T + 4, 116]),
    cy(10, 3.2, [-92, T + 1.6, 62], 'y', 'shade'),
    // 后置 I/O（从机箱背面看）
    hl(18, 8, [-131.1, T + 14, -100], [0, -90, 0], 'dark'),
    hl(15, 6, [-131.1, T + 26, -100], [0, -90, 0], 'dark'),
    hl(16, 14, [-131.1, T + 12, -76], [0, -90, 0], 'dark'),
    hl(28, 30, [-131.1, T + 20, -20], [0, -90, 0], 'dark'),
  ],
}

// ---------- 机箱（开放式中塔，侧板拆掉） ----------
const CASE_SHAPE: Shape = {
  type: 'compound',
  items: [
    bx([450, 450, 4], [0, 225, -103]),
    bx([450, 4, 206], [0, 2, 2]),
    bx([450, 4, 206], [0, 448, 2]),
    bx([6, 442, 206], [222, 225, 2]),
    // 后面板：I/O 开孔 y 270–432 / z -95…-49，挡片区 y 140–250，电源位 y 4–92 / z -75…75
    bx([4, 354, 85], [-223, 269, 62.5]),
    bx([4, 88, 30], [-223, 48, 90]),
    bx([4, 442, 6], [-223, 225, -98]),
    bx([4, 14, 115], [-223, 439, -37.5]),
    bx([4, 162, 69], [-223, 351, -14.5]),
    bx([4, 20, 115], [-223, 260, -37.5]),
    bx([4, 48, 115], [-223, 116, -37.5]),
    bx([4, 88, 20], [-223, 48, -85]),
    // 下面两块固定挡片 + 挡片螺丝托架
    bx([1.5, 61, 110], [-220.25, 170.5, -35], 'shade'),
    bx([12, 61, 1.5], [-215, 170.5, 25.75], 'shade'),
    bx([12, 60, 2], [-215, 170, 24], 'shade'),
    // 前面板上沿的开机键底座
    bx([60, 2, 40], [185, 450.5, 40], 'shade'),
  ],
}

const parts: SpecPart[] = [
  // ===== 场景道具 =====
  { id: 'mb-box', name: '主板包装盒', spec: '防静电：主板不装时放回盒上', shape: { type: 'slab', w: 290, d: 270, h: BOX_H, r: 4 }, at: BOX_AT, fill: 'warm' },
  { id: 'case', name: '机箱（中塔，侧板已拆）', spec: '450 × 210 × 450 mm（示意）', shape: CASE_SHAPE, at: CASE_AT },
  {
    id: 'standoffs', name: '铜柱 ×8', spec: '对应主板 8 个螺丝孔', parent: 'case',
    shape: { type: 'compound', items: HOLES.map(([x, z]) => cy(3.2, 6, [MB_CASE[0] + x, MB_CASE[1] - z, -98], 'z', 'shade')) },
  },
  { id: 'power-btn', name: '机箱电源键', parent: 'case', shape: { type: 'cylinder', r: 8, h: 3, axis: 'y' }, at: [185, 453, 40] },
  {
    id: 'monitor', name: '显示器', spec: '开机测试用',
    shape: { type: 'compound', items: [bx([220, 8, 160], [0, 4, 0]), bx([40, 150, 18], [0, 83, -40]), bx([560, 330, 24], [0, 290, -20], undefined, 4)] },
    at: [-330, 0, -320],
  },
  { id: 'screen', name: '显示器屏幕', parent: 'monitor', shape: { type: 'screen', w: 530, h: 298 }, at: [0, 290, -7.9], visible: false },
  {
    id: 'driver', name: '飞利浦螺丝刀',
    shape: { type: 'compound', items: [cy(2.5, 95, [0, 47.5, 0], 'y', 'shade'), cy(14, 100, [0, 145, 0])] },
    at: DRIVER_DESK.at as Vec3, rot: DRIVER_DESK.rot,
  },
  {
    id: 'paste', name: '导热膏',
    shape: { type: 'compound', items: [cy(1, 10, [0, 5, 0], 'y', 'shade'), cy(7, 70, [0, 45, 0]), cy(10, 2, [0, 81, 0]), cy(3, 15, [0, 89.5, 0], 'y', 'shade')] },
    at: PASTE_DESK, rot: [0, 0, -90],
  },

  // ===== 主板 =====
  { id: 'mb', name: 'MAG B650M MORTAR WIFI 主板', spec: 'Micro-ATX 244 × 244 mm · AM5 · B650', shape: MB_SHAPE, at: MB_BOX },
  {
    id: 'lever', name: 'CPU 插座压杆', parent: 'mb',
    shape: { type: 'compound', items: [bx([2.5, 2.5, 56], [0, 0, 28], 'shade'), bx([6, 2.5, 3], [3, 0, 55], 'shade')] },
    at: [30, T + 3, -64],
  },
  {
    id: 'load-plate', name: 'CPU 压板', parent: 'mb',
    shape: { type: 'compound', items: [bx([48, 1.2, 9], [0, 0.6, 4.5], 'shade'), bx([48, 1.2, 9], [0, 0.6, 51.5], 'shade'), bx([5, 1.2, 38], [-21.5, 0.6, 28], 'shade'), bx([5, 1.2, 38], [21.5, 0.6, 28], 'shade')] },
    at: [SOCK.x, SOCK.top, -64],
  },
  {
    id: 'socket-cap', name: 'CPU 插座保护盖', spec: '保留，RMA 时需要', parent: 'load-plate',
    shape: { type: 'compound', items: [bx([44, 1.5, 50], [0, 4.5, 0], 'dark'), bx([3, 2.6, 50], [-22.5, 2.5, 0], 'dark'), bx([3, 2.6, 50], [22.5, 2.5, 0], 'dark')] },
    at: [0, 0, 28],
  },
  { id: 'socket-mark', name: '插座三角标记', parent: 'mb', shape: { type: 'text', text: '▲', size: 3 }, at: [-19.5, SOCK.top + 0.05, -13], rot: [-90, 0, 0] },
  {
    id: 'cpu', name: 'AMD AM5 CPU', spec: '40 × 40 mm · 金色三角 = Pin 1',
    shape: { type: 'compound', items: [bx([40, 1.2, 40], [0, 0.6, 0], 'shade'), bx([34, 2.6, 34], [0, 2.5, 0], undefined, 1)] },
    at: CPU_DESK,
  },
  { id: 'cpu-mark', name: 'CPU 金色三角', parent: 'cpu', shape: { type: 'text', text: '▲', size: 3 }, at: [-18.5, 1.25, 18.5], rot: [-90, 0, 0] },
  { id: 'paste-dot', name: '导热膏（一小团）', parent: 'cpu', shape: { type: 'cylinder', r: 6, h: 0.8, axis: 'y' }, at: [0, 4.2, 0], fill: 'shade', visible: false },
  {
    id: 'dimm-latch', name: 'DIMMA2 / DIMMB2 卡扣', parent: 'mb',
    shape: { type: 'compound', items: [bx([6.5, 10, 4], [DIMM.a2, 5, -2]), bx([6.5, 10, 4], [DIMM.b2, 5, -2])] },
    at: [0, T, -98],
  },
  { id: 'slot-a2', name: 'DIMMA2 插槽', parent: 'mb', shape: { type: 'hole', w: 135, h: 2.4 }, at: [DIMM.a2, DIMM.top + 0.05, DIMM.z], rot: [-90, 0, 90], fill: 'dark' },
  { id: 'slot-b2', name: 'DIMMB2 插槽', parent: 'mb', shape: { type: 'hole', w: 135, h: 2.4 }, at: [DIMM.b2, DIMM.top + 0.05, DIMM.z], rot: [-90, 0, 90], fill: 'dark' },
  { id: 'ram-1', name: 'DDR5 内存 ①', spec: '插 DIMMA2 · 示例：金士顿 FURY Beast', model: RAM_MODEL, shape: { type: 'compound', items: [bx([36, 1.2, 133], [-13, 0, 0], 'shade'), bx([30, 6, 128], [-17, 0, 0], undefined, 1)] }, at: RAM1_DESK, rot: [0, 90, 0] },
  { id: 'ram-2', name: 'DDR5 内存 ②', spec: '插 DIMMB2 · 示例：金士顿 FURY Beast', model: RAM_MODEL, shape: { type: 'compound', items: [bx([36, 1.2, 133], [-13, 0, 0], 'shade'), bx([30, 6, 128], [-17, 0, 0], undefined, 1)] }, at: RAM2_DESK, rot: [0, 90, 0] },
  { id: 'm2-sink', name: 'M.2 冰霜铠甲散热片', parent: 'mb', shape: { type: 'slab', w: 94, d: 26, h: 6, r: 2 }, at: SINK_ON.at, fill: 'shade' },
  { id: 'm2-slot', name: 'M2_1 接口', parent: 'mb', shape: { type: 'hole', w: 20, h: 3 }, at: [M2.x, M2.y, M2.z], rot: [-90, 60, 90], fill: 'dark' },
  { id: 'ssd', name: 'M.2 固态硬盘', spec: '2280 · PCIe 4.0 x4', shape: { type: 'box', size: [80, 2.2, 22] }, pivot: [-40, 0, 0], at: SSD_DESK, rot: [0, 180, 0] },
  {
    id: 'm2-clip', name: '简易 M.2 卡扣', parent: 'mb',
    shape: { type: 'compound', items: [cy(1.5, 4.2, [0, 2.1, 0], 'y', 'shade'), bx([6, 1.4, 3], [2.5, 4.9, 0], 'shade')] },
    at: [23.5, T, M2.z], rot: [0, 90, 0],
  },
  {
    id: 'cooler', name: 'AM5 CPU 散热器', spec: '示例：AMD Wraith Stealth（锐龙 5 7600 盒装附带）',
    model: { src: '/models/pc-build-b650m/cooler.glb', fit: 'stretch' },
    shape: { type: 'compound', items: [bx([72, 34, 66], [0, 17, 0]), bx([88, 22, 88], [0, 45, 0], undefined, 5), cy(38, 1.5, [0, 56.8, 0], 'y', 'shade'), cy(13, 2, [0, 57.5, 0])] },
    at: COOLER_DESK,
  },
  { id: 'fan-plug', name: 'CPU 风扇插头', spec: '4-pin', parent: 'cooler', shape: plug([5, 4, 8.5], [10, 5, 10.5]), at: [52, 4, -40], rot: [0, 90, 0] },
  {
    id: 'fan-cable', name: 'CPU 风扇线',
    shape: { type: 'cable', from: { part: 'cooler', at: [44.5, 45, -30], dir: [1, 0, 0] }, to: { part: 'fan-plug', at: [-10, 0, 0], dir: [-1, 0, 0] }, r: 1.2, slack: 1 },
  },
  { id: 'cpu-fan', name: 'CPU_FAN1 风扇接口', parent: 'mb', shape: { type: 'hole', w: 9, h: 4 }, at: [FAN.x, FAN.top + 0.05, FAN.z], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'pcie-latch', name: 'PCI_E1 卡扣', parent: 'mb', shape: { type: 'compound', items: [bx([6, 7, 7.5], [3, 3.5, 0])] }, at: [10, T, PCIE.z] },
  { id: 'pcie-slot', name: 'PCI_E1 插槽（PCIe 4.0 x16）', parent: 'mb', shape: { type: 'hole', w: 86, h: 2.4 }, at: [PCIE.x, PCIE.top + 0.05, PCIE.z], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'atx-hole', name: 'ATX_PWR1（24-pin）', parent: 'mb', shape: { type: 'hole', w: 50, h: 8 }, at: [ATX.x, ATX.top + 0.05, ATX.z], rot: [-90, 0, 90], fill: 'dark' },
  { id: 'eps-hole', name: 'CPU_PWR1（8-pin）', parent: 'mb', shape: { type: 'hole', w: 17, h: 8 }, at: [EPS.x, EPS.top + 0.05, EPS.z], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'jfp-hole-top', name: 'JFP1 上排（2–8）', parent: 'mb', shape: { type: 'hole', w: 10, h: 2.3 }, at: [JFP.x, JFP.top + 0.05, JFP.z - 1.27], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'jfp-hole-bot', name: 'JFP1 下排（1–7）', parent: 'mb', shape: { type: 'hole', w: 10, h: 2.3 }, at: [JFP.x, JFP.top + 0.05, JFP.z + 1.27], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'usb-hole', name: 'JUSB3（USB 3.2 Gen 1）', parent: 'mb', shape: { type: 'hole', w: 19, h: 7 }, at: [USB3.x, USB3.top + 0.05, USB3.z], rot: [-90, 0, 90], fill: 'dark' },
  { id: 'led-cpu', name: 'EZ Debug · CPU 灯', parent: 'mb', shape: { type: 'led', r: 1.5, color: RED }, at: [LED_X, T + 0.05, -76], rot: [-90, 0, 0] },
  { id: 'led-dram', name: 'EZ Debug · DRAM 灯', parent: 'mb', shape: { type: 'led', r: 1.5, color: YELLOW }, at: [LED_X, T + 0.05, -71], rot: [-90, 0, 0] },
  { id: 'led-vga', name: 'EZ Debug · VGA 灯', parent: 'mb', shape: { type: 'led', r: 1.5, color: WHITE_LIT }, at: [LED_X, T + 0.05, -66], rot: [-90, 0, 0] },
  { id: 'led-boot', name: 'EZ Debug · BOOT 灯', parent: 'mb', shape: { type: 'led', r: 1.5, color: GREEN }, at: [LED_X, T + 0.05, -61], rot: [-90, 0, 0] },
  {
    id: 'mb-screws', name: '主板螺丝 ×8', spec: '转矩 3 kgf·cm', parent: 'mb',
    shape: { type: 'compound', items: HOLES.map(([x, z]) => cy(3.6, 2, [x, T + 1, z], 'y', 'shade')) },
    at: [0, 16, 0], visible: false,
  },

  // ===== 显卡（原点在金手指与插槽交界，金手指朝 +x；+z 为卡长方向，挡板在 -z 端） =====
  {
    id: 'gpu', name: '显卡', spec: '示例：微星 RTX 4060 VENTUS 2X（约 199 mm 双风扇）',
    // 模型风扇面 +x、挡板 +z、金手指 -y
    model: { src: '/models/pc-build-b650m/gpu.glb', rot: [180, 0, 90], fit: 'stretch' },
    shape: {
      type: 'compound',
      items: [
        bx([7, 1.6, 85], [2.5, 0, 0], 'shade'),
        bx([103, 4, 205], [-51.5, 1.2, 11]),
        bx([97, 40, 198], [-55.5, -21.5, 11], undefined, 4),
        cy(38, 2, [-55.5, -42.5, -38], 'y', 'shade'),
        cy(38, 2, [-55.5, -42.5, 60], 'y', 'shade'),
        bx([110, 42, 1.5], [-52.35, -19, -91.5], 'shade'),
        bx([1.5, 42, 12], [-108.4, -19, -85.5], 'shade'),
        bx([6, 10, 22], [-101, -14, 80], 'dark'),
      ],
    },
    at: [560, 3.3, 60], rot: [0, -90, 180],
  },
  { id: 'gpu-pwr', name: '显卡 8-pin 供电口', parent: 'gpu', shape: { type: 'hole', w: 18, h: 8.5 }, at: [-104.1, -14, 80], rot: [0, -90, 0], fill: 'dark' },
  {
    id: 'slot-covers', name: '机箱 PCIe 挡片 ×2', parent: 'case',
    shape: { type: 'compound', items: [bx([1.5, 46, 110], [0, 0, 0], 'shade'), bx([12, 46, 1.5], [5.25, 0, 60.75], 'shade')] },
    at: COVERS_AT,
  },
  { id: 'pci-screws', name: '挡片螺丝 ×2', parent: 'case', shape: { type: 'compound', items: [cy(3.4, 3, [0, 10, 0], 'z', 'shade'), cy(3.4, 3, [0, -10, 0], 'z', 'shade')] }, at: PCI_SCREWS_AT },

  // ===== 电源（原点在底面中心；背面 -x：开关、AC 插口；+x 面出线） =====
  {
    id: 'psu', name: 'ATX 电源', spec: '示例：微星 MAG A650BN（150 × 86 × 140 mm）',
    // 模型背板（AC 插口；开关在参考图里抹平了，用几何体）朝 +x，出线端朝 -x 多生成了一个把手似的线缆环；
    // 转 180° 让背板朝零件 -x，线缆环到 +x 裁掉，留一小截线头：线缆直接长在前面板上，齐根裁会露洞（A650BN 本来就是直出线）
    model: { src: '/models/pc-build-b650m/psu.glb', rot: [0, 180, 0], fit: 'stretch', crop: { max: [0.84, 1, 1] } },
    shape: {
      type: 'compound',
      items: [
        bx([140, 86, 150], [0, 43, 0], undefined, 2),
        { type: 'hole', w: 116, h: 116, r: 58, at: [0, 86.1, 0], rot: [-90, 0, 0], fill: 'shade' },
        hl(28, 20, [-70.1, 45, 30], [0, -90, 0], 'dark'),
        hl(60, 56, [-70.1, 45, -30], [0, -90, 0], 'shade'),
      ],
    },
    at: [330, 0, 150],
  },
  { id: 'psu-switch', name: '电源开关（O / I）', parent: 'psu', shape: { type: 'box', size: [2, 10, 7], chamfer: 0.4 }, at: [-70.5, 45, 58], rot: [0, 0, -15], fill: 'dark' },

  // ===== 电源线：插头先挂在机箱底部，接线时插到主板 / 显卡 =====
  { id: 'atx-plug', name: '24-pin 主板供电插头', parent: 'case', shape: plug([6, 8, 50], [20, 10, 53]), at: [40, 9.1, 50], visible: false },
  { id: 'atx-cable', name: '24-pin 线', shape: { type: 'cable', from: { part: 'psu', at: [70, 60, 40], dir: [1, 0, 0] }, to: { part: 'atx-plug', at: [-20, 0, 0], dir: [-1, 0, 0] }, r: 4, slack: 1 }, visible: false },
  { id: 'eps-plug', name: 'CPU 8-pin 供电插头', parent: 'case', shape: plug([6, 8, 17], [20, 10, 19]), at: [-20, 9.1, 95], visible: false },
  { id: 'eps-cable', name: 'CPU 8-pin 线', shape: { type: 'cable', from: { part: 'psu', at: [-30, 86, 55], dir: [0, 1, 0] }, to: { part: 'eps-plug', at: [-20, 0, 0], dir: [-1, 0, 0] }, r: 3, slack: 1 }, visible: false },
  { id: 'pcie-plug', name: '显卡 8-pin 供电插头', parent: 'case', shape: plug([6, 8, 17], [20, 10, 19]), at: [60, 9.1, 95], visible: false },
  { id: 'pcie-cable', name: '显卡供电线', shape: { type: 'cable', from: { part: 'psu', at: [30, 86, 55], dir: [0, 1, 0] }, to: { part: 'pcie-plug', at: [-20, 0, 0], dir: [-1, 0, 0] }, r: 3, slack: 1 }, visible: false },

  // ===== 机箱前面板线 =====
  { id: 'jfp-top', name: 'POWER LED + POWER SW 跳线', parent: 'case', shape: dupont(4.9), at: JFP_TOP_DESK, visible: false },
  { id: 'jfp-cable-top', name: '前面板线（电源灯 / 电源键）', shape: { type: 'cable', from: { part: 'case', at: [217, 150, 40], dir: [-1, 0, 0] }, to: { part: 'jfp-top', at: [-8, 0, 0], dir: [-1, 0, 0] }, r: 1.6, slack: 1 }, visible: false },
  { id: 'jfp-bot', name: 'HDD LED + RESET SW 跳线', parent: 'case', shape: dupont(4.9), at: JFP_BOT_DESK, visible: false },
  { id: 'jfp-cable-bot', name: '前面板线（硬盘灯 / 重启键）', shape: { type: 'cable', from: { part: 'case', at: [217, 150, 28], dir: [-1, 0, 0] }, to: { part: 'jfp-bot', at: [-8, 0, 0], dir: [-1, 0, 0] }, r: 1.6, slack: 1 }, visible: false },
  { id: 'usb-plug', name: '前置 USB 3.2 插头', spec: '19-pin', parent: 'case', shape: plug([7, 6.5, 18], [14, 10, 22]), at: [110, 9.1, 40], visible: false },
  { id: 'usb-cable', name: '前置 USB 线', shape: { type: 'cable', from: { part: 'case', at: [217, 220, 20], dir: [-1, 0, 0] }, to: { part: 'usb-plug', at: [-14, 0, 0], dir: [-1, 0, 0] }, r: 2.6, slack: 1 }, visible: false },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))

// ---------- 指南之间的累积状态 ----------
const G2_END: Record<string, PartState> = {
  'socket-cap': CAP_ASIDE,
  cpu: CPU_IN,
  'paste-dot': { visible: true },
  'ram-1': { plug: 'slot-a2' },
  'ram-2': { plug: 'slot-b2' },
  ssd: SSD_FLAT,
  'm2-clip': { rot: CLIP_LOCK },
  cooler: COOLER_ON,
  'fan-plug': { plug: 'cpu-fan' },
}
const G3_END: Record<string, PartState> = {
  ...G2_END,
  mb: MB_FINAL,
  'mb-screws': { visible: true, at: [0, 0, 0] },
  psu: PSU_IN,
  'slot-covers': COVERS_ASIDE,
  gpu: { plug: 'pcie-slot' },
}
const WIRES = ['atx-plug', 'atx-cable', 'eps-plug', 'eps-cable', 'pcie-plug', 'pcie-cable', 'jfp-top', 'jfp-cable-top', 'jfp-bot', 'jfp-cable-bot', 'usb-plug', 'usb-cable']
const G4_START: Record<string, PartState> = { ...G3_END, ...show(...WIRES) }
const G4_END: Record<string, PartState> = {
  ...G4_START,
  'atx-plug': { visible: true, plug: 'atx-hole' },
  'eps-plug': { visible: true, plug: 'eps-hole' },
  'pcie-plug': { visible: true, plug: 'gpu-pwr' },
  'jfp-top': { visible: true, plug: 'jfp-hole-top' },
  'jfp-bot': { visible: true, plug: 'jfp-hole-bot' },
  'usb-plug': { visible: true, plug: 'usb-hole' },
}
export const pcBuildB650m: ManualSpec = {
  id: 'pc-build-b650m',
  name: '电脑装机操作清单',
  desc: '以微星 MAG B650M MORTAR WIFI（M-ATX · AM5）主板说明书为例：从零件到点亮进 BIOS',
  category: '电脑装机',
  dims: { width: 450, depth: 210, height: 450 },
  source: {
    title: 'MSI MAG B650M MORTAR WIFI 主板使用手册（多语言合订本，简体中文为 PDF 第 359–408 页）',
    url: 'https://download-2.msi.com/archive/mnu_exe/mb/MAGB650MMORTARWIFI.pdf',
    images: [],
  },
  package: [
    { name: 'MAG B650M MORTAR WIFI 主板', qty: 1, spec: '另含快速安装指南、SATA 6G 线 ×2、Wi-Fi 天线、电缆贴纸、简易 M.2 卡扣 ×2 包' },
    { name: 'AMD AM5 CPU', qty: 1, spec: '锐龙 9000 / 8000 / 7000 系列' },
    { name: 'AM5 CPU 风扇（散热器）', qty: 1 },
    { name: 'DDR5 内存', qty: 2, spec: '双通道：DIMMA2 + DIMMB2' },
    { name: 'M.2 固态硬盘', qty: 1, spec: '2280 / 2260，PCIe 4.0 x4' },
    { name: '显卡', qty: 1, spec: '插 PCI_E1' },
    { name: 'ATX 电源', qty: 1, spec: '24-pin + CPU 8-pin + 显卡供电' },
    { name: '机箱', qty: 1, spec: '支持 Micro-ATX' },
    { name: '导热膏', qty: 1 },
    { name: '飞利浦螺丝刀 + 一包螺丝', qty: 1 },
  ],
  params: [
    { label: '主板尺寸', value: '244 × 244 mm', note: 'Micro-ATX（9.6 × 9.6 英寸）' },
    { label: 'CPU 插座', value: 'AMD AM5', note: '锐龙 9000 / 8000 / 7000 系列' },
    { label: '芯片组', value: 'AMD B650' },
    { label: '内存', value: '4 × DDR5，最高 256 GB', note: '1 条插 DIMMA2；2 条插 DIMMA2 + DIMMB2' },
    { label: '显卡插槽', value: 'PCI_E1 · PCIe 4.0 x16', note: '单卡建议用 PCI_E1（来自 CPU）' },
    { label: 'M.2', value: '2 × M.2（M 键）PCIe 4.0 x4', note: '支持 2260 / 2280' },
    { label: '供电接口', value: '1 × 24-pin ATX + 2 × 8-pin CPU' },
    { label: '螺丝转矩', value: '3 kgf·cm', note: '= 0.3 N·m = 2.6 lbf·in' },
    { label: 'EZ Debug LED', value: 'CPU 红 · DRAM 黄 · VGA 白 · BOOT 绿', note: '常亮 = 对应部件无法检测或故障' },
  ],
  parts,
  stageSize: 1450,
  guides: [
    // ================= 1 装机前清单 =================
    {
      id: 'prep', title: '装机前清单', kind: 'usage',
      steps: [
        {
          id: 'parts', title: '清点主要零件', page: 361,
          desc: '说明书「准备工具和组件」：AMD AM5 CPU、AM5 CPU 风扇、DDR5 内存、显卡、电源供应器、机箱、导热膏、飞利浦螺丝刀和一包螺丝。本清单另装一块 M.2 固态硬盘代替 SATA 硬盘。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'mb', text: '主板', sub: 'MAG B650M MORTAR WIFI', at: [-60, 40, -60], offset: [60, 120, 0] },
            { part: 'cpu', text: 'AMD AM5 CPU', offset: [-40, 100, 20] },
            { part: 'ram-1', text: 'DDR5 内存 ×2', offset: [60, 80, 40] },
            { part: 'ssd', text: 'M.2 固态硬盘', at: [-40, 0, 0], offset: [80, 60, 50] },
            { part: 'cooler', text: 'AM5 CPU 风扇', at: [0, 60, 0], offset: [40, 120, 0] },
            { part: 'gpu', text: '显卡', offset: [0, 120, 0] },
          ],
          chips: [{ label: '主要零件', sub: '6 件 + 电源 / 机箱 / 工具' }],
        },
        {
          id: 'tools', title: '电源、机箱和工具', page: 361,
          desc: '还要准备 ATX 电源、机箱、导热膏、飞利浦螺丝刀和一包螺丝。开机测试时再接一台显示器。',
          camera: DESK_TOOLS,
          callouts: [
            { part: 'psu', text: '电源供应器', at: [0, 86, 0], offset: [40, 110, 0] },
            { part: 'case', text: '机箱', at: [100, 450, 0], offset: [40, 70, 0] },
            { part: 'paste', text: '导热膏', offset: [0, 90, 30] },
            { part: 'driver', text: '飞利浦螺丝刀', offset: [30, 90, 20] },
            { part: 'monitor', text: '显示器（开机测试）', at: [150, 400, -8], offset: [60, 60, 0] },
          ],
          highlight: ['psu', 'case'],
        },
        {
          id: 'esd', title: '防静电：手持主板边缘', page: 362,
          desc: '组件可能被静电放电（ESD）损坏。拿主板时手持边缘，不要碰敏感元件；建议戴 ESD 腕带，没有就先摸一下其它金属物体释放静电。主板不装时放在静电屏蔽容器或防静电垫上。',
          camera: BOARD_TOP,
          highlight: ['mb'],
          callouts: [
            { part: 'mb', text: '手持这里（边缘）', at: [-122, 2, 60], offset: [50, 60, 60] },
            { part: 'mb', text: '手持这里（边缘）', at: [122, 2, 60], offset: [-50, 60, 60] },
          ],
          tip: '安装完成之前不要接电开机；安装或拆卸任何部件前都要关电并拔掉电源线。',
          chips: [{ label: 'ESD', sub: '腕带 / 先摸金属' }],
        },
        {
          id: 'layout', title: '认识主板布局', page: 383,
          desc: '对照说明书「组件概述」：CPU 插座居中偏上，右侧四条内存槽（从靠 CPU 起 DIMMA1、A2、B1、B2），右缘是 24-pin 供电，左上角是 CPU 8-pin 供电，CPU 下方是 M2_1，再往下是 PCI_E1，下缘有 JFP1 前面板接口。右上角是四颗 EZ Debug 排障灯。',
          camera: BOARD_TOP,
          highlight: ['slot-a2', 'slot-b2', 'pcie-slot', 'led-cpu', 'led-dram', 'led-vga', 'led-boot'],
          callouts: [
            { part: 'mb', text: 'CPU 插座 AM5', at: [SOCK.x, 8, SOCK.z], offset: [-70, 40, -40] },
            { part: 'slot-a2', text: 'DIMMA2 / DIMMB2', sub: '两条内存插这两槽', offset: [40, 40, 60] },
            { part: 'pcie-slot', text: 'PCI_E1', sub: 'PCIe 4.0 x16', offset: [-90, 30, 30] },
            { part: 'm2-sink', text: 'M2_1', sub: 'M.2 散热片下', offset: [-60, 40, 20] },
            { part: 'atx-hole', text: 'ATX_PWR1', sub: '24-pin', offset: [20, 40, 95] },
            { part: 'eps-hole', text: 'CPU_PWR1', sub: '8-pin', offset: [-40, 30, -40] },
          ],
          zoom: { ...zoomLeds('EZ Debug：CPU · DRAM · VGA · BOOT', [0.2, 1, 0.35]), offset: [0, 0, 2.5] },
        },
      ],
    },

    // ================= 2 主板外安装 =================
    {
      id: 'board', title: '主板外安装：CPU · 内存 · M.2 · 散热器', kind: 'assembly',
      steps: [
        {
          id: 'lever', title: '压下压杆向外推出，再抬起', page: 364,
          desc: '说明书安装处理器 ①：把插座侧边的压杆压下并向外推出卡钩，然后抬起。',
          camera: SOCKET_CAM,
          set: { lever: { rot: LEVER_UP, dur: 1.2 } },
          highlight: ['lever'],
          zoom: { target: 'lever', offset: [0, 20, 0], dir: [0.8, 0.6, 0.9], dist: 140, caption: '压杆抬起' },
          tip: '安装或移除 CPU 之前，先关闭电源并拔掉电源线（第 384 页）。',
        },
        {
          id: 'plate', title: '掀开 CPU 压板', page: 364,
          desc: '说明书 ②：掀开金属压板，保护盖先留在压板上。',
          camera: SOCKET_CAM,
          set: { 'load-plate': { rot: PLATE_OPEN, dur: 1.2 } },
          highlight: ['load-plate', 'socket-cap'],
        },
        {
          id: 'cpu', title: '金色三角对准插座三角，放入 CPU', page: 364,
          desc: '说明书 ③ 与第 384 页：AM5 CPU 表面有两个对齐点和一个金色三角（Pin 1）。三角对准插座上的三角标记，垂直放入，不要用力按。',
          camera: SOCKET_CAM,
          set: { cpu: { ...CPU_IN, via: ctrl(CPU_DESK, W.cpu, add(W.cpu, [0, 220, 0])), lift: 30, dur: 1.8 } },
          highlight: ['cpu', 'cpu-mark', 'socket-mark'],
          zoom: { target: 'cpu-mark', dir: [0.2, 1, 0.5], dist: 90, caption: '金色三角 ▲ 对准插座 ▲' },
          chips: [{ label: '对齐', sub: '金色三角 = Pin 1' }],
        },
        {
          id: 'close', title: '合上压板，压下压杆扣回', page: 364,
          desc: '说明书 ④⑤：合上压板，再把压杆压下扣回卡钩。',
          camera: SOCKET_CAM,
          set: { 'load-plate': { rot: [0, 0, 0], dur: 1.1 }, lever: { rot: [0, 0, 0], delay: 1.1, dur: 1.1 } },
          highlight: ['load-plate', 'lever'],
        },
        {
          id: 'cap', title: '取下保护盖并保留', page: 364,
          desc: '说明书 ⑥：压杆扣回后取下黑色保护盖。第 384 页：请保留 CPU 保护盖，送修（RMA）时需要主板附带保护盖。',
          camera: { target: onBox(-20, 30, 160), dir: [0.35, 0.8, 1], dist: 760 },
          set: { 'socket-cap': { ...CAP_ASIDE, via: ctrl(W.cap, CAP_DESK, [-300, 260, 200]), dur: 1.6 } },
          highlight: ['socket-cap'],
          tip: '只要 CPU 还没装，就把保护盖盖在插座上，避免针脚受损。',
        },
        {
          id: 'ram-a2', title: '打开卡扣，第一条内存插入 DIMMA2', page: 366,
          desc: '说明书安装 DDR5 内存：先打开卡扣，内存金手指的缺口对准插槽里的凸起，垂直按下。两条内存插 DIMMA2 和 DIMMB2（从 CPU 往外数第 2、第 4 槽）；第 385 页：必须先从 DIMMA2 开始。',
          camera: DIMM_CAM,
          set: {
            'dimm-latch': { rot: LATCH_OPEN, dur: 0.6 },
            'ram-1': { plug: { hole: 'slot-a2', back: 40 }, via: ctrl(RAM1_DESK, W.a2, add(W.a2, [0, 300, 0])), delay: 0.6, dur: 1.8 },
          },
          highlight: ['ram-1', 'dimm-latch', 'slot-a2'],
          zoom: { target: 'dimm-latch', offset: [DIMM.a2 + 8, 4, 0], dir: [0.5, 0.6, -1], dist: 110, caption: '先打开卡扣' },
          callouts: [
            { part: 'slot-a2', text: 'DIMMA2', at: [60, 0, 0], offset: [-40, 30, 30] },
            { part: 'slot-b2', text: 'DIMMB2', at: [60, 0, 0], offset: [40, 30, 30] },
          ],
          chips: [{ label: '1 条', sub: 'DIMMA2' }],
        },
        {
          id: 'ram-b2', title: '第二条插入 DIMMB2，卡扣扣上', page: 366,
          desc: '第二条插入 DIMMB2，两端均匀用力按到底，卡扣自动扣上。双通道的两条内存须相同类型、数量和密度（第 385 页）。',
          camera: DIMM_CAM,
          set: {
            'ram-2': { plug: { hole: 'slot-b2', back: 40 }, via: ctrl(RAM2_DESK, W.b2, add(W.b2, [0, 300, 0])), dur: 1.8 },
            'dimm-latch': { rot: [0, 0, 0], delay: 1.8, dur: 0.5 },
          },
          highlight: ['ram-2', 'dimm-latch'],
          zoom: { target: 'dimm-latch', offset: [DIMM.a2 + 8, 4, 0], dir: [0.5, 0.6, -1], dist: 110, caption: '卡扣扣上 = 插到位' },
          chips: [{ label: '2 条', sub: 'DIMMA2 + DIMMB2' }],
        },
        {
          id: 'sink-off', title: '拧下螺丝，取下 M.2 散热片', page: 387,
          desc: '说明书安装 M.2 模块 1–2：拧下 M.2 冰霜铠甲散热片上的螺丝，提起散热片取下。',
          camera: M2_WIDE,
          set: { 'm2-sink': { ...SINK_ASIDE, via: SINK_VIA, dur: 1.6 } },
          highlight: ['m2-sink', 'm2-slot'],
          tip: '如果固态硬盘自带散热片：先拆掉 M.2 接口里的 M.2 板或橡胶块，且不要再装主板随附的散热片。',
        },
        {
          id: 'ssd', title: '以 30° 斜插 M.2 固态硬盘', page: 387,
          desc: '说明书 4：把 M.2 固态硬盘以 30 度角插入 M2_1 接口。2280 规格不用装卡扣套件（2260 需先装随附的简易 M.2 卡扣）。',
          camera: M2_CAM,
          set: { ssd: { plug: { hole: 'm2-slot', back: 40 }, via: ctrl(SSD_DESK, W.m2, add(W.m2, [130, 75, 0])), lift: 20, dur: 1.8 } },
          highlight: ['ssd', 'm2-slot'],
          zoom: { target: 'm2-slot', dir: [0.15, 0.35, 1], dist: 120, caption: '约 30° 斜插进接口' },
          chips: [{ label: '角度', sub: '30°' }],
        },
        {
          id: 'clip', title: '压平，旋转简易 M.2 卡扣固定', page: 388,
          desc: '说明书 5：把固态硬盘尾端压平，旋转简易 M.2 卡扣压住尾端。',
          camera: M2_CAM,
          set: { ssd: { ...SSD_FLAT, dur: 0.9 }, 'm2-clip': { rot: CLIP_LOCK, delay: 1, dur: 0.6 } },
          highlight: ['ssd', 'm2-clip'],
          zoom: { target: 'm2-clip', dir: [0.4, 0.8, 0.6], dist: 70, caption: '卡扣转过来压住尾端' },
        },
        {
          id: 'sink-on', title: '撕掉保护膜，装回散热片', page: 388,
          desc: '说明书 6–7：撕掉散热片下方导热垫上的保护膜，再把 M.2 冰霜铠甲散热片放回原位，拧紧螺丝。',
          camera: M2_WIDE,
          set: { 'm2-sink': { ...SINK_ON, via: SINK_VIA, dur: 1.6 } },
          highlight: ['m2-sink'],
          tip: '忘了撕导热垫保护膜，固态硬盘散热会变差。',
        },
        {
          id: 'paste', title: '在 CPU 上涂导热膏', page: 364,
          desc: '说明书 ⑦：在 CPU 顶盖中央挤一小团导热膏（散热器压上去会自己摊开）。第 384 页：CPU 与散热片之间要有一层平滑的散热硅胶。',
          camera: SOCKET_CAM,
          set: {
            paste: { parent: null, at: onBox(SOCK.x, SOCK.top - 1.5 + 3.8 + 1.2, SOCK.z), rot: [0, 0, 0], lift: 60, dur: 1.6 },
            'paste-dot': { visible: true, delay: 1.7 },
          },
          highlight: ['paste', 'paste-dot'],
          zoom: { target: 'paste-dot', dir: [0.4, 0.8, 0.8], dist: 100, caption: '中央一小团即可' },
        },
        {
          id: 'cooler', title: '放上散热器并扣紧', page: 364,
          desc: '说明书 ⑧⑨⑩：散热器垂直放到 CPU 上，扣上两侧卡扣，扳下压杆锁紧。',
          camera: { ...SOCKET_CAM, dist: 460 },
          set: {
            paste: { parent: null, at: PASTE_DESK, rot: [0, 0, -90], lift: 40, dur: 1 },
            cooler: { ...COOLER_ON, via: ctrl(COOLER_DESK, W.cooler, add(W.cooler, [0, 250, 0])), delay: 0.9, dur: 1.8 },
          },
          highlight: ['cooler'],
          tip: '螺丝式散热器要先拆掉插座两侧的塑料固定模块再安装（第 365 页）；开机前确认散热器已牢固贴在 CPU 上。',
        },
        {
          id: 'fan', title: '风扇线插入 CPU_FAN1', page: 395,
          desc: '说明书 ⑪：把散热器风扇的 4-pin 线插到主板 CPU_FAN1 接口（内存槽上端左侧）。CPU_FAN1 默认自动模式，最大 3 A / 36 W。',
          camera: { target: onBox(FAN.x, 20, FAN.z), dir: [0.3, 0.9, 1], dist: 380 },
          set: { 'fan-plug': { plug: { hole: 'cpu-fan', back: 30 }, lift: 30, dur: 1.4 } },
          highlight: ['fan-plug', 'cpu-fan', 'fan-cable'],
          zoom: { target: 'cpu-fan', dir: [0.3, 0.8, 0.8], dist: 90, caption: '4-pin 插进 CPU_FAN1' },
        },
      ],
    },

    // ================= 3 装入机箱与显卡 =================
    {
      id: 'case', title: '装入机箱 · 电源 · 显卡', kind: 'assembly',
      start: G2_END,
      steps: [
        {
          id: 'standoffs', title: '确认机箱铜柱位置', page: 363,
          desc: '铜柱位置要和主板 8 个螺丝孔一一对应（第 368 页）。说明书警示：禁止在主板电路和机壳之间装任何多余的螺丝柱，主板背面印有 Case standoff keep out zone 标示。',
          camera: CASE_CAM,
          highlight: ['standoffs'],
          callouts: [{ part: 'standoffs', text: '铜柱 ×8', sub: '对准主板螺丝孔', at: [MB_CASE[0] + 44, MB_CASE[1] - 40, -95], offset: [60, 60, 60] }],
          tip: '多出来的铜柱会顶到主板背面电路造成短路，务必拆掉。',
        },
        {
          id: 'raise', title: '竖起主板，对准机箱侧面开口', page: 368,
          desc: '手持主板边缘竖起来，元件面朝外，I/O 挡块朝机箱后部。',
          camera: CASE_CAM,
          set: { mb: MB_OUTSIDE },
          highlight: ['mb'],
        },
        {
          id: 'insert', title: '放入机箱，贴近铜柱', page: 368,
          desc: '说明书安装主板 ①：把主板平行放进机箱，先略靠前放在铜柱上，避免 I/O 挡块刮到后面板。',
          camera: CASE_CAM,
          set: { mb: MB_NEAR },
          highlight: ['mb'],
        },
        {
          id: 'push-io', title: '推向 I/O 挡板，对准螺丝孔', page: 368,
          desc: '把主板朝机箱后部推，让 I/O 接口卡进后面板开孔，主板螺丝孔与铜柱对齐。',
          camera: { target: caseW(-200, 330, -60), dir: [0.5, 0.25, 1], dist: 620 },
          set: { mb: { ...MB_FINAL, dur: 1 } },
          highlight: ['mb'],
          callouts: [{ part: 'mb', text: 'I/O 卡进后面板', at: [-131, 22, -60], offset: [60, 80, 40] }],
        },
        {
          id: 'screws', title: '拧上 8 颗螺丝（3 kgf·cm）', page: 368,
          desc: '说明书 ②：在 8 个螺丝孔拧上螺丝，转矩 3 kgf·cm（= 0.3 N·m）。先对角预拧，再逐颗拧紧，不要过紧。',
          camera: CASE_IN,
          set: { 'mb-screws': { visible: true, at: [0, 0, 0], dur: 0.8 }, driver: { ...DRIVER_MB, delay: 0.6 } },
          actions: [{ type: 'spin', part: 'driver', axis: 'y' }],
          highlight: ['mb-screws', 'driver'],
          zoom: { target: inCase(HOLES[5][0], T + 2, HOLES[5][1]), dir: [0.3, 0.3, 1], dist: 120, caption: '转矩 3 kgf·cm' },
          chips: [{ label: '螺丝', sub: '8 颗' }, { label: '转矩', sub: '3 kgf·cm' }],
        },
        {
          id: 'psu-lift', title: '拿起电源，对准机箱底部后方', page: 369,
          desc: '说明书连接电源接口：电源装在机箱底部后方。拿起电源，背面（开关、AC 插口）朝机箱后部。螺丝刀先放回桌上。',
          camera: PSU_CAM,
          set: { psu: { ...PSU_OUTSIDE, delay: 1.4 }, driver: { ...DRIVER_DESK, dur: 1.6 } },
          highlight: ['psu'],
        },
        {
          id: 'psu-in', title: '推入电源，从背面拧 4 颗螺丝', page: 369,
          desc: '把电源推到底，让背面贴紧机箱后面板，再从机箱背面拧上 4 颗螺丝固定。',
          camera: PSU_CAM,
          set: { psu: { ...PSU_IN, dur: 1.4 } },
          highlight: ['psu'],
          chips: [{ label: '螺丝', sub: '背面 4 颗' }],
        },
        {
          id: 'covers', title: '拆下两块挡片，打开 PCI_E1 卡扣', page: 371,
          desc: '说明书安装显卡 ①②：拧下 2 颗螺丝，拆掉 PCI_E1 对应的两块机箱挡片；再把主板 PCI_E1 尾端的卡扣按开。',
          camera: { target: caseW(-60, 140, 180), dir: [0.3, 0.45, 1], dist: 1050 },
          set: {
            'pci-screws': { ...SCREWS_ASIDE, dur: 1.4 },
            'slot-covers': { ...COVERS_ASIDE, via: ctrl(caseW(...COVERS_AT), COVERS_ASIDE.at as Vec3, caseW(-120, 227, -35)), delay: 0.6, dur: 1.6 },
            'pcie-latch': { rot: PCIE_LATCH_OPEN, delay: 1.6, dur: 0.6 },
          },
          highlight: ['slot-covers', 'pci-screws', 'pcie-latch'],
          zoom: { target: 'pcie-latch', dir: [0.6, 0.3, 1], dist: 100, caption: 'PCI_E1 卡扣按开' },
          tip: '单张 PCIe x16 显卡建议装在 PCI_E1（来自 CPU，第 386 页）。',
        },
        {
          id: 'gpu-lift', title: '拿起显卡，对准 PCI_E1', page: 371,
          desc: '风扇朝下、挡板朝机箱后部，把显卡举到 PCI_E1 正前方。',
          camera: GPU_CAM,
          set: { gpu: GPU_OUTSIDE },
          highlight: ['gpu', 'pcie-slot'],
        },
        {
          id: 'gpu-in', title: '垂直插入，卡扣自动扣上', page: 371,
          desc: '说明书 ③④：金手指对准 PCI_E1 垂直推到底，听到「咔」一声卡扣自动扣上。',
          camera: GPU_CAM,
          set: { gpu: { plug: { hole: 'pcie-slot', back: 0 }, dur: 1.6 }, 'pcie-latch': { rot: [0, 0, 0], delay: 1.6, dur: 0.4 } },
          highlight: ['gpu', 'pcie-latch'],
          zoom: { target: 'pcie-latch', dir: [0.6, 0.3, 1], dist: 100, caption: '卡扣扣上 = 插到底' },
          tip: '大而重的显卡请用显卡支架撑住，防止插槽变形（第 386 页）。',
        },
        {
          id: 'gpu-screws', title: '拧回螺丝固定显卡挡板', page: 371,
          desc: '说明书 ⑤：用刚才拆下的 2 颗螺丝把显卡挡板固定在机箱上。',
          camera: GPU_CAM,
          set: {
            'pci-screws': { parent: 'case', at: PCI_SCREWS_AT, rot: [0, 0, 0], dur: 1.4 },
            driver: { ...DRIVER_PCI, delay: 1.2 },
          },
          actions: [{ type: 'spin', part: 'driver', axis: 'y' }],
          highlight: ['pci-screws', 'driver'],
          zoom: { target: 'pci-screws', dir: [0.4, 0.3, 1], dist: 120, caption: '2 颗螺丝固定挡板' },
        },
      ],
    },

    // ================= 4 接线 =================
    {
      id: 'wiring', title: '接线：供电 · 前面板 · USB', kind: 'assembly',
      start: G4_START,
      steps: [
        {
          id: 'atx', title: '24-pin 插入 ATX_PWR1', page: 369,
          desc: '说明书连接电源接口：把 24-pin 主板供电插头对准主板右缘的 ATX_PWR1，卡扣对卡扣垂直按到底。',
          camera: { target: inCase(ATX.x - 20, 20, ATX.z), dir: [0.45, 0.15, 1], dist: 620 },
          set: { 'atx-plug': { plug: { hole: 'atx-hole', back: 60 }, lift: 40, dur: 1.8 } },
          highlight: ['atx-plug'],
          chips: [{ label: '接口', sub: 'ATX_PWR1 · 24-pin' }],
        },
        {
          id: 'eps', title: 'CPU 8-pin 插入 CPU_PWR1', page: 390,
          desc: '把 CPU 8-pin 插头插到主板左上角的 CPU_PWR1（针脚 1–4 接地、5–8 +12V，有防呆）。说明书：确认所有电源接口都已正确连接到 ATX 电源。',
          camera: { target: inCase(EPS.x + 40, 20, EPS.z + 50), dir: [0.3, 0.2, 1], dist: 560 },
          set: { 'eps-plug': { plug: { hole: 'eps-hole', back: 60 }, lift: 40, dur: 1.8 } },
          highlight: ['eps-plug'],
          zoom: { target: 'eps-plug', dir: [0.3, 0.1, 1], dist: 130, caption: '8-pin 插到底，卡扣扣住' },
          tip: '主板有 CPU_PWR1、CPU_PWR2 两个 8-pin；电源线够的话两个都接上，本演示只画出 CPU_PWR1。',
        },
        {
          id: 'gpu-pwr', title: '接上显卡供电', page: 371,
          desc: '说明书安装显卡 ⑥：把电源的显卡供电插头插到显卡顶部的 8-pin 供电口。',
          camera: { target: caseW(-60, 200, 30), dir: [0.35, 0.3, 1], dist: 620 },
          set: { 'pcie-plug': { plug: { hole: 'gpu-pwr', back: 50 }, lift: 30, dur: 1.6 } },
          highlight: ['pcie-plug'],
          zoom: { target: 'pcie-plug', dir: [0.3, 0.5, 1], dist: 130, caption: '8-pin 插到底' },
        },
        {
          id: 'jfp-bot', title: 'HDD LED、RESET SW 插 JFP1 下排', page: 367,
          desc: '说明书连接前置面板接头：JFP1 下排针脚 1 = HDD LED +、3 = HDD LED −、5 / 7 = Reset Switch（9 保留）。印有 HDD LED、RESET SW 的两个插头插在下排。',
          camera: { target: inCase(JFP.x, 10, JFP.z), dir: [0.2, -0.15, 1], dist: 420 },
          set: { 'jfp-bot': { plug: 'jfp-hole-bot', via: jfpVia(JFP_BOT_DESK, JFP.z + 1.27), dur: 1.6 } },
          highlight: ['jfp-bot'],
          zoom: { target: 'jfp-bot', dir: [0.2, -0.3, 1], dist: 80, caption: '下排：1 HDD+ · 3 HDD− · 5/7 RESET' },
          tip: 'Power LED 和 HDD LED 有正负极，要接到主板对应的 + / − 针脚，否则灯不亮（第 389 页）。',
        },
        {
          id: 'jfp-top', title: 'POWER LED、POWER SW 插 JFP1 上排', page: 367,
          desc: 'JFP1 上排针脚 2 = Power LED +、4 = Power LED −、6 / 8 = Power Switch。电源灯插头的 + 线对准 2 号针脚。',
          camera: { target: inCase(JFP.x, 10, JFP.z), dir: [0.2, -0.15, 1], dist: 420 },
          set: { 'jfp-top': { plug: 'jfp-hole-top', via: jfpVia(JFP_TOP_DESK, JFP.z - 1.27), dur: 1.6 } },
          highlight: ['jfp-top'],
          zoom: { target: 'jfp-top', dir: [0.2, -0.3, 1], dist: 80, caption: '上排：2 PLED+ · 4 PLED− · 6/8 POWER SW' },
        },
        {
          id: 'usb', title: '前置 USB 插 JUSB3', page: 392,
          desc: '把机箱前置 USB 3.2 线（19-pin）插到主板右下的 JUSB3（USB 3.2 Gen 1 5Gbps），注意防呆方向。前置耳机 / 麦克风（HD AUDIO）线插左下角 JAUD1，方法相同。',
          camera: { target: inCase(50, 10, 95), dir: [0.2, -0.15, 1], dist: 520 },
          set: { 'usb-plug': { plug: { hole: 'usb-hole', back: 40 }, lift: 30, dur: 1.6 } },
          highlight: ['usb-plug'],
          zoom: { target: 'usb-plug', dir: [0.2, -0.3, 1], dist: 90, caption: 'JUSB3 · 19-pin 防呆缺口对准' },
          callouts: [
            { part: 'usb-plug', text: 'JUSB3 前置 USB 3.2' },
            { part: 'mb', text: 'JAUD1 前置音频', at: [-99.5, 8, 116], offset: [40, -50, 50] },
          ],
          tip: '电源和接地针脚必须正确连接，避免损坏（第 392 页）。',
        },
        {
          id: 'check', title: '逐一检查接口插紧', page: 390,
          desc: '开机前逐一推一推每个插头：24-pin、CPU 8-pin、显卡供电、前面板跳线、前置 USB、CPU 风扇。说明书：连接不紧可能导致电脑无法识别组件或无法开启（第 362 页）。',
          camera: CASE_IN,
          actions: [
            { type: 'shake', part: 'atx-plug', axis: 'x', amp: 1 },
            { type: 'shake', part: 'eps-plug', axis: 'x', amp: 1 },
            { type: 'shake', part: 'pcie-plug', axis: 'x', amp: 1 },
            { type: 'shake', part: 'usb-plug', axis: 'x', amp: 1 },
          ],
          highlight: ['atx-plug', 'eps-plug', 'pcie-plug', 'usb-plug', 'jfp-top', 'jfp-bot', 'fan-plug'],
          zoom: { target: 'jfp-top', dir: [0.2, -0.3, 1], dist: 90, caption: '前面板跳线插在 JFP1' },
        },
      ],
    },

    // ================= 5 开机自检与排障 =================
    {
      id: 'post', title: '开机自检与 EZ Debug 排障', kind: 'repair',
      start: G4_END,
      steps: [
        {
          id: 'switch', title: '接上电源线，电源开关拨到 I', page: 373,
          desc: '说明书开机 ①②③：电源线一头插电源背面的 AC 插口，一头插墙上插座，再把电源背面的开关拨到「I」。',
          camera: REAR_CAM,
          set: { 'psu-switch': { rot: [0, 0, 15], dur: 0.5 } },
          highlight: ['psu-switch'],
          zoom: { target: 'psu-switch', dir: [-1, 0.3, 0.3], dist: 90, caption: '开关 O → I' },
          chips: [{ label: '电源开关', sub: 'O → I' }],
        },
        {
          id: 'press', title: '按下机箱电源键，EZ Debug 灯依次闪过', page: 400,
          desc: '说明书开机 ④：按下机箱电源键。开机自检时 EZ Debug 灯按 CPU → DRAM → VGA → BOOT 依次检查，正常时短暂亮一下就熄灭，随后显示器出现 MSI 开机画面。',
          camera: POST_CAM,
          set: {
            'led-cpu': { light: 'blinkThenOff', delay: 0.4 },
            'led-dram': { light: 'blinkThenOff', delay: 1.1 },
            'led-vga': { light: 'blinkThenOff', delay: 1.8 },
            'led-boot': { light: 'blinkThenOff', delay: 2.5 },
            screen: { visible: true, ui: POST, delay: 3.4 },
          },
          actions: [{ type: 'press', part: 'power-btn', depth: 1.5, delay: 0 }],
          highlight: ['power-btn', 'led-cpu', 'led-dram', 'led-vga', 'led-boot'],
          zoom: zoomLeds('依次闪过后全部熄灭 = 自检通过'),
          tip: '灯依次闪过是常见表现；说明书只给出每个灯的含义：常亮 = 对应部件无法检测或故障。',
        },
        {
          id: 'bios', title: '按 Delete 进入 BIOS', page: 405,
          desc: '出现「Press DEL key to enter Setup Menu, F11 to enter Boot Menu」时按 Delete 键进入 BIOS，屏幕顶部可看到 BIOS 模式：UEFI。能看到 CPU、内存和启动设备，说明装机成功。',
          camera: SCREEN_CAM,
          set: { screen: { ui: BIOS, delay: 0.3 } },
          highlight: ['screen'],
          chips: [{ label: '进入 BIOS', sub: 'Delete' }, { label: '启动菜单', sub: 'F11' }],
        },
        {
          id: 'fx-cpu', title: 'CPU 灯常亮：检查 CPU 与 8-pin 供电', page: 400,
          desc: '红色 CPU 灯常亮 = CPU 无法检测或故障。关机拔电后检查：CPU 是否按金色三角装正、散热器是否压紧（第 364 页），CPU_PWR1 的 8-pin 是否插到底（第 369 页）。',
          camera: { target: inCase(30, 20, -70), dir: [0.3, 0.1, 1], dist: 700 },
          set: { 'led-cpu': { light: 'on' }, screen: { visible: false } },
          actions: [{ type: 'shake', part: 'eps-plug', axis: 'x', amp: 1.2 }],
          highlight: ['led-cpu', 'eps-plug', 'cooler'],
          zoom: zoomLeds('红色 CPU 灯常亮'),
          chips: [{ label: 'CPU 灯', sub: '红色常亮' }],
        },
        {
          id: 'fx-dram-out', title: 'DRAM 灯常亮 ①：打开卡扣，拔出内存', page: 400,
          desc: '黄色 DRAM 灯常亮 = 内存无法检测或故障。关机拔电，按开 DIMMA2 / DIMMB2 卡扣，把内存拔出来检查金手指。',
          camera: { target: inCase(DIMM.a2, 40, DIMM.z), dir: [0.5, 0.2, 1], dist: 700 },
          set: {
            'led-cpu': { light: 'off' },
            'led-dram': { light: 'on' },
            'dimm-latch': { rot: LATCH_OPEN, dur: 0.6 },
            'ram-1': { at: [DIMM.a2, DIMM.top + 70, DIMM.z], delay: 0.6, dur: 1.2 },
          },
          highlight: ['led-dram', 'ram-1', 'dimm-latch'],
          zoom: zoomLeds('黄色 DRAM 灯常亮'),
          chips: [{ label: 'DRAM 灯', sub: '黄色常亮' }],
        },
        {
          id: 'fx-dram-in', title: 'DRAM 灯常亮 ②：重新插入 DIMMA2', page: 385,
          desc: '对准缺口重新垂直插入，按到卡扣扣上。只用一条时必须插 DIMMA2，两条插 DIMMA2 + DIMMB2；两条须相同类型、数量和密度（第 385 页）。',
          camera: { target: inCase(DIMM.a2, 40, DIMM.z), dir: [0.5, 0.2, 1], dist: 700 },
          set: {
            'ram-1': { plug: { hole: 'slot-a2', back: 0 }, dur: 1 },
            'dimm-latch': { rot: [0, 0, 0], delay: 1, dur: 0.4 },
            'led-dram': { light: 'off', delay: 1.6 },
          },
          highlight: ['ram-1', 'dimm-latch'],
          actions: [{ type: 'shake', part: 'ram-1', axis: 'x', amp: 1 }],
          zoom: { target: 'dimm-latch', offset: [DIMM.a2 + 8, 0, 4], dir: [0.6, 0.4, 1], dist: 130, caption: '插到卡扣扣上' },
        },
        {
          id: 'fx-vga', title: 'VGA 灯常亮：检查显卡、供电与显示器线', page: 400,
          desc: '白色 VGA 灯常亮 = 显卡无法检测或故障。检查显卡是否插到底、卡扣是否扣上（第 371 页），显卡 8-pin 供电是否接好。显示器线要接在显卡上；主板 HDMI / DP 只在带集成显卡的 CPU 上可用（第 372 页）。',
          camera: { target: [150, 290, -170], dir: [0.35, 0.3, 1], dist: 760 },
          set: { 'led-vga': { light: 'on' } },
          actions: [{ type: 'shake', part: 'gpu', axis: 'x', amp: 1 }, { type: 'shake', part: 'pcie-plug', axis: 'x', amp: 1 }],
          highlight: ['led-vga', 'gpu', 'pcie-plug'],
          zoom: zoomLeds('VGA 灯常亮（白色）'),
          chips: [{ label: 'VGA 灯', sub: '白色常亮' }],
        },
        {
          id: 'fx-boot', title: 'BOOT 灯常亮：检查 M.2 固态硬盘', page: 400,
          desc: '绿色 BOOT 灯常亮 = 启动设备无法检测或故障。关机后拆下 M.2 散热片，确认固态硬盘插到底、卡扣压住（第 387–388 页）；进 BIOS 查看启动设备里有没有它。',
          camera: { target: inCase(-10, 20, M2.z), dir: [0.3, 0.2, 1], dist: 700 },
          set: { 'led-vga': { light: 'off' }, 'led-boot': { light: 'on' } },
          highlight: ['led-boot', 'm2-sink'],
          callouts: [{ part: 'm2-sink', text: 'M2_1 固态硬盘', sub: '在散热片下面', offset: [-60, -40, 60] }],
          zoom: zoomLeds('绿色 BOOT 灯常亮'),
          chips: [{ label: 'BOOT 灯', sub: '绿色常亮' }],
        },
        {
          id: 'fx-cmos', title: '仍点不亮：清除 CMOS，恢复默认', page: 396,
          desc: '说明书 JBAT1：关闭电源并拔下电源线，用跳线帽短接 JBAT1 约 5–10 秒，移除跳线帽后再插电开机。能进 BIOS 时也可按 F6 载入优化设置默认值、F10 保存重启（第 406–407 页）。',
          camera: POST_CAM,
          set: { 'led-boot': { light: 'off' }, 'psu-switch': { rot: [0, 0, -15], dur: 0.5 }, screen: { visible: true, ui: BIOS_F6, delay: 0.4 } },
          highlight: ['screen'],
          callouts: [{ part: 'mb', text: 'JBAT1 清除 CMOS', sub: '短接约 5–10 秒', at: [-36, 6, 116.5], offset: [0, -90, 60] }],
          zoom: { target: inCase(-36, 6, 116.5), dir: [0.2, -0.3, 1], dist: 110, caption: 'JBAT1：短接 5–10 秒' },
          tip: '清除 CMOS 前务必确认已关机并拔掉电源线。',
        },
      ],
    },
  ],
}
