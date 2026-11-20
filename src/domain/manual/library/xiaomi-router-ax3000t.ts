import type { CameraSpec, Fill, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * Xiaomi路由器AX3000T（型号 RD03）
 * 官方说明书：米家产品说明书「Xiaomi路由器AX3000T使用说明书」，单张折页 12 面（PDF 只有 1 页印刷稿，面板无页码）。
 * 脚本里的 page 按阅读顺序给面板编号：1 封面 · 2 物品清单 · 3 产品介绍 · 4 指示灯 · 5 微功率 / IPv6 · 6 配置前准备
 * · 7 米家APP / 浏览器配置 · 8 小米Mesh组网 · 9 性能故障表 · 10 常见问题 · 11 恢复出厂（常见问题续）· 12 使用帮助（封底）。
 *
 * 场景：桌面 y=0。路由器在原点，正面朝 +z（观众），4 根天线竖在后沿；背面接口朝 -z。
 * 从背后看（说明书第 3 页后视图）左→右：RESET、电源接口、4 个 1G 网口、MESH —— 背后看画面左 = 世界 +x，
 * 所以 RESET 在 x=+64、MESH 在 x=-39.5。光猫在左后方（端口面也朝 -z），插线板在右后方，与第 6 页接线图一致。
 * Mesh 子路由器（同款 AX3000T）先放在右后方约 1.1 m 处（说明书：距离大于 1 米），再搬到约 1.2 m 外的「需要覆盖的位置」。
 *
 * 尺寸：225 × 172 × 208.8 mm（含天线，小米官网规格页）。推断（说明书和官网都没给）：机身高 40 mm（按前视图比例），
 * 底部内收台阶 9 mm、天线截面 20 × 8.5 mm、接口坐标按后视图比例量取、指示灯为正面中间一条横向灯条；
 * 光猫 170 × 110 × 30 mm（接口排布照第 6 页示意，圆键当电源键）、插线板、卡针（自备）都是场景道具。
 * 引擎没有「呼吸」灯效，呼吸和闪烁都用 blink，文字里写明。
 */

// ---------- 尺寸（路由器局部，mm） ----------
const W = 225
const D = 172
const H = 40
/** 背面 / 正面贴面 */
const RZ = -D / 2 - 0.1
const FZ = D / 2 + 0.1
/** 背面接口中心高度 */
const PY = 16
/** 4 个网口：从背后看左→右 = x 从大到小 */
const LAN_X = [20.4, 6.8, -6.8, -20.4]
const RESET_X = 64
const DC_X = 42
const MESH_X = -39.5
const ANT_X = [-97, -32.5, 32.5, 97]

const BACK: Vec3 = [0, 180, 0]
const UP: Vec3 = [-90, 0, 0]
const DOWN: Vec3 = [90, 0, 0]
/** 插头躺在桌上、指向 +z（正对路由器背面） */
const TO_PLUS_Z: Vec3 = [0, -90, 0]

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

// ---------- 场景布置（世界坐标） ----------
const MODEM_AT: Vec3 = [-330, 0, -40]
const STRIP_AT: Vec3 = [330, 0, -150]
/** Mesh 子路由器：附近（>1 m）→ 需要覆盖的位置 */
const SUB0: Vec3 = [700, 0, -850]
const SUB1: Vec3 = [420, 0, -1150]
const SUB_STRIP: Vec3 = [230, 0, -110]

// ---------- 颜色 ----------
const ORANGE = '#ff8a00'
const BLUE = '#2f7bf5'

// ---------- 形体 ----------
type Item = Shape & { at?: Vec3; rot?: Vec3; fill?: Fill }

/** 机身：下部内收台阶 + 主体 + 4 个脚垫 + 后沿 4 根天线（带天线座） */
function routerShape(): Shape {
  const items: Item[] = [
    { type: 'slab', w: 210, d: 150, h: 9.4, r: 6, at: [0, 3, -11] },
    { type: 'slab', w: W, d: D, h: H - 12, r: 8, at: [0, 12, 0] },
    ...([[-85, -62], [85, -62], [-85, 52], [85, 52]] as const).map(([x, z]): Item => ({ type: 'box', size: [20, 3, 10], at: [x, 1.5, z], fill: 'shade' })),
    ...ANT_X.flatMap((x): Item[] => [
      { type: 'box', size: [24, 26, 17], chamfer: 2, at: [x, 38, -80.5] },
      { type: 'box', size: [20, 160, 8.5], chamfer: 2.5, at: [x, 128.8, -80.5] },
    ]),
  ]
  return { type: 'compound', items }
}

/** RJ45 水晶头：原点在插头与接口交界，插头朝 +x */
const rj45: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [13, 8, 11.6], chamfer: 0.8, at: [5.5, 0, 0] },
    { type: 'box', size: [18, 9.5, 13], chamfer: 2, at: [-9, 0, 0] },
  ],
}
/** DC 圆头插头 */
const dcPlug: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 2.75, h: 9, axis: 'x', at: [4.5, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 4.6, h: 16, axis: 'x', at: [-8, 0, 0] },
  ],
}
/** 插墙式电源适配器：两片插脚朝 +x，机身在 -x，电源线从 -z 面引出 */
const adapterShape: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [10, 6.4, 1.6], at: [5, 0, 6.4], fill: 'shade' },
    { type: 'box', size: [10, 6.4, 1.6], at: [5, 0, -6.4], fill: 'shade' },
    { type: 'box', size: [40, 50, 44], chamfer: 4, at: [-20, 0, 0] },
  ],
}
const stripShape = (d: number, sockets: number[]): Shape => ({
  type: 'compound',
  items: [
    { type: 'slab', w: 56, d, h: 32, r: 10 },
    ...sockets.map((z): Item => ({ type: 'hole', w: 34, h: 34, r: 10, at: [0, 32.1, z], rot: UP })),
  ],
})
/** 光猫：顶部散热条，端口面朝 -z（第 6 页：DC、按键、光纤口、LAN 口） */
const modemShape: Shape = {
  type: 'compound',
  items: [
    { type: 'slab', w: 170, d: 110, h: 30, r: 5 },
    ...[-60, -40, -20, 0, 20, 40, 60].map((x): Item => ({ type: 'box', size: [3, 2, 98], chamfer: 0.8, at: [x, 31, 0] })),
    { type: 'hole', w: 8, h: 8, r: 2, at: [60, 15, -55.1], rot: BACK, fill: 'dark' },
    { type: 'hole', w: 9, h: 9, r: 1, at: [-8, 15, -55.1], rot: BACK, fill: 'dark' },
  ],
}
const cableEnd = (part: string, len: number) => ({ part, at: [-len, 0, 0] as Vec3, dir: [-1, -0.8, 0] as Vec3 })

// ---------- 姿态 ----------
/** 手持手机看屏幕（左前方，屏幕略朝上） */
const HOLD: PartState = { parent: null, at: [-170, 79, 215], rot: [75, 0, 0] }
/** 手机背面贴在路由器正面右端的 NFC 区，竖立在桌上 */
const NFC_TOUCH: PartState = { parent: null, at: [134, 81, FZ + 0.3], rot: [90, 0, 0], lift: 15, dur: 1.6 }
const PIN_HAND: Vec3 = [RESET_X, PY, -150]

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [-20, 50, -30], dir: [0.3, 0.7, 1], dist: 1350 }
const FRONT: CameraSpec = { target: [10, 45, 40], dir: [0.35, 0.4, 1], dist: 560 }
const PORTS: CameraSpec = { target: [12, 20, -92], dir: [0.4, 0.5, -1], dist: 360 }
const STRIP_VIEW: CameraSpec = { target: [300, 40, -120], dir: [0.6, 0.9, -0.7], dist: 480 }
const DC_VIEW: CameraSpec = { target: [90, 25, -110], dir: [0.5, 0.6, -1], dist: 520 }
const MODEM_VIEW: CameraSpec = { target: [-190, 20, -110], dir: [-0.25, 0.6, -1], dist: 640 }
const PHONE_CAM: CameraSpec = { target: 'phone-screen', offset: [0, 27, -7.3], dir: [0, 0.26, 0.97], dist: 190 }
const NFC_VIEW: CameraSpec = { target: [100, 55, 100], dir: [0.6, 0.35, 1], dist: 440 }
/** 主路由器 + 附近的子路由器（SUB0）；镜头放低，桌面宽画幅里前后两台都装得下 */
const MESH_VIEW: CameraSpec = { target: [320, 60, -380], dir: [0.1, 0.45, 1], dist: 1500 }
/** 主路由器 + 搬到覆盖位置的子路由器（SUB1） */
const MESH_FAR: CameraSpec = { target: [220, 60, -540], dir: [0.1, 0.35, 1], dist: 1700 }
const MESH_REAR: CameraSpec = { target: [230, 60, -700], dir: [-0.1, 0.35, -1], dist: 1750 }

const zoomLed = (caption: string) => ({ target: 'led', dir: [0.15, 0.25, 1] as Vec3, dist: 75, caption })
const zoomSubLed = (caption: string) => ({ target: 'sub-led', dir: [0.15, 0.25, 1] as Vec3, dist: 75, caption })
const zoomRear = (target: string, caption: string, dist = 110) => ({ target, dir: [0.4, 0.35, -1] as Vec3, dist, caption })

// ---------- 手机界面 ----------
const WIFI_LIST: ScreenUI = {
  app: '控制中心 / 快速设置', title: 'Wi-Fi',
  items: [
    { text: 'Wi-Fi', sub: '已开启', state: 'done' },
    { text: 'minet_rd03_xxxx', sub: '底部标签上的名称', state: 'selected' },
    { text: '其他网络', state: 'muted' },
  ],
  button: '连接', buttonActive: true,
}
const MIJIA_ADD: ScreenUI = {
  app: '米家', title: '添加设备',
  items: [
    { text: '扫码或搜索“米家”安装', state: 'done' },
    { text: '小米账号登录', state: 'done' },
    { text: 'Xiaomi路由器AX3000T', sub: '按提示配网', state: 'selected' },
  ],
  button: '右上角 + 选择型号',
}
const BROWSER: ScreenUI = {
  app: '浏览器', title: '网络设置',
  items: [
    { text: '自动跳转到网络设置', state: 'done' },
    { text: '没跳转：输入地址', sub: 'miwifi.com', state: 'selected' },
    { text: '或输入', sub: '192.168.31.1' },
  ],
}
const WEB_NET: ScreenUI = {
  app: 'miwifi.com', title: '上网设置',
  items: [
    { text: '宽带账号', sub: '运营商提供', state: 'selected' },
    { text: '宽带密码', sub: '••••••' },
    { text: '不确定上网方式', sub: '问网络服务商', state: 'muted' },
  ],
  button: '下一步', buttonActive: true,
}
const WEB_WIFI: ScreenUI = {
  app: 'miwifi.com', title: 'Wi-Fi 设置',
  items: [
    { text: 'Wi-Fi 名称', sub: '不含特殊字符' },
    { text: 'Wi-Fi 密码', sub: '••••••••' },
    { text: '作为管理密码', sub: '已勾选', state: 'selected' },
  ],
  button: '完成', buttonActive: true,
}
const WIFI_AGAIN: ScreenUI = {
  app: '设置', title: 'Wi-Fi 模块已重启',
  items: [
    { text: 'Wi-Fi', sub: '重新搜索', state: 'done' },
    { text: '新设置的 Wi-Fi 名称', sub: '已连接', state: 'done' },
  ],
}
const NFC_UI: ScreenUI = {
  app: 'NFC 碰碰连', title: '已连接路由器 Wi-Fi',
  items: [
    { text: 'NFC', sub: '已开启', state: 'done' },
    { text: '亮屏解锁', sub: '贴近 NFC 区', state: 'done' },
  ],
}
const IPV6_UI: ScreenUI = {
  app: 'miwifi.com', title: '常用设置 › 上网设置',
  items: [
    { text: '输入密码登录管理页面', state: 'done' },
    { text: 'IPv6', sub: '按页面指引修改', state: 'selected' },
    { text: 'IPv6 防火墙', sub: '按需配置' },
  ],
}
const MESH_APP: ScreenUI = {
  app: '米家', title: 'Mesh网络设备',
  items: [
    { text: 'Xiaomi路由器AX3000T', sub: '主路由器', state: 'done' },
    { text: '添加节点', state: 'selected' },
    { text: '按组网提示完成', state: 'muted' },
  ],
  button: '添加节点', buttonActive: true,
}
const WIFI_SCAN: ScreenUI = {
  app: '设置', title: '能搜到路由器 Wi-Fi 吗？',
  items: [
    { text: 'minet_rd03_xxxx', sub: '或你设置的名称', state: 'selected' },
    { text: '搜不到', sub: '先确认通电并启动完成', state: 'muted' },
  ],
}
const DIAG_UI: ScreenUI = {
  app: 'miwifi.com', title: '网络诊断 · 网络设置',
  items: [
    { text: '网络诊断', sub: '按结果尝试修复', state: 'done' },
    { text: '主 DNS', sub: '8.8.8.8', state: 'selected' },
    { text: '辅助 DNS', sub: '8.8.4.4', state: 'selected' },
  ],
  button: '保存', buttonActive: true,
}
const WIFI_FAIL: ScreenUI = {
  app: '排查', title: '无线设备连不上 Wi-Fi',
  items: [
    { text: '名称和密码不含特殊字符' },
    { text: '选对 Wi-Fi、输对密码' },
    { text: '设备不在黑名单' },
    { text: '加密方式设为 WPA2', state: 'selected' },
    { text: '重启路由器和设备再试' },
  ],
}
const MIJIA_FAIL: ScreenUI = {
  app: '米家', title: '添加不了路由器？',
  items: [
    { text: '手机连的是这台路由器 Wi-Fi' },
    { text: '选择的产品型号正确' },
    { text: '国家或地区', sub: '中国大陆', state: 'selected' },
  ],
}

// ---------- 零件 ----------
const parts: SpecPart[] = [
  // 路由器本体
  { id: 'router', name: 'Xiaomi路由器AX3000T', spec: '225 × 172 × 208.8 mm（含天线）', shape: routerShape() },
  {
    id: 'grille', name: '正面点阵格栅', parent: 'router',
    shape: { type: 'compound', items: Array.from({ length: 36 }, (_, i): Item => ({ type: 'hole', w: 1.6, h: 11, r: 0.8, at: [-103 + 5 * i, 0, 0] })) },
    at: [0, 29, FZ],
  },
  { id: 'nfc', name: 'NFC 感应区', spec: '用于 Android 手机一碰连接 Wi-Fi', parent: 'router', shape: { type: 'hole', w: 22, h: 10, r: 5 }, at: [96, 29, FZ], fill: 'white' },
  { id: 'nfc-txt', name: 'NFC 标识', parent: 'router', shape: { type: 'text', text: '((NFC))', size: 2.4 }, at: [96, 29, FZ + 0.2] },
  { id: 'led-guide', name: '指示灯', parent: 'router', shape: { type: 'hole', w: 16, h: 2.2, r: 1.1 }, at: [0, 17, FZ], fill: 'dark' },
  { id: 'led', name: '指示灯（灯芯）', parent: 'router', shape: { type: 'led', r: 1.6, color: ORANGE }, at: [0, 17, FZ + 0.15] },
  { id: 'logo', name: 'xiaomi 标识', parent: 'router', shape: { type: 'text', text: 'xiaomi', size: 4 }, at: [0, H + 0.05, 79], rot: UP },
  { id: 'port-reset', name: 'RESET 按键', spec: '恢复出厂设置', parent: 'router', shape: { type: 'hole', w: 2.4, h: 2.4, r: 1.2 }, at: [RESET_X, PY, RZ], rot: BACK, fill: 'dark' },
  { id: 'port-dc', name: '电源接口', spec: '连接电源适配器', parent: 'router', shape: { type: 'hole', w: 7.6, h: 7.6, r: 3.8 }, at: [DC_X, PY, RZ], rot: BACK, fill: 'dark' },
  { id: 'port-frame', name: '1G 网络端口 ×4', spec: 'WAN / LAN 自动识别', parent: 'router', shape: { type: 'hole', w: 58, h: 14, r: 2 }, at: [0, PY, RZ + 0.05], rot: BACK },
  ...LAN_X.map((x, i): SpecPart => ({
    id: `port-${i + 1}`, name: `网络端口 ${i + 1}`, spec: '1 Gbps · WAN/LAN 自动识别', parent: 'router',
    shape: { type: 'hole', w: 12.5, h: 10.5, r: 1 }, at: [x, PY, RZ - 0.05], rot: BACK, fill: 'dark',
  })),
  { id: 'mesh-btn', name: 'MESH 键', spec: '小米 Mesh 组网', parent: 'router', shape: { type: 'cylinder', r: 3.6, h: 2 }, at: [MESH_X, PY, -D / 2 - 1], rot: UP },
  { id: 'txt-reset', name: 'RESET 丝印', parent: 'router', shape: { type: 'text', text: 'RESET', size: 1.8 }, at: [RESET_X, 6.5, RZ - 0.1], rot: BACK },
  { id: 'txt-lan', name: 'WAN/LAN 丝印', parent: 'router', shape: { type: 'text', text: 'WAN/LAN', size: 1.8 }, at: [0, 6.5, RZ - 0.1], rot: BACK },
  { id: 'txt-mesh', name: 'MESH 丝印', parent: 'router', shape: { type: 'text', text: 'MESH', size: 1.8 }, at: [MESH_X, 6.5, RZ - 0.1], rot: BACK },
  // 底部标签（朝下）
  { id: 'label', name: '底部标签', parent: 'router', shape: { type: 'hole', w: 64, h: 26, r: 2 }, at: [0, 2.9, -5], rot: DOWN, fill: 'white' },
  { id: 'label-ssid', name: '网络名称', parent: 'router', shape: { type: 'text', text: '网络名称：minet_rd03_xxxx', size: 2.4 }, at: [0, 2.8, -1], rot: DOWN },
  { id: 'label-sn', name: 'SN', parent: 'router', shape: { type: 'text', text: 'SN: XXXXX/XXXXXXXXXX', size: 2 }, at: [0, 2.8, -10], rot: DOWN },

  // 光猫（运营商提供）。插进别的零件的插头要声明在目标零件之后（compile 按声明的 parent 排序算世界矩阵）
  { id: 'modem', name: '光猫 / 宽带猫', spec: '由宽带运营商提供（场景道具）', shape: modemShape, at: MODEM_AT },
  { id: 'modem-lan', name: '光猫 LAN 口', parent: 'modem', shape: { type: 'hole', w: 12.5, h: 10.5, r: 1 }, at: [-50, 15, -55.1], rot: BACK, fill: 'dark' },
  { id: 'modem-power', name: '光猫电源键', parent: 'modem', shape: { type: 'cylinder', r: 3.5, h: 2 }, at: [36, 15, -56], rot: UP },

  // 网线（两端 RJ45）
  { id: 'rj-a', name: '网线 · 路由器端', shape: rj45, at: [LAN_X[0], 4.75, -200], rot: TO_PLUS_Z },
  { id: 'rj-b', name: '网线 · 光猫端', shape: rj45, at: [-380, 4.75, -190], rot: TO_PLUS_Z },
  { id: 'net-cable', name: '网线', shape: { type: 'cable', from: cableEnd('rj-a', 18), to: cableEnd('rj-b', 18), r: 2.6, slack: 1 } },

  // 电源：插线板 + 适配器 + DC 插头
  { id: 'strip', name: '电源插座（插线板）', spec: '场景道具', shape: stripShape(200, [-55, -5]), at: STRIP_AT },
  { id: 'socket', name: '插座插孔', parent: 'strip', shape: { type: 'hole', w: 34, h: 34, r: 10 }, at: [0, 32.1, 45], rot: UP },
  { id: 'adapter', name: '电源适配器', spec: '12 V 直流', shape: adapterShape, at: [250, 25, -200] },
  { id: 'dc-plug', name: '电源插头（DC）', shape: dcPlug, at: [DC_X, 4.6, -180], rot: TO_PLUS_Z },
  { id: 'dc-cable', name: '适配器电源线', shape: { type: 'cable', from: { part: 'adapter', at: [-8, 0, -22], dir: [0.4, 0, -1] }, to: cableEnd('dc-plug', 16), r: 1.8, slack: 1 } },

  // 手机
  { id: 'phone', name: '手机', shape: { type: 'slab', w: 74, d: 160, h: 8.2, r: 10 }, at: HOLD.at as Vec3, rot: HOLD.rot, visible: false },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 68, h: 150 }, at: [0, 8.25, 0], rot: UP },

  // 说明书（单页 90 × 120 mm）
  { id: 'booklet', name: '说明书', shape: { type: 'slab', w: 90, d: 120, h: 1.5, r: 2 }, at: [-260, 0, 185], rot: [0, 14, 0], fill: 'warm', visible: false },
  { id: 'booklet-title', name: '使用说明书', parent: 'booklet', shape: { type: 'text', text: '使用说明书', size: 7 }, at: [0, 1.65, -36], rot: UP },

  // 卡针（自备，按 RESET 用）
  {
    id: 'pin', name: '卡针 / 牙签', spec: '自备（推断）',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 0.5, h: 18, axis: 'x', at: [-5, 0, 0], fill: 'shade' },
        { type: 'box', size: [9, 1.2, 12], chamfer: 0.5, at: [-18, 0, 0], fill: 'shade' },
      ],
    },
    at: PIN_HAND, rot: TO_PLUS_Z, visible: false,
  },

  // Mesh 子路由器（同款）+ 它的插座、适配器
  { id: 'sub', name: '子路由器', spec: '支持小米 Mesh 的路由器（此处为同款 AX3000T）', shape: routerShape(), at: add(SUB0, [150, 0, 150]), visible: false },
  { id: 'sub-led', name: '子路由器指示灯', parent: 'sub', shape: { type: 'led', r: 1.6, color: ORANGE }, at: [0, 17, FZ + 0.15] },
  { id: 'sub-port-dc', name: '子路由器电源接口', parent: 'sub', shape: { type: 'hole', w: 7.6, h: 7.6, r: 3.8 }, at: [DC_X, PY, RZ], rot: BACK, fill: 'dark' },
  { id: 'sub-port-wan', name: '子路由器网口', parent: 'sub', shape: { type: 'hole', w: 12.5, h: 10.5, r: 1 }, at: [LAN_X[0], PY, RZ - 0.05], rot: BACK, fill: 'dark' },
  { id: 'sub-strip', name: '子路由器旁的插座', shape: stripShape(140, [-30]), at: add(SUB0, SUB_STRIP), visible: false },
  { id: 'sub-socket', name: '插座插孔', parent: 'sub-strip', shape: { type: 'hole', w: 34, h: 34, r: 10 }, at: [0, 32.1, 30], rot: UP },
  { id: 'sub-adapter', name: '子路由器适配器', shape: adapterShape, at: add(SUB0, [150, 25, -200]), visible: false },
  { id: 'sub-dc', name: '子路由器电源插头', shape: dcPlug, at: add(SUB0, [DC_X, 4.6, -170]), rot: TO_PLUS_Z, visible: false },
  { id: 'sub-dc-cable', name: '子路由器电源线', shape: { type: 'cable', from: { part: 'sub-adapter', at: [-8, 0, -22], dir: [0.4, 0, -1] }, to: cableEnd('sub-dc', 16), r: 1.8, slack: 1 } },

  // 有线组网用的第二根网线
  { id: 'mesh-a', name: '组网网线 · 子路由器端', shape: rj45, at: add(SUB1, [LAN_X[0], 4.75, -200]), rot: TO_PLUS_Z, visible: false },
  { id: 'mesh-b', name: '组网网线 · 主路由器端', shape: rj45, at: [LAN_X[1], 4.75, -240], rot: TO_PLUS_Z, visible: false },
  { id: 'mesh-cable', name: '组网网线', shape: { type: 'cable', from: cableEnd('mesh-a', 18), to: cableEnd('mesh-b', 18), r: 2.6, slack: 0.6 } },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))

/** 线路已接好：适配器在插座、DC 插好、网线连着光猫 */
const CONNECTED: Record<string, PartState> = {
  adapter: { plug: 'socket' },
  'dc-plug': { plug: 'port-dc' },
  'rj-a': { plug: 'port-1' },
  'rj-b': { plug: 'modem-lan' },
}
export const xiaomiRouterAx3000t: ManualSpec = {
  id: 'xiaomi-router-ax3000t',
  name: 'Xiaomi路由器AX3000T',
  desc: 'Wi-Fi 6 · 4 根外置天线 · 4 个千兆网口 · NFC 碰碰连 · 小米 Mesh',
  category: '路由器',
  dims: { width: W, depth: D, height: 209 },
  source: {
    title: 'Xiaomi路由器AX3000T使用说明书',
    url: 'https://cdn.cnbj1.fds.api.mi-img.com/iotweb-product-center/e1d2759797019e960b30584774e2e3fa_1742475205550.pdf',
    images: [],
  },
  package: [
    { name: 'Xiaomi路由器AX3000T', qty: 1, spec: '型号 RD03' },
    { name: '网线', qty: 1, spec: 'RJ45' },
    { name: '电源适配器', qty: 1, spec: '12 V 直流' },
    { name: '说明书', qty: 1, spec: '折页 · 单页 90 × 120 mm' },
  ],
  params: [
    { label: '产品型号', value: 'RD03', note: '产品名称：无线路由器' },
    { label: '网络端口', value: '4 × 1G', note: '速率上限 1 Gbps，WAN / LAN 自动识别' },
    { label: '按键 / 接口', value: 'NFC · RESET · 电源 · MESH' },
    { label: '使用条件', value: '0–40 ℃ · 12 V 直流' },
    { label: '管理地址', value: 'miwifi.com', note: '或 192.168.31.1' },
    { label: '默认 Wi-Fi', value: 'minet_rd03_xxxx', note: '见路由器底部标签' },
    { label: '外形尺寸', value: '225 × 172 × 208.8 mm', note: '含天线；不含天线高 51 mm（小米官网规格，说明书未写）' },
    { label: '服务电话', value: '950816', note: 'www.mi.com/service' },
    { label: '说明书页码', value: '折页 12 面', note: '按阅读顺序编号：封面 = 第 1 页 … 使用帮助（封底）= 第 12 页' },
  ],
  parts,
  stageSize: 1500,
  guides: [
    {
      id: 'connect', title: '连接线路', kind: 'usage',
      start: show('booklet'),
      steps: [
        {
          id: 'unbox', title: '清点物品', page: 2,
          desc: '包装内有：Xiaomi路由器AX3000T、网线、电源适配器、说明书各 1 件。光猫 / 宽带猫由宽带运营商提供。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'router', text: 'Xiaomi路由器AX3000T ×1', at: [0, 209, -80], offset: [-40, 60, 0] },
            { part: 'rj-a', text: '网线 ×1', offset: [30, 70, 0] },
            { part: 'adapter', text: '电源适配器 ×1', offset: [-60, 90, 0] },
            { part: 'booklet', text: '说明书 ×1', offset: [-40, 70, 20] },
            { part: 'modem', text: '光猫 / 宽带猫', sub: '运营商提供', at: [0, 32, 0], offset: [-40, 80, 0] },
          ],
          chips: [{ label: '物品清单', sub: '4 件' }],
        },
        {
          id: 'front', title: '认识正面：NFC 与指示灯', page: 3,
          desc: '正面右端是 NFC 感应区（①），Android 手机可以一碰连接路由器 Wi-Fi；正面中间的横条是指示灯。4 根外置天线竖在机身后沿。',
          camera: FRONT,
          set: hide('booklet'),
          highlight: ['nfc', 'led-guide'],
          zoom: { target: 'nfc', dir: [0.25, 0.2, 1], dist: 110, caption: '① NFC 感应区在正面右端' },
          callouts: [
            { part: 'nfc', text: '① NFC', sub: 'Android 手机一碰连 Wi-Fi', offset: [10, 45, 30] },
            { part: 'led-guide', text: '指示灯', offset: [-60, 30, 30] },
            { part: 'router', text: '外置天线 ×4', at: [-97, 120, -80], offset: [-50, 0, 0] },
          ],
          tip: 'NFC 碰碰连需要手机开启 NFC，并在亮屏解锁的状态下使用。',
        },
        {
          id: 'rear', title: '认识背面接口', page: 3,
          desc: '从背后看，左起依次是：RESET 按键（②，恢复出厂设置）、电源接口（③）、4 个 1G 网络端口（④，速率上限 1 Gbps，可作 WAN 口或 LAN 口、自动识别）、MESH 键（⑤，与支持小米 Mesh 的路由器组网）。',
          camera: PORTS,
          highlight: ['port-reset', 'port-dc', 'port-frame', 'mesh-btn'],
          zoom: { target: [12, PY, RZ], dir: [0.3, 0.3, -1], dist: 230, caption: 'RESET · 电源 · 4 个网口 · MESH' },
          callouts: [
            { part: 'port-reset', text: '② RESET', sub: '恢复出厂设置', offset: [30, 40, -10] },
            { part: 'port-dc', text: '③ 电源接口', offset: [10, 55, -20] },
            { part: 'port-frame', text: '④ 1G 网络端口 ×4', sub: 'WAN / LAN 自动识别', offset: [-10, -30, -30] },
            { part: 'mesh-btn', text: '⑤ MESH', sub: '小米 Mesh 组网', offset: [-40, 40, -10] },
          ],
        },
        {
          id: 'adapter', title: '适配器插上电源插座', page: 6,
          desc: '取出包装中的路由器放好。按说明书接线图，把电源适配器插到电源插座上。',
          camera: STRIP_VIEW,
          set: { adapter: { plug: { hole: 'socket', back: 50 }, lift: 20, dur: 1.6 } },
          highlight: ['adapter', 'strip'],
          chips: [{ label: '电源', sub: '12 V 直流适配器' }],
        },
        {
          id: 'dc', title: '电源线插入路由器电源接口', page: 6,
          desc: '把适配器电源线的圆头插头插进路由器背面的电源接口。接通电源后路由器自动开机，指示灯橙色常亮，表示系统启动中。',
          camera: DC_VIEW,
          set: {
            'dc-plug': { plug: { hole: 'port-dc', back: 40 }, dur: 1.6 },
            led: { light: 'on', color: ORANGE, delay: 1.8 },
          },
          highlight: ['dc-plug', 'port-dc'],
          zoom: zoomLed('橙色常亮 = 系统启动中'),
          chips: [{ label: '指示灯', sub: '橙色常亮 · 启动中' }],
        },
        {
          id: 'wan', title: '网线插入路由器任一网口', page: 6,
          desc: '把网线一端插进路由器背面的网络端口。4 个网口都支持 WAN/LAN 自动识别，插哪个都可以作为 WAN 口。',
          camera: PORTS,
          set: { 'rj-a': { plug: { hole: 'port-1', back: 45 }, dur: 1.6 } },
          highlight: ['rj-a', 'port-1'],
          zoom: zoomRear('port-1', '任一网口都能当 WAN 口'),
        },
        {
          id: 'modem', title: '另一端插入光猫 LAN 口', page: 6,
          desc: '网线另一端插进光猫 / 宽带猫的 LAN 口，路由器的 WAN 口就和光猫连好了。',
          camera: MODEM_VIEW,
          set: { 'rj-b': { plug: { hole: 'modem-lan', back: 45 }, dur: 1.6 } },
          highlight: ['rj-b', 'modem-lan', 'net-cable'],
          zoom: zoomRear('modem-lan', '插入光猫的 LAN 口'),
          tip: '光猫 / 宽带猫由宽带运营商提供。如果家里用的是以太网墙上网口，直接把网线插进墙上网口。',
        },
        {
          id: 'boot', title: '等待启动完成：橙色呼吸', page: 6,
          desc: '等路由器启动完成，指示灯由橙色常亮变为橙色呼吸，表示启动完成、系统待配置，就可以开始初始化设置了。',
          camera: FRONT,
          set: { led: { light: 'blink', color: ORANGE } },
          highlight: ['led'],
          zoom: zoomLed('橙色呼吸 = 启动完成，待配置'),
          chips: [{ label: '指示灯', sub: '橙色常亮 → 橙色呼吸' }],
          tip: '动画里用闪烁示意「呼吸」，实物是缓慢地渐亮渐暗。',
        },
      ],
    },
    {
      id: 'setup', title: '初始化设置', kind: 'usage',
      start: { ...CONNECTED, led: { light: 'blink', color: ORANGE } },
      steps: [
        {
          id: 'g-label', title: '看底部标签上的 Wi-Fi 名称', page: 7,
          desc: '路由器底部标签上印着默认的 Wi-Fi 网络名称（minet_rd03_xxxx）和 SN。手机或电脑要先连上这个 Wi-Fi。',
          camera: { target: [0, 20, 60], dir: [0.3, 0.3, 1], dist: 520 },
          highlight: ['label'],
          zoom: { target: 'label', dir: [0.1, -1, 0.5], dist: 110, caption: '底部标签（从桌面下方看）' },
          chips: [{ label: '网络名称', sub: 'minet_rd03_xxxx' }],
        },
        {
          id: 'g-wifi', title: '手机打开 Wi-Fi，连上路由器', page: 7,
          desc: '在手机屏幕顶部下滑打开控制中心（iOS）或快速设置（Android），开启 Wi-Fi，连接底部标签上的那个 Wi-Fi。',
          camera: PHONE_CAM,
          set: { phone: { visible: true }, 'phone-screen': { ui: WIFI_LIST, delay: 0.3 } },
          highlight: ['phone-screen'],
        },
        {
          id: 'g-app', title: '方法一：米家 APP 配网', page: 7,
          desc: '扫描说明书上的二维码或在应用商店搜索「米家」下载安装；打开米家 APP 用小米账号登录，按自动弹出的提示操作，或点右上角「+」选择对应产品型号，按提示完成配网。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: MIJIA_ADD, delay: 0.3 } },
          highlight: ['phone-screen'],
          tip: '米家 APP 会升级更新，实际操作以当前 APP 内的指引为准。',
        },
        {
          id: 'g-browser', title: '方法二：浏览器打开 miwifi.com', page: 7,
          desc: '连上路由器 Wi-Fi 后页面会自动跳转到网络设置；如果没有跳转，打开浏览器输入 miwifi.com 或 192.168.31.1。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: BROWSER, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [{ label: '管理地址', sub: 'miwifi.com · 192.168.31.1' }],
        },
        {
          id: 'g-isp', title: '设置上网方式', page: 7,
          desc: '按设置页面提示完成网络配置：宽带拨号上网时，填写宽带运营商提供的账号和密码，点「下一步」。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: WEB_NET, delay: 0.3 } },
          highlight: ['phone-screen'],
          tip: '不确定网络连接类型，请联系网络服务商获取详细信息。页面字段参考小米官网 FAQ，以实际页面为准。',
        },
        {
          id: 'g-ssid', title: '设置 Wi-Fi 名称、密码和管理密码', page: 7,
          desc: '设置新的 Wi-Fi 名称和密码。勾选「作为管理密码」，Wi-Fi 密码同时就是路由器管理密码；不勾选会再进入一页单独设置管理密码。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: WEB_WIFI, delay: 0.3 } },
          highlight: ['phone-screen'],
          tip: 'Wi-Fi 名称和密码不要包含特殊字符（见第 10 页常见问题）。',
        },
        {
          id: 'g-done', title: 'Wi-Fi 重启后重新连接', page: 7,
          desc: '配置完成后 Wi-Fi 模块会重启，稍后重新搜索并连接新设置的 Wi-Fi。指示灯变为蓝色常亮，表示正常运行。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: WIFI_AGAIN, delay: 0.3 }, led: { light: 'on', color: BLUE, delay: 0.6 } },
          highlight: ['phone-screen'],
          zoom: zoomLed('蓝色常亮 = 正常运行'),
          chips: [{ label: '指示灯', sub: '蓝色常亮' }],
          tip: '用浏览器配置完成后，也可以再用米家 APP 添加这台路由器。',
        },
        {
          id: 'g-nfc', title: 'Android 手机碰一碰连 Wi-Fi', page: 3,
          desc: 'Android 手机开启 NFC、亮屏解锁，把手机背面贴近路由器正面右端的 NFC 区，即可一碰连接路由器 Wi-Fi。',
          camera: NFC_VIEW,
          set: { phone: NFC_TOUCH, 'phone-screen': { ui: NFC_UI, delay: 1.6 } },
          highlight: ['phone', 'nfc'],
          zoom: { target: 'nfc', dir: [-0.5, 0.3, 1], dist: 110, caption: '手机背面贴近 NFC 区' },
          tip: 'NFC 碰碰连需要手机开启 NFC，并在亮屏解锁的状态下使用。',
        },
        {
          id: 'g-ipv6', title: '需要时设置 IPv6', page: 5,
          desc: '打开浏览器输入 miwifi.com，输入密码进入路由器管理页面；点击进入「常用设置 > 上网设置」，参考页面指引修改 IPv6 功能和 IPv6 防火墙配置。',
          camera: PHONE_CAM,
          set: { phone: { ...HOLD, lift: 20, dur: 1.4 }, 'phone-screen': { ui: IPV6_UI, delay: 1 } },
          highlight: ['phone-screen'],
        },
      ],
    },
    {
      id: 'mesh', title: '小米 Mesh 组网', kind: 'usage',
      start: { ...CONNECTED, led: { light: 'on', color: BLUE }, phone: { visible: true } },
      steps: [
        {
          id: 'm-app', title: '方法一：米家 APP 添加节点', page: 8,
          desc: '主路由器配置完成后：点开米家 APP，进入主路由器的【Mesh网络设备】页面，点击【添加节点】，按组网提示完成组网。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: MESH_APP, delay: 0.3 } },
          highlight: ['phone-screen'],
          tip: '可到小米商城官网查询支持小米 Mesh 的产品型号和版本。',
        },
        {
          id: 'm-place', title: '方法二 ①：子路由器放到附近并通电', page: 8,
          desc: '把子路由器放到主路由器附近并接通电源，两台路由器的距离要大于 1 米，否则会互相干扰、影响配网。子路由器启动中，指示灯橙色常亮。',
          camera: MESH_VIEW,
          set: {
            ...hide('phone'),
            ...show('sub-strip'),
            sub: { visible: true, at: SUB0, lift: 60, dur: 1.4 },
            'sub-adapter': { visible: true, plug: { hole: 'sub-socket', back: 50 }, lift: 20, delay: 1.4, dur: 1.4 },
            'sub-dc': { visible: true, plug: { hole: 'sub-port-dc', back: 40 }, delay: 1.4, dur: 1.4 },
            'sub-led': { light: 'on', color: ORANGE, delay: 2.9 },
          },
          highlight: ['sub', 'sub-led'],
          zoom: zoomSubLed('子路由器：橙色常亮 = 启动中'),
          callouts: [
            { part: 'router', text: '主路由器', at: [0, 209, -80], offset: [40, 80, 0] },
            { part: 'sub', text: '子路由器', at: [-112, 30, 86], offset: [-120, 0, 0] },
          ],
          chips: [{ label: '距离', sub: '大于 1 米' }],
          tip: '如果子路由器以前配置过，先长按它的 RESET 键 5 秒恢复出厂状态。',
        },
        {
          id: 'm-found', title: '方法二 ②：主路由器发现子路由器', page: 8,
          desc: '子路由器启动完成后（橙色呼吸，待配置），主路由器会自动发现它，主路由器指示灯开始蓝色呼吸。',
          camera: MESH_VIEW,
          set: {
            'sub-led': { light: 'blink', color: ORANGE },
            led: { light: 'blink', color: BLUE, delay: 0.6 },
          },
          highlight: ['led', 'sub-led'],
          zoom: zoomLed('主路由器：蓝色呼吸 = 发现可配置节点'),
          chips: [{ label: '主路由器', sub: '蓝色呼吸' }, { label: '子路由器', sub: '橙色呼吸' }],
          tip: '蓝色呼吸 2 分钟内没有进行组网操作，会自动恢复蓝色常亮。',
        },
        {
          id: 'm-press', title: '方法二 ③：短按主路由器 MESH 键', page: 8,
          desc: '短按主路由器背面的 MESH 键，主路由器的指示灯开始蓝色闪烁，进入组网流程。子路由器接入时指示灯橙色闪烁（第 4 页：接入 Mesh 主路由中）。',
          camera: PORTS,
          actions: [{ type: 'press', part: 'mesh-btn', depth: 1.2 }],
          highlight: ['mesh-btn'],
          zoom: zoomRear('mesh-btn', '短按 MESH 键'),
          chips: [{ label: '主路由器', sub: '蓝色闪烁' }, { label: '子路由器', sub: '橙色闪烁' }],
        },
        {
          id: 'm-done', title: '方法二 ④：子路由器蓝色常亮 = 组网成功', page: 8,
          desc: '等待子路由器的指示灯变成蓝色常亮，证明组网成功；主路由器回到蓝色常亮（正常运行）。',
          camera: MESH_VIEW,
          set: {
            'sub-led': { light: 'on', color: BLUE },
            led: { light: 'on', color: BLUE },
          },
          highlight: ['sub-led', 'led'],
          zoom: zoomSubLed('子路由器：蓝色常亮 = 组网成功'),
          chips: [{ label: '子路由器', sub: '蓝色常亮' }],
        },
        {
          id: 'm-move', title: '放到需要 Wi-Fi 覆盖的位置并通电', page: 8,
          desc: '方法二的最后一步：把子路由器放到需要 Wi-Fi 覆盖的位置并通电。方法三（网线组网）也从这里开始：子路由器放好、接通电源，启动中指示灯橙色常亮。',
          camera: MESH_FAR,
          set: {
            sub: { at: SUB1, lift: 40, dur: 1.8 },
            'sub-strip': { at: add(SUB1, SUB_STRIP), lift: 40, dur: 1.8 },
            'sub-led': { light: 'on', color: ORANGE, delay: 1.9 },
          },
          highlight: ['sub', 'sub-led'],
          zoom: zoomSubLed('重新通电：橙色常亮 = 启动中'),
        },
        {
          id: 'm-wire', title: '方法三：网线连接两台路由器', page: 8,
          desc: '使用网线连接子路由器的 WAN 口（没有 WAN 口则为任意口）和主路由器的 LAN 口（没有 LAN 口则为任意口），主路由器指示灯开始蓝色闪烁，进入组网流程。',
          camera: MESH_REAR,
          set: {
            'mesh-a': { visible: true, plug: { hole: 'sub-port-wan', back: 45 }, dur: 1.6 },
            'mesh-b': { visible: true, plug: { hole: 'port-2', back: 45 }, dur: 1.6 },
            led: { light: 'blink', color: BLUE, delay: 1.7 },
          },
          highlight: ['mesh-a', 'mesh-b', 'mesh-cable'],
          zoom: zoomLed('主路由器：蓝色闪烁 = 下级节点接入中'),
          tip: 'AX3000T 的 4 个网口都是 WAN/LAN 自动识别，任选一个即可。',
        },
        {
          id: 'm-wire-done', title: '方法三：子路由器蓝色常亮 = 组网成功', page: 8,
          desc: '等待子路由器的指示灯变成蓝色常亮，证明组网成功。',
          camera: MESH_FAR,
          set: {
            'sub-led': { light: 'on', color: BLUE },
            led: { light: 'on', color: BLUE, delay: 0.4 },
          },
          highlight: ['sub-led', 'led'],
          zoom: zoomSubLed('子路由器：蓝色常亮 = 组网成功'),
        },
      ],
    },
    {
      id: 'troubleshoot', title: '指示灯与上网排查', kind: 'repair',
      start: {
        ...CONNECTED,
        'dc-plug': { plug: { hole: 'port-dc', depth: -6 } },
        'rj-b': { plug: { hole: 'modem-lan', depth: -5 } },
      },
      steps: [
        {
          id: 'f-power', title: '指示灯不亮：检查电源', page: 4,
          desc: '指示灯熄灭表示没有接通电源。检查适配器是否插好，把电源插头插紧到路由器电源接口；接通后指示灯橙色常亮（系统启动中）。',
          camera: { target: [180, 30, -100], dir: [0.45, 0.6, -1], dist: 600 },
          set: {
            'dc-plug': { plug: { hole: 'port-dc', back: 0 }, dur: 0.8 },
            led: { light: 'on', color: ORANGE, delay: 0.9 },
          },
          actions: [{ type: 'shake', part: 'dc-plug', axis: 'x', amp: 1.2 }],
          highlight: ['dc-plug', 'adapter'],
          zoom: zoomLed('熄灭 = 未接电源；插好后橙色常亮'),
          chips: [{ label: '指示灯', sub: '熄灭 → 橙色常亮' }],
        },
        {
          id: 'f-fault', title: '橙色常亮超过 2 分钟不呼吸：报修', page: 9,
          desc: '正常情况下启动完成后会变为橙色呼吸（待配置）或蓝色常亮（已配置）。如果启动后指示灯橙色常亮两分钟以上不呼吸、或接通电源后无法启动 / 灯不亮，属于说明书「性能故障表」所列的性能故障，请联系小米售后。',
          camera: FRONT,
          highlight: ['led'],
          zoom: zoomLed('橙色常亮 > 2 分钟 = 性能故障'),
          chips: [{ label: '服务电话', sub: '950816' }],
          tip: '签收次日起 7 日内出现性能故障可退换货，8–15 日可换货或维修，12 个月内可免费维修（以小米售后检测为准）。',
        },
        {
          id: 'f-wifi', title: '无法上网 ①：能搜到路由器 Wi-Fi 吗', page: 10,
          desc: '先确认手机能搜到路由器的 Wi-Fi 网络。如果找不到，确保路由器已接通电源并启动完成（指示灯不再是橙色常亮）。',
          camera: PHONE_CAM,
          set: { phone: { visible: true }, 'phone-screen': { ui: WIFI_SCAN, delay: 0.3 }, led: { light: 'on', color: BLUE, delay: 0.3 } },
          highlight: ['phone-screen'],
          zoom: zoomLed('启动完成后蓝色常亮'),
        },
        {
          id: 'f-cable', title: '无法上网 ②：网线插紧', page: 10,
          desc: '确保网线已正确连接光猫和路由器的网口，两端都插到底。',
          camera: MODEM_VIEW,
          set: { 'rj-b': { plug: { hole: 'modem-lan', back: 0 }, dur: 0.8 } },
          actions: [{ type: 'shake', part: 'rj-b', axis: 'x', amp: 1.2 }, { type: 'shake', part: 'rj-a', axis: 'x', amp: 1.2 }],
          highlight: ['rj-b', 'rj-a', 'net-cable'],
          zoom: zoomRear('modem-lan', '光猫端插到底'),
          tip: '还不能上网：用网线把电脑直接接到光猫，检查宽带本身是否正常；电脑也上不了网请联系网络运营商。',
        },
        {
          id: 'f-modem', title: '无法上网 ③：关闭光猫 5 分钟再打开', page: 10,
          desc: '关闭光猫并等待 5 分钟，然后将其打开并重置。',
          camera: { ...MODEM_VIEW, target: [-300, 20, -100], dist: 520 },
          actions: [{ type: 'press', part: 'modem-power', depth: 1 }],
          highlight: ['modem-power'],
          zoom: zoomRear('modem-power', '关闭光猫，等 5 分钟再打开'),
          chips: [{ label: '等待', sub: '5 分钟' }],
        },
        {
          id: 'f-dns', title: '无法上网 ④：网络诊断与 DNS', page: 10,
          desc: '在浏览器登录路由器管理页面，若弹出网络诊断，按诊断结果尝试修复；或在网络设置里把主 DNS 设为 8.8.8.8、辅助 DNS 设为 8.8.4.4。仍无效请联系小米售后或网络运营商。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: DIAG_UI, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [{ label: '主 DNS', sub: '8.8.8.8' }, { label: '辅助 DNS', sub: '8.8.4.4' }],
        },
        {
          id: 'f-wlan', title: '无线设备连不上 Wi-Fi', page: 10,
          desc: '确保 Wi-Fi 名称和密码不含特殊字符；选对 Wi-Fi 名称、输对密码；检查设备是否在黑名单里，在的话删除；把加密方式设为 WPA2 增强兼容性；重启路由器和设备再试。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: WIFI_FAIL, delay: 0.3 } },
          highlight: ['phone-screen'],
        },
        {
          id: 'f-mijia', title: '米家 APP 添加不了路由器', page: 10,
          desc: '检查手机是否已连接这台路由器的 Wi-Fi；检查米家 APP 里选择的产品型号是否正确；确保米家 APP 的国家或地区设置是中国大陆。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: MIJIA_FAIL, delay: 0.3 } },
          highlight: ['phone-screen'],
        },
      ],
    },
    {
      id: 'reset', title: '恢复出厂设置', kind: 'repair',
      start: { ...CONNECTED, led: { light: 'on', color: BLUE } },
      steps: [
        {
          id: 'r-ready', title: '确保路由器启动完成', page: 11,
          desc: '忘记管理密码或 Wi-Fi 密码时，可以恢复出厂设置后重新设置。先确保路由器已经启动完成（指示灯不是橙色常亮）。',
          camera: FRONT,
          highlight: ['led'],
          zoom: zoomLed('已启动：蓝色常亮'),
        },
        {
          id: 'r-hold', title: '长按 RESET 键 5 秒以上', page: 11,
          desc: '用卡针或牙签插进路由器背面的 RESET 孔，按住 RESET 键 5 秒以上。',
          camera: PORTS,
          set: { pin: { visible: true, plug: { hole: 'port-reset', back: 40, depth: 1.5 }, dur: 1.4 } },
          highlight: ['pin', 'port-reset'],
          zoom: zoomRear('port-reset', '按住 RESET ≥ 5 秒', 80),
          chips: [{ label: '按住', sub: '5 秒以上' }],
        },
        {
          id: 'r-release', title: '指示灯变橙色就可以松开', page: 11,
          desc: '指示灯变为橙色时即可松开 RESET 键。',
          camera: { target: [40, 20, -115], dir: [0.4, 0.5, -1], dist: 420 },
          set: {
            led: { light: 'on', color: ORANGE },
            pin: { parent: null, at: PIN_HAND, rot: TO_PLUS_Z, delay: 0.8, dur: 1 },
          },
          highlight: ['pin'],
          zoom: zoomLed('变橙色 = 松开 RESET'),
        },
        {
          id: 'r-done', title: '重启完成，恢复为出厂设置', page: 11,
          desc: '等路由器重启成功，就恢复为出厂设置了，指示灯橙色呼吸（待配置）。恢复出厂后需要重新配置路由器（见「初始化设置」）。',
          camera: FRONT,
          set: { led: { light: 'blink', color: ORANGE }, pin: { visible: false } },
          highlight: ['led'],
          zoom: zoomLed('橙色呼吸 = 待配置'),
          chips: [{ label: '指示灯', sub: '橙色常亮 → 橙色呼吸' }],
        },
      ],
    },
  ],
}
