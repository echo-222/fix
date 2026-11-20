import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 美的 酷省电 KFR-35GW/N8KS1-1 壁挂式空调（室内机 + 遥控器）
 * 说明书：《使用安装说明书 · 变频分体挂壁式空调器》GKS1(BN8)-01，34 页，逐页转写见 manuals-src/midea-ac-ks1/transcript.md
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。墙面在 z = 0（墙体向 -z），天花板 y = 2800（说明书按房高 2.8 m 计算面积）。
 * 室内机局部原点在背面底部中心，正面（面板、出风口）朝 +z，自身左右按面对空调的观众：显示屏在右（+x），Midea / 酷省电字样在左。
 * 室内机底面离地 2300 mm（说明书：与地板距离 230 cm 以上），外形 885 × 308 × 211 mm（p12 技术参数）。
 * 遥控器局部：按键面朝 +y，发射端（液晶屏一端）朝 -z，电池仓在背面（-y）尾部；手持时斜向上对准室内机。
 *
 * 推断（说明书没有给出）：
 * - 面板高约 230 mm、铰链在顶部前沿；面板下方 70 mm 是下部壳体和内凹出风口（照外观模型正面轮廓的台阶），上下导风板约 820 × 57 mm、转轴在上沿。
 * - 显示屏在面板右侧约 x = +300、离底 230 mm（照官方产品图）；左右摆叶画 5 片示意。
 * - 面板左右两侧按键在两端侧面上部；电源插座在室内机右侧墙上（x = 700，离地 2150 mm）。
 * - 遥控器约 52 × 150 × 20 mm，按键排布照美的 RN10L 系列遥控器官方图；故障代码用「E1」示例（说明书只给 E(x) 等格式）。
 *
 * 外观模型：室内机照一张官方产品图生成（models/midea-ac-ks1/tripo.json，来源 refs/sources.json）。
 * 室内机模型背后多生成的一块（截面只占宽度约 60%）和面板下沿以下的导风板 / 底壳用 crop 裁掉：导风板在大多数运行步骤里都会转，
 * 标 baked 会让整机在这些步骤退回代理形状，所以下部壳体、导风板、摆叶改由几何体 + finish 画。面板在模型里，标 baked。
 * 遥控器全用几何体（一物一画）：液晶和每个按键都要单独按、高亮，只能是几何体；照带按键的产品图生成的模型自带一套按键，
 * 叠在一起两层互相遮挡。把按键区抹平再生成，剩下一根光板，Tripo 认不出（生成成了带把手的歪板），不如倒角方块干净。
 */

const AC_AT: Vec3 = [0, 2300, 1]
const W = 885
const H = 308
const D = 211
/** 面板下沿 / 下部壳体上沿（室内机坐标 y）：外观模型在这里裁开，下面由几何体画 */
const SEAM = 70

/** 面板铰链（室内机坐标）：面板从这里向下垂，掀起时绕 x 轴向前上方转 */
const PANEL_HINGE: Vec3 = [0, 302, 206.5]
const PANEL_H = 230
/** 显示屏（面板坐标） */
const DISP: Vec3 = [300, -76, 4.8]
/** 显示屏世界坐标（细节窗用） */
const DISP_W: Vec3 = [AC_AT[0] + DISP[0], AC_AT[1] + PANEL_HINGE[1] + DISP[1], AC_AT[2] + PANEL_HINGE[2] + DISP[2]]

const VANE_CLOSED: PartState = { rot: [0, 0, 0], dur: 1.2 }
const VANE_OPEN: PartState = { rot: [-45, 0, 0], dur: 1.4 }
const VANE_SWING: PartState = { rot: [-65, 0, 0], dur: 1.2 }
const VANE_FLAT: PartState = { rot: [-85, 0, 0], dur: 1.4 }
const PANEL_OPEN: PartState = { rot: [-85, 0, 0], dur: 1.6 }
const PANEL_CLOSED: PartState = { rot: [0, 0, 0], dur: 1.4 }

const REMOTE_AT: Vec3 = [380, 1500, 700]
const REMOTE_ROT: Vec3 = [50, 20, 0]
const REMOTE_FLIP: Vec3 = [50, 20, 180]
/** 遥控器电池仓上方（世界坐标，翻面后） */
const BAY_VIA: Vec3 = [395, 1520, 780]

const SOCKET: Vec3 = [700, 2150, 0]
const PLUG_OUT: PartState = { parent: null, at: [700, 2080, 170], rot: [0, 90, 0], dur: 1.2 }

const COLOR = { blue: '#2f7bf5', green: '#34c759', orange: '#ff9500', white: '#c9dcf2' }

const BLADES = [-320, -160, 0, 160, 320]
const BLADE_IDS = BLADES.map((_, i) => `blade-${i + 1}`)
const DIGITS = ['d-260', 'd-265', 'd-cl', 'd-cf', 'd-hs', 'd-e'] as const

/** 只显示一个数码内容，其余隐藏 */
/** 显示屏换内容：off 熄灭、on 亮起（只写变化的两个） */
const swap = (off?: (typeof DIGITS)[number], on?: (typeof DIGITS)[number], delay = 0): Record<string, PartState> => ({
  ...(off ? { [off]: { visible: false, delay } } : {}),
  ...(on ? { [on]: { visible: true, delay } } : {}),
})
const blades = (deg: number): Record<string, PartState> => Object.fromEntries(BLADE_IDS.map((id) => [id, { rot: [0, deg, 0], dur: 1.0 }]))

// ---------- 遥控器液晶 ----------

const LCD_OFF: ScreenUI = { app: '遥控器液晶', items: [{ text: '待机', state: 'muted' }] }
const lcd = (title: string, ...items: { text: string; sub?: string; state?: 'normal' | 'selected' | 'done' | 'muted' }[]): ScreenUI => ({ app: '遥控器液晶', title, items })

// ---------- 零件 ----------

const room: SpecPart[] = [
  { id: 'wall', name: '墙面', shape: { type: 'box', size: [3200, 2800, 80] }, at: [0, 1400, -40], finish: 'wall' },
  { id: 'ceiling', name: '天花板', shape: { type: 'box', size: [3200, 40, 1400] }, at: [0, 2820, 660], finish: 'wall', visible: false },
  { id: 'socket', name: '电源插座', spec: '专用电源分支线路', parent: 'wall', shape: { type: 'hole', w: 40, h: 40, r: 6 }, at: [SOCKET[0], SOCKET[1] - 1400, 40.3], fill: 'shade' },
  {
    id: 'plug', name: '电源插头', parent: 'wall',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [30, 38, 30], chamfer: 5, at: [-15, 0, 0] },
        { type: 'box', size: [12, 2, 7], at: [6, 7, 0], fill: 'shade', finish: 'steel' },
        { type: 'box', size: [12, 2, 7], at: [6, -7, 0], fill: 'shade', finish: 'steel' },
      ],
    },
  },
  { id: 'cord', name: '电源线', shape: { type: 'cable', from: { part: 'indoor', at: [440, 30, 60], dir: [1, 0, 0] }, to: { part: 'plug', at: [-30, 0, 0], dir: [-1, 0, 0] }, r: 3.5, slack: 0.6 } },
]

const indoor: SpecPart[] = [
  {
    id: 'indoor', name: '室内机', spec: 'KFR-35GW/N8KS1-1 · 885 × 308 × 211 mm',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: W, d: 196, h: H - SEAM, r: 20, at: [0, SEAM, 98] },
        { type: 'box', size: [W, 6, 15], at: [0, H - 3, D - 7.5] },
      ],
    },
    parent: 'wall', at: [AC_AT[0], AC_AT[1] - 1400, AC_AT[2] + 40],
    model: { src: '/models/midea-ac-ks1/indoor.glb', rot: [0, -90, 0], fit: 'stretch', crop: { min: [0, 0.225, 0.395] } },
  },
  {
    id: 'chassis', name: '下部壳体 · 出风口', spec: '内凹出风口，导风板在前', parent: 'indoor',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [W, SEAM, 150], at: [0, SEAM / 2, 75] },
        { type: 'box', size: [14, SEAM, 196], at: [-(W / 2 - 7), SEAM / 2, 98] },
        { type: 'box', size: [14, SEAM, 196], at: [W / 2 - 7, SEAM / 2, 98] },
        { type: 'box', size: [W, 10, 205], chamfer: 3, at: [0, 5, 102.5] },
        { type: 'hole', w: 840, h: 50, r: 6, at: [0, 40, 150.3], fill: 'dark' },
      ],
    },
  },
  {
    id: 'panel', name: '面板', spec: '按两侧按键后向上掀起 75° 以上', parent: 'indoor', baked: true,
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [872, PANEL_H, 9], chamfer: 3 },
        { type: 'text', text: '酷省电', size: 13, at: [-370, 65, 4.8] },
        { type: 'text', text: 'Midea', size: 12, at: [-372, -85, 4.8] },
      ],
    },
    pivot: [0, -PANEL_H / 2, 0],
    at: PANEL_HINGE,
  },
  { id: 'btn-l', name: '面板按键（左）', parent: 'indoor', shape: { type: 'box', size: [2, 14, 24], chamfer: 0.8 }, at: [-(W / 2 + 1), 262, 185], fill: 'shade' },
  { id: 'btn-r', name: '面板按键（右）', parent: 'indoor', shape: { type: 'box', size: [2, 14, 24], chamfer: 0.8 }, at: [W / 2 + 1, 262, 185], fill: 'shade' },
  { id: 'filter-l', name: '空气滤尘网（左）', spec: '建议每月清洁 1 次', parent: 'indoor', shape: { type: 'box', size: [400, 200, 4], chamfer: 1.5 }, at: [-215, 190, 199], fill: 'shade', finish: { color: '#cfd6da', roughness: 0.85 } },
  { id: 'filter-r', name: '空气滤尘网（右）', spec: '建议每月清洁 1 次', parent: 'indoor', shape: { type: 'box', size: [400, 200, 4], chamfer: 1.5 }, at: [215, 190, 199], fill: 'shade', finish: { color: '#cfd6da', roughness: 0.85 } },
  { id: 'vane', name: '上下风向导风板', parent: 'indoor', shape: { type: 'box', size: [820, 57, 6], chamfer: 2 }, pivot: [0, -28.5, 0], at: [0, 68, 203] },
  ...BLADES.map((x, i): SpecPart => ({
    id: BLADE_IDS[i], name: '左右风向导风板（内侧）', parent: 'indoor', shape: { type: 'box', size: [2, 50, 36] }, at: [x, 40, 172], fill: 'shade',
  })),
  // 显示屏：数码内容按步骤显隐，图标用指示灯
  { id: 'd-260', name: '显示屏：26.0', parent: 'panel', shape: { type: 'text', text: '26.0', size: 22 }, at: DISP, visible: false },
  { id: 'd-265', name: '显示屏：26.5', parent: 'panel', shape: { type: 'text', text: '26.5', size: 22 }, at: DISP, visible: false },
  { id: 'd-cl', name: '显示屏：CL（智清洁）', parent: 'panel', shape: { type: 'text', text: 'CL', size: 22 }, at: DISP, visible: false },
  { id: 'd-cf', name: '显示屏：CF（智控温）', parent: 'panel', shape: { type: 'text', text: 'CF', size: 22 }, at: DISP, visible: false },
  { id: 'd-hs', name: '显示屏：HS（化霜）', parent: 'panel', shape: { type: 'text', text: 'HS', size: 22 }, at: DISP, visible: false },
  { id: 'd-e', name: '显示屏：故障代码（示例 E1）', parent: 'panel', shape: { type: 'text', text: 'E1', size: 22 }, at: DISP, visible: false },
  { id: 'led-wifi', name: '网络连接图标', parent: 'panel', shape: { type: 'led', r: 3.5, color: COLOR.blue }, at: [DISP[0] - 62, DISP[1] + 14, DISP[2]] },
  { id: 'led-eco', name: '酷省电图标', parent: 'panel', shape: { type: 'led', r: 3.5, color: COLOR.green }, at: [DISP[0] - 62, DISP[1], DISP[2]] },
  { id: 'led-heat', name: '电辅热图标', parent: 'panel', shape: { type: 'led', r: 3.5, color: COLOR.orange }, at: [DISP[0] - 62, DISP[1] - 14, DISP[2]] },
  { id: 'cloth', name: '拧干的湿布', shape: { type: 'box', size: [160, 110, 10], chamfer: 3 }, at: [-150, AC_AT[1] + 200, AC_AT[2] + D + 6], fill: 'warm', finish: { color: '#7fb2e5', roughness: 0.95 }, visible: false },
]

/** 遥控器正面（局部 y），按键贴在上面 */
const FACE = 10
/** 方向环中心（局部 z）：功能 / 定时 / ∧ / ∨ 是环上的四段，确定键在中间 */
const DPAD_Z = 4.6
type Key = { id: string; name: string; at: [number, number]; shape: Shape; y: number; finish?: SpecPart['finish'] }
const round = (r: number) => ({ shape: { type: 'cylinder', r, h: 1.4, axis: 'y' } as Shape, y: FACE + 0.7 })
const pill = (w: number, d: number, r = d / 2) => ({ shape: { type: 'slab', w, d, h: 1.2, r } as Shape, y: FACE })
/** 方向环的一段：deg 0 朝液晶屏（-z），90 朝右（+x），各占 82°，段间留缝 */
const arc = (deg: number) => {
  const pt = (a: number, r: number): [number, number] => [+(r * Math.sin((a * Math.PI) / 180)).toFixed(2), +(-r * Math.cos((a * Math.PI) / 180)).toFixed(2)]
  const span = Array.from({ length: 9 }, (_, i) => deg - 41 + (82 * i) / 8)
  return { shape: { type: 'poly', points: [...span.map((a) => pt(a, 12)), ...span.reverse().map((a) => pt(a, 6.2))], h: 1.2 } as Shape, y: FACE }
}
const ORANGE: SpecPart['finish'] = { color: '#f2a33a', roughness: 0.5 }
const GREEN: SpecPart['finish'] = { color: '#4cc38a', roughness: 0.5 }
// 位置、形状照 RN10L 官方正面图量（refs/remote-front.png，按遥控器宽 52 mm、长 150 mm 换算）
const KEYS: Key[] = [
  { id: 'k-power', name: '⏻ 开关键', at: [-14, -13.6], ...round(4.2), finish: ORANGE },
  { id: 'k-mode', name: '模式键', at: [0, -13.8], ...pill(9, 6.5, 2.2) },
  { id: 'k-eco', name: '酷省电键', at: [14, -13.6], ...round(4.2), finish: GREEN },
  { id: 'k-up', name: '∧ 键', at: [0, DPAD_Z], ...arc(0) },
  { id: 'k-timer', name: '定时键', at: [0, DPAD_Z], ...arc(90) },
  { id: 'k-down', name: '∨ 键', at: [0, DPAD_Z], ...arc(180) },
  { id: 'k-func', name: '功能键', at: [0, DPAD_Z], ...arc(270) },
  { id: 'k-ok', name: '确定键', at: [0, DPAD_Z], ...round(5) },
  { id: 'k-fan', name: '风速键', at: [-14, 22.8], ...round(4) },
  { id: 'k-vswing', name: '上下风键', at: [0, 22.8], ...round(4) },
  { id: 'k-hswing', name: '左右风键', at: [14, 22.8], ...round(4) },
  { id: 'k-nodirect', name: '防直吹键', at: [-14, 30.5], ...pill(12.5, 4.6) },
  { id: 'k-disp', name: '屏显键', at: [0, 30.5], ...pill(12.5, 4.6) },
  { id: 'k-heat', name: '电辅热键', at: [14, 30.5], ...pill(12.5, 4.6) },
]

const BAT_AT: Vec3[] = [[-6.5, -3.5, 37], [6.5, -3.5, 37]]
const COVER_AT: Vec3 = [0, -9.25, 38.5]

const remote: SpecPart[] = [
  {
    id: 'remote', name: '遥控器', spec: '对准室内机信号接收窗，8 米范围内',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [52, 9, 150], chamfer: 3, at: [0, 5.5, 0] },
        { type: 'box', size: [52, 11, 75], chamfer: 3, at: [0, -4.5, -37.5] },
        { type: 'box', size: [3, 11, 75], at: [-24.5, -4.5, 37.5] },
        { type: 'box', size: [3, 11, 75], at: [24.5, -4.5, 37.5] },
        { type: 'box', size: [52, 11, 2], at: [0, -4.5, 74] },
      ],
    },
    at: REMOTE_AT, rot: REMOTE_ROT,
  },
  { id: 'lcd', name: '遥控器液晶', parent: 'remote', shape: { type: 'screen', w: 35, h: 38 }, at: [0, FACE + 0.2, -45.5], rot: [-90, 0, 0] },
  ...KEYS.map((k): SpecPart => ({
    id: k.id, name: k.name, parent: 'remote', shape: k.shape, at: [k.at[0], k.y, k.at[1]], ...(k.finish ? { finish: k.finish } : {}),
  })),
  { id: 'cover', name: '电池后盖', spec: '按住扣手位朝尾部推开', parent: 'remote', shape: { type: 'box', size: [46, 1.5, 73], chamfer: 0.6 }, at: COVER_AT },
  ...BAT_AT.map((at, i): SpecPart => ({
    id: `bat-${i + 1}`, name: '7 号电池', spec: 'AAA · 1.5 V', parent: 'remote', shape: { type: 'cylinder', r: 5.25, h: 44.5, axis: 'z' }, at, fill: 'shade', finish: { color: '#3a3f47', roughness: 0.4, metalness: 0.3 },
  })),
  { id: 'phone', name: '手机', shape: { type: 'box', size: [72, 150, 8], chamfer: 6 }, at: [-380, 1700, 700], rot: [0, 15, 0], finish: 'plastic-black', visible: false },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 64, h: 136 }, at: [0, 0, 4.2] },
]

const parts: SpecPart[] = [...room, ...indoor, ...remote]

// ---------- 状态 ----------

const INITIAL: Record<string, PartState> = {
  plug: { plug: 'socket' },
  lcd: { ui: LCD_OFF },
  'led-wifi': { light: 'off' },
  'led-eco': { light: 'off' },
  'led-heat': { light: 'off' },
}

/** 制冷运行中：导风板打开、显示 26.0 */
const RUNNING: Record<string, PartState> = {
  vane: { rot: [-45, 0, 0] },
  'd-260': { visible: true },
  lcd: { ui: lcd('制冷 26.0℃', { text: '风速', sub: 'Au' }) },
}

// ---------- 镜头 ----------

const AC_VIEW: CameraSpec = { target: [0, 2430, 150], dir: [0.45, -0.15, 1], dist: 1700 }
const AC_LOW: CameraSpec = { target: [0, 2360, 220], dir: [0.35, -0.5, 1], dist: 1250 }
const PANEL_UP: CameraSpec = { target: [0, 2400, 330], dir: [0.45, 0.35, 1], dist: 1900 }
const SCENE: CameraSpec = { target: [150, 2080, 380], dir: [0.6, 0.05, 1], dist: 2700 }
const AC_PLUG: CameraSpec = { target: [280, 2340, 160], dir: [0.3, -0.25, 1], dist: 2000 }
const REMOTE_V: CameraSpec = { target: 'remote', dir: [0.12, 0.64, 0.77], dist: 360 }
const PLUG_VIEW: CameraSpec = { target: [600, 2200, 120], dir: [0.3, -0.05, 1], dist: 950 }
const ROOM: CameraSpec = { target: [0, 1700, 300], dir: [0.45, 0.12, 1], dist: 4600 }
const PHONE_VIEW: CameraSpec = { target: 'phone', dir: [0.3, 0.12, 1], dist: 430 }

const zoomDisp = (caption: string, dist = 300) => ({ target: [DISP_W[0] - 25, DISP_W[1], DISP_W[2]] as Vec3, dir: [0.15, -0.1, 1] as Vec3, dist, caption })
/** 显示屏左侧的图标灯：以灯为目标，镜头往数码方向挪一点 */
const zoomLed = (led: string, caption: string) => ({ target: led, offset: [22, 0, 0] as Vec3, dir: [0.15, -0.1, 1] as Vec3, dist: 150, caption })
const B_VIEW: CameraSpec = { target: 'remote', offset: [10, -20, 25], dir: [0.12, 0.64, 0.77], dist: 470 }
const zoomKey = (key: string, caption: string, dist = 120) => ({ target: key, dir: [0.12, 0.64, 0.77] as Vec3, dist, caption })
const zoomVane = (caption: string) => ({ target: [0, 2335, 230] as Vec3, dir: [0.4, -0.6, 1] as Vec3, dist: 700, caption })

// ---------- 说明书 ----------

export const mideaAcKs1: ManualSpec = {
  id: 'midea-ac-ks1',
  name: '美的 酷省电 KFR-35GW/N8KS1-1 壁挂式空调',
  desc: '变频挂壁空调：遥控器操作、智清洁与联网、清洗滤尘网、故障代码',
  category: '空调',
  dims: { width: W, depth: D, height: H },
  source: {
    title: '使用安装说明书 · 变频分体挂壁式空调器（KFR-26GW/N8KS1-1、KFR-35GW/N8KS1-1，GKS1(BN8)-01）',
    url: 'https://dsdcp.smartmidea.net/mcsp/prod/20250211/69f8f9125d7744a4afc59794aa7abe3c.pdf',
    images: [],
  },
  package: [
    { name: '室内机', qty: 1, spec: 'KFR-35GW/N8KS1-1' },
    { name: '遥控器', qty: 1 },
    { name: '7 号电池', qty: 2 },
    { name: '连接管', qty: 1, spec: '1 套' },
    { name: '包扎带', qty: 1, spec: '1 卷' },
    { name: '密封胶泥', qty: 1, spec: '200 克' },
    { name: '排水管', qty: 1 },
    { name: '墙孔挡板', qty: 1 },
    { name: '安装板', qty: 1 },
    { name: '自攻螺钉', qty: 5 },
    { name: '塑料胀管', qty: 5 },
    { name: '排水接头 + 密封圈', qty: 1 },
    { name: '连接管防拆帽', qty: 2 },
    { name: '保温管', qty: 2 },
    { name: '使用安装说明书', qty: 1 },
  ],
  params: [
    { label: '制冷量', value: '3510 (150~5250) W' },
    { label: '制热量', value: '5010 (150~6790) W', note: '电辅热 850 W' },
    { label: '能效', value: 'APF 5.30（1 级）' },
    { label: '循环风量', value: '750 m³/h' },
    { label: '制冷剂', value: 'R32 / 720 g', note: '可燃制冷剂，须由专业人员安装、移机、维修' },
    { label: '室内机尺寸', value: '885 × 308 × 211 mm' },
    { label: '室外机尺寸', value: '765(820) × 555 × 303 mm' },
    { label: '电源', value: '220V~ 50Hz' },
    { label: '室内机噪声', value: '18–35–41 dB(A)' },
    { label: '适用面积', value: '制冷 15–23 m² · 制热 17–23 m²', note: '按房高 2.8 米计算' },
    { label: '使用条件', value: '制冷室外 18~43℃ · 制热室外 −7~24℃', note: 'T1 型' },
  ],
  parts,
  initial: INITIAL,
  stageSize: 1500,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 遥控器基本操作 =================
    {
      id: 'remote', title: '遥控器基本操作', kind: 'usage',
      start: {
        remote: { rot: REMOTE_FLIP },
        'bat-1': { parent: null, at: [500, 1470, 800], rot: [0, 0, 0] },
        'bat-2': { parent: null, at: [530, 1470, 800], rot: [0, 0, 0] },
        lcd: { ui: null },
      },
      steps: [
        {
          id: 'b-open', title: '按住扣手位，朝尾部推开后盖', page: 5,
          desc: '手指按住遥控器背部电池安装区的扣手位，朝箭头方向（遥控器尾部）轻推，打开电池后盖。',
          camera: B_VIEW,
          set: { cover: { at: [0, -9.25, 100], dur: 1.0 } },
          highlight: ['cover'],
          callouts: [{ part: 'cover', text: '电池后盖', sub: '朝尾部推开', offset: [60, 40, 0] }],
        },
        {
          id: 'b-insert', title: '装入两节 7 号电池，注意 + − 极', page: 5,
          desc: '把两节 7 号电池装进电池仓，确保电池的 + − 极与仓内标识一致。',
          camera: B_VIEW,
          set: {
            'bat-1': { parent: 'remote', at: BAT_AT[0], rot: [0, 0, 0], via: BAY_VIA, dur: 1.3 },
            'bat-2': { parent: 'remote', at: BAT_AT[1], rot: [0, 0, 0], via: BAY_VIA, delay: 0.5, dur: 1.3 },
          },
          highlight: ['bat-1', 'bat-2'],
          chips: [{ label: '7 号电池 × 2', sub: '随机附带' }, { label: '+ − 极', sub: '对准仓内标识' }],
        },
        {
          id: 'b-close', title: '装回后盖，翻回正面', page: 5,
          desc: '把后盖推回原位扣好，翻回遥控器正面，液晶显示各功能状态即电池装好。',
          tip: '发射符号不闪烁、电池符号显示或液晶模糊时，请更换新电池。',
          camera: B_VIEW,
          set: {
            cover: { at: COVER_AT, dur: 1.0 },
            remote: { rot: REMOTE_ROT, delay: 1.1, dur: 1.4, lift: 40 },
            lcd: { ui: LCD_OFF, delay: 2.5 },
          },
          highlight: ['lcd'],
        },
        {
          id: 'u-power', title: '对准室内机，按 ⏻ 开机', page: 6,
          desc: '在 8 米范围内把遥控器对准室内机的信号接收窗，按 ⏻ 键开机。导风板打开，显示屏亮起设定温度。',
          tip: '⏻ 键也可以清除已设定的定时、智清洁等功能。',
          camera: SCENE,
          set: { vane: { ...VANE_OPEN, delay: 0.8 }, 'd-260': { visible: true, delay: 0.8 }, lcd: { ui: lcd('制冷 26.0℃', { text: '风速', sub: 'Au' }), delay: 0.6 } },
          actions: [{ type: 'press', part: 'k-power', delay: 0.3 }],
          highlight: ['k-power', 'vane'],
          zoom: zoomKey('k-power', '⏻ 开关键（黄色）'),
          callouts: [{ part: 'indoor', text: '信号接收窗', sub: '显示屏处', at: [300, 230, 212], offset: [-300, -60, 0] }],
          chips: [{ label: '有效距离', sub: '8 米内' }],
        },
        {
          id: 'u-mode', title: '按「模式」选择运行模式', page: 6,
          desc: '依次按「模式」键，在自动、制冷、抽湿、制热、送风之间切换，遥控器液晶显示当前模式。这里选制冷。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('制冷 26.0℃', { text: '自动', state: 'muted' }, { text: '制冷', state: 'selected' }, { text: '抽湿 · 制热 · 送风', state: 'muted' }), delay: 0.5 } },
          actions: [{ type: 'press', part: 'k-mode', delay: 0.2 }],
          highlight: ['k-mode', 'lcd'],
          zoom: zoomDisp('室内机显示屏：26.0'),
          chips: [{ label: '自动' }, { label: '制冷' }, { label: '抽湿' }, { label: '制热' }, { label: '送风' }],
        },
        {
          id: 'u-temp', title: '按 ∧ 把温度调到 26.5℃', page: 8,
          desc: '自动、制冷、抽湿、制热模式下按 ∧ ∨ 调节设定温度，按一次 0.5℃，长按每次 1℃。室内机显示屏从 26.0 变为 26.5。',
          tip: '送风模式下温度不可调。',
          camera: REMOTE_V,
          set: { ...swap('d-260', 'd-265'), lcd: { ui: lcd('制冷 26.5℃', { text: '风速', sub: 'Au' }), delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-up', delay: 0.2 }],
          highlight: ['k-up'],
          zoom: zoomDisp('显示屏：26.5'),
          chips: [{ label: '范围', sub: '16.0~30.0℃' }, { label: '按一次', sub: '0.5℃' }, { label: '长按', sub: '1℃' }],
        },
        {
          id: 'u-fan', title: '按「风速」切换风量', page: 9,
          desc: '按「风速」键粗调：Au（自动风）、20%、40%、60%、80%、100%；再按 ∧ ∨ 可在 1%~100% 之间细调。',
          tip: '制冷、制热模式下 100% 自动开启强劲；自动、抽湿模式下风速不可调。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('制冷 26.5℃', { text: '风速', sub: '60%', state: 'selected' }), delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-fan', delay: 0.2 }],
          highlight: ['k-fan', 'lcd'],
          zoom: zoomKey('k-fan', '风速：Au → 20% … 100%'),
          chips: [{ label: 'Au' }, { label: '20%' }, { label: '40%' }, { label: '60%' }, { label: '80%' }, { label: '100%' }],
        },
        {
          id: 'u-vswing', title: '按「上下风」调导风板角度', page: 9,
          desc: '间隔不超过 3 秒连续按「上下风」键：摇摆开启 → 角度 1 … 角度 5 → 摇摆关闭；间隔超过 3 秒按则开启 / 关闭摆风。',
          camera: AC_LOW,
          set: { vane: VANE_SWING },
          actions: [{ type: 'press', part: 'k-vswing' }],
          highlight: ['vane'],
          zoom: zoomKey('k-vswing', '上下风键'),
          callouts: [{ part: 'vane', text: '上下风向导风板', at: [-300, -28, 0], offset: [60, -80, 0] }],
        },
        {
          id: 'u-hswing', title: '按「左右风」摆动左右导风板', page: 9,
          desc: '「左右风」键用法与上下风相同：连续按依次选择摇摆和角度 1–5，间隔超过 3 秒按开启 / 关闭左右摆风。内侧的左右风向导风板随之转动。',
          camera: AC_LOW,
          set: blades(28),
          actions: [{ type: 'press', part: 'k-hswing' }],
          highlight: BLADE_IDS,
          zoom: zoomKey('k-hswing', '左右风键'),
          callouts: [{ part: 'blade-2', text: '左右风向导风板（内侧）', offset: [-60, -110, 0] }],
        },
        {
          id: 'u-nodirect', title: '按「防直吹」，导风板转平', page: 6,
          desc: '制冷、抽湿、送风模式下按「防直吹」键开启 / 关闭防直吹。开启后空调自动调整导风板角度和风速，冷风不直吹人。',
          camera: AC_LOW,
          set: { vane: VANE_FLAT, ...blades(0) },
          actions: [{ type: 'press', part: 'k-nodirect' }],
          highlight: ['vane'],
          zoom: zoomKey('k-nodirect', '防直吹键'),
        },
        {
          id: 'u-eco', title: '按「酷省电」，图标亮起', page: 6,
          desc: '关机或制冷模式下按「酷省电」键开启 / 关闭，空调进入宽温域省电模式，室内机显示屏的酷省电图标亮起。',
          camera: REMOTE_V,
          set: { 'led-eco': { light: 'on', color: COLOR.green, delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-eco', delay: 0.2 }],
          highlight: ['k-eco'],
          zoom: zoomLed('led-eco', '酷省电图标亮起'),
        },
        {
          id: 'u-disp', title: '按「屏显」关闭显示屏', page: 6,
          desc: '按「屏显」键关闭室内机显示屏，再按一次重新打开。夜间不想被灯光打扰时使用；室内灯光熄灭后显示屏也会随光敏功能自动熄灭。',
          camera: REMOTE_V,
          set: { ...swap('d-265'), 'led-eco': { light: 'off', delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-disp', delay: 0.2 }],
          highlight: ['k-disp'],
          zoom: zoomDisp('显示屏熄灭（空调仍在运行）'),
        },
        {
          id: 'u-off', title: '按 ⏻ 关机，导风板合上', page: 6,
          desc: '再按 ⏻ 键关机，导风板自动闭合。',
          tip: '禁止用电源开关直接关空调。',
          camera: SCENE,
          set: { vane: { ...VANE_CLOSED, delay: 0.6 }, lcd: { ui: LCD_OFF, delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-power', delay: 0.2 }],
          highlight: ['k-power', 'vane'],
          zoom: zoomKey('k-power', '⏻ 关机'),
        },
      ],
    },

    // ================= 智能功能与联网 =================
    {
      id: 'smart', title: '智清洁、定时与联网', kind: 'usage',
      start: RUNNING,
      steps: [
        {
          id: 's-clean', title: '功能 → 选智清洁 → 确定，显示「CL」', page: 7,
          desc: '按「功能」键，用 ∧ ∨ 选中智清洁，再按「确定」。室内机显示屏显示「CL」，清洁内部蒸发器，运行 20–130 分钟后自动退出并关机。',
          tip: '高温清洁阶段请勿靠近出风口；智清洁只清洁内部蒸发器，滤尘网仍需手动清洗。',
          camera: REMOTE_V,
          set: { ...swap('d-260', 'd-cl', 0.9), lcd: { ui: lcd('功能', { text: '智清洁', state: 'selected' }, { text: '智控温 · 防霉 · 睡眠', state: 'muted' }), delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-func', delay: 0.2 }, { type: 'press', part: 'k-ok', delay: 0.9 }],
          highlight: ['k-func', 'k-ok'],
          zoom: zoomDisp('显示屏「CL」= 智清洁中'),
          chips: [{ label: '时长', sub: '20–130 分钟' }, { label: '结束', sub: '自动关机' }],
        },
        {
          id: 's-cf', title: '制冷时选智控温，显示「CF」', page: 7,
          desc: '制冷模式下按「功能」，用 ∧ ∨ 选中智控温，按「确定」。显示屏显示「CF」，空调自动调整设定温度。',
          camera: REMOTE_V,
          set: { ...swap('d-cl', 'd-cf', 0.9), lcd: { ui: lcd('功能', { text: '智控温', state: 'selected' }, { text: '智清洁 · 防霉 · 睡眠', state: 'muted' }), delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-func', delay: 0.2 }, { type: 'press', part: 'k-ok', delay: 0.9 }],
          highlight: ['k-func', 'k-ok'],
          zoom: zoomDisp('显示屏「CF」= 智控温'),
          chips: [{ label: '睡眠', sub: '8 小时后退出' }, { label: '防霉', sub: '关机后自动运行' }],
        },
        {
          id: 's-timer', title: '按「定时」，∧ ∨ 设小时数', page: 8,
          desc: '按「定时」键，定时图标和时间点亮，按 ∧ ∨ 设定小时数，空调「叮」一声即设置成功。调为 0 或长按「定时」2 秒取消。',
          tip: '定时开机须在关机状态下设置、定时关机须在开机状态下设置；断电后定时自动取消。',
          camera: REMOTE_V,
          set: { ...swap('d-cf', 'd-260'), lcd: { ui: lcd('定时关机', { text: '2 小时', state: 'selected' }, { text: '0–12 小时', state: 'muted' }), delay: 0.4 } },
          actions: [{ type: 'press', part: 'k-timer', delay: 0.2 }, { type: 'press', part: 'k-up', delay: 0.9 }],
          highlight: ['k-timer', 'k-up'],
          zoom: zoomKey('k-timer', '定时键 + ∧ ∨'),
          chips: [{ label: '范围', sub: '0–12 小时' }, { label: '取消', sub: '调为 0 或长按 2 秒' }],
        },
        {
          id: 's-heat', title: '制热时按「电辅热」，图标亮起', page: 9,
          desc: '制热模式（或自动模式制热运行）下按「电辅热」键，循环切换：关闭电辅热 → 开启电辅热 → 自动电辅热；设置有记忆。开启后显示屏电辅热图标亮起。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('制热 26.0℃', { text: '电辅热', sub: '开启', state: 'selected' }), delay: 0.4 }, 'led-heat': { light: 'on', color: COLOR.orange, delay: 0.5 } },
          actions: [{ type: 'press', part: 'k-heat', delay: 0.2 }],
          highlight: ['k-heat'],
          zoom: zoomLed('led-heat', '电辅热图标亮起'),
          chips: [{ label: '电辅热功率', sub: '850 W' }],
        },
        {
          id: 's-lock', title: '同时长按「防直吹」+「电辅热」3 秒：童锁', page: 9,
          desc: '同时长按「防直吹」和「电辅热」键 3 秒开启童锁，遥控器按键被锁定；再同时长按 2 秒关闭。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('童锁', { text: '已锁定', state: 'selected' }, { text: '再同时长按 2 秒解锁', state: 'muted' }), delay: 1.0 }, 'led-heat': { light: 'off' } },
          actions: [{ type: 'press', part: 'k-nodirect', delay: 0.2 }, { type: 'press', part: 'k-heat', delay: 0.2 }],
          highlight: ['k-nodirect', 'k-heat'],
          zoom: zoomKey('k-disp', '防直吹 + 电辅热 同时长按', 140),
          chips: [{ label: '开启', sub: '长按 3 秒' }, { label: '关闭', sub: '长按 2 秒' }],
        },
        {
          id: 's-net', title: '功能 → 选网络图标 → 确定', page: 8,
          desc: '按「功能」键，用 ∧ ∨ 选中网络图标，再按「确定」开启空调的网络连接，显示屏网络图标亮起。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('功能', { text: '网络连接', state: 'selected' }), delay: 0.4 }, 'led-wifi': { light: 'blink', color: COLOR.blue, delay: 1.0 } },
          actions: [{ type: 'press', part: 'k-func', delay: 0.2 }, { type: 'press', part: 'k-ok', delay: 0.9 }],
          highlight: ['k-func', 'k-ok'],
          zoom: zoomLed('led-wifi', '网络图标亮起'),
        },
        {
          id: 's-app', title: '下载「美的美居」App 并登录', page: 11,
          desc: '扫描说明书上的二维码或在应用市场搜索「美的美居」，下载安装后打开，完成帐号注册登录。',
          camera: PHONE_VIEW,
          set: {
            phone: { visible: true },
            'phone-screen': { ui: { app: '应用市场', title: '搜索「美的美居」', items: [{ text: '美的美居', sub: '安装', state: 'selected' }], button: '打开', buttonActive: true } },
          },
          highlight: ['phone-screen'],
        },
        {
          id: 's-add', title: '点「+」，扫机身二维码添加设备', page: 11,
          desc: '在 App 主界面点击「+」，扫描家电机身二维码或选择品类型号，进入添加设备向导。',
          camera: PHONE_VIEW,
          set: { 'phone-screen': { ui: { app: '美的美居', title: '添加设备', items: [{ text: '扫描机身二维码', state: 'selected' }, { text: '空调 · KFR-35GW/N8KS1-1', state: 'normal' }] } } },
          highlight: ['phone-screen'],
        },
        {
          id: 's-wifi', title: '按向导连接 2.4GHz 网络', page: 11,
          desc: '根据 App 向导提示为空调连接家里的无线网络，添加成功后显示屏网络图标常亮。',
          tip: '仅支持 2.4GHz；网络名称不建议含中文或特殊字符；同一路由器建议不超过 10 个设备；更改路由器名称或密码后需重新联网。',
          camera: { target: [-100, 2100, 450], dir: [0.3, 0.05, 1], dist: 1900 },
          set: {
            'phone-screen': { ui: { app: '美的美居', title: '我的家', items: [{ text: '空调 KFR-35GW', sub: '已连接', state: 'done' }], toast: '添加成功' } },
            'led-wifi': { light: 'on', color: COLOR.blue, delay: 0.6 },
          },
          highlight: ['phone-screen'],
          zoom: zoomLed('led-wifi', '网络图标常亮 = 已联网'),
        },
      ],
    },

    // ================= 清洗滤尘网 =================
    {
      id: 'filter', title: '清洗滤尘网', kind: 'usage',
      start: RUNNING,
      steps: [
        {
          id: 'c-off', title: '停止运行，断开电源', page: 16,
          desc: '清洁前务必先用遥控器关机，再拔下电源插头（或断开空气开关）。',
          tip: '装卸面板、滤尘网时勿站在不稳定的台面上；打开面板时切勿触碰内部金属部位。',
          camera: PLUG_VIEW,
          set: { vane: VANE_CLOSED, ...swap('d-260'), lcd: { ui: LCD_OFF }, plug: { ...PLUG_OUT, delay: 1.2 } },
          highlight: ['plug'],
          callouts: [{ part: 'plug', text: '拔下电源插头', offset: [-130, 30, 0] }],
        },
        {
          id: 'c-wipe', title: '湿布拧干，轻拭机身表面', page: 16,
          desc: '把洁布在清水中洗净、拧干后轻拭机身表面；特别脏时可用布蘸中性清洁剂的水溶液擦拭。',
          tip: '勿用挥发油、酒精、稀释剂、漆等清洁；禁止用水冲淋空调。',
          camera: AC_VIEW,
          set: { cloth: { visible: true } },
          actions: [{ type: 'shake', part: 'cloth', axis: 'x', amp: 120 }],
          highlight: ['cloth'],
        },
        {
          id: 'c-open', title: '按住两侧按键，掀起面板 75° 以上', page: 16,
          desc: '同时向内按压左、右两侧的面板按键，双手抓住面板两端，按箭头方向向上打开面板 75 度以上，把面板卡住。',
          camera: PANEL_UP,
          set: { cloth: { at: [-150, 2500, 520], visible: false, dur: 0.8 }, panel: { ...PANEL_OPEN, delay: 1.0 } },
          actions: [{ type: 'press', part: 'btn-l', depth: 1.2 }, { type: 'press', part: 'btn-r', depth: 1.2 }],
          highlight: ['panel', 'btn-r'],
          callouts: [{ part: 'btn-r', text: '两侧面板按键', sub: '左右各一，同时向内按', offset: [-120, 60, 0] }],
          chips: [{ label: '打开角度', sub: '≥ 75°' }],
        },
        {
          id: 'c-pull', title: '抬起滤网中间凸部，向下拉出', page: 16,
          desc: '把左右两片滤尘网中间的凸部稍微抬起，再向下拉出。',
          camera: PANEL_UP,
          set: {
            'filter-l': { parent: null, at: [-260, 2150, 600], rot: [0, 0, 0], via: [-239, 2400, 500], dur: 1.6 },
            'filter-r': { parent: null, at: [260, 2150, 600], rot: [0, 0, 0], via: [239, 2400, 500], delay: 0.4, dur: 1.6 },
          },
          highlight: ['filter-l', 'filter-r'],
        },
        {
          id: 'c-wash', title: '清洗干净，放在阴凉处晾干', page: 16,
          desc: '用清水把滤尘网冲洗干净，放置在阴凉处自然晾干。',
          tip: '建议每月清洁 1 次滤尘网；滤网积尘会导致异响、异味。',
          camera: { target: [0, 2200, 550], dir: [0.4, 0.3, 1], dist: 1500 },
          actions: [{ type: 'shake', part: 'filter-l', axis: 'y', amp: 12 }, { type: 'shake', part: 'filter-r', axis: 'y', amp: 12 }],
          highlight: ['filter-l', 'filter-r'],
          chips: [{ label: '清水冲洗' }, { label: '阴凉处晾干', sub: '勿暴晒' }, { label: '每月 1 次' }],
        },
        {
          id: 'c-insert', title: '装好滤尘网', page: 16,
          desc: '滤尘网完全晾干后，按原位推回左右两侧。',
          camera: PANEL_UP,
          set: {
            'filter-l': { parent: 'indoor', at: [-215, 190, 199], rot: [0, 0, 0], via: [-239, 2400, 500], dur: 1.6 },
            'filter-r': { parent: 'indoor', at: [215, 190, 199], rot: [0, 0, 0], via: [239, 2400, 500], delay: 0.4, dur: 1.6 },
          },
          highlight: ['filter-l', 'filter-r'],
        },
        {
          id: 'c-close', title: '合上面板，轻压至完全扣合', page: 16,
          desc: '合上面板，轻轻压一下面板，直到面板与空调主体完全扣合。',
          tip: '面板没关严运行时会有啸叫声。',
          camera: AC_VIEW,
          set: { panel: PANEL_CLOSED },
          actions: [{ type: 'press', part: 'panel', depth: 2, delay: 1.5 }],
          highlight: ['panel'],
        },
        {
          id: 'c-power', title: '插上电源，开机检验', page: 16,
          desc: '插回电源插头，用遥控器开机检验运行正常。',
          camera: SCENE,
          set: {
            plug: { plug: { hole: 'socket', back: 60 }, dur: 1.2 },
            vane: { ...VANE_OPEN, delay: 1.8 },
            'd-260': { visible: true, delay: 1.8 },
            lcd: { ui: lcd('制冷 26.0℃', { text: '风速', sub: 'Au' }), delay: 1.6 },
          },
          actions: [{ type: 'press', part: 'k-power', delay: 1.4 }],
          highlight: ['plug', 'vane'],
          zoom: zoomDisp('显示屏亮起 = 运行正常'),
        },
      ],
    },

    // ================= 故障与保养 =================
    {
      id: 'repair', title: '故障代码与常见现象', kind: 'repair',
      start: RUNNING,
      steps: [
        {
          id: 'e-code', title: '显示故障代码：关机并关闭电源', page: 13,
          desc: '显示屏显示 E(x)、E(xx)、F(x)、P(x)、EH(xx)、EL(xx)、EC(xx)、PH(xx)、PL(xx)、PC(xx) 等代码时，先关机并关闭电源。',
          camera: AC_PLUG,
          set: { ...swap('d-260', 'd-e'), vane: { ...VANE_CLOSED, delay: 1.0 }, plug: { ...PLUG_OUT, delay: 1.6 } },
          highlight: ['d-e', 'plug'],
          zoom: zoomDisp('显示代码（示例 E1）'),
        },
        {
          id: 'e-retry', title: '10 分钟后上电开机', page: 13,
          desc: '等待 10 分钟后打开电源并开机。不再显示代码即可继续使用；仍然显示代码，请关机断电并联系检修。',
          camera: SCENE,
          set: {
            'd-e': { visible: false },
            plug: { plug: { hole: 'socket', back: 60 }, dur: 1.2 },
            vane: { ...VANE_OPEN, delay: 1.8 },
            'd-260': { visible: true, delay: 1.8 },
          },
          actions: [{ type: 'press', part: 'k-power', delay: 1.4 }],
          highlight: ['plug'],
          zoom: zoomDisp('不再显示代码 = 可继续使用'),
          chips: [{ label: '等待', sub: '10 分钟' }, { label: '服务热线', sub: '400-8899-315' }],
        },
        {
          id: 'e-hs', title: '显示「HS」：制热化霜，正常', page: 14,
          desc: '制热时开机一段时间后停机、显示屏显示「HS」，是室外机在化霜，属正常现象，化霜结束后自动恢复。显示灯一直亮可按「屏显」键关闭。',
          camera: AC_VIEW,
          set: { ...swap('d-260', 'd-hs'), vane: VANE_CLOSED },
          highlight: ['d-hs'],
          zoom: zoomDisp('「HS」= 化霜'),
        },
        {
          id: 'e-nopower', title: '无法运行：检查插头和空气开关', page: 14,
          desc: '空调无法运行时，检查电源插头是否插接到位、空气开关是否合上。',
          tip: '制热开机无反应时可能是防冷风，等待 3–5 分钟。',
          camera: PLUG_VIEW,
          set: swap('d-hs'),
          actions: [{ type: 'shake', part: 'plug', axis: 'x', amp: 3 }],
          highlight: ['plug'],
          callouts: [{ part: 'plug', text: '插头插到位？', offset: [-130, 30, 0] }],
        },
        {
          id: 'e-vane', title: '导风板不闭合：断电 10 秒后重启', page: 15,
          desc: '导风板不闭合时，关机并关闭电源，10 秒钟后重新上电开机，导风板会自动复位闭合。左右不对齐可轻力左右移动。',
          camera: AC_PLUG,
          set: {
            vane: { rot: [-30, 0, 0] },
            plug: PLUG_OUT,
          },
          highlight: ['vane', 'plug'],
          zoom: zoomVane('导风板没有合上'),
        },
        {
          id: 'e-vane-ok', title: '重新上电，导风板自动闭合', page: 15,
          desc: '重新插上电源后，导风板自动复位闭合。',
          camera: AC_PLUG,
          set: { plug: { plug: { hole: 'socket', back: 60 }, dur: 1.2 }, vane: { ...VANE_CLOSED, delay: 1.4 } },
          highlight: ['vane', 'plug'],
          zoom: zoomVane('导风板闭合'),
        },
        {
          id: 'e-remote', title: '遥控器无法使用：电池、童锁', page: 14,
          desc: '遥控器没反应时：检查电池是否装反或电量不足；是否开启了童锁（同时长按「防直吹」+「电辅热」2 秒解锁）；某些模式下部分按键不可调。',
          camera: REMOTE_V,
          set: { lcd: { ui: lcd('童锁', { text: '同时长按 2 秒解锁', state: 'selected' }) } },
          actions: [{ type: 'press', part: 'k-nodirect' }, { type: 'press', part: 'k-heat' }],
          highlight: ['k-nodirect', 'k-heat', 'lcd'],
          zoom: zoomKey('k-disp', '防直吹 + 电辅热：解锁', 140),
        },
        {
          id: 'e-store', title: '长时间不用：取出电池，断开电源', page: 16,
          desc: '换季长时间不使用时，取出遥控器电池并断开电源。再次使用前清洁机身和滤尘网、检查进出风口无障碍、排水管通畅，装上电池通电检验。',
          camera: SCENE,
          set: {
            remote: { rot: REMOTE_FLIP, lift: 40, dur: 1.4 },
            cover: { at: [0, -9.25, 100], delay: 1.5, dur: 0.8 },
            'bat-1': { parent: null, at: [500, 1470, 800], rot: [0, 0, 0], via: BAY_VIA, delay: 2.4, dur: 1.2 },
            'bat-2': { parent: null, at: [530, 1470, 800], rot: [0, 0, 0], via: BAY_VIA, delay: 2.7, dur: 1.2 },
            lcd: { ui: null, delay: 2.4 },
            plug: { ...PLUG_OUT, delay: 3.0 },
          },
          highlight: ['plug'],
          zoom: { target: 'remote', dir: [0.12, 0.64, 0.77], dist: 260, caption: '取出两节 7 号电池' },
        },
      ],
    },

    // ================= 安装空间 =================
    {
      id: 'install', title: '安装空间要求（须专业安装）', kind: 'assembly',
      start: { ceiling: { visible: true } },
      steps: [
        {
          id: 'i-space', title: '室内机四周预留空间', page: 22,
          desc: '室内机与天花板距离 15 cm 以上，与两侧墙壁距离 12 cm 以上，与地板距离 230 cm 以上（安装高度 230–260 cm），由专用电源分支线路供电。',
          tip: '本机使用 R32 可燃制冷剂，必须由专业人员安装、移装和维修，请勿自行安装。',
          camera: ROOM,
          highlight: ['indoor'],
          callouts: [
            { part: 'indoor', text: '天花板 ≥ 15 cm', at: [0, H, 100], offset: [0, 120, 0] },
            { part: 'indoor', text: '两侧 ≥ 12 cm', at: [-W / 2, 150, 100], offset: [-260, 0, 0] },
            { part: 'indoor', text: '离地 ≥ 230 cm', at: [0, 0, 100], offset: [0, -700, 0] },
            { part: 'socket', text: '专用电源', offset: [200, -120, 0] },
          ],
          chips: [{ label: '天花板', sub: '≥ 15 cm' }, { label: '两侧', sub: '≥ 12 cm' }, { label: '地板', sub: '≥ 230 cm' }],
        },
        {
          id: 'i-check', title: '使用条件与雷雨天断电', page: 18,
          desc: '空调为 T1 型：制冷时室外温度 18~43℃，制热时 −7~24℃。雷雨天气请断开电源；室内机安装高度 230–260 cm。',
          tip: '必须由专业人员安装或移装。',
          camera: AC_PLUG,
          set: { ceiling: { visible: false }, plug: PLUG_OUT },
          highlight: ['plug'],
          chips: [{ label: '制冷', sub: '室外 18~43℃' }, { label: '制热', sub: '室外 −7~24℃' }],
        },
      ],
    },
  ],
}
