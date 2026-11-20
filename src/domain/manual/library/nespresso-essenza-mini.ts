import type { CameraSpec, ManualSpec, PartState, SpecPart, Vec3 } from '../types'

/**
 * Nespresso Essenza Mini 胶囊咖啡机（C30）
 * 说明书：Nespresso 中国官方机器指南站的 Original 系列通用说明书（36 页，图示 + 多语），
 * 按钮名、步骤编号、灯语补充自 nespresso.com 的 Essenza Mini 专用中英文说明书（Z3-C 2017），逐页转写见 manuals-src/nespresso-essenza-mini/transcript.md
 *
 * 坐标：毫米，y 向上，台面 y = 0，观众在 +z。机身原点在底面中心，正面（手柄、咖啡出口、滴水盘）朝 +z，水箱在背后（-z），x 为宽度。
 *
 * 推断（说明书没有给出）：
 * - 外形 84 × 204 × 330 mm 来自规格表；机身壳体深 205 mm、机头前伸 20 mm、滴水盘伸出 48 mm、水箱 Ø74 × 180 mm 按产品照片比例估计。
 * - 两个咖啡键在顶面手柄板后方，左浓缩（小杯）右大杯（大杯），取自苏宁自营商品页的顶面特写；按键灯颜色说明书未写，照片里是黄绿色。
 * - 粉囊盒站在机身凹腔的底板上，滴水盘在它前面、托着杯子；首次使用和除垢时取下滴水盘，1 L 容器直接放在台面上接水（p11、p17 图）。
 * - 胶囊铝盖朝前、轴线前后放入手柄下的胶囊仓；电源线从机身右后侧引出，插到右后方的插线板上。
 *
 * 外观模型：主机、水箱、粉囊盒、滴水盘各取苏宁自营 C30 白色「包装说明」图里的一件生成（models/nespresso-essenza-mini/tripo.json，来源 refs/sources.json）。
 * 主机模型背后自带的一小块水箱底座裁掉（crop），水箱底座改用几何体；模型里合着的手柄标 baked，抬起手柄的步骤主机改画代理形状。
 * 顶上两个咖啡键要按、要亮灯，生成前在参考图里抹平，按键做几何体。
 */

const LIT = '#c8e65a'

const TANK_HOME: Vec3 = [0, 102, -143]
const TANK_ASIDE: Vec3 = [-150, 90, -150]
const TANK_VIA: Vec3 = [0, 250, -165]
const TRAY_HOME: Vec3 = [0, 0, 106]
const TRAY_ASIDE: Vec3 = [-175, 0, 150]
const TRAY_VIA: Vec3 = [0, 30, 230]
const BIN_HOME: Vec3 = [0, 58, 39]
const BIN_ASIDE: Vec3 = [-165, 48, 45]
const BIN_VIA: Vec3 = [0, 66, 175]
const CUP_HOME: Vec3 = [0, 63, 108]
const CUP_ASIDE: Vec3 = [150, 29, 150]
const CAPSULE_COUNTER: Vec3 = [60, 18.5, 235]
const CAPSULE_IN: Vec3 = [0, 182, 55]
const CAPSULE_IN_BIN: Vec3 = [0, -25, 0]
const CUP_VIA: Vec3 = [0, 100, 210]
const BOTTLE_ASIDE_POUR: Vec3 = [-47, 285, -150]
const BOTTLE_HOME_POUR: Vec3 = [103, 300, -143]

const LEVER_OPEN: PartState = { rot: [-90, 0, 0], dur: 1.0 }
const LEVER_CLOSED: PartState = { rot: [0, 0, 0], dur: 1.0 }
const LID_OPEN: PartState = { rot: [-100, 0, 0], dur: 0.8 }
const LID_CLOSED: PartState = { rot: [0, 0, 0], dur: 0.8 }

const tankOut = (delay = 0): PartState => ({ at: TANK_ASIDE, via: TANK_VIA, delay, dur: 1.6 })
const tankIn = (delay = 0): PartState => ({ at: TANK_HOME, via: TANK_VIA, delay, dur: 1.6 })
const trayOut = (delay = 0): PartState => ({ parent: null, at: TRAY_ASIDE, rot: [0, 0, 0], via: TRAY_VIA, delay, dur: 1.5 })
const trayIn = (delay = 0): PartState => ({ parent: 'body', at: TRAY_HOME, rot: [0, 0, 0], via: TRAY_VIA, delay, dur: 1.5 })
const binOut = (delay = 0): PartState => ({ parent: null, at: BIN_ASIDE, rot: [0, 0, 0], via: BIN_VIA, delay, dur: 1.5 })
const binIn = (delay = 0): PartState => ({ parent: 'body', at: BIN_HOME, rot: [0, 0, 0], via: BIN_VIA, delay, dur: 1.5 })
const leds = (light: PartState['light'], delay = 0): Record<string, PartState> => ({
  'led-esp': { light, color: LIT, delay },
  'led-lungo': { light, color: LIT, delay },
})
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }])) as Record<string, PartState>

// ---------- 零件 ----------

const parts: SpecPart[] = [
  {
    id: 'body', name: '咖啡机主机', spec: 'Essenza Mini C30 · 84 × 204 mm',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 84, d: 115, h: 204, r: 6, at: [0, 0, -47.5] },
        { type: 'box', size: [4, 204, 90], at: [-40, 102, 55] },
        { type: 'box', size: [4, 204, 90], at: [40, 102, 55] },
        { type: 'box', size: [76, 10, 56], at: [0, 5, 38], fill: 'dark' },
        { type: 'slab', w: 76, d: 110, h: 58, r: 8, at: [0, 146, 65], fill: 'dark' },
        { type: 'hole', w: 10, h: 10, r: 5, at: [0, 145.7, 108], rot: [90, 0, 0] },
        { type: 'hole', w: 30, h: 44, r: 6, at: [0, 204.3, 55], rot: [-90, 0, 0], finish: { color: '#141414', roughness: 0.95 } },
        { type: 'text', text: 'NESPRESSO', size: 5, at: [0, 204.3, -32], rot: [-90, 0, 0] },
      ],
    },
    model: { src: '/models/nespresso-essenza-mini/body.glb', rot: [0, -90, 0], fit: 'stretch', crop: { min: [0, 0, 0.12] } },
  },
  {
    id: 'lever', name: '操作手柄', spec: '完全抬起放胶囊 · 抬起再合上退出胶囊', parent: 'body',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 36, d: 116, h: 5, r: 4, at: [0, 0, 58] },
        { type: 'cylinder', r: 12, h: 6, at: [0, 8, 100] },
      ],
    },
    at: [0, 204, 4], fill: 'dark', baked: true,
  },
  { id: 'btn-esp', name: '浓缩咖啡键', spec: '出厂 40 ml', parent: 'body', shape: { type: 'cylinder', r: 6.5, h: 3 }, at: [-12, 205.5, -14], fill: 'dark' },
  { id: 'btn-lungo', name: '大杯咖啡键', spec: '出厂 110 ml', parent: 'body', shape: { type: 'cylinder', r: 6.5, h: 3 }, at: [12, 205.5, -14], fill: 'dark' },
  { id: 'led-esp', name: '浓缩咖啡键指示灯', parent: 'btn-esp', shape: { type: 'led', r: 4.5, color: LIT }, at: [0, 1.6, 0], rot: [-90, 0, 0] },
  { id: 'led-lungo', name: '大杯咖啡键指示灯', parent: 'btn-lungo', shape: { type: 'led', r: 4.5, color: LIT }, at: [0, 1.6, 0], rot: [-90, 0, 0] },
  { id: 'tank-seat', name: '水箱底座', parent: 'body', shape: { type: 'cylinder', r: 39, h: 12 }, at: [0, 6, -143], fill: 'dark' },
  {
    id: 'tank', name: '水箱', spec: '0.6 L', shape: { type: 'cylinder', r: 37, h: 180 }, at: TANK_HOME,
    finish: { color: '#dfe7ea', roughness: 0.12 },
    model: { src: '/models/nespresso-essenza-mini/tank.glb' },
  },
  { id: 'tank-lid', name: '水箱盖', spec: '后沿铰链', parent: 'tank', shape: { type: 'cylinder', r: 37, h: 6 }, at: [0, 90, -37], pivot: [0, 3, 37], fill: 'dark' },
  {
    id: 'bin', name: '粉囊盒', spec: '可容纳 5–6 粒用过的胶囊', parent: 'body', shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [66, 4, 50], at: [0, -46, 0] },
        { type: 'box', size: [66, 96, 3], at: [0, 0, 23.5] },
        { type: 'box', size: [66, 96, 3], at: [0, 0, -23.5] },
        { type: 'box', size: [3, 96, 44], at: [31.5, 0, 0] },
        { type: 'box', size: [3, 96, 44], at: [-31.5, 0, 0] },
      ],
    },
    at: BIN_HOME, fill: 'dark',
    model: { src: '/models/nespresso-essenza-mini/bin.glb', rot: [0, -90, -25] },
  },
  {
    id: 'tray', name: '滴水盘（含滴水隔栅）', spec: '每天清空', parent: 'body',
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 76, d: 44, h: 34, r: 3, at: [0, 0, -18] },
        { type: 'cylinder', r: 38, h: 34, at: [0, 17, 4] },
      ],
    },
    at: TRAY_HOME, fill: 'dark',
    model: { src: '/models/nespresso-essenza-mini/tray.glb', rot: [0, -67, 0] },
  },
  {
    id: 'cup', name: '咖啡杯', spec: '大杯 110 ml',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 24, r2: 31, h: 58 },
        { type: 'box', size: [8, 30, 9], chamfer: 3, at: [33, 4, 0] },
      ],
    },
    at: CUP_ASIDE, finish: { color: '#f4f2ee', roughness: 0.25 },
  },
  { id: 'coffee', name: '咖啡', parent: 'cup', shape: { type: 'cylinder', r: 29.5, h: 1 }, at: [0, 29.3, 0], fill: 'shade', finish: { color: '#5a3a22', roughness: 0.3 }, visible: false },
  { id: 'coffee-flow', name: '咖啡流', parent: 'cup', shape: { type: 'cylinder', r: 2.5, h: 52 }, at: [0, 56.5, 0], fill: 'shade', finish: { color: '#6b4428', roughness: 0.3 }, visible: false },
  {
    id: 'capsule', name: 'Nespresso 咖啡胶囊', spec: '铝盖朝前放入',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 11, r2: 18, h: 26 },
        { type: 'cylinder', r: 18.5, h: 1.5, at: [0, 13.7, 0], finish: { color: '#b9b2c4', roughness: 0.3, metalness: 0.9 } },
      ],
    },
    at: CAPSULE_COUNTER, rot: [90, 0, 0], fill: 'shade', finish: { color: '#5b3f86', roughness: 0.32, metalness: 0.85 }, visible: false,
  },
  { id: 'beaker', name: '容器（≥ 1 L）', shape: { type: 'cylinder', r: 50, h: 130 }, at: [0, 65, 152], finish: { color: '#e3ecf0', roughness: 0.1 }, visible: false },
  { id: 'water-flow', name: '出水', parent: 'beaker', shape: { type: 'cylinder', r: 2.5, h: 60 }, at: [0, 51, -44], finish: { color: '#cfe3ee', roughness: 0.1 }, visible: false },
  {
    id: 'bottle', name: '饮用水瓶',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 32, h: 160 },
        { type: 'cylinder', r: 12, r2: 10, h: 30, at: [0, 95, 0] },
      ],
    },
    at: BOTTLE_HOME_POUR, rot: [0, 0, 110], finish: { color: '#d8e6ee', roughness: 0.15 }, visible: false,
  },
  {
    id: 'sachet', name: 'Nespresso 除垢剂（1 份）', spec: '每次除垢用 1 份',
    shape: { type: 'compound', items: [{ type: 'box', size: [60, 100, 4], chamfer: 1 }, { type: 'text', text: 'DESCALING', size: 7, at: [0, 10, 2.2] }] },
    at: [-60, 245, -143], rot: [0, 0, 40], finish: { color: '#e9eef2', roughness: 0.6 }, visible: false,
  },
  {
    id: 'strip', name: '插线板', shape: { type: 'box', size: [60, 30, 160], chamfer: 4 }, at: [170, 15, -120],
  },
  { id: 'socket', name: '插座', parent: 'strip', shape: { type: 'hole', w: 30, h: 20, r: 4 }, at: [0, 15.2, -40], rot: [-90, 0, 0] },
  {
    id: 'plug', name: '电源插头',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [26, 22, 34], chamfer: 4, at: [-13, 0, 0] },
        { type: 'cylinder', r: 2, h: 14, axis: 'x', at: [7, 0, 6], fill: 'shade', finish: 'steel' },
        { type: 'cylinder', r: 2, h: 14, axis: 'x', at: [7, 0, -6], fill: 'shade', finish: 'steel' },
      ],
    },
  },
  { id: 'cord', name: '电源线', shape: { type: 'cable', from: { part: 'body', at: [42, 15, -90], dir: [1, 0, 0] }, to: { part: 'plug', at: [-26, 0, 0], dir: [-1, 0, 0] }, r: 2.6, slack: 0.4 } },
]

// ---------- 状态 ----------

const PLUG_LOOSE: PartState = { parent: null, at: [175, 11, -10], rot: [0, 0, 0] }

const READY: Record<string, PartState> = {
  plug: { plug: 'socket' },
  ...leds('on'),
}

// ---------- 镜头 ----------

const OVERVIEW: CameraSpec = { target: [0, 110, 0], dir: [0.8, 0.55, 1], dist: 980 }
const FRONT: CameraSpec = { target: [0, 110, 90], dir: [0.45, 0.35, 1], dist: 720 }
const FRONT_LOW: CameraSpec = { target: [-40, 90, 110], dir: [0.3, 0.25, 1], dist: 820 }
const TOP: CameraSpec = { target: [0, 185, 0], dir: [0.4, 0.9, 1], dist: 700 }
const BACK: CameraSpec = { target: [-30, 140, -130], dir: [-0.8, 0.6, -0.6], dist: 860 }
const POWER: CameraSpec = { target: [120, 60, -110], dir: [1, 0.85, 0.35], dist: 820 }
const ASIDE: CameraSpec = { target: [-70, 70, 90], dir: [-0.2, 0.6, 1], dist: 900 }

const zoomButtons = (caption: string): CameraSpec & { caption: string } => ({ target: 'btn-esp', offset: [12, 0, 0], dir: [0.25, 1, 0.55], dist: 130, caption })
const zoomLungo = (caption: string): CameraSpec & { caption: string } => ({ target: 'btn-lungo', dir: [0.25, 1, 0.55], dist: 110, caption })
const zoomEsp = (caption: string): CameraSpec & { caption: string } => ({ target: 'btn-esp', dir: [0.25, 1, 0.55], dist: 110, caption })

// ---------- 说明书 ----------

export const nespressoEssenzaMini: ManualSpec = {
  id: 'nespresso-essenza-mini',
  name: 'Nespresso Essenza Mini 胶囊咖啡机',
  desc: '胶囊咖啡机 C30：首次使用、制作咖啡、清洁、除垢、杯量设置与故障',
  category: '小厨电',
  dims: { width: 84, depth: 330, height: 204 },
  source: {
    title: 'Nespresso Original 系列使用说明书（CitiZ / Essenza Mini / Inissia / Pixie）· Essenza Mini C30',
    url: 'https://machineguidance.nespressochina.com/media/pages/original-series/essenza-mini/essenza-mini-c30/94517ff490-1779237540/um_new-layout_original_3_web_2021_07_13.pdf',
    images: [],
  },
  package: [
    { name: '咖啡机主机', qty: 1, spec: 'C30，含操作手柄、咖啡键' },
    { name: '水箱和水箱盖', qty: 1, spec: '0.6 L' },
    { name: '粉囊盒', qty: 1, spec: '可容纳 5–6 粒用过的胶囊' },
    { name: '滴水盘 + 滴水隔栅', qty: 1 },
    { name: 'Nespresso 咖啡胶囊品鉴装', qty: 1 },
    { name: '使用指南 / 安全须知', qty: 1 },
  ],
  params: [
    { label: '型号', value: 'C30' },
    { label: '电源', value: '220 V~ 50 Hz · 1200 W', note: '中国版' },
    { label: '最大压力', value: '19 bar（1.9 MPa）' },
    { label: '重量', value: '约 2.3 kg' },
    { label: '水箱容量', value: '0.6 L' },
    { label: '外形（宽 × 高 × 深）', value: '84 × 204 × 330 mm' },
    { label: '出厂杯量', value: '浓缩 40 ml · 大杯 110 ml', note: '可自行设定' },
    { label: '预热', value: '约 30 秒', note: 'Z3-C 专用说明书写 25 秒' },
    { label: '自动关机', value: '9 分钟', note: '可改为 30 分钟' },
    { label: '除垢频率（40 ml 杯）', value: '高硬度 300 杯 · 中 600 杯 · 低 1200 杯' },
  ],
  parts,
  initial: {
    plug: { plug: 'socket' },
    'led-esp': { light: 'off', color: LIT },
    'led-lungo': { light: 'off', color: LIT },
  },
  stageSize: 900,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 首次使用 =================
    {
      id: 'first-use', title: '首次使用（或长期闲置后）', kind: 'assembly',
      start: { plug: PLUG_LOOSE, bottle: { at: BOTTLE_ASIDE_POUR, rot: [0, 0, 110] } },
      steps: [
        {
          id: 'f-overview', title: '认识咖啡机：按键、手柄、水箱、粉囊盒', page: 4,
          desc: '顶面后部是浓缩咖啡键（小杯）和大杯咖啡键（大杯），前面是操作手柄，背后是水箱和水箱盖；机身前部的凹腔里是粉囊盒，最前面是滴水盘和滴水隔栅，咖啡出口在机头下方。',
          tip: '开箱时机身表面可能有回收包材留下的灰尘，不是问题，用软纸巾擦掉即可。',
          camera: OVERVIEW,
          highlight: ['body'],
          callouts: [
            { part: 'btn-esp', text: '咖啡键', sub: '浓缩 / 大杯', offset: [0, 70, 0] },
            { part: 'lever', text: '操作手柄', at: [0, 5, 110], offset: [0, 70, 30] },
            { part: 'tank', text: '水箱 0.6 L', offset: [-60, 60, 0] },
            { part: 'bin', text: '粉囊盒', offset: [-90, 0, 40] },
            { part: 'tray', text: '滴水盘', offset: [0, -20, 70] },
          ],
        },
        {
          id: 'f-tank-out', title: '取下水箱，彻底冲洗', page: 10,
          desc: '把水箱从机身背后向上提起取下，打开水箱盖，用清水彻底冲洗水箱。',
          camera: BACK,
          set: { tank: tankOut(), 'tank-lid': { ...LID_OPEN, delay: 1.7 } },
          actions: [{ type: 'shake', part: 'tank', axis: 'x', amp: 4, delay: 2.6 }],
          highlight: ['tank', 'tank-lid'],
        },
        {
          id: 'f-fill', title: '向水箱注入饮用水', page: 11,
          desc: '往水箱里注入新鲜的冷饮用水，不超过 0.6 L 最高刻度。',
          tip: '只用冷的新鲜饮用水；周末或一段时间没用机器，先换掉水箱里剩下的水。',
          camera: BACK,
          set: { bottle: { visible: true } },
          highlight: ['bottle', 'tank'],
        },
        {
          id: 'f-tank-in', title: '盖好水箱盖，装回机身', page: 11,
          desc: '合上水箱盖，把水箱对准机身背后的水箱底座放回去。',
          camera: BACK,
          set: { ...hide('bottle'), 'tank-lid': { ...LID_CLOSED, delay: 0.6 }, tank: tankIn(1.5) },
          highlight: ['tank', 'tank-seat'],
        },
        {
          id: 'f-container', title: '在咖啡出口下方放一个 1 L 容器', page: 11,
          desc: '取下滴水盘，在咖啡出口下方放一个容量至少 1 L 的容器，用来接冲洗的水。',
          camera: FRONT_LOW,
          set: { tray: trayOut(), beaker: { visible: true, delay: 1.6 } },
          highlight: ['beaker', 'tray'],
          callouts: [{ part: 'beaker', text: '容器 ≥ 1 L', offset: [0, 90, 0] }],
        },
        {
          id: 'f-plug', title: '接上电源', page: 11,
          desc: '把电源插头插到插座上。',
          camera: POWER,
          set: { plug: { plug: 'socket', via: [170, 100, -70], dur: 1.6 } },
          highlight: ['plug', 'cord'],
        },
        {
          id: 'f-on', title: '按任意咖啡键开机：两灯闪烁 = 预热', page: 11,
          desc: '按一下浓缩咖啡键或大杯咖啡键启动咖啡机。两个按键灯同时闪烁表示正在预热，大约 30 秒。',
          camera: TOP,
          set: leds('blink', 0.9),
          actions: [{ type: 'press', part: 'btn-esp', delay: 0.6 }],
          highlight: ['btn-esp', 'btn-lungo', 'led-esp', 'led-lungo'],
          zoom: zoomButtons('两灯闪烁 = 预热中（约 30 秒）'),
          chips: [{ label: '闪烁', sub: '预热中' }, { label: '长亮', sub: '可以使用' }],
        },
        {
          id: 'f-ready', title: '两灯长亮：预热完成', page: 11,
          desc: '按键灯停止闪烁、保持长亮，表示咖啡机已经准备好。',
          camera: TOP,
          set: leds('on'),
          highlight: ['led-esp', 'led-lungo'],
          zoom: zoomButtons('两灯长亮 = 可以使用'),
        },
        {
          id: 'f-rinse', title: '按大杯咖啡键冲洗，重复 3 次', page: 11,
          desc: '按一下大杯咖啡键，热水从咖啡出口流进容器，冲洗机器内部；流完后再按，一共 3 次。',
          camera: FRONT_LOW,
          set: { 'water-flow': { visible: true, delay: 1.0 } },
          actions: [{ type: 'press', part: 'btn-lungo', delay: 0.6 }],
          highlight: ['btn-lungo', 'water-flow'],
          zoom: zoomLungo('按大杯咖啡键 × 3'),
          chips: [{ label: '× 3', sub: '每次按一下大杯咖啡键' }],
        },
        {
          id: 'f-done', title: '倒掉冲洗水，装回滴水盘', page: 11,
          desc: '冲洗完成后拿走容器倒掉里面的水，把滴水盘推回机身前部。',
          camera: FRONT_LOW,
          set: { ...hide('water-flow'), beaker: { visible: false, delay: 0.2 }, tray: trayIn(0.6) },
          highlight: ['tray'],
        },
      ],
    },

    // ================= 制作咖啡 =================
    {
      id: 'coffee', title: '制作咖啡', kind: 'usage',
      start: { ...READY, capsule: { visible: true } },
      steps: [
        {
          id: 'c-ready', title: '开机，等按键灯停止闪烁', page: 12,
          desc: '开机后等两个按键灯停止闪烁、保持长亮；确认水箱里有饮用水，备好一粒胶囊。',
          tip: '预热闪烁时也可以直接按咖啡键，预热完成后会自动开始萃取。',
          camera: OVERVIEW,
          highlight: ['led-esp', 'led-lungo', 'tank', 'capsule'],
          zoom: zoomButtons('两灯长亮 = 可以使用'),
        },
        {
          id: 'c-lift', title: '完全抬起操作手柄', page: 12,
          desc: '把操作手柄从前端完全抬起，露出胶囊仓入口。',
          camera: TOP,
          set: { lever: LEVER_OPEN },
          highlight: ['lever'],
        },
        {
          id: 'c-capsule', title: '放入一粒胶囊，铝盖朝前', page: 12,
          desc: '把胶囊放进手柄下面的胶囊仓入口，铝盖一面朝前（朝向咖啡出口一侧）。',
          tip: '不要使用用过、损坏或变形的胶囊；放正胶囊可避免胶囊区漏水。',
          camera: TOP,
          set: { capsule: { parent: 'body', at: CAPSULE_IN, rot: [90, 0, 0], via: [0, 280, 60], dur: 1.6 } },
          highlight: ['capsule'],
          zoom: { target: [0, 205, 55], dir: [0.3, 1, 0.6], dist: 170, caption: '铝盖朝前放入胶囊仓' },
        },
        {
          id: 'c-close', title: '合上手柄，杯子放到咖啡出口下', page: 12,
          desc: '合上操作手柄，再把咖啡杯放在滴水隔栅上、对准咖啡出口。',
          camera: FRONT,
          set: { lever: LEVER_CLOSED, cup: { at: CUP_HOME, via: CUP_VIA, delay: 1.0, dur: 1.5 } },
          highlight: ['lever', 'cup'],
        },
        {
          id: 'c-brew', title: '按浓缩（40 ml）或大杯（110 ml）键', page: 13,
          desc: '按一下浓缩咖啡键（40 ml）或大杯咖啡键（110 ml）开始萃取，到量自动停止。想提前停止或再加一点咖啡，再按一次同一个键。',
          tip: '萃取过程中切勿抬起手柄，以免烫伤；手指不要伸到咖啡出口下方。',
          camera: FRONT,
          set: { 'coffee-flow': { visible: true, delay: 1.0 }, coffee: { visible: true, delay: 1.6 } },
          actions: [{ type: 'press', part: 'btn-lungo', delay: 0.6 }],
          highlight: ['btn-esp', 'btn-lungo', 'coffee-flow'],
          zoom: zoomButtons('浓缩 40 ml · 大杯 110 ml'),
          chips: [{ label: '浓缩', sub: '40 ml' }, { label: '大杯', sub: '110 ml' }, { label: '再按一次', sub: '停止 / 加量' }],
        },
        {
          id: 'c-lift2', title: '拿走杯子，抬起手柄', page: 13,
          desc: '萃取停止后拿走咖啡杯，再抬起操作手柄。',
          camera: FRONT,
          set: { 'coffee-flow': { visible: false }, cup: { at: CUP_ASIDE, via: CUP_VIA, delay: 0.5, dur: 1.5 }, lever: { ...LEVER_OPEN, delay: 2.0 } },
          highlight: ['cup', 'lever'],
        },
        {
          id: 'c-eject', title: '合上手柄，胶囊落进粉囊盒', page: 13,
          desc: '合上操作手柄，用过的胶囊自动退出，落进下面的粉囊盒。',
          camera: FRONT,
          set: { lever: LEVER_CLOSED, capsule: { parent: 'bin', at: CAPSULE_IN_BIN, rot: [90, 0, 0], delay: 0.9, dur: 0.9 } },
          highlight: ['lever', 'capsule', 'bin'],
          chips: [{ label: '粉囊盒', sub: '可容纳 5–6 粒' }],
        },
      ],
    },

    // ================= 日常清洁与清空系统 =================
    {
      id: 'clean', title: '日常清洁与清空系统', kind: 'usage',
      start: { ...READY, capsule: { visible: true, parent: 'bin', at: CAPSULE_IN_BIN, rot: [90, 0, 0] } },
      steps: [
        {
          id: 'k-tray', title: '抽出滴水盘，倒掉积水', page: 14,
          desc: '每天把滴水盘连同滴水隔栅向前抽出，倒掉积水后冲洗。',
          tip: '清洁前先拔掉电源；机器不可浸水，部件不可放进洗碗机。',
          camera: ASIDE,
          set: { tray: trayOut() },
          highlight: ['tray'],
        },
        {
          id: 'k-bin', title: '取出粉囊盒，倒掉胶囊、清空底座', page: 14,
          desc: '把粉囊盒向前拉出，倒掉用过的胶囊并冲洗；再清空机身凹腔底部的滴水盘底座。',
          camera: ASIDE,
          set: { bin: binOut(), capsule: { visible: false, delay: 1.6 } },
          highlight: ['bin'],
        },
        {
          id: 'k-tank', title: '取下水箱和盖，清洗后擦干', page: 14,
          desc: '取下水箱和水箱盖，用无香味的洗涤剂清洗，再用温水或热水冲净，用干净的毛巾、布或纸巾擦干。',
          camera: BACK,
          set: { tank: tankOut(), 'tank-lid': { ...LID_OPEN, delay: 1.7 } },
          highlight: ['tank', 'tank-lid'],
        },
        {
          id: 'k-back', title: '全部装回，湿布擦咖啡出口', page: 14,
          desc: '把水箱、粉囊盒、滴水盘装回原位。定期用湿布清洁咖啡出口和机器内部。',
          camera: OVERVIEW,
          set: { 'tank-lid': LID_CLOSED, tank: tankIn(0.8), bin: binIn(0.6), tray: trayIn(2.4) },
          highlight: ['tank', 'bin', 'tray'],
          callouts: [{ part: 'body', text: '咖啡出口', sub: '定期用湿布擦', at: [0, 146, 108], offset: [0, -30, 90] }],
        },
        {
          id: 'k-empty', title: '长期不用 / 防冻 / 送修前：清空系统', page: 30,
          desc: '先同时按两个咖啡键关机；取下水箱、抬起手柄，在咖啡出口下方放容器；再同时按住两个键 5 秒，两灯交替闪烁，机器开始排空，结束后自动关机。最后合上手柄，清空粉囊盒、滴水盘和底座。',
          camera: OVERVIEW,
          set: {
            tank: tankOut(),
            lever: { ...LEVER_OPEN, delay: 1.2 },
            tray: trayOut(1.4),
            beaker: { visible: true, delay: 2.9 },
            ...leds('blink', 3.2),
          },
          actions: [{ type: 'press', part: 'btn-esp', delay: 3.0 }, { type: 'press', part: 'btn-lungo', delay: 3.0 }],
          highlight: ['tank', 'lever', 'beaker', 'led-esp', 'led-lungo'],
          zoom: { target: 'btn-esp', offset: [12, 0, 0], dir: [0.3, 1, -0.45], dist: 130, caption: '同时按住两键 5 秒：两灯交替闪烁' },
          chips: [{ label: '两键同按', sub: '关机' }, { label: '两键按住 5 秒', sub: '开始排空' }, { label: '结束', sub: '自动关机' }],
        },
      ],
    },

    // ================= 除垢 =================
    {
      id: 'descale', title: '除垢（约 15 分钟）', kind: 'usage',
      start: { ...READY, capsule: { visible: true, parent: 'body', at: CAPSULE_IN, rot: [90, 0, 0] } },
      steps: [
        {
          id: 'd-lift', title: '抬起手柄', page: 16,
          desc: '先把机器里的胶囊退掉：完全抬起操作手柄。',
          tip: '除垢液可能有害，避免接触眼睛、皮肤和台面。',
          camera: FRONT_LOW,
          set: { lever: LEVER_OPEN },
          highlight: ['lever'],
          chips: [{ label: '高硬度', sub: '每 300 杯' }, { label: '中', sub: '每 600 杯' }, { label: '低', sub: '每 1200 杯' }],
        },
        {
          id: 'd-eject', title: '合上手柄退出胶囊，清空滴水盘和粉囊盒', page: 16,
          desc: '合上手柄，胶囊落进粉囊盒；然后取下滴水盘，清空滴水盘、滴水盘底座和粉囊盒。',
          camera: FRONT_LOW,
          set: { lever: LEVER_CLOSED, capsule: { parent: 'bin', at: CAPSULE_IN_BIN, rot: [90, 0, 0], delay: 0.9, dur: 0.9 }, tray: trayOut(1.9) },
          highlight: ['lever', 'capsule', 'tray', 'bin'],
        },
        {
          id: 'd-sachet', title: '水箱加 1 份除垢剂', page: 16,
          desc: '打开水箱盖，往水箱里倒入 1 份 Nespresso 除垢剂。',
          camera: BACK,
          set: { capsule: { visible: false }, 'tank-lid': LID_OPEN, sachet: { visible: true, delay: 0.8 } },
          highlight: ['sachet', 'tank'],
        },
        {
          id: 'd-water', title: '再加饮用水到 0.6 L', page: 16,
          desc: '往水箱里注入饮用水到 0.6 L 刻度，合上水箱盖。',
          camera: BACK,
          set: { sachet: { visible: false }, bottle: { visible: true, delay: 0.8 } },
          highlight: ['bottle', 'tank'],
          chips: [{ label: '0.6 L', sub: '水箱最高刻度' }],
        },
        {
          id: 'd-container', title: '咖啡出口下放 1 L 容器', page: 17,
          desc: '合上水箱盖，在咖啡出口下方放一个容量至少 1 L 的容器。',
          camera: FRONT_LOW,
          set: { bottle: { visible: false }, 'tank-lid': { ...LID_CLOSED, delay: 0.6 }, beaker: { visible: true, delay: 1.2 } },
          highlight: ['beaker'],
        },
        {
          id: 'd-mode', title: '开机状态同时按住两键 5 秒', page: 17,
          desc: '咖啡机开机状态下，同时按住浓缩咖啡键和大杯咖啡键 5 秒，进入除垢模式，两个按键灯都闪烁。',
          camera: TOP,
          set: leds('blink', 1.2),
          actions: [{ type: 'press', part: 'btn-esp', delay: 0.6 }, { type: 'press', part: 'btn-lungo', delay: 0.6 }],
          highlight: ['btn-esp', 'btn-lungo', 'led-esp', 'led-lungo'],
          zoom: zoomButtons('两键按住 5 秒：两灯闪烁 = 除垢模式'),
        },
        {
          id: 'd-run', title: '按大杯咖啡键，直到水箱流空', page: 18,
          desc: '按一下大杯咖啡键，除垢液从咖啡出口流进容器，等水箱流空。',
          camera: FRONT_LOW,
          set: { 'water-flow': { visible: true, delay: 1.0 } },
          actions: [{ type: 'press', part: 'btn-lungo', delay: 0.6 }],
          highlight: ['btn-lungo', 'water-flow'],
          zoom: zoomLungo('按大杯咖啡键'),
        },
        {
          id: 'd-repeat', title: '用过的除垢液倒回水箱，再流一遍', page: 18,
          desc: '把容器里收集的除垢液倒回水箱，把容器放回出口下方，重复第 4 步和第 7 步。',
          camera: BACK,
          set: { 'water-flow': { visible: false }, 'tank-lid': LID_OPEN, bottle: { visible: true, delay: 0.8 } },
          highlight: ['tank', 'beaker'],
        },
        {
          id: 'd-rinse', title: '冲净水箱、加满清水，冲洗两遍', page: 18,
          desc: '清空并冲洗水箱，注满新鲜饮用水；再重复第 4 步和第 7 步冲洗机器，共两遍。',
          camera: FRONT_LOW,
          set: { bottle: { visible: false }, 'tank-lid': { ...LID_CLOSED, delay: 0.6 }, 'water-flow': { visible: true, delay: 1.4 } },
          actions: [{ type: 'press', part: 'btn-lungo', delay: 0.9 }],
          highlight: ['tank', 'water-flow'],
          chips: [{ label: '× 2', sub: '清水冲洗' }],
        },
        {
          id: 'd-exit', title: '同时按住两键 5 秒退出，清空底座', page: 19,
          desc: '同时按住两个咖啡键 5 秒退出除垢模式，按键灯恢复长亮；拿走容器，清空滴水盘底座，装回滴水盘。',
          camera: FRONT_LOW,
          set: { 'water-flow': { visible: false }, ...leds('on', 1.0), beaker: { visible: false, delay: 1.4 }, tray: trayIn(2.3) },
          actions: [{ type: 'press', part: 'btn-esp', delay: 0.5 }, { type: 'press', part: 'btn-lungo', delay: 0.5 }],
          highlight: ['led-esp', 'led-lungo', 'tray'],
          zoom: zoomButtons('两键按住 5 秒：退出除垢'),
        },
      ],
    },

    // ================= 杯量、节能、出厂与故障 =================
    {
      id: 'settings', title: '杯量、节能、恢复出厂与故障', kind: 'repair',
      start: READY,
      steps: [
        {
          id: 's-volume', title: '设定杯量：按住咖啡键，到量松开', page: 26,
          desc: '开机预热完成后放好胶囊和杯子，按住浓缩咖啡键或大杯咖啡键不放，咖啡流到想要的量时松开。按键灯快速闪烁 3 次，新的杯量已保存。',
          camera: FRONT,
          set: { cup: { at: CUP_HOME, via: CUP_VIA, dur: 1.4 }, 'coffee-flow': { visible: true, delay: 1.8 }, coffee: { visible: true, delay: 2.2 } },
          actions: [{ type: 'press', part: 'btn-esp', depth: 2, delay: 1.4 }],
          highlight: ['btn-esp', 'led-esp', 'cup'],
          zoom: zoomEsp('松开后快闪 3 次 = 已保存'),
        },
        {
          id: 's-energy', title: '节能：关机状态长按浓缩键 5 秒', page: 24,
          desc: '关机状态下长按浓缩咖啡键 5 秒，浓缩咖啡键闪烁显示当前设置：闪 1 次 = 9 分钟后自动关机，闪 2 次 = 30 分钟。按浓缩咖啡键切换；长按大杯咖啡键 5 秒退出。',
          camera: TOP,
          set: { ...hide('coffee-flow', 'coffee'), 'led-lungo': { light: 'off' }, 'led-esp': { light: 'blink', delay: 1.6 } },
          actions: [{ type: 'press', part: 'btn-esp', delay: 1.2 }],
          highlight: ['btn-esp', 'led-esp'],
          zoom: zoomEsp('闪 1 次 = 9 分钟 · 闪 2 次 = 30 分钟'),
          chips: [{ label: '出厂', sub: '9 分钟自动关机' }, { label: '手动关机', sub: '同时按两键' }],
        },
        {
          id: 's-reset', title: '恢复出厂：关机状态长按大杯键 5 秒', page: 28,
          desc: '关机状态下长按大杯咖啡键 5 秒，按键灯快速闪烁 3 次确认已恢复出厂设置，随后正常闪烁预热，长亮即可使用。',
          camera: TOP,
          set: { 'led-lungo': { light: 'blink', delay: 1.2 } },
          actions: [{ type: 'press', part: 'btn-lungo', delay: 0.6 }],
          highlight: ['btn-lungo', 'led-esp', 'led-lungo'],
          zoom: zoomButtons('快闪 3 次 = 已恢复出厂'),
          chips: [{ label: '浓缩', sub: '40 ml' }, { label: '大杯', sub: '110 ml' }, { label: '自动关机', sub: '9 分钟' }],
        },
        {
          id: 't-nolight', title: '指示灯不亮：检查电源', page: 21,
          desc: '按键灯完全不亮时，检查插座、插头、电压和保险丝；仍不亮请致电 Nespresso 俱乐部。',
          camera: POWER,
          set: { ...leds('off'), plug: { plug: { hole: 'socket', depth: -14 }, dur: 0.8 } },
          actions: [{ type: 'shake', part: 'plug', axis: 'x', amp: 3, delay: 1.0 }],
          highlight: ['plug', 'socket'],
        },
        {
          id: 't-nowater', title: '不出咖啡也不出水：给水箱加水', page: 21,
          desc: '水箱空了就注满饮用水；首次使用时先用不超过 55 °C 的温水按首次使用步骤冲洗；必要时除垢。流速慢、咖啡不够热时，先预热杯子，必要时除垢。',
          camera: BACK,
          set: { plug: { plug: 'socket', dur: 0.8 }, ...leds('on', 0.8), 'tank-lid': LID_OPEN, bottle: { visible: true, delay: 1.0 } },
          highlight: ['tank', 'bottle', 'led-esp', 'led-lungo'],
          zoom: zoomButtons('按键灯恢复长亮'),
        },
        {
          id: 't-leak', title: '胶囊区漏水：重新放正胶囊', page: 21,
          desc: '粉囊盒里有水、胶囊区漏水时，抬起手柄把胶囊放正（铝盖朝前）再合上；仍然漏水请致电 Nespresso 俱乐部。按键灯不规则闪烁时请送修。',
          camera: TOP,
          set: {
            bottle: { visible: false }, 'tank-lid': { ...LID_CLOSED, delay: 0.6 },
            lever: LEVER_OPEN,
            capsule: { visible: true, parent: 'body', at: CAPSULE_IN, rot: [90, 0, 0], via: [0, 280, 60], delay: 1.0, dur: 1.4 },
          },
          highlight: ['lever', 'capsule'],
          zoom: { target: [0, 205, 55], dir: [0.3, 1, 0.6], dist: 170, caption: '胶囊铝盖朝前放正' },
        },
      ],
    },
  ],
}
