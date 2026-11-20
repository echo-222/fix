import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 戴森 Dyson V12 Detect Slim 轻量无绳吸尘器（国行蓝色）
 * 说明书：dyson v12 detect slim 操作手册（13 页），逐页转写见 manuals-src/dyson-v12/transcript.md
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。
 * 主机身局部系（body）：机身轴线为 +y（y = 0 是集尘筒底盖底面，向上依次是集尘筒、气旋护罩、马达、滤网、屏幕），
 * 握把与电池在 +x 一侧，侧面朝 ±z。直立成整机时 body 不转；放在地上（靠电池立住）时 rot [0, 0, -90]，屏幕朝 +x。
 * 吸头原点在底面中心，滚刷沿 z，正面朝 -x，接头朝上；吸尘杆原点在下端，沿 +y。
 *
 * 推断（说明书没有给出）：
 * - 整机 1234 × 250 × 252 mm 取自官方旗舰店参数；其余按 p1 正视图（以吸头宽 250 mm 定比例）与 p6 侧视图估：
 *   集尘筒 Ø104 × 120、气旋护罩 Ø112、滤网 Ø94 × 64、屏幕约 26 × 26、电池 40 × 156 × 58、吸尘杆 Ø32 × 660、吸头 110 × 80 × 250。
 * - 开关（扳机）位置按官方产品图放在握把前侧上端；电池充电口在电池前端、两盏 LED 在电池侧面靠前（p6 图）。
 * - 集尘筒底盖铰链在远离握把一侧（p7 图），进气口与底盖一体；墙面充电座按 p6 图画在电池下方，墙在握把一侧。
 * - 屏幕是圆形 LCD，场景用方形屏幕近似；颜色图标（节能绿 / 自动蓝 / 强效红）用文字表示。
 *
 * 外观模型：主机身（含气旋护罩与握把）、光学软绒吸头、吸尘杆各用官方单品图生成（models/dyson-v12/tripo.json，来源 refs/sources.json）；
 * 集尘筒、滤网、电池、充电座没有可用的单品图，几何 + finish。
 */

type Item = Shape & { at?: Vec3; rot?: Vec3; fill?: 'white' | 'warm' | 'shade' | 'dark'; finish?: SpecPart['finish'] }
const bx = (size: Vec3, at: Vec3, extra: Partial<Item> = {}): Item => ({ type: 'box', size, at, ...extra } as Item)
const cy = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', extra: Partial<Item> = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...extra } as Item)

const RED = { color: '#d4262e', roughness: 0.45 }
const BLUE = { color: '#2747d6', roughness: 0.35, metalness: 0.1 }
const NICKEL = { color: '#9aa0a8', roughness: 0.3, metalness: 0.85 }
const GUN = { color: '#6d7178', roughness: 0.35, metalness: 0.5 }
const CLEAR = { color: '#d6e0e6', roughness: 0.1 }
const TEAL = { color: '#38c3bb', roughness: 0.5 }

// ---------- 位置 ----------
/** 吸尘杆插在吸头上、主机插在吸尘杆上 */
const WAND_ON_HEAD: Vec3 = [0, 200, 0]
const BODY_ON_WAND: Vec3 = [0, 710, 0]
/** 主机靠电池立在地上 */
const STAND: Vec3 = [0, 0, -90]
const onFloor = (x: number, z = 0): PartState => ({ parent: null, at: [x, 170, z], rot: STAND })
const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))

const STICK = {
  head: { parent: null, at: [0, 0, 0], rot: [0, 0, 0], visible: true },
  wand: { parent: 'head', at: WAND_ON_HEAD, rot: [0, 0, 0], visible: true },
  body: { parent: 'wand', at: BODY_ON_WAND, rot: [0, 0, 0] },
} satisfies Record<string, PartState>

// ---------- 屏幕 ----------
const UI = {
  auto: { title: '自动', items: [{ text: '4:50', sub: '剩余运行时间' }] },
  eco: { title: '节能', items: [{ text: '绿色图标', sub: '运行时间更长' }] },
  boost: { title: '强效', items: [{ text: '红色图标', sub: '集中清洁顽固污垢' }] },
  particles: {
    title: '9,927,641',
    items: [{ text: '>10 微米', sub: '9,927,641' }, { text: '>60', sub: '1.1M' }, { text: '>180', sub: '450K' }, { text: '>500', sub: '1.6K' }],
  },
  menu: {
    title: '设置菜单',
    items: [{ text: '语言', state: 'selected' }, { text: '提醒' }, { text: '颗粒物数量和图表' }, { text: '吸力调节敏感度' }, { text: '退出菜单' }],
  },
  lang: { title: '语言', items: [{ text: 'English' }, { text: 'Español' }, { text: '中文', state: 'selected' }] },
  langDone: { title: '中文', items: [{ text: '已选择', state: 'done' }] },
  alert: { title: '提醒', items: [{ text: '打开' }, { text: '关闭', state: 'selected' }], toast: '按住直至倒计时结束' },
  low: { title: '低运行时间', items: [{ text: '0:30', sub: '请尽快充电' }], toast: '马达脉冲三次' },
  exit: { title: '设置菜单', items: [{ text: '提醒' }, { text: '吸力调节敏感度' }, { text: '退出菜单', state: 'selected' }] },
  first: { title: '首次使用前', items: [{ text: '请充满电' }] },
  charging: { title: '充电中', items: [{ text: '电池侧面蓝色 LED 闪烁' }] },
  full: { title: '100%', items: [{ text: '已充满' }] },
  block: { title: '气道堵塞', items: [{ text: '清理阻塞物后才能使用' }] },
  unsealed: { title: '滤网', items: [{ text: '未密封' }] },
} satisfies Record<string, ScreenUI>

// ---------- 零件 ----------
const parts: SpecPart[] = [
  {
    id: 'body', name: '主机身', spec: '马达 + 气旋护罩 + 握把',
    shape: {
      type: 'compound', items: [
        { type: 'hole', w: 1, h: 1, at: [-56, -4, 0] },
        cy(56, 124, [0, 188, 0], 'y', { finish: BLUE }),
        cy(44, 62, [0, 281, 0], 'y', { fill: 'shade', finish: GUN }),
        bx([10, 125, 40], [57, 68.5, 0], { fill: 'shade', finish: GUN }),
        bx([60, 58, 34], [86, 216, 0], { chamfer: 6, finish: GUN }),
        bx([70, 30, 34], [93, 114, 0], { chamfer: 4, finish: GUN }),
        bx([22, 152, 44], [119, 174, 0], { chamfer: 4, finish: GUN }),
      ],
    },
    at: [0, 0, 0],
  },
  {
    id: 'bin', name: '透明集尘筒', spec: '0.35 L，有 MAX 标记', parent: 'body', at: [0, 66, 0],
    shape: { type: 'cylinder', r: 52, h: 120 }, fill: 'white', finish: CLEAR,
  },
  { id: 'max', name: 'MAX 标记', parent: 'bin', at: [0, 38, 52.4], shape: { type: 'text', text: 'MAX', size: 7 } },
  {
    id: 'bin-base', name: '集尘筒底盖（含进气口）', parent: 'bin', at: [-52, -60, 0],
    shape: { type: 'compound', items: [cy(52, 6, [52, -3, 0], 'y', { finish: GUN }), cy(23, 50, [52, -31, 0], 'y', { fill: 'shade', finish: GUN })] },
  },
  { id: 'bin-lever', name: '红色集尘筒释放按钮', parent: 'body', at: [62, 128, 0], shape: { type: 'box', size: [12, 8, 16], chamfer: 2 }, fill: 'dark', finish: RED },
  { id: 'rail-btn', name: '滑轨红色按钮', parent: 'body', at: [64, 30, 0], rot: [0, 0, -90], shape: { type: 'box', size: [14, 4, 14], chamfer: 1.5 }, fill: 'dark', finish: RED },
  { id: 'trigger', name: '开关（扳机）', spec: '位置为推断', parent: 'body', at: [70, 180, 0], rot: [0, 0, 180], shape: { type: 'box', size: [14, 12, 16], chamfer: 3 }, fill: 'shade', finish: GUN },
  {
    id: 'screen-hub', name: '屏幕与模式按钮', spec: 'LCD 屏 + 红色选择按钮', parent: 'body', at: [0, 312, 0],
    shape: { type: 'compound', items: [cy(24, 24, [0, 0, 0], 'y', { fill: 'dark', finish: 'plastic-black' }), cy(5, 3, [16, 13.5, 0], 'y', { fill: 'dark', finish: RED })] },
  },
  { id: 'screen', name: 'LCD 显示屏', parent: 'screen-hub', at: [-5, 12.2, 0], rot: [-90, 0, 90], shape: { type: 'screen', w: 24, h: 24 } },
  {
    id: 'filter', name: '滤网', spec: '可水洗，逆时针拧下', parent: 'screen-hub', at: [0, -22, 0],
    shape: {
      type: 'compound', items: [
        cy(47, 64, [0, 0, 0], 'y', { finish: TEAL }),
        ...[-1, 1].flatMap((s) => [bx([3, 22, 4], [s * 47, 6, -6], { fill: 'dark', finish: 'hole' }), bx([3, 22, 4], [s * 47, 6, 6], { fill: 'dark', finish: 'hole' })]),
      ],
    },
  },
  { id: 'battery', name: '可替换电池', parent: 'body', at: [150, 174, 0], shape: { type: 'box', size: [40, 156, 58], chamfer: 5 }, fill: 'shade', finish: GUN },
  { id: 'batt-btn', name: '电池释放按钮', parent: 'body', at: [124, 99, 0], rot: [0, 0, 180], shape: { type: 'box', size: [12, 4, 16], chamfer: 1.5 }, fill: 'dark', finish: RED },
  { id: 'batt-port', name: '充电口', parent: 'battery', at: [0, -78.2, 0], rot: [90, 0, 0], shape: { type: 'hole', w: 12, h: 8, r: 3 } },
  { id: 'led-1', name: '电池 LED', parent: 'battery', at: [-7, -62, 29.2], shape: { type: 'led', r: 2.2, color: '#3b82f6' } },
  { id: 'led-2', name: '电池 LED', parent: 'battery', at: [7, -62, 29.2], shape: { type: 'led', r: 2.2, color: '#3b82f6' } },
  {
    id: 'wand', name: '吸尘杆', spec: 'Ø32 × 660 mm（推断）',
    shape: { type: 'compound', items: [cy(16, 660, [0, 330, 0]), cy(21, 44, [0, 638, 0], 'y', { fill: 'shade' }), cy(21, 50, [0, 25, 0], 'y', { fill: 'shade' })] },
    finish: NICKEL,
  },
  { id: 'wand-btn', name: '红色吸尘杆释放按钮', parent: 'wand', at: [-21.6, 632, 0], rot: [0, 0, 90], shape: { type: 'box', size: [12, 3, 10], chamfer: 1 }, fill: 'dark', finish: RED },
  { id: 'head-btn', name: '吸头释放按钮', parent: 'wand', at: [-21.6, 30, 0], rot: [0, 0, 90], shape: { type: 'box', size: [12, 3, 10], chamfer: 1 }, fill: 'dark', finish: RED },
  {
    id: 'head', name: '光学纤巧软绒吸头', spec: '激光 + 软绒滚刷',
    shape: { type: 'compound', items: [bx([110, 80, 250], [0, 40, 0], { chamfer: 10, finish: 'plastic-grey' }), cy(24, 120, [0, 140, 0], 'y', { fill: 'shade', finish: NICKEL })] },
  },
  { id: 'brush', name: '软绒刷条（含端盖）', parent: 'head', at: [-22, 38, 0], shape: { type: 'cylinder', r: 30, h: 236, axis: 'z' }, fill: 'warm', finish: { color: '#e9b530', roughness: 0.95 } },
  { id: 'laser-switch', name: '激光滑块', parent: 'head', at: [-56.5, 62, 80], shape: { type: 'box', size: [3, 8, 16], chamfer: 1 }, fill: 'dark', finish: { color: '#22b04b', roughness: 0.4 } },
  { id: 'laser', name: '激光 / 光学透镜', parent: 'head', at: [-55.2, 30, 112], rot: [0, -90, 0], shape: { type: 'led', r: 4, color: '#22c55e' } },
  {
    id: 'dock', name: '墙面充电座', parent: 'wall', at: [-10, 256, 100], fill: 'shade', finish: 'plastic-grey',
    shape: { type: 'compound', items: [bx([44, 200, 64], [-22, -100, 0], { chamfer: 6 }), bx([56, 36, 80], [-28, -182, 0], { chamfer: 6 })] },
  },
  { id: 'dock-port', name: '充电座接口', parent: 'dock', at: [-28, -200.2, 0], rot: [90, 0, 0], shape: { type: 'hole', w: 12, h: 8, r: 3 } },
  { id: 'wall', name: '墙面', at: [182, 750, -100], visible: false, shape: { type: 'box', size: [20, 1500, 1000] }, fill: 'warm', finish: 'wall' },
  { id: 'charger', name: '充电器', at: [-760, 15, 200], visible: false, shape: { type: 'box', size: [56, 30, 96], chamfer: 6 }, fill: 'dark', finish: 'plastic-black' },
  {
    id: 'dc-plug', name: '充电插头', at: [-700, 6, 110], visible: false, fill: 'dark', finish: 'plastic-black',
    shape: { type: 'compound', items: [cy(2.8, 10, [5, 0, 0], 'x', { finish: 'steel' }), cy(6, 26, [-13, 0, 0], 'x')] },
  },
  {
    id: 'charger-cable', name: '充电线', visible: false,
    shape: { type: 'cable', from: { part: 'charger', at: [0, 0, -48], dir: [0, 0, -1] }, to: { part: 'dc-plug', at: [-26, 0, 0], dir: [-1, 0, 0] }, r: 2.2, slack: 0.25 },
  },
  { id: 'trash', name: '垃圾桶', at: [-500, 170, 0], visible: false, shape: { type: 'cylinder', r: 150, h: 340 }, fill: 'shade', finish: 'plastic-grey' },
  {
    id: 'sink', name: '水龙头与台面', at: [700, 0, -300], visible: false, fill: 'white', finish: 'plastic-white',
    shape: { type: 'compound', items: [bx([400, 820, 360], [0, 410, 0]), cy(12, 200, [0, 920, -140], 'y', { finish: 'steel' }), bx([24, 20, 150], [0, 1010, -75], { finish: 'steel' })] },
  },
  { id: 'water', name: '自来水', at: [700, 967, -300], visible: false, shape: { type: 'cylinder', r: 6, h: 65 }, fill: 'white', finish: { color: '#9fd3f0', roughness: 0.05 } },
  { id: 'cloth', name: '湿布（不起毛）', at: [-300, 1.5, 300], visible: false, shape: { type: 'box', size: [120, 3, 90] }, fill: 'warm', finish: { color: '#ebe6dc', roughness: 0.95 } },
]

// ---------- 镜头 ----------
const STICK_VIEW: CameraSpec = { target: [0, 620, 0], dir: [0.35, 0.2, 1], dist: 2600 }
const cam = (target: CameraSpec['target'], dir: CameraSpec['dir'], dist: number): CameraSpec => ({ target, dir, dist })
const zoom = (target: CameraSpec['target'], dir: CameraSpec['dir'], dist: number, caption: string) => ({ target, dir, dist, caption })

/** C / E 指南里主机放在地上的位置 */
const C_BODY = -600
const E_BODY = -150

export const dysonV12: ManualSpec = {
  id: 'dyson-v12',
  name: '戴森 V12 Detect Slim',
  desc: '轻量无绳吸尘器：组装、功率模式与屏幕、充电与换电池、清空集尘筒、洗滤网与刷条',
  category: '清洁电器',
  dims: { width: 250, depth: 252, height: 1234 },
  source: {
    title: '戴森 Dyson V12 Detect Slim 操作手册',
    url: 'https://www-img.dyson.cn/upload/file/N620D_dyson_v12_detect_slim_OUG_CN.pdf',
    images: [],
  },
  package: [
    { name: '主机身', qty: 1 },
    { name: '吸尘杆', qty: 1 },
    { name: '光学纤巧软绒吸头', qty: 1 },
    { name: '直驱式吸头', qty: 1, spec: '视型号' },
    { name: '充电器', qty: 1 },
    { name: '墙面充电座', qty: 1 },
    { name: '缝隙软毛（宽嘴）两用吸头', qty: 1 },
    { name: '防缠绕螺旋形吸头', qty: 1 },
    { name: '底部转换头 / 窄缝照明吸头 / 迷你除尘软毛刷 / 顽固污垢毛刷', qty: 1, spec: '视型号' },
    { name: '随行吸头夹', qty: 1 },
    { name: '备用可替换电池', qty: 1, spec: '需另购' },
  ],
  params: [
    { label: '功率模式', value: '节能 / 自动（中等）/ 强效' },
    { label: '颗粒物统计', value: '>10 / >60 / >180 / >500 微米' },
    { label: '激光', value: '1 级激光产品' },
    { label: '充电', value: '充满后两盏 LED 亮 5 秒，屏幕显示 100%' },
    { label: '使用温度', value: '低于 5°C（41℉）不能运行或充电' },
    { label: '外形', value: '1234 × 250 × 252 mm', note: '官方旗舰店参数，说明书未标注' },
  ],
  parts,
  initial: { ...STICK, screen: { ui: null }, 'led-1': { light: 'off' }, 'led-2': { light: 'off' }, laser: { light: 'off' } },
  stageSize: 2200,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 开箱组装 =================
    {
      id: 'assemble', title: '开箱组装', kind: 'assembly',
      start: {
        head: { at: [350, 0, 0] },
        wand: { parent: null, at: [-60, 21, 260], rot: [0, 0, -90] },
        body: onFloor(-450),
        charger: { at: [-150, 15, 430], visible: true },
        'dc-plug': { at: [-60, 6, 360], visible: true },
        'charger-cable': { visible: true },
      },
      steps: [
        {
          id: 'box', title: '包装内附', page: 2,
          desc: '主机身、吸尘杆、光学纤巧软绒吸头和充电器。吸尘器可在墙面充电座上充电，也可单独充电。不同型号包含的吸头配件可能不同。',
          camera: cam([0, 150, 120], [0.2, 0.55, 1], 2000),
          highlight: ['body', 'wand', 'head'],
          callouts: [
            { part: 'body', text: '主机身', at: [0, 200, 0] },
            { part: 'wand', text: '吸尘杆', at: [0, 330, 0] },
            { part: 'head', text: '光学纤巧软绒吸头', at: [0, 80, 0] },
          ],
        },
        {
          id: 'wand-in', title: '吸尘杆推入吸头', page: 3,
          desc: '把吸尘杆竖直对准吸头接头，向下推入直到卡紧。',
          set: { wand: { parent: 'head', at: WAND_ON_HEAD, rot: [0, 0, 0], via: [350, 420, 0], dur: 1.6 } },
          camera: cam([250, 400, 0], [0.3, 0.3, 1], 1800),
          highlight: ['wand', 'head'],
          zoom: zoom([350, 200, 0], [0.4, 0.3, 1], 520, '吸尘杆下端推入吸头接头'),
        },
        {
          id: 'body-on', title: '主机推入吸尘杆', page: 3,
          desc: '把主机的进气口对准吸尘杆上端，向下推入直到卡紧。',
          set: { body: { parent: 'wand', at: BODY_ON_WAND, rot: [0, 0, 0], via: [350, 1150, 0], dur: 1.8 } },
          camera: cam([250, 650, 0], [0.3, 0.25, 1], 2600),
          highlight: ['body', 'wand'],
          zoom: zoom([350, 880, 0], [0.4, 0.2, 1], 600, '进气口推到吸尘杆上端'),
        },
        {
          id: 'laser', title: '开启激光', page: 3,
          desc: '用吸头上的滑块开启或关闭激光，让硬质地面上看不见的微尘显现。',
          tip: '1 级激光产品：对宠物和人类视觉安全。请避免直视光束。',
          set: { 'laser-switch': { at: [-56.5, 62, 92] }, laser: { light: 'on' } },
          camera: cam([350, 120, 0], [-0.5, 0.45, 1], 1100),
          highlight: ['laser-switch', 'laser'],
          zoom: zoom([294, 50, 95], [-1, 0.35, 0.5], 240, '吸头上的激光滑块'),
        },
      ],
    },
    // ================= 使用与屏幕 =================
    {
      id: 'use', title: '功率模式与屏幕', kind: 'usage',
      steps: [
        {
          id: 'trigger', title: '按住开关开始吸尘', page: 3,
          desc: '握住握把，按住开关开始吸尘；安装地面吸头后默认可用自动模式，屏幕显示剩余运行时间。',
          set: { screen: { ui: UI.auto } },
          actions: [{ type: 'press', part: 'trigger', depth: 4 }],
          camera: STICK_VIEW,
          highlight: ['trigger'],
          zoom: zoom([70, 1090, 0], [0.5, 0.1, 1], 300, '握把前侧的开关'),
        },
        {
          id: 'eco', title: '切换到节能模式', page: 3,
          desc: '轻点屏幕下方的红色按钮即可一键切换功率模式。节能模式（绿色图标）运行时间更长。',
          set: { screen: { ui: UI.eco } },
          actions: [{ type: 'press', part: 'screen-hub' }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen-hub'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '屏幕：节能'),
        },
        {
          id: 'boost', title: '强效模式', page: 3,
          desc: '再轻点一次切到强效模式（红色图标），集中清洁顽固污垢。',
          set: { screen: { ui: UI.boost } },
          actions: [{ type: 'press', part: 'screen-hub' }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen-hub'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '屏幕：强效'),
        },
        {
          id: 'particles', title: '自动模式与颗粒物统计', page: 3,
          desc: '自动模式（蓝色图标）兼顾吸力与运行时间。压电式传感器统计进气口颗粒物的大小和数量，灰尘多时自动增加吸力。',
          set: { screen: { ui: UI.particles } },
          actions: [{ type: 'press', part: 'screen-hub' }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '>10 / >60 / >180 / >500 微米'),
        },
        {
          id: 'menu', title: '进入设置菜单', page: 4,
          desc: '按住红色按钮直至菜单屏幕出现，轻点即可滚动浏览各选项。',
          set: { screen: { ui: UI.menu } },
          actions: [{ type: 'press', part: 'screen-hub', depth: 1.5 }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '设置菜单'),
        },
        {
          id: 'lang', title: '更改语言', page: 4,
          desc: '按住按钮直至语言列表出现后松开，轻点滚动到“中文”，再按住直到倒计时结束，出现绿色对勾即选择完成。倒计时期间松开按钮可取消。',
          set: { screen: { ui: UI.langDone } },
          actions: [{ type: 'press', part: 'screen-hub', depth: 1.5 }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '中文 已选择'),
        },
        {
          id: 'alert', title: '更改提醒设置', page: 4,
          desc: '在菜单中选择“提醒”，滚动选择打开或关闭，按住直至倒计时结束出现对勾。关闭后马达不再发出提醒脉冲，但堵塞提醒脉冲不会关闭。',
          set: { screen: { ui: UI.alert } },
          actions: [{ type: 'press', part: 'screen-hub', depth: 1.5 }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '提醒：打开 / 关闭'),
        },
        {
          id: 'low', title: '剩余运行时间不足', page: 5,
          desc: '电池需要充电时，机器发出三次脉冲，屏幕出现低运行时间图标；电量耗尽时出现红色警告图标。',
          tip: '为延长电池寿命，尽量使用节能模式或自动 / 中等模式。',
          set: { screen: { ui: UI.low } },
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '低运行时间'),
        },
        {
          id: 'exit', title: '退出设置菜单', page: 5,
          desc: '轻点滚动选项菜单，选择“退出菜单”。',
          set: { screen: { ui: UI.exit } },
          actions: [{ type: 'press', part: 'screen-hub' }],
          camera: cam([0, 1100, 0], [0.8, 0.9, 0.6], 900),
          highlight: ['screen'],
          zoom: zoom('screen', [0.8, 1, 0], 200, '退出菜单'),
        },
      ],
    },
    // ================= 充电与电池 =================
    {
      id: 'charge', title: '充电与更换电池', kind: 'usage',
      start: {
        body: onFloor(C_BODY),
        ...hide('wand', 'head'),
        ...show('charger', 'dc-plug', 'charger-cable', 'dock', 'wall'),
        screen: { ui: UI.first },
      },
      steps: [
        {
          id: 'first', title: '首次使用前请充满电', page: 6,
          desc: '开箱后及每次吸尘后都为机器充满电，电池监测系统会更准确地计算剩余运行时间。',
          camera: cam([-420, 180, 0], [0.35, 0.35, 1], 1500),
          highlight: ['screen'],
          zoom: zoom('screen', [1, 0.15, 0.2], 200, '首次使用前 请充满电'),
        },
        {
          id: 'plug', title: '充电线直接连接机器', page: 6,
          desc: '把充电器插头插入电池前端的充电口。充电时电池侧面的蓝色 LED 闪烁。',
          set: { 'dc-plug': { plug: { hole: 'batt-port', back: 50 } }, 'led-1': { light: 'blink' }, 'led-2': { light: 'blink' }, screen: { ui: UI.charging } },
          camera: cam([-540, 100, 60], [-0.2, 0.3, 1], 900),
          highlight: ['dc-plug', 'led-1', 'led-2'],
          zoom: zoom([-480, 25, 20], [-0.4, 0.2, 1], 200, '电池前端充电口与侧面 LED'),
        },
        {
          id: 'full', title: '充满电', page: 6,
          desc: '电池充满时两盏 LED 亮起 5 秒钟，屏幕显示 100% 电量。',
          tip: '环境温度低于 5°C（41℉）时机器无法运行或充电，以保护马达和电池。',
          set: { 'led-1': { light: 'on' }, 'led-2': { light: 'on' }, screen: { ui: UI.full } },
          camera: cam([-460, 120, 0], [0.4, 0.3, 1], 1100),
          highlight: ['led-1', 'led-2'],
          zoom: zoom([-480, 25, 20], [-0.2, 0.2, 1], 180, '两盏 LED 亮 5 秒'),
        },
        {
          id: 'batt-out', title: '拆卸电池', page: 6,
          desc: '拔下充电线，拿起主机，按下手柄上的电池释放按钮，然后将电池沿手柄向下滑动取下。',
          set: {
            'dc-plug': { parent: null, at: [-700, 6, 110], rot: [0, 0, 0] },
            'led-1': { light: 'off' }, 'led-2': { light: 'off' }, screen: { ui: null },
            body: { at: [C_BODY, 330, 0], delay: 0.9 },
            battery: { at: [240, 174, 0], delay: 2.1 },
          },
          actions: [{ type: 'press', part: 'batt-btn', depth: 2, delay: 1.8 }],
          camera: cam([-430, 200, 0], [0.2, 0.3, 1], 1300),
          highlight: ['batt-btn', 'battery'],
          zoom: zoom([-503, 206, 0], [-0.3, 0.2, 1], 200, '电池释放按钮'),
        },
        {
          id: 'batt-in', title: '重新安装电池', page: 6,
          desc: '将电池与手柄对齐并滑动到手柄上，用力推动直至听到“咔嗒”声，安全卡入原位。',
          chips: [{ label: '咔嗒' }],
          set: { battery: { at: [150, 174, 0] }, body: { at: [C_BODY, 170, 0], delay: 1.2 } },
          camera: cam([-430, 200, 0], [0.2, 0.3, 1], 1300),
          highlight: ['battery'],
        },
        {
          id: 'dock-plug', title: '充电线连接充电座', page: 6,
          desc: '也可以把充电线接到墙面充电座上，吸尘器挂在充电座上充电。',
          set: {
            charger: { at: [60, 15, 260] },
            'dc-plug': { plug: { hole: 'dock-port', back: 40 }, delay: 0.4 },
            ...show('wand', 'head'),
          },
          camera: cam([60, 650, 0], [-0.35, 0.2, 1], 2500),
          highlight: ['dc-plug', 'dock'],
          zoom: zoom([144, 806, 0], [-0.4, -0.5, 1], 300, '充电座底部接口'),
        },
        {
          id: 'hang', title: '挂上充电座充电', page: 6,
          desc: '把主机装回吸尘杆，挂到墙面充电座上，电池前端落在充电座上开始充电，蓝色 LED 闪烁。',
          set: {
            body: { parent: 'wand', at: BODY_ON_WAND, rot: [0, 0, 0], via: [-320, 1250, 0], dur: 2 },
            'led-1': { light: 'blink', delay: 2 }, 'led-2': { light: 'blink', delay: 2 },
          },
          camera: cam([60, 700, 0], [-0.35, 0.2, 1], 2600),
          highlight: ['body', 'dock', 'led-1', 'led-2'],
          zoom: zoom([150, 1015, 29], [-0.3, 0.2, 1], 300, '电池落在充电座上，LED 闪烁'),
        },
      ],
    },
    // ================= 集尘筒与阻塞物 =================
    {
      id: 'bin', title: '清空集尘筒与清理阻塞物', kind: 'repair',
      start: { ...show('trash'), cloth: { at: [-450, 224, 350], rot: [0, 0, 0] } },
      steps: [
        {
          id: 'max', title: '尘垢到达 MAX 时清空', page: 7,
          desc: '一旦尘垢达到 MAX（最大）标记，请尽快清空集尘筒，否则需要更频繁地清洁滤网，颗粒物图表读数也可能不准确。',
          camera: cam([0, 950, 0], [0.3, 0.2, 1], 900),
          highlight: ['bin', 'max'],
          zoom: zoom([0, 1014, 52], [0, 0.1, 1], 200, 'MAX 标记'),
        },
        {
          id: 'wand-off', title: '取下吸尘杆', page: 7,
          desc: '按下红色吸尘杆释放按钮，将吸尘杆从集尘筒处拉出。',
          set: { body: { parent: null, at: [0, 1060, 0], rot: [0, 0, 0], delay: 0.6 } },
          actions: [{ type: 'press', part: 'wand-btn', depth: 1.5 }],
          camera: cam([0, 950, 0], [0.3, 0.2, 1], 1500),
          highlight: ['wand-btn'],
          zoom: zoom([-22, 832, 0], [-0.6, 0.2, 1], 200, '红色吸尘杆释放按钮'),
        },
        {
          id: 'empty', title: '对准垃圾桶按下释放按钮', page: 7,
          desc: '将吸尘器置于垃圾桶之上，按下红色集尘筒释放按钮：集尘筒向下滑动，护罩上的尘垢被清出，集尘筒底部打开。',
          tip: '如果红色释放按钮没有向下推到位，集尘筒底部不会打开。可把集尘筒装进防尘袋里清空，减少与灰尘的接触。',
          set: {
            body: { at: [-500, 560, 0], lift: 80, dur: 1.4 },
            'bin-lever': { at: [62, 108, 0], delay: 1.5, dur: 0.5 },
            bin: { at: [0, 46, 0], delay: 1.5, dur: 0.5 },
            'bin-base': { rot: [0, 0, -105], delay: 2.0, dur: 0.6 },
          },
          camera: cam([-480, 450, 0], [0.3, 0.2, 1], 1500),
          highlight: ['bin-lever', 'bin-base'],
          zoom: zoom([-438, 680, 0], [0.5, 0.2, 1], 260, '红色集尘筒释放按钮'),
        },
        {
          id: 'close', title: '关闭集尘筒', page: 7,
          desc: '向上推动集尘筒底盖，直至集尘筒和底座“咔嗒”一声卡入原位。',
          chips: [{ label: '咔嗒' }],
          set: {
            'bin-base': { rot: [0, 0, 0], dur: 0.6 },
            bin: { at: [0, 66, 0], delay: 0.6, dur: 0.5 },
            'bin-lever': { at: [62, 128, 0], delay: 0.6, dur: 0.5 },
            body: { ...onFloor(-300, 350), via: [-500, 620, 300], delay: 1.3 },
          },
          camera: cam([-350, 300, 200], [0.3, 0.3, 1], 1600),
          highlight: ['bin-base', 'bin'],
        },
        {
          id: 'bin-off', title: '沿滑轨取下集尘筒', page: 7,
          desc: '清洁集尘筒前先清空。按下集尘筒滑轨上的红色按钮释放集尘筒，然后将集尘筒沿滑轨取下。',
          set: { bin: { at: [0, -150, 0], delay: 0.6 } },
          actions: [{ type: 'press', part: 'rail-btn', depth: 1.5 }],
          camera: cam([-330, 180, 350], [0.2, 0.35, 1], 1100),
          highlight: ['rail-btn', 'bin'],
          zoom: zoom([-270, 106, 350], [0.3, -0.3, 1], 220, '滑轨上的红色按钮'),
        },
        {
          id: 'block', title: '检查主机身的阻塞物', page: 8,
          desc: '检测到阻塞物时马达会发出脉冲，清除前无法使用。先与充电器断开、让机器冷却，取下集尘筒后检查主机身、吸尘杆两端和吸头，小心不要碰到开关。',
          tip: '保修中不含清理阻塞物。脉冲期间强行使用，机器会自动断电。',
          set: { screen: { ui: UI.block } },
          camera: cam([-300, 180, 300], [0.45, 0.35, 1], 1400),
          highlight: ['body', 'screen'],
          zoom: zoom('screen', [1, 0.15, 0.2], 200, '屏幕：气道堵塞'),
        },
        {
          id: 'wipe', title: '只用湿布清洁集尘筒', page: 7,
          desc: '仅可使用湿布清洁集尘筒，重新安装前确保集尘筒和密封部件完全晾干。不要放入洗碗机，也不要用洗涤剂、抛光剂或空气清洗剂。',
          set: { cloth: { visible: true }, screen: { ui: null } },
          actions: [{ type: 'shake', part: 'cloth', axis: 'x', amp: 30 }],
          camera: cam([-420, 200, 350], [0.3, 0.5, 1], 1000),
          highlight: ['bin', 'cloth'],
        },
        {
          id: 'bin-on', title: '重新安装集尘筒', page: 7,
          desc: '将集尘筒滑入滑轨，再向上推动集尘筒底盖，直至“咔嗒”卡入原位。',
          chips: [{ label: '咔嗒' }],
          set: { cloth: { visible: false }, bin: { at: [0, 66, 0], delay: 0.3, dur: 1.4 } },
          camera: cam([-300, 180, 350], [0.2, 0.35, 1], 1200),
          highlight: ['bin'],
        },
      ],
    },
    // ================= 滤网与刷条 =================
    {
      id: 'filter', title: '清洗滤网与软绒刷条', kind: 'usage',
      start: {
        body: onFloor(E_BODY),
        head: { at: [-450, 0, -350] },
        wand: { parent: 'head', at: WAND_ON_HEAD, rot: [0, 0, 0] },
        sink: { visible: true },
        trash: { at: [-700, 170, 100], visible: true },
        cloth: { at: [-512, 230, -400], rot: [0, 0, 90] },
      },
      steps: [
        {
          id: 'twist', title: '拧下滤网', page: 9,
          desc: '为保持理想吸力，滤网应每个月至少清洗一次。逆时针转动滤网，并从吸尘器上取下。',
          set: { filter: { at: [0, 110, 0], rot: [0, -70, 0], dur: 1.4 } },
          camera: cam([0, 170, 0], [0.4, 0.3, 1], 1100),
          highlight: ['filter'],
          zoom: zoom([90, 170, 0], [0.6, 0.3, 1], 340, '逆时针拧下'),
        },
        {
          id: 'tap', title: '在垃圾桶边轻叩滤网', page: 9,
          desc: '清洗前，在垃圾桶边轻叩滤网，去除附着在表面的灰尘和碎屑。',
          set: { filter: { at: [-250, -862, 100], rot: [0, 0, 90], lift: 120, dur: 1.6 } },
          actions: [{ type: 'shake', part: 'filter', axis: 'y', amp: 12 }],
          camera: cam([-450, 300, 50], [0.3, 0.3, 1], 1500),
          highlight: ['filter'],
        },
        {
          id: 'wash', title: '清洗、注水晃动并倒出余水', page: 9,
          desc: '用自来水清洗滤网并用手指轻轻揉搓。拿住滤网一端注满自来水，另一只手捂住开口一端晃动，重复直至水流清澈；然后用力向上及向下晃动，直至没有水流出。',
          set: { filter: { at: [-730, 538, -300], lift: 150, dur: 1.8 }, water: { visible: true, delay: 1.8 } },
          actions: [{ type: 'shake', part: 'filter', axis: 'x', amp: 8, delay: 2.2 }],
          camera: cam([650, 880, -250], [0.2, 0.2, 1], 1100),
          highlight: ['filter', 'water'],
        },
        {
          id: 'dry', title: '晾干至少 24 小时', page: 9,
          desc: '将滤网放在通风良好且温暖的地方晾晒至少 24 小时。不要放进滚筒式烘干机、微波炉，也不要靠近明火烘干。',
          chips: [{ label: '≥ 24 小时' }],
          set: { filter: { at: [121, -162, -300], rot: [0, 0, 0], via: [400, 850, -150], dur: 1.6, delay: 0.5 }, water: { visible: false, dur: 0.3 } },
          camera: cam([0, 120, -150], [0.3, 0.45, 1], 1500),
          highlight: ['filter'],
        },
        {
          id: 'align', title: '对准马达后端', page: 9,
          desc: '滤网彻底晾干后，把滤网开口一端对准马达后端。',
          tip: '重要：重新安装滤网前，滤网必须已彻底晾干。使用潮湿的滤网可能会损坏吸尘器。',
          set: { filter: { at: [0, 90, 0], rot: [0, 70, 0], dur: 1.6 } },
          camera: cam([60, 170, 100], [0.4, 0.3, 1], 1200),
          highlight: ['filter'],
        },
        {
          id: 'refit', title: '推入并顺时针拧紧滤网', page: 9,
          desc: '把滤网推到底并顺时针拧紧。滤网没有装好时，屏幕会提示“滤网 未密封”。',
          set: { filter: { at: [0, -22, 0], rot: [0, 0, 0], dur: 1.4 } },
          camera: cam([0, 170, 0], [0.4, 0.3, 1], 1100),
          highlight: ['filter'],
          zoom: zoom('screen', [1, 0.15, 0.2], 200, '未装好会提示：滤网 未密封'),
        },
        {
          id: 'head-off', title: '取下吸头并倒置', page: 10,
          desc: '断开充电器，注意不要碰触开关。按下吸尘杆一端的吸头释放按钮，取下光学纤巧软绒吸头并倒置。',
          set: {
            wand: { parent: null, at: [-250, 21, -150], rot: [0, 0, -90], via: [-300, 500, -250], dur: 1.6 },
            head: { at: [-450, 260, -350], rot: [180, 0, 0], delay: 1.4, lift: 60 },
          },
          actions: [{ type: 'press', part: 'head-btn', depth: 1.5 }],
          camera: cam([-300, 250, -200], [0.3, 0.3, 1], 1700),
          highlight: ['head-btn', 'head'],
          zoom: zoom([-472, 230, -350], [-0.5, 0.2, 1], 260, '吸尘杆下端的吸头释放按钮'),
        },
        {
          id: 'brush-out', title: '推出端盖，取出刷条', page: 10,
          desc: '将端盖完全推出，把刷条从吸头中取出。',
          set: { brush: { at: [-22, 38, -270], dur: 1.4 } },
          camera: cam([-390, 220, -150], [0.5, 0.25, 1], 1400),
          highlight: ['brush'],
        },
        {
          id: 'brush-wash', title: '清洗并直立晾干刷条', page: 10,
          desc: '将刷条置于自来水下轻轻揉搓，去除棉绒杂物或尘垢；然后直立放置，静置晾干至少 24 小时。',
          chips: [{ label: '≥ 24 小时' }],
          set: { brush: { at: [230, 142, 0], rot: [90, 0, 0], lift: 80, dur: 1.6 } },
          camera: cam([-330, 200, -350], [0.3, 0.3, 1], 1300),
          highlight: ['brush'],
        },
        {
          id: 'brush-in', title: '端盖装回刷条，对准吸头', page: 10,
          desc: '确认刷条完全晾干后，把端盖重新装回刷条，再把刷条对准吸头的刷条仓。',
          set: { brush: { at: [-22, 38, -250], rot: [0, 0, 0], lift: 60, dur: 1.8 } },
          camera: cam([-390, 220, -150], [0.5, 0.25, 1], 1400),
          highlight: ['brush'],
        },
        {
          id: 'brush-push', title: '滑入刷条，推入端盖', page: 10,
          desc: '将刷条重新滑入吸头，把端盖推入原位，关闭端盖。',
          set: { brush: { at: [-22, 38, 0], dur: 1.4 } },
          camera: cam([-390, 220, -150], [0.5, 0.25, 1], 1400),
          highlight: ['brush'],
        },
        {
          id: 'lens', title: '清洁光学透镜', page: 10,
          desc: '吸头从吸尘器上取下后，用柔软、干燥、不起毛的布擦拭激光透镜，保持理想性能。',
          set: { cloth: { visible: true } },
          actions: [{ type: 'shake', part: 'cloth', axis: 'x', amp: 6 }],
          camera: cam([-506, 230, -430], [-1, 0.35, 0.6], 800),
          highlight: ['laser'],
          zoom: zoom([-506, 230, -462], [-1, 0.2, -0.2], 200, '激光透镜'),
        },
      ],
    },
  ],
}
