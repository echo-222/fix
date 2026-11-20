import type { CameraSpec, ManualSpec, PartState, ScreenUI, SpecPart, Vec3 } from '../types'
import {
  APP, BRUSH_Z, DRAIN_INLET, KNOB_CLOSED, LIT, L_PLUG_OUT, PHONE_VIEW, TEE_OUTLET, WALL_PLUG_OUT,
  clipItems, dustbinAt, hide, lPlug, phoneParts, robotParts, robotPoses, show, wallParts, wallPlug, zoomTop,
  type RobotSpec, type WallLayout,
} from './roborock-shared'

/**
 * 石头自清洁扫拖机器人 P20 Pro · 智能上下水版
 * 说明书：使用说明书（20 页，PDF 文字层是乱码字体，按页图转写），见 manuals-src/roborock-p20-pro/transcript.md
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。基站原点在底面中心，正面（集尘仓盖板、入座口）朝 +z，背面靠墙（-z）。
 * 机器人约定见 roborock-shared.ts（前方 +z，倒车入座，入座后前端露出基站约 50 mm，按键在外面）。
 *
 * 推断（说明书没有给出）：
 * - 基站 450 × 450 × 450 mm、机器人 352 × 347 × 103 mm 取自公开参数；拱形外壳用一块竖放的圆角板（圆角 140 mm）近似。
 * - 入座口深约 300 mm；清洗盘组件、运输固定模块的尺寸按比例估计。
 * - 进水 / 排水接口在背面下部、从正面看偏左（-x），二分 / 三分直角弯头把水管转向 +x，经背面中间的压管支架通到右后方的水源和地漏（A11 背视图）。
 * - 基站电源接口在背面右侧（+x）中部，插座在右后方墙上；墙面只画墙根线。
 * - 状态指示灯实为长条灯，场景用一颗圆灯表示；“白色”灯在线稿里用浅冷白表示。
 */

const R: RobotSpec = {
  name: '扫拖机器人', spec: 'A1340RR · 352 × 347 × 103 mm', r: 176, h: 90,
  turret: { r: 42, h: 13, z: 0 }, lid: 'magnetic', wifiLed: false, splitBrush: true,
}

const BASE_AWAY: Vec3 = [0, 0, 320]
const DOCK: Vec3 = [0, 14, 102]
const OUT: Vec3 = [0, 0, 640]
const P = robotPoses(R, DOCK, OUT)

const WALL: WallLayout = { z: -290, riserX: 380, valveY: 360, socketX: 250, socketY: 230, drain: [390, -200] }

/** 背面下部的水管接口（朝 -z） */
const BACK_Z = -225.3
const PORT_IN: Vec3 = [-140, 58, BACK_Z]
const PORT_DR: Vec3 = [-170, 30, BACK_Z]
const PORT_AC: Vec3 = [150, 120, BACK_Z]
/** 锁片卡在接口与弯头之间 */
const CLIP_Z = -227
/** 插头 / 弯头插在背面接口里的姿态：+x 朝 +z、+z 朝 -x */
const INTO_BACK: Vec3 = [0, -90, 0]

const STATUS_LED: Vec3 = [0, 400, 225.3]
const COVER_AT: Vec3 = [0, 300, 231]
const LIQUID_AT: Vec3 = [-110, 300, 150]
const BAG_AT: Vec3 = [80, 300, 170]
const TRAY_AT: Vec3 = [0, 6, 10]
const LID_AT: Vec3 = [0, R.h, -30]

const MOP_L: Vec3 = [70, 3, -78]
const MOP_R: Vec3 = [-70, 3, -78]

// ---------- 零件 ----------

/** 直角弯头：原点在接口端面，+x 插入；弯头出口朝局部 -z（插好后朝 +x），端面外留出 5 mm 细颈卡锁片 */
const bendX = (r: number) => -(r + 5)
const elbow = (r: number): SpecPart['shape'] => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: r - 3, h: 4 - bendX(r), axis: 'x', at: [(4 + bendX(r)) / 2, 0, 0], fill: 'shade' },
    { type: 'cylinder', r, h: r * 2, axis: 'x', at: [bendX(r), 0, 0] },
    { type: 'cylinder', r, h: 18, axis: 'z', at: [bendX(r), 0, -9] },
  ],
})
const elbowOut = (r: number) => ({ at: [bendX(r), 0, -18] as Vec3, dir: [0, 0, -1] as Vec3 })

const baseParts: SpecPart[] = [
  {
    id: 'base', name: '自清洁基站', spec: 'EWFD27HRR · 智能上下水版',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 450, d: 450, h: 6, r: 30, at: [0, 0, 0] },
        { type: 'slab', w: 450, d: 150, h: 119, r: 20, at: [0, 6, -150] },
        { type: 'box', size: [25, 119, 300], at: [212.5, 65.5, 75] },
        { type: 'box', size: [25, 119, 300], at: [-212.5, 65.5, 75] },
        { type: 'slab', w: 450, d: 450, h: 160, r: 40, at: [0, 125, 0] },
        { type: 'slab', w: 450, d: 305, h: 450, r: 140, at: [0, 297.5, -225], rot: [90, 0, 0] },
        { type: 'hole', w: 70, h: 10, r: 3, at: [0, 60, -74.7], fill: 'shade' },
        { type: 'hole', w: 100, h: 12, r: 4, at: [0, 100, -74.7], fill: 'dark' },
        { type: 'hole', w: 70, h: 34, r: 4, at: [0, 190, -225.3], rot: [0, 180, 0], fill: 'shade' },
      ],
    },
  },
  { id: 'tray', name: '清洗盘组件', spec: '含清洗盘滤网', parent: 'base', shape: { type: 'slab', w: 330, d: 160, h: 8, r: 12 }, at: TRAY_AT, fill: 'shade' },
  { id: 'transport-block', name: '运输固定模块', spec: '首次使用前取出', parent: 'base', shape: { type: 'box', size: [120, 40, 60], chamfer: 3 }, at: [0, 34, 10], fill: 'warm', visible: false },
  {
    id: 'dust-cover', name: '集尘仓盖板', parent: 'base',
    shape: { type: 'compound', items: [{ type: 'box', size: [380, 150, 12], chamfer: 4 }, { type: 'text', text: 'roborock', size: 11, at: [120, 48, 6.3] }] },
    at: COVER_AT,
  },
  { id: 'liquid-box', name: '清洁液盒', spec: '底部扣手 · 装回听到“咔哒”', parent: 'base', shape: { type: 'box', size: [110, 120, 150], chamfer: 6 }, at: LIQUID_AT, fill: 'warm' },
  { id: 'dust-bag', name: '一次性尘袋', spec: '提手自动封口', parent: 'base', shape: { type: 'box', size: [160, 120, 90], chamfer: 6 }, at: BAG_AT, fill: 'warm' },
  { id: 'status-led', name: '基站状态指示灯', parent: 'base', shape: { type: 'led', r: 7.5, color: LIT.white }, at: STATUS_LED },
  { id: 'clamp', name: '压管支架', parent: 'base', shape: { type: 'box', size: [24, 34, 14], chamfer: 2 }, at: [0, 25, -232], fill: 'shade' },
  { id: 'port-in', name: '进水接口', parent: 'base', shape: { type: 'hole', w: 10, h: 10, r: 5 }, at: PORT_IN, rot: [0, 180, 0], fill: 'dark' },
  { id: 'port-dr', name: '排水接口', parent: 'base', shape: { type: 'hole', w: 12, h: 12, r: 6 }, at: PORT_DR, rot: [0, 180, 0], fill: 'dark' },
  { id: 'port-ac', name: '电源接口', parent: 'base', shape: { type: 'hole', w: 16, h: 22, r: 3 }, at: PORT_AC, rot: [0, 180, 0], fill: 'dark' },
]

const pipeParts: SpecPart[] = [
  { id: 'elbow-in', name: '二分直角弯头（进水管）', parent: 'base', shape: elbow(7) },
  { id: 'elbow-dr', name: '三分直角弯头（排水管）', parent: 'base', shape: elbow(8) },
  { id: 'clip-in', name: '二分锁片', parent: 'base', shape: { type: 'compound', items: clipItems(5.5) }, at: [PORT_IN[0], PORT_IN[1], CLIP_Z], rot: [90, 0, 0] },
  { id: 'clip-dr', name: '三分锁片', parent: 'base', shape: { type: 'compound', items: clipItems(7) }, at: [PORT_DR[0], PORT_DR[1], CLIP_Z], rot: [90, 0, 0] },
  { id: 'pipe-in1', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'elbow-in', ...elbowOut(7) }, to: { part: 'clamp', at: [-12, 7, 0], dir: [-1, 0, 0] }, r: 3.5 } },
  { id: 'pipe-in2', name: '进水管（二分管）', shape: { type: 'cable', from: { part: 'clamp', at: [12, 7, 0], dir: [1, 0, 0] }, to: { part: 'tee', ...TEE_OUTLET }, r: 3.5 } },
  { id: 'pipe-dr1', name: '排水管（三分管）', shape: { type: 'cable', from: { part: 'elbow-dr', ...elbowOut(8) }, to: { part: 'clamp', at: [-12, -7, 0], dir: [-1, 0, 0] }, r: 4.5 } },
  { id: 'pipe-dr2', name: '排水管（三分管）', shape: { type: 'cable', from: { part: 'clamp', at: [12, -7, 0], dir: [1, 0, 0] }, to: { part: 'floor-drain', ...DRAIN_INLET }, r: 4.5, slack: 0.5 } },
]

const powerParts: SpecPart[] = [
  { id: 'ac-a', name: '电源线（基站端）', parent: 'base', shape: lPlug() },
  { id: 'ac-b', name: '电源线（插头）', shape: wallPlug() },
  { id: 'ac-cable', name: '基站电源线', shape: { type: 'cable', from: { part: 'ac-a', ...L_PLUG_OUT }, to: { part: 'ac-b', ...WALL_PLUG_OUT }, r: 2.6 } },
]

const parts: SpecPart[] = [
  ...wallParts(WALL),
  ...baseParts,
  ...pipeParts,
  ...powerParts,
  ...robotParts(R),
  ...phoneParts([400, 330, 560], [-8, 10, 0]),
]

// ---------- 状态 ----------

const INSTALLED: Record<string, PartState> = {
  robot: { at: DOCK },
  'elbow-in': { plug: 'port-in' },
  'elbow-dr': { plug: 'port-dr' },
  'ac-a': { plug: 'port-ac' },
  'ac-b': { plug: 'socket' },
  'power-led': { light: 'blink', color: LIT.white },
  'status-led': { light: 'off', color: LIT.white },
}

const PIPES = ['clamp', 'pipe-in1', 'pipe-in2', 'pipe-dr1', 'pipe-dr2', 'ac-cable']

/** 拔下 / 未装时的弯头：接口正后方 50 mm */
const looseElbow = (p: Vec3): PartState => ({ parent: null, at: [p[0], p[1], BACK_Z - 50], rot: INTO_BACK })
const clipUp = (p: Vec3): Vec3 => [p[0], p[1] + 40, CLIP_Z]

const BIN_REST: Vec3 = [300, 22, 420]
const BIN_VIA: Vec3 = [150, 280, 470]
const FILTER_REST: Vec3 = [300, 3, 530]
const FILTER_VIA: Vec3 = [300, 110, 500]
const LID_REST: Vec3 = [-410, 0, 600]
const LID_VIA: Vec3 = [-230, 240, 610]
const COVER_REST: Vec3 = [-400, 6, 380]
const COVER_VIA: Vec3 = [-220, 420, 420]
const LIQUID_REST: Vec3 = [-260, 60, 560]
const LIQUID_VIA: Vec3 = [-130, 300, 520]

const COVER_HOME: PartState = { parent: 'robot', at: [0, 4.6, BRUSH_Z], rot: [0, 0, 0], via: [200, 260, 640], dur: 1.4 }
const BIN_HOME: PartState = { parent: 'robot', at: dustbinAt(R), rot: [0, 0, 0], via: BIN_VIA, dur: 1.5 }
const LID_HOME: PartState = { parent: 'robot', at: LID_AT, rot: [0, 0, 0], via: LID_VIA, dur: 1.2 }
const LID_OFF: PartState = { parent: null, at: LID_REST, rot: [0, 0, 0], via: LID_VIA, dur: 1.2 }

const APP_DRAIN: ScreenUI = {
  app: 'Roborock', title: '基站设置',
  items: [{ text: '排空基站余水', state: 'selected' }, { text: '清洗拖布', state: 'muted' }, { text: '集尘', state: 'muted' }],
  button: '开始排水', buttonActive: true,
}

// ---------- 镜头 ----------

const OVERVIEW: CameraSpec = { target: [80, 230, 0], dir: [-0.5, 0.55, -1], dist: 2400 }
const FRONT_AWAY: CameraSpec = { target: [0, 200, 420], dir: [0.5, 0.45, 1], dist: 1700 }
const PLACE: CameraSpec = { target: [60, 220, 60], dir: [0.75, 0.55, 1], dist: 2000 }
const BACK: CameraSpec = { target: [80, 170, -240], dir: [-0.45, 0.5, -1], dist: 1500 }
const BACK_LOW: CameraSpec = { target: [-80, 60, -240], dir: [-0.5, 0.45, -1], dist: 700 }
const BASE_FRONT: CameraSpec = { target: [0, 230, 330], dir: [0.5, 0.35, 1], dist: 1600 }
const DOCK_VIEW: CameraSpec = { target: [0, 200, 260], dir: [0.45, 0.45, 1], dist: 1450 }
const DOCK_FRONT: CameraSpec = { target: [0, 130, 250], dir: [0.3, 0.55, 1], dist: 900 }
const ROBOT_VIEW: CameraSpec = { target: [0, 60, 640], dir: [0.35, 0.9, 1], dist: 900 }
const ROBOT_SIDE: CameraSpec = { target: [140, 40, 560], dir: [1, 0.85, 0.2], dist: 1150 }
const ROBOT_PHONE: CameraSpec = { target: [160, 200, 420], dir: [0.3, 0.5, 1], dist: 1250 }
const FLIP_VIEW: CameraSpec = { target: [0, 60, 650], dir: [0.15, 1, 0.75], dist: 1250 }
const SCENE: CameraSpec = { target: [0, 170, 400], dir: [0.6, 0.55, 1], dist: 1900 }
const BAY_LOW: CameraSpec = { target: [-40, 110, 330], dir: [0.3, 0.18, 1], dist: 1500 }

/** 从背后看弯头、锁片 */
const zoomBack = (target: string, caption: string, dist = 160) => ({ target, dir: [-0.45, 0.35, -1] as Vec3, dist, caption })
const zoomFront = (target: string, caption: string, dist = 260) => ({ target, dir: [0.3, 0.2, 1] as Vec3, dist, caption })

// ---------- 说明书 ----------

export const roborockP20Pro: ManualSpec = {
  id: 'roborock-p20-pro',
  name: '石头 P20 Pro 智能上下水版',
  desc: '自清洁扫拖机器人：上下水安装、配网、日常维护、指示灯与故障',
  category: '扫地机器人',
  dims: { width: 450, depth: 450, height: 450 },
  source: {
    title: '石头自清洁扫拖机器人 P20 Pro 智能上下水版使用说明书',
    url: 'https://files.roborock.com/product-center/video/v66e406528a1f4.pdf',
    images: [],
  },
  package: [
    { name: '扫拖机器人', qty: 1, spec: 'A1340RR' },
    { name: '自清洁基站', qty: 1, spec: 'EWFD27HRR，智能上下水版' },
    { name: '拖布支架 + 拖布', qty: 2, spec: '左右各一' },
    { name: '电源线', qty: 1 },
    { name: '一次性尘袋', qty: 1 },
    { name: '束线管', qty: 1 },
    { name: '清水三通阀', qty: 1 },
    { name: '自来水滤网', qty: 1 },
    { name: '进水管（二分管）', qty: 1 },
    { name: '排水管（三分管）', qty: 1 },
    { name: '二分锁片', qty: 5 },
    { name: '三分锁片', qty: 3 },
  ],
  params: [
    { label: '机器人型号', value: 'A1340RR' },
    { label: '机器人额定电压 / 功率', value: '14.4 V ⎓ / 66 W' },
    { label: '充电时间', value: '< 4 小时' },
    { label: '基站型号', value: 'EWFD27HRR' },
    { label: '基站额定输入', value: '220–240 V ~ 50–60 Hz' },
    { label: '充电 + 烘干功率', value: '90 W' },
    { label: '集尘功率', value: '650 W' },
    { label: '热水洗布功率', value: '1320 W' },
    { label: '进水压力', value: '0.1–0.4 MPa' },
    { label: '基站额定输出', value: '20 V ⎓ 1.5 A' },
    { label: '网络', value: '仅 2.4 GHz WiFi' },
    { label: '基站外形', value: '约 450 × 450 × 450 mm', note: '公开参数，说明书未标注' },
  ],
  parts,
  initial: INSTALLED,
  stageSize: 1500,
  guides: [
    // ================= 上下水安装 =================
    {
      id: 'install', title: '上下水安装', kind: 'assembly',
      start: {
        base: { at: BASE_AWAY },
        robot: { visible: false },
        'status-led': { light: 'off' },
        'transport-block': { visible: true },
        'elbow-in': { ...looseElbow(PORT_IN), visible: false },
        'elbow-dr': { ...looseElbow(PORT_DR), visible: false },
        'clip-in': { at: clipUp(PORT_IN), visible: false },
        'clip-dr': { at: clipUp(PORT_DR), visible: false },
        'ac-a': { parent: null, at: [PORT_AC[0], PORT_AC[1], BACK_Z - 50], rot: INTO_BACK, visible: false },
        'ac-b': { parent: null, at: [WALL.socketX, 160, -200], rot: [0, 90, 0], visible: false },
        ...hide(...PIPES),
      },
      steps: [
        {
          id: 'i-overview', title: '先看管路示意：水源、地漏、电源', page: 6,
          desc: '进水管（二分管）从墙上的自来水水源经自来水滤网、清水三通阀接到基站背面的进水接口；排水管（三分管）从排水接口通到地漏或下水管。两根管子在接口处用直角弯头转向，经背面的压管支架固定。',
          tip: '需由专业安装人员勘测后安装，请勿自行安装。请在基站断电状态下拆装基站及配套管路。',
          camera: OVERVIEW,
          highlight: ['tee', 'floor-drain'],
          callouts: [
            { part: 'tee', text: '清水三通阀', sub: '上接自来水滤网', offset: [0, 90, 0] },
            { part: 'floor-drain', text: '地漏 / 下水管', offset: [0, 70, 0] },
            { part: 'socket', text: '电源插座', offset: [0, 70, 0] },
          ],
        },
        {
          id: 'i-block', title: '取出清洗盘组件的运输固定模块', page: 7,
          desc: '首次使用前，把基站内部清洗盘组件上的运输固定模块取出来。',
          camera: FRONT_AWAY,
          set: { 'transport-block': { at: [0, 20, 230], lift: 15, dur: 1.4 } },
          highlight: ['transport-block'],
        },
        {
          id: 'i-place', title: '靠墙放到硬质水平地面上', page: 7,
          desc: '把基站背面靠墙放在硬质水平地面上，周围预留足够空间，并确保 WiFi 信号覆盖良好。',
          tip: '基站出厂前做过通水测试，内部残留少量水属于正常现象。',
          camera: PLACE,
          set: { 'transport-block': { visible: false }, base: { at: [0, 0, 0], dur: 1.8 } },
          highlight: ['base'],
          chips: [{ label: '高度', sub: '至少 33 cm' }, { label: '宽度', sub: '至少 46 cm' }, { label: '深度', sub: '至少 120 cm' }],
        },
        {
          id: 'i-inlet', title: '接进水管：三通阀 → 二分直角弯头', page: 6,
          desc: '进水管（二分管）从清水三通阀下方出水口引出，沿基站背面穿过压管支架，接上二分直角弯头，再把弯头插到底进背面的进水接口。',
          tip: '连接进水管路前，请先把自来水排放至清澈，以免水中杂质堵塞管路。',
          camera: BACK,
          set: {
            ...show('clamp', 'pipe-in1', 'pipe-in2'),
            'elbow-in': { visible: true, plug: { hole: 'port-in', back: 30 }, dur: 1.3 },
          },
          highlight: ['elbow-in', 'clamp', 'pipe-in1', 'pipe-in2'],
          zoom: zoomBack('elbow-in', '二分直角弯头插到底'),
          callouts: [{ part: 'clamp', text: '压管支架', offset: [0, 90, 0] }],
        },
        {
          id: 'i-clip-in', title: '插上二分锁片', page: 6,
          desc: '在进水接口和二分直角弯头之间从上往下插入二分锁片，卡住弯头防止脱出。',
          camera: BACK_LOW,
          set: { 'clip-in': { visible: true, at: [PORT_IN[0], PORT_IN[1], CLIP_Z], dur: 0.9 } },
          highlight: ['clip-in'],
          zoom: zoomBack('clip-in', '二分锁片卡住弯头', 120),
        },
        {
          id: 'i-drain', title: '接排水管：三分直角弯头 → 地漏', page: 6,
          desc: '排水管（三分管）一头接三分直角弯头并插到底进背面的排水接口，沿基站背面穿过压管支架，另一头通到地漏或下水管。',
          camera: BACK,
          set: {
            ...show('pipe-dr1', 'pipe-dr2'),
            'elbow-dr': { visible: true, plug: { hole: 'port-dr', back: 30 }, dur: 1.3 },
          },
          highlight: ['elbow-dr', 'pipe-dr1', 'pipe-dr2', 'floor-drain'],
          zoom: zoomBack('elbow-dr', '三分直角弯头插到底'),
        },
        {
          id: 'i-clip-dr', title: '插上三分锁片', page: 6,
          desc: '在排水接口和三分直角弯头之间插入三分锁片，确认两根水管都已插到底、锁牢。',
          camera: BACK_LOW,
          set: { 'clip-dr': { visible: true, at: [PORT_DR[0], PORT_DR[1], CLIP_Z], dur: 0.9 } },
          highlight: ['clip-dr'],
          zoom: zoomBack('clip-dr', '三分锁片卡住弯头', 130),
        },
        {
          id: 'i-power', title: '插紧电源线，状态指示灯亮起', page: 7,
          desc: '把基站电源线一头用力插紧在基站背面的电源接口，另一头插到墙上插座。基站状态指示灯亮起（白色）即通电正常。',
          tip: '电源线垂地可能被拖拽，请收好；状态指示灯通电时常亮，机器人充电时熄灭。',
          camera: BACK,
          set: {
            'ac-a': { visible: true, plug: { hole: 'port-ac', back: 40 }, dur: 1.2 },
            'ac-b': { visible: true, plug: { hole: 'socket', back: 40 }, dur: 1.2, delay: 1.0 },
            'ac-cable': { visible: true },
            'status-led': { light: 'on', color: LIT.white, delay: 2.3 },
          },
          highlight: ['ac-a', 'ac-b', 'ac-cable'],
          zoom: zoomFront('status-led', '基站状态指示灯：白色常亮'),
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
          desc: '把机器人翻回正面，长按 ⏻ 键开机，电源指示灯常亮。白色表示电量 ≥ 15%，红色表示电量 < 15%。',
          camera: ROBOT_VIEW,
          set: { robot: P.unflip, 'power-led': { light: 'on', color: LIT.white, delay: 2.2 } },
          actions: [{ type: 'press', part: 'btn-power', delay: 1.9 }],
          highlight: ['btn-power', 'power-led'],
          zoom: zoomTop('power-led', '电源指示灯常亮（白色）'),
          chips: [{ label: '长按 ⏻', sub: '开机 / 关机' }, { label: '白色', sub: '电量 ≥ 15%' }, { label: '红色', sub: '电量 < 15%' }],
        },
        {
          id: 'u-home', title: '放在基站前，短按 ⌂ 自动回充', page: 8,
          desc: '确认基站已通电，把机器人放在基站前，短按机器人的 ⌂ 键，机器人自动返回基站充电。基站状态指示灯熄灭、电源指示灯呼吸闪烁，表示正在充电。',
          camera: DOCK_VIEW,
          set: {
            robot: { ...P.dock, delay: 0.8 },
            'power-led': { light: 'blink', color: LIT.white, delay: 3.0 },
            'status-led': { light: 'off', delay: 3.0 },
          },
          actions: [{ type: 'press', part: 'btn-home', delay: 0.2 }],
          highlight: ['btn-home', 'power-led', 'status-led'],
          zoom: zoomTop('power-led', '电源指示灯呼吸闪烁 = 充电中'),
          chips: [{ label: '基站状态灯', sub: '熄灭' }, { label: '电源指示灯', sub: '呼吸闪烁 = 充电中' }],
        },
        {
          id: 'u-app', title: '下载 Roborock App', page: 8,
          desc: '在应用商店搜索“Roborock”，或扫描说明书上的二维码，下载 Roborock App。',
          camera: PHONE_VIEW,
          set: { phone: { visible: true }, 'phone-screen': { ui: APP.store() } },
          highlight: ['phone-screen'],
        },
        {
          id: 'u-wifi', title: '同时按住 ⏻ 与 ⌂，电源灯蓝色慢闪', page: 8,
          desc: '同时按住 ⏻ 与 ⌂ 键，直到听到语音“重置 WiFi，进入配网模式”，电源指示灯开始蓝色慢闪。',
          camera: DOCK_FRONT,
          set: { phone: { visible: false }, 'power-led': { light: 'blink', color: LIT.blue, delay: 1.4 } },
          actions: [{ type: 'press', part: 'btn-power', delay: 0.6 }, { type: 'press', part: 'btn-home', delay: 0.6 }],
          highlight: ['btn-power', 'btn-home', 'power-led'],
          zoom: zoomTop('power-led', '蓝色慢闪 = 等待配网'),
          chips: [{ label: '蓝色慢闪', sub: '等待配网' }, { label: '蓝色快闪', sub: '正在连接网络' }, { label: '蓝色常亮', sub: '网络连接成功' }],
        },
        {
          id: 'u-add', title: 'App 首页点「添加设备」或「+」', page: 8,
          desc: '打开 App 首页点“添加设备”或“+”，选择扫拖机器人，按提示连接家里的 2.4GHz WiFi。连接过程中电源指示灯蓝色快闪。',
          tip: '仅支持 2.4GHz WiFi；等待连接超过 5 分钟，机器人会自动关闭 WiFi，需要重新重置。',
          camera: ROBOT_PHONE,
          set: { phone: { visible: true }, 'phone-screen': { ui: APP.pick('Roborock P20 Pro') } },
          highlight: ['phone-screen', 'power-led'],
          zoom: zoomTop('power-led', '蓝色快闪 = 正在连接网络'),
        },
        {
          id: 'u-done', title: '连接成功：电源灯蓝色常亮', page: 4,
          desc: 'App 提示添加成功，电源指示灯变为蓝色常亮，表示网络连接成功。',
          camera: ROBOT_PHONE,
          set: { 'phone-screen': { ui: APP.done('Roborock P20 Pro') }, 'power-led': { light: 'on', color: LIT.blue, delay: 0.4 } },
          highlight: ['phone-screen', 'power-led'],
          zoom: zoomTop('power-led', '蓝色常亮 = 网络连接成功'),
        },
        {
          id: 'u-liquid-out', title: '取下集尘仓盖板，抽出清洁液盒', page: 8,
          desc: '取下集尘仓盖板，手指伸进清洁液盒底部的扣手，向外抽出整个清洁液盒放到平整地面上，打开盒盖加入石头官方清洁液。',
          tip: '请勿过量添加；请勿加入消毒剂或非官方清洁液。也可以不加清洁液。',
          camera: BASE_FRONT,
          set: {
            phone: { visible: false },
            'dust-cover': { parent: null, at: COVER_REST, rot: [-90, 0, 0], via: COVER_VIA, dur: 1.4 },
            'liquid-box': { parent: null, at: LIQUID_REST, rot: [0, 0, 0], via: LIQUID_VIA, delay: 1.4, dur: 1.4 },
          },
          highlight: ['dust-cover', 'liquid-box'],
        },
        {
          id: 'u-liquid-in', title: '盖紧装回液盒，装回盖板', page: 8,
          desc: '盖紧清洁液盒上盖，推回基站听到“咔哒”声，再装回集尘仓盖板，确保密封。之后基站会自动进水、排水并添加清洁液。',
          camera: BASE_FRONT,
          set: {
            'liquid-box': { parent: 'base', at: LIQUID_AT, rot: [0, 0, 0], via: LIQUID_VIA, dur: 1.4 },
            'dust-cover': { parent: 'base', at: COVER_AT, rot: [0, 0, 0], via: COVER_VIA, delay: 1.5, dur: 1.4 },
          },
          highlight: ['liquid-box', 'dust-cover'],
        },
        {
          id: 'u-start', title: '短按 ⏻ 开始清洁', page: 9,
          desc: '短按 ⏻ 键，机器人离开基站开始清洁，先沿墙边、再按 Z 字形清扫整个区域。运行中按任意键暂停。',
          camera: SCENE,
          set: {
            robot: { ...P.leave, delay: 0.6 },
            'power-led': { light: 'on', color: LIT.white, delay: 0.6 },
            'status-led': { light: 'on', color: LIT.white, delay: 0.6 },
          },
          actions: [{ type: 'press', part: 'btn-power', delay: 0.1 }, { type: 'glide', part: 'robot', delay: 3.0 }],
          highlight: ['btn-power', 'robot', 'power-led', 'status-led'],
          zoom: zoomTop('power-led', '清洁中：电源指示灯白色常亮', 130),
          chips: [{ label: '短按 ⏻', sub: '启动清洁' }, { label: '长按 ⌂', sub: '局部清扫 1.5 m × 1.5 m' }, { label: '勿扰', sub: '22:00–08:00' }],
        },
        {
          id: 'u-return', title: '自动回座：洗拖布、集尘、烘干', page: 9,
          desc: '清洁完成后机器人自动返回基站，清洗拖布、按需集尘、烘干拖布并充电。集尘和清洗拖布时基站状态指示灯呼吸闪烁。',
          tip: '烘干时请勿靠近烘干出风口。',
          camera: DOCK_VIEW,
          set: {
            robot: P.dock,
            'status-led': { light: 'blink', color: LIT.white, delay: 2.2 },
            'power-led': { light: 'blink', color: LIT.white, delay: 2.2 },
          },
          highlight: ['robot', 'status-led', 'power-led'],
          zoom: zoomFront('status-led', '状态指示灯呼吸闪烁 = 集尘 / 清洁拖布中'),
          chips: [{ label: '清洗拖布', sub: '长按 ⌂ 或 App' }, { label: '集尘', sub: '充电时短按 ⌂' }, { label: '烘干' }],
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
          id: 'm-bin', title: '取下磁吸上盖，取出尘盒', page: 11,
          desc: '取下机器人的磁吸上盖，按住尘盒卡扣把尘盒提出来。',
          camera: ROBOT_SIDE,
          set: {
            lid: LID_OFF,
            dustbin: { parent: null, at: BIN_REST, rot: [0, 0, 0], via: BIN_VIA, delay: 1.2, dur: 1.5 },
          },
          highlight: ['lid', 'dustbin'],
        },
        {
          id: 'm-filter', title: '取下滤网倒垃圾，清水摇晃冲洗', page: 12,
          desc: '取下可水洗滤网，倾倒尘盒里的垃圾。往尘盒注入清水，装回滤网左右摇晃后倒出脏水。',
          tip: '只用清水，勿加洗涤剂；勿用手或刷子触碰滤网表面；尘盒和滤网晾晒至少 24 小时再装回。',
          camera: ROBOT_SIDE,
          set: { filter: { parent: null, at: FILTER_REST, rot: [90, 0, 0], via: FILTER_VIA, dur: 1.2 } },
          actions: [{ type: 'shake', part: 'dustbin', axis: 'x', amp: 4, delay: 1.4 }],
          highlight: ['filter', 'dustbin'],
          chips: [{ label: '可水洗滤网', sub: '每 2 周清理 · 6–12 个月更换' }],
        },
        {
          id: 'm-bin-back', title: '装回滤网和尘盒', page: 12,
          desc: '尘盒和滤网完全晾干后，把滤网装回尘盒，再把尘盒放回机器人。',
          camera: ROBOT_SIDE,
          set: {
            filter: { parent: 'dustbin', at: [0, 0, 44], rot: [0, 0, 0], via: FILTER_VIA, dur: 1.2 },
            dustbin: { ...BIN_HOME, delay: 1.3 },
          },
          highlight: ['dustbin'],
        },
        {
          id: 'm-flip', title: '盖回上盖翻过机器人，取下主刷罩', page: 10,
          desc: '盖回磁吸上盖，把机器人翻过来，向内挤压主刷罩卡扣，取下主刷罩。',
          camera: FLIP_VIEW,
          set: {
            lid: LID_HOME,
            robot: { ...P.flip, delay: 1.3 },
            'brush-cover': { parent: null, at: [340, 1.6, 600], rot: [0, 0, 0], via: [200, 260, 640], delay: 3.2, dur: 1.4 },
          },
          highlight: ['brush-cover'],
          chips: [{ label: '主刷', sub: '每 2 周清理 · 6–12 个月更换' }],
        },
        {
          id: 'm-brush', title: '提起主刷向外拔出，清除毛发', page: 10,
          desc: '向上提起两段主刷，向外拔出，清除缠绕的毛发。',
          camera: FLIP_VIEW,
          set: {
            'brush-l': { parent: null, at: [-300, 12.2, 760], rot: [0, 0, 0], via: [-200, 260, 740], dur: 1.4 },
            'brush-r': { parent: null, at: [300, 12.2, 760], rot: [0, 0, 0], via: [200, 260, 740], delay: 0.3, dur: 1.4 },
          },
          highlight: ['brush-l', 'brush-r'],
        },
        {
          id: 'm-brush-back', title: '主刷分别装回，主刷罩 4 齿入槽', page: 11,
          desc: '两段主刷按颜色与轴承对应，分别插到底装回；再把主刷罩的 4 个齿插入卡槽，压紧听到“咔哒”声。',
          camera: FLIP_VIEW,
          set: {
            'brush-l': { parent: 'robot', at: [48, 12.5, BRUSH_Z], rot: [0, 0, 0], via: [-200, 260, 740], dur: 1.4 },
            'brush-r': { parent: 'robot', at: [-48, 12.5, BRUSH_Z], rot: [0, 0, 0], via: [200, 260, 740], delay: 0.3, dur: 1.4 },
            'brush-cover': { ...COVER_HOME, delay: 1.8 },
          },
          highlight: ['brush-l', 'brush-r', 'brush-cover'],
        },
        {
          id: 'm-side', title: '拆下边刷清理，装回锁紧', page: 11,
          desc: '拧下边刷螺丝取下边刷，清理缠绕的毛发后装回并锁紧螺丝。万向轮可用小螺丝刀撬出轮轴冲洗；主轮用软干布擦拭。',
          camera: FLIP_VIEW,
          set: { 'side-brush': { via: [210, 240, 780], dur: 1.6 } },
          highlight: ['side-brush'],
          callouts: [
            { part: 'robot', text: '万向轮', at: [0, 6, 135], offset: [-60, 60, 0] },
            { part: 'robot', text: '主轮', at: [130, 6, 0], offset: [-50, 60, 0] },
          ],
          chips: [{ label: '边刷', sub: '每月清理 · 3–6 个月更换' }, { label: '万向轮', sub: '支架不可取出' }],
        },
        {
          id: 'm-mop-off', title: '取下拖布清洗晾晒', page: 12,
          desc: '把拖布从拖布支架上取下，清洗后晾晒。',
          camera: FLIP_VIEW,
          set: {
            'mop-l': { parent: null, at: [-330, 3, 600], rot: [0, 0, 0], via: [-210, 260, 600], dur: 1.4 },
            'mop-r': { parent: null, at: [330, 3, 600], rot: [0, 0, 0], via: [210, 260, 600], delay: 0.3, dur: 1.4 },
          },
          highlight: ['mop-l', 'mop-r'],
          chips: [{ label: '拖布', sub: '按需清理 · 1–3 个月更换' }],
        },
        {
          id: 'm-mop-on', title: '贴好拖布，装回机器人', page: 12,
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
          desc: '取下基站正面的集尘仓盖板，捏住尘袋提手沿箭头方向取出，提手会自动封口，直接丢弃。',
          camera: BASE_FRONT,
          set: {
            'dust-cover': { parent: null, at: COVER_REST, rot: [-90, 0, 0], via: COVER_VIA, dur: 1.4 },
            'dust-bag': { at: [BAG_AT[0], BAG_AT[1], 340], delay: 1.4, dur: 1.0 },
          },
          highlight: ['dust-cover', 'dust-bag'],
          chips: [{ label: '尘袋', sub: '按需更换' }],
        },
        {
          id: 'm-bag-in', title: '插入新尘袋铺平，装回盖板', page: 13,
          desc: '用干抹布清理尘袋卡槽附近的滤网，把新尘袋插入卡槽到底并铺平，再装回集尘仓盖板。',
          camera: BASE_FRONT,
          set: {
            'dust-bag': { at: BAG_AT, dur: 1.0 },
            'dust-cover': { parent: 'base', at: COVER_AT, rot: [0, 0, 0], via: COVER_VIA, delay: 1.1, dur: 1.4 },
          },
          highlight: ['dust-bag', 'dust-cover'],
        },
        {
          id: 'm-tray', title: '取出清洗盘组件冲洗后装回', page: 13,
          desc: '按图取出清洗盘组件，冲洗清洗盘及清洗盘滤网，再装回基站。',
          camera: BASE_FRONT,
          set: { tray: { via: [0, 130, 340], dur: 2.4 } },
          highlight: ['tray'],
          chips: [{ label: '清洗盘组件', sub: '按需清洗' }],
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
          id: 'r-base-red', title: '基站状态指示灯红色常亮', page: 16,
          desc: '基站状态指示灯红色常亮表示基站异常，常见原因：集尘仓盖板或尘袋不在位、电压异常、上下水管路未安装到位、清洗盘组件或滤网未安装到位。',
          tip: '请勿在未安装上下水管路、清洗盘组件、集尘仓盖板、清洁液盒时使用基站。',
          camera: BASE_FRONT,
          set: { 'power-led': { light: 'off' }, 'status-led': { light: 'on', color: LIT.red } },
          highlight: ['status-led'],
          zoom: zoomFront('status-led', '红色常亮 = 基站异常'),
          callouts: [
            { part: 'dust-cover', text: '盖板 / 尘袋在位？', at: [-150, 0, 6], offset: [-80, 60, 0] },
            { part: 'tray', text: '清洗盘装到位？', at: [-140, 8, 60], offset: [-90, 40, 0] },
          ],
        },
        {
          id: 'r-charge', title: '无法充电：检查电源线和充电触片', page: 16,
          desc: '检查电源线两头（墙上插座和基站背面）是否插紧；用软干布擦拭机器人和基站的充电触片；再看基站状态指示灯是否正常。',
          camera: BAY_LOW,
          set: { robot: { rot: [0, 180, 0], dur: 1.2 }, 'status-led': { light: 'on', color: LIT.white, delay: 1.2 } },
          actions: [{ type: 'shake', part: 'ac-b', axis: 'x', amp: 2, delay: 1.2 }],
          highlight: ['ac-b', 'status-led'],
          zoom: { target: 'robot', offset: [0, 30, R.r], dir: [0.25, 0.3, 1], dist: 260, caption: '机器人后部的充电触片' },
          callouts: [
            { part: 'base', text: '基站充电触片', at: [0, 60, -75], offset: [-90, 60, 0] },
            { part: 'robot', text: '充电触片', at: [0, 30, -R.r], offset: [80, 80, 0] },
          ],
        },
        {
          id: 'r-wifi', title: '无法连接 WiFi：重置 WiFi', page: 16,
          desc: '确认路由器是 2.4GHz、机器人所在位置信号良好。把机器人转回正面，同时按住 ⏻ 与 ⌂ 重置 WiFi，电源指示灯蓝色慢闪后重新在 App 里添加。',
          camera: ROBOT_VIEW,
          set: { robot: { rot: [0, 0, 0], dur: 1.2 }, 'power-led': { light: 'blink', color: LIT.blue, delay: 1.9 } },
          actions: [{ type: 'press', part: 'btn-power', delay: 1.3 }, { type: 'press', part: 'btn-home', delay: 1.3 }],
          highlight: ['btn-power', 'btn-home', 'power-led'],
          zoom: zoomTop('power-led', '蓝色慢闪 = 等待配网'),
        },
        {
          id: 'r-reset', title: '按键无响应：取下上盖按重置键', page: 10,
          desc: '按键无响应或无法关机时，取下机器人磁吸上盖，短按系统重置键，机器人会自动重启。',
          tip: '恢复初始设置：开机状态下长按 ⌂ 键，同时按一下系统重置键，听到语音“开始恢复初始设置，大约需要 5 分钟”。',
          camera: ROBOT_VIEW,
          set: { lid: LID_OFF, 'power-led': { light: 'blink', color: LIT.white, delay: 1.4 } },
          highlight: ['reset-key', 'power-led'],
          zoom: zoomTop('reset-key', '系统重置键', 130),
        },
        {
          id: 'r-drain', title: '装箱搬运前：App 排空余水', page: 14,
          desc: '盖回上盖。装箱搬运前，在 App 中执行“排空余水”，并清空清洁液盒。',
          camera: ROBOT_PHONE,
          set: { lid: LID_HOME, phone: { visible: true }, 'phone-screen': { ui: APP_DRAIN, delay: 1.2 } },
          highlight: ['phone-screen'],
        },
        {
          id: 'r-cut', title: '拆管前：切断电源和水源', page: 14,
          desc: '如需拆卸进排水管，先拔掉基站电源插头切断电源，再关闭清水三通阀切断水源。',
          tip: '请在基站断电状态下拆装基站及配套管路。',
          camera: BACK,
          set: {
            phone: { visible: false },
            'ac-b': { parent: null, at: [WALL.socketX, 160, -200], rot: [0, 90, 0], dur: 1.2 },
            'tee-knob': { ...KNOB_CLOSED, delay: 0.8 },
            'status-led': { light: 'off', delay: 0.8 },
          },
          highlight: ['ac-b', 'tee-knob'],
        },
        {
          id: 'r-pull', title: '抽出锁片，按住卡环拔出两根水管', page: 14,
          desc: '先向外（向上）抽出接头处的锁片，再按住接头卡环，依次拔出两根水管。',
          tip: '拔水管前先用容器接住管内流出的水，以免弄湿地面；请勿用蛮力直接拔水管。',
          camera: BACK_LOW,
          set: {
            'clip-in': { at: clipUp(PORT_IN), dur: 0.8 },
            'clip-dr': { at: clipUp(PORT_DR), dur: 0.8 },
            'elbow-in': { ...looseElbow(PORT_IN), delay: 1.0, dur: 1.0 },
            'elbow-dr': { ...looseElbow(PORT_DR), delay: 1.4, dur: 1.0 },
          },
          highlight: ['clip-in', 'clip-dr', 'elbow-in', 'elbow-dr'],
          zoom: zoomBack('elbow-in', '按住卡环，拔出水管', 200),
        },
      ],
    },
  ],
}
