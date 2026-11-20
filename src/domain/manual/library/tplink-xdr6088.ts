import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * TP-LINK TL-XDR6088 易展Turbo版（AX6000 双频 Wi-Fi 6 无线路由器 · 双 2.5G 口）
 * 官方《快速安装指南》2 页：P1 硬件连接 + 接口表 + 设置路由器（4 屏）；P2 易展组网 + 灯语表 + 常见问题 + 物品清单 + 警告。
 *
 * 场景：桌面 y=0。路由器在原点，正面（易展键 = 系统指示灯）朝 +z（观众），接口在背面 -z。
 *   光猫在左后方，插线板在正后方，笔记本在右侧（网口在它左侧面）；组网时子路由出现在右侧，再转插到更远处的插线板。
 * 路由器局部：+x = 正面看的右手边。背面看从左到右（+x → -x）：USB 3.0｜2.5GE ×2｜WAN/LAN ×4｜POWER，与说明书后面板图一致。
 *
 * 尺寸：官网尺寸图 313.3 × 213.2 mm（含天线），天线竖起总高 153.1 mm，机身高 44.5 mm。
 * 推断（说明书没给）：机身俯视 284 × 204 圆角（超椭圆 n = 4.5）、侧壁高 20；天线每侧 4 根挂在侧壁、z = ±28 / ±84、长 139；
 *   后面板各口位置按官网实物图比例（网口间距 17）；易展键直径 11；
 *   RESET 小孔：说明书 FAQ 写「后面板」，但后面板图和官网实物图都没有 RESET，按实物放在机身左侧面靠后；
 *   复位按住时长说明书只写「直到系统指示灯闪烁」，5–8 秒取自 TP-LINK 官方《无线产品复位操作》；
 *   光猫、插线板、笔记本、取卡针是常见尺寸的场景道具；子路由按同型号建模（说明书图中两台外观相同）。
 */

// ---------- 路由器尺寸 ----------
const R = { w: 284, l: 204, h: 44.5, base: 20, n: 4.5 }
const RA = R.w / 2
const RB = R.l / 2
/** 背面外壳在 x 处的 z（超椭圆轮廓） */
const wallZ = (x: number) => -RB * Math.pow(1 - Math.pow(Math.abs(x) / RA, R.n), 1 / R.n)
/** 侧面外壳在 z 处的 |x| */
const sideX = (z: number) => RA * Math.pow(1 - Math.pow(Math.abs(z) / RB, R.n), 1 / R.n)
/** 后面板接口中心高度与各口 x（路由器局部） */
const PY = 10.5
const PX = { usb: 60, p1: 38, p2: 21, p3: 4, p4: -13, p5: -30, p6: -47, dc: -66 }
const RESET = { y: 10, z: -54 }
const ANT: [number, number][] = [-84, -28, 28, 84].flatMap((z) => [[-(sideX(z) + 7), z], [sideX(z) + 7, z]] as [number, number][])
const BACK: Vec3 = [0, 180, 0]
const portAt = (x: number, y = PY): Vec3 => [x, y, wallZ(x) - 0.12]
const GRILLE: [number, number][][] = Array.from({ length: 21 }, (_, i) => {
  const z = -88 + i * 7.8
  const x = sideX(z) * 0.92 - 6
  return [[-x, z], [x, z]]
})
const BODY: Shape = { type: 'shell', w: R.w, l: R.l, h: R.h, base: R.base, n: R.n, peak: 0, seams: GRILLE }

// ---------- 场景道具位置 ----------
const MODEM_AT: Vec3 = [-400, 0, -120]
const STRIP_AT: Vec3 = [-90, 0, -330]
const LAPTOP_AT: Vec3 = [420, 0, -40]
const FAR_STRIP_AT: Vec3 = [880, 0, -330]
const SUB_NEAR: Vec3 = [430, 0, -110]
const SUB_FAR: Vec3 = [760, 0, -110]
const SUB_FARTHER: Vec3 = [1000, 0, -110]

// ---------- 颜色 ----------
const GREEN = '#22b04b'
const RED = '#ff3b30'
const ORANGE = '#ff8a00'

// ---------- 插头 / 配件形体：原点在插头与外壳交界，插头朝 +x ----------
const RJ45: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [12, 8.2, 11.7], at: [6, 0, 0], fill: 'white' },
    { type: 'box', size: [20, 9.6, 12.8], chamfer: 1.6, at: [-10, 0, 0] },
    { type: 'cylinder', r: 3.2, h: 8, axis: 'x', at: [-24, 0, 0] },
  ],
}
const DC: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 2.75, h: 9, axis: 'x', at: [4.5, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 4.8, h: 18, axis: 'x', at: [-9, 0, 0] },
    { type: 'cylinder', r: 2.6, h: 8, axis: 'x', at: [-22, 0, 0] },
  ],
}
/** 墙插式电源适配器：两片插脚朝 +x，机身在 -x */
const ADAPTER: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [9, 6.4, 1.6], at: [4.5, 0, -6.3], fill: 'shade' },
    { type: 'box', size: [9, 6.4, 1.6], at: [4.5, 0, 6.3], fill: 'shade' },
    { type: 'box', size: [46, 44, 58], chamfer: 4, at: [-23, 0, 0] },
  ],
}
/** 取卡针：针朝 +x，圆头平放 */
const PIN: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 0.45, h: 30, axis: 'x', at: [-11, 0, 0], fill: 'shade' },
    { type: 'cylinder', r: 5, h: 1.2, at: [-29, 0, 0], fill: 'shade' },
  ],
}
const SOCKET: Shape = { type: 'hole', w: 38, h: 30, r: 5 }
const UP: Vec3 = [-90, 0, 0]

// ---------- 拔下时的摆放（世界坐标） ----------
const REST: Record<'wa' | 'wb' | 'dc' | 'ad' | 'na' | 'nb' | 'pin' | 'sad', PartState> = {
  wa: { parent: null, at: [-280, 4.8, -250], rot: [0, 180, 0] },
  wb: { parent: null, at: [-20, 4.8, -235], rot: [0, -90, 0] },
  dc: { parent: null, at: [-110, 4.8, -205], rot: [0, -90, 0] },
  ad: { parent: null, at: [-130, 29, -262], rot: [-90, 0, 0] },
  na: { parent: null, at: [110, 4.8, -200], rot: [0, -90, 0] },
  nb: { parent: null, at: [215, 4.8, -150], rot: [0, 0, 0] },
  pin: { parent: null, at: [-240, 0.6, 30], rot: [0, 0, 0] },
  sad: { parent: null, at: [100, 29, -262], rot: [-90, 0, 0] },
}
const restAt = (k: keyof typeof REST) => REST[k].at as Vec3
const restRot = (k: keyof typeof REST) => REST[k].rot as Vec3

// ---------- 零件 ----------
const antenna = (i: number): SpecPart => {
  const [x, z] = ANT[i]
  return {
    id: `ant-${i + 1}`, name: `天线 ${i + 1}`, spec: '外置全向天线（4 × 2.4G + 4 × 5G）', parent: 'router',
    shape: { type: 'cylinder', r: 6.5, r2: 5, h: 139 }, pivot: [0, 69.5, 0], at: [x, 14, z],
  }
}
const rj45Port = (id: string, name: string, x: number, spec: string): SpecPart => ({
  id, name, spec, parent: 'router', shape: { type: 'hole', w: 13.5, h: 11, r: 1 }, at: portAt(x), rot: BACK, fill: 'dark',
})
const rearText = (id: string, text: string, x: number): SpecPart => ({
  id, name: `丝印 ${text}`, parent: 'router', shape: { type: 'text', text, size: 2.2 }, at: [x, 2.6, wallZ(x) - 0.2], rot: BACK,
})

const parts: SpecPart[] = [
  // 路由器本体
  { id: 'router', name: 'TL-XDR6088 易展Turbo版', spec: '313.3 × 213.2 × 153.1 mm（含天线）', shape: BODY },
  ...Array.from({ length: 8 }, (_, i) => antenna(i)),
  { id: 'r-btn', name: '「易展」按键', spec: '一键互联 · 兼系统指示灯', parent: 'router', shape: { type: 'cylinder', r: 5.5, h: 3 }, at: [0, PY, RB + 0.3], rot: [90, 0, 0], fill: 'warm' },
  { id: 'r-led', name: '系统指示灯', spec: '绿 / 红 / 橙，常亮或闪烁', parent: 'r-btn', shape: { type: 'led', r: 4.5, color: GREEN }, at: [0, 1.55, 0], rot: [-90, 0, 0] },
  { id: 'r-usb', name: 'USB 3.0 接口', spec: '接 USB 存储器等', parent: 'router', shape: { type: 'hole', w: 13, h: 5.6, r: 0.8 }, at: portAt(PX.usb, PY + 1), rot: BACK, fill: 'dark' },
  rj45Port('r-p1', '2.5GE 网口 1', PX.p1, 'WAN/LAN 自适应 · 2.5Gbps'),
  rj45Port('r-p2', '2.5GE 网口 2', PX.p2, 'WAN/LAN 自适应 · 2.5Gbps'),
  rj45Port('r-p3', 'WAN/LAN 网口 1', PX.p3, '千兆 · 盲插'),
  rj45Port('r-p4', 'WAN/LAN 网口 2', PX.p4, '千兆 · 盲插'),
  rj45Port('r-p5', 'WAN/LAN 网口 3', PX.p5, '千兆 · 盲插'),
  rj45Port('r-p6', 'WAN/LAN 网口 4', PX.p6, '千兆 · 盲插'),
  { id: 'r-dc', name: 'POWER 电源接口', spec: '12V ⎓ 4A', parent: 'router', shape: { type: 'hole', w: 8.6, h: 8.6, r: 4.3 }, at: portAt(PX.dc), rot: BACK, fill: 'dark' },
  rearText('t-usb', 'USB 3.0', PX.usb),
  rearText('t-25g', '2.5GE', (PX.p1 + PX.p2) / 2),
  rearText('t-wan', 'WAN/LAN', (PX.p3 + PX.p6) / 2),
  rearText('t-pwr', 'POWER', PX.dc),
  { id: 'r-reset', name: 'RESET 复位孔', spec: '左侧面（推断位置）', parent: 'router', shape: { type: 'hole', w: 2.6, h: 2.6, r: 1.3 }, at: [-sideX(RESET.z) - 0.12, RESET.y, RESET.z], rot: [0, -90, 0], fill: 'dark' },
  // 底部规格标贴（朝下）
  { id: 'r-label', name: '底部规格标贴', parent: 'router', shape: { type: 'hole', w: 120, h: 60, r: 3 }, at: [0, -0.05, 15], rot: [90, 0, 0], fill: 'white' },
  { id: 'r-ssid', name: '无线名称 TP-LINK_XXXX', parent: 'router', shape: { type: 'text', text: '无线名称 TP-LINK_XXXX', size: 5.5 }, at: [0, -0.1, 6], rot: [90, 0, 0] },
  { id: 'r-spec', name: '管理页面 tplogin.cn', parent: 'router', shape: { type: 'text', text: '管理页面：tplogin.cn · 12V⎓4A', size: 3.6 }, at: [0, -0.1, 28], rot: [90, 0, 0] },

  // 光猫（场景道具）：网口朝 +x（朝路由器）
  { id: 'modem', name: '光猫', spec: '运营商提供', shape: { type: 'slab', w: 120, d: 170, h: 30, r: 6 }, at: MODEM_AT },
  { id: 'm-lan', name: '光猫 LAN 口', parent: 'modem', shape: { type: 'hole', w: 13.5, h: 11, r: 1 }, at: [60.12, 12, -40], rot: [0, 90, 0], fill: 'dark' },

  // 插线板（场景道具）：插孔朝上
  { id: 'strip', name: '插线板', shape: { type: 'slab', w: 300, d: 56, h: 32, r: 8 }, at: STRIP_AT },
  { id: 'sock1', name: '插座 1', parent: 'strip', shape: SOCKET, at: [-80, 32.05, 0], rot: UP },
  { id: 'sock2', name: '插座 2', parent: 'strip', shape: SOCKET, at: [120, 32.05, 0], rot: UP },
  // 远处的插线板（组网转插用）；要声明在会插进它的子路由适配器之前
  { id: 'strip3', name: '远处的插线板', shape: { type: 'slab', w: 360, d: 56, h: 32, r: 8 }, at: FAR_STRIP_AT, visible: false },
  { id: 'sock3a', name: '远处插座 A', parent: 'strip3', shape: SOCKET, at: [-120, 32.05, 0], rot: UP },
  { id: 'sock3b', name: '远处插座 B', parent: 'strip3', shape: SOCKET, at: [120, 32.05, 0], rot: UP },

  // 网线（物品清单 · 光猫 → 路由器）
  { id: 'w-a', name: '网线 · 光猫端', shape: RJ45, at: restAt('wa'), rot: restRot('wa') },
  { id: 'w-b', name: '网线 · 路由器端', shape: RJ45, at: restAt('wb'), rot: restRot('wb') },
  { id: 'w-cable', name: '网线', shape: { type: 'cable', from: { part: 'w-a', at: [-28, 0, 0], dir: [-1, 0, 0] }, to: { part: 'w-b', at: [-28, 0, 0], dir: [-1, 0, 0] }, r: 2.6, slack: 1.1 } },

  // 电源适配器（物品清单）
  { id: 'adapter', name: '电源适配器', spec: '12V ⎓ 4A · 配套', shape: ADAPTER, at: restAt('ad'), rot: restRot('ad') },
  { id: 'dc-plug', name: 'DC 电源插头', shape: DC, at: restAt('dc'), rot: restRot('dc') },
  { id: 'pw-cable', name: '电源线', shape: { type: 'cable', from: { part: 'adapter', at: [-20, -22, 0], dir: [0, -1, 0] }, to: { part: 'dc-plug', at: [-26, 0, 0], dir: [-1, 0, 0] }, r: 1.8, slack: 1 } },

  // 笔记本电脑（场景道具）：网口在左侧面
  { id: 'laptop', name: '笔记本电脑', shape: { type: 'slab', w: 300, d: 210, h: 14, r: 10 }, at: LAPTOP_AT },
  { id: 'l-kb', name: '键盘', parent: 'laptop', shape: { type: 'hole', w: 262, h: 96, r: 4 }, at: [0, 14.05, -35], rot: UP },
  { id: 'l-lid', name: '屏幕盖', parent: 'laptop', shape: { type: 'slab', w: 300, d: 205, h: 6, r: 10 }, pivot: [0, 0, 102.5], at: [0, 14, -105], rot: [-100, 0, 0] },
  { id: 'l-screen', name: '屏幕', parent: 'l-lid', shape: { type: 'screen', w: 272, h: 172 }, at: [0, -0.4, 102.5], rot: [90, 0, 0] },
  { id: 'l-lan', name: '电脑网口', parent: 'laptop', shape: { type: 'hole', w: 12, h: 8.6, r: 0.8 }, at: [-150.12, 7, -70], rot: [0, -90, 0], fill: 'dark' },

  // 电脑网线（用户自备，可选）
  { id: 'n-a', name: '电脑网线 · 路由器端', shape: RJ45, at: restAt('na'), rot: restRot('na'), visible: false },
  { id: 'n-b', name: '电脑网线 · 电脑端', shape: RJ45, at: restAt('nb'), rot: restRot('nb'), visible: false },
  { id: 'n-cable', name: '电脑网线', shape: { type: 'cable', from: { part: 'n-a', at: [-28, 0, 0], dir: [-1, 0, 0] }, to: { part: 'n-b', at: [-28, 0, 0], dir: [-1, 0, 0] }, r: 2.6, slack: 1 }, visible: false },

  // 取卡针 / 回形针（恢复出厂设置用）
  { id: 'pin', name: '取卡针', spec: '回形针、笔尖等尖状物均可', shape: PIN, at: restAt('pin'), rot: restRot('pin'), visible: false },

  // 子路由（易展组网）：同型号
  { id: 's-body', name: '子路由（另一台易展路由器）', shape: BODY, at: SUB_NEAR, visible: false },
  { id: 's-ant', name: '子路由天线', parent: 's-body', shape: { type: 'compound', items: ANT.map(([x, z]) => ({ type: 'cylinder' as const, r: 6.5, r2: 5, h: 139, at: [x, 14 + 69.5, z] as Vec3 })) } },
  { id: 's-btn', name: '子路由「易展」按键', parent: 's-body', shape: { type: 'cylinder', r: 5.5, h: 3 }, at: [0, PY, RB + 0.3], rot: [90, 0, 0], fill: 'warm' },
  { id: 's-led', name: '子路由系统指示灯', parent: 's-btn', shape: { type: 'led', r: 4.5, color: GREEN }, at: [0, 1.55, 0], rot: [-90, 0, 0] },
  { id: 's-adapter', name: '子路由电源适配器', shape: ADAPTER, at: restAt('sad'), rot: restRot('sad'), visible: false },
  { id: 's-cable', name: '子路由电源线', shape: { type: 'cable', from: { part: 's-adapter', at: [-20, -22, 0], dir: [0, -1, 0] }, to: { part: 's-body', at: [-60, 10, -101.8], dir: [0, 0, -1] }, r: 1.8, slack: 0.9 }, visible: false },
]

const led = (light: PartState['light'], color: string, delay = 0): PartState => ({ light, color, ...(delay ? { delay } : {}) })
const plugIn = (hole: string, extra: Omit<PartState, 'plug'> = {}): PartState => ({ plug: { hole, back: 55 }, lift: 20, dur: 1.6, ...extra })
/** 适配器从正上方竖直插进插座 */
const plugSocket = (hole: string, extra: Omit<PartState, 'plug'> = {}): PartState => ({ plug: { hole, back: 75 }, lift: 25, dur: 1.7, ...extra })

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [10, 30, -140], dir: [0.22, 0.95, 1], dist: 1300 }
const REAR: CameraSpec = { target: [0, 24, -100], dir: [0.16, 0.5, -1], dist: 440 }
const PORTS: CameraSpec = { target: [12, 12, -112], dir: [0.42, 0.55, -1], dist: 360 }
const DC_VIEW: CameraSpec = { target: [-72, 12, -112], dir: [-0.45, 0.55, -1], dist: 380 }
const MODEM_VIEW: CameraSpec = { target: [-318, 14, -168], dir: [0.75, 0.65, -0.35], dist: 400 }
const STRIP_VIEW: CameraSpec = { target: [-150, 36, -290], dir: [0.35, 0.85, 0.8], dist: 440 }
const FRONT: CameraSpec = { target: [0, 34, 30], dir: [0.3, 0.42, 1], dist: 560 }
const SCREEN: CameraSpec = { target: 'l-screen', offset: [0, -10, 0], dir: [-0.12, 0.3, 1], dist: 560 }
const LEFT: CameraSpec = { target: [-160, 22, -50], dir: [-1, 0.34, 0.2], dist: 340 }
const MESH_NEAR: CameraSpec = { target: [215, 36, -70], dir: [0.02, 0.42, 1], dist: 960 }
const MESH_FAR: CameraSpec = { target: [500, 40, -150], dir: [0.12, 0.62, 1], dist: 1550 }
const zoomLed = (target: string, caption: string) => ({ target, dir: [0.2, 0.25, 1] as Vec3, dist: 85, caption })
const zoomRear = (target: string, caption: string, side = 0.35) => ({ target, dir: [side, 0.42, -1] as Vec3, dist: 120, caption })

// ---------- 屏幕 ----------
const WIFI_LIST: ScreenUI = {
  app: 'WLAN', title: '选择无线网络',
  items: [
    { text: 'TP-LINK_XXXX', sub: '底部标贴上的无线名称', state: 'selected' },
    { text: '附近的其他无线网络', state: 'muted' },
  ],
  button: '连接', buttonActive: true,
}
const BROWSER: ScreenUI = {
  app: '浏览器', title: 'tplogin.cn',
  items: [
    { text: '已连接 TP-LINK_XXXX', state: 'done' },
    { text: '地址栏输入 tplogin.cn', sub: '未自动跳转时', state: 'selected' },
  ],
}
const ADMIN: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '创建管理员密码',
  items: [{ text: '设置密码', sub: '••••••••' }, { text: '确认密码', sub: '••••••••' }],
  button: '确 定', buttonActive: true,
}
const PPPOE: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '上网设置',
  items: [
    { text: '上网方式', sub: '宽带拨号上网 ▾', state: 'done' },
    { text: '宽带账号', sub: '运营商提供' },
    { text: '宽带密码', sub: '••••••••' },
  ],
  button: '下一步', buttonActive: true,
}
const MODE_PICK: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '请选择上网方式',
  items: [
    { text: '宽带拨号上网', sub: '运营商给了帐号和密码' },
    { text: '固定IP地址', sub: '给了 IP、掩码、网关、DNS' },
    { text: '自动获得IP地址', sub: '没有提供任何参数', state: 'selected' },
  ],
}
const WLAN_SET: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '无线设置',
  items: [
    { text: 'Wi-Fi多频合一', sub: '开', state: 'done' },
    { text: '无线名称', sub: 'TP-LINK_XXXX' },
    { text: '无线密码', sub: '••••••••' },
  ],
  button: '确 定', buttonActive: true,
}
const RECONNECT: ScreenUI = {
  app: 'WLAN', title: '选择无线网络',
  items: [{ text: '新的无线名称', sub: '输入新的无线密码', state: 'selected' }],
  button: '连接', buttonActive: true,
  toast: '无线连接已断开，请用新名称重连',
}
const DONE: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '设置完成',
  items: [
    { text: '上网设置', sub: '已完成', state: 'done' },
    { text: '无线设置', sub: '已完成', state: 'done' },
  ],
  toast: '系统指示灯 · 绿色常亮',
}
const DIAG: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '按页面提示查找问题',
  items: [
    { text: 'WAN口无网线连接', sub: '网线松动或未正确连接' },
    { text: '宽带账号或密码错误', sub: '重新输入并保存', state: 'selected' },
    { text: '网络异常', sub: '网线接错或线路异常' },
  ],
}
const RE_PPPOE: ScreenUI = {
  app: '浏览器 · tplogin.cn', title: '路由设置 > 上网设置',
  items: [{ text: '宽带账号', sub: '重新输入' }, { text: '宽带密码', sub: '重新输入' }],
  button: '保 存', buttonActive: true,
}
const IP_AUTO: ScreenUI = {
  app: '网络设置 · 以太网', title: 'IPv4 设置',
  items: [
    { text: '自动获得IP地址', state: 'done' },
    { text: '自动获得DNS服务器地址', state: 'done' },
  ],
  toast: '已用网线连接路由器 LAN 口',
}
const WIFI_TIPS: ScreenUI = {
  app: '无线连接时', title: '打不开 tplogin.cn / 上不了网',
  items: [
    { text: '已连接路由器的无线网络', state: 'done' },
    { text: '关闭重开浏览器、清除缓存', sub: '或换浏览器 / 换设备' },
    { text: '无线名称不用中文或特殊字符', sub: '' },
    { text: '无线密码区分大小写', sub: '名称和密码都要对' },
  ],
}

// ---------- 组网共用 ----------
const MESH_START: Record<string, PartState> = {
  laptop: { visible: false },
  's-body': { visible: true },
  's-adapter': { visible: true },
  's-cable': { visible: true },
  strip3: { visible: true },
  'r-led': led('on', GREEN),
}

export const tplinkXdr6088: ManualSpec = {
  id: 'tplink-xdr6088',
  name: 'TP-LINK TL-XDR6088 易展Turbo版',
  desc: 'AX6000 双频 Wi-Fi 6 路由器 · 双 2.5G 口 · 易展组网 · 单颗系统指示灯',
  category: '路由器',
  dims: { width: 313.3, depth: 213.2, height: 153.1 },
  source: {
    title: 'TL-XDR6088 易展Turbo版 V1.0快速安装指南 2.0.0',
    url: 'https://service.tp-link.com.cn/detail_download_12389.html',
    images: [],
  },
  package: [
    { name: '双频无线路由器', qty: 1, spec: 'TL-XDR6088 易展Turbo版' },
    { name: '电源适配器', qty: 1, spec: '12V ⎓ 4A' },
    { name: '网线', qty: 1 },
    { name: '参数记录标贴', qty: 1 },
    { name: '快速安装指南', qty: 1 },
  ],
  params: [
    { label: '无线', value: 'AX6000 双频 Wi-Fi 6', note: '2.4GHz 1148Mbps + 5GHz 4804Mbps · Wi-Fi多频合一' },
    { label: '网口', value: '2 × 2.5GE + 4 × 千兆', note: '全部 WAN/LAN 自适应（盲插）' },
    { label: 'USB', value: '1 × USB 3.0', note: '接 USB 存储器等' },
    { label: '天线', value: '8 根外置', note: '4 × 2.4G + 4 × 5G' },
    { label: '电源', value: '12V ⎓ 4A', note: '请用配套电源适配器' },
    { label: '管理页面', value: 'tplogin.cn', note: '无线名称见底部标贴（TP-LINK_XXXX）' },
    { label: '尺寸', value: '313.3 × 213.2 × 153.1 mm', note: '含天线；机身高 44.5 mm（官网尺寸图）' },
    { label: '易展组网', value: '最多 8 台（1 + 7）' },
    { label: '使用温度', value: '0 ℃ – 40 ℃', note: '远离热源、注意防水、放平稳' },
    { label: '售后', value: '一年保修', note: '技术支持热线 400-8863-400' },
  ],
  parts,
  initial: {
    'w-a': { plug: 'm-lan' },
    'w-b': { plug: 'r-p3' },
    adapter: { plug: 'sock1' },
    'dc-plug': { plug: 'r-dc' },
    'r-led': led('on', RED),
  },
  stageSize: 1500,
  guides: [
    // ------------------------------------------------------------ 1 连接线路
    {
      id: 'connect', title: '连接线路（硬件连接）', kind: 'usage',
      start: { 'w-a': REST.wa, 'w-b': REST.wb, adapter: REST.ad, 'dc-plug': REST.dc, 'r-led': { light: 'off' } },
      steps: [
        {
          id: 'unbox', title: '清点物品', page: 2,
          desc: '包装里有：一台双频无线路由器、一个电源适配器、一根网线、一张参数记录标贴、一份快速安装指南。光猫由运营商提供，电脑可选（用来有线上网或设置）。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'router', text: '无线路由器 ×1', sub: 'TL-XDR6088 易展Turbo版', at: [30, 44, 10], offset: [80, 200, 0] },
            { part: 'adapter', text: '电源适配器 ×1', sub: '12V ⎓ 4A', offset: [-40, 90, 0] },
            { part: 'w-b', text: '网线 ×1', offset: [-60, 40, 20] },
            { part: 'modem', text: '光猫', sub: '运营商提供', at: [0, 30, 0], offset: [80, 90, 0] },
            { part: 'laptop', text: '电脑（可选）', at: [-80, 200, -150], offset: [-60, 50, 0] },
          ],
          chips: [{ label: '物品清单', sub: '5 件' }],
        },
        {
          id: 'rear', title: '认识背面接口', page: 1,
          desc: '背面从左到右：USB 3.0 接口（接 USB 存储器等）、两个 2.5GE 网口、四个千兆 WAN/LAN 网口、POWER 电源接口。所有网口都支持 WAN/LAN 自适应，路由器自动识别接口连接类型。',
          camera: REAR,
          highlight: ['r-usb', 'r-p1', 'r-p2', 'r-p3', 'r-p4', 'r-p5', 'r-p6', 'r-dc'],
          zoom: { target: 'r-p3', offset: [6, 0, 0], dir: [0.15, 0.4, -1], dist: 190, caption: 'USB｜2.5GE ×2｜WAN/LAN ×4｜POWER' },
          callouts: [
            { part: 'r-usb', text: 'USB 3.0', sub: '接 USB 存储器等', offset: [36, 45, -20] },
            { part: 'r-p1', text: '2.5GE ×2', sub: '最大 2.5Gbps', offset: [16, 72, -10] },
            { part: 'r-p5', text: 'WAN/LAN ×4', sub: '千兆 · 自动识别', offset: [-6, 72, -10] },
            { part: 'r-dc', text: 'POWER', sub: '接配套电源适配器', offset: [-20, 45, -20] },
          ],
          chips: [{ label: '网口', sub: '6 个 · 盲插' }],
        },
        {
          id: 'front', title: '认识「易展」按键与系统指示灯', page: 1,
          desc: '正面中间的圆形按键是「易展」按键，可与任意带有 TP-LINK「易展」功能的路由器实现「一键互联」；它同时是系统指示灯，用颜色和闪法表示路由器状态。',
          camera: FRONT,
          highlight: ['r-btn', 'r-led'],
          zoom: zoomLed('r-led', '易展按键 = 系统指示灯'),
          callouts: [
            { part: 'r-btn', text: '「易展」按键', sub: '一键互联', offset: [-60, 40, 10] },
            { part: 'r-led', text: '系统指示灯', sub: '第 2 页灯语表', offset: [70, 30, 10] },
          ],
        },
        {
          id: 'wan-modem', title: '网线一端插光猫 LAN 口', page: 1,
          desc: '按说明书连接图，把网线的一端插入光猫（光纤宽带 Modem）的 LAN 口。',
          camera: MODEM_VIEW,
          set: { 'w-a': plugIn('m-lan') },
          highlight: ['w-a', 'm-lan'],
          zoom: { target: 'm-lan', offset: [12, 0, 0], dir: [1, 0.5, 0.7], dist: 120, caption: '网线插入光猫 LAN 口' },
          callouts: [{ part: 'modem', text: '光猫', sub: '光纤宽带 Modem', at: [0, 30, 0], offset: [30, 28, 30] }],
        },
        {
          id: 'wan-router', title: '另一端插路由器任意网口', page: 1,
          desc: '网线另一端插入路由器背面的网口。网口支持盲插，网线可插入任意网口，无需区分；图中插在第 3 个网口（第一个千兆 WAN/LAN 口）。',
          camera: PORTS,
          set: { 'w-b': plugIn('r-p3') },
          highlight: ['w-b', 'r-p3'],
          zoom: zoomRear('r-p3', '任意网口都行（盲插）'),
          chips: [{ label: 'WAN/LAN', sub: '自动识别' }],
          tip: '宽带超过千兆时可以改插 2.5GE 网口（用作 WAN 口最大 2.5Gbps）。',
        },
        {
          id: 'adapter', title: '电源适配器插到插座', page: 1,
          desc: '把配套的电源适配器插到附近的插座上。',
          camera: STRIP_VIEW,
          set: { adapter: plugSocket('sock1') },
          highlight: ['adapter'],
          tip: '请用配套电源（12V ⎓ 4A），以免损坏产品；设备远离热源、保持通风，放在平稳的表面。',
          chips: [{ label: '电源规格', sub: '12V ⎓ 4A' }],
        },
        {
          id: 'dc', title: '插上 POWER 口：绿灯常亮', page: 1,
          desc: '把适配器的电源插头插入路由器背面的 POWER 接口。路由器接通电源后，系统指示灯绿色常亮。',
          camera: DC_VIEW,
          set: { 'dc-plug': plugIn('r-dc', { lift: 15, dur: 1.5 }), 'r-led': led('on', GREEN, 1.6) },
          highlight: ['dc-plug', 'r-dc', 'r-led'],
          zoom: zoomLed('r-led', '接通电源：绿色常亮'),
          chips: [{ label: '指示灯', sub: '绿色常亮' }],
        },
        {
          id: 'boot-blink', title: '等待片刻：指示灯闪烁两次', page: 1,
          desc: '等待一段时间后，系统指示灯闪烁两次（演示中循环闪烁），表示系统正在完成启动。',
          camera: FRONT,
          set: { 'r-led': led('blink', GREEN) },
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '闪烁两次 = 即将启动完成'),
          chips: [{ label: '指示灯', sub: '闪烁两次' }],
        },
        {
          id: 'boot-red', title: '启动成功：红色常亮', page: 1,
          desc: '系统启动成功，指示灯变为红色常亮——路由器在等待配置，接下来按「设置上网」指南设置。',
          camera: FRONT,
          set: { 'r-led': led('on', RED) },
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '红色常亮 = 等待配置'),
          chips: [{ label: '红色常亮', sub: '等待配置或线路异常' }],
        },
        {
          id: 'lan-pc', title: '电脑等有线设备接其他网口', page: 1,
          desc: '需要有线上网的电脑、机顶盒，用网线接到路由器其余任意一个网口（此时它就是 LAN 口）。图中电脑接 2.5GE 网口，最大传输速率 2.5Gbps。',
          camera: { target: [150, 24, -150], dir: [-0.35, 0.62, -1], dist: 560 },
          set: {
            'n-cable': { visible: true },
            'n-a': plugIn('r-p1', { visible: true }),
            'n-b': plugIn('l-lan', { visible: true, delay: 0.3 }),
          },
          highlight: ['n-a', 'n-b', 'r-p1', 'l-lan'],
          zoom: zoomRear('r-p1', '电脑接 2.5GE 口（LAN）'),
          tip: '路由器自动识别哪个口接光猫（WAN）、哪个口接电脑（LAN），不用区分。',
        },
      ],
    },

    // ------------------------------------------------------------ 2 设置上网
    {
      id: 'setup', title: '设置上网（tplogin.cn）', kind: 'usage',
      steps: [
        {
          id: 'label', title: '在底部标贴上找到无线名称', page: 1,
          desc: '路由器底部的标贴上印着出厂无线名称（TP-LINK_XXXX）和管理页面地址 tplogin.cn。使用电脑设置与使用手机设置的步骤一致。',
          camera: { target: [0, 20, 20], dir: [0.3, 0.38, 1], dist: 600 },
          highlight: ['r-label'],
          zoom: { target: 'r-label', dir: [0, -1, 0.6], dist: 230, caption: '底部标贴：无线名称 TP-LINK_XXXX' },
          chips: [{ label: '无线名称', sub: 'TP-LINK_XXXX' }],
        },
        {
          id: 'wifi', title: '连接路由器的无线信号', page: 1,
          desc: '在电脑（或手机）的无线列表里选择标贴上的无线名称 TP-LINK_XXXX 并连接。出厂时 2.4G 和 5G 使用同一个名称（Wi-Fi多频合一）。',
          camera: SCREEN,
          set: { 'l-screen': { ui: WIFI_LIST, delay: 0.3 } },
          highlight: ['l-screen'],
          chips: [{ label: 'Wi-Fi', sub: 'TP-LINK_XXXX' }],
        },
        {
          id: 'tplogin', title: '打开管理界面 tplogin.cn', page: 1,
          desc: '连接成功后会自动跳转到管理界面；若没有跳转，手动打开浏览器，在地址栏中输入「tplogin.cn」。',
          camera: SCREEN,
          set: { 'l-screen': { ui: BROWSER, delay: 0.3 } },
          highlight: ['l-screen'],
          chips: [{ label: '管理页面', sub: 'tplogin.cn' }],
        },
        {
          id: 'admin', title: '创建管理员密码', page: 1,
          desc: '登录管理界面，输入并确认管理员密码，点击「确定」。以后登录 tplogin.cn 都用这个密码。',
          camera: SCREEN,
          set: { 'l-screen': { ui: ADMIN, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'pppoe', title: '上网设置：按检测结果填参数', page: 1,
          desc: '路由器会自动检测上网方式，请根据实际情况设置上网参数。检测为「宽带拨号上网」时，输入运营商提供的宽带账号和宽带密码，点击「下一步」。',
          camera: SCREEN,
          set: { 'l-screen': { ui: PPPOE, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'mode', title: '上网方式要和线路一致', page: 2,
          desc: '不确定时按开通网络时运营商给的参数判断：给了帐号和密码 → 宽带拨号上网；给了 IP 地址、子网掩码、网关、DNS 服务器 → 固定IP地址；没有提供任何参数（不用路由器时电脑不需设置即可上网）→ 自动获得IP地址。',
          camera: SCREEN,
          set: { 'l-screen': { ui: MODE_PICK, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'wlan', title: '设置无线名称和无线密码', page: 1,
          desc: '设置新的无线名称和无线密码，点击「确定」。开启 Wi-Fi多频合一 时，2.4G 和 5G 用相同的名称和密码，路由器会自动为终端选择最佳频段。',
          camera: SCREEN,
          set: { 'l-screen': { ui: WLAN_SET, delay: 0.3 } },
          highlight: ['l-screen'],
          tip: '无线名称请不要使用中文或特殊字符。',
        },
        {
          id: 'reconnect', title: '用新的名称和密码重连', page: 1,
          desc: '保存后无线会断开，请使用新的无线名称和密码重新连接网络。',
          camera: SCREEN,
          set: { 'l-screen': { ui: RECONNECT, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'done', title: '指示灯绿色常亮：配置完成', page: 2,
          desc: '设置完成后检查系统指示灯：绿色常亮表示配置完成，可以上网了。如果仍是红色常亮，见「指示灯与排障」。',
          camera: { target: [210, 60, -40], dir: [0.08, 0.4, 1], dist: 960 },
          set: { 'r-led': led('on', GREEN, 0.4), 'l-screen': { ui: DONE } },
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '绿色常亮 = 配置完成'),
          chips: [{ label: '绿色常亮', sub: '配置完成' }],
        },
      ],
    },

    // ------------------------------------------------------------ 3 指示灯与排障
    {
      id: 'troubleshoot', title: '指示灯与排障（上不了网）', kind: 'repair',
      start: { 'w-b': { plug: { hole: 'r-p3', depth: -5 } } },
      steps: [
        {
          id: 'red', title: '红色常亮：等待配置或线路异常', page: 2,
          desc: '作为主路由时：绿色常亮 = 配置完成；红色常亮 = 路由器等待配置或线路异常；红色闪烁 = 正在与子路由配对。设置完成后仍红色常亮，按下面几步排查。',
          camera: FRONT,
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '红色常亮 = 等待配置或线路异常'),
          chips: [{ label: '绿', sub: '配置完成' }, { label: '红', sub: '等待配置 / 线路异常' }],
        },
        {
          id: 'reseat', title: '检查网线是否松动', page: 2,
          desc: '确认网线已按「硬件连接」正确连接：光猫 LAN 口 → 路由器网口，插头插到底、不松动。',
          camera: PORTS,
          set: { 'w-b': { plug: { hole: 'r-p3', back: 0 }, dur: 0.8 } },
          actions: [{ type: 'shake', part: 'w-b', axis: 'x', amp: 1.2 }],
          highlight: ['w-b'],
          zoom: zoomRear('r-p3', '网线插到底、不松动'),
        },
        {
          id: 'diag', title: '登录 tplogin.cn 看页面提示', page: 2,
          desc: '登录管理界面，根据页面提示查找问题：WAN口无网线连接 = 网线松动或未正确连接；宽带账号或密码错误；网络异常 = 网线连接错误或网络线路异常。',
          camera: SCREEN,
          set: { 'l-screen': { ui: DIAG, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'account', title: '宽带账号或密码错误：重新输入', page: 2,
          desc: '点击 路由设置 > 上网设置，重新输入宽带账号与密码，点击「保存」。若上网方式选错，也在这里改成与线路一致的方式。',
          camera: SCREEN,
          set: { 'l-screen': { ui: RE_PPPOE, delay: 0.3 } },
          highlight: ['l-screen'],
          tip: '仍无法解决，可拨打宽带运营商电话确认网络线路是否异常。',
        },
        {
          id: 'wired', title: '打不开 tplogin.cn：有线连接时', page: 2,
          desc: '确保电脑连接的是路由器的 LAN 口（光猫以外的任意网口），并把电脑设为「自动获得IP地址」和「自动获得DNS服务器地址」。',
          camera: { target: [250, 50, -90], dir: [-0.32, 0.45, 1], dist: 800 },
          set: {
            'n-cable': { visible: true },
            'n-a': plugIn('r-p1', { visible: true }),
            'n-b': plugIn('l-lan', { visible: true, delay: 0.3 }),
            'l-screen': { ui: IP_AUTO, delay: 1.9 },
          },
          highlight: ['n-a', 'n-b', 'l-screen'],
          zoom: zoomRear('r-p1', '电脑接路由器 LAN 口'),
          tip: '也可以试试更换网线，或换另一台设备。',
        },
        {
          id: 'wireless', title: '打不开 / 上不了网：无线连接时', page: 2,
          desc: '确保设备已连接路由器的无线网络；关闭并重新打开浏览器、清除缓存或换一个浏览器、换一台设备再试。无线上不了网时，确认无线名称没有使用中文或特殊字符，名称和密码填写正确（密码区分大小写）。',
          camera: SCREEN,
          set: { 'l-screen': { ui: WIFI_TIPS, delay: 0.3 } },
          highlight: ['l-screen'],
        },
        {
          id: 'repower', title: '将路由器重新上电', page: 2,
          desc: '拔下 POWER 口的电源插头，再重新插好。重新上电后系统指示灯先绿色常亮，启动完成后按实际状态显示。',
          camera: DC_VIEW,
          set: { 'dc-plug': { plug: { hole: 'r-dc', back: 50 }, lift: 15, dur: 2.2 }, 'r-led': led('on', GREEN, 2.3) },
          highlight: ['dc-plug', 'r-led'],
          zoom: zoomLed('r-led', '重新上电：绿色常亮'),
          tip: '经过上述操作仍无法解决，请恢复出厂设置（见下一个指南），或拨打技术支持热线 400-8863-400。',
          chips: [{ label: '热线', sub: '400-8863-400' }],
        },
      ],
    },

    // ------------------------------------------------------------ 4 恢复出厂设置
    {
      id: 'reset', title: '恢复出厂设置（RESET）', kind: 'repair',
      start: { 'r-led': led('on', GREEN), pin: { visible: true } },
      steps: [
        {
          id: 'powered', title: '保持路由器通电', page: 2,
          desc: '恢复出厂设置要在通电状态下操作：电源插头插在 POWER 口，系统指示灯亮着。',
          camera: { target: [-30, 30, 0], dir: [-0.5, 0.45, 1], dist: 620 },
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '指示灯亮 = 已通电'),
          tip: '恢复出厂设置后，路由器的配置参数将被全部清除，需要重新配置。',
        },
        {
          id: 'find', title: '找到 RESET 复位孔', page: 2,
          desc: '说明书写的是「路由器后面板的 RESET 按键」；本机后面板图上没有画出，实物的 RESET 小孔在机身左侧面靠后（位置为推断，以实物为准）。',
          camera: LEFT,
          highlight: ['r-reset'],
          zoom: { target: 'r-reset', dir: [-1, 0.25, 0.2], dist: 70, caption: 'RESET 小孔' },
          callouts: [{ part: 'r-reset', text: 'RESET', sub: '复位孔', offset: [-30, 50, 30] }],
        },
        {
          id: 'press', title: '用针按住 RESET，直到指示灯闪烁', page: 2,
          desc: '用取卡针、回形针或笔尖等尖状物插进 RESET 小孔并按住，直到系统指示灯闪烁。',
          camera: LEFT,
          set: {
            pin: { plug: { hole: 'r-reset', depth: 1.5, back: 40 }, lift: 12, dur: 1.6 },
            'r-led': led('blink', GREEN, 4.2),
          },
          highlight: ['pin', 'r-reset'],
          zoom: zoomLed('r-led', '按住直到指示灯闪烁'),
          chips: [{ label: '按住', sub: '约 5–8 秒' }],
          tip: 'TP-LINK 官方复位说明：家用路由器通电状态下按住 RESET 约 5–8 秒，至系统指示灯快闪后松开。',
        },
        {
          id: 'release', title: '指示灯闪烁后松开', page: 2,
          desc: '看到系统指示灯闪烁就松开，拔出取卡针。路由器自动恢复出厂设置并重启，指示灯重新绿色常亮。',
          camera: LEFT,
          set: {
            pin: { ...REST.pin, via: [-185, 12, RESET.z], dur: 1.3 },
            'r-led': led('on', GREEN, 1.2),
          },
          highlight: ['pin'],
          zoom: zoomLed('r-led', '重启：绿色常亮'),
        },
        {
          id: 'reboot', title: '启动完成：红色常亮，重新配置', page: 2,
          desc: '启动完成后指示灯变为红色常亮，路由器回到出厂状态：无线名称恢复为底部标贴上的 TP-LINK_XXXX，请按「设置上网」重新配置。',
          camera: FRONT,
          set: { 'r-led': led('on', RED) },
          highlight: ['r-led'],
          zoom: zoomLed('r-led', '红色常亮 = 等待配置'),
          tip: '配置参数已全部清除，管理员密码也需要重新创建。',
        },
      ],
    },

    // ------------------------------------------------------------ 5 易展组网
    {
      id: 'mesh', title: '易展组网（一键互联）', kind: 'usage',
      start: MESH_START,
      steps: [
        {
          id: 'sub-power', title: '子路由就近接通电源：绿色常亮', page: 2,
          desc: '先把一台易展路由器按「设置上网」连好 Internet，它就是主路由（绿色常亮）。在邻近的插座上给另一台易展路由器（子路由）接通电源，系统指示灯绿色常亮。',
          camera: { target: [220, 30, -170], dir: [0.22, 0.75, 1], dist: 920 },
          set: { 's-adapter': plugSocket('sock2'), 's-led': led('on', GREEN, 1.8) },
          highlight: ['s-adapter', 's-led'],
          zoom: zoomLed('s-led', '子路由通电：绿色常亮'),
          callouts: [
            { part: 'router', text: '主路由', sub: '已连 Internet', at: [0, 44, 0], offset: [80, 150, 0] },
            { part: 's-body', text: '子路由', sub: '另一台易展路由器', at: [0, 44, 0], offset: [-60, 150, 0] },
          ],
          chips: [{ label: '最多', sub: '8 台（1 + 7）' }],
        },
        {
          id: 'sub-red', title: '子路由闪两下后红色常亮', page: 2,
          desc: '等待一段时间后，子路由指示灯闪烁两下，启动成功，变为红色常亮（子路由待配对）。',
          camera: { target: [430, 30, -40], dir: [0.25, 0.42, 1], dist: 560 },
          set: { 's-led': led('on', RED) },
          highlight: ['s-led'],
          zoom: zoomLed('s-led', '红色常亮 = 待配对'),
        },
        {
          id: 'press', title: '两分钟内分别按下两台的「易展」键', page: 2,
          desc: '在两分钟内，分别按下主路由和子路由正面的「易展」按键。与主路由互联的子路由会获取主路由的所有配置参数。',
          camera: MESH_NEAR,
          actions: [{ type: 'press', part: 'r-btn', delay: 0.2 }, { type: 'press', part: 's-btn', delay: 0.9 }],
          highlight: ['r-btn', 's-btn'],
          zoom: { target: 'r-btn', dir: [0.25, 0.3, 1], dist: 90, caption: '按下「易展」按键' },
          chips: [{ label: '时限', sub: '2 分钟内' }],
          tip: 'TP-LINK 建议：在公共场所使用时，为保证信息安全不要开启「易展」按键；未开启时可以通过 APP 或 Web 管理页手动互联。',
        },
        {
          id: 'pairing', title: '红色闪烁：正在搜索配对', page: 2,
          desc: '两台路由器的指示灯红色闪烁，开始搜索配对。',
          camera: MESH_NEAR,
          set: { 'r-led': led('blink', RED), 's-led': led('blink', RED) },
          highlight: ['r-led', 's-led'],
          zoom: zoomLed('s-led', '红色闪烁 = 正在配对'),
        },
        {
          id: 'paired', title: '绿色常亮：配对完成', page: 2,
          desc: '当指示灯变为绿色常亮时，配对完成。',
          camera: MESH_NEAR,
          set: { 'r-led': led('on', GREEN), 's-led': led('on', GREEN) },
          highlight: ['r-led', 's-led'],
          zoom: zoomLed('s-led', '绿色常亮 = 配对完成'),
        },
        {
          id: 'move', title: '转插到需要扩展信号的位置', page: 2,
          desc: '把已配对的子路由转插到需要扩展信号的位置，重新接通电源即可，无需任何配置。接通电源后指示灯红色闪烁，表示正在连接主路由。',
          camera: MESH_FAR,
          set: {
            's-adapter': { plug: { hole: 'sock3a', back: 75 }, lift: 60, dur: 2 },
            's-body': { at: SUB_FAR, lift: 40, dur: 2 },
            's-led': led('blink', RED, 2.1),
          },
          highlight: ['s-body', 's-adapter'],
          zoom: zoomLed('s-led', '红色闪烁 = 正在连接主路由'),
          chips: [{ label: '即插即用', sub: '无需配置' }],
        },
        {
          id: 'linked', title: '绿色常亮：连接成功、信号强劲', page: 2,
          desc: '指示灯变为绿色常亮，子路由已连接主路由且信号强劲，分布式 Wi-Fi 网络就组好了。',
          camera: MESH_FAR,
          set: { 's-led': led('on', GREEN) },
          highlight: ['s-led'],
          zoom: zoomLed('s-led', '绿色常亮 = 信号强劲'),
          chips: [{ label: '子路由', sub: '绿色常亮' }],
        },
        {
          id: 'too-far', title: '橙色常亮：离得太远，调整位置', page: 2,
          desc: '若两台路由器距离较远或中间墙壁阻碍物较多，子路由会橙色常亮（已连接但信号较弱）；一直红色闪烁则表示连接失败。请把子路由往主路由方向调整，直到绿色常亮。',
          camera: { ...MESH_FAR, target: [560, 40, -150], dist: 1650 },
          set: {
            's-adapter': { plug: { hole: 'sock3b', back: 75 }, lift: 50, dur: 1.8 },
            's-body': { at: SUB_FARTHER, lift: 30, dur: 1.8 },
            's-led': led('on', ORANGE, 1.9),
          },
          highlight: ['s-body', 's-led'],
          zoom: zoomLed('s-led', '橙色常亮 = 距离远、信号弱'),
          tip: '合理选择路由器位置，避免两台路由器距离较远或中间墙壁阻碍物过多。易展路由器之间也可以用网线连接任意网口后，两分钟内按下两台的「易展」键配对。',
        },
      ],
    },
  ],
}
