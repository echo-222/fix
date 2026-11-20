import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 任天堂 Nintendo Switch（OLED 版）HEG-001 · 白色套装
 * 说明书：任天堂没有随机纸质说明书，国行以「腾讯 Nintendo Switch 官网技术支持」替代。
 * manuals-src/nintendo-switch-oled/manual.pdf（46 页）是从官方页面编的合订本：首次使用、充电、游戏模式、手柄、腕带、microSD、
 * OLED 版规格图、6 条常见问题，外加任天堂欧洲官网 Important Information 第 1 页。逐页转写见 manuals-src/nintendo-switch-oled/transcript.md。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。
 * - 主机原点在机身中心，屏幕朝 +z，顶部（电源键、游戏卡槽）朝 +y；从正面看电源键 / 音量键在左上，游戏卡槽在右上（p35、p36）。
 * - Joy-Con 原点在机身中心，按键面朝 +z；Joy-Con（L）滑轨在 +x 侧，（R）在 -x 侧。
 * - 基座原点在底面中心，正面（Logo、电视输出指示灯）朝 +z；主机插槽在前板后面，背面是后盖和接口仓。
 *
 * 推断（说明书没有给出）：
 * - 主机本体 172 × 102 × 14 mm：官方只给装上 Joy-Con 的 242 × 102 × 13.9 mm，Joy-Con 宽按公开参数约 35 mm 扣掉；
 *   Joy-Con 摇杆处最厚 28.4 mm（官方）；生成的 Joy-Con 模型机身偏厚、摇杆偏矮，代理形状按模型取（机身 21 mm、背面与主机齐平）。
 *   屏幕 155 × 87 mm 按 7.0 英寸 16:9 换算。
 * - 支架宽 150、长 80 mm，铰链在背面上部（p36 图按比例估）；桌面模式主机后仰 35°、支架张开 62° 刚好着地。
 * - microSD 卡槽在支架下方、正面看偏右，卡沿背面向上推入（p46 OLED Model 图）。
 * - 基座约 173 × 104 × 54 mm（公开参数）；后盖以底边为铰链向后翻开（p15、p46 图）；接口模块在背面看靠右（正面看靠左），
 *   自上而下：电源适配器端口、USB、HDMI、有线 LAN（p16、p38）。
 * - 电视输出指示灯颜色说明书没写，场景用绿色；插入基座时「闪烁一下」用 blinkThenOff 近似。
 * - 电视（32 英寸）、墙面插座、游戏卡、腕带尺寸按常见尺寸；电视 HDMI 口放在右侧面方便看。
 *
 * 外观模型：主机、Joy-Con（L）（R）、基座各照一张官方产品图生成（models/nintendo-switch-oled/tripo.json，来源 refs/sources.json）。
 * 主机图里的支架涂掉了，支架单独建几何体；游戏卡槽盖、Joy-Con 的 ± 键、基座后盖长在模型里，标 baked。
 * 步骤里要按的键（电源键、音量键、右 Joy-Con 的 ABXY 和主页键）做成几何体：右 Joy-Con 的参考图里这几个键先抹平再生成，
 * 主机顶边的电源 / 音量键在图里只有几个像素，模型上基本是平的，直接盖上几何体。
 */

const show = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
/**
 * via 是二次贝塞尔路径的中点（pose.ts）。给出控制点 c，反求 via，让路径在起点 / 终点沿竖直方向进出：
 * dropInto：控制点在终点正上方（竖直落下，滑轨、插槽）；liftOut：控制点在起点正上方（竖直抽出）。
 */
const viaFor = (p0: Vec3, p1: Vec3, c: Vec3): Vec3 => [(c[0] + (p0[0] + p1[0]) / 2) / 2, (c[1] + (p0[1] + p1[1]) / 2) / 2, (c[2] + (p0[2] + p1[2]) / 2) / 2]
const dropInto = (p0: Vec3, p1: Vec3, y: number): Vec3 => viaFor(p0, p1, [p1[0], y, p1[2]])
const liftOut = (p0: Vec3, p1: Vec3, y: number): Vec3 => viaFor(p0, p1, [p0[0], y, p0[2]])

const LED_GREEN = '#34c759'

// ---------- 布局（世界坐标） ----------

/** 手持 / 掌上模式：主机悬在桌面上方 */
const CON_HAND: Vec3 = [0, 150, 90]
const DOCK_AT: Vec3 = [0, 0, -60]
/** 主机在基座里：插槽底面 y = 12，前后居中在 z = 10.2（基座局部） */
const CON_DOCK: Vec3 = add(DOCK_AT, [0, 63.2, 10.2])
const ABOVE_DOCK: Vec3 = add(CON_DOCK, [0, 175, 0])
const DOCK_VIA: Vec3 = dropInto(CON_HAND, CON_DOCK, 520)
/** 桌面模式：后仰 35°，底边着地 */
const CON_TABLE: Vec3 = [0, 46.3, 80]
const TILT: Vec3 = [-35, 0, 0]
const STAND_OPEN: Vec3 = [62, 0, 0]

const TV_AT: Vec3 = [0, 0, -330]
const SOCKET_AT: Vec3 = [480, 250, -430]

/** Joy-Con 装在主机上的位置（主机局部），两侧滑轨 */
const JL_ON: Vec3 = [-103.6, 0, 0]
const JR_ON: Vec3 = [103.6, 0, 0]
/** 取下后平放在桌面上（按键朝上） */
const JL_REST: Vec3 = [-190, 8.5, 170]
const JR_REST: Vec3 = [190, 8.5, 170]
const FACE_UP: Vec3 = [-90, 0, 0]

/** 腕带演示：手里拿着 Joy-Con（R） */
const JR_HELD: Vec3 = [200, 200, 120]
const STRAP_ON: Vec3 = [-22.1, 0, 0]
const STRAP_ABOVE: Vec3 = add(JR_HELD, [-22.1, 115, 0])
const LOCK_OPEN: Vec3 = [-5.7, -43, 0]
const LOCK_SHUT: Vec3 = [-5.7, -38, 0]

/** 手里拿着的卡（主机局部）：已经摆成插入姿态，插卡 / 取卡都沿插入方向直进直出 */
const CARD_HOLD: PartState = { parent: 'console', at: [56, 100, 0], rot: [-90, 90, 0] }
const SD_HOLD: PartState = { parent: 'console', at: [40, -20, -30], rot: [90, 90, 0] }

const PLUG_REST = {
  /** 电视模式：线材先放在基座后面 */
  ac: [-30, 3.5, -200] as Vec3,
  hdmiA: [-70, 5, -205] as Vec3,
  hdmiB: [420, 5, -240] as Vec3,
  adapter: [300, 31.5, -200] as Vec3,
  /** 直接给主机充电：线材放在主机前面 */
  acFront: [60, 3.5, 160] as Vec3,
  adapterFront: [300, 31.5, 60] as Vec3,
}

const COVER_OPEN: Vec3 = [-95, 0, 0]
const CARD_COVER_OPEN: Vec3 = [-100, 0, 0]

// ---------- 屏幕界面 ----------

const HOME: ScreenUI = {
  app: 'HOME', title: '主页菜单',
  items: [{ text: '游戏卡软件', sub: '按 A 启动', state: 'selected' }, { text: '相册' }, { text: '设置' }],
}
const UI = {
  home: HOME,
  paired: { ...HOME, toast: 'Joy-Con 已和主机匹配' } as ScreenUI,
  charging: { ...HOME, toast: '充电中 · 约 3 小时充满' } as ScreenUI,
  closeSoft: {
    app: 'HOME', title: '软件已暂停',
    items: [{ text: '游戏卡软件', sub: '暂停中', state: 'selected' }, { text: '关闭软件前请先保存', state: 'muted' }],
    button: 'X 关闭软件', buttonActive: true,
  } as ScreenUI,
  quick: {
    app: '快速设置', title: '持续按住主页键 1 秒',
    items: [{ text: '休眠', state: 'selected' }, { text: '屏幕亮度' }, { text: '飞行模式' }],
  } as ScreenUI,
  power: {
    app: '电源选项', title: '按住电源键 3 秒',
    items: [{ text: '休眠' }, { text: '电源选项 → 关机', state: 'selected' }, { text: '重新启动' }],
  } as ScreenUI,
  input: {
    app: '电视', title: '切换信号源',
    items: [{ text: 'HDMI 1', sub: '已连接 Nintendo Switch 基座', state: 'selected' }, { text: 'HDMI 2', state: 'muted' }],
  } as ScreenUI,
  frozen: { app: '画面卡住', title: '按键没有反应', items: [{ text: '游戏卡软件', state: 'muted' }] } as ScreenUI,
  search: {
    app: '手柄', title: '搜索手柄',
    items: [{ text: 'Joy-Con（L）', sub: '振动中', state: 'selected' }, { text: 'Joy-Con（R）', sub: '振动中', state: 'selected' }],
    toast: '未匹配或距离太远时不会振动',
  } as ScreenUI,
}

// ---------- 形体 ----------

/** USB Type-C 插头：原点在插头与外壳交界，+x 插进接口 */
const usbcPlug = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [13, 6, 11], chamfer: 2, at: [-6.5, 0, 0] },
    { type: 'box', size: [6.5, 2.4, 8.2], at: [3.25, 0, 0], fill: 'shade', finish: 'steel' },
  ],
})
const hdmiPlug = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [13, 9, 21], chamfer: 2, at: [-6.5, 0, 0] },
    { type: 'box', size: [8, 4.5, 14], at: [4, 0, 0], fill: 'shade', finish: 'steel' },
  ],
})
/** 线从插头下方（插头局部 -y）引出 */
const USBC_OUT = { at: [-8, -3, 0] as Vec3, dir: [0, -1, 0] as Vec3 }
const HDMI_OUT = { at: [-9, -4.5, 0] as Vec3, dir: [0, -1, 0] as Vec3 }

/**
 * Joy-Con 机身：35 × 102，背面与主机背面齐平（z = -7），正面在 JOY_FACE，摇杆朝 +z 伸出到 z = 18。
 * 按外观模型取：生成的 Joy-Con 机身偏厚、摇杆偏矮，拉伸进代理包围盒后正面在 z ≈ 14，按键要贴在这个面上。
 */
const JOY_FACE = 14
const joyconBody = (stick: [number, number], extra: (Shape & { at?: Vec3; fill?: 'white' | 'shade' | 'dark' })[]): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [35, 102, JOY_FACE + 7], chamfer: 5, at: [0, 0, JOY_FACE / 2 - 3.5] },
    { type: 'cylinder', r: 4, h: 2, axis: 'z', at: [stick[0], stick[1], JOY_FACE + 1], fill: 'shade' },
    { type: 'cylinder', r: 8.5, h: 2.5, axis: 'z', at: [stick[0], stick[1], 16.75], fill: 'shade', finish: 'rubber' },
    ...extra,
  ],
})
const faceBtn = (x: number, y: number) => ({ type: 'cylinder' as const, r: 3.2, h: 1.6, axis: 'z' as const, at: [x, y, JOY_FACE + 0.8] as Vec3, fill: 'shade' as const })
const BTN: Shape = { type: 'cylinder', r: 3.6, h: 1.6, axis: 'z' }

// ---------- 零件 ----------

const consoleParts: SpecPart[] = [
  {
    id: 'console', name: 'Nintendo Switch（OLED 版）主机', spec: 'HEG-001 · 7.0 英寸 OLED · 64 GB',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [172, 102, 14], chamfer: 3 },
        { type: 'hole', w: 52, h: 3, r: 1.5, at: [2, 51.05, -2], rot: [-90, 0, 0], fill: 'dark' },
        { type: 'hole', w: 3.6, h: 3.6, r: 1.8, at: [32, 51.05, 0], rot: [-90, 0, 0], fill: 'dark' },
        { type: 'hole', w: 16, h: 3, r: 1.5, at: [-62, -51.05, 0], rot: [90, 0, 0], fill: 'dark' },
        { type: 'hole', w: 16, h: 3, r: 1.5, at: [62, -51.05, 0], rot: [90, 0, 0], fill: 'dark' },
        { type: 'hole', w: 16, h: 18, r: 2, at: [40, 18, -7.05], rot: [0, 180, 0] },
      ],
    },
    at: CON_HAND, fill: 'shade', finish: 'plastic-black',
    model: { src: '/models/nintendo-switch-oled/console.glb', rot: [58, -90, 0], fit: 'stretch' },
  },
  { id: 'screen', name: '7.0 英寸 OLED 屏幕', spec: '电容触摸屏 · 1280 × 720', parent: 'console', shape: { type: 'screen', w: 155, h: 87 }, at: [0, 1, 7.15] },
  { id: 'screen-off', name: '屏幕（熄灭）', parent: 'console', shape: { type: 'box', size: [155, 87, 0.3] }, at: [0, 1, 7.35], fill: 'dark', finish: 'plastic-black', visible: false },
  { id: 'btn-power', name: '电源键', spec: '轻按 = 休眠 / 解除；按住 3 秒 = 电源选项；按住 12 秒 = 强制关机', parent: 'console', shape: { type: 'box', size: [7, 2, 4], chamfer: 0.6 }, at: [-63, 52, 0], fill: 'shade' },
  { id: 'btn-vol', name: '音量键', parent: 'console', shape: { type: 'box', size: [17, 2, 4], chamfer: 0.6 }, at: [-46, 52, 0], fill: 'shade' },
  {
    id: 'card-cover', name: '游戏卡槽盖', spec: '铰链在后沿', parent: 'console',
    shape: { type: 'compound', items: [{ type: 'box', size: [26, 1.6, 9], chamfer: 0.4, at: [0, 0.8, 4.5] }] },
    at: [56, 51, -4.5], fill: 'shade', finish: 'plastic-black', baked: true,
  },
  { id: 'card-slot', name: '游戏卡槽', parent: 'console', shape: { type: 'hole', w: 22, h: 4, r: 1 }, at: [56, 51.05, 0], rot: [-90, 0, 0], fill: 'dark' },
  { id: 'usb-c', name: 'USB Type-C 端口（底部）', spec: '连接电源适配器和基座', parent: 'console', shape: { type: 'hole', w: 9, h: 3.2, r: 1.5 }, at: [0, -51.05, 0], rot: [90, 0, 0], fill: 'dark' },
  { id: 'sd-slot', name: 'microSD 卡槽', spec: '在支架下方', parent: 'console', shape: { type: 'hole', w: 11, h: 1.2, r: 0.4 }, at: [40, 11, -7.7], rot: [90, 0, 0], fill: 'dark' },
  {
    id: 'stand', name: '支架', spec: '支起后可让主机自行架在桌面上', parent: 'console',
    shape: { type: 'compound', items: [{ type: 'box', size: [150, 80, 2.2], chamfer: 1, at: [0, -40, -1.1] }] },
    at: [0, 36, -7], fill: 'shade', finish: 'plastic-black',
  },
  { id: 'game-card', name: '游戏卡', spec: '标签面与屏幕同侧', shape: { type: 'compound', items: [{ type: 'box', size: [31, 3.3, 21], chamfer: 0.6, at: [15.8, 0, 0] }] }, parent: 'console', at: [56, 100, 0], rot: [-90, 90, 0], fill: 'white', finish: 'plastic-grey', visible: false },
  { id: 'sd-card', name: 'microSD 卡', spec: 'microSD / SDHC / SDXC · 推荐 UHS-I', shape: { type: 'compound', items: [{ type: 'box', size: [15, 0.8, 11], chamfer: 0.2, at: [6, 0, 0] }] }, parent: 'console', at: [40, -20, -30], rot: [90, 90, 0], fill: 'dark', finish: 'plastic-black', visible: false },
]

const joyconParts: SpecPart[] = [
  {
    id: 'jl', name: 'Joy-Con（L）', spec: '白色 · 左侧带 − 键', parent: 'console',
    shape: joyconBody([-2, 22], [
      faceBtn(-2, -3), faceBtn(-2, -17), faceBtn(-9, -10), faceBtn(5, -10),
      { type: 'box', size: [5, 5, 1.6], at: [6, -33, JOY_FACE + 0.8], fill: 'shade' },
    ]),
    at: JL_ON, finish: 'plastic-white',
    model: { src: '/models/nintendo-switch-oled/joycon-l.glb', rot: [0, -90, 0], fit: 'stretch' },
  },
  { id: 'jl-minus', name: '− 键', parent: 'jl', shape: { type: 'box', size: [6, 1.6, 1.4] }, at: [10, 44, JOY_FACE + 0.7], fill: 'dark', baked: true },
  { id: 'jl-release', name: '解锁键（L）', spec: 'Joy-Con 背面靠上', parent: 'jl', shape: { type: 'cylinder', r: 3, h: 1.2, axis: 'z' }, at: [11, 40, -7.6], fill: 'dark', finish: 'plastic-black' },
  {
    id: 'jr', name: 'Joy-Con（R）', spec: '白色 · 右侧带 + 键', parent: 'console',
    shape: joyconBody([0.5, -3], []),
    at: JR_ON, finish: 'plastic-white',
    model: { src: '/models/nintendo-switch-oled/joycon-r.glb', rot: [0, -90, 0], fit: 'stretch' },
  },
  { id: 'jr-plus', name: '+ 键', parent: 'jr', shape: { type: 'box', size: [6, 6, 1.4] }, at: [-9.4, 40.7, JOY_FACE + 0.7], fill: 'dark', baked: true },
  // ABXY、主页键位置按参考图量（机身 35 × 102 对应图里导轨左沿到右沿、上沿到下沿），模型上这几处是抹平的空白
  { id: 'jr-x', name: 'X 键', parent: 'jr', shape: BTN, at: [0.5, 32.5, JOY_FACE + 0.8], fill: 'dark', finish: 'plastic-black' },
  { id: 'jr-a', name: 'A 键', parent: 'jr', shape: BTN, at: [7.8, 24.8, JOY_FACE + 0.8], fill: 'dark', finish: 'plastic-black' },
  { id: 'jr-b', name: 'B 键', parent: 'jr', shape: BTN, at: [0.5, 17.2, JOY_FACE + 0.8], fill: 'dark', finish: 'plastic-black' },
  { id: 'jr-y', name: 'Y 键', parent: 'jr', shape: BTN, at: [-7.4, 24.8, JOY_FACE + 0.8], fill: 'dark', finish: 'plastic-black' },
  { id: 'jr-home', name: '主页键', spec: '按 = 主页菜单；按住 1 秒 = 快速设置', parent: 'jr', shape: BTN, at: [-5.6, -22, JOY_FACE + 0.8], fill: 'shade', finish: 'plastic-grey' },
  { id: 'jr-release', name: '解锁键（R）', parent: 'jr', shape: { type: 'cylinder', r: 3, h: 1.2, axis: 'z' }, at: [-11, 40, -7.6], fill: 'dark', finish: 'plastic-black' },
  {
    id: 'strap', name: 'Joy-Con 腕带（+）', spec: '附 SL / SR 键与滑动锁扣',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [9, 96, 15], chamfer: 2 },
        { type: 'box', size: [1.6, 12, 5], at: [-5.3, 22, 0], fill: 'shade' },
        { type: 'box', size: [1.6, 12, 5], at: [-5.3, -22, 0], fill: 'shade' },
        { type: 'text', text: '+', size: 6, at: [0, 42, 7.6] },
        { type: 'cylinder', r: 1.4, h: 70, at: [0, -83, 0], fill: 'dark' },
        { type: 'box', size: [8, 10, 8], chamfer: 2, at: [0, -100, 0], fill: 'dark' },
      ],
    },
    at: STRAP_ABOVE, fill: 'shade', finish: 'plastic-black', visible: false,
  },
  { id: 'strap-lock', name: '滑动锁扣', spec: '向上 = 锁好 · 向下 = 解锁', parent: 'strap', shape: { type: 'box', size: [2.4, 7, 9], chamfer: 0.6 }, at: LOCK_OPEN, fill: 'white', finish: 'plastic-grey' },
]

const dockParts: SpecPart[] = [
  {
    id: 'dock', name: 'Nintendo Switch 基座', spec: 'HEG-007 · 带有线 LAN 端口',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [173, 92, 8], chamfer: 3, at: [0, 46, 23] },
        { type: 'box', size: [173, 12, 19], at: [0, 6, 9.5] },
        { type: 'box', size: [173, 104, 6], chamfer: 2, at: [0, 52, -3] },
        { type: 'box', size: [4, 104, 18.5], at: [84.5, 52, -15.25] },
        { type: 'box', size: [4, 104, 18.5], at: [-84.5, 52, -15.25] },
        { type: 'box', size: [165, 4, 18.5], at: [0, 2, -15.25] },
        { type: 'box', size: [40, 70, 4], at: [-40, 52, -8], fill: 'dark', finish: 'plastic-black' },
        { type: 'hole', w: 9, h: 5, r: 1, at: [-40, 62, -10.1], rot: [0, 180, 0], fill: 'dark' },
        { type: 'hole', w: 12, h: 10, r: 1, at: [-40, 24, -10.1], rot: [0, 180, 0], fill: 'dark' },
        { type: 'hole', w: 12, h: 6, r: 1, at: [-86.55, 30, 12], rot: [0, -90, 0], fill: 'dark' },
        { type: 'hole', w: 12, h: 6, r: 1, at: [-86.55, 46, 12], rot: [0, -90, 0], fill: 'dark' },
      ],
    },
    at: DOCK_AT, finish: 'plastic-white',
    model: { src: '/models/nintendo-switch-oled/dock.glb', rot: [0, -90, 0], fit: 'stretch' },
  },
  {
    id: 'dock-cover', name: '基座后盖', spec: '关闭后可隐藏各种线的连接部分', parent: 'dock',
    shape: { type: 'compound', items: [{ type: 'box', size: [165, 86, 2.5], chamfer: 1, at: [0, 43, 0] }] },
    at: [0, 14, -25.75], finish: 'plastic-white', baked: true,
  },
  { id: 'dock-ac', name: '电源适配器端口', spec: '接口模块最上方', parent: 'dock', shape: { type: 'hole', w: 9, h: 3.2, r: 1.5 }, at: [-40, 80, -10.1], rot: [0, 180, 0], fill: 'dark' },
  { id: 'dock-hdmi', name: 'HDMI 端口', spec: '接口模块下方', parent: 'dock', shape: { type: 'hole', w: 15, h: 5.5, r: 1 }, at: [-40, 42, -10.1], rot: [0, 180, 0], fill: 'dark' },
  { id: 'tv-led', name: '电视输出指示灯', spec: '影像输出至电视时会亮起', parent: 'dock', shape: { type: 'led', r: 1.4, color: LED_GREEN }, at: [78, 5, 27.15] },
]

const propParts: SpecPart[] = [
  { id: 'ac-plug', name: '电源适配器 USB-C 插头', shape: usbcPlug(), at: PLUG_REST.ac, fill: 'dark', finish: 'plastic-black', visible: false },
  {
    id: 'adapter', name: '电源适配器', spec: 'HAC-002(CHN) · 5 V 1.5 A / 15 V 2.6 A',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [28, 62, 52], chamfer: 5, at: [-14, 0, 0] },
        { type: 'box', size: [10, 6.5, 1.5], at: [5, 0, 6], fill: 'shade', finish: 'steel' },
        { type: 'box', size: [10, 6.5, 1.5], at: [5, 0, -6], fill: 'shade', finish: 'steel' },
      ],
    },
    at: PLUG_REST.adapter, fill: 'dark', finish: 'plastic-black', visible: false,
  },
  { id: 'ac-cable', name: '电源适配器线', shape: { type: 'cable', from: { part: 'ac-plug', ...USBC_OUT }, to: { part: 'adapter', at: [-28, -20, 0], dir: [-1, 0, 0] }, r: 1.8 }, visible: false },
  { id: 'hdmi-a', name: 'HDMI 线（基座端）', spec: 'HEG-005 高速 HDMI 线', shape: hdmiPlug(), at: PLUG_REST.hdmiA, fill: 'dark', finish: 'plastic-black', visible: false },
  { id: 'hdmi-b', name: 'HDMI 线（电视端）', shape: hdmiPlug(), at: PLUG_REST.hdmiB, fill: 'dark', finish: 'plastic-black', visible: false },
  { id: 'hdmi-cable', name: 'HDMI 线', shape: { type: 'cable', from: { part: 'hdmi-a', ...HDMI_OUT }, to: { part: 'hdmi-b', ...HDMI_OUT }, r: 2.6 }, visible: false },
  {
    id: 'tv', name: '电视机', spec: '支持 HDMI 输入（单独另售）',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [240, 8, 140], chamfer: 3, at: [0, 4, 0], fill: 'shade' },
        { type: 'box', size: [50, 125, 24], at: [0, 70, -20], fill: 'shade' },
        { type: 'box', size: [720, 420, 44], chamfer: 4, at: [0, 340, 0] },
      ],
    },
    at: TV_AT, fill: 'dark', finish: 'plastic-black',
  },
  { id: 'tv-screen', name: '电视画面', parent: 'tv', shape: { type: 'screen', w: 700, h: 394 }, at: [0, 340, 22.3], visible: false },
  { id: 'tv-hdmi', name: '电视 HDMI 输入口', parent: 'tv', shape: { type: 'hole', w: 15, h: 5.5, r: 1 }, at: [360.3, 220, 0], rot: [0, 90, 0], fill: 'shade' },
  {
    id: 'socket-plate', name: '墙面插座', spec: '直连插座，不要用插板',
    shape: {
      type: 'compound',
      items: [
        { type: 'box', size: [86, 23, 12], chamfer: 2, at: [0, 31.5, 0] },
        { type: 'box', size: [86, 23, 12], chamfer: 2, at: [0, -31.5, 0] },
        { type: 'box', size: [23, 40, 12], at: [-31.5, 0, 0] },
        { type: 'box', size: [23, 40, 12], at: [31.5, 0, 0] },
        { type: 'box', size: [40, 40, 2], at: [0, 0, -7], fill: 'shade' },
      ],
    },
    at: SOCKET_AT, finish: 'plastic-white',
  },
  { id: 'socket', name: '插座孔', parent: 'socket-plate', shape: { type: 'hole', w: 40, h: 40, r: 6 }, at: [0, 0, 6.1], fill: 'shade' },
]

const parts: SpecPart[] = [...consoleParts, ...joyconParts, ...dockParts, ...propParts]

// ---------- 状态片段 ----------

const SCREEN_OFF: Record<string, PartState> = { screen: { visible: false }, 'screen-off': { visible: true } }
const screenOffAt = (delay: number): Record<string, PartState> => ({ screen: { visible: false, delay }, 'screen-off': { visible: true, delay } })
const screenOn = (ui: ScreenUI, delay = 0): Record<string, PartState> => ({
  screen: { visible: true, ui, delay }, 'screen-off': { visible: false, delay },
})

/** 主机在 at 处时，Joy-Con 滑轨正上方（世界坐标） */
const aboveRail = (con: Vec3, side: Vec3): Vec3 => add(con, [side[0], 160, side[2]])

const RAIL_Y = 420
const detach = (con: Vec3, delay = 0): Record<string, PartState> => ({
  jl: { parent: null, at: JL_REST, rot: FACE_UP, via: liftOut(add(con, JL_ON), JL_REST, RAIL_Y), dur: 1.8, delay },
  jr: { parent: null, at: JR_REST, rot: FACE_UP, via: liftOut(add(con, JR_ON), JR_REST, RAIL_Y), dur: 1.8, delay: delay + 0.4 },
})
const attach = (con: Vec3, delay = 0): Record<string, PartState> => ({
  jl: { parent: 'console', at: JL_ON, rot: [0, 0, 0], via: dropInto(JL_REST, add(con, JL_ON), RAIL_Y), dur: 1.6, delay },
  jr: { parent: 'console', at: JR_ON, rot: [0, 0, 0], via: dropInto(JR_REST, add(con, JR_ON), RAIL_Y), dur: 1.6, delay: delay + 0.5 },
})
const JC_OFF: Record<string, PartState> = {
  jl: { parent: null, at: JL_REST, rot: FACE_UP },
  jr: { parent: null, at: JR_REST, rot: FACE_UP },
}

/** 电视模式装好后的状态（故障排查从这里开始） */
const TV_READY: Record<string, PartState> = {
  ...JC_OFF,
  console: { at: CON_DOCK },
  ...SCREEN_OFF,
  ...show('ac-cable', 'hdmi-cable'),
  'ac-plug': { visible: true, plug: 'dock-ac' },
  'hdmi-a': { visible: true, plug: 'dock-hdmi' },
  'hdmi-b': { visible: true, plug: 'tv-hdmi' },
  adapter: { visible: true, plug: 'socket' },
  'tv-led': { light: 'on', color: LED_GREEN },
  'tv-screen': { visible: true, ui: UI.frozen },
}

// ---------- 镜头 ----------

const CAM = {
  hand: { target: add(CON_HAND, [0, 10, 0]), dir: [0.12, 0.22, 1], dist: 560 } as CameraSpec,
  handHigh: { target: add(CON_HAND, [0, 60, 0]), dir: [0.12, 0.3, 1], dist: 680 } as CameraSpec,
  /** 主机 + 桌面上平放的两只 Joy-Con */
  desk: { target: [0, 110, 130], dir: [0.1, 0.5, 1], dist: 820 } as CameraSpec,
  handBack: { target: CON_HAND, dir: [0, 0.3, -1], dist: 470 } as CameraSpec,
  table: { target: [0, 70, 120], dir: [0.25, 0.45, 1], dist: 700 } as CameraSpec,
  strap: { target: add(JR_HELD, [-10, 50, 0]), dir: [-0.35, 0.2, 1], dist: 500 } as CameraSpec,
  dockBack: { target: add(DOCK_AT, [-20, 50, -50]), dir: [-0.45, 0.5, -1], dist: 480 } as CameraSpec,
  setup: { target: [80, 200, -200], dir: [0.55, 0.45, 1], dist: 1450 } as CameraSpec,
  tv: { target: add(TV_AT, [0, 280, 0]), dir: [0.1, 0.12, 1], dist: 1050 } as CameraSpec,
  tvSide: { target: add(TV_AT, [330, 180, 0]), dir: [1, 0.35, 0.45], dist: 520 } as CameraSpec,
  socket: { target: add(SOCKET_AT, [-60, -60, 60]), dir: [0.5, 0.35, 1], dist: 650 } as CameraSpec,
  dockFront: { target: add(DOCK_AT, [0, 110, 0]), dir: [0.3, 0.3, 1], dist: 620 } as CameraSpec,
  tableBack: { target: [30, 30, 70], dir: [0.6, 0.35, -1], dist: 380 } as CameraSpec,
  tableSide: { target: [0, 50, 70], dir: [1, 0.45, -0.35], dist: 560 } as CameraSpec,
}

// ---------- 说明书 ----------

export const nintendoSwitchOled: ManualSpec = {
  id: 'nintendo-switch-oled',
  name: 'Nintendo Switch（OLED 版）',
  desc: 'Joy-Con 装卸与腕带、连接电视、桌面模式与 microSD、开机充电、故障排查',
  category: '游戏机',
  dims: { width: 242, depth: 28.4, height: 102 },
  source: {
    title: '腾讯 Nintendo Switch 官网技术支持（首次使用须知 / 充电方法 / 游戏模式与连接方法 / 手柄准备 / 腕带 / microSD / OLED 版规格 / 常见问题）+ 任天堂欧洲 Important Information',
    url: 'https://www.nintendoswitch.com.cn/support/',
    images: [],
  },
  package: [
    { name: 'Nintendo Switch（OLED 版）主机', qty: 1, spec: 'HEG-001' },
    { name: 'Joy-Con（L）/（R）', qty: 1, spec: '白色，一对' },
    { name: 'Nintendo Switch 基座', qty: 1, spec: 'HEG-007，带有线 LAN 端口' },
    { name: 'Joy-Con 握把', qty: 1 },
    { name: 'Joy-Con 腕带', qty: 2, spec: '− / + 各一' },
    { name: '高速 HDMI 线', qty: 1, spec: 'HEG-005' },
    { name: '电源适配器', qty: 1, spec: 'HAC-002(CHN)' },
  ],
  params: [
    { label: '尺寸', value: '102 × 242 × 13.9 mm', note: '装上 Joy-Con；摇杆处最厚 28.4 mm' },
    { label: '重量', value: '约 320 g', note: '装上 Joy-Con 约 420 g' },
    { label: '屏幕', value: '7.0 英寸 OLED 电容触摸屏', note: '1280 × 720' },
    { label: '内存', value: '64 GB', note: '可用 microSD / SDHC / SDXC 扩展' },
    { label: '电池', value: '4310 mAh', note: '约 4.5–9 小时；充满约 3 小时（休眠时测）' },
    { label: 'Joy-Con 充电', value: '约 3.5 小时', note: '装在充电中的主机上' },
    { label: '电源适配器', value: 'HAC-002', note: '输出 5 V 1.5 A / 15 V 2.6 A；电视模式请直连插座' },
    { label: '接口', value: 'USB Type-C · 3.5 mm 耳机麦克风', note: '基座：USB ×2（侧面）+ 1（背面）、HDMI、有线 LAN' },
    { label: '使用环境', value: '5–35 °C' },
  ],
  parts,
  initial: {
    screen: { ui: UI.home },
  },
  stageSize: 1500,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    {
      id: 'joycon', title: 'Joy-Con 装卸与腕带', kind: 'usage',
      start: { ...JC_OFF },
      steps: [
        {
          id: 'align', title: '对准方向：− 在左、+ 在右', page: 24,
          desc: '不要左右反向装上 Joy-Con，装上后按键要在主机屏幕一侧。左侧 Joy-Con 设有 − 键，右侧设有 + 键。',
          set: {
            jl: { at: aboveRail(CON_HAND, JL_ON), rot: [0, 0, 0], lift: 30, dur: 1.4 },
            jr: { at: aboveRail(CON_HAND, JR_ON), rot: [0, 0, 0], lift: 30, dur: 1.4, delay: 0.3 },
          },
          camera: CAM.handHigh,
          highlight: ['jl', 'jr'],
          callouts: [
            { part: 'jl-minus', text: '− 在左', offset: [-18, 18, 0] },
            { part: 'jr-plus', text: '+ 在右', offset: [18, 18, 0] },
          ],
        },
        {
          id: 'slide-in', title: '沿滑轨由上至下滑入，直到咔嗒一声', page: 23,
          desc: '沿主机侧面的滑轨，由上至下滑入 Joy-Con，直到听到咔嗒响声。装上的 Joy-Con 会和主机匹配。',
          tip: '一台主机最多可以匹配 10 只 Joy-Con；取下后仍保留匹配信息。',
          set: {
            jl: { parent: 'console', at: JL_ON, dur: 1.2 },
            jr: { parent: 'console', at: JR_ON, dur: 1.2, delay: 1 },
            screen: { ui: UI.paired, delay: 2.2 },
          },
          camera: CAM.hand,
          highlight: ['jl', 'jr'],
          callouts: [{ part: 'console', text: '滑轨', sub: '主机左右两侧', at: [-86, 30, 0], offset: [-40, 40, 0] }],
        },
        {
          id: 'release', title: '按住背面的解锁键', page: 25,
          desc: '电视模式 / 桌面模式下需要取下 Joy-Con。先按住 Joy-Con 背面的解锁键。',
          camera: CAM.handBack,
          highlight: ['jl-release', 'jr-release'],
          actions: [{ type: 'press', part: 'jl-release', depth: 0.8 }, { type: 'press', part: 'jr-release', depth: 0.8 }],
          zoom: { target: 'jl-release', dir: [-0.3, 0.3, -1], dist: 90, caption: '圆形解锁键在 Joy-Con 背面靠上' },
        },
        {
          id: 'slide-out', title: '由下至上滑动取下', page: 25,
          desc: '按住解锁键，把 Joy-Con 由下至上滑出。取下后仍保留和主机的匹配信息，可直接作为无线手柄使用。',
          set: { ...detach(CON_HAND) },
          camera: CAM.desk,
          highlight: ['jl', 'jr'],
        },
        {
          id: 'strap-marks', title: '腕带：确认 −、+ 标记对应', page: 28,
          desc: '仅用 Joy-Con 游戏时可装上腕带。先确认手柄与腕带的 −、+ 标记相互对应：+ 腕带配 Joy-Con（R）。',
          set: {
            jr: { at: JR_HELD, rot: [0, 0, 0], lift: 40, dur: 1.4 },
            strap: { visible: true, delay: 1.2 },
          },
          camera: CAM.strap,
          highlight: ['strap', 'jr'],
          callouts: [
            { part: 'strap', text: '腕带 +', at: [0, 42, 7.6], offset: [-22, 16, 0] },
            { part: 'jr-plus', text: 'Joy-Con +', offset: [22, 18, 0] },
          ],
        },
        {
          id: 'strap-on', title: '打开滑动锁扣，由上至下滑入腕带', page: 28,
          desc: '确认腕带的滑动锁扣已打开（在下方），再把腕带沿 Joy-Con 的滑轨由上至下滑动装上。',
          set: { strap: { parent: 'jr', at: STRAP_ON, dur: 1.4 } },
          camera: CAM.strap,
          highlight: ['strap', 'strap-lock'],
          zoom: { target: 'strap-lock', dir: [-1, 0.2, 0.4], dist: 80, caption: '锁扣在下 = 打开，才能滑入' },
        },
        {
          id: 'strap-lock', title: '把滑动锁扣向上按，锁好', page: 29,
          desc: '将腕带下方的滑动锁扣向上按并锁好，再按住带扣调节绳长，防止手从绳圈中滑出。',
          set: { 'strap-lock': { at: LOCK_SHUT, dur: 0.5 } },
          camera: CAM.strap,
          highlight: ['strap-lock'],
          zoom: { target: 'strap-lock', dir: [-1, 0.2, 0.4], dist: 80, caption: '锁扣推到上方 = 锁好' },
        },
        {
          id: 'strap-unlock', title: '取下腕带：先向下按锁扣解锁', page: 30,
          desc: '取下时先把滑动锁扣向下按，解锁。',
          tip: '一定要先解锁再取下。未解锁就强行滑动手柄，可能造成滑动锁扣损坏（p31）。',
          set: { 'strap-lock': { at: LOCK_OPEN, dur: 0.5 } },
          camera: CAM.strap,
          highlight: ['strap-lock'],
          zoom: { target: 'strap-lock', dir: [-1, 0.2, 0.4], dist: 80, caption: '锁扣回到下方 = 解锁' },
        },
        {
          id: 'strap-off', title: '沿滑轨分开，无需按解锁键', page: 30,
          desc: '把 Joy-Con 向下滑动取下腕带。取腕带时不需要按 Joy-Con 背面的“解锁键”。',
          set: { strap: { parent: null, at: STRAP_ABOVE, dur: 1.3 } },
          camera: CAM.strap,
          highlight: ['strap', 'jr'],
        },
        {
          id: 'reattach', title: '装回主机，给 Joy-Con 充电', page: 12,
          desc: '给正在充电的主机装上 Joy-Con 就能为 Joy-Con 充电，充满约 3.5 小时。',
          tip: '主机没在充电时，只有 Joy-Con 电量较低才会充电，电量过半便停止（p13）。',
          chips: [{ label: '约 3.5 小时', sub: 'Joy-Con 充满' }],
          set: {
            strap: { visible: false, dur: 0.1 },
            jl: { parent: 'console', at: JL_ON, rot: [0, 0, 0], via: dropInto(JL_REST, add(CON_HAND, JL_ON), RAIL_Y), dur: 1.6 },
            jr: { parent: 'console', at: JR_ON, rot: [0, 0, 0], via: dropInto(JR_HELD, add(CON_HAND, JR_ON), RAIL_Y), dur: 1.6, delay: 0.5 },
          },
          camera: CAM.handHigh,
          highlight: ['jl', 'jr'],
        },
      ],
    },
    {
      id: 'tv', title: '连接电视（电视模式）', kind: 'usage',
      start: { ...SCREEN_OFF },
      steps: [
        {
          id: 'items', title: '准备：基座、电视、HDMI 线、电源适配器', page: 15,
          desc: '电视模式除主机外需要：Nintendo Switch 基座、支持 HDMI 输入的电视机（单独另售）、HDMI 线、电源适配器。',
          set: show('ac-plug', 'adapter', 'ac-cable', 'hdmi-a', 'hdmi-b', 'hdmi-cable'),
          camera: CAM.setup,
          highlight: ['dock', 'tv', 'adapter', 'hdmi-cable'],
          callouts: [
            { part: 'dock', text: '基座', sub: 'HEG-007', offset: [-90, 150, 120] },
            { part: 'tv', text: '电视机', sub: '支持 HDMI 输入', offset: [-250, 120, 0] },
            { part: 'adapter', text: '电源适配器', sub: 'HAC-002', offset: [90, 90, 0] },
            { part: 'hdmi-b', text: 'HDMI 线', offset: [80, -10, 120] },
          ],
        },
        {
          id: 'open-cover', title: '打开基座后盖', page: 15,
          desc: '把 Nintendo Switch 基座背面的后盖向下翻开，露出接口。',
          set: { 'dock-cover': { rot: COVER_OPEN, dur: 1 } },
          camera: CAM.dockBack,
          highlight: ['dock-cover'],
        },
        {
          id: 'ports', title: '电源适配器插最上方，HDMI 插最下方', page: 16,
          desc: '将电源适配器插入最上方端口，HDMI 线接入最下方端口。',
          set: {
            'ac-plug': { plug: { hole: 'dock-ac', back: 40 }, dur: 1.6 },
            'hdmi-a': { plug: { hole: 'dock-hdmi', back: 40 }, dur: 1.6, delay: 0.9 },
          },
          camera: CAM.dockBack,
          highlight: ['ac-plug', 'hdmi-a'],
          callouts: [
            { part: 'ac-plug', text: '电源适配器', sub: '最上方端口', offset: [-60, 30, -20] },
            { part: 'hdmi-a', text: 'HDMI 线', sub: '最下方端口', offset: [-60, -20, -30] },
          ],
          zoom: { target: 'ac-plug', offset: [0, -18, 0], dir: [-0.3, 0.25, -1], dist: 130, caption: 'AC ADAPTER 在上、HDMI OUT 在下' },
        },
        {
          id: 'close-cover', title: '合上后盖', page: 16,
          desc: '两根线插好后合上盖子，线从后盖下方引出。',
          set: { 'dock-cover': { rot: [0, 0, 0], dur: 1 } },
          camera: CAM.dockBack,
          highlight: ['dock-cover'],
        },
        {
          id: 'wall', title: '电源适配器插入直连插座', page: 16,
          desc: '将电源适配器插入墙上的直连插座。主机还没插入时，基座的电视输出指示灯会亮起、闪烁，然后熄灭，这是正常现象（p44）。',
          tip: '电视模式下耗电量很大。请插入直连插座，不要使用插板。',
          chips: [{ label: '39 W', sub: '电视模式所需功率' }],
          set: {
            adapter: { plug: { hole: 'socket', back: 90 }, dur: 1.6 },
            'tv-led': { light: 'blinkThenOff', color: LED_GREEN, delay: 1.7 },
          },
          camera: { target: [200, 140, -250], dir: [0.35, 0.4, 1], dist: 1200 },
          highlight: ['adapter', 'tv-led'],
          zoom: { target: 'tv-led', dir: [0.2, 0.3, 1], dist: 80, caption: '没插主机：亮起闪烁后熄灭，属正常' },
        },
        {
          id: 'tv-hdmi', title: 'HDMI 线直接连入电视机', page: 16,
          desc: '把 HDMI 线另一端直接插进电视机的 HDMI 输入口。',
          set: { 'hdmi-b': { plug: { hole: 'tv-hdmi', back: 40 }, dur: 1.6 } },
          camera: CAM.tvSide,
          highlight: ['hdmi-b'],
          zoom: { target: 'hdmi-b', dir: [1, 0.25, 0.3], dist: 110, caption: '直接插电视，不经过转换器' },
        },
        {
          id: 'tv-input', title: '打开电视，切换到这路 HDMI', page: 17,
          desc: '打开电视机，将信号源切换至刚刚连接的 HDMI 输入。',
          set: { 'tv-screen': { visible: true, ui: UI.input } },
          camera: CAM.tv,
          highlight: ['tv-screen'],
        },
        {
          id: 'power-on', title: '按电源键，再按 A 进入主页菜单', page: 17,
          desc: '按下 Switch 的电源键，再按 A 键进入主页菜单。',
          set: { ...screenOn(UI.home, 0.8) },
          camera: CAM.hand,
          highlight: ['btn-power', 'jr-a'],
          actions: [{ type: 'press', part: 'btn-power', delay: 0 }, { type: 'press', part: 'jr-a', delay: 1 }],
          zoom: { target: 'btn-power', dir: [-0.2, 1, 0.5], dist: 90, caption: '电源键在主机顶部左侧' },
        },
        {
          id: 'remove-jc', title: '取下左右两侧的 Joy-Con', page: 18,
          desc: '从主机上取下左右两侧的 Joy-Con。',
          tip: '不取下 Joy-Con 就把主机放进基座，将无法用 Joy-Con 操作；使用 Pro 手柄则无需取下。',
          set: { ...detach(CON_HAND) },
          camera: CAM.desk,
          highlight: ['jl', 'jr'],
        },
        {
          id: 'dock', title: '主机放到基座中央，由上方缓缓插入', page: 18,
          desc: '主机屏幕朝基座正面，对准中央由上方缓缓插入。插到底时主机画面消失，电视输出指示灯闪烁一下（p10）。',
          set: {
            console: { at: CON_DOCK, via: DOCK_VIA, dur: 2.2 },
            ...screenOffAt(2.1),
            'tv-led': { light: 'blink', color: LED_GREEN, delay: 2.2 },
          },
          camera: CAM.dockFront,
          highlight: ['console', 'dock'],
        },
        {
          id: 'tv-show', title: '电视显示画面，切换完成', page: 19,
          desc: '电视机显示出主页菜单，即完成了模式切换。主机在基座里向电视输出时，电视输出指示灯保持常亮（p44）。',
          tip: '想从基座取出时保持休眠：“设置”→“休眠”→“插拔电源适配器时解除休眠”设为关闭。',
          set: {
            'tv-screen': { ui: UI.home },
            'tv-led': { light: 'on', color: LED_GREEN },
          },
          camera: { target: add(TV_AT, [0, 220, 150]), dir: [0.25, 0.2, 1], dist: 1200 },
          highlight: ['tv-screen', 'tv-led'],
          zoom: { target: 'tv-led', dir: [0.2, 0.3, 1], dist: 80, caption: '常亮 = 正在向电视输出' },
        },
      ],
    },
    {
      id: 'tabletop', title: '桌面模式与 microSD 卡', kind: 'usage',
      steps: [
        {
          id: 'remove-jc', title: '取下左右两侧的 Joy-Con', page: 21,
          desc: '桌面模式下要先取下主机左右两侧的 Joy-Con。',
          set: { ...detach(CON_HAND) },
          camera: CAM.desk,
          highlight: ['jl', 'jr'],
        },
        {
          id: 'stand', title: '打开背面的支架，放在桌面上', page: 21,
          desc: '打开主机背面的支架，支起后主机可以自行架在桌面上。',
          set: {
            stand: { rot: STAND_OPEN, dur: 0.9 },
            console: { at: CON_TABLE, rot: TILT, dur: 1.4, delay: 0.9 },
          },
          camera: CAM.tableSide,
          highlight: ['stand'],
          callouts: [{ part: 'stand', text: '支架', sub: '宽幅，可调角度', at: [60, -60, -2], offset: [40, 40, 0] }],
        },
        {
          id: 'sd-in', title: '插入 microSD 卡，听到咔嚓声', page: 33,
          desc: 'OLED 版的 microSD 卡槽在背面支架下方。注意卡的方向，插入 microSD 卡，听到咔嚓声即可。',
          chips: [{ label: 'UHS-I', sub: '推荐' }, { label: '60–95 MB/秒', sub: '读取速度' }],
          tip: '使用 microSDXC 卡需要先联网更新主机系统（p32）。卡里保存下载软件、截图和视频，不保存游戏存档。',
          set: {
            'sd-card': {
              visible: true,
              plug: { hole: 'sd-slot', back: 35 },
              via: add(CON_TABLE, [40, 55, -55]),
              dur: 1.6,
            },
          },
          camera: CAM.tableBack,
          highlight: ['sd-card', 'sd-slot'],
          callouts: [{ part: 'sd-slot', text: '支架下方卡槽', sub: '沿背面向上推入', offset: [20, 25, -10] }],
        },
        {
          id: 'power-off', title: '取出前先关机：按住电源键 3 秒', page: 33,
          desc: '取出 microSD 卡前先关闭主机电源：按住电源键约 3 秒，在“电源选项”里选“关机”。',
          set: {
            screen: { ui: UI.power, visible: false, dur: 2 },
            'screen-off': { visible: true, delay: 2 },
          },
          camera: CAM.table,
          highlight: ['btn-power', 'screen'],
          actions: [{ type: 'press', part: 'btn-power', delay: 0 }],
          zoom: { target: 'btn-power', dir: [-0.2, 1, 0.6], dist: 90, caption: '按住 3 秒 → 电源选项 → 关机' },
        },
        {
          id: 'sd-out', title: '向里按一下 microSD 卡，即可取出', page: 33,
          desc: '关机后向里按一下 microSD 卡，卡弹出后取下。',
          set: { 'sd-card': { ...SD_HOLD, via: add(CON_TABLE, [40, 55, -55]), dur: 1.4 } },
          camera: CAM.tableBack,
          highlight: ['sd-card', 'sd-slot'],
          callouts: [{ part: 'sd-slot', text: '向里按一下弹出', offset: [20, 25, -10] }],
        },
        {
          id: 'handheld', title: '掌上模式：收起支架，装上 Joy-Con', page: 22,
          desc: '拿起主机收起支架，在主机左右两侧装上 Joy-Con，就回到掌上模式。',
          set: {
            console: { at: CON_HAND, rot: [0, 0, 0], dur: 1.3 },
            stand: { rot: [0, 0, 0], dur: 0.8, delay: 1.3 },
            ...attach(CON_HAND, 2.1),
            ...screenOn(UI.home, 2.1),
            'sd-card': { visible: false, dur: 0.1 },
          },
          camera: { target: add(CON_HAND, [0, 40, 0]), dir: [1, 0.45, 0.5], dist: 720 },
          highlight: ['stand', 'jl', 'jr'],
        },
      ],
    },
    {
      id: 'power', title: '开机、游戏卡与休眠', kind: 'usage',
      start: {
        ...SCREEN_OFF,
        'ac-plug': { at: PLUG_REST.acFront },
        adapter: { at: PLUG_REST.adapterFront },
      },
      steps: [
        {
          id: 'adapter', title: '连上电源适配器，主机启动', page: 1,
          desc: '把主机套装附带的电源适配器 [HAC-002(CHN)] 连接到主机底部的 USB Type-C 端口，再插上插座，主机就会启动并开始充电。',
          chips: [{ label: '约 3 小时', sub: '主机充满（休眠时）' }, { label: 'HAC-002', sub: '电源适配器' }],
          set: {
            ...show('ac-cable'),
            'ac-plug': { visible: true, plug: { hole: 'usb-c', back: 40 }, dur: 1.6 },
            adapter: { visible: true, plug: { hole: 'socket', back: 90 }, dur: 1.8, delay: 1 },
            ...screenOn(UI.charging, 2.6),
          },
          camera: { target: [230, 170, -170], dir: [0.45, 0.3, 1], dist: 1350 },
          highlight: ['ac-plug', 'usb-c', 'adapter'],
          zoom: { target: 'usb-c', dir: [0.2, -1, 0.6], dist: 90, caption: 'USB Type-C 端口在主机底部中间' },
        },
        {
          id: 'card-cover', title: '打开游戏卡槽盖', page: 3,
          desc: '游戏卡槽在主机顶部右侧，先把槽盖向上掀开。',
          set: { 'card-cover': { rot: CARD_COVER_OPEN, dur: 0.7 } },
          camera: { target: add(CON_HAND, [40, 40, 0]), dir: [0.3, 0.9, 1], dist: 380 },
          highlight: ['card-cover'],
          zoom: { target: 'card-slot', dir: [0.1, 1, 0.5], dist: 90, caption: '槽盖铰链在后沿，向上掀开' },
        },
        {
          id: 'card-in', title: '插入游戏卡，直到咔嗒一声', page: 3,
          desc: '注意朝向：游戏卡标签一面与屏幕同侧，沿 ▼ 标记的方向插入，直到发出咔嗒一声轻响。然后合上槽盖。',
          set: {
            'game-card': { visible: true, plug: { hole: 'card-slot', back: 80 }, dur: 1.6 },
            'card-cover': { rot: [0, 0, 0], dur: 0.6, delay: 1.8 },
          },
          camera: { target: add(CON_HAND, [40, 40, 0]), dir: [0.3, 0.9, 1], dist: 380 },
          highlight: ['game-card', 'card-slot'],
          zoom: { target: 'card-slot', dir: [0.1, 1, 0.5], dist: 90, caption: '标签面朝屏幕一侧' },
        },
        {
          id: 'close-soft', title: '暂停与关闭软件：主页键 → X 键', page: 4,
          desc: '选中软件图标按 A 启动。游玩中按主页键暂停并回到主页菜单，选中暂停的软件后按 X 键关闭。',
          tip: '需要存档的软件请先保存再关闭，关闭后未保存的数据会消失。',
          set: { screen: { ui: UI.closeSoft, delay: 0.6 } },
          camera: CAM.hand,
          highlight: ['jr-home', 'jr-x', 'screen'],
          actions: [{ type: 'press', part: 'jr-home', delay: 0 }, { type: 'press', part: 'jr-x', delay: 1.2 }],
          zoom: { target: 'jr-home', offset: [6, 26, 0], dir: [0.1, 0.2, 1], dist: 120, caption: '主页键暂停，X 键关闭' },
        },
        {
          id: 'card-out', title: '拔出游戏卡：先往里推，再拔出', page: 5,
          desc: '打开游戏卡槽盖，先把游戏卡往里推一下，再拔出来。拔出游戏卡时无需关闭电源。',
          tip: '拔出后建议收进卡盒，以免遗失。',
          set: {
            'card-cover': { rot: CARD_COVER_OPEN, dur: 0.6 },
            'game-card': { ...CARD_HOLD, via: add(CON_HAND, [56, 160, 0]), dur: 1.4, delay: 0.8 },
          },
          camera: { target: add(CON_HAND, [40, 40, 0]), dir: [0.3, 0.9, 1], dist: 420 },
          highlight: ['game-card', 'card-cover'],
        },
        {
          id: 'sleep', title: '按住主页键 1 秒，选择“休眠”', page: 6,
          desc: '游玩结束后建议进入休眠模式：持续按住主页键 1 秒以上弹出“快速设置”，选择“休眠”。',
          tip: '休眠中电量耗尽会丢失未保存的数据；休眠时也会联网，主机发热属正常现象。',
          set: {
            screen: { ui: UI.quick, visible: false, dur: 1.8 },
            'screen-off': { visible: true, delay: 1.8 },
            'card-cover': { rot: [0, 0, 0], dur: 0.6 },
            'game-card': { visible: false, dur: 0.1 },
          },
          camera: CAM.hand,
          highlight: ['jr-home', 'screen'],
          actions: [{ type: 'press', part: 'jr-home', delay: 0 }],
          zoom: { target: 'jr-home', dir: [0.1, 0.2, 1], dist: 90, caption: '按住 1 秒以上 → 快速设置' },
        },
        {
          id: 'wake', title: '轻按电源键解除休眠', page: 8,
          desc: '轻按电源键（或按主页键）就能解除休眠、打开屏幕，继续游戏。',
          set: { ...screenOn(UI.home, 0.5) },
          camera: CAM.hand,
          highlight: ['btn-power'],
          actions: [{ type: 'press', part: 'btn-power', delay: 0 }],
          zoom: { target: 'btn-power', dir: [-0.2, 1, 0.5], dist: 90, caption: '轻按 = 进入 / 解除休眠' },
        },
      ],
    },
    {
      id: 'repair', title: '故障排查', kind: 'repair',
      start: { ...TV_READY },
      steps: [
        {
          id: 'freeze', title: '死机无反应：按住电源键 12 秒强制关机', page: 40,
          desc: '系统死机、锁住或无法关机时，按住电源键至少 12 秒强制关闭主机电源，然后取出所有游戏卡和 microSD 卡，再开机更新系统。',
          chips: [{ label: '≥ 12 秒', sub: '强制关机' }, { label: '3 秒', sub: '电源选项 → 重新启动' }],
          set: {
            'tv-screen': { visible: false, delay: 1.5 },
            'tv-led': { light: 'off', delay: 1.5 },
          },
          camera: { target: add(CON_DOCK, [-40, 50, 0]), dir: [-0.3, 0.6, 1], dist: 420 },
          highlight: ['btn-power'],
          actions: [{ type: 'press', part: 'btn-power', delay: 0 }],
          zoom: { target: 'btn-power', dir: [-0.2, 1, 0.5], dist: 90, caption: '一直按住，至少 12 秒' },
        },
        {
          id: 'reset-adapter', title: '无图像 / 无法充电：取出主机，适配器两端断开 30 秒', page: 44,
          desc: '取下主机，拔下 HDMI 线，把电源适配器从插座和基座两端都断开至少 30 秒来重置适配器。确认型号为 HAC-002（印在适配器底部），线缆没有损伤。',
          chips: [{ label: '≥ 30 秒', sub: '两端都断开' }],
          set: {
            console: { at: ABOVE_DOCK, dur: 1.4 },
            adapter: { parent: null, at: PLUG_REST.adapter, via: add(SOCKET_AT, [0, 40, 120]), dur: 1.6, delay: 1 },
            'hdmi-b': { parent: null, at: PLUG_REST.hdmiB, via: add(TV_AT, [400, 220, 0]), dur: 1.6, delay: 1.4 },
          },
          camera: CAM.setup,
          highlight: ['console', 'adapter', 'hdmi-b'],
        },
        {
          id: 'reconnect', title: '适配器直连插座，HDMI 直接连电视', page: 44,
          desc: '把电源适配器接回基座并直接插进墙上插座，HDMI 线直接连到电视。主机不在基座时，电视输出指示灯亮起闪烁后熄灭，属于正常现象。',
          set: {
            adapter: { plug: { hole: 'socket', back: 90 }, dur: 1.6 },
            'hdmi-b': { plug: { hole: 'tv-hdmi', back: 40 }, dur: 1.6, delay: 0.6 },
            'tv-led': { light: 'blinkThenOff', color: LED_GREEN, delay: 2.2 },
          },
          camera: CAM.setup,
          highlight: ['adapter', 'hdmi-b', 'tv-led'],
          zoom: { target: 'tv-led', dir: [0.2, 0.3, 1], dist: 80, caption: '主机不在基座：闪烁后熄灭，正常' },
        },
        {
          id: 'redock', title: '屏幕朝基座正面，重新放入', page: 43,
          desc: '主机开机后放回基座，屏幕朝向与基座前面板相同。指示灯亮着但电视仍无图像时：换电视的另一个 HDMI 口、换一根 HDMI 线、换一台电视，或换一个基座测试。',
          tip: '换基座后正常 → 只修基座；换基座仍不行 → 需要修主机（p44）。',
          set: {
            console: { at: CON_DOCK, dur: 1.6 },
            'tv-screen': { visible: true, ui: UI.home, delay: 1.7 },
            'tv-led': { light: 'on', color: LED_GREEN, delay: 1.6 },
          },
          camera: { target: add(DOCK_AT, [0, 160, -120]), dir: [0.3, 0.25, 1], dist: 1000 },
          highlight: ['console', 'tv-led', 'tv-screen'],
          zoom: { target: 'tv-led', dir: [0.2, 0.3, 1], dist: 80, caption: '常亮 = 基座正在输出' },
        },
        {
          id: 'joycon', title: 'Joy-Con 无响应：靠近主机，避开干扰', page: 45,
          desc: '确认系统已更新、Joy-Con 已充电，缩短 Joy-Con 与主机的距离。主机不要放在电视机后面、水族箱旁、金属物体中或下方、大量电线旁，离无线音箱、路由器等无线设备 1 米以上。可在“手柄”→“搜索手柄”里让手柄振动确认（p26）。',
          chips: [{ label: '≥ 1 米', sub: '远离其他无线设备' }],
          set: { 'tv-screen': { ui: UI.search } },
          camera: { target: [0, 120, 60], dir: [0.2, 0.55, 1], dist: 950 },
          highlight: ['jl', 'jr'],
          actions: [{ type: 'shake', part: 'jl', axis: 'x', amp: 1.5 }, { type: 'shake', part: 'jr', axis: 'x', amp: 1.5 }],
        },
      ],
    },
  ],
}