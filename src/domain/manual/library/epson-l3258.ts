import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 爱普生 L3258 墨仓式彩色无线多功能一体机（L3250 系列：打印 / 复印 / 扫描 · Wi-Fi）
 * 资料（爱普生中国官方 CDN，逐页转写见 manuals-src/epson-l3258/transcript.md）：
 *   《首先阅读》L3251/L3253/L3255/L3256/L3258 纸面安装指南，2 张对开 = 印刷页 1–4
 *     https://eposs.epson.com.cn/EPSON/assets/Master/ecc-resource/manual/ink/L3251/L3251_L3253_L3255_L3256_L3258_L1258_L1259_SH_Thailand.pdf
 *   《用户指南》NPD6446-04 SC，177 页（source.url）
 * page 1–4 指《首先阅读》，16 起指《用户指南》页码，两者不重叠。
 *
 * 场景：桌面 y=0，打印机居中，正面朝 +z（观众一侧），左右按面对打印机。
 *   机身 375 × 347 × 179（存放尺寸，用户指南第 173 页）；正面 z=153.5，墨仓部件在右前角凸出到 z=173.5。
 *   扫描部件绕顶面后沿（y=176, z=-125）上翻；墨仓盖绕前沿向前下翻；前盖绕下沿向前翻倒；
 *   后进纸器在顶面后部，进纸器挡板绕前沿向前翻倒（用户指南第 25 页图）。
 *   墨仓从左到右 BK · Y · M · C，注入口在墨仓顶面、墨位窗在正面。
 * 推断（说明书未给）：墨仓部件 68 × 115 × 152、扫描部件厚 50、进纸器 / 前盖 / 出纸器尺寸按插图比例；
 *   墨瓶 Ø32 × 116；交流电入口在背面左下、USB 在左侧（按背面插图判断）；
 *   电源灯取图例绿色；路由器、手机外形与 Smart Panel 界面文字为示意。
 */

// ---------- 尺寸与位置 ----------
const FRONT = 153.5
/** 纸路中心 x（扫描部件 / 进纸器 / 出纸器居中于此） */
const PX = -37.5
/** 扫描部件转轴：顶面后沿 */
const SCAN: Vec3 = [PX, 176, -125]
/** 墨仓部件（机身子零件；局部坐标底面中心，正面 z=+57.5） */
const TANK = { x: 153.5, z: 116 }
const PORT_Y = 140
const PORT_Z = 5

const up: Vec3 = [-90, 0, 0]

// 进纸器：纸托 / 纸张平面向后倾 18°
const LEAN: Vec3 = [-18, 0, 0]
const SUPPORT_UP: Vec3 = [PX, 242.6, -183.6]
const SUPPORT_DOWN: Vec3 = [PX, 109.4, -140.3]
const PAPER_IN: Vec3 = [PX, 312.8, -202]
const PAPER_JAM: Vec3 = [PX, 284.3, -192.7]
const PAPER_DESK_AT: Vec3 = [-360, 2.5, 30]
const PAPER_DESK: PartState = { parent: null, at: PAPER_DESK_AT, rot: [-90, 0, 0] }
/**
 * 二次贝塞尔经过 via（k=0.5）。让控制点正好在起点 / 终点正上方，
 * 零件就竖直起飞 / 竖直落下，不会横着扫到旁边的零件（侧导轨、相邻墨瓶）。
 */
const viaUpFrom = (from: Vec3, to: Vec3, top: number): Vec3 => [(3 * from[0] + to[0]) / 4, top, (3 * from[2] + to[2]) / 4]
const viaDownTo = (from: Vec3, to: Vec3, top: number): Vec3 => viaUpFrom(to, from, top)
const GUARD_CLOSED: Vec3 = [72, 0, 0]
const GUARD_OPEN: Vec3 = [175, 0, 0]
const guide = (side: -1 | 1, half: number): PartState => ({ at: [PX + side * half, 186, -160], dur: 0.7 })

// ---------- 颜色 ----------
const GREEN = '#22b04b'
const ORANGE = '#ff8a00'
const BLUE = '#2f7bf5'
/** Wi-Fi 两灯交替闪烁：第二盏灯的 delay 晚半个闪烁周期（闪烁 2.4 Hz） */
const HALF_BLINK = 0.208

// ---------- 墨水 ----------
type Ink = 'bk' | 'y' | 'm' | 'c'
const INKS: { k: Ink; label: string; name: string; x: number; home: number }[] = [
  { k: 'bk', label: 'BK', name: '黑色', x: -21, home: 245 },
  { k: 'y', label: 'Y', name: '黄色', x: -7, home: 285 },
  { k: 'm', label: 'M', name: '洋红', x: 7, home: 325 },
  { k: 'c', label: 'C', name: '青色', x: 21, home: 365 },
]
const ink = (k: Ink) => INKS.find((i) => i.k === k)!
const portWorld = (k: Ink): Vec3 => [TANK.x + ink(k).x, PORT_Y, TANK.z + PORT_Z]
const windowWorld = (k: Ink, y = 60): Vec3 => [TANK.x + ink(k).x, y, TANK.z + 57.6]

const STOP_OPEN: Vec3 = [175, 0, 0]
const COVER_OPEN: Vec3 = [165, 0, 0]

/**
 * 墨瓶：原点在瓶嘴止口（插入时与注入口齐平），瓶嘴朝 +x。
 * 桌上正立 → 倒插是 180° 翻转：roll -90 让翻转绕世界 x 轴、瓶身向后甩（不扫到机身和相邻墨瓶），
 * 倒插后瓶身 -z 面朝前，所以前后各贴一张标签。
 */
const bottleShape = (label: string): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 5, h: 12, axis: 'x', at: [6, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 6.5, h: 12, axis: 'x', at: [-6, 0, 0] },
    { type: 'cylinder', r: 7, r2: 16, h: 12, axis: 'x', at: [-18, 0, 0] },
    { type: 'cylinder', r: 16, h: 80, axis: 'x', at: [-64, 0, 0] },
    { type: 'text', text: label, size: 8, at: [-60, 0, 16.3], rot: [0, 0, -90] },
    { type: 'text', text: label, size: 8, at: [-68, 0, -16.3], rot: [180, 0, 90] },
  ],
})
const BOTTLE_Z = 150
const bottleAt = (k: Ink): Vec3 => [ink(k).home, 104, BOTTLE_Z]
const bottleHome = (k: Ink): PartState => ({ parent: null, at: bottleAt(k), rot: [0, 0, 90] })
const capDesk = (k: Ink): Vec3 => [ink(k).home, 13, 200]
const capTop = (k: Ink): Vec3 => [ink(k).home, 175, 165]
const capOff = (k: Ink, delay = 0): PartState => ({ parent: null, at: capDesk(k), rot: [0, 0, 90], via: capTop(k), delay, dur: 0.9 })
const capOn = (k: Ink, delay: number): PartState => ({ parent: `bottle-${k}`, at: [1, 0, 0], rot: [0, 0, 0], via: capTop(k), delay, dur: 0.8 })
const insert = (k: Ink, delay = 0): PartState => ({
  plug: { hole: `port-${k}`, roll: -90 }, via: viaUpFrom(bottleAt(k), portWorld(k), 400), delay, dur: 2,
})
const pullOut = (k: Ink): PartState => ({ ...bottleHome(k), via: viaDownTo(portWorld(k), bottleAt(k), 400), dur: 1.7 })

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [40, 110, 0], dir: [0.45, 0.6, 1], dist: 1350 }
const FRONT_VIEW: CameraSpec = { target: [0, 120, 60], dir: [0.35, 0.6, 1], dist: 950 }
const BACK_VIEW: CameraSpec = { target: [-210, 40, -240], dir: [-0.55, 0.7, -1], dist: 720 }
const TANK_VIEW: CameraSpec = { target: [150, 130, 135], dir: [0.8, 0.7, 1], dist: 560 }
const TANK_TOP: CameraSpec = { target: [150, 140, 140], dir: [0.45, 1, 0.9], dist: 500 }
const TANK_FRONT: CameraSpec = { target: [153, 80, 175], dir: [0.5, 0.3, 1], dist: 440 }
const fillView = (k: Ink): CameraSpec => ({ target: [portWorld(k)[0] + 40, 150, 140], dir: [0.85, 0.5, 1], dist: 680 })
const PANEL: CameraSpec = { target: [-80, 160, 150], dir: [0.15, 0.9, 0.9], dist: 430 }
const FEEDER: CameraSpec = { target: [-40, 190, -100], dir: [0.3, 0.7, 1], dist: 950 }
const PAPER_VIEW: CameraSpec = { target: [-40, 270, -150], dir: [0.3, 0.6, 1], dist: 1050 }
const FRONT_LOW: CameraSpec = { target: [-40, 60, 190], dir: [0.35, 0.55, 1], dist: 650 }
const JAM_VIEW: CameraSpec = { target: [-40, 170, 60], dir: [0.3, 0.6, 1], dist: 950 }
const ROUTER_VIEW: CameraSpec = { target: [-345, 40, -160], dir: [0.2, 0.75, 1], dist: 500 }
const PHONE_VIEW: CameraSpec = { target: 'phone', dir: [0.15, 1, 0.55], dist: 290 }

const zoomPanel = (target: string | Vec3, caption: string, dist = 110) => ({ target, dir: [0.1, 1, 0.7] as Vec3, dist, caption })
/** 操作面板上的世界坐标：x 用面板局部坐标（扫描部件局部 x），面板条中线 */
const panelAt = (x: number): Vec3 => [SCAN[0] + x, 160, SCAN[2] + 260]
const zoomWindow = (k: Ink, caption: string) => ({ target: windowWorld(k), dir: [0.3, 0.2, 1] as Vec3, dist: 150, caption })

// ---------- 屏幕 ----------
const SMART_PANEL: ScreenUI = {
  app: 'Epson Smart Panel', title: '添加打印机',
  items: [
    { text: 'L3250 Series', sub: 'Wi-Fi 已连接', state: 'done' },
    { text: '打印 · 复印 · 扫描', sub: '可在手机上远程操作', state: 'muted' },
  ],
  toast: '打印机设置完成',
}

// ---------- 零件 ----------
const panelText = (text: string, x: number, z = 276, size = 3) => ({ type: 'text' as const, text, size, at: [x, -15.9, z] as Vec3, rot: up })
const tapeBox = (size: Vec3, at: Vec3) => ({ type: 'box' as const, size, at, fill: 'shade' as const })
const button = (id: string, name: string, spec: string, x: number): SpecPart => ({
  id, name, spec, parent: 'scanner', shape: { type: 'cylinder', r: 6.5, h: 3 }, at: [x, -14.5, 260],
})
const panelLed = (id: string, name: string, color: string, x: number, z: number): SpecPart => ({
  id, name, parent: 'scanner', shape: { type: 'led', r: 2.2, color }, at: [x, -15.95, z], rot: up,
})

/** 喷嘴检查图案：黑色块线条断续（图案 B），彩色块完整 */
const nozzlePattern = (): Shape => {
  const items: (Shape & { at?: Vec3; rot?: Vec3; fill?: 'dark' | 'warm' })[] = [{ type: 'slab', w: 210, d: 150, h: 0.4, fill: 'warm' }]
  for (let i = 0; i < 5; i++) {
    const z = 40 - i * 7
    items.push({ type: 'hole', w: i % 2 ? 20 : 30, h: 1.6, r: 0.4, at: [-66 + (i % 2) * 6, 0.45, z], rot: up, fill: 'dark' })
    items.push({ type: 'hole', w: i % 2 ? 14 : 8, h: 1.6, r: 0.4, at: [-28 - (i % 2) * 4, 0.45, z], rot: up, fill: 'dark' })
    items.push({ type: 'hole', w: 64, h: 1.6, r: 0.4, at: [45, 0.45, z], rot: up, fill: 'dark' })
  }
  return { type: 'compound', items }
}

const parts: SpecPart[] = [
  // 机身：主体 + 后进纸器隆起 + 墨仓后方右侧立柱；正面开口 / 出纸口 / 左侧 USB 口
  {
    id: 'body', name: '打印机机身', spec: '375 × 347 × 179 mm · 约 3.9 kg',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 373, d: 327, h: 126, r: 8, at: [-1, 0, -10] },
        { type: 'slab', w: 300, d: 48, h: 50, r: 4, at: [PX, 126, -149.5] },
        { type: 'slab', w: 66, d: 231.5, h: 26, r: 4, at: [152.5, 126, -57.75] },
        { type: 'hole', w: 230, h: 9, r: 3, at: [PX, 176.05, -157], rot: up, fill: 'dark' },
        { type: 'hole', w: 222, h: 58, r: 4, at: [PX, 71, FRONT + 0.05], fill: 'dark' },
        { type: 'hole', w: 206, h: 12, r: 3, at: [PX, 15, FRONT + 0.05], fill: 'dark' },
        { type: 'hole', w: 12, h: 11, r: 2, at: [-187.55, 60, -120], rot: [0, -90, 0], fill: 'dark' },
      ],
    },
  },
  { id: 'inlet', name: '交流电入口', spec: '机身背面', parent: 'body', shape: { type: 'hole', w: 14, h: 10, r: 2 }, at: [-150, 30, -173.55], rot: [0, 180, 0], fill: 'dark' },

  // 扫描部件（含文稿盖与前沿操作面板），原点在顶面后沿铰链
  {
    id: 'scanner', name: '扫描部件', spec: '含文稿盖 · 打开可取出夹纸', parent: 'body', at: SCAN,
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 300, d: 290, h: 34, r: 6, at: [0, -50, 145] },
        { type: 'slab', w: 292, d: 236, h: 16, r: 4, at: [0, -16, 120] },
        { type: 'text', text: 'EPSON', size: 7, at: [100, -33, 290.1] },
        panelText('电源', -127.5),
        panelText('Wi-Fi', -90.5),
        panelText('网络', -70.5),
        panelText('黑白', -49.5),
        panelText('彩色', -29.5),
        panelText('停止', -7.5),
        panelText('墨水', 21, 254, 2.4),
        panelText('纸张', 21, 266, 2.4),
      ],
    },
  },
  button('btn-power', '电源键 ⏻', '开 / 关机', -127.5),
  { id: 'led-power', name: '电源灯', parent: 'btn-power', shape: { type: 'led', r: 4.5, color: GREEN }, at: [0, 1.55, 0], rot: up },
  panelLed('led-wifi', 'Wi-Fi 指示灯', GREEN, -109.5, 254),
  panelLed('led-wifid', 'Wi-Fi Direct 指示灯', GREEN, -109.5, 266),
  button('btn-wifi', 'Wi-Fi 键', '按住 ≥5 秒：WPS 一键设置', -90.5),
  button('btn-info', '网络键 [i]', '打印网络连接报告', -70.5),
  {
    id: 'btn-copy', name: '复印键（黑白 / 彩色）', spec: '也用于清除错误', parent: 'scanner', at: [-39.5, -14.5, 260],
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 6.5, h: 3, at: [-10, 0, 0] }, { type: 'cylinder', r: 6.5, h: 3, at: [10, 0, 0] }] },
  },
  button('btn-stop', '停止键 ⊘', '按住 5 秒：清洗打印头 / 首次充墨', -7.5),
  panelLed('led-ink', '墨水指示灯', ORANGE, 10.5, 254),
  panelLed('led-paper', '纸张指示灯', ORANGE, 10.5, 266),

  // 墨仓部件
  { id: 'tank', name: '墨仓部件', spec: 'BK · Y · M · C 四色墨仓', parent: 'body', shape: { type: 'slab', w: 68, d: 115, h: 140, r: 4 }, at: [TANK.x, 0, TANK.z] },
  {
    id: 'tank-cover', name: '墨仓盖', spec: '绕前沿向前翻开', parent: 'tank', at: [0, 128, 57.5],
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [74, 24, 3], at: [0, 12, 1.6] },
        { type: 'box', size: [74, 3, 82], at: [0, 22.5, -38] },
        { type: 'box', size: [3, 9, 82], at: [-35.5, 16.5, -38] },
        { type: 'box', size: [3, 9, 82], at: [35.5, 16.5, -38] },
        { type: 'box', size: [74, 9, 3], at: [0, 16.5, -80.5] },
      ],
    },
  },
  ...INKS.map((i): SpecPart => ({
    id: `port-${i.k}`, name: `${i.name}注入口（${i.label}）`, spec: '按颜色防呆', parent: 'tank',
    shape: { type: 'hole', w: 9, h: 9, r: 4.5 }, at: [i.x, PORT_Y + 0.05, PORT_Z], rot: up, fill: 'dark',
  })),
  ...INKS.map((i): SpecPart => ({
    id: `stop-${i.k}`, name: `${i.name}墨仓塞（${i.label}）`, parent: 'tank',
    shape: { type: 'box', size: [10, 7, 12], chamfer: 1.5 }, at: [i.x, PORT_Y + 3.5, PORT_Z + 20], pivot: [0, 0, -20],
  })),
  {
    id: 'windows', name: '墨位观察窗', spec: '上线 / 下线 ▼', parent: 'tank', at: [0, 0, 57.5],
    shape: {
      type: 'compound',
      items: INKS.flatMap((i) => [
        { type: 'hole' as const, w: 9, h: 62, r: 3, at: [i.x, 49, 0.05] as Vec3, fill: 'shade' as const },
        { type: 'hole' as const, w: 13, h: 1.4, r: 0.5, at: [i.x, 76, 0.12] as Vec3, fill: 'dark' as const },
        { type: 'hole' as const, w: 6, h: 1.2, r: 0.4, at: [i.x, 23, 0.12] as Vec3, fill: 'dark' as const },
        { type: 'text' as const, text: i.label, size: 5.5, at: [i.x, 90, 0.05] as Vec3 },
      ]),
    },
  },
  ...INKS.map((i): SpecPart => ({
    id: `ink-${i.k}`, name: `${i.name}墨水`, parent: 'tank',
    shape: { type: 'hole', w: 7, h: 50, r: 2.5 }, at: [i.x, 50, 57.7], fill: 'dark', visible: false,
  })),

  // 出厂保护胶带
  {
    id: 'tape-a', name: '保护胶带（扫描部件）', parent: 'scanner', at: [60, 0, 0],
    shape: {
      type: 'compound',
      items: [
        tapeBox([18, 0.5, 44], [0, 0.3, 216]),
        tapeBox([18, 16, 0.5], [0, -8, 238.3]),
        tapeBox([18, 0.5, 52], [0, -15.7, 264.2]),
        tapeBox([18, 30, 0.5], [0, -31, 290.3]),
      ],
    },
  },
  { id: 'tape-b', name: '保护胶带（墨仓盖）', parent: 'tank-cover', shape: { type: 'compound', items: [tapeBox([14, 0.5, 50], [0, 24.3, -22]), tapeBox([14, 22, 0.5], [0, 12, 3.4])] } },
  { id: 'tape-c', name: '保护胶带（前盖）', parent: 'front-cover', shape: { type: 'compound', items: [tapeBox([16, 58, 0.5], [70, 31, 4.3])] } },

  // 后进纸器
  { id: 'feeder-guard', name: '进纸器挡板', spec: '防止异物进入 · 平时关闭', parent: 'body', shape: { type: 'slab', w: 200, d: 22, h: 2.5, r: 2 }, at: [PX, 178.5, -150], rot: GUARD_CLOSED, pivot: [0, 0, -11] },
  { id: 'support', name: '纸托', parent: 'body', shape: { type: 'box', size: [180, 160, 2.5], chamfer: 1 }, at: SUPPORT_DOWN, rot: LEAN, visible: false },
  { id: 'guide-l', name: '侧导轨（左）', parent: 'body', shape: { type: 'box', size: [8, 20, 12], chamfer: 1.5 }, at: [PX - 116, 186, -160] },
  { id: 'guide-r', name: '侧导轨（右）', parent: 'body', shape: { type: 'box', size: [8, 20, 12], chamfer: 1.5 }, at: [PX + 116, 186, -160] },
  { id: 'paper', name: 'A4 普通纸', spec: '64–90 g/m²', shape: { type: 'box', size: [210, 297, 5] }, at: PAPER_DESK_AT, rot: [-90, 0, 0], fill: 'warm', visible: false },

  // 正面
  { id: 'front-cover', name: '前盖', spec: '取出机内夹纸时打开', parent: 'body', shape: { type: 'box', size: [224, 62, 4] }, at: [PX, 40, FRONT], pivot: [0, 31, 2] },
  { id: 'tray', name: '出纸器', parent: 'body', shape: { type: 'slab', w: 200, d: 130, h: 7, r: 3 }, at: [PX, 9, 95] },
  { id: 'tray-stop', name: '挡纸器', parent: 'tray', shape: { type: 'box', size: [150, 2, 18] }, at: [0, 7, 65], pivot: [0, 1, -9] },
  { id: 'sheet', name: '机内夹纸', parent: 'body', shape: { type: 'box', size: [190, 1.2, 40] }, at: [PX - 8, 72, 150], rot: [4, 4, -3], fill: 'warm', visible: false },
  { id: 'printout', name: '喷嘴检查图案', parent: 'tray', shape: nozzlePattern(), at: [0, 7.1, -12], visible: false },

  // 墨瓶（原装 004）
  ...INKS.map((i): SpecPart => ({
    id: `bottle-${i.k}`, name: `${i.name}墨瓶（${i.label}）`, spec: '爱普生 004', shape: bottleShape(i.label), at: [i.home, 104, 150], rot: [0, 0, 90],
  })),
  ...INKS.map((i): SpecPart => ({
    id: `cap-${i.k}`, name: `${i.name}瓶盖`, parent: `bottle-${i.k}`, shape: { type: 'cylinder', r: 9, h: 26, axis: 'x' }, at: [1, 0, 0], fill: 'shade',
  })),

  // 插线板（插头换父级到它上面，世界矩阵按零件顺序计算，所以要排在电源线前面）
  {
    id: 'strip', name: '插线板', at: [-300, 0, -300],
    shape: { type: 'compound', items: [{ type: 'box', size: [220, 30, 56], chamfer: 4, at: [0, 15, 0] }, { type: 'hole', w: 20, h: 13, r: 3, at: [-30, 30.05, 0], rot: up, fill: 'dark' }, { type: 'box', size: [16, 4, 22], chamfer: 1, at: [-88, 32, 0], fill: 'shade' }] },
  },
  { id: 'socket', name: '插座', parent: 'strip', shape: { type: 'hole', w: 20, h: 13, r: 3 }, at: [40, 30.05, 0], rot: up, fill: 'dark' },
  // 电源线
  {
    id: 'cord-c7', name: '电源线（机身端）', at: [-250, 6, -110], rot: [0, 30, 0],
    shape: { type: 'compound', items: [{ type: 'box', size: [10, 7, 12], chamfer: 1, at: [5, 0, 0], fill: 'shade' }, { type: 'box', size: [28, 12, 17], chamfer: 2.5, at: [-14, 0, 0] }] },
  },
  {
    id: 'cord-plug', name: '电源线（插头）', at: [-300, 10, -40], rot: [0, -20, 0],
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [13, 6, 1.4], at: [6.5, 0, -5.5], fill: 'shade' },
        { type: 'box', size: [13, 6, 1.4], at: [6.5, 0, 5.5], fill: 'shade' },
        { type: 'box', size: [26, 20, 30], chamfer: 3, at: [-13, 0, 0] },
      ],
    },
  },
  {
    id: 'cord', name: '电源线',
    shape: { type: 'cable', from: { part: 'cord-c7', at: [-28, 0, 0], dir: [-1, 0, 0] }, to: { part: 'cord-plug', at: [-26, 0, 0], dir: [-1, 0, 0] }, r: 2.5, slack: 1.1 },
  },

  // 无线路由器 + 手机（Wi-Fi 指南）
  {
    id: 'router', name: '无线路由器', spec: '支持 WPS', at: [-360, 0, -170], visible: false,
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 150, d: 100, h: 28, r: 10 },
        { type: 'box', size: [7, 110, 7], chamfer: 2, at: [-55, 83, -42] },
        { type: 'box', size: [7, 110, 7], chamfer: 2, at: [55, 83, -42] },
        { type: 'text', text: 'WPS', size: 4, at: [45, 28.1, 20], rot: up },
      ],
    },
  },
  { id: 'router-wps', name: '路由器 WPS 键', parent: 'router', shape: { type: 'box', size: [14, 3, 9], chamfer: 1 }, at: [45, 29.5, 32] },
  { id: 'router-led', name: '路由器安全指示灯', parent: 'router', shape: { type: 'led', r: 3.5, color: BLUE }, at: [-30, 28.05, 32], rot: up },
  { id: 'phone', name: '智能手机', shape: { type: 'slab', w: 72, d: 150, h: 8, r: 9 }, at: [-330, 0, 200], rot: [0, 25, 0], visible: false },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 64, h: 138 }, at: [0, 8.05, 0], rot: up },
]

// ---------- 状态组合 ----------
const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
const PLUGGED: Record<string, PartState> = { 'cord-c7': { plug: 'inlet' }, 'cord-plug': { plug: 'socket' } }
const NO_TAPE = hide('tape-a', 'tape-b', 'tape-c')
const READY: Record<string, PartState> = {
  ...PLUGGED, ...NO_TAPE,
  ...show('ink-bk', 'ink-y', 'ink-m', 'ink-c'),
  ...hide('bottle-bk', 'bottle-y', 'bottle-m', 'bottle-c'),
}
const POWER_ON: Record<string, PartState> = { 'led-power': { light: 'on', color: GREEN } }
const PAPER_LOADED: Record<string, PartState> = {
  'feeder-guard': { rot: GUARD_CLOSED },
  support: { visible: true, at: SUPPORT_UP },
  'guide-l': { at: [PX - 110, 186, -160] },
  'guide-r': { at: [PX + 110, 186, -160] },
  paper: { visible: true, parent: 'body', at: PAPER_IN, rot: LEAN },
}
const TRAY_OUT: Record<string, PartState> = { tray: { at: [PX, 9, 195] }, 'tray-stop': { rot: [90, 0, 0] } }

const sh = (sub: string) => ({ label: '首先阅读', sub })

export const epsonL3258: ManualSpec = {
  id: 'epson-l3258',
  name: '爱普生 L3258 墨仓式打印机',
  desc: '彩色无线多功能一体机 · 打印 / 复印 / 扫描 · 首次注墨与充墨',
  category: '打印机',
  dims: { width: 375, depth: 347, height: 179 },
  source: {
    title: '爱普生 L3251/L3253/L3255/L3256/L3258《首先阅读》（第 1–4 页）+《用户指南》NPD6446-04 SC（第 16 页起）',
    url: 'https://eposs.epson.com.cn/EPSON/assets/Master/ecc-resource/manual/ink/l3251-l3253-l3255-l3256-l3258-l1258-l1259/L3251_L3253_L3255_L3256_L3258_UG.pdf',
    images: [],
  },
  package: [
    { name: 'L3258 多功能一体机', qty: 1, spec: '375 × 347 × 179 mm' },
    { name: '爱普生原装墨水补充装', qty: 4, spec: '004 · BK 黑 / Y 黄 / M 洋红 / C 青' },
    { name: '电源线', qty: 1 },
    { name: '光盘', qty: 1, spec: 'Windows 驱动与电子说明书' },
    { name: '《首先阅读》', qty: 1, spec: '纸面安装指南' },
  ],
  params: [
    { label: '外形尺寸', value: '375 × 347 × 179 mm', note: '打印时 375 × 578 × 253 mm' },
    { label: '重量', value: '约 3.9 kg', note: '不含墨水和电源线' },
    { label: '墨瓶编号', value: '004', note: 'BK 黑 · C 青 · M 洋红 · Y 黄' },
    { label: '首次充墨', value: '约 11 分钟', note: '按住停止键 5 秒开始' },
    { label: '打印头清洗', value: '约 3 分钟', note: '按住停止键 5 秒' },
    { label: '喷嘴', value: '黑色 180 · 彩色每色 59' },
    { label: '纸张', value: 'A4 普通纸 64–90 g/m²', note: '不超过侧导轨 ▼ 界线' },
    { label: 'Wi-Fi', value: 'IEEE 802.11 b/g/n · 2.4 GHz', note: '支持 Wi-Fi Direct' },
    { label: '电源', value: '交流 220–240 V · 50–60 Hz · 0.2 A' },
    { label: '耗电', value: '复印约 12 W', note: '就绪 4.5 W · 睡眠 0.7 W · 关机 0.2 W' },
    { label: '工作环境', value: '10–35 ℃ · 20–80% RH' },
  ],
  parts,
  stageSize: 1400,
  guides: [
    // ---------------- 1. 开箱 ----------------
    {
      id: 'unbox', title: '开箱与接电源', kind: 'assembly',
      steps: [
        {
          id: 'contents', title: '清点包装', page: 1,
          desc: '包装内有：打印机、电源线、光盘（Windows 驱动和电子说明书）、四瓶爱普生原装墨水补充装（BK 黑 / Y 黄 / M 洋红 / C 青）和《首先阅读》。随附墨瓶的部分墨水会用于首次给打印头充墨。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'body', text: 'L3258 多功能一体机', at: [-120, 176, -40], offset: [-40, 110, 0] },
            { part: 'bottle-m', text: '原装墨水 ×4', sub: 'BK · Y · M · C（004）', at: [0, 0, 0], offset: [10, 120, 0] },
            { part: 'cord-plug', text: '电源线', offset: [-30, 80, 0] },
          ],
          chips: [{ label: '包装', sub: '5 种' }, sh('包装内容')],
        },
        {
          id: 'tape', title: '撕掉保护胶带', page: 1,
          desc: '撕掉机身上所有出厂保护胶带（扫描部件、墨仓盖、前盖等处）。',
          camera: FRONT_VIEW,
          set: {
            'tape-a': { at: [60, 40, 0], visible: false, dur: 1.2 },
            'tape-b': { at: [0, 40, 0], visible: false, delay: 0.3, dur: 1.2 },
            'tape-c': { at: [0, 30, 40], visible: false, delay: 0.6, dur: 1.2 },
          },
          highlight: ['tape-a', 'tape-b', 'tape-c'],
          tip: '墨瓶为真空包装，准备注墨时再拆开（用户指南第 121 页）。',
          chips: [sh('安装准备 · 去胶带')],
        },
        {
          id: 'power', title: '接好电源线，先别连 USB', page: 1,
          desc: '① 把电源线插入机身背面的交流电入口；② 再把插头插到电源插座上。现在不要用 USB 线连接电脑。',
          camera: BACK_VIEW,
          set: {
            'cord-c7': { plug: 'inlet', via: [-215, 40, -250], dur: 1.6 },
            'cord-plug': { plug: { hole: 'socket', back: 60 }, delay: 1.7, dur: 1.4 },
          },
          highlight: ['cord-c7', 'cord-plug'],
          zoom: { target: [-150, 30, -185], dir: [-0.5, 0.45, -1], dist: 130, caption: '① 插入背面的交流电入口' },
          callouts: [{ part: 'strip', text: '② 插到电源插座', at: [40, 15, 28], offset: [-20, 60, 40] }],
          tip: '勿连 USB 线：先完成注墨和充墨，安装软件时再按提示连接。',
          chips: [sh('安装准备 · 插好电源线')],
        },
      ],
    },

    // ---------------- 2. 注墨 ----------------
    {
      id: 'ink', title: '注墨（四色）', kind: 'assembly',
      start: { ...PLUGGED, ...NO_TAPE },
      steps: [
        {
          id: 'cover', title: '打开墨仓盖', page: 1,
          desc: '墨仓部件在打印机右前方。把墨仓盖绕前沿向前翻开，露出四个墨仓塞。',
          camera: TANK_VIEW,
          set: { 'tank-cover': { rot: COVER_OPEN, dur: 1.2 } },
          highlight: ['tank-cover'],
          callouts: [{ part: 'tank', text: '墨仓部件', sub: '从左到右 BK · Y · M · C', at: [0, 100, 57.5], offset: [70, 60, 40] }],
          chips: [sh('安装方法 2 · ①')],
        },
        {
          id: 'stop-bk', title: '打开黑色（BK）墨仓塞', page: 1,
          desc: '先给黑色墨仓注墨：打开最左边 BK 墨仓的墨仓塞，塞子翻到前方。',
          camera: TANK_TOP,
          set: { 'stop-bk': { rot: STOP_OPEN, dur: 0.9 } },
          highlight: ['stop-bk', 'port-bk'],
          zoom: { target: 'port-bk', dir: [0.3, 1, 0.75], dist: 110, caption: 'BK 注入口（最左）' },
          tip: '确保墨仓的颜色与要补充墨水的颜色匹配。',
          chips: [sh('安装方法 2 · ①')],
        },
        {
          id: 'uncap', title: '竖直握瓶，拧下瓶盖', page: 1,
          desc: '拆开黑色（BK）墨瓶，竖直握住墨瓶，慢慢转动瓶盖把它取下。',
          camera: { target: [300, 70, 170], dir: [0.4, 0.55, 1], dist: 520 },
          set: { 'cap-bk': capOff('bk') },
          highlight: ['cap-bk', 'bottle-bk'],
          tip: '请在保持墨瓶竖立的情况下取下盖，否则墨水可能会泄漏；不要摇晃或挤压墨瓶。',
          chips: [sh('安装方法 2 · ②')],
        },
        {
          id: 'line', title: '检查墨仓的上线', page: 2,
          desc: '墨仓正面的观察窗上有上线和下线（▼）。墨水注到上线就满了。',
          camera: TANK_FRONT,
          highlight: ['windows'],
          zoom: zoomWindow('bk', '上线：墨水注到这条线为止'),
          callouts: [
            { part: 'windows', text: '上线', at: [-21, 76, 0], offset: [-70, 30, 20] },
            { part: 'windows', text: '下线 ▼', at: [-21, 23, 0], offset: [-70, -10, 20] },
          ],
          chips: [sh('安装方法 2 · ③')],
        },
        {
          id: 'insert', title: '墨瓶竖直插入注入口', page: 2,
          desc: '把墨瓶倒过来，瓶嘴对准 BK 注入口竖直插入。墨瓶插入对应颜色的注入口时，墨水开始注入。',
          camera: fillView('bk'),
          set: { 'bottle-bk': insert('bk') },
          highlight: ['bottle-bk', 'port-bk'],
          zoom: { target: [portWorld('bk')[0], 160, portWorld('bk')[2]], dir: [0.6, 0.35, 1], dist: 170, caption: '瓶嘴按颜色防呆，只插得进 BK 口' },
          tip: '不要用力硬插：每种颜色的瓶嘴只能插入对应颜色的注入口。注墨时不要挤压墨瓶，也不要让它碰到其他东西。',
          chips: [sh('安装方法 2 · ④')],
        },
        {
          id: 'auto-stop', title: '墨水到上线自动停止', page: 2,
          desc: '墨水流入墨仓，到达上线时会自动停止注入。',
          camera: { target: [150, 110, 160], dir: [0.6, 0.35, 1], dist: 600 },
          set: { 'ink-bk': { visible: true, delay: 0.4, dur: 0.3 } },
          highlight: ['ink-bk'],
          zoom: zoomWindow('bk', '墨水到上线自动停止'),
          tip: '墨水没有流进墨仓：取下墨瓶后重新插入；但墨水已到上线时请勿重新插入，否则墨水可能泄漏。',
          chips: [{ label: '图示', sub: '约 50 秒' }, sh('安装方法 2 · ④')],
        },
        {
          id: 'remove', title: '取下墨瓶，盖紧瓶盖', page: 2,
          desc: '墨水到达上线后取下墨瓶，盖紧瓶盖。瓶中剩余的墨水可日后补充使用。',
          camera: { target: [210, 130, 150], dir: [0.6, 0.55, 1], dist: 720 },
          set: { 'bottle-bk': pullOut('bk'), 'cap-bk': capOn('bk', 1.7) },
          highlight: ['bottle-bk', 'cap-bk'],
          tip: '请勿将墨瓶一直插在本产品中，否则墨瓶可能损坏或墨水泄漏；剩余墨水请盖紧后直立存放。',
          chips: [sh('安装方法 2 · ⑤')],
        },
        {
          id: 'stop-close', title: '按紧墨仓塞', page: 2,
          desc: '把黑色墨仓塞翻回注入口并按紧。',
          camera: TANK_TOP,
          set: { 'stop-bk': { rot: [0, 0, 0], dur: 0.9 } },
          highlight: ['stop-bk'],
          zoom: { target: 'stop-bk', dir: [0.3, 1, 0.75], dist: 110, caption: '塞子按到底，不要歪' },
          chips: [sh('安装方法 2 · ⑥')],
        },
        {
          id: 'fill-y', title: '逐色注墨 ① 黄色 Y', page: 2,
          desc: '按同样的步骤给黄色墨仓注墨：打开 Y 墨仓塞 → 拧下瓶盖 → 墨瓶竖直插入 Y 注入口，墨水到上线自动停止。',
          camera: fillView('y'),
          set: {
            'stop-y': { rot: STOP_OPEN, dur: 0.8 },
            'cap-y': capOff('y'),
            'bottle-y': insert('y', 0.9),
            'ink-y': { visible: true, delay: 2.9, dur: 0.3 },
          },
          highlight: ['bottle-y', 'ink-y'],
          zoom: zoomWindow('y', '黄色 Y 注到上线'),
          chips: [{ label: '颜色', sub: 'Y 黄' }, sh('安装方法 2 · ⑦')],
        },
        {
          id: 'fill-m', title: '逐色注墨 ② 洋红 M', page: 2,
          desc: '取下黄色墨瓶、盖好瓶盖并按紧 Y 墨仓塞；再打开 M 墨仓塞，插入洋红墨瓶。',
          camera: fillView('m'),
          set: {
            'bottle-y': pullOut('y'), 'cap-y': capOn('y', 1.7), 'stop-y': { rot: [0, 0, 0], delay: 1.5, dur: 0.7 },
            'stop-m': { rot: STOP_OPEN, delay: 1.5, dur: 0.8 }, 'cap-m': capOff('m', 1.5),
            'bottle-m': insert('m', 2.4), 'ink-m': { visible: true, delay: 4.3, dur: 0.3 },
          },
          highlight: ['bottle-m', 'ink-m'],
          zoom: zoomWindow('m', '洋红 M 注到上线'),
          chips: [{ label: '颜色', sub: 'M 洋红' }, sh('安装方法 2 · ⑦')],
        },
        {
          id: 'fill-c', title: '逐色注墨 ③ 青色 C', page: 2,
          desc: '取下洋红墨瓶并按紧 M 墨仓塞；再打开最右边的 C 墨仓塞，插入青色墨瓶。',
          camera: fillView('c'),
          set: {
            'bottle-m': pullOut('m'), 'cap-m': capOn('m', 1.7), 'stop-m': { rot: [0, 0, 0], delay: 1.5, dur: 0.7 },
            'stop-c': { rot: STOP_OPEN, delay: 1.5, dur: 0.8 }, 'cap-c': capOff('c', 1.5),
            'bottle-c': insert('c', 2.4), 'ink-c': { visible: true, delay: 4.3, dur: 0.3 },
          },
          highlight: ['bottle-c', 'ink-c'],
          zoom: zoomWindow('c', '青色 C 注到上线'),
          chips: [{ label: '颜色', sub: 'C 青' }, sh('安装方法 2 · ⑦')],
        },
        {
          id: 'close', title: '取下墨瓶，盖好墨仓塞和墨仓盖', page: 2,
          desc: '取下青色墨瓶并盖紧瓶盖，按紧 C 墨仓塞，最后盖上墨仓盖并按紧。',
          camera: { target: [250, 110, 145], dir: [0.6, 0.6, 1], dist: 800 },
          set: {
            'bottle-c': pullOut('c'), 'cap-c': capOn('c', 1.7), 'stop-c': { rot: [0, 0, 0], delay: 1.5, dur: 0.7 },
            'tank-cover': { rot: [0, 0, 0], delay: 2.4, dur: 1.2 },
          },
          highlight: ['tank-cover', 'bottle-c'],
          chips: [sh('安装方法 2 · ⑤⑥⑧')],
        },
      ],
    },

    // ---------------- 3. 开机充墨与装纸 ----------------
    {
      id: 'charge', title: '开机充墨与装纸', kind: 'assembly',
      start: { ...READY, ...show('paper') },
      steps: [
        {
          id: 'power-on', title: '开机', page: 2,
          desc: '按电源键开机。Wi-Fi 指示灯和 Wi-Fi Direct 指示灯交替闪烁，电源灯和墨水灯亮起（墨水灯亮表示还没有完成首次充墨）。',
          camera: PANEL,
          set: {
            'led-power': { light: 'on', color: GREEN, delay: 0.5 },
            'led-wifi': { light: 'blink', color: GREEN, delay: 0.5 },
            'led-wifid': { light: 'blink', color: GREEN, delay: 0.5 + HALF_BLINK },
            'led-ink': { light: 'on', color: ORANGE, delay: 1.3 },
          },
          actions: [{ type: 'press', part: 'btn-power' }],
          highlight: ['btn-power', 'led-power', 'led-wifi', 'led-wifid', 'led-ink'],
          zoom: zoomPanel('led-wifi', 'Wi-Fi 两灯交替闪烁 · 电源灯亮', 120),
          chips: [{ label: '墨水灯', sub: '亮 = 尚未充墨' }, sh('安装方法 2 · ⑨')],
        },
        {
          id: 'charge', title: '按住停止键 5 秒，开始充墨', page: 2,
          desc: '确认四个墨仓都已注入墨水，按住停止键 5 秒钟。电源灯开始闪烁，打印机给打印头充墨，大约需要 11 分钟。（Wi-Fi 两灯交替闪烁表示等待网络设置，演示从这一步起不再显示，见「连接 Wi-Fi」。）',
          camera: PANEL,
          set: {
            'led-power': { light: 'blink', delay: 1 }, 'led-ink': { light: 'off', delay: 1 },
            'led-wifi': { light: 'off', delay: 1 }, 'led-wifid': { light: 'off', delay: 1 },
          },
          actions: [{ type: 'press', part: 'btn-stop', delay: 0.2 }],
          highlight: ['btn-stop', 'led-power'],
          zoom: zoomPanel('btn-stop', '按住停止键 5 秒 → 电源灯闪烁'),
          tip: '充墨过程中不要拔电源线、不要按电源键关机、不要打开前盖，否则会浪费墨水。',
          chips: [{ label: '按住', sub: '5 秒' }, { label: '充墨', sub: '约 11 分钟' }, sh('安装方法 2 · ⑩')],
        },
        {
          id: 'charged', title: '电源灯常亮：充墨完成', page: 2,
          desc: '电源灯停止闪烁、保持亮起，首次充墨完成。随附墨瓶中剩余的墨水可以日后补充到墨仓。',
          camera: PANEL,
          set: { 'led-power': { light: 'on', delay: 0.2 } },
          highlight: ['led-power'],
          zoom: zoomPanel('led-power', '电源灯常亮 = 充墨完成', 100),
          chips: [{ label: '约', sub: '11 分钟后' }, sh('安装方法 2 · ⑩⑯')],
        },
        {
          id: 'feeder', title: '打开进纸器挡板，拉出纸托', page: 25,
          desc: '后进纸器在机身顶面后部。把进纸器挡板向前翻开，再把纸托向上拉出。',
          camera: FEEDER,
          set: {
            'feeder-guard': { rot: GUARD_OPEN, dur: 1 },
            support: { visible: true, at: SUPPORT_UP, delay: 1, dur: 1.1 },
          },
          highlight: ['feeder-guard', 'support'],
          chips: [{ label: '用户指南', sub: '在后进纸器中装入打印纸 · 1' }],
        },
        {
          id: 'guides-out', title: '滑开侧导轨', page: 25,
          desc: '把两侧的侧导轨向外滑开。',
          camera: { ...FEEDER, target: [-40, 200, -160], dist: 700 },
          set: { 'guide-l': guide(-1, 124), 'guide-r': guide(1, 124) },
          highlight: ['guide-l', 'guide-r'],
          zoom: { target: 'guide-r', dir: [0.3, 0.7, 1], dist: 120, caption: '侧导轨向两侧滑开' },
          chips: [{ label: '用户指南', sub: '装入打印纸 · 2' }],
        },
        {
          id: 'load', title: 'A4 纸打印面朝上，装入纸托中央', page: 26,
          desc: '把 A4 普通纸短边朝下、可打印面朝上，装入纸托中央。',
          camera: PAPER_VIEW,
          set: { paper: { parent: 'body', at: PAPER_IN, rot: LEAN, via: viaDownTo(PAPER_DESK_AT, PAPER_IN, 600), dur: 2 } },
          highlight: ['paper'],
          tip: '普通纸不要高于侧导轨内 ▼ 符号下方的界线；先装入短边。',
          chips: [{ label: '纸张', sub: 'A4 普通纸 · 打印面朝上' }, { label: '用户指南', sub: '装入打印纸 · 3' }],
        },
        {
          id: 'guides-in', title: '侧导轨贴紧纸边，关闭挡板', page: 26,
          desc: '把侧导轨滑到打印纸边缘，然后关闭进纸器挡板。',
          camera: { ...FEEDER, target: [-40, 250, -150], dist: 950 },
          set: {
            'guide-l': guide(-1, 110), 'guide-r': guide(1, 110),
            'feeder-guard': { rot: GUARD_CLOSED, delay: 0.8, dur: 0.9 },
          },
          highlight: ['guide-l', 'guide-r', 'feeder-guard'],
          zoom: { target: 'guide-r', dir: [0.3, 0.7, 1], dist: 120, caption: '侧导轨贴住纸边' },
          tip: '请勿在进纸器挡板上放置任何物品，否则会影响进纸。',
          chips: [{ label: '用户指南', sub: '装入打印纸 · 4' }],
        },
        {
          id: 'tray', title: '拉出出纸器，抬起挡纸器', page: 26,
          desc: '滑出正面的出纸器，再把前端的挡纸器翻起来，防止打印输出从出纸器上掉落。',
          camera: FRONT_LOW,
          set: { tray: { at: [PX, 9, 195], dur: 1 }, 'tray-stop': { rot: [90, 0, 0], delay: 1.1, dur: 0.6 } },
          highlight: ['tray', 'tray-stop'],
          chips: [{ label: '用户指南', sub: '装入打印纸 · 5' }, sh('安装方法 2 · ⑪')],
        },
      ],
    },

    // ---------------- 4. Wi-Fi ----------------
    {
      id: 'wifi', title: '连接 Wi-Fi（WPS 一键设置）', kind: 'usage',
      start: { ...READY, ...POWER_ON, ...PAPER_LOADED, ...TRAY_OUT, ...show('router', 'phone') },
      steps: [
        {
          id: 'wps-router', title: '按住路由器的 WPS 键', page: 147,
          desc: '路由器需支持 WPS。按住无线路由器上的 [WPS] 按钮，直到安全指示灯闪烁。',
          camera: ROUTER_VIEW,
          set: { 'router-led': { light: 'blink', color: BLUE, delay: 0.8 } },
          actions: [{ type: 'press', part: 'router-wps' }],
          highlight: ['router-wps', 'router-led'],
          zoom: { target: [-352, 28, -138], dir: [0.15, 1, 0.6], dist: 200, caption: '按住 WPS 键 → 安全指示灯闪烁' },
          tip: '找不到 WPS 按钮或想用软件设置，请看路由器附带的文档。',
          chips: [{ label: '用户指南', sub: '一键加密设置 · 1' }],
        },
        {
          id: 'wps-printer', title: '按住 Wi-Fi 键 5 秒以上', page: 147,
          desc: '按住打印机上的 Wi-Fi 键至少 5 秒，直到 Wi-Fi 指示灯和 Wi-Fi Direct 指示灯交替闪烁，开始连接。',
          camera: PANEL,
          set: {
            'led-wifi': { light: 'blink', color: GREEN, delay: 0.8 },
            'led-wifid': { light: 'blink', color: GREEN, delay: 0.8 + HALF_BLINK },
          },
          actions: [{ type: 'press', part: 'btn-wifi' }],
          highlight: ['btn-wifi', 'led-wifi', 'led-wifid'],
          zoom: zoomPanel(panelAt(-100), 'Wi-Fi 两灯交替闪烁 = 正在连接', 120),
          chips: [{ label: '按住', sub: '≥ 5 秒' }, { label: '用户指南', sub: '一键加密设置 · 2' }],
        },
        {
          id: 'connected', title: 'Wi-Fi 灯常亮：已连接', page: 147,
          desc: '连接建立后 Wi-Fi 指示灯保持亮起，Wi-Fi Direct 指示灯熄灭。',
          camera: PANEL,
          set: {
            'led-wifi': { light: 'on', delay: 0.3 },
            'led-wifid': { light: 'off', delay: 0.3 },
            'router-led': { light: 'off', delay: 0.3 },
          },
          highlight: ['led-wifi'],
          zoom: zoomPanel('led-wifi', 'Wi-Fi 灯常亮 = 已连上无线网络', 90),
          chips: [{ label: 'Wi-Fi 灯', sub: '常亮' }],
        },
        {
          id: 'app', title: '在手机上完成设置', page: 1,
          desc: '《首先阅读》推荐的安装方法 1：在手机上安装 Epson Smart Panel，按应用提示完成剩余设置，之后可在手机上远程打印、扫描。用电脑打印请访问 epson.sn 或用随附光盘安装驱动；Windows 10 / Mac 可在同一网络下，于“设备和打印机”或“打印机与扫描仪”中添加打印机。',
          camera: PHONE_VIEW,
          set: { 'phone-screen': { ui: SMART_PANEL, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [sh('安装方法 1 · Epson Smart Panel')],
        },
        {
          id: 'wifi-error', title: '两灯同时闪烁：连接出错', page: 148,
          desc: 'Wi-Fi 指示灯和 Wi-Fi Direct 指示灯同时闪烁，表示连接出错。按 Wi-Fi 键清除错误，重启路由器并把它放到靠近打印机的位置后重试；仍不行，装纸后按网络键 [i] 打印网络连接报告查看原因（第 151 页）。',
          camera: PANEL,
          set: {
            'led-wifi': { light: 'blink', delay: 0.3 },
            'led-wifid': { light: 'blink', delay: 0.3 },
          },
          highlight: ['led-wifi', 'led-wifid', 'btn-wifi', 'btn-info'],
          zoom: zoomPanel(panelAt(-100), '两灯同时闪烁 = 连接错误', 120),
          callouts: [
            { part: 'btn-wifi', text: 'Wi-Fi 键', sub: '清除错误', offset: [-20, 40, 30] },
            { part: 'btn-info', text: '网络键 [i]', sub: '打印网络连接报告', offset: [30, 40, 30] },
          ],
          chips: [{ label: '用户指南', sub: '第 148、151 页' }],
        },
      ],
    },

    // ---------------- 5. 排障 ----------------
    {
      id: 'repair', title: '夹纸 · 指示灯 · 喷嘴检查', kind: 'repair',
      start: {
        ...READY, ...POWER_ON, ...PAPER_LOADED, ...TRAY_OUT,
        paper: { visible: true, parent: 'body', at: PAPER_JAM, rot: LEAN },
      },
      steps: [
        {
          id: 'jam-led', title: '纸张灯闪烁：发生夹纸', page: 20,
          desc: '纸张指示灯（橙色）闪烁表示发生夹纸。按下面的顺序取出打印纸，包括所有碎片。',
          camera: { target: [-40, 230, -30], dir: [0.25, 0.6, 1], dist: 1150 },
          set: { 'led-paper': { light: 'blink', color: ORANGE, delay: 0.3 } },
          highlight: ['led-paper', 'paper'],
          zoom: zoomPanel('led-paper', '纸张灯闪烁 = 夹纸', 100),
          callouts: [{ part: 'paper', text: '卡在后进纸器的纸', at: [0, -60, 0], offset: [-150, 40, 40] }],
          chips: [{ label: '纸张灯', sub: '橙色闪烁' }],
        },
        {
          id: 'jam-rear', title: '夹纸：先从后进纸器取出', page: 118,
          desc: '从后进纸器把卡住的打印纸慢慢向上抽出。',
          camera: { target: [-170, 210, -90], dir: [0.3, 0.6, 1], dist: 1150 },
          set: { paper: { ...PAPER_DESK, via: viaUpFrom(PAPER_JAM, PAPER_DESK_AT, 600), dur: 2 } },
          highlight: ['paper'],
          tip: '请小心取出，用力过猛可能损坏本产品；取纸时不要倾斜、竖放或倒置打印机，否则墨水可能泄漏。',
          chips: [{ label: '用户指南', sub: '取出夹纸 · 1' }],
        },
        {
          id: 'jam-cover', title: '夹纸：打开前盖', page: 118,
          desc: '把正面的前盖向前翻开，可以看到机内卡住的纸。',
          camera: FRONT_LOW,
          set: { 'front-cover': { rot: [90, 0, 0], dur: 1.1 }, sheet: { visible: true, delay: 1.1, dur: 0.3 } },
          highlight: ['front-cover', 'sheet'],
          chips: [{ label: '用户指南', sub: '取出夹纸 · 2' }],
        },
        {
          id: 'jam-scan', title: '夹纸：打开扫描部件', page: 118,
          desc: '双手抬起扫描部件，直到听到“咔嗒”声，扫描部件支撑杆会把它撑住。',
          camera: JAM_VIEW,
          set: { scanner: { rot: [-30, 0, 0], dur: 1.4 } },
          highlight: ['scanner'],
          tip: '手在机内时切勿触按操作面板上的按钮；不要触碰机内的白色扁平电缆、半透明管和打印头附近的部件。',
          chips: [{ label: '用户指南', sub: '取出夹纸 · 3' }],
        },
        {
          id: 'jam-inner', title: '夹纸：取出机内的纸', page: 119,
          desc: '把机内卡住的打印纸慢慢拉出来，确认没有残留碎片。',
          camera: FRONT_LOW,
          set: { sheet: { parent: null, at: [-60, 0.6, 330], rot: [0, 0, 0], via: [-45, 80, 240], visible: false, dur: 1.4 } },
          highlight: ['sheet'],
          tip: '请勿触碰机内部件，否则可能引起故障。',
          chips: [{ label: '用户指南', sub: '取出夹纸 · 4' }],
        },
        {
          id: 'jam-scan-close', title: '夹纸：分两步关闭扫描部件', page: 120,
          desc: '为了保证安全，扫描部件分两步关闭：先稍微抬起再放下到中途停住，再抬起一点后按到底。',
          camera: JAM_VIEW,
          set: { scanner: { rot: [0, 0, 0], dur: 1.6 } },
          highlight: ['scanner'],
          tip: '必须完全关闭扫描部件后，才能再次将其打开。',
          chips: [{ label: '用户指南', sub: '取出夹纸 · 5' }],
        },
        {
          id: 'jam-cover-close', title: '夹纸：关闭前盖', page: 120,
          desc: '把前盖翻回去关好。',
          camera: FRONT_LOW,
          set: { 'front-cover': { rot: [0, 0, 0], dur: 1.1 } },
          highlight: ['front-cover'],
          chips: [{ label: '用户指南', sub: '取出夹纸 · 6' }],
        },
        {
          id: 'jam-clear', title: '装好纸，按复印键清除错误', page: 20,
          desc: '在后进纸器装入打印纸，按黑白或彩色复印键清除错误，纸张灯熄灭。',
          camera: { target: [-40, 230, -30], dir: [0.25, 0.6, 1], dist: 1150 },
          set: {
            paper: { parent: 'body', at: PAPER_IN, rot: LEAN, via: viaDownTo(PAPER_DESK_AT, PAPER_IN, 600), dur: 2 },
            'led-paper': { light: 'off', delay: 2.6 },
          },
          actions: [{ type: 'press', part: 'btn-copy', delay: 2.2 }],
          highlight: ['paper', 'btn-copy'],
          zoom: zoomPanel('btn-copy', '按复印键 → 纸张灯熄灭', 120),
          tip: '关机再开仍报夹纸：机内可能还有残纸。在后进纸器纵向装入 A4 纸，再按复印键把残纸带出来。',
          chips: [{ label: '用户指南', sub: '检查指示灯 · 夹纸' }],
        },
        {
          id: 'bad-off', title: '墨水灯和纸张灯常亮：没有正确关机', page: 21,
          desc: '上次是用插线板或断路器断电、直接拔插头或停电关掉的，工作中断电时喷嘴可能干结堵塞。按复印键清除错误后，建议做一次喷嘴检查。',
          camera: PANEL,
          set: { 'led-ink': { light: 'on', color: ORANGE, delay: 0.3 }, 'led-paper': { light: 'on', color: ORANGE, delay: 0.3 } },
          highlight: ['led-ink', 'led-paper'],
          zoom: zoomPanel('led-ink', '墨水灯 + 纸张灯常亮 = 未正确关机', 100),
          tip: '以后关机请务必按电源键，确认电源灯熄灭后再拔电源线。',
          chips: [{ label: '指示灯', sub: '墨水 + 纸张 常亮' }],
        },
        {
          id: 'nozzle', title: '打印喷嘴检查图案', page: 71,
          desc: '清除错误后，按电源键关机；再按住停止键的同时按电源键开机，电源灯闪烁时松开。打印机在 A4 纸上打印喷嘴检查图案。',
          camera: { target: [-60, 110, 150], dir: [0.15, 0.85, 1], dist: 720 },
          set: {
            'led-ink': { light: 'off' }, 'led-paper': { light: 'off' },
            printout: { visible: true, delay: 1.6, dur: 0.3 },
          },
          actions: [{ type: 'press', part: 'btn-stop', delay: 0.3 }, { type: 'press', part: 'btn-power', delay: 0.6 }],
          highlight: ['btn-stop', 'btn-power', 'printout'],
          zoom: zoomPanel(panelAt(-67.5), '按住停止键 + 按电源键开机', 290),
          chips: [{ label: '电源灯', sub: '熄灭 → 闪烁 → 亮起' }, sh('安装方法 2 · ⑬')],
        },
        {
          id: 'clean', title: '图案线条断续：清洗打印头', page: 71,
          desc: '线条完整无需处理；部分线条断续（图案 B）表示部分喷嘴堵塞：按住停止键 5 秒，电源灯开始闪烁，打印头清洗开始。电源灯停止闪烁后再打印一次图案检查。',
          camera: { target: [-60, 110, 150], dir: [0.15, 0.85, 1], dist: 720 },
          set: { 'led-power': { light: 'blink', delay: 0.9 } },
          actions: [{ type: 'press', part: 'btn-stop', delay: 0.3 }],
          highlight: ['printout', 'btn-stop', 'led-power'],
          zoom: { target: 'printout', offset: [-40, 0, 25], dir: [0.05, 1, 0.35], dist: 200, caption: '黑色线条断续 → 清洗打印头' },
          tip: '重复 3 次喷嘴检查和清洗仍未改善：关机等待至少 12 小时后再试；仍不行请运行深度清洗（用户指南第 72 页）。',
          chips: [{ label: '按住', sub: '5 秒' }, { label: '清洗', sub: '约 3 分钟' }],
        },
        {
          id: 'printer-error', title: '电源灯与所有灯闪烁：打印机错误', page: 21,
          desc: '取出本产品内的所有打印纸，关闭电源后重新打开。如果仍然发生错误，请联系爱普生认证服务机构。',
          camera: PANEL,
          set: {
            'led-wifi': { light: 'blink', color: GREEN },
            'led-wifid': { light: 'blink', color: GREEN },
            'led-ink': { light: 'blink', color: ORANGE },
            'led-paper': { light: 'blink', color: ORANGE },
          },
          highlight: ['led-power', 'led-wifi', 'led-wifid', 'led-ink', 'led-paper'],
          zoom: zoomPanel(panelAt(-58), '电源灯与全部指示灯闪烁 = 打印机错误', 300),
          chips: [{ label: '处理', sub: '取出所有纸 → 关机再开' }],
        },
      ],
    },
  ],
}
