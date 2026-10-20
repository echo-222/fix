import type { CameraSpec, ManualSpec, PartState, ScreenUI, SpecPart, SpecStep, Vec3 } from '../types'

/**
 * 蓝牙无线鼠标（BT5.4 + 2.4G 双模，USB-A / Type-C 双接收器）
 * 说明书 5 页：P1 包装与参数，P2 顶部功能，P3 底部 + USB-A 连接，P4 Type-C / 蓝牙 / 注意事项，P5 排查 + 充电
 *
 * 场景：桌面 y=0，笔记本在中间（底座中心 z=-40），鼠标在右侧。
 * 鼠标局部坐标：前端（滚轮方向）为 -z，左键在 -x；底面 y=0。
 * 翻面（绕 z 轴 180°）后从后上方看底面，画面左侧 = 鼠标局部 +x，与说明书第 3 页底视图一致。
 */

// ---------- 尺寸 ----------
const M = { w: 55, l: 115, h: 22 }
const BASE_Z = -40
/** 笔记本左侧接口（底座局部坐标） */
const PORT = { x: -160, y: 7, c: -75, a1: -50, a2: -25 }
const portWorld = (z: number): Vec3 => [PORT.x, PORT.y, BASE_Z + z]

// ---------- 鼠标姿态 ----------
const HOME: PartState = { parent: null, at: [250, 0, 30], rot: [0, 0, 0] }
const FLIP: PartState = { parent: null, at: [250, M.h, 30], rot: [0, 0, 180], lift: 45, dur: 1.4 }
const NEAR: PartState = { parent: null, at: [-235, 0, -40], rot: [0, -60, 0], lift: 45, dur: 1.6 }

// ---------- 开关位置（鼠标局部） ----------
const MODE = { y: -0.8, z: -31, bt: 7.5, g24: 0.5 }
const POWER = { y: -0.8, z: -14, off: -15.5, on: -10.5 }
const modeAt = (x: number): PartState => ({ at: [x, MODE.y, MODE.z], dur: 0.5 })
const powerAt = (x: number): PartState => ({ at: [x, POWER.y, POWER.z], dur: 0.5 })

// ---------- 颜色 ----------
const YELLOW = '#f5b400'
const BLUE = '#2f7bf5'
const RED = '#ff3b30'
const GREEN = '#22b04b'

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [20, 60, -30], dir: [0.35, 0.6, 1], dist: 1250 }
const MOUSE_TOP: CameraSpec = { target: 'mouse', offset: [0, 12, -12], dir: [0.7, 0.85, 0.9], dist: 320 }
const MOUSE_BOTTOM: CameraSpec = { target: 'mouse', offset: [0, 0, 0], dir: [0.12, 1.25, 0.7], dist: 320 }
const PORTS: CameraSpec = { target: portWorld(PORT.a1), offset: [-30, 10, 10], dir: [-0.75, 0.6, 1], dist: 440 }
const SCREEN: CameraSpec = { target: 'screen', offset: [0, -6, 0], dir: [0.12, 0.32, 1], dist: 560 }
const NEAR_VIEW: CameraSpec = { target: [-200, 10, -60], dir: [-0.35, 0.75, 1], dist: 540 }
const USE_VIEW: CameraSpec = { target: [110, 60, -50], dir: [0.3, 0.55, 1], dist: 1000 }
const zoomBottom = (target: string, caption: string) => ({ target, dir: [0.1, 1, 0.35] as Vec3, dist: 70, caption })
const zoomPort = (z: number, caption: string) => ({ target: portWorld(z), offset: [-6, 0, 0] as Vec3, dir: [-0.6, 0.45, 1] as Vec3, dist: 120, caption })
const zoomUnder = { target: 'status-led', dir: 'under' as const, dist: 120, caption: '底部指示灯（从桌面下方看）' }

// ---------- 屏幕 ----------
const BT_SETTINGS: ScreenUI = {
  app: '设置', title: '蓝牙和其他设备',
  items: [{ text: '蓝牙', sub: '开' }, { text: '+ 添加蓝牙或其他设备', state: 'selected' }],
}
const BT_SEARCH: ScreenUI = {
  app: '添加设备', title: '正在搜索…',
  items: [
    { text: 'BT5.4 Mouse', sub: '鼠标', state: 'selected' },
    { text: 'Galaxy Buds', sub: '音频', state: 'muted' },
    { text: 'LE-Keyboard', sub: '键盘', state: 'muted' },
  ],
  button: '连接', buttonActive: true,
}
const BT_DONE: ScreenUI = {
  app: '设置', title: '蓝牙和其他设备',
  items: [{ text: '蓝牙', sub: '开' }, { text: 'BT5.4 Mouse', sub: '已连接', state: 'done' }],
  toast: 'BT5.4 Mouse 已连接', cursor: true,
}
const DESKTOP: ScreenUI = { cursor: true }
const NEW_DEVICE: ScreenUI = { ...DESKTOP, toast: '发现新设备 · USB Receiver' }

// ---------- 零件 ----------
const plugA = (bodyLen: number) => ({
  type: 'compound' as const,
  items: [
    { type: 'box' as const, size: [12, 4.5, 12] as Vec3, at: [6, 0, 0] as Vec3, fill: 'shade' as const },
    { type: 'box' as const, size: [bodyLen, 6, 13] as Vec3, chamfer: 1.2, at: [-bodyLen / 2, 0, 0] as Vec3 },
  ],
})
const plugC = (bodyLen: number, t = 5.5) => ({
  type: 'compound' as const,
  items: [
    { type: 'box' as const, size: [6.5, 2.6, 8.3] as Vec3, chamfer: 0.6, at: [3.25, 0, 0] as Vec3, fill: 'shade' as const },
    { type: 'box' as const, size: [bodyLen, t, 9] as Vec3, chamfer: 1.2, at: [-bodyLen / 2, 0, 0] as Vec3 },
  ],
})
const bottomRot: Vec3 = [90, 0, 0]
const textRot: Vec3 = [90, 0, 180]

const parts: SpecPart[] = [
  // 笔记本电脑（场景道具）
  { id: 'laptop', name: '笔记本电脑', shape: { type: 'slab', w: 320, d: 220, h: 14, r: 10 }, at: [0, 0, BASE_Z] },
  { id: 'keyboard', name: '键盘', parent: 'laptop', shape: { type: 'hole', w: 280, h: 105, r: 4 }, at: [0, 14, -40], rot: [-90, 0, 0] },
  { id: 'touchpad', name: '触控板', parent: 'laptop', shape: { type: 'hole', w: 100, h: 62, r: 5 }, at: [0, 14, 62], rot: [-90, 0, 0], fill: 'white' },
  { id: 'lid', name: '屏幕盖', parent: 'laptop', shape: { type: 'slab', w: 320, d: 215, h: 7, r: 10 }, pivot: [0, 0, 107.5], at: [0, 14, -110], rot: [-105, 0, 0] },
  { id: 'screen', name: '屏幕', parent: 'lid', shape: { type: 'screen', w: 290, h: 185 }, at: [0, -0.4, 108], rot: [90, 0, 0] },
  { id: 'port-lc', name: 'Type-C 口', parent: 'laptop', shape: { type: 'hole', w: 8.6, h: 3.2, r: 1.5 }, at: [PORT.x - 0.2, PORT.y, PORT.c], rot: [0, -90, 0], fill: 'dark' },
  { id: 'port-la1', name: 'USB 口 1', parent: 'laptop', shape: { type: 'hole', w: 12.5, h: 5, r: 0.8 }, at: [PORT.x - 0.2, PORT.y, PORT.a1], rot: [0, -90, 0], fill: 'dark' },
  { id: 'port-la2', name: 'USB 口 2', parent: 'laptop', shape: { type: 'hole', w: 12.5, h: 5, r: 0.8 }, at: [PORT.x - 0.2, PORT.y, PORT.a2], rot: [0, -90, 0], fill: 'dark' },

  // 鼠标本体
  {
    id: 'mouse', name: '蓝牙无线鼠标', spec: '115 × 55 × 22 mm',
    shape: {
      type: 'shell', w: M.w, l: M.l, h: M.h, base: 6, n: 2.4, taper: 0.15, peak: 0.25,
      seams: [
        [[0, -57.5], [0, -44]],
        [[0, -28], [0, -21]],
        [[0, -15], [0, 2]],
        [[-4.2, -44], [4.2, -44], [4.2, -28], [-4.2, -28], [-4.2, -44]],
        [[-2.3, -21], [2.3, -21], [2.3, -15], [-2.3, -15], [-2.3, -21]],
      ],
    },
    at: [250, 0, 30],
  },
  { id: 'wheel', name: '滚轮', spec: '滚动 / 翻页', parent: 'mouse', shape: { type: 'cylinder', r: 5.5, h: 4, axis: 'x' }, at: { on: [0, -36], dy: -2.5 } },
  { id: 'dpi', name: 'DPI 键', spec: '1000–3200 五档', parent: 'mouse', shape: { type: 'box', size: [3.4, 2, 5], chamfer: 0.8 }, at: { on: [0, -18], dy: 0.2 } },
  { id: 'charge-led', name: '充电指示灯', parent: 'mouse', shape: { type: 'led', r: 1.5, color: RED }, at: { on: [0, -24.5], dy: 0.15 }, rot: [-90, 0, 0] },
  { id: 'port-c', name: 'Type-C 充电口', parent: 'mouse', shape: { type: 'hole', w: 8.6, h: 3.2, r: 1.5 }, at: [0, 3.2, -57.6], rot: [0, 180, 0], fill: 'dark' },
  // 底面（朝 -y）
  { id: 'mode-slot', name: '模式开关槽', parent: 'mouse', shape: { type: 'hole', w: 12, h: 4, r: 1.6 }, at: [4, -0.05, MODE.z], rot: bottomRot, fill: 'dark' },
  { id: 'mode-knob', name: '蓝牙 / 2.4G 模式开关', parent: 'mouse', shape: { type: 'box', size: [3, 1.6, 3.4], chamfer: 0.5 }, at: [MODE.bt, MODE.y, MODE.z] },
  { id: 'mode-bt', name: 'BT', parent: 'mouse', shape: { type: 'text', text: 'BT', size: 2.6 }, at: [13.5, -0.1, MODE.z], rot: textRot },
  { id: 'mode-24', name: '2.4G', parent: 'mouse', shape: { type: 'text', text: '2.4G', size: 2.6 }, at: [-6.8, -0.1, MODE.z], rot: textRot },
  { id: 'power-slot', name: '电源开关槽', parent: 'mouse', shape: { type: 'hole', w: 9, h: 4, r: 1.6 }, at: [-13, -0.05, POWER.z], rot: bottomRot, fill: 'dark' },
  { id: 'power-knob', name: '电源开关', parent: 'mouse', shape: { type: 'box', size: [3, 1.6, 3.4], chamfer: 0.5 }, at: [POWER.off, POWER.y, POWER.z] },
  { id: 'power-off', name: 'OFF', parent: 'mouse', shape: { type: 'text', text: 'OFF', size: 2.2 }, at: [-21, -0.1, POWER.z], rot: textRot },
  { id: 'power-on', name: 'ON', parent: 'mouse', shape: { type: 'text', text: 'ON', size: 2.2 }, at: [-5.2, -0.1, POWER.z], rot: textRot },
  { id: 'sensor', name: '光学感应孔', parent: 'mouse', shape: { type: 'hole', w: 7, h: 4.6, r: 2.3 }, at: [0, -0.05, -2], rot: bottomRot, fill: 'dark' },
  { id: 'status-led', name: '底部指示灯', parent: 'mouse', shape: { type: 'led', r: 1.6, color: YELLOW }, at: [9, -0.05, -2], rot: bottomRot },
  { id: 'bay', name: '接收器收纳仓', parent: 'mouse', shape: { type: 'hole', w: 34, h: 36, r: 3 }, at: [0, -0.05, 28], rot: bottomRot },

  // 接收器：原点在插头与外壳交界处，插头朝 +x
  { id: 'recv-c', name: 'Type-C 接收器', spec: '2.4G', parent: 'mouse', shape: plugC(10), at: [-3, 1.75, 19] },
  { id: 'recv-a', name: 'USB-A 接收器', spec: '2.4G · 1.6 g', parent: 'mouse', shape: plugA(7), at: [-3, 2, 36] },

  // 充电线
  { id: 'cable-a', name: '充电线 USB 端', shape: plugA(18), at: [-30, 4, 190], rot: [0, -160, 0], visible: false },
  { id: 'cable-c', name: '充电线 Type-C 端', shape: plugC(14, 6), at: [-120, 3, 150], rot: [0, 25, 0], visible: false },
  {
    id: 'cable', name: 'USB 充电线',
    shape: { type: 'cable', from: { part: 'cable-a', at: [-18, 0, 0], dir: [-1, 0, 0] }, to: { part: 'cable-c', at: [-14, 0, 0], dir: [-1, 0, 0] }, r: 1.8, slack: 1.2 },
    visible: false,
  },

  // 说明书
  { id: 'booklet', name: '说明书', shape: { type: 'slab', w: 70, d: 100, h: 1.2, r: 2 }, at: [-200, 0, 150], rot: [0, 14, 0], fill: 'warm', visible: false },
  { id: 'booklet-title', name: '使用说明书', parent: 'booklet', shape: { type: 'text', text: '使用说明书', size: 7 }, at: [0, 1.35, -28], rot: [-90, 0, 0] },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))

// ---------- 2.4G 接收器通用步骤 ----------
function pairSteps(prefix: string, recv: 'recv-a' | 'recv-c', portZ: number, page: number): Record<'powerOn' | 'mode' | 'near' | 'use', SpecStep> {
  return {
    powerOn: {
      id: `${prefix}-power`, title: '打开鼠标电源开关', page,
      desc: '把鼠标底部的电源开关拨到 ON。',
      camera: MOUSE_BOTTOM,
      set: { 'power-knob': powerAt(POWER.on) },
      highlight: ['power-knob'],
      zoom: zoomBottom('power-knob', '电源开关拨到 ON'),
      chips: [{ label: '电源', sub: 'OFF → ON' }],
    },
    mode: {
      id: `${prefix}-mode`, title: '模式开关拨到 2.4G', page,
      desc: '把模式开关向右拨到 2.4G 位置（底视图中的右侧）。',
      camera: MOUSE_BOTTOM,
      set: { 'mode-knob': modeAt(MODE.g24) },
      highlight: ['mode-knob', 'mode-24'],
      zoom: zoomBottom('mode-knob', '向右拨到 2.4G'),
      chips: [{ label: '模式', sub: 'BT → 2.4G' }],
    },
    near: {
      id: `${prefix}-near`, title: '靠近接收器，等待黄灯熄灭', page,
      desc: '翻回鼠标，靠近刚插好的接收器。底部黄色指示灯闪烁几秒后熄灭，说明配对完成。',
      camera: NEAR_VIEW,
      set: { mouse: NEAR, 'status-led': { light: 'blinkThenOff', color: YELLOW, delay: 1.6 } },
      highlight: ['status-led', recv],
      zoom: zoomUnder,
      marker: portWorld(portZ),
      chips: [{ label: '黄灯', sub: '闪烁 → 熄灭' }],
      tip: '黄灯熄灭后即可使用；如果黄灯一直不亮，先给鼠标充电。',
    },
    use: {
      id: `${prefix}-use`, title: '开始使用', page,
      desc: '鼠标放回桌面即可正常使用，光标跟随移动。2.4G 无线接收距离 3–10 米。',
      camera: USE_VIEW,
      set: { mouse: { ...HOME, lift: 20, dur: 1.4 }, screen: { ui: DESKTOP } },
      actions: [{ type: 'glide' as const, part: 'mouse' }],
      highlight: ['mouse'],
      chips: [{ label: '距离', sub: '3–10 m' }],
    },
  }
}

const usbA = pairSteps('a', 'recv-a', PORT.a2, 3)
const typeC = pairSteps('c', 'recv-c', PORT.c, 4)

export const mouseBt54: ManualSpec = {
  id: 'mouse-bt54',
  name: '蓝牙无线鼠标',
  desc: 'BT5.4 + 2.4G 双模 · USB-A / Type-C 双接收器 · 充电式',
  category: '电子产品',
  dims: { width: M.w, depth: M.l, height: M.h },
  source: {
    title: '蓝牙无线鼠标使用说明书',
    images: [
      { src: '/manuals/mouse-bt54/p0-2.jpg', pages: '封面 · 第 1–2 页' },
      { src: '/manuals/mouse-bt54/p3-5.jpg', pages: '第 3–5 页' },
    ],
  },
  package: [
    { name: '蓝牙无线鼠标', qty: 1, spec: '115 × 55 × 22 mm · 57.7 g' },
    { name: 'USB-A 接收器', qty: 1, spec: '2.4G · 收纳在鼠标底部' },
    { name: 'Type-C 接收器', qty: 1, spec: '2.4G · 收纳在鼠标底部' },
    { name: 'USB 充电线', qty: 1, spec: 'USB-A → Type-C' },
    { name: '说明书', qty: 1 },
  ],
  params: [
    { label: '产品尺寸', value: '115 × 55 × 22 mm' },
    { label: '无线距离', value: '3–10 m', note: '蓝牙 / 2.4G' },
    { label: '产品重量', value: '57.7 g', note: '接收器 1.6 g' },
    { label: '工作电压', value: '2.7–4.2 V', note: '充电电压 ≤ 5 V' },
    { label: '电池', value: '450 mAh', note: '聚合物锂电池' },
    { label: 'DPI', value: '1000–3200', note: '1000 / 1200 / 1600 / 2400 / 3200 五档循环' },
    { label: '系统', value: 'Win 8/10/11 · Mac · Android · iOS 13' },
    { label: '硬件', value: 'USB / Type-C 口，或带蓝牙的电脑', note: 'Windows 需蓝牙 4.0 以上' },
  ],
  parts,
  initial: {
    'mode-knob': { at: [MODE.bt, MODE.y, MODE.z] },
    'power-knob': { at: [POWER.off, POWER.y, POWER.z] },
  },
  stageSize: 900,
  guides: [
    {
      id: 'usb-a', title: '2.4G 连接 · USB-A 接收器', kind: 'usage',
      start: show('booklet', 'cable', 'cable-a', 'cable-c'),
      steps: [
        {
          id: 'unbox', title: '清点包装', page: 1,
          desc: '包装内有：蓝牙无线鼠标、USB-A 接收器、Type-C 接收器、USB 充电线、说明书各 1 件。两个接收器收纳在鼠标底部。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'mouse', text: '蓝牙无线鼠标 ×1', sub: '内含 USB-A / Type-C 接收器', at: [0, 20, 0], offset: [40, 90, 0] },
            { part: 'cable-a', text: 'USB 充电线 ×1', offset: [30, 70, 20] },
            { part: 'booklet', text: '说明书 ×1', offset: [-30, 70, 20] },
          ],
          chips: [{ label: '包装', sub: '5 件' }],
        },
        {
          id: 'top', title: '认识顶部按键', page: 2,
          desc: '左右键、滚轮（兼翻页键）、DPI 调节键与充电指示灯。DPI 键在 1000 / 1200 / 1600 / 2400 / 3200 五档间循环切换。',
          camera: MOUSE_TOP,
          set: hide('booklet', 'cable', 'cable-a', 'cable-c'),
          highlight: ['wheel', 'dpi', 'charge-led'],
          actions: [{ type: 'spin', part: 'wheel', delay: 0.6 }, { type: 'press', part: 'dpi', delay: 1.2 }],
          callouts: [
            { part: 'wheel', text: '滚轮 · 翻页键', offset: [-30, 30, -20] },
            { part: 'dpi', text: 'DPI 键', sub: '1000–3200 五档循环', offset: [48, 30, -10] },
            { part: 'charge-led', text: '充电指示灯', offset: [48, 6, 24] },
            { part: 'mouse', text: '左键', at: [-14, 17, -32], offset: [-42, 10, 12] },
            { part: 'mouse', text: '右键', at: [14, 17, -32], offset: [26, -4, 46] },
          ],
        },
        {
          id: 'bottom', title: '翻到底部', page: 3,
          desc: '底部有 Type-C 充电口、蓝牙 / 2.4G 模式开关、电源开关、光学感应孔，以及收纳两个接收器的仓位。',
          camera: MOUSE_BOTTOM,
          set: { mouse: FLIP },
          callouts: [
            { part: 'port-c', text: 'Type-C 充电口', offset: [-34, 14, -16] },
            { part: 'mode-knob', text: '蓝牙 / 2.4G 模式开关', offset: [-50, 14, -6] },
            { part: 'power-knob', text: '电源开关', offset: [42, 14, -8] },
            { part: 'sensor', text: '光学感应孔', offset: [44, 8, 10] },
            { part: 'recv-c', text: 'Type-C 接收器', offset: [-46, 8, 0] },
            { part: 'recv-a', text: 'USB-A 接收器', offset: [-46, 4, 14] },
          ],
        },
        {
          id: 'take-a', title: '取出 USB-A 接收器', page: 3,
          desc: '从鼠标底部的收纳仓拔出 USB-A 接收器。',
          camera: { ...MOUSE_BOTTOM, offset: [-10, 10, 25], dist: 340 },
          set: { 'recv-a': { parent: null, at: [205, 42, 70], rot: [0, 0, 0], lift: 20, dur: 1.2 } },
          highlight: ['recv-a'],
        },
        {
          id: 'plug-a', title: '插入电脑 USB 口', page: 3,
          desc: '把 USB-A 接收器插入电脑的 USB 端口，电脑会自动识别并安装驱动。',
          camera: PORTS,
          set: {
            'recv-a': { parent: 'laptop', at: [PORT.x, PORT.y, PORT.a2], rot: [0, 0, 0], via: [-215, 12, BASE_Z + PORT.a2], dur: 1.8 },
            screen: { ui: NEW_DEVICE, delay: 1.9 },
          },
          highlight: ['recv-a', 'port-la2'],
          zoom: zoomPort(PORT.a2, 'USB-A 接收器插入 USB 口'),
          tip: '首次插入时电脑右下角会提示发现新设备，等待驱动安装完成。',
        },
        usbA.powerOn,
        { ...usbA.mode, desc: '把模式开关向右拨到 2.4G 位置，然后把鼠标靠近 USB 接收器。' },
        usbA.near,
        usbA.use,
      ],
    },
    {
      id: 'type-c', title: '2.4G 连接 · Type-C 接收器', kind: 'usage',
      steps: [
        {
          id: 'c-take', title: '取出 Type-C 接收器', page: 4,
          desc: '翻到鼠标底部，拔出 Type-C 接收器。',
          camera: MOUSE_BOTTOM,
          set: { mouse: FLIP, 'recv-c': { parent: null, at: [205, 42, 80], rot: [0, 0, 0], lift: 20, delay: 1.5, dur: 1.2 } },
          highlight: ['recv-c'],
        },
        {
          id: 'c-plug', title: '插入电脑 Type-C 口', page: 4,
          desc: '选择电脑的 Type-C 端口插入接收器。',
          camera: { ...PORTS, target: portWorld(PORT.c), offset: [-30, 10, 10] },
          set: {
            'recv-c': { parent: 'laptop', at: [PORT.x, PORT.y, PORT.c], rot: [0, 0, 0], via: [-215, 12, BASE_Z + PORT.c], dur: 1.8 },
            screen: { ui: NEW_DEVICE, delay: 1.9 },
          },
          highlight: ['recv-c', 'port-lc'],
          zoom: zoomPort(PORT.c, 'Type-C 接收器插入 Type-C 口'),
        },
        typeC.powerOn,
        { ...typeC.mode, set: { 'mode-knob': modeAt(MODE.g24) } },
        typeC.near,
        typeC.use,
      ],
    },
    {
      id: 'bluetooth', title: '蓝牙连接', kind: 'usage',
      start: { 'mode-knob': { at: [MODE.g24, MODE.y, MODE.z] } },
      steps: [
        {
          id: 'bt-power', title: '打开鼠标电源开关', page: 4,
          desc: '翻到鼠标底部，把电源开关拨到 ON。蓝牙连接不需要接收器。',
          camera: MOUSE_BOTTOM,
          set: { mouse: FLIP, 'power-knob': { ...powerAt(POWER.on), delay: 1.6 } },
          highlight: ['power-knob'],
          zoom: zoomBottom('power-knob', '电源开关拨到 ON'),
        },
        {
          id: 'bt-mode', title: '拨到蓝牙，蓝灯闪烁', page: 4,
          desc: '把模式开关向左拨到蓝牙位置，底部蓝灯闪烁，表示鼠标进入搜索配对状态。',
          camera: MOUSE_BOTTOM,
          set: { 'mode-knob': modeAt(MODE.bt), 'status-led': { light: 'blink', color: BLUE, delay: 0.7 } },
          highlight: ['mode-knob', 'mode-bt', 'status-led'],
          zoom: zoomBottom('status-led', '蓝灯闪烁 = 等待配对'),
          tip: '首次连接时蓝灯会一直闪烁；不闪烁请关闭电源开关再重新打开。',
          chips: [{ label: '蓝灯', sub: '闪烁' }],
        },
        {
          id: 'bt-settings', title: '打开电脑蓝牙', page: 4,
          desc: '翻回鼠标。在电脑上打开「蓝牙」，点击「添加设备」。',
          camera: SCREEN,
          set: { mouse: { ...HOME, lift: 45, dur: 1.4 }, screen: { ui: BT_SETTINGS, delay: 0.6 } },
          highlight: ['screen'],
        },
        {
          id: 'bt-search', title: '选择「BT5.4 Mouse」', page: 4,
          desc: '搜索到「BT5.4 Mouse」后选中并点击连接。',
          camera: SCREEN,
          set: { screen: { ui: BT_SEARCH, delay: 0.3 } },
          highlight: ['screen'],
        },
        {
          id: 'bt-done', title: '连接成功', page: 4,
          desc: '系统提示「BT5.4 Mouse 已连接」，蓝灯熄灭，即可正常使用。',
          camera: { target: [120, 60, -70], dir: [0.3, 0.45, 1], dist: 900 },
          set: { screen: { ui: BT_DONE }, 'status-led': { light: 'off', delay: 0.6 } },
          actions: [{ type: 'glide', part: 'mouse', delay: 1 }],
          highlight: ['mouse'],
        },
        {
          id: 'bt-notes', title: '使用注意', page: 4,
          desc: '蓝牙只在初次使用时需要添加设备；之后打开电源开关会自动回连。蓝牙与 2.4G 切换时有 3–5 秒连接延迟。',
          camera: SCREEN,
          set: {
            screen: {
              ui: {
                app: '使用注意', title: '蓝牙连接说明',
                items: [
                  { text: '再次开机自动回连', sub: '约 3–5 秒' },
                  { text: 'Windows', sub: '需蓝牙 4.0 以上' },
                  { text: 'Mac', sub: '滚轮方向可在 设置 → 鼠标 调整' },
                  { text: 'iOS 13', sub: '辅助功能 → 触控 → 辅助触控' },
                ],
              },
            },
          },
          highlight: ['screen'],
        },
      ],
    },
    {
      id: 'charge', title: '充电', kind: 'usage',
      steps: [
        {
          id: 'ch-plug', title: '插上充电线', page: 5,
          desc: '用随附的 USB 充电线连接鼠标前端的 Type-C 充电口和电脑 USB 口。',
          camera: { target: [-200, 10, 20], dir: [-0.25, 0.85, 1], dist: 620 },
          set: {
            mouse: { parent: null, at: [-250, 0, 110], rot: [0, -30, 0], lift: 30, dur: 1.4 },
            cable: { visible: true },
            'cable-a': { visible: true, parent: 'laptop', at: [PORT.x, PORT.y, PORT.a2], rot: [0, 0, 0], delay: 1.2, dur: 1.4, lift: 30 },
            'cable-c': { visible: true, parent: 'mouse', at: [0, 3.2, -57.5], rot: [0, -90, 0], delay: 1.2, dur: 1.4, lift: 30 },
          },
          highlight: ['cable', 'cable-a', 'cable-c', 'port-c'],
          zoom: { target: 'port-c', dir: [0.9, 0.6, 0.3], dist: 110, caption: 'Type-C 插入鼠标前端' },
        },
        {
          id: 'ch-red', title: '充电中：红灯亮', page: 5,
          desc: '充电时滚轮处的红色指示灯亮起，一般充电约 2–3 小时。',
          camera: { ...MOUSE_TOP, dist: 360 },
          set: { 'charge-led': { light: 'on', color: RED } },
          highlight: ['charge-led'],
          zoom: { target: 'charge-led', dir: [0.4, 1, 0.5], dist: 80, caption: '红灯 = 正在充电' },
          chips: [{ label: '充电时间', sub: '约 2–3 h' }],
          tip: '出厂电量为 30%–70%，首次使用建议先充满电。',
        },
        {
          id: 'ch-green', title: '充满：绿灯亮', page: 5,
          desc: '充满电后红灯熄灭、绿灯亮起。充一次电可使用 10–25 天（按每天约 4 小时）。',
          camera: { ...MOUSE_TOP, dist: 360 },
          set: { 'charge-led': { light: 'on', color: GREEN } },
          highlight: ['charge-led'],
          zoom: { target: 'charge-led', dir: [0.4, 1, 0.5], dist: 80, caption: '绿灯 = 已充满' },
          chips: [{ label: '续航', sub: '10–25 天' }],
        },
        {
          id: 'ch-unplug', title: '拔下充电线', page: 5,
          desc: '拔下充电线，鼠标放回原位继续使用。',
          camera: OVERVIEW,
          set: {
            'charge-led': { light: 'off' },
            'cable-a': { parent: null, at: [-30, 4, 190], rot: [0, -160, 0], visible: false, dur: 1.2 },
            'cable-c': { parent: null, at: [-120, 3, 150], rot: [0, 25, 0], visible: false, dur: 1.2 },
            cable: { visible: false, dur: 1.2 },
            mouse: { ...HOME, lift: 30, delay: 0.9, dur: 1.4 },
          },
          tip: '充电电压不可超过 5V，请使用电脑 USB 口或标准 USB 充电器。',
        },
      ],
    },
    {
      id: 'troubleshoot', title: '连不上？逐项排查', kind: 'repair',
      start: {
        'recv-a': { parent: 'laptop', at: [PORT.x - 4, PORT.y, PORT.a1] },
        'mode-knob': { at: [MODE.g24, MODE.y, MODE.z] },
      },
      steps: [
        {
          id: 'fx-seat', title: '确认接收器插紧', page: 4,
          desc: '先确认接收器已插入电脑 USB 口且接触良好；打开设备管理器，查看是否识别到鼠标并已自动安装驱动。',
          camera: PORTS,
          set: {
            'recv-a': { at: [PORT.x, PORT.y, PORT.a1], dur: 0.8 },
            screen: {
              delay: 0.9,
              ui: {
                app: '设备管理器', title: '设备管理器',
                items: [
                  { text: '鼠标和其他指针设备', sub: 'HID-compliant mouse', state: 'done' },
                  { text: '通用串行总线控制器', sub: 'USB Receiver', state: 'done' },
                  { text: '键盘', state: 'muted' },
                ],
              },
            },
          },
          actions: [{ type: 'shake', part: 'recv-a', axis: 'x', amp: 1.2 }],
          highlight: ['recv-a'],
          zoom: zoomPort(PORT.a1, '接收器插到底'),
          tip: '插入接收器时，设备管理器里会出现新设备提示并安装驱动。',
        },
        {
          id: 'fx-led', title: '打开电源，看底部黄灯', page: 5,
          desc: '打开鼠标电源开关，观察底部是否有黄灯闪烁：有黄灯闪烁表示电源正常。',
          camera: MOUSE_BOTTOM,
          set: {
            mouse: FLIP,
            'power-knob': { ...powerAt(POWER.on), delay: 1.5 },
            'status-led': { light: 'blinkThenOff', color: YELLOW, delay: 2.1 },
          },
          highlight: ['power-knob', 'status-led'],
          zoom: zoomBottom('status-led', '黄灯闪烁 = 电源正常'),
        },
        {
          id: 'fx-charge', title: '没有黄灯：先充电', page: 5,
          desc: '如果没有黄灯闪烁，说明电量耗尽，请先用充电线给鼠标充电（见「充电」指南）。',
          camera: { target: 'mouse', offset: [0, 0, -30], dir: [0.4, 0.55, -1], dist: 300 },
          set: { 'status-led': { light: 'off' } },
          highlight: ['port-c'],
          callouts: [{ part: 'port-c', text: 'Type-C 充电口', sub: '电压 ≤ 5V', offset: [-40, 30, -30] }],
          zoom: { target: 'port-c', dir: [0.3, 0.4, -1], dist: 90, caption: '从这里充电' },
        },
        {
          id: 'fx-port', title: '换一个 USB 口', page: 5,
          desc: '有黄灯但仍无法连接，可以把接收器换到电脑的另一个 USB 口再试。',
          camera: PORTS,
          set: { 'recv-a': { at: [PORT.x, PORT.y, PORT.a2], via: [-205, 12, BASE_Z + (PORT.a1 + PORT.a2) / 2], dur: 1.8 } },
          highlight: ['recv-a', 'port-la2'],
          zoom: zoomPort(PORT.a2, '换到另一个 USB 口'),
        },
        {
          id: 'fx-off', title: '重新配对 ① 关闭电源', page: 5,
          desc: '使用中出现不正常现象，可以重新配对：先把鼠标电源开关拨到 OFF。',
          camera: MOUSE_BOTTOM,
          set: { 'power-knob': powerAt(POWER.off) },
          highlight: ['power-knob'],
          zoom: zoomBottom('power-knob', '电源开关拨到 OFF'),
        },
        {
          id: 'fx-replug', title: '重新配对 ② 拔插接收器', page: 5,
          desc: '把接收器从电脑上拔出，再重新插好。',
          camera: PORTS,
          set: { 'recv-a': { at: [PORT.x, PORT.y, PORT.a2], via: [-222, 10, BASE_Z + PORT.a2], dur: 2 } },
          highlight: ['recv-a'],
          zoom: zoomPort(PORT.a2, '拔出 → 重新插入'),
        },
        {
          id: 'fx-on', title: '重新配对 ③ 打开电源', page: 5,
          desc: '打开鼠标电源开关并靠近接收器，黄灯闪烁后熄灭即重新配对成功，恢复出厂设置。',
          camera: NEAR_VIEW,
          set: {
            'power-knob': powerAt(POWER.on),
            mouse: { ...NEAR, delay: 0.7 },
            'status-led': { light: 'blinkThenOff', color: YELLOW, delay: 2.4 },
          },
          highlight: ['status-led', 'recv-a'],
          zoom: zoomUnder,
        },
        {
          id: 'fx-bt', title: '蓝牙搜不到？', page: 4,
          desc: '拨到蓝牙位置后，只有蓝灯闪烁时才能被电脑搜索到；蓝灯不闪烁请关闭电源再重新打开。Windows 电脑需支持蓝牙 4.0 以上。',
          camera: MOUSE_BOTTOM,
          set: {
            mouse: FLIP,
            'mode-knob': { ...modeAt(MODE.bt), delay: 1.5 },
            'status-led': { light: 'blink', color: BLUE, delay: 2.1 },
          },
          highlight: ['mode-knob', 'status-led'],
          zoom: zoomBottom('status-led', '蓝灯闪烁才能被搜索到'),
        },
      ],
    },
  ],
}
