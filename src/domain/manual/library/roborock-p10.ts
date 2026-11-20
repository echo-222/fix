import type { CameraSpec, ManualSpec, PartState, SpecPart, Vec3 } from '../types'
import {
  APP, BRUSH_Z, DRAIN_INLET, KNOB_CLOSED, KNOB_OPEN, LIT, L_PLUG_OUT, PHONE_VIEW, PIPE_OUT, TEE_OUTLET, WALL_PLUG_OUT,
  add, bottleShape, clipItems, dcPlug, dustbinAt, hide, lPlug, phoneParts, pipeEnd, robotParts, robotPoses, show, sub, wallParts, wallPlug, zoomTop,
  type RobotSpec, type WallLayout,
} from './roborock-shared'

/**
 * 石头自清洁扫拖机器人 P10 · 智能上下水套装版
 * 说明书：智能上下水套装使用说明书（19 页），逐页转写见 manuals-src/roborock-p10/transcript.md
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。基座原点在底面中心，正面（集尘仓盖板、底板）朝 +z，背面靠墙（-z）。
 * 机器人约定见 roborock-shared.ts（前方 +z，入座时倒车，后部充电触片朝基座）。
 *
 * 推断（说明书没有给出）：
 * - 基座 340 × 487 × 561 mm、机器人 Ø353 × 96.5 mm 取自公开参数；底板深 317 mm、塔身 300 mm、清洗盘位置按比例估计。
 * - 上下水套件在基座顶部，背面向后伸出 20 mm，四个接口（电源线插孔、进水、溢水、排水）在伸出部分底面朝下（p6 A12 放大图、p14 E12 图 2「向下拔出」）。
 * - 自来水水源与地漏在基座右后方（+x，A12 视角），插座在左后方；基座电源接口在背面中下部，AC 插口在背面左下。
 * - 墙面只画墙根线，便于从墙后看管路；P10 上盖以靠近 LDS 的前沿为铰链，后沿掀起。
 * - WiFi 指示灯颜色说明书未写，场景用蓝色；“白色”灯在线稿里用浅冷白表示。
 *
 * 外观模型：机器人、基座各照一张产品图生成（models/roborock-p10/tripo.json，图片来源 refs/sources.json）。
 * 基座模型只取塔身（背后多生成的一块和前面的斜坡裁掉，斜坡由底板补上），套件背部伸出的部分单独成件，接口挂在它底面。
 * 模型里已经有的上盖、尘盒、集尘仓盖板、尘袋、清洗盘、加注口盖标 baked；机器人顶上的两个按键在参考图里抹平了，做几何体。
 */

const R: RobotSpec = {
  name: '扫拖机器人', spec: 'A7400RR · Ø353 × 96.5 mm', r: 176.5, h: 86,
  turret: { r: 40, h: 10.5, z: 25 }, lid: 'hinged', wifiLed: true, splitBrush: false,
}

const BASE_AWAY: Vec3 = [0, 0, 300]
const DOCK: Vec3 = [0, 10, 198]
const OUT: Vec3 = [0, 0, 660]
const P = robotPoses(R, DOCK, OUT)

const WALL: WallLayout = { z: -232, riserX: 470, valveY: 410, socketX: -380, socketY: 260, drain: [480, -95] }
const WO: Vec3 = [0, 0.6, WALL.z]
const onWall = (p: Vec3) => sub(p, WO)

/** 套件接口：伸出部分底面，朝下 */
const PORT_Y = 439.8
const PORT_Z = -160
/** 套件背部伸出部分（基座坐标）：接口挂在它下面 */
const KIT_REAR: Vec3 = [0, 440, -153]
const onKit = (p: Vec3) => sub(p, KIT_REAR)
const PORT_X = { in: 75, kp: 40, of: 5, dr: -30 }
const CLIP_Y = 429.2
/** 插头在接口里的姿态：+x 朝上（插入方向）、+y 朝 +z、+z 朝 +x */
const UP: Vec3 = [90, 90, 0]

const LID_OPEN: PartState = { rot: [78, 0, 0], dur: 0.9 }
const LID_CLOSED: PartState = { rot: [0, 0, 0], dur: 0.9 }

const STATUS_LED: Vec3 = [0, 480, 146.3]
const CAP_AT: Vec3 = [0, 563.5, 90]
/** 瓶身倾斜 140°，瓶口正对加注口上方 */
const BOTTLE_AT: Vec3 = [97.7, 706.4, 90]

const MOP_L: Vec3 = [70, 3, -78]
const MOP_R: Vec3 = [-70, 3, -78]

// ---------- 零件 ----------

const baseParts: SpecPart[] = [
  {
    id: 'base', name: '自清洁集尘充电座（基座）', spec: 'EWFD09HRR · 顶部装智能上下水套件',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 340, d: 170, h: 115, r: 12, at: [0, 0, -65] },
        { type: 'slab', w: 340, d: 300, h: 325, r: 12, at: [0, 115, 0] },
        { type: 'slab', w: 336, d: 296, h: 121, r: 14, at: [0, 440, -2] },
        { type: 'hole', w: 80, h: 10, r: 3, at: [0, 92, 20.3], fill: 'shade' },
        { type: 'hole', w: 110, h: 12, r: 4, at: [0, 40, 20.3], fill: 'dark' },
        { type: 'hole', w: 12, h: 8, r: 2, at: [60, 220, -150.3], rot: [0, 180, 0], fill: 'dark' },
        { type: 'hole', w: 28, h: 28, r: 14, at: [CAP_AT[0], 561.2, CAP_AT[2]], rot: [-90, 0, 0], fill: 'dark' },
      ],
    },
    model: { src: '/models/roborock-p10/base.glb', rot: [0, -90, 0], fit: 'stretch', crop: { min: [0, 0, 0.188], max: [1, 1, 0.728] } },
  },
  /** 单独一块：外观模型只有塔身，接口要露在它底面 */
  { id: 'kit-rear', name: '套件背部伸出部分', spec: '四个接口在底面', parent: 'base', shape: { type: 'slab', w: 336, d: 34, h: 121, r: 4 }, at: KIT_REAR },
  { id: 'plate', name: '基座底板', spec: '两侧、中间下压至“咔哒”', parent: 'base', shape: { type: 'slab', w: 340, d: 317, h: 4, r: 12 }, at: [0, 0, 178.5] },
  { id: 'tray', name: '清洗盘', spec: '含清洗盘滤网、浮球', parent: 'base', shape: { type: 'slab', w: 300, d: 120, h: 6, r: 10 }, at: [0, 4, 85], fill: 'shade', baked: true },
  {
    id: 'dust-cover', name: '集尘仓盖板', parent: 'base',
    shape: { type: 'compound', items: [{ type: 'box', size: [290, 150, 10], chamfer: 3 }, { type: 'text', text: 'roborock', size: 11, at: [0, 52, 5.3] }] },
    at: [0, 330, 155.5], baked: true,
  },
  { id: 'dust-bag', name: '一次性尘袋', spec: '提手自动封口', parent: 'base', shape: { type: 'box', size: [200, 120, 70], chamfer: 6 }, at: [0, 330, 105], fill: 'warm', baked: true },
  { id: 'status-led', name: '基座状态指示灯', parent: 'base', shape: { type: 'led', r: 7.5, color: LIT.white }, at: STATUS_LED },
  { id: 'refill-cap', name: '清洁液加注口盖', spec: '容量约 1 升', parent: 'base', shape: { type: 'cylinder', r: 22, h: 5 }, at: CAP_AT, fill: 'shade', baked: true },
  { id: 'kit-btn', name: '套件按键', spec: '重置 / 停止蜂鸣', parent: 'base', shape: { type: 'box', size: [16, 3, 16], chamfer: 2 }, at: [70, 562.5, -60] },
  { id: 'kit-led', name: '套件指示灯', spec: '白 = 工作 · 红 = 异常', parent: 'base', shape: { type: 'led', r: 3.5, color: LIT.white }, at: [100, 561.3, -60], rot: [-90, 0, 0] },
  { id: 'port-in', name: '进水管接口', parent: 'kit-rear', shape: { type: 'hole', w: 9, h: 9, r: 4.5 }, at: onKit([PORT_X.in, PORT_Y, PORT_Z]), rot: [90, 0, 0], fill: 'dark' },
  { id: 'port-kp', name: '电源线插孔', parent: 'kit-rear', shape: { type: 'hole', w: 10, h: 7, r: 2 }, at: onKit([PORT_X.kp, PORT_Y, PORT_Z]), rot: [90, 0, 0], fill: 'dark' },
  { id: 'port-of', name: '溢水管接口', parent: 'kit-rear', shape: { type: 'hole', w: 12, h: 12, r: 6 }, at: onKit([PORT_X.of, PORT_Y, PORT_Z]), rot: [90, 0, 0], fill: 'dark' },
  { id: 'port-dr', name: '排水管接口', parent: 'kit-rear', shape: { type: 'hole', w: 12, h: 12, r: 6 }, at: onKit([PORT_X.dr, PORT_Y, PORT_Z]), rot: [90, 0, 0], fill: 'dark' },
  { id: 'port-ac', name: '基座电源插口', parent: 'base', shape: { type: 'hole', w: 16, h: 22, r: 3 }, at: [-110, 60, -150.6], rot: [0, 180, 0], fill: 'dark' },
]

const pipeParts: SpecPart[] = [
  { id: 'end-in', name: '进水管接头（二分管）', parent: 'base', shape: pipeEnd(6.5, 3.2) },
  { id: 'end-of', name: '溢水管接头（三分管）', parent: 'base', shape: pipeEnd(8, 4.8) },
  { id: 'end-dr', name: '排水管接头（三分管）', parent: 'base', shape: pipeEnd(8, 4.8) },
  { id: 'clip-in', name: '二分锁片', parent: 'base', shape: { type: 'compound', items: clipItems(5.5) }, at: [PORT_X.in, CLIP_Y, PORT_Z] },
  {
    id: 'clip-out', name: '三分锁片 ×2', parent: 'base',
    shape: { type: 'compound', items: [...clipItems(7, [17.5, 0, 0]), ...clipItems(7, [-17.5, 0, 0])] },
    at: [(PORT_X.of + PORT_X.dr) / 2, CLIP_Y, PORT_Z],
  },
  {
    id: 'check-valve', name: '逆止阀', spec: '装在进水管上', parent: 'wall',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 7.5, h: 40, at: [0, 0, 0] },
        { type: 'cylinder', r: 9, h: 5, at: [0, 16, 0], fill: 'shade' },
        { type: 'cylinder', r: 9, h: 5, at: [0, -16, 0], fill: 'shade' },
      ],
    },
    at: onWall([PORT_X.in, 360, PORT_Z]),
  },
  {
    id: 'elbow-in', name: '二分直角弯头', parent: 'wall',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 6, h: 16, at: [0, 14, 0] },
        { type: 'cylinder', r: 6, h: 16, axis: 'x', at: [8, 6, 0] },
      ],
    },
    at: onWall([PORT_X.in, 0, PORT_Z]),
  },
  {
    id: 'tee-out', name: '三分 T 型弯头 + L 型插栓接头', parent: 'wall',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 7, h: 44, axis: 'x', at: [0, 8, 0] },
        { type: 'cylinder', r: 7, h: 16, at: [0, 21, 0] },
        { type: 'cylinder', r: 8, h: 10, axis: 'x', at: [26, 8, 0], fill: 'shade' },
      ],
    },
    at: onWall([PORT_X.of, 0, -185]),
  },
  { id: 'wrap', name: '束线管', spec: '把进水管、排水管收在一起', parent: 'wall', shape: { type: 'cylinder', r: 10, h: 200, axis: 'x' }, at: onWall([250, 10, -192]), fill: 'shade' },
  { id: 'pipe-in1', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'end-in', ...PIPE_OUT }, to: { part: 'check-valve', at: [0, 20, 0], dir: [0, 1, 0] }, r: 3.5 } },
  { id: 'pipe-in2', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'check-valve', at: [0, -20, 0], dir: [0, -1, 0] }, to: { part: 'elbow-in', at: [0, 22, 0], dir: [0, 1, 0] }, r: 3.5 } },
  { id: 'pipe-in3', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'elbow-in', at: [16, 6, 0], dir: [1, 0, 0] }, to: { part: 'wrap', at: [-100, 0, 4], dir: [-1, 0, 0] }, r: 3.5 } },
  { id: 'pipe-in4', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'wrap', at: [100, 0, 4], dir: [1, 0, 0] }, to: { part: 'tee', ...TEE_OUTLET }, r: 3.5 } },
  { id: 'pipe-of', name: '溢水管（三分管）', shape: { type: 'cable', from: { part: 'end-of', ...PIPE_OUT }, to: { part: 'tee-out', at: [0, 29, 0], dir: [0, 1, 0] }, r: 4.5 } },
  { id: 'pipe-dr1', name: '排水管（三分管）', shape: { type: 'cable', from: { part: 'end-dr', ...PIPE_OUT }, to: { part: 'tee-out', at: [-22, 8, 0], dir: [-1, 0, 0] }, r: 4.5, slack: 0.3 } },
  { id: 'pipe-dr2', name: '排水管（三分管）', shape: { type: 'cable', from: { part: 'tee-out', at: [31, 8, 0], dir: [1, 0, 0] }, to: { part: 'wrap', at: [-100, 0, -4], dir: [-1, 0, 0] }, r: 4.5 } },
  { id: 'pipe-dr3', name: '排水管（三分管）', shape: { type: 'cable', from: { part: 'wrap', at: [100, 0, -4], dir: [1, 0, 0] }, to: { part: 'floor-drain', ...DRAIN_INLET }, r: 4.5 } },
]

const powerParts: SpecPart[] = [
  { id: 'kp-a', name: '上下水模块电源线插头', parent: 'base', shape: dcPlug() },
  { id: 'kp-cable', name: '上下水模块电源线', shape: { type: 'cable', from: { part: 'kp-a', at: [-14, 0, 0], dir: [-1, 0, 0] }, to: { part: 'base', at: [60, 220, -151], dir: [0, 0, -1] }, r: 2.2, slack: 0.5 } },
  { id: 'ac-a', name: '电源线（基座端）', parent: 'base', shape: lPlug() },
  { id: 'ac-b', name: '电源线（插头）', shape: wallPlug() },
  { id: 'ac-cable', name: '基座电源线', shape: { type: 'cable', from: { part: 'ac-a', ...L_PLUG_OUT }, to: { part: 'ac-b', ...WALL_PLUG_OUT }, r: 2.6 } },
]

/** 机器人外观模型里已经带着的零件（生成时上盖是合着的、尘盒在里面）；开关机 / 回充键要按，参考图里抹掉了，做几何体 */
const ROBOT_BAKED = new Set(['lid', 'reset-key', 'dustbin'])

const parts: SpecPart[] = [
  ...wallParts(WALL),
  ...baseParts,
  ...pipeParts,
  ...powerParts,
  ...robotParts(R).map((p): SpecPart => (p.id === 'robot'
    ? { ...p, model: { src: '/models/roborock-p10/robot.glb', rot: [0, -90, 0], fit: 'stretch', crop: { min: [0, 0.12, 0] } } }
    : ROBOT_BAKED.has(p.id) ? { ...p, baked: true } : p)),
  ...phoneParts([330, 330, 520], [-8, 10, 0]),
  { id: 'bottle', name: '官方清洁液', shape: bottleShape(), at: add(BOTTLE_AT, [0, 80, 0]), rot: [0, 0, 140], visible: false },
]

// ---------- 状态 ----------

const INSTALLED: Record<string, PartState> = {
  robot: { at: DOCK },
  'end-in': { plug: 'port-in' },
  'end-of': { plug: 'port-of' },
  'end-dr': { plug: 'port-dr' },
  'kp-a': { plug: 'port-kp' },
  'ac-a': { plug: 'port-ac' },
  'ac-b': { plug: 'socket' },
  'power-led': { light: 'blink', color: LIT.white },
  'wifi-led': { light: 'on', color: LIT.blue },
  'status-led': { light: 'off', color: LIT.white },
  'kit-led': { light: 'on', color: LIT.white },
}

const PIPES = ['check-valve', 'elbow-in', 'tee-out', 'wrap', 'pipe-in1', 'pipe-in2', 'pipe-in3', 'pipe-in4', 'pipe-of', 'pipe-dr1', 'pipe-dr2', 'pipe-dr3', 'kp-cable', 'ac-cable']

/** 拔下 / 未装时的水管接头：接口正下方，竖直推上去就插到底 */
const LOOSE_Y = 395
const loose = (x: number): PartState => ({ parent: null, at: [x, LOOSE_Y, PORT_Z], rot: UP })

const COVER_HOME: PartState = { parent: 'robot', at: [0, 4.6, BRUSH_Z], rot: [0, 0, 0], via: [200, 260, 640], dur: 1.4 }
const BRUSH_HOME: PartState = { parent: 'robot', at: [0, 12.5, BRUSH_Z], rot: [0, 0, 0], via: [200, 260, 720], dur: 1.4 }
const BIN_REST: Vec3 = [300, 22, 420]
const BIN_VIA: Vec3 = [150, 280, 470]
const FILTER_REST: Vec3 = [300, 3, 530]
const FILTER_VIA: Vec3 = [300, 110, 500]
const BIN_HOME: PartState = { parent: 'robot', at: dustbinAt(R), rot: [0, 0, 0], via: BIN_VIA, dur: 1.5 }

// ---------- 镜头 ----------

const OVERVIEW: CameraSpec = { target: [120, 300, 80], dir: [-0.5, 0.55, -1], dist: 2500 }
const FRONT_AWAY: CameraSpec = { target: [0, 220, 560], dir: [0.55, 0.45, 1], dist: 1750 }
const PLACE: CameraSpec = { target: [80, 260, 120], dir: [0.75, 0.55, 1], dist: 2000 }
const BACK: CameraSpec = { target: [60, 280, -150], dir: [-0.45, 0.45, -1], dist: 1600 }
const BACK_TOP: CameraSpec = { target: [25, 370, -165], dir: [-0.45, 0.4, -1], dist: 820 }
const BASE_FRONT: CameraSpec = { target: [0, 270, 260], dir: [0.5, 0.35, 1], dist: 1550 }
const TOP_KIT: CameraSpec = { target: [20, 580, 60], dir: [0.35, 0.9, 1], dist: 900 }
const DOCK_VIEW: CameraSpec = { target: [0, 240, 230], dir: [0.45, 0.45, 1], dist: 1450 }
const ROBOT_VIEW: CameraSpec = { target: [0, 60, 660], dir: [0.35, 0.9, 1], dist: 900 }
/** 从右侧看：打开的上盖沿 x 方向展开，不挡尘盒 */
const ROBOT_SIDE: CameraSpec = { target: [140, 40, 560], dir: [1, 0.85, 0.2], dist: 1150 }
const ROBOT_PHONE: CameraSpec = { target: [150, 160, 610], dir: [0.3, 0.55, 1], dist: 1150 }
const FLIP_VIEW: CameraSpec = { target: [0, 60, 670], dir: [0.15, 1, 0.75], dist: 1250 }
const SCENE: CameraSpec = { target: [0, 170, 400], dir: [0.6, 0.55, 1], dist: 1900 }
const BAY_LOW: CameraSpec = { target: [-60, 120, 300], dir: [0.3, 0.15, 1], dist: 1500 }

/** 从后下方看朝下的套件接口 */
const zoomUnderKit = (target: string, caption: string, dist = 200) => ({ target, dir: [-0.35, -0.5, -1] as Vec3, dist, caption })
const zoomFront = (target: string, caption: string, dist = 240) => ({ target, dir: [0.3, 0.2, 1] as Vec3, dist, caption })
/** 上盖打开后从后上方看盖下的灯和重置键 */
const zoomUnderLid = (target: string, caption: string, dist = 150) => ({ target, dir: [0.3, 1, -0.7] as Vec3, dist, caption })

// ---------- 说明书 ----------

export const roborockP10: ManualSpec = {
  id: 'roborock-p10',
  name: '石头 P10 智能上下水套装版',
  desc: '自清洁扫拖机器人：上下水安装、配网、日常维护、指示灯与故障',
  category: '扫地机器人',
  dims: { width: 340, depth: 487, height: 561 },
  source: {
    title: '智能上下水套装使用说明书 · 石头自清洁扫拖机器人 P10',
    url: 'https://files.roborock.com/uploadImages/guide/20230407/static/P10%E4%B8%8A%E4%B8%8B%E6%B0%B4%E5%A5%97%E8%A3%85%E7%89%88%E8%AF%B4%E6%98%8E%E4%B9%A6.pdf',
    images: [],
  },
  package: [
    { name: '扫拖机器人', qty: 1, spec: 'A7400RR' },
    { name: '自清洁集尘充电座（基座）', qty: 1, spec: 'EWFD09HRR，含智能上下水套件 AWCM01RR' },
    { name: '基座底板', qty: 1 },
    { name: '拖布支架 + 拖布', qty: 2, spec: '左右各一' },
    { name: '电源线', qty: 1 },
    { name: '一次性尘袋', qty: 1 },
    { name: '上下水模块电源线', qty: 1 },
    { name: '二分锁片', qty: 10 },
    { name: '三分锁片', qty: 14 },
    { name: '二分直角弯头', qty: 3 },
    { name: '三分直角弯头', qty: 2 },
    { name: '三分 T 型弯头', qty: 1 },
    { name: '三分 L 型插栓接头', qty: 1 },
    { name: '逆止阀', qty: 1 },
    { name: '清水三通阀', qty: 1 },
    { name: '二分管（进水）', qty: 1 },
    { name: '三分管（排水 / 溢水）', qty: 1 },
    { name: '自来水滤网', qty: 1 },
    { name: '束线管 + 束线管安装器', qty: 1 },
  ],
  params: [
    { label: '机器人型号', value: 'A7400RR' },
    { label: '机器人额定电压 / 功率', value: '14.4 V ⎓ / 60 W' },
    { label: '充电时间', value: '< 4 小时' },
    { label: '基座型号', value: 'EWFD09HRR' },
    { label: '基座额定输入', value: '220–240 V ~ 50–60 Hz', note: '充电状态输入电流 0.65 A' },
    { label: '集尘功率', value: '1000 W' },
    { label: '基座额定输出', value: '20 V ⎓ 1.5 A / 20 V ⎓ 1.0 A' },
    { label: '上下水套件', value: 'AWCM01RR · 20 V ⎓ 14 W' },
    { label: '最大进水压力', value: '0.4 MPa' },
    { label: '清洁液加注量', value: '约 1 升' },
    { label: '网络', value: '仅 2.4 GHz WiFi' },
    { label: '基座外形', value: '约 340 × 487 × 561 mm', note: '公开参数，说明书未标注' },
  ],
  parts,
  initial: INSTALLED,
  stageSize: 1500,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 上下水安装 =================
    {
      id: 'install', title: '上下水安装', kind: 'assembly',
      start: {
        base: { at: BASE_AWAY },
        plate: { parent: null, at: [0, 0, 760], rot: [0, 0, 0] },
        robot: { visible: false },
        'status-led': { light: 'off' },
        'kit-led': { light: 'off' },
        'end-in': { ...loose(PORT_X.in), visible: false },
        'end-of': { ...loose(PORT_X.of), visible: false },
        'end-dr': { ...loose(PORT_X.dr), visible: false },
        'kp-a': { ...loose(PORT_X.kp), visible: false },
        'ac-a': { parent: null, at: [-110, 60, -215], rot: [0, -90, 0], visible: false },
        'ac-b': { parent: null, at: [-380, 200, -100], rot: [0, 90, 0], visible: false },
        'clip-in': { at: [PORT_X.in, CLIP_Y, PORT_Z - 40], visible: false },
        'clip-out': { at: [(PORT_X.of + PORT_X.dr) / 2, CLIP_Y, PORT_Z - 40], visible: false },
        ...hide(...PIPES),
      },
      steps: [
        {
          id: 'i-overview', title: '先看安装示意：水源、地漏、电源', page: 6,
          desc: '智能上下水套件装在基座顶部。进水管（二分管）从墙上的自来水水源经自来水滤网、清水三通阀接到套件进水口，途中装逆止阀；排水管和溢水管（三分管）汇入三分 T 型弯头，经 L 型插栓接头通到地漏或下水管，束线管把管子收在一起。',
          tip: '需由专业安装人员勘测后安装，请勿自行安装。拆装管路必须在基座及套件未通电时进行。',
          camera: OVERVIEW,
          highlight: ['tee', 'floor-drain'],
          callouts: [
            { part: 'tee', text: '清水三通阀', sub: '上接自来水滤网', offset: [0, 90, 0] },
            { part: 'floor-drain', text: '地漏 / 下水管', offset: [0, 70, 0] },
            { part: 'socket', text: '电源插座', offset: [0, 70, 0] },
            { part: 'base', text: '智能上下水套件', at: [0, 561, -60], offset: [0, 90, 0] },
          ],
        },
        {
          id: 'i-plate', title: '装底板：先压两侧，再压中间', page: 7,
          desc: '把基座底板推到基座前方对齐，用力下压两侧，再下压中间连接处，听到“咔哒”声即装好。',
          tip: '搬动基座时请固定好套件；请勿直接抬起基座底板搬运基座。',
          camera: FRONT_AWAY,
          set: { plate: { parent: 'base', at: [0, 0, 178.5], rot: [0, 0, 0], dur: 1.5 } },
          actions: [{ type: 'press', part: 'plate', depth: 2, delay: 1.6 }],
          highlight: ['plate'],
          callouts: [{ part: 'plate', text: '两侧 → 中间下压', sub: '听到“咔哒”', at: [0, 4, 120], offset: [0, 90, 0] }],
        },
        {
          id: 'i-place', title: '靠墙放到硬质水平地面上', page: 7,
          desc: '把基座背面靠墙放在硬质水平地面上，周围预留足够空间，并确保 WiFi 信号覆盖良好。',
          tip: '基座出厂前做过通水检测，内部残留少量水属于正常现象。',
          camera: PLACE,
          set: { base: { at: [0, 0, 0], dur: 1.8 } },
          highlight: ['base'],
          chips: [{ label: '高', sub: '约 0.8 m' }, { label: '长', sub: '约 0.46 m' }, { label: '宽', sub: '约 1.2 m' }],
        },
        {
          id: 'i-ports', title: '认识套件背面的接口', page: 5,
          desc: '套件背面向后伸出的部分底下有四个朝下的接口，从右到左依次是进水管接口、电源线插孔、溢水管接口、排水管接口。',
          camera: BACK_TOP,
          highlight: ['port-in', 'port-kp', 'port-of', 'port-dr'],
          zoom: { ...zoomUnderKit('port-of', '套件底部：进水 · 电源 · 溢水 · 排水', 260), offset: [17, 0, 0] },
          callouts: [
            { part: 'port-in', text: '进水', offset: [30, -70, 0] },
            { part: 'port-kp', text: '电源', offset: [0, -125, 0] },
            { part: 'port-of', text: '溢水', offset: [0, -70, 0] },
            { part: 'port-dr', text: '排水', offset: [-30, -125, 0] },
          ],
        },
        {
          id: 'i-inlet', title: '接进水管：三通阀 → 逆止阀 → 进水口', page: 6,
          desc: '二分管从清水三通阀下方出水口引出，穿过束线管，经二分直角弯头沿基座背面向上，途中装好逆止阀，最后从下往上插到底进套件的进水管接口。',
          camera: BACK,
          set: {
            ...show('check-valve', 'elbow-in', 'wrap', 'pipe-in1', 'pipe-in2', 'pipe-in3', 'pipe-in4'),
            'end-in': { visible: true, plug: { hole: 'port-in', back: 0 }, dur: 1.3 },
          },
          highlight: ['end-in', 'check-valve', 'elbow-in', 'pipe-in1', 'pipe-in2', 'pipe-in3', 'pipe-in4'],
          callouts: [
            { part: 'check-valve', text: '逆止阀', offset: [-70, 30, 0] },
            { part: 'elbow-in', text: '二分直角弯头', offset: [-90, 60, 0] },
            { part: 'wrap', text: '束线管', offset: [0, 60, 0] },
          ],
        },
        {
          id: 'i-clip-in', title: '插上二分锁片', page: 6,
          desc: '在进水管接头的快插卡环下方，从后往前推入二分锁片，防止水管被拉脱。',
          camera: BACK_TOP,
          set: { 'clip-in': { visible: true, at: [PORT_X.in, CLIP_Y, PORT_Z], dur: 0.9 } },
          highlight: ['clip-in'],
          zoom: zoomUnderKit('clip-in', '二分锁片卡住进水管接头', 120),
        },
        {
          id: 'i-drain', title: '接排水管和溢水管 → 地漏', page: 6,
          desc: '两根三分管分别插到底进溢水管接口和排水管接口，向下汇入三分 T 型弯头，经 L 型插栓接头、束线管通到地漏或下水管。',
          camera: BACK,
          set: {
            ...show('tee-out', 'pipe-of', 'pipe-dr1', 'pipe-dr2', 'pipe-dr3'),
            'end-of': { visible: true, plug: { hole: 'port-of', back: 0 }, dur: 1.3 },
            'end-dr': { visible: true, plug: { hole: 'port-dr', back: 0 }, dur: 1.3, delay: 0.3 },
          },
          highlight: ['end-of', 'end-dr', 'tee-out', 'pipe-of', 'pipe-dr1', 'pipe-dr2', 'pipe-dr3'],
          callouts: [
            { part: 'tee-out', text: '三分 T 型弯头', offset: [-90, 50, 0] },
            { part: 'floor-drain', text: '地漏', offset: [0, 60, 0] },
          ],
        },
        {
          id: 'i-clip-out', title: '插上两片三分锁片', page: 6,
          desc: '在溢水管和排水管接头下方各推入一片三分锁片，确认三根水管都已插到底、锁牢。',
          camera: BACK_TOP,
          set: { 'clip-out': { visible: true, at: [(PORT_X.of + PORT_X.dr) / 2, CLIP_Y, PORT_Z], dur: 0.9 } },
          highlight: ['clip-out'],
          zoom: zoomUnderKit('clip-out', '三分锁片卡住溢水、排水管接头', 150),
        },
        {
          id: 'i-kit-power', title: '用套件电源线连接套件与基座', page: 7,
          desc: '上下水模块电源线一头插进套件底部的电源线插孔，另一头接到基座背面的电源接口。',
          camera: BACK,
          set: {
            'kp-a': { visible: true, plug: { hole: 'port-kp', back: 0 }, dur: 1.2 },
            'kp-cable': { visible: true },
          },
          highlight: ['kp-a', 'kp-cable'],
          zoom: zoomUnderKit('kp-a', '电源线插孔：插紧', 120),
          callouts: [{ part: 'base', text: '电源接口', at: [60, 220, -151], offset: [-110, 20, 0] }],
        },
        {
          id: 'i-power', title: '插紧基座电源线，指示灯亮起', page: 7,
          desc: '把基座电源线一头用力插紧在基座背面，另一头插到墙上插座。基座状态指示灯和套件指示灯亮起（白色）即通电正常，多余线材收进电源线收纳槽。',
          tip: '电源线垂地可能被拖拽，请收好；状态指示灯通电时长亮，机器人充电时熄灭。',
          camera: BACK,
          set: {
            'ac-a': { visible: true, plug: { hole: 'port-ac', back: 40 }, dur: 1.2 },
            'ac-b': { visible: true, plug: { hole: 'socket', back: 40 }, dur: 1.2, delay: 1.0 },
            'ac-cable': { visible: true },
            'status-led': { light: 'on', color: LIT.white, delay: 2.3 },
            'kit-led': { light: 'on', color: LIT.white, delay: 2.3 },
          },
          highlight: ['ac-a', 'ac-b', 'ac-cable', 'kit-led'],
          zoom: zoomFront('status-led', '基座状态指示灯：白色长亮'),
        },
      ],
    },

    // ================= 首次使用与配网 =================
    {
      id: 'first-use', title: '首次使用与配网', kind: 'usage',
      start: {
        robot: { at: OUT },
        'mop-l': { parent: null, at: [-330, 3, 600], rot: [0, 0, 0] },
        'mop-r': { parent: null, at: [330, 3, 600], rot: [0, 0, 0] },
        'power-led': { light: 'off' },
        'wifi-led': { light: 'off' },
        'status-led': { light: 'on', color: LIT.white },
      },
      steps: [
        {
          id: 'u-mop', title: '翻过机器人，装上两块拖布', page: 7,
          desc: '把机器人翻过来，拖布支架的安装轴对准机器人底部的安装位按下，听到“咔哒”声即装好，左右各装一块。',
          tip: '请确保拖布贴合到位。',
          camera: FLIP_VIEW,
          set: {
            robot: P.flip,
            'mop-l': { parent: 'robot', at: MOP_L, rot: [0, 0, 0], via: [-210, 260, 600], delay: 1.9, dur: 1.4 },
            'mop-r': { parent: 'robot', at: MOP_R, rot: [0, 0, 0], via: [210, 260, 600], delay: 2.1, dur: 1.4 },
          },
          highlight: ['mop-l', 'mop-r'],
        },
        {
          id: 'u-power', title: '翻回机器人，长按 ⏻ 开机', page: 8,
          desc: '把机器人翻回正面，长按 ⏻ 键开机，电源指示灯亮起。白色表示电量 ≥ 20%，红色表示电量 < 20%。',
          tip: '电量太低无法开机时，直接把机器人靠上基座充电。',
          camera: ROBOT_VIEW,
          set: { robot: P.unflip, 'power-led': { light: 'on', color: LIT.white, delay: 2.2 } },
          actions: [{ type: 'press', part: 'btn-power', delay: 1.9 }],
          highlight: ['btn-power', 'power-led'],
          zoom: zoomTop('power-led', '电源指示灯亮起（白色）'),
          chips: [{ label: '长按 ⏻', sub: '开机 / 关机' }, { label: '白色', sub: '电量 ≥ 20%' }, { label: '红色', sub: '电量 < 20%' }],
        },
        {
          id: 'u-app', title: '下载 Roborock App', page: 8,
          desc: '在应用商店搜索“Roborock”下载 Roborock App；也可以搜索“米家”，用米家 App 添加。',
          camera: PHONE_VIEW,
          set: { phone: { visible: true }, 'phone-screen': { ui: APP.store('米家') } },
          highlight: ['phone-screen'],
        },
        {
          id: 'u-wifi', title: '打开上盖，同时按住 ⏻ 与 ⌂', page: 8,
          desc: '打开机器人上盖，露出 WiFi 指示灯。同时按住 ⏻ 与 ⌂ 键，直到听到语音“重置 WiFi，进入配网模式”，WiFi 指示灯慢闪。',
          camera: ROBOT_VIEW,
          set: {
            phone: { visible: false },
            lid: LID_OPEN,
            'wifi-led': { light: 'blink', color: LIT.blue, delay: 1.5 },
          },
          actions: [{ type: 'press', part: 'btn-power', delay: 1.0 }, { type: 'press', part: 'btn-home', delay: 1.0 }],
          highlight: ['lid', 'btn-power', 'btn-home', 'wifi-led'],
          zoom: zoomUnderLid('wifi-led', 'WiFi 指示灯慢闪 = 等待连接'),
          chips: [{ label: 'WiFi 灯熄灭', sub: '未激活' }, { label: '慢闪', sub: '等待连接' }, { label: '快闪', sub: '正在连接' }],
        },
        {
          id: 'u-add', title: 'App 首页点「+」添加设备', page: 8,
          desc: '打开 App 首页点右上角“+”，选择扫拖机器人，按提示连接家里的 2.4GHz WiFi。连接过程中 WiFi 指示灯快闪。',
          tip: '仅支持 2.4GHz WiFi；等待连接超过 30 分钟，机器人会自动关闭 WiFi，需要重新重置。',
          camera: ROBOT_PHONE,
          set: { phone: { visible: true }, 'phone-screen': { ui: APP.pick('Roborock P10') } },
          highlight: ['phone-screen', 'wifi-led'],
          zoom: zoomUnderLid('wifi-led', 'WiFi 指示灯快闪 = 正在连接'),
        },
        {
          id: 'u-done', title: '连接成功：WiFi 灯长亮', page: 4,
          desc: 'App 提示添加成功，机器人 WiFi 指示灯变为长亮，表示已连接。',
          camera: ROBOT_PHONE,
          set: { 'phone-screen': { ui: APP.done('Roborock P10') }, 'wifi-led': { light: 'on', color: LIT.blue, delay: 0.4 } },
          highlight: ['phone-screen', 'wifi-led'],
          zoom: zoomUnderLid('wifi-led', 'WiFi 指示灯长亮 = 已连接'),
        },
        {
          id: 'u-dock', title: '合上上盖，靠上基座充电', page: 8,
          desc: '合上上盖，把机器人倒着靠上基座。基座指示灯熄灭、电源指示灯呼吸闪烁，表示正在充电。',
          camera: DOCK_VIEW,
          set: {
            phone: { visible: false },
            lid: LID_CLOSED,
            robot: { ...P.dock, delay: 1.0 },
            'power-led': { light: 'blink', color: LIT.white, delay: 3.2 },
            'status-led': { light: 'off', delay: 3.2 },
          },
          highlight: ['robot', 'power-led', 'status-led'],
          zoom: zoomTop('power-led', '电源指示灯呼吸闪烁 = 充电中'),
          chips: [{ label: '基座指示灯', sub: '熄灭' }, { label: '电源指示灯', sub: '呼吸闪烁 = 充电中' }],
        },
        {
          id: 'u-refill', title: '旋开加注口盖，倒入清洁液', page: 9,
          desc: '旋开基座顶部的清洁液加注口盖，倒入官方清洁液，容量约 1 升，不要超量。之后套件会自动进水、排水并添加清洁液。',
          tip: '请勿使用非官方清洁液，以免损坏基座。',
          camera: TOP_KIT,
          set: {
            'refill-cap': { at: [-80, 563.5, 60], lift: 30, dur: 1.0 },
            bottle: { visible: true, at: BOTTLE_AT, delay: 1.0, dur: 1.0 },
          },
          highlight: ['refill-cap', 'bottle'],
        },
        {
          id: 'u-start', title: '盖好加注口，短按 ⏻ 开始扫拖', page: 9,
          desc: '盖好加注口盖。短按 ⏻ 键，机器人离开基座开始清扫，先沿墙边、再按 Z 字形清扫整个区域。清扫中按任意键暂停。',
          camera: SCENE,
          set: {
            bottle: { visible: false },
            'refill-cap': { at: CAP_AT, lift: 30, dur: 1.0 },
            robot: { ...P.leave, delay: 1.4 },
            'power-led': { light: 'on', color: LIT.white, delay: 1.4 },
            'status-led': { light: 'on', color: LIT.white, delay: 1.4 },
          },
          actions: [{ type: 'press', part: 'btn-power', delay: 0.9 }, { type: 'glide', part: 'robot', delay: 3.8 }],
          highlight: ['btn-power', 'robot', 'power-led', 'status-led'],
          zoom: zoomTop('power-led', '清扫中：电源指示灯白色长亮', 130),
          chips: [{ label: '短按 ⏻', sub: '开始扫拖' }, { label: '长按 ⌂', sub: '局部清扫 1.5 m × 1.5 m' }, { label: '勿扰', sub: '22:00–08:00' }],
        },
        {
          id: 'u-return', title: '自动回座：洗拖布、集尘、烘干', page: 10,
          desc: '清扫完成后机器人自动返回基座，清洗拖布、按需集尘、烘干拖布并充电。集尘和清洗拖布时基座状态指示灯呼吸闪烁。',
          camera: DOCK_VIEW,
          set: {
            robot: P.dock,
            'status-led': { light: 'blink', color: LIT.white, delay: 2.2 },
            'power-led': { light: 'blink', color: LIT.white, delay: 2.2 },
          },
          highlight: ['robot', 'status-led', 'power-led'],
          zoom: zoomFront('status-led', '状态指示灯呼吸闪烁 = 集尘 / 清洁拖布中'),
          chips: [{ label: '自动洗拖布' }, { label: '按需集尘', sub: '充电时短按 ⌂ 手动集尘' }, { label: '按需烘干' }],
        },
      ],
    },

    // ================= 日常维护 =================
    {
      id: 'maintain', title: '日常维护', kind: 'usage',
      start: {
        robot: { at: OUT },
        'power-led': { light: 'on', color: LIT.white },
        'status-led': { light: 'on', color: LIT.white },
      },
      steps: [
        {
          id: 'm-bin', title: '打开上盖，取出尘盒', page: 12,
          desc: '掀开机器人上盖，按住尘盒卡扣把尘盒提出来。',
          camera: ROBOT_SIDE,
          set: {
            lid: LID_OPEN,
            dustbin: { parent: null, at: BIN_REST, rot: [0, 0, 0], via: BIN_VIA, delay: 0.9, dur: 1.5 },
          },
          highlight: ['lid', 'dustbin'],
        },
        {
          id: 'm-filter', title: '取下滤网，清水摇晃冲洗', page: 12,
          desc: '打开滤网倒掉垃圾。往尘盒注入清水，盖上滤网左右摇晃后倒出脏水；再按图取下滤网，反复冲洗并轻敲。',
          tip: '只用清水，勿加洗涤剂；勿用手或刷子触碰滤网表面；滤网晾晒至少 24 小时再装回。',
          camera: ROBOT_SIDE,
          set: { filter: { parent: null, at: FILTER_REST, rot: [90, 0, 0], via: FILTER_VIA, dur: 1.2 } },
          actions: [{ type: 'shake', part: 'dustbin', axis: 'x', amp: 4, delay: 1.4 }],
          highlight: ['filter', 'dustbin'],
          chips: [{ label: '可水洗滤网', sub: '每 2 周清理 · 6–12 个月更换' }],
        },
        {
          id: 'm-bin-back', title: '装回滤网和尘盒', page: 12,
          desc: '滤网完全晾干后装回尘盒，再把尘盒放回机器人。',
          camera: ROBOT_SIDE,
          set: {
            filter: { parent: 'dustbin', at: [0, 0, 44], rot: [0, 0, 0], via: FILTER_VIA, dur: 1.2 },
            dustbin: { ...BIN_HOME, delay: 1.3 },
          },
          highlight: ['dustbin'],
        },
        {
          id: 'm-flip', title: '合上上盖翻过机器人，取下主刷罩', page: 11,
          desc: '合上上盖，把机器人翻过来，压下主刷罩卡扣，取下主刷罩。',
          camera: FLIP_VIEW,
          set: {
            lid: LID_CLOSED,
            robot: { ...P.flip, delay: 1.0 },
            'brush-cover': { parent: null, at: [340, 1.6, 600], rot: [0, 0, 0], via: [200, 260, 640], delay: 2.9, dur: 1.4 },
          },
          highlight: ['brush-cover'],
          chips: [{ label: '软胶主刷', sub: '每 2 周清理 · 6–12 个月更换' }],
        },
        {
          id: 'm-brush', title: '取出主刷，清除两端毛发', page: 11,
          desc: '取出软胶主刷，拔出轴承、旋下主刷盖，清除两端缠绕的毛发。',
          camera: FLIP_VIEW,
          set: { brush: { parent: null, at: [340, 12.2, 740], rot: [0, 0, 0], via: [200, 260, 720], dur: 1.4 } },
          highlight: ['brush'],
          callouts: [{ part: 'brush', text: '清除两端毛发', sub: '拔出轴承 · 旋下主刷盖', offset: [-120, 80, 0] }],
        },
        {
          id: 'm-brush-back', title: '装回主刷，主刷罩 4 齿入槽压紧', page: 11,
          desc: '把主刷装回，再把主刷罩的 4 个齿插入卡槽，压紧卡扣。',
          tip: '主刷可用湿布擦拭，晾干后再装回；请勿使用腐蚀性清洁液。',
          camera: FLIP_VIEW,
          set: { brush: BRUSH_HOME, 'brush-cover': { ...COVER_HOME, delay: 1.5 } },
          highlight: ['brush', 'brush-cover'],
        },
        {
          id: 'm-side', title: '拆下边刷清理，装回锁紧', page: 12,
          desc: '拧下边刷螺丝取下边刷，清理缠绕的毛发后装回并锁紧螺丝。万向轮可用小螺丝刀撬出轮轴冲洗；主轮用软干布擦拭。',
          camera: FLIP_VIEW,
          set: { 'side-brush': { via: [210, 240, 800], dur: 1.6 } },
          highlight: ['side-brush'],
          callouts: [
            { part: 'robot', text: '万向轮', at: [0, 6, 135], offset: [-60, 60, 0] },
            { part: 'robot', text: '主轮', at: [130, 6, 0], offset: [-50, 60, 0] },
          ],
          chips: [{ label: '边刷', sub: '每月清理 · 3–6 个月更换' }, { label: '万向轮', sub: '支架不可取出' }],
        },
        {
          id: 'm-mop-off', title: '取下拖布清洗晾晒', page: 13,
          desc: '把拖布从拖布支架上取下，清洗后晾晒。',
          camera: FLIP_VIEW,
          set: {
            'mop-l': { parent: null, at: [-330, 3, 600], rot: [0, 0, 0], via: [-210, 260, 600], dur: 1.4 },
            'mop-r': { parent: null, at: [330, 3, 600], rot: [0, 0, 0], via: [210, 260, 600], delay: 0.3, dur: 1.4 },
          },
          highlight: ['mop-l', 'mop-r'],
          chips: [{ label: '拖布', sub: '按需清洗 · 1–3 个月更换' }],
        },
        {
          id: 'm-mop-on', title: '贴好拖布，装回机器人', page: 13,
          desc: '拖布晾干后对准拖布支架的粘贴区域贴牢，再把拖布支架装回机器人。',
          camera: FLIP_VIEW,
          set: {
            'mop-l': { parent: 'robot', at: MOP_L, rot: [0, 0, 0], via: [-210, 260, 600], dur: 1.4 },
            'mop-r': { parent: 'robot', at: MOP_R, rot: [0, 0, 0], via: [210, 260, 600], delay: 0.3, dur: 1.4 },
          },
          highlight: ['mop-l', 'mop-r'],
        },
        {
          id: 'm-bag-out', title: '取下集尘仓盖板，取出尘袋', page: 13,
          desc: '取下基座正面的集尘仓盖板，捏住尘袋提手沿箭头方向取出，提手会自动封口，直接丢弃。',
          camera: BASE_FRONT,
          set: {
            'dust-cover': { parent: null, at: [-340, 5, 330], rot: [-90, 0, 0], via: [-200, 420, 380], dur: 1.4 },
            'dust-bag': { at: [0, 330, 300], delay: 1.4, dur: 1.0 },
          },
          highlight: ['dust-cover', 'dust-bag'],
          chips: [{ label: '尘袋', sub: '按需更换 · 1–2 个月' }],
        },
        {
          id: 'm-bag-in', title: '装入新尘袋，装回盖板', page: 13,
          desc: '用干抹布清理尘袋卡槽附近的滤网，插入新尘袋并铺平，再装回集尘仓盖板。',
          camera: BASE_FRONT,
          set: {
            'dust-bag': { at: [0, 330, 105], dur: 1.0 },
            'dust-cover': { parent: 'base', at: [0, 330, 155.5], rot: [0, 0, 0], via: [-200, 420, 380], delay: 1.1, dur: 1.4 },
          },
          highlight: ['dust-bag', 'dust-cover'],
        },
        {
          id: 'm-tray', title: '取出清洗盘冲洗后装回', page: 14,
          desc: '从基座底部抽出清洗盘，用水冲洗清洗盘及清洗盘滤网，再装回基座。',
          camera: BASE_FRONT,
          set: { tray: { via: [0, 140, 420], dur: 2.4 } },
          highlight: ['tray'],
          chips: [{ label: '清洗盘', sub: '按需清洗' }],
        },
      ],
    },

    // ================= 指示灯与故障 =================
    {
      id: 'repair', title: '指示灯与故障', kind: 'repair',
      start: {
        robot: { at: OUT },
        'power-led': { light: 'on', color: LIT.white },
        'status-led': { light: 'on', color: LIT.white },
      },
      steps: [
        {
          id: 'r-robot-red', title: '电源指示灯红色快闪：机器人异常', page: 15,
          desc: '机器人出现异常时电源指示灯红色快闪，并伴随语音提示，按语音及 App 里的提示处理。异常状态下 10 分钟无操作，机器人会自动休眠。',
          camera: ROBOT_VIEW,
          set: { 'power-led': { light: 'blink', color: LIT.red } },
          highlight: ['power-led'],
          zoom: zoomTop('power-led', '红色快闪 = 机器人异常'),
        },
        {
          id: 'r-base-red', title: '基座指示灯红色长亮', page: 16,
          desc: '基座状态指示灯红色长亮表示基座异常，常见原因：电压异常、上下水套件未安装到位、清洗盘未安装到位。',
          tip: '请勿在未安装上下水套件、集尘仓盖板、尘袋或清洗盘时使用基座。',
          camera: BASE_FRONT,
          set: { 'power-led': { light: 'off' }, 'status-led': { light: 'on', color: LIT.red } },
          highlight: ['status-led'],
          zoom: zoomFront('status-led', '红色长亮 = 基座异常'),
          callouts: [
            { part: 'base', text: '套件装到位？', at: [-150, 520, 146], offset: [-90, 60, 0] },
            { part: 'tray', text: '清洗盘装到位？', at: [-140, 6, 60], offset: [-90, 40, 0] },
          ],
        },
        {
          id: 'r-kit-red', title: '套件红灯闪烁并“滴-滴-滴”', page: 16,
          desc: '上下水套件指示灯红色闪烁并“滴-滴-滴”报警时，检查是否停水、清水三通阀是否被关闭、进水管是否漏水。',
          camera: BACK,
          set: { 'kit-led': { light: 'blink', color: LIT.red }, 'tee-knob': KNOB_CLOSED },
          highlight: ['kit-led', 'tee-knob'],
          zoom: { target: 'kit-led', dir: [-0.3, 1, -0.5], dist: 160, caption: '套件指示灯红色闪烁 = 异常' },
          callouts: [{ part: 'tee-knob', text: '三通阀关了？', offset: [0, 80, 0] }],
        },
        {
          id: 'r-kit-reset', title: '打开三通阀，按套件按键恢复', page: 16,
          desc: '问题排除后（三通阀手柄转回竖直 = 打开），按一下套件顶部的按键，报警停止，套件指示灯恢复白色。',
          camera: BACK,
          set: { 'tee-knob': KNOB_OPEN, 'kit-led': { light: 'on', color: LIT.white, delay: 1.1 } },
          actions: [{ type: 'press', part: 'kit-btn', delay: 0.8 }],
          highlight: ['tee-knob', 'kit-btn', 'kit-led'],
          zoom: { target: 'kit-btn', dir: [-0.3, 1, -0.5], dist: 170, caption: '按键：重置 / 停止蜂鸣' },
        },
        {
          id: 'r-charge', title: '无法充电：检查电源线和充电触片', page: 16,
          desc: '检查电源线两头（墙上插座和基座背面）是否插紧；用软干布擦拭机器人的充电触片和基座的充电弹片；再看基座指示灯是否正常。',
          camera: BAY_LOW,
          set: { robot: { rot: [0, 180, 0], dur: 1.2 }, 'status-led': { light: 'on', color: LIT.white, delay: 1.2 } },
          actions: [{ type: 'shake', part: 'ac-b', axis: 'x', amp: 2, delay: 1.2 }],
          highlight: ['ac-b', 'status-led'],
          zoom: { target: 'robot', offset: [0, 30, R.r], dir: [0.25, 0.3, 1], dist: 260, caption: '机器人后部的充电触片' },
          callouts: [
            { part: 'base', text: '充电弹片', at: [0, 92, 20], offset: [-80, 70, 0] },
            { part: 'robot', text: '充电触片', at: [0, 30, -R.r], offset: [80, 80, 0] },
          ],
        },
        {
          id: 'r-reset', title: '按键无响应：按一下系统重置键', page: 10,
          desc: '按键无响应或无法关机时，打开上盖，按一下系统重置键，机器人会自动重启。',
          tip: '恢复初始设置：开机状态下长按 ⌂ 键，同时按一下系统重置键，听到语音“开始恢复初始设置，大约需要 5 分钟”。',
          camera: ROBOT_VIEW,
          set: {
            robot: { rot: [0, 0, 0], dur: 1.2 },
            lid: { ...LID_OPEN, delay: 1.2 },
            'power-led': { light: 'blink', color: LIT.white, delay: 2.6 },
          },
          highlight: ['reset-key', 'power-led'],
          zoom: zoomUnderLid('reset-key', '系统重置键', 120),
        },
        {
          id: 'r-cut', title: '拆管前：切断电源和水源', page: 14,
          desc: '如需拆卸或搬运基座，先合上机器人上盖、拔掉基座电源插头，再把清水三通阀手柄转到水平位置关闭水源。',
          tip: '拆装管路必须在基座及套件未通电时进行。',
          camera: BACK,
          set: {
            lid: LID_CLOSED,
            'ac-b': { parent: null, at: [-380, 200, -120], rot: [0, 90, 0], dur: 1.2 },
            'tee-knob': { ...KNOB_CLOSED, delay: 0.8 },
            'status-led': { light: 'off', delay: 0.8 },
            'kit-led': { light: 'off', delay: 0.8 },
          },
          highlight: ['ac-b', 'tee-knob'],
        },
        {
          id: 'r-pull', title: '抽出锁片，向下拔出三根水管', page: 14,
          desc: '先向外（向后）抽出接头处的锁片，再向上按住接头卡环，向下依次拔出三根水管。',
          tip: '拔水管前先用容器接住管内流出的水，以免弄湿地面；请勿用蛮力直接拔水管。',
          camera: BACK_TOP,
          set: {
            'clip-in': { at: [PORT_X.in, CLIP_Y, PORT_Z - 40], dur: 0.8 },
            'clip-out': { at: [(PORT_X.of + PORT_X.dr) / 2, CLIP_Y, PORT_Z - 40], dur: 0.8 },
            'end-in': { ...loose(PORT_X.in), delay: 1.0, dur: 1.0 },
            'end-of': { ...loose(PORT_X.of), delay: 1.3, dur: 1.0 },
            'end-dr': { ...loose(PORT_X.dr), delay: 1.6, dur: 1.0 },
          },
          highlight: ['clip-in', 'clip-out', 'end-in', 'end-of', 'end-dr'],
          zoom: zoomUnderKit('end-of', '按住卡环，向下拔出', 200),
        },
      ],
    },
  ],
}
