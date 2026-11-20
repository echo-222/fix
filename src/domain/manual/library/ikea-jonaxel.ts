import type { CameraSpec, Fill, ManualSpec, PartState, Shape, SpecPart, Vec3 } from '../types'

/**
 * IKEA JONAXEL 尤纳赛尔 衣柜组合（293.114.93）= 框架 204.313.05 + 可调式挂衣杆 204.312.87
 * 官方组装说明（宜家中国官网产品页「组装说明和文件」）：
 *   框架 AA-2139639-6（28 页）https://resources.ikea.cn/cn/zh/assembly_instructions/jonaxel-you-na-sai-er-kuang-jia-bai-se__AA-2139639-6-2.pdf
 *   挂衣杆 AA-2161609-2（12 页）https://resources.ikea.cn/cn/zh/assembly_instructions/jonaxel-you-na-sai-er-ke-diao-shi-gua-yi-gan-bai-se__AA-2161609-2-2.pdf
 * 页码合并：page 1–28 对应框架说明书第 1–28 页；page 29–40 对应挂衣杆说明书第 1–12 页（挂衣杆第 n 页 = page 28+n）。
 * 逐页转写：manuals-src/ikea-jonaxel/transcript.md
 *
 * 场景：毫米，Y 向上，地面 y=0，观众在 +Z。墙前表面 z=-300，踢脚线厚 10 mm（推断，演示「间隙 10 mm」那一档）。
 * 框架局部坐标：原点在立柱中段（框架几何中心），前方 = +z，左右梯架在 x=±240；所有框架零件最终都挂在 ladder-a（左侧梯架）下，
 * 翻转时整体跟着走。「倒立」= 绕 z 轴 180°，此时左右梯架互换位置（说明书第 11–14 页的翻转小图）。
 *
 * 尺寸：整体 500 × 510 × 1040（产品页 50 × 51 × 104 cm）。说明书没给的按图比例推断：
 *   方管 20 × 20、端块 22、插头 14 × 14 × 20、凸销 8 × 6、调节脚露出 12；6 根导轨距立柱顶 60 起、间距 162；
 *   墙壁固定件在后立柱距顶约 35 mm；垫片厚 8；挂衣杆托架长 460、吊耳孔在导轨顶面下 30；墙螺钉 Ø5 × 40 圆头（不含，另购）。
 */

type Item = Extract<Shape, { type: 'compound' }>['items'][number]

// ---------- 尺寸 ----------
const PX = 240
const PZ = 245
const T = 20
const WALL_T = 1.5
const HALF_POST = 490
const BLK = 22
const CB_Y = HALF_POST + BLK / 2
const RUNG_Y = [430, 268, 106, -56, -218, -380]
const RUNG_TOP = RUNG_Y[0] + 5
/** 导轨内侧面 x（左梯架为负） */
const RUNG_IN = PX - T / 2 - 12
/** 墙壁固定件在立柱上的高度（框架局部） */
const BR_Y = 455
/** 墙壁固定件吊孔离立柱中心（向内） */
const BR_HOLE = 27

// ---------- 场景位置 ----------
/** 组装位置（纸板上）与靠墙后的框架中心 z */
const ZA = 60
const ZC = -34
const WALL_POS: Vec3 = [0, 850, -330]

interface FramePose {
  at: Vec3
  flip: boolean
}
/** 倒立在立柱顶端（纸板厚 4） */
const UD1: FramePose = { at: [0, HALF_POST + 4, ZA], flip: true }
/** 正立在底横杆上 */
const UP1: FramePose = { at: [0, HALF_POST + BLK + 4, ZA], flip: false }
/** 倒立在顶横杆凸销上 */
const UD2: FramePose = { at: [0, HALF_POST + BLK + 6 + 4, ZA], flip: true }
/** 装好调节脚、推到墙边（框架后侧顶着踢脚线） */
const FIN: FramePose = { at: [0, HALF_POST + BLK + 12, ZC], flip: false }

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const toWorld = (pose: FramePose, p: Vec3): Vec3 =>
  pose.flip ? [pose.at[0] - p[0], pose.at[1] - p[1], pose.at[2] + p[2]] : add(pose.at, p)
const frameState = (pose: FramePose, more: PartState = {}): PartState => ({ parent: null, at: pose.at, rot: pose.flip ? [0, 0, 180] : [0, 0, 0], ...more })
const free = (at: Vec3, rot: Vec3 = [0, 0, 0], more: PartState = {}): PartState => ({ parent: null, at, rot, ...more })
const hidden = (at: Vec3, rot: Vec3 = [0, 0, 0]): PartState => free(at, rot, { visible: false })

const CB: Record<'bf' | 'bb' | 'tf' | 'tb', Vec3> = {
  bf: [0, -CB_Y, PZ], bb: [0, -CB_Y, -PZ], tf: [0, CB_Y, PZ], tb: [0, CB_Y, -PZ],
}
/** 底横杆在框架里转 180°（形状左右对称），倒立时世界姿态正好是绕 x 180°，压入时不用转 */
const CB_BOTTOM_ROT: Vec3 = [0, 180, 0]
const FEET: { id: string; bar: 'cb-bf' | 'cb-bb'; x: number; z: number }[] = [
  { id: 'foot-1', bar: 'cb-bf', x: -PX, z: PZ },
  { id: 'foot-2', bar: 'cb-bf', x: PX, z: PZ },
  { id: 'foot-3', bar: 'cb-bb', x: -PX, z: -PZ },
  { id: 'foot-4', bar: 'cb-bb', x: PX, z: -PZ },
]

/** 靠墙后几个关键世界坐标 */
const FIN_Y = FIN.at[1]
const BR_WORLD_Y = FIN_Y + BR_Y
const TAB_FRONT_Z = ZC - PZ - 10
const SPACER_Z = ZC - PZ - 17
const RAIL_Y = FIN_Y + RUNG_TOP - 30
const NUB_TOP = FIN_Y + HALF_POST + BLK + 6

// ---------- 形体 ----------
const box = (size: Vec3, at?: Vec3, fill?: Fill, chamfer?: number): Item => ({ type: 'box', size, at, fill, ...(chamfer ? { chamfer } : {}) })
const cyl = (r: number, h: number, axis: 'x' | 'y' | 'z', at?: Vec3, fill?: Fill): Item => ({ type: 'cylinder', r, h, axis, at, fill })
const hole = (w: number, h: number, at: Vec3, rot?: Vec3, fill: Fill = 'dark'): Item => ({ type: 'hole', w, h, r: Math.min(w, h) / 2, at, rot, fill })

/** 空心方管（4 片管壁），横杆的插头能插进去 */
const tube = (x: number, z: number, h: number): Item[] => [
  box([T, h, WALL_T], [x, 0, z + T / 2 - WALL_T / 2]),
  box([T, h, WALL_T], [x, 0, z - T / 2 + WALL_T / 2]),
  box([WALL_T, h, T - 2 * WALL_T], [x + T / 2 - WALL_T / 2, 0, z]),
  box([WALL_T, h, T - 2 * WALL_T], [x - T / 2 + WALL_T / 2, 0, z]),
]

/** 侧梯架：前后两根立柱 + 6 根导轨（焊在立柱内侧）。s=-1 左、+1 右；原点在框架中心 */
function ladder(s: -1 | 1): Shape {
  const x = s * PX
  return {
    type: 'compound',
    items: [
      ...tube(x, PZ, 2 * HALF_POST),
      ...tube(x, -PZ, 2 * HALF_POST),
      ...RUNG_Y.map((y) => box([12, 10, 2 * PZ - T], [s * (RUNG_IN + 6), y, 0])),
    ],
  }
}

/** 横杆：方管 + 两端端块 + 插头。底横杆端块下面有调节脚孔，顶横杆端块上面有叠放凸销 */
function crossbar(top: boolean): Shape {
  return {
    type: 'compound',
    items: [
      box([2 * PX - BLK, T, T]),
      ...[-PX, PX].flatMap((x) => [
        box([BLK, BLK, BLK], [x, 0, 0], undefined, 1),
        box([14, 20, 14], [x, top ? -21 : 21, 0], 'shade'),
        top ? box([8, 6, 8], [x, 14, 0], 'shade') : hole(10, 10, [x, -11.05, 0], [90, 0, 0]),
      ]),
    ],
  }
}

/** 调节脚：滚花脚盘不超出端块（后排脚紧挨踢脚线） */
const FOOT: Shape = {
  type: 'compound',
  items: [cyl(10.5, 12, 'y', [0, -6, 0]), cyl(10.8, 4, 'y', [0, -4, 0], 'shade'), cyl(4, 18, 'y', [0, 9, 0], 'shade')],
}

/**
 * 墙壁固定件 10003467：卡在立柱上的卡座 + 向内伸出的耳片（耳片在立柱后表面，孔朝墙）。
 * 耳片和垫片的孔是真开口（四块拼成），不放 hole 面片：螺钉从孔里穿过时面片中心会被当成穿插
 */
function wallBracket(s: -1 | 1): Shape {
  return {
    type: 'compound',
    items: [
      box([24, 30, 24], [0, 0, 0], undefined, 1.5),
      box([11, 30, 3], [s * 17.5, 0, -11.5]),
      box([11, 30, 3], [s * 36.5, 0, -11.5]),
      box([8, 11, 3], [s * BR_HOLE, 9.5, -11.5]),
      box([8, 11, 3], [s * BR_HOLE, -9.5, -11.5]),
    ],
  }
}

/** 墙面垫片 124461：方形塑料块，中间穿螺钉 */
const SPACER: Shape = {
  type: 'compound',
  items: [
    box([11, 30, 8], [-9.5, 0, 0], 'shade'),
    box([11, 30, 8], [9.5, 0, 0], 'shade'),
    box([8, 11, 8], [0, 9.5, 0], 'shade'),
    box([8, 11, 8], [0, -9.5, 0], 'shade'),
  ],
}

/** 墙螺钉（圆头，原点在螺钉头下面，螺杆朝 -z） */
const WALL_SCREW: Shape = {
  type: 'compound',
  items: [
    cyl(5.5, 3.5, 'z', [0, 0, 1.75]),
    cyl(2.5, 40, 'z', [0, 0, -20], 'shade'),
    hole(5, 1.2, [0, 0, 3.55]),
    hole(1.2, 5, [0, 0, 3.6]),
  ],
}

/** 机螺钉 10035577（十字圆头，原点在螺钉头下面，螺杆朝 +x） */
const RAIL_SCREW: Shape = {
  type: 'compound',
  items: [
    cyl(5, 3.5, 'x', [-1.75, 0, 0]),
    cyl(2.5, 10, 'x', [5, 0, 0], 'shade'),
    hole(5, 1.2, [-3.55, 0, 0], [0, -90, 0]),
    hole(1.2, 5, [-3.6, 0, 0], [0, -90, 0]),
  ],
}

/** 挂衣杆托架：L 型角钢 + 中间下方的吊耳（带孔）。原点在顶层导轨的顶面内侧棱；s=+1 吊耳朝 +x */
const BRACKET_L = 460
function railBracket(s: -1 | 1): Shape {
  return {
    type: 'compound',
    items: [
      box([14, 2, BRACKET_L], [-s * 7, 1, 0]),
      box([2, 16, BRACKET_L], [s * 1, -6, 0]),
      box([2, 11, 30], [s * 1, -20.5, 0]),
      box([2, 11, 30], [s * 1, -39.5, 0]),
      box([2, 8, 11], [s * 1, -30, -9.5]),
      box([2, 8, 11], [s * 1, -30, 9.5]),
    ],
  }
}

/** 可调式挂衣杆：外管 + 伸缩内管 + 两端管头盖（端面有缺口和嵌式螺母） */
const RAIL_HALF = RUNG_IN - 2
const RAIL: Shape = {
  type: 'compound',
  items: [
    cyl(11.5, 3, 'x', [-RAIL_HALF + 1.5, 0, 0], 'shade'),
    cyl(11, 253, 'x', [-86.5, 0, 0]),
    cyl(12.5, 6, 'x', [43, 0, 0], 'shade'),
    cyl(9.5, 167, 'x', [129.5, 0, 0]),
    cyl(10.5, 3, 'x', [RAIL_HALF - 1.5, 0, 0], 'shade'),
    hole(5, 4, [-RAIL_HALF - 0.05, 7.5, 0], [0, -90, 0]),
    hole(5, 4, [RAIL_HALF + 0.05, 7, 0], [0, 90, 0]),
    hole(5, 5, [-RAIL_HALF - 0.05, 0, 0], [0, -90, 0]),
    hole(5, 5, [RAIL_HALF + 0.05, 0, 0], [0, 90, 0]),
  ],
}

/** 安装工具 10004342：圆盘 + 带齿的臂 */
const TOOL: Shape = {
  type: 'compound',
  items: [cyl(14, 9, 'y', [0, 4.5, 0]), cyl(8, 1, 'y', [0, 9.5, 0], 'shade'), box([48, 7, 16], [36, 3.5, 0]), box([14, 5, 16], [56, 9.5, 0], 'shade')],
}

/** 锤子：原点在锤面中心，锤头竖直、锤柄沿 +x */
const HAMMER: Shape = {
  type: 'compound',
  items: [box([28, 96, 28], [0, 48, 0], 'shade', 2), cyl(11, 280, 'x', [154, 66, 0], 'warm')],
}

/** 十字螺丝刀：原点在刀头，刀身沿 -x */
const DRIVER: Shape = {
  type: 'compound',
  items: [cyl(3, 110, 'x', [-55, 0, 0], 'shade'), cyl(14, 110, 'x', [-165, 0, 0]), cyl(12, 8, 'x', [-224, 0, 0], 'shade')],
}

const LEVEL: Shape = {
  type: 'compound',
  items: [box([400, 30, 26], [0, 15, 0], undefined, 1.5), hole(56, 16, [0, 15, 13.05], undefined, 'white'), hole(16, 16, [-160, 15, 13.05]), hole(16, 16, [160, 15, 13.05])],
}

const CONNECTOR: Shape = {
  type: 'compound',
  items: [box([30, 2, 26], [0, 21, 0], 'shade'), box([2, 20, 26], [-14, 10, 0], 'shade'), box([2, 20, 26], [14, 10, 0], 'shade')],
}

// ---------- 清点时的摆放（地面，所有指南共用的初始状态） ----------
const STACK_Z = 700
const parts: SpecPart[] = [
  // 场景道具
  { id: 'wall', name: '墙', shape: { type: 'box', size: [4000, 1700, 60] }, at: WALL_POS, visible: false },
  { id: 'baseboard', name: '踢脚线', spec: '厚约 10 mm（推断）', shape: { type: 'box', size: [4000, 80, 10] }, at: [0, 40, -295], visible: false },
  {
    id: 'strips', name: '纸板', spec: '包装纸板，垫在立柱下保护地面', fill: 'warm', visible: false,
    shape: { type: 'compound', items: [{ type: 'slab', w: 110, d: 620, h: 4, at: [-PX, 0, 0] }, { type: 'slab', w: 110, d: 620, h: 4, at: [PX, 0, 0] }] },
    at: [0, 0, ZA],
  },
  { id: 'board', name: '木板', spec: '架水平尺用（第 14 页）', shape: { type: 'slab', w: 560, d: 90, h: 12, r: 2 }, fill: 'warm', at: [0, 0, 0], visible: false },

  // 框架 204.313.05
  { id: 'ladder-a', name: '侧梯架（左）', spec: '2 根立柱 + 6 根导轨 · 钢', shape: ladder(-1), at: [0, 250, STACK_Z], rot: [0, 0, 90] },
  { id: 'ladder-b', name: '侧梯架（右）', spec: '2 根立柱 + 6 根导轨 · 钢', shape: ladder(1), at: [0, 270, STACK_Z], rot: [0, 0, -90] },
  { id: 'cb-bf', name: '底横杆（前）', spec: '端块下面有调节脚孔', shape: crossbar(false), at: [830, 11, 470], rot: [-90, 0, 0] },
  { id: 'cb-bb', name: '底横杆（后）', spec: '端块下面有调节脚孔', shape: crossbar(false), at: [830, 11, 525], rot: [-90, 0, 0] },
  { id: 'cb-tf', name: '顶横杆（前）', spec: '端块上面有叠放凸销', shape: crossbar(true), at: [830, 11, 580], rot: [90, 0, 0] },
  { id: 'cb-tb', name: '顶横杆（后）', spec: '端块上面有叠放凸销', shape: crossbar(true), at: [830, 11, 635], rot: [90, 0, 0] },
  { id: 'foot-1', name: '调节脚', spec: '10003068 / 10042581', shape: FOOT, at: [690, 12, 40] },
  { id: 'foot-2', name: '调节脚', spec: '10003068 / 10042581', shape: FOOT, at: [750, 12, 40] },
  { id: 'foot-3', name: '调节脚', spec: '10003068 / 10042581', shape: FOOT, at: [690, 12, 100] },
  { id: 'foot-4', name: '调节脚', spec: '10003068 / 10042581', shape: FOOT, at: [750, 12, 100] },
  { id: 'wbr-a', name: '墙壁固定件（左）', spec: '10003467 / 10042570', shape: wallBracket(1), at: [820, 15, 50] },
  { id: 'wbr-b', name: '墙壁固定件（右）', spec: '10003467 / 10042570', shape: wallBracket(-1), at: [930, 15, 50] },
  { id: 'spacer-a', name: '墙面垫片', spec: '124461 / 130520', shape: SPACER, at: [820, 15, 130] },
  { id: 'spacer-b', name: '墙面垫片', spec: '124461 / 130520', shape: SPACER, at: [870, 15, 130] },
  { id: 'wscrew-a', name: '墙螺钉（左）', spec: '圆头 · 不含，按墙体另购', shape: WALL_SCREW, at: [-213, BR_WORLD_Y, TAB_FRONT_Z + 200], visible: false },
  { id: 'wscrew-b', name: '墙螺钉（右）', spec: '圆头 · 不含，按墙体另购', shape: WALL_SCREW, at: [213, BR_WORLD_Y, TAB_FRONT_Z + 200], visible: false },
  { id: 'conn-a', name: '连接卡扣', spec: '10004344 / 10042533 · 叠放时用', shape: CONNECTOR, at: [700, 0, 200] },
  { id: 'conn-b', name: '连接卡扣', spec: '10004344 / 10042533 · 叠放时用', shape: CONNECTOR, at: [760, 0, 200] },
  { id: 'tool', name: '安装工具', spec: '10004342', shape: TOOL, at: [840, 0, 215] },

  // 可调式挂衣杆 204.312.87
  { id: 'rbr-a', name: '挂衣杆托架（左）', spec: 'L 型角钢 + 吊耳', shape: railBracket(1), at: [-640, 14, 760], rot: [0, 0, 90] },
  { id: 'rbr-b', name: '挂衣杆托架（右）', spec: 'L 型角钢 + 吊耳', shape: railBracket(-1), at: [-760, 14, 760], rot: [0, 0, -90] },
  { id: 'rail', name: '可调式挂衣杆', spec: '伸缩管 · 管头盖带缺口', shape: RAIL, at: [-780, 12.5, 470] },
  { id: 'rscrew-a', name: '螺钉 10035577（左）', spec: '十字圆头机螺钉', shape: RAIL_SCREW, at: [-880, 5, 600] },
  { id: 'rscrew-b', name: '螺钉 10035577（右）', spec: '十字圆头机螺钉', shape: RAIL_SCREW, at: [-880, 5, 640] },

  // 工具
  { id: 'hammer', name: '锤子', shape: HAMMER, at: [-900, 14, 0], rot: [90, 0, 0] },
  { id: 'level', name: '水平尺', shape: LEVEL, at: [-760, 0, 180] },
  { id: 'bubble', name: '水平气泡', parent: 'level', shape: { type: 'led', r: 5, color: '#22b04b' }, at: [0, 15, 13.3] },
  { id: 'driver', name: '十字螺丝刀', shape: DRIVER, at: [-600, 14, 300] },
  { id: 'driver-b', name: '十字螺丝刀', spec: '同一把螺丝刀，换到右侧', shape: DRIVER, at: [400, 14, 400], visible: false },
]

// ---------- 状态片段 ----------
const GREEN = '#22b04b'

/** 组装框架指南：除两片梯架外，其余零件先收在各自的就位点上方（隐藏），到步骤时出现并装入 */
const HAMMER_ROT: Vec3 = [0, -90, 0]
const CORNER: [number, number] = [-PX, ZA + PZ]
const TOOL_AT = (y: number): Vec3 => [CORNER[0], y, CORNER[1]]
/** 第 11 页：倒立时底横杆端块朝上的一面 */
const TOOL_Y1 = UD1.at[1] + CB_Y + BLK / 2
/** 第 12 页：正立时顶横杆凸销顶面 */
const TOOL_Y2 = UP1.at[1] + CB_Y + BLK / 2 + 6
const HAMMER_GAP = 10 + 14

const footReady = (pose: FramePose, f: (typeof FEET)[number]): Vec3 => add(toWorld(pose, [0, -CB_Y, f.z]), [f.x, BLK / 2 + 100, 0])

const FRAME_START: Record<string, PartState> = {
  wall: { visible: true },
  baseboard: { visible: true },
  'ladder-a': free([0, 250, STACK_Z], [0, 0, 90]),
  'ladder-b': free([0, 270, STACK_Z], [0, 0, -90]),
  strips: { visible: true },
  'cb-bf': hidden(add(toWorld(UD1, CB.bf), [0, 200, 0]), [180, 0, 0]),
  'cb-bb': hidden(add(toWorld(UD1, CB.bb), [0, 200, 0]), [180, 0, 0]),
  'cb-tf': hidden(add(toWorld(UP1, CB.tf), [0, 200, 0])),
  'cb-tb': hidden(add(toWorld(UP1, CB.tb), [0, 200, 0])),
  ...Object.fromEntries(FEET.map((f) => [f.id, hidden(footReady(UD2, f), [180, 0, 0])])),
  tool: hidden(TOOL_AT(TOOL_Y1 + 100)),
  hammer: hidden(TOOL_AT(TOOL_Y1 + HAMMER_GAP + 100), HAMMER_ROT),
  board: hidden([0, NUB_TOP + 150, ZC + PZ]),
  level: { parent: 'board', at: [0, 12, 0], rot: [0, 0, 0] },
  'wbr-a': { visible: false },
  'wbr-b': { visible: false },
  'spacer-a': { visible: false },
  'spacer-b': { visible: false },
  'conn-a': { visible: false },
  'conn-b': { visible: false },
  'rbr-a': { visible: false },
  'rbr-b': { visible: false },
  rail: { visible: false },
  'rscrew-a': { visible: false },
  'rscrew-b': { visible: false },
  driver: { visible: false },
}

/** 框架装好、靠墙（固定到墙上 / 挂衣杆两个指南的起点） */
const FRAME_DONE: Record<string, PartState> = {
  ...FRAME_START,
  'ladder-a': frameState(FIN),
  'ladder-b': { parent: 'ladder-a', at: [0, 0, 0], rot: [0, 0, 0] },
  strips: { visible: false },
  'cb-bf': { parent: 'ladder-a', at: CB.bf, rot: CB_BOTTOM_ROT, visible: true },
  'cb-bb': { parent: 'ladder-a', at: CB.bb, rot: CB_BOTTOM_ROT, visible: true },
  'cb-tf': { parent: 'ladder-a', at: CB.tf, rot: [0, 0, 0], visible: true },
  'cb-tb': { parent: 'ladder-a', at: CB.tb, rot: [0, 0, 0], visible: true },
  ...Object.fromEntries(FEET.map((f) => [f.id, { parent: f.bar, at: [f.x, -BLK / 2, 0] as Vec3, rot: [0, 0, 0] as Vec3, visible: true }])),
  tool: { visible: false },
  hammer: { visible: false },
}

const WALL_READY: Record<string, PartState> = {
  'wbr-a': hidden([-PX + 120, BR_WORLD_Y, ZC - PZ]),
  'wbr-b': hidden([PX - 120, BR_WORLD_Y, ZC - PZ]),
  'spacer-a': hidden([-PX + BR_HOLE, BR_WORLD_Y + 150, SPACER_Z]),
  'spacer-b': hidden([PX - BR_HOLE, BR_WORLD_Y + 150, SPACER_Z]),
  'wscrew-a': hidden([-PX + BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 200]),
  'wscrew-b': hidden([PX - BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 200]),
  driver: hidden([-PX + BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 3.5 + 200], [0, 90, 0]),
}

const wallScrewAt = (x: number): Vec3 => [x - WALL_POS[0], BR_WORLD_Y - WALL_POS[1], TAB_FRONT_Z - WALL_POS[2]]
const WALL_DONE: Record<string, PartState> = {
  'wbr-a': { parent: 'ladder-a', at: [-PX, BR_Y, -PZ], rot: [0, 0, 0], visible: true },
  'wbr-b': { parent: 'ladder-b', at: [PX, BR_Y, -PZ], rot: [0, 0, 0], visible: true },
  'spacer-a': { parent: 'wbr-a', at: [BR_HOLE, 0, -17], rot: [0, 0, 0], visible: true },
  'spacer-b': { parent: 'wbr-b', at: [-BR_HOLE, 0, -17], rot: [0, 0, 0], visible: true },
  'wscrew-a': { parent: 'wall', at: wallScrewAt(-PX + BR_HOLE), rot: [0, 0, 0], visible: true },
  'wscrew-b': { parent: 'wall', at: wallScrewAt(PX - BR_HOLE), rot: [0, 0, 0], visible: true },
  driver: { visible: false },
}

/** 挂衣杆：托架先放到顶层导轨上（吊耳朝内横着），再转 90° 让吊耳朝下 */
const RB_BEFORE_A: Vec3 = [-RUNG_IN + 2, RUNG_TOP, 0]
const RB_BEFORE_B: Vec3 = [RUNG_IN - 2, RUNG_TOP, 0]
const RAIL_READY: Record<string, PartState> = {
  'rbr-a': hidden(add(toWorld(FIN, RB_BEFORE_A), [0, 220, 0]), [0, 0, 90]),
  'rbr-b': hidden(add(toWorld(FIN, RB_BEFORE_B), [0, 220, 0]), [0, 0, -90]),
  rail: hidden([0, RAIL_Y - 200, ZC]),
  'rscrew-a': hidden([-RUNG_IN - 80, RAIL_Y, ZC]),
  'rscrew-b': hidden([RUNG_IN + 80, RAIL_Y, ZC], [0, 180, 0]),
  driver: hidden([-RUNG_IN - 3.5 - 80, RAIL_Y, ZC]),
  'driver-b': hidden([RUNG_IN + 3.5 + 80, RAIL_Y, ZC], [0, 180, 0]),
}

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [40, 0, 500], dir: [0.25, 1, 0.9], dist: 2600 }
const ASM: CameraSpec = { target: [0, 560, ZA], dir: [0.55, 0.4, 1], dist: 2650 }
const ASM_TOP: CameraSpec = { target: [-60, 900, ZA + 120], dir: [0.45, 0.6, 1], dist: 1500 }
const WALL_VIEW: CameraSpec = { target: [0, 560, ZC], dir: [0.5, 0.35, 1], dist: 2650 }
const BACK_TOP: CameraSpec = { target: [0, BR_WORLD_Y - 60, ZC - 120], dir: [0.3, 0.75, 1], dist: 1500 }
const RAIL_VIEW: CameraSpec = { target: [0, RAIL_Y - 20, ZC], dir: [0.35, 0.55, 1], dist: 1500 }
const cornerZoom = (y: number, caption: string) => ({ target: [CORNER[0], y, CORNER[1]] as Vec3, dir: [0.55, 0.5, 1] as Vec3, dist: 260, caption })

export const ikeaJonaxel: ManualSpec = {
  id: 'ikea-jonaxel',
  name: 'IKEA JONAXEL 尤纳赛尔 衣柜组合',
  desc: '钢框架 + 可调式挂衣杆 · 50×51×104 cm · 组装 / 固定到墙上',
  category: '平板家具',
  dims: { width: 500, depth: 510, height: 1040 },
  source: {
    title: 'JONAXEL 尤纳赛尔 框架 AA-2139639-6（第 1–28 页）+ 可调式挂衣杆 AA-2161609-2（第 29–40 页）组装说明',
    url: 'https://www.ikea.cn/cn/zh/p/jonaxel-you-na-sai-er-yi-gui-zu-he-bai-se-s29311493/',
    images: [],
  },
  package: [
    { name: '侧梯架', qty: 2, spec: '框架 204.313.05 · 每片 2 根立柱 + 6 根导轨' },
    { name: '底横杆', qty: 2, spec: '端块下面有调节脚孔' },
    { name: '顶横杆', qty: 2, spec: '端块上面有叠放凸销' },
    { name: '调节脚', qty: 4, spec: '10003068 / 10042581' },
    { name: '墙壁固定件', qty: 2, spec: '10003467 / 10042570' },
    { name: '墙面垫片', qty: 2, spec: '124461 / 130520 · 间隙 10 / 15 mm 时用' },
    { name: '连接卡扣', qty: 2, spec: '10004344 / 10042533 · 两个框架叠放时用' },
    { name: '安装工具', qty: 1, spec: '10004342 · 配锤子敲紧横杆' },
    { name: '可调式挂衣杆', qty: 1, spec: '204.312.87 · 伸缩管' },
    { name: '挂衣杆托架', qty: 2, spec: 'L 型角钢 + 吊耳' },
    { name: '螺钉', qty: 2, spec: '10035577 · 十字圆头' },
    { name: '组装说明', qty: 2, spec: 'AA-2139639-6 · AA-2161609-2' },
  ],
  params: [
    { label: '组合尺寸', value: '50 × 51 × 104 cm', note: '宽 × 深 × 高（产品页）' },
    { label: '货号', value: '293.114.93', note: '框架 204.313.05 + 可调式挂衣杆 204.312.87' },
    { label: '材料', value: '钢 · 环氧 / 聚酯粉末涂层', note: '管形保护件、管头盖为聚丙烯' },
    { label: '净重', value: '框架 4.37 kg · 挂衣杆 0.92 kg' },
    { label: '包装', value: '104 × 52 × 5 cm · 51 × 5 × 4 cm', note: '框架 / 挂衣杆' },
    { label: '工具', value: '锤子、水平尺、十字螺丝刀', note: '框架第 9 页 / 挂衣杆第 2 页' },
    { label: '上墙螺钉', value: '不含，按墙体另购', note: '用圆头螺钉，不用沉头（第 17 页）' },
    { label: '叠放', value: '最多两层', note: '第 19 页；上层不装调节脚' },
    { label: '使用环境', value: '仅限室内', note: '产品页' },
  ],
  parts,
  stageSize: 2200,
  guides: [
    {
      id: 'unbox', title: '开箱清点：零件与工具', kind: 'usage',
      steps: [
        {
          id: 'u-packs', title: '两个包装：框架 + 挂衣杆', page: 1,
          desc: '衣柜组合由两个包装组成：JONAXEL 框架（两片侧梯架、四根横杆和五金）与可调式挂衣杆（伸缩管、两根托架、两颗螺钉）。先把所有零件摊在地上清点。',
          camera: OVERVIEW,
          highlight: ['ladder-a', 'ladder-b'],
          callouts: [
            { part: 'ladder-b', text: '侧梯架 ×2', sub: '每片 6 根导轨', at: [PX, 300, 0], offset: [0, 160, 0] },
            { part: 'cb-tf', text: '横杆 ×4', sub: '2 根带脚孔 · 2 根带凸销', at: [-170, 0, 0], offset: [-60, 160, 120] },
            { part: 'foot-2', text: '框架五金', sub: '第 10 页', offset: [-140, 180, -40] },
            { part: 'rail', text: '可调式挂衣杆', at: [200, 0, 0], offset: [180, 60, -120] },
            { part: 'rbr-a', text: '托架 ×2', offset: [170, 120, 230] },
          ],
          chips: [{ label: '包装', sub: '2 个' }, { label: '整体', sub: '50 × 51 × 104 cm' }],
        },
        {
          id: 'u-hw', title: '框架五金（第 10 页）', page: 10,
          desc: '调节脚 ×4（10003068）、墙壁固定件 ×2（10003467）、墙面垫片 ×2（124461）、连接卡扣 ×2（10004344）、安装工具 ×1（10004342）。连接卡扣只在两个框架叠放时使用。',
          camera: { target: [810, 10, 130], dir: [0.15, 1, 0.75], dist: 820 },
          highlight: ['foot-1', 'foot-2', 'foot-3', 'foot-4', 'wbr-a', 'wbr-b', 'spacer-a', 'spacer-b', 'conn-a', 'conn-b', 'tool'],
          callouts: [
            { part: 'foot-1', text: '调节脚 ×4', offset: [-90, 30, -30] },
            { part: 'wbr-a', text: '墙壁固定件 ×2', offset: [60, 40, -70] },
            { part: 'spacer-b', text: '墙面垫片 ×2', offset: [110, 30, 0] },
            { part: 'conn-a', text: '连接卡扣 ×2', sub: '叠放时用', offset: [-30, 40, 110] },
            { part: 'tool', text: '安装工具 ×1', offset: [90, 30, 50] },
          ],
          chips: [{ label: '五金', sub: '5 种 11 件' }],
        },
        {
          id: 'u-rail', title: '挂衣杆零件（第 30 页）', page: 30,
          desc: '可调式挂衣杆包装：伸缩挂衣杆 ×1、L 型托架 ×2、十字圆头螺钉 10035577 ×2。',
          camera: { target: [-790, 0, 720], dir: [0.2, 1, 0.8], dist: 1450 },
          highlight: ['rail', 'rbr-a', 'rbr-b', 'rscrew-a', 'rscrew-b'],
          zoom: { target: 'rscrew-a', offset: [3, 0, 20], dir: [0.2, 1, 0.6], dist: 150, caption: '螺钉 10035577 ×2（十字圆头）' },
          callouts: [
            { part: 'rail', text: '可调式挂衣杆', sub: '伸缩管', offset: [-100, 80, 30] },
            { part: 'rbr-a', text: '托架 ×2', sub: '中间带吊耳', offset: [90, 60, 0] },
          ],
          chips: [{ label: '螺钉', sub: '10035577 ×2' }],
        },
        {
          id: 'u-tools', title: '准备工具', page: 9,
          desc: '框架需要锤子和水平尺（第 9 页），挂衣杆需要十字螺丝刀（第 30 页）。上墙用的螺钉和螺塞不在包装里，要按墙体材质另外购买。',
          camera: { target: [-760, 10, 150], dir: [0.25, 1, 0.8], dist: 1000 },
          highlight: ['hammer', 'level', 'driver'],
          callouts: [
            { part: 'hammer', text: '锤子', at: [150, 66, 0], offset: [60, 50, -40] },
            { part: 'level', text: '水平尺', offset: [-120, 50, 0] },
            { part: 'driver', text: '十字螺丝刀', at: [-110, 0, 0], offset: [40, 50, 60] },
          ],
          tip: '上墙螺钉与螺塞需另购：请使用适合你家墙壁的螺钉和螺塞，不确定时请咨询专业人士（第 7 页）。',
        },
        {
          id: 'u-mat', title: '铺好纸板再组装', page: 9,
          desc: '在地毯或包装纸板上组装，不要直接在硬地面上操作，避免磕坏立柱和地板。看不懂某一步时，可以联系宜家。',
          camera: { target: [0, 0, ZA + 120], dir: [0.4, 1, 0.9], dist: 1700 },
          set: { strips: { visible: true } },
          highlight: ['strips'],
          callouts: [{ part: 'strips', text: '纸板 / 软垫', sub: '保护地面', at: [PX, 4, 0], offset: [120, 60, 0] }],
          tip: '整个衣柜组合必须固定到墙上使用（第 15 页）。',
        },
      ],
    },
    {
      id: 'frame', title: '组装框架', kind: 'assembly',
      start: FRAME_START,
      steps: [
        {
          id: 'f-stand', title: '侧梯架倒立放在纸板上', page: 11,
          desc: '把两片侧梯架倒过来立在纸板上：立柱上离导轨较远的一端（底端）朝上，离导轨较近的一端（顶端）踩在纸板上。',
          camera: ASM,
          set: {
            'ladder-b': frameState(UD1, { lift: 320, dur: 1.8 }),
            'ladder-a': frameState(UD1, { lift: 320, delay: 1.2, dur: 1.8 }),
          },
          highlight: ['ladder-a', 'ladder-b'],
          callouts: [
            { part: 'ladder-a', text: '长端朝上 = 底端', sub: '离导轨约 110 mm', at: [-PX, -HALF_POST, PZ], offset: [140, 120, 0] },
            { part: 'ladder-a', text: '短端朝下 = 顶端', sub: '离导轨约 60 mm', at: [-PX, HALF_POST, PZ], offset: [180, 180, 80] },
          ],
          tip: '先分清上下：立柱两端到最近导轨的距离不一样，远的一端是底端（第 11 页右侧小图）。',
        },
        {
          id: 'f-bottom', title: '压入两根底横杆', page: 11,
          desc: '拿端块带方孔的两根横杆（底横杆），把端头的方形插头对准朝上的立柱管口，竖直压进去，共 4 个插头。',
          camera: ASM_TOP,
          set: {
            'ladder-b': { parent: 'ladder-a' },
            'cb-bf': { visible: true, parent: 'ladder-a', at: CB.bf, rot: CB_BOTTOM_ROT, dur: 1.2 },
            'cb-bb': { visible: true, parent: 'ladder-a', at: CB.bb, rot: CB_BOTTOM_ROT, delay: 0.4, dur: 1.2 },
          },
          highlight: ['cb-bf', 'cb-bb'],
          zoom: { ...cornerZoom(TOOL_Y1 - 10, '方形插头压进立柱管口 · 4x'), dir: [0.6, 0.35, 1] },
          chips: [{ label: '插头', sub: '4x' }],
        },
        {
          id: 'f-tap1', title: '用安装工具和锤子敲紧', page: 11,
          desc: '把安装工具 10004342 扣在端块上，用锤子敲工具的圆盘，把插头敲到底。四个角都这样敲一遍。',
          camera: ASM_TOP,
          set: {
            tool: { visible: true, at: TOOL_AT(TOOL_Y1), dur: 0.9 },
            hammer: { visible: true, at: TOOL_AT(TOOL_Y1 + HAMMER_GAP), dur: 1.0, delay: 0.3 },
          },
          actions: [{ type: 'press', part: 'hammer', depth: 14, delay: 1.5 }],
          highlight: ['tool', 'hammer'],
          zoom: cornerZoom(TOOL_Y1 + 10, '锤子隔着安装工具敲，不直接敲端块'),
          chips: [{ label: '工具', sub: '10004342 + 锤子' }, { label: '4 个角', sub: '逐个敲紧' }],
        },
        {
          id: 'f-flip1', title: '把框架翻过来', page: 12,
          desc: '收起工具，把框架整体翻转 180°，让刚装好的底横杆着地。',
          camera: ASM,
          set: {
            tool: { visible: false, at: TOOL_AT(TOOL_Y2 + 100), dur: 0.6 },
            hammer: { visible: false, at: TOOL_AT(TOOL_Y2 + HAMMER_GAP + 100), dur: 0.6 },
            'ladder-a': frameState(UP1, { lift: 320, delay: 0.7, dur: 1.8 }),
          },
          highlight: ['ladder-a', 'ladder-b', 'cb-bf', 'cb-bb'],
        },
        {
          id: 'f-top', title: '压入顶横杆并敲紧', page: 12,
          desc: '拿端块带凸销的两根横杆（顶横杆），插头对准立柱上端管口压入，再用安装工具和锤子把 4 个插头敲到底。',
          camera: ASM_TOP,
          set: {
            'cb-tf': { visible: true, parent: 'ladder-a', at: CB.tf, rot: [0, 0, 0], dur: 1.2 },
            'cb-tb': { visible: true, parent: 'ladder-a', at: CB.tb, rot: [0, 0, 0], delay: 0.3, dur: 1.2 },
            tool: { visible: true, at: TOOL_AT(TOOL_Y2), delay: 1.6, dur: 0.9 },
            hammer: { visible: true, at: TOOL_AT(TOOL_Y2 + HAMMER_GAP), delay: 1.8, dur: 1.0 },
          },
          actions: [{ type: 'press', part: 'hammer', depth: 14, delay: 3.0 }],
          highlight: ['cb-tf', 'cb-tb', 'hammer'],
          zoom: cornerZoom(TOOL_Y2 + 5, '顶横杆端块上有叠放凸销'),
          chips: [{ label: '插头', sub: '4x' }],
          tip: '顶横杆上的凸销用来叠放第二个框架（最多叠两层，上层不装调节脚，第 19 页）。',
        },
        {
          id: 'f-flip2', title: '再把框架倒过来', page: 13,
          desc: '收起工具，再次把框架翻转，让底横杆朝上，方便拧调节脚。',
          camera: ASM,
          set: {
            tool: { visible: false, at: TOOL_AT(TOOL_Y2 + 100), dur: 0.6 },
            hammer: { visible: false, at: TOOL_AT(TOOL_Y2 + HAMMER_GAP + 100), dur: 0.6 },
            'ladder-a': frameState(UD2, { lift: 320, delay: 0.7, dur: 1.8 }),
          },
          highlight: ['ladder-a', 'ladder-b'],
        },
        {
          id: 'f-feet', title: '拧入 4 个调节脚', page: 13,
          desc: '把 4 个调节脚 10003068 分别对准底横杆端块上的方孔，顺时针拧进去。',
          camera: { ...ASM_TOP, target: [0, 900, ZA + 60] },
          set: Object.fromEntries(FEET.map((f, i) => [f.id, { visible: true, parent: f.bar, at: [f.x, -BLK / 2, 0] as Vec3, rot: [0, 0, 0] as Vec3, delay: i * 0.3, dur: 1.2 }])),
          actions: FEET.map((f) => ({ type: 'spin' as const, part: f.id, axis: 'y' as const })),
          highlight: FEET.map((f) => f.id),
          zoom: { target: 'foot-1', dir: [0.5, 0.6, 1], dist: 200, caption: '顺时针拧入端块方孔 · 4x' },
          chips: [{ label: '调节脚', sub: '10003068 × 4' }],
        },
        {
          id: 'f-place', title: '翻正，靠墙放好', page: 14,
          desc: '把框架翻回正立，让调节脚着地，然后推到要摆放的墙边，后侧靠墙。',
          camera: WALL_VIEW,
          set: {
            'ladder-a': frameState(FIN, { lift: 320, dur: 2.2 }),
            strips: { visible: false, dur: 0.9 },
          },
          highlight: ['ladder-a', 'ladder-b'],
          tip: '不要给这个框架装脚轮使用（第 16 页）。',
        },
        {
          id: 'f-level', title: '用水平尺调平', page: 14,
          desc: '在框架顶上横放一块木板，再放上水平尺。转动 4 个调节脚升高或降低，直到气泡居中。',
          camera: { target: [0, 560, ZC + 60], dir: [0.4, 0.35, 1], dist: 2500 },
          set: {
            board: { visible: true, at: [0, NUB_TOP, ZC + PZ], dur: 1.2 },
            bubble: { light: 'on', color: GREEN, delay: 1.3 },
          },
          actions: FEET.map((f) => ({ type: 'spin' as const, part: f.id, axis: 'y' as const, delay: 1.3 })),
          highlight: ['level', 'foot-1', 'foot-2'],
          zoom: { target: 'bubble', dir: [0.15, 0.3, 1], dist: 260, caption: '气泡居中 = 水平' },
          chips: [{ label: '调节脚', sub: '转动升降 ↕' }],
        },
      ],
    },
    {
      id: 'wall', title: '固定到墙上（防倾倒）', kind: 'assembly',
      start: { ...FRAME_DONE, ...WALL_READY },
      steps: [
        {
          id: 'w-warn', title: '必须固定到墙上', page: 15,
          desc: '框架必须用附带的墙壁固定件固定到墙上才能使用，防止倾倒。固定件装在两根后立柱的上部，螺钉从框架里面拧进墙。',
          camera: { target: [0, 620, ZC - 80], dir: [1, 0.45, 0.75], dist: 2600 },
          highlight: ['ladder-a', 'ladder-b'],
          callouts: [
            { part: 'ladder-b', text: '后立柱上部', sub: '装墙壁固定件', at: [PX, BR_Y, -PZ], offset: [160, 120, 120] },
            { part: 'baseboard', text: '踢脚线', at: [300, 40, 5], offset: [200, 80, 200] },
          ],
          tip: '警告！家具倾倒可能会导致严重甚至致命的压伤。为防止此家具倾倒，请务必使用附带提供的上墙固定配件（第 7 页）。',
        },
        {
          id: 'w-clip', title: '卡上两个墙壁固定件', page: 15,
          desc: '把两个墙壁固定件 10003467 从框架里面推到两根后立柱上部，听到「咔哒」一声即卡紧。带孔的耳片朝内、贴着立柱后表面。',
          camera: BACK_TOP,
          set: {
            'wbr-a': { visible: true, parent: 'ladder-a', at: [-PX, BR_Y, -PZ], rot: [0, 0, 0], dur: 1.2 },
            'wbr-b': { visible: true, parent: 'ladder-b', at: [PX, BR_Y, -PZ], rot: [0, 0, 0], delay: 0.4, dur: 1.2 },
          },
          highlight: ['wbr-a', 'wbr-b'],
          zoom: { target: 'wbr-a', offset: [12, 0, 0], dir: [0.6, 0.55, 1], dist: 240, caption: '推到后立柱上：Click!' },
          chips: [{ label: '固定件', sub: '10003467 × 2' }],
          tip: '导轨后端有止挡凸起，可以用来确认哪一侧是后面（第 15 页局部图，推断）。',
        },
        {
          id: 'w-gap', title: '看框架和墙之间的间隙', page: 17,
          desc: '框架后侧要贴着墙（或踢脚线）。按顶部到墙面的间隙选做法：约 3 mm 直接拧螺钉；约 10 mm 加垫片；约 15 mm 把垫片翻面再加。这里踢脚线约 10 mm。',
          camera: { target: [PX, 520, ZC - 200], dir: [1, 0.25, 0.35], dist: 2400 },
          highlight: ['wbr-b'],
          zoom: { target: 'wbr-b', offset: [0, -10, -17], dir: [1, 0.12, 0.02], dist: 110, caption: '侧面看：耳片离墙约 8 mm → 需要垫片' },
          callouts: [
            { part: 'baseboard', text: '踢脚线约 10 mm', at: [PX + 20, 80, 5], offset: [0, 160, 160] },
          ],
          chips: [{ label: '3 mm', sub: '不用垫片' }, { label: '10 mm', sub: '加垫片' }, { label: '15 mm', sub: '垫片翻面' }],
          tip: '不要在框架离墙悬空的情况下拧螺钉（第 16 页）。',
        },
        {
          id: 'w-spacer', title: '放入两块墙面垫片', page: 17,
          desc: '把垫片 124461 从上往下塞进固定件耳片和墙之间，孔对准耳片的孔。15 mm 间隙时把垫片翻面（第 18 页）。',
          camera: BACK_TOP,
          set: {
            'spacer-a': { visible: true, parent: 'wbr-a', at: [BR_HOLE, 0, -17], rot: [0, 0, 0], dur: 1.2 },
            'spacer-b': { visible: true, parent: 'wbr-b', at: [-BR_HOLE, 0, -17], rot: [0, 0, 0], delay: 0.3, dur: 1.2 },
          },
          highlight: ['spacer-a', 'spacer-b'],
          zoom: { target: 'spacer-a', offset: [0, 8, 10], dir: [0.5, 1, 0.55], dist: 220, caption: '垫片夹在耳片和墙之间' },
          chips: [{ label: '垫片', sub: '124461 × 2' }],
        },
        {
          id: 'w-screw-a', title: '拧入左侧墙螺钉', page: 17,
          desc: '用圆头螺钉穿过耳片和垫片拧进墙（墙上先按墙体打孔、装螺塞）。',
          camera: { ...BACK_TOP, target: [-PX + BR_HOLE, BR_WORLD_Y - 40, ZC - 140], dir: [0.45, 0.6, 1], dist: 1100 },
          set: {
            'wscrew-a': { visible: true, parent: 'wall', at: wallScrewAt(-PX + BR_HOLE), rot: [0, 0, 0], dur: 1.4 },
            driver: { visible: true, at: [-PX + BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 3.5], rot: [0, 90, 0], dur: 1.4 },
          },
          actions: [{ type: 'spin', part: 'wscrew-a', axis: 'z' }, { type: 'spin', part: 'driver', axis: 'x' }],
          highlight: ['wscrew-a', 'driver'],
          zoom: { target: 'wscrew-a', offset: [0, 0, -4], dir: [0.6, 0.5, 1], dist: 200, caption: '圆头 ✓ · 沉头 ✗' },
          chips: [{ label: '墙螺钉', sub: '另购 · 圆头' }],
          tip: '用圆头螺钉，不要用沉头螺钉；螺钉和螺塞按墙体材质另购（第 17 页）。',
        },
        {
          id: 'w-screw-b', title: '拧入右侧墙螺钉', page: 17,
          desc: '右侧同样把螺钉穿过耳片和垫片拧进墙，两侧都拧紧。',
          camera: { ...BACK_TOP, target: [PX - BR_HOLE, BR_WORLD_Y - 40, ZC - 140], dir: [-0.45, 0.6, 1], dist: 1100 },
          set: {
            'wscrew-b': { visible: true, parent: 'wall', at: wallScrewAt(PX - BR_HOLE), rot: [0, 0, 0], dur: 1.2 },
            driver: { at: [PX - BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 3.5], via: [0, BR_WORLD_Y, ZC - 120], delay: 0.2, dur: 1.6 },
          },
          actions: [{ type: 'spin', part: 'wscrew-b', axis: 'z' }, { type: 'spin', part: 'driver', axis: 'x' }],
          highlight: ['wscrew-b', 'driver'],
          zoom: { target: 'wscrew-b', offset: [0, 0, -4], dir: [-0.6, 0.5, 1], dist: 200, caption: '穿过耳片 + 垫片拧进墙' },
        },
        {
          id: 'w-done', title: '固定完成', page: 16,
          desc: '两侧固定件都拧好后，框架就不会向前倾倒了。',
          camera: WALL_VIEW,
          set: { driver: { visible: false, at: [PX - BR_HOLE, BR_WORLD_Y, TAB_FRONT_Z + 3.5 + 150], dur: 0.8 } },
          highlight: ['wbr-a', 'wbr-b'],
          callouts: [{ part: 'wbr-b', text: '已固定到墙上', offset: [120, 140, 120] }],
          tip: '叠放两个框架时，上下两层都要装墙壁固定件（共 4 个，第 21 页）；不要给框架装脚轮（第 16 页）。',
        },
      ],
    },
    {
      id: 'rail', title: '安装可调式挂衣杆', kind: 'assembly',
      start: { ...FRAME_DONE, ...WALL_DONE, ...RAIL_READY },
      steps: [
        {
          id: 'r-place', title: '把两根托架放到顶层导轨上', page: 31,
          desc: '把两根托架从框架顶部放进去，分别搭在左右两侧最上面一层导轨上，吊耳朝内。',
          camera: RAIL_VIEW,
          set: {
            'rbr-a': { visible: true, parent: 'ladder-a', at: RB_BEFORE_A, rot: [0, 0, 90], dur: 1.3 },
            'rbr-b': { visible: true, parent: 'ladder-b', at: RB_BEFORE_B, rot: [0, 0, -90], delay: 0.3, dur: 1.3 },
          },
          highlight: ['rbr-a', 'rbr-b'],
          chips: [{ label: '托架', sub: '× 2' }],
        },
        {
          id: 'r-turn', title: '转动托架，扣住导轨', page: 32,
          desc: '沿托架长轴把它转过来，让托架扣在导轨上，中间的吊耳垂直朝下。',
          camera: RAIL_VIEW,
          set: {
            'rbr-a': { at: [-RUNG_IN, RUNG_TOP, 0], rot: [0, 0, 0], dur: 1.0 },
            'rbr-b': { at: [RUNG_IN, RUNG_TOP, 0], rot: [0, 0, 0], delay: 0.2, dur: 1.0 },
          },
          highlight: ['rbr-a', 'rbr-b'],
          zoom: { target: 'rbr-a', offset: [2, -30, 0], dir: [0.7, 0.3, 1], dist: 200, caption: '吊耳转到下方、孔朝内' },
        },
        {
          id: 'r-rail', title: '从下方装上挂衣杆', page: 33,
          desc: '确认两端管头盖上的缺口朝上，把挂衣杆从下往上抬到两个吊耳之间。',
          camera: RAIL_VIEW,
          set: { rail: { visible: true, parent: 'rbr-a', at: [RUNG_IN, -30, 0], rot: [0, 0, 0], dur: 1.4 } },
          highlight: ['rail'],
          zoom: { target: [-RAIL_HALF, RAIL_Y, ZC], dir: [0.65, 0.3, 0.75], dist: 170, caption: '管头盖缺口朝上 ✓（转到侧面 ✗）' },
          chips: [{ label: '缺口', sub: '朝上' }],
        },
        {
          id: 'r-screw-a', title: '拧紧左侧螺钉', page: 34,
          desc: '把一颗螺钉 10035577 从外侧穿过左侧吊耳的孔，用十字螺丝刀顺时针拧进挂衣杆端头的嵌式螺母。',
          camera: { target: [-RUNG_IN - 40, RAIL_Y, ZC], dir: [-0.9, 0.35, 0.8], dist: 1000 },
          set: {
            'rscrew-a': { visible: true, parent: 'rail', at: [-RUNG_IN, 0, 0], rot: [0, 0, 0], dur: 1.2 },
            driver: { visible: true, at: [-RUNG_IN - 3.5, RAIL_Y, ZC], rot: [0, 0, 0], dur: 1.2 },
          },
          actions: [{ type: 'spin', part: 'rscrew-a', axis: 'x' }, { type: 'spin', part: 'driver', axis: 'x' }],
          highlight: ['rscrew-a', 'driver'],
          zoom: { target: 'rscrew-a', offset: [2, 0, 0], dir: [-0.8, 0.35, 0.7], dist: 140, caption: '螺钉 → 吊耳 → 挂衣杆端头' },
          chips: [{ label: '螺钉', sub: '10035577 × 1' }],
        },
        {
          id: 'r-screw-b', title: '拧紧右侧螺钉', page: 35,
          desc: '右侧同样用一颗螺钉穿过吊耳拧进挂衣杆另一端。',
          camera: { target: [RUNG_IN + 40, RAIL_Y, ZC], dir: [0.9, 0.35, 0.8], dist: 1000 },
          set: {
            driver: { visible: false, at: [-RUNG_IN - 3.5 - 120, RAIL_Y, ZC], dur: 0.7 },
            'rscrew-b': { visible: true, parent: 'rail', at: [RUNG_IN, 0, 0], rot: [0, 180, 0], delay: 0.3, dur: 1.2 },
            'driver-b': { visible: true, at: [RUNG_IN + 3.5, RAIL_Y, ZC], rot: [0, 180, 0], delay: 0.3, dur: 1.2 },
          },
          actions: [{ type: 'spin', part: 'rscrew-b', axis: 'x' }, { type: 'spin', part: 'driver-b', axis: 'x' }],
          highlight: ['rscrew-b', 'driver-b'],
          zoom: { target: 'rscrew-b', offset: [-2, 0, 0], dir: [0.8, 0.35, 0.7], dist: 140, caption: '右侧吊耳同样拧紧' },
          chips: [{ label: '螺钉', sub: '10035577 × 1' }],
        },
        {
          id: 'r-done', title: '挂衣杆装好了', page: 38,
          desc: '挂衣杆装好，可以挂衬衫等需要悬挂的衣物。挂衣杆是伸缩的：两个框架并排时，它也可以跨在两个框架之间（第 36–38 页）。',
          camera: WALL_VIEW,
          set: { 'driver-b': { visible: false, at: [RUNG_IN + 3.5 + 120, RAIL_Y, ZC], dur: 0.7 } },
          highlight: ['rail'],
          callouts: [{ part: 'rail', text: '可调式挂衣杆', sub: '伸缩管', offset: [-80, 160, 160] }],
          chips: [{ label: '完成', sub: '衣柜组合' }],
          tip: '可以另购 JONAXEL 顶板放在框架上（第 25 页）；加装网篮时不要把网篮整个拉出，拉到止挡即可（第 26 页）。',
        },
      ],
    },
  ],
}