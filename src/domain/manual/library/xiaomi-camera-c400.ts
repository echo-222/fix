import type { CameraSpec, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 小米智能摄像机2 云台版（海外版名 Xiaomi Smart Camera C400；米家 chuangmi.camera.039a01，型号 MJSXJ17CM）
 * 官方说明书：米家产品百科「小米智能摄像机2 云台版使用说明书」，小米官方 CDN PDF 共 14 页。
 * 小米国内没有叫「C400」的说明书：米家产品库写明 C400（039a04 / 039c04）是 039a01 的海外产品，外观、尺寸（119 × 78 × 78 mm）相同，
 * 所以用这份中文说明书，id 保留 xiaomi-camera-c400。
 * 脚本里的 page = PDF 页码（1–14）；印刷页码从 PDF 第 2 页起编 1，PDF 页 = 印刷页 + 1。逐页转写见 manuals-src/xiaomi-camera-c400/transcript.md。
 * 说明书外的补充只来自小米官网 FAQ KA-12475（倒装后画面旋转 180°、设置 › 校准），文中注明「官网 FAQ」。
 *
 * 场景：桌面 y = 0。摄像机放在原点，镜头朝 +z（观众）；背面（喇叭、重置键、Type-C）朝 -z。
 * 插线板在右后方，适配器插在它上面；手机拿在左前方。吸顶安装用一块悬空的「天花板」（砖墙块，底面 y = 430），在 x = 560 处，从下往上施工。
 * 摄像机分三级：cam（底座，原点在底面中心）→ core（静止的内球，原点在球心）→ head（头部球体，原点在球心）。
 * 云台水平转动 = head 绕 y 转，镜头上抬 = head 绕 x 转（两者不同时写，避免欧拉角耦合）。
 *
 * 外观模型：Tripo 用苏宁小米自营旗舰店的官方正面主图生成一个整机 GLB（models/xiaomi-camera-c400/），同一个 GLB 挂三个零件：
 * 底座 crop 球体以下 40%、头部 crop 以上 60%、core 用倒过来的头部（略缩小）填住头部抬起时露出的切口。
 * 指示灯、麦克风孔、卡槽、喇叭孔、重置键、Type-C 口、底部铭牌都是贴在模型表面的几何体。
 *
 * 尺寸：外形 119 × 78 × 78 mm（第 11 页）。推断（说明书没写）：按生成模型的比例取球径 79.6、球心高 79.2、底座顶沿高 47.6、底座 Ø76.6；
 * 指示灯在镜头上方（球面仰角 21°）、麦克风孔在镜头下方（-14°）、microSD 卡槽在镜头窗下沿（-47°，平放时藏在底座里）；
 * 重置键 8.8 × 2.8 mm 离底 12 mm、Type-C 口离底 5.5 mm（按苏宁背面图比例）；镜头上抬 45° 露出卡槽。
 * 挂墙底座：Ø54 × 5 圆盘 + 两耳、孔距 70 mm、中心凸起 Ø32；膨胀螺母 Ø6 × 28、螺钉 Ø3.4 × 31（按孔径 6 / 孔深 30 推断）。
 * 插线板、天花板、铅笔、电钻、锤子、十字螺丝刀、手机都是场景道具。引擎的 blink 只有一种节奏：快闪 / 慢闪都用 blink，文字写明。
 */

const GLB = '/models/xiaomi-camera-c400/camera.glb'

// ---------- 尺寸（摄像机局部，mm） ----------
const H = 119
/** 头部球半径、球心高度 */
const R = 39.8
const CY = 79.2
/** 底座顶沿（球与底座交线）高度 = 模型高度的 40% */
const CUT = 47.6
const CROP = CUT / H
/** 底座半径 */
const BR = 38.3
/** 球心以下保留到底座顶沿 */
const LOW = CY - CUT

const DEG = Math.PI / 180
/** 球面方向：el 仰角、az 方位（0 = 正前 +z，正值偏 +x） */
const ballDir = (el: number, az = 0): Vec3 => [Math.cos(el * DEG) * Math.sin(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.cos(az * DEG)]
/** 让贴片（朝 +z）朝向 n 的欧拉角 */
const faceRot = (n: Vec3): Vec3 => [Math.atan2(-n[1], n[2]) / DEG, Math.asin(n[0]) / DEG, 0]
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

const LED_N = ballDir(21)
const MIC_N = ballDir(-14)
const SD_N = ballDir(-47)

// ---------- 场景布置（世界坐标） ----------
const STRIP_AT: Vec3 = [210, 0, -170]
/** 天花板底面中心 */
const CX = 560
const CYL = 430
/** 两个安装孔（天花板局部 x） */
const HOLE_X = [-35, 35]
/** 挂墙底座：在桌上箭头面朝上 → 贴到天花板 */
const MOUNT_DESK: Vec3 = [170, 11, 110]
/** 摄像机扣在底座下：底座局部 +y 朝下，底面离底座盘面 2.6 mm（让开螺钉头） */
const HANG_Y = 7.6

const BACK: Vec3 = [0, 180, 0]
const UP: Vec3 = [-90, 0, 0]
const DOWN: Vec3 = [90, 0, 0]
/** 插头 / 工具朝上（+x → +y） */
const POINT_UP: Vec3 = [0, 0, 90]
const TO_PLUS_Z: Vec3 = [0, -90, 0]

// ---------- 颜色 ----------
const ORANGE = '#ff8a00'
const BLUE = '#2f7bf5'

// ---------- 形体 ----------
type Item = Extract<Shape, { type: 'compound' }>['items'][number]

/** 底座：灰色脚圈 + 竖直侧壁 + 收向球体的肩部（外观由模型替换，这里是碰撞代理，包围盒 = 模型下 40%） */
const baseShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: BR - 0.8, h: 3, at: [0, 1.5, 0], fill: 'shade' },
    { type: 'cylinder', r: BR, h: 22, at: [0, 14, 0] },
    { type: 'cylinder', r: BR, r2: 25.5, h: 22.6, at: [0, 36.3, 0] },
  ],
}
/** 头部球体（原点在球心）：上半球 + 下半截到底座顶沿 + 镜头窗凸出的一层（包围盒 = 模型上 60%） */
const headShape: Shape = {
  type: 'compound',
  items: [
    { type: 'shell', w: 2 * R, l: 2 * R, h: R, base: 0, n: 2 },
    { type: 'shell', w: 2 * R, l: 2 * R, h: LOW, base: 0, n: 2, rot: [180, 0, 0] },
    { type: 'box', size: [36, 12, 1.3], chamfer: 0.4, at: [0, 2, R + 0.65], fill: 'dark' },
  ],
}
/** 内球：头部倒过来、缩小 1.5%，藏在头部里面；头部抬起时从切口露出来。stretch 对齐，不需要镜头窗那一层 */
const K = 0.985
const coreShape: Shape = {
  type: 'compound',
  items: [
    { type: 'shell', w: 2 * R * K, l: 2 * R * K, h: LOW * K, base: 0, n: 2 },
    { type: 'shell', w: 2 * R * K, l: 2 * R * K, h: R * K, base: 0, n: 2, rot: [180, 0, 0] },
  ],
}

/** 喇叭放音区：球面上一圈圈小孔，按朝 +z 生成，零件转 180° 放到背面 */
function grilleShape(): Shape {
  const c = ballDir(-3)
  const t1: Vec3 = [1, 0, 0]
  const t2: Vec3 = [0, -c[2], c[1]]
  const items: Item[] = []
  ;[[0, 1], [6, 6], [12, 12], [18, 18], [24, 24], [30, 30]].forEach(([rho, n], ring) => {
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * 2 * Math.PI + (ring % 2 ? Math.PI / n : 0)
      const a = Math.cos(rho * DEG)
      const b = Math.sin(rho * DEG)
      const d = add(scale(c, a), add(scale(t1, b * Math.cos(phi)), scale(t2, b * Math.sin(phi))))
      items.push({ type: 'hole', w: 1.3, h: 1.3, r: 0.65, at: scale(d, R + 0.3), rot: faceRot(d) })
    }
  })
  return { type: 'compound', items }
}

/** Type-C 插头：原点在插头与外壳交界，插头朝 +x */
const typeC: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [6.6, 2.4, 8.2], chamfer: 0.8, at: [3.3, 0, 0], fill: 'shade', finish: 'steel' },
    { type: 'box', size: [15, 5.6, 11], chamfer: 2, at: [-7.5, 0, 0] },
  ],
}
const usbA: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [12, 4.5, 12], at: [6, 0, 0], fill: 'shade', finish: 'steel' },
    { type: 'box', size: [22, 8, 16], chamfer: 2, at: [-11, 0, 0] },
  ],
}
/** 电源适配器（第 6 页图：国标两扁脚 + USB-A 口）：插脚朝 +x，USB 口在对面（-x） */
const adapterShape: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [10, 6.4, 1.6], at: [5, 0, 6.4], fill: 'shade', finish: 'zinc' },
    { type: 'box', size: [10, 6.4, 1.6], at: [5, 0, -6.4], fill: 'shade', finish: 'zinc' },
    { type: 'box', size: [34, 42, 42], chamfer: 5, at: [-17, 0, 0] },
  ],
}
const stripShape: Shape = {
  type: 'compound',
  items: [
    { type: 'slab', w: 56, d: 200, h: 32, r: 10 },
    ...[-55, -5].map((z): Item => ({ type: 'hole', w: 34, h: 34, r: 10, at: [0, 32.1, z], rot: UP })),
  ],
}
/** microSD 卡（15 × 11 × 0.9）：插入端朝 +x，触点在下面（-y） */
const cardShape: Shape = {
  type: 'compound',
  items: [
    { type: 'box', size: [15, 0.9, 11], chamfer: 0.3, at: [6.5, 0, 0] },
    { type: 'box', size: [2.6, 0.12, 9], at: [12.2, -0.5, 0], fill: 'shade', finish: { color: '#d4a94a', roughness: 0.35, metalness: 0.8 } },
  ],
}
/** 挂墙底座（局部 y = 0 是标箭头、贴天花板的一面，+y 朝凸起）：圆盘 + 两耳（螺钉孔是真开口）+ 中心凸起 */
const mountShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 27, h: 5, at: [0, 2.5, 0] },
    ...[-1, 1].flatMap((s): Item[] => [
      { type: 'box', size: [7.7, 5, 14], at: [s * 28.85, 2.5, 0] },
      { type: 'box', size: [4.7, 5, 14], chamfer: 1, at: [s * 39.65, 2.5, 0] },
      { type: 'box', size: [4.6, 5, 4.7], at: [s * 35, 2.5, 4.65] },
      { type: 'box', size: [4.6, 5, 4.7], at: [s * 35, 2.5, -4.65] },
      { type: 'box', size: [5, 3, 8], chamfer: 0.6, at: [s * 17.5, 9.5, 0] },
    ]),
    { type: 'cylinder', r: 16, h: 6, at: [0, 8, 0] },
  ],
}
/** 塑料膨胀螺母：插入端朝 +x，原点在孔口 */
const anchorShape: Shape = {
  type: 'compound',
  items: [{ type: 'cylinder', r: 3.1, r2: 2.5, h: 28, axis: 'x', at: [14, 0, 0], finish: { color: '#e4dccb', roughness: 0.7 } }],
}
/** 十字螺钉：原点在膨胀螺母孔口，螺钉头在底座耳下面 */
const screwShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 3.6, h: 2.4, axis: 'x', at: [-6.2, 0, 0] },
    { type: 'cylinder', r: 1.7, h: 31, axis: 'x', at: [10.5, 0, 0] },
  ],
}
/** 铅笔：原点在笔尖，笔朝 +x */
const pencilShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 3.5, h: 150, axis: 'x', at: [-93, 0, 0], finish: { color: '#e2b322', roughness: 0.5 } },
    { type: 'cylinder', r: 3.5, r2: 0.6, h: 17, axis: 'x', at: [-9.5, 0, 0], finish: 'wood' },
    { type: 'cylinder', r: 0.6, r2: 0.2, h: 1, axis: 'x', at: [-0.5, 0, 0], fill: 'dark' },
  ],
}
/** 电钻机身（钻头单独一个零件，方便只转钻头）：原点在钻头尖，朝 +x，握把在 -y */
const drillShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 10, r2: 7, h: 26, axis: 'x', at: [-53, 0, 0], fill: 'shade', finish: 'steel' },
    { type: 'box', size: [120, 56, 46], chamfer: 8, at: [-126, 0, 0], finish: { color: '#2d6fb7', roughness: 0.45 } },
    { type: 'box', size: [36, 100, 40], chamfer: 6, at: [-150, -72, 0], fill: 'dark', finish: 'rubber' },
    { type: 'box', size: [64, 26, 60], chamfer: 4, at: [-150, -135, 0], finish: { color: '#2d6fb7', roughness: 0.45 } },
  ],
}
/** 锤子：原点在锤面中心，锤面朝 +y，锤柄沿 -x */
const hammerShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 12, h: 36, at: [0, -18, 0], fill: 'shade', finish: 'steel' },
    { type: 'box', size: [230, 18, 24], chamfer: 5, at: [-125, -18, 0], finish: 'wood' },
  ],
}
/** 十字螺丝刀：原点在刀头，朝 +x */
const driverShape: Shape = {
  type: 'compound',
  items: [
    { type: 'cylinder', r: 2.5, h: 100, axis: 'x', at: [-50, 0, 0], fill: 'shade', finish: 'steel' },
    { type: 'cylinder', r: 14, r2: 12, h: 100, axis: 'x', at: [-150, 0, 0], finish: { color: '#d23b2b', roughness: 0.4 } },
  ],
}
/** 说明书第 7 页的二维码（示意） */
function qrShape(): Shape {
  const items: Item[] = []
  for (const [x, y] of [[-9, 9], [9, 9], [-9, -9]]) {
    items.push({ type: 'hole', w: 7, h: 7, r: 0.3, at: [x, y, 0] })
    items.push({ type: 'hole', w: 5, h: 5, r: 0.2, at: [x, y, 0.03], fill: 'warm' })
    items.push({ type: 'hole', w: 3, h: 3, r: 0.2, at: [x, y, 0.06] })
  }
  const bits = [[-2, 11], [2, 9], [0, 5], [-4, 3], [3, 2], [-1, -1], [5, -3], [9, -1], [11, 3], [7, 5], [-11, 1], [-7, -1], [1, -6], [-3, -9], [4, -9], [9, -7], [12, -11], [6, -12], [-1, -12], [12, 11]]
  for (const [x, y] of bits) items.push({ type: 'hole', w: 2.2, h: 2.2, r: 0.2, at: [x, y, 0] })
  return { type: 'compound', items }
}
const cableEnd = (part: string, len: number) => ({ part, at: [-len, 0, 0] as Vec3, dir: [-1, 0, 0] as Vec3 })

// ---------- 姿态 ----------
/** 手持手机看屏幕（左前方，屏幕略朝上） */
const HOLD: PartState = { parent: null, at: [-190, 130, 230], rot: [75, 0, 0] }
/** 手机在说明书前上方、背面摄像头对着二维码 */
const SCAN: PartState = { parent: null, at: [-225, 125, 255], rot: [38, 0, 0], lift: 30, dur: 1.4 }
/** 翻过来看底部铭牌：底面朝向观众 */
const FLIP: PartState = { parent: null, at: [0, 150, 40], rot: [-117, 0, 0], lift: 20, dur: 1.4 }
const HOME: PartState = { parent: null, at: [0, 0, 0], rot: [0, 0, 0], lift: 20, dur: 1.4 }
/** 工具（世界坐标）：天花板孔位正下方 */
const holeWorld = (i: number, dy: number): Vec3 => [CX + HOLE_X[i], CYL + dy, 0]
const AWAY = (x: number): Vec3 => [CX + x, CYL - 190, 150]

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [10, 40, -10], dir: [0.3, 0.75, 1], dist: 1000 }
const FRONT: CameraSpec = { target: [0, 66, 0], dir: [0.3, 0.22, 1], dist: 340 }
const FRONT_LOW: CameraSpec = { target: [0, 62, 10], dir: [0.3, 0.12, 1], dist: 320 }
const REAR: CameraSpec = { target: [0, 52, -10], dir: [0.45, 0.35, -1], dist: 330 }
const REAR_PLUG: CameraSpec = { target: [10, 36, -60], dir: [0.55, 0.45, -1], dist: 400 }
const SIDE: CameraSpec = { target: [0, 52, -20], dir: [1, 0.45, 0.3], dist: 380 }
const STRIP_VIEW: CameraSpec = { target: [170, 45, -120], dir: [0.55, 0.75, 0.9], dist: 460 }
const PHONE_CAM: CameraSpec = { target: 'phone-screen', offset: [0, 27, -7.3], dir: [0, 0.26, 0.97], dist: 190 }
const SCAN_CAM: CameraSpec = { target: [-225, 65, 205], dir: [1, 0.55, 0.45], dist: 430 }
/** 摄像机 + 左前方手持的手机 */
const DUO: CameraSpec = { target: [-95, 85, 110], dir: [0.15, 0.32, 1], dist: 640 }
const FLIP_VIEW: CameraSpec = { target: [0, 130, 20], dir: [0.25, 0.45, 1], dist: 400 }
const KIT_VIEW: CameraSpec = { target: [330, 200, 40], dir: [0.3, 0.35, 1], dist: 1150 }
const CEIL: CameraSpec = { target: [CX, CYL - 60, 0], dir: [0.3, -0.5, 1], dist: 560 }
const CEIL_FLY: CameraSpec = { target: [CX - 220, 230, 0], dir: [0.25, 0.05, 1], dist: 1100 }
const MOUNTED: CameraSpec = { target: [CX, CYL - 70, 0], dir: [0.35, -0.32, 1], dist: 460 }

const zoomLed = (caption: string) => ({ target: 'led', dir: [0.15, 0.35, 1] as Vec3, dist: 75, caption })

// ---------- 手机界面 ----------
const UI_SCAN: ScreenUI = {
  app: '扫一扫', title: '扫描说明书上的二维码',
  items: [
    { text: '下载并安装米家 APP', state: 'selected' },
    { text: '已安装米家 APP', sub: '直接进入设备连接页', state: 'done' },
    { text: '或在应用商店搜索“米家”', state: 'muted' },
  ],
}
const UI_ADD: ScreenUI = {
  app: '米家', title: '添加设备',
  items: [
    { text: '首页右上角点 “+”', state: 'done' },
    { text: '小米智能摄像机2 云台版', sub: '根据 APP 提示添加', state: 'selected' },
    { text: '网络畅通 · 指示灯橙色快闪', state: 'muted' },
  ],
  button: '下一步', buttonActive: true,
}
const UI_DONE: ScreenUI = {
  app: '米家', title: '添加成功',
  items: [
    { text: '小米智能摄像机2 云台版', sub: '已连接', state: 'done' },
    { text: '指示灯蓝色常亮', sub: '连接成功 / 状态正常', state: 'done' },
  ],
  toast: '连接成功',
}
const UI_LIVE: ScreenUI = {
  app: '小米智能摄像机2 云台版', title: '实时查看',
  items: [
    { text: '清晰度', sub: '可调' },
    { text: '方向', sub: '调整水平 / 垂直角度', state: 'selected' },
    { text: '截图 · 录像' },
    { text: '通话', sub: '远程通话' },
  ],
}
const UI_PLAYBACK: ScreenUI = {
  app: '小米智能摄像机2 云台版', title: '回看',
  items: [
    { text: '红外夜视', sub: '晚上自动切换', state: 'done' },
    { text: '拖动时间轴', sub: '选择要回放的时间段', state: 'selected' },
    { text: '倍速', sub: '快进回放' },
    { text: '需要 microSD 卡或云存储', state: 'muted' },
  ],
}
const UI_GUARD: ScreenUI = {
  app: '小米智能摄像机2 云台版', title: '看家助手',
  items: [
    { text: '看家助手', sub: '已开启', state: 'done' },
    { text: '侦测', sub: '人形 · 移动变化 → 录像推送' },
    { text: '看护时间', sub: '全天 / 白天 / 晚上 / 自定义', state: 'selected' },
    { text: '报警灵敏度 · 报警时间间隔' },
  ],
}
const UI_SHARE: ScreenUI = {
  app: '小米智能摄像机2 云台版', title: '设置 › 设备共享',
  items: [
    { text: '邀请其他人观看', state: 'selected' },
    { text: '被分享者', sub: '下载米家 APP，用小米帐号登录' },
  ],
  button: '共享', buttonActive: true,
}
const UI_FORMAT: ScreenUI = {
  app: '摄像机插件', title: '设置 › 存储设置',
  items: [
    { text: 'microSD 卡', sub: '最大支持 256GB · 仅 FAT32' },
    { text: '格式化成 FAT32', sub: '64GB 及以上的卡可能需要', state: 'selected' },
    { text: '读写速度', sub: '建议不低于 U1 / Class10', state: 'muted' },
  ],
  button: '格式化', buttonActive: true,
}
const UI_READD: ScreenUI = {
  app: '米家', title: '重新添加设备',
  items: [
    { text: '恢复出厂设置成功', sub: '指示灯橙色快闪', state: 'done' },
    { text: '首页右上角 “+”', sub: '按提示连接新网络 / 新帐号', state: 'selected' },
    { text: 'microSD 卡里的内容', sub: '不会被删除', state: 'muted' },
  ],
  toast: '连接成功',
}
const UI_NET: ScreenUI = {
  app: '排查', title: '蓝色闪烁：网络异常',
  items: [
    { text: '摄像机在 Wi-Fi 信号覆盖范围内', state: 'selected' },
    { text: '尽量远离金属及微波炉等' },
    { text: '路由器网络畅通', sub: '2.4GHz / 5GHz Wi-Fi' },
  ],
}
const UI_CALIB: ScreenUI = {
  app: '摄像机插件', title: '设置 › 校准',
  items: [
    { text: '镜头定位不准确', sub: '例如开机后拧动过头部', state: 'muted' },
    { text: '校准', sub: '按 APP 提示进行', state: 'selected' },
  ],
  button: '开始校准', buttonActive: true,
}
const UI_SERVICE: ScreenUI = {
  app: '售后', title: '产品性能故障',
  items: [
    { text: '无法开机 · 指示灯无效' },
    { text: '无法连网 · 无法恢复出厂设置' },
    { text: '签收次日起 7 日内', sub: '可退货 / 换货' },
    { text: '15 日内换货 · 12 个月内保修' },
    { text: '服务电话 950816', sub: 'www.mi.com/service', state: 'selected' },
  ],
}

// ---------- 零件 ----------
const parts: SpecPart[] = [
  // 摄像机：底座 → 内球 → 头部
  {
    id: 'cam', name: '小米智能摄像机2 云台版', spec: '119 × 78 × 78 mm · 约 281 g', shape: baseShape,
    model: { src: GLB, rot: [0, -90, 0], crop: { max: [1, CROP, 1] } },
  },
  {
    id: 'core', name: '头部内球', spec: '头部抬起时填住底座里的部分', parent: 'cam', shape: coreShape, at: [0, CY, 0],
    model: { src: GLB, rot: [180, -90, 0], fit: 'stretch', crop: { max: [1, 1 - CROP, 1] } },
  },
  {
    id: 'head', name: '云台头部（镜头）', spec: '水平 355° · 上下 60°（官网 FAQ）', parent: 'core', shape: headShape,
    model: { src: GLB, rot: [0, -90, 0], crop: { min: [0, CROP, 0] } },
  },
  { id: 'led', name: '指示灯', spec: '蓝 / 橙', parent: 'head', shape: { type: 'led', r: 1.3, color: BLUE }, at: scale(LED_N, R + 1.6), rot: faceRot(LED_N) },
  { id: 'mic', name: '麦克风孔', parent: 'head', shape: { type: 'hole', w: 1.8, h: 1.8, r: 0.9 }, at: scale(MIC_N, R + 1.4), rot: faceRot(MIC_N) },
  { id: 'sd-slot', name: 'microSD 卡槽', spec: '镜头向上时可见 · 最大 256GB', parent: 'head', shape: { type: 'hole', w: 12, h: 1.8, r: 0.8 }, at: scale(SD_N, R + 0.35), rot: faceRot(SD_N), visible: false },
  { id: 'grille', name: '喇叭放音区', parent: 'head', shape: grilleShape(), rot: BACK },
  { id: 'reset', name: '重置键', spec: '长按约 3 秒恢复出厂设置', parent: 'cam', shape: { type: 'slab', w: 8.8, d: 2.8, h: 0.9, r: 1.4 }, at: [0, 12, -(BR + 0.15)], rot: [-90, 0, 0] },
  { id: 'port-c', name: 'Type-C 电源接口', spec: '5V⎓1A', parent: 'cam', shape: { type: 'hole', w: 8.4, h: 2.8, r: 1.3 }, at: [0, 5.5, -(BR + 0.3)], rot: BACK },
  { id: 'plate', name: '底部铭牌', parent: 'cam', shape: { type: 'hole', w: 44, h: 24, r: 2 }, at: [0, -0.06, 0], rot: DOWN, fill: 'white' },
  { id: 'plate-name', name: '铭牌 · 产品名称', parent: 'cam', shape: { type: 'text', text: '小米智能摄像机2 云台版', size: 3 }, at: [0, -0.1, 5], rot: DOWN },
  { id: 'plate-spec', name: '铭牌 · 型号与输入', parent: 'cam', shape: { type: 'text', text: 'MJSXJ17CM  5V⎓1A', size: 2.6 }, at: [0, -0.1, -4], rot: DOWN },

  // 电源：插线板 + 适配器 + USB-A ↔ Type-C 电源连接线
  { id: 'strip', name: '电源插座（插线板）', spec: '场景道具', shape: stripShape, at: STRIP_AT },
  { id: 'socket', name: '插座插孔', parent: 'strip', shape: { type: 'hole', w: 34, h: 34, r: 10 }, at: [0, 32.1, 45], rot: UP },
  { id: 'adapter', name: '电源适配器', spec: '5V⎓1A 输出 · USB-A 口', shape: adapterShape, at: [118, 21, -112] },
  { id: 'adapter-usb', name: '适配器 USB 口', parent: 'adapter', shape: { type: 'hole', w: 12.4, h: 4.8, r: 0.6 }, at: [-34.1, 0, 0], rot: [0, -90, 0] },
  { id: 'usb-a', name: '电源连接线 · USB-A 端', shape: usbA, at: [150, 4, -40] },
  { id: 'usb-c', name: '电源连接线 · Type-C 端', shape: typeC, at: [0, 2.8, -120], rot: TO_PLUS_Z },
  { id: 'cable', name: '电源连接线', spec: 'USB-A ↔ Type-C', shape: { type: 'cable', from: cableEnd('usb-a', 22), to: cableEnd('usb-c', 15), r: 1.6, slack: 1 } },

  // microSD 卡（自备）
  { id: 'card', name: 'microSD 卡', spec: '自备 · 最大 256GB · FAT32 · U1/Class10 以上', shape: cardShape, at: [95, 0.45, 120], rot: [0, 25, 0], fill: 'dark', finish: { color: '#25282e', roughness: 0.5 }, visible: false },

  // 手机
  { id: 'phone', name: '手机', spec: '安装米家 APP', shape: { type: 'slab', w: 74, d: 160, h: 8.2, r: 10 }, at: HOLD.at as Vec3, rot: HOLD.rot, finish: { color: '#1f2228', roughness: 0.35, metalness: 0.3 }, visible: false },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 68, h: 150 }, at: [0, 8.25, 0], rot: UP },

  // 说明书（第 7 页有米家 APP 二维码）
  { id: 'booklet', name: '说明书', shape: { type: 'slab', w: 105, d: 148, h: 1.6, r: 2 }, at: [-230, 0, 140], rot: [0, 14, 0], fill: 'warm', visible: false },
  { id: 'booklet-title', name: '使用说明书', parent: 'booklet', shape: { type: 'text', text: '使用说明书', size: 8 }, at: [0, 1.65, -48], rot: UP },
  { id: 'booklet-qr', name: '米家 APP 二维码', parent: 'booklet', shape: qrShape(), at: [0, 1.65, 20], rot: UP },

  // 吸顶安装：天花板（砖墙块）+ 标记 + 钻孔
  { id: 'ceiling', name: '天花板 / 墙体', spec: '需能承受摄像机总重量 3 倍以上', shape: { type: 'box', size: [420, 80, 320] }, at: [CX, CYL + 40, 0], finish: 'wall', visible: false },
  ...HOLE_X.flatMap((x, i): SpecPart[] => [
    { id: `mark-${i + 1}`, name: `铅笔标记 ${i + 1}`, parent: 'ceiling', shape: { type: 'hole', w: 4, h: 4, r: 2 }, at: [x, -40.08, 0], rot: DOWN, visible: false },
    { id: `bore-${i + 1}`, name: `安装孔 ${i + 1}`, spec: 'Ø6 mm · 深 30 mm', parent: 'ceiling', shape: { type: 'hole', w: 6, h: 6, r: 3 }, at: [x, -40.12, 0], rot: DOWN, visible: false },
  ]),
  // 膨胀螺母 / 螺钉：一开始就「插」在各自孔口外（隐藏），出场时沿孔推进
  ...HOLE_X.flatMap((_, i): SpecPart[] => [
    { id: `anchor-${i + 1}`, name: `塑料膨胀螺母 ${i + 1}`, spec: 'Ø6 × 28 mm（推断）', shape: anchorShape, visible: false },
    { id: `anchor-${i + 1}-mouth`, name: `膨胀螺母 ${i + 1} 孔口`, parent: `anchor-${i + 1}`, shape: { type: 'hole', w: 3, h: 3, r: 1.5 }, at: [-0.05, 0, 0], rot: [0, -90, 0] },
    { id: `screw-${i + 1}`, name: `螺钉 ${i + 1}`, spec: '十字槽 · Ø3.4 × 31 mm（推断）', shape: screwShape, finish: 'zinc', visible: false },
  ]),
  { id: 'mount', name: '挂墙底座', spec: '标有箭头的一面朝上（贴天花板）', shape: mountShape, at: MOUNT_DESK, rot: [180, 0, 0] },
  { id: 'mount-arrow', name: '底座箭头', parent: 'mount', shape: { type: 'text', text: '↑', size: 10 }, at: [0, -0.05, 12], rot: DOWN },

  // 工具（场景道具）
  { id: 'pencil', name: '铅笔', shape: pencilShape, at: AWAY(-35), rot: POINT_UP, visible: false },
  { id: 'drill', name: '电钻', spec: 'Ø6 mm 钻头', shape: drillShape, at: AWAY(35), rot: POINT_UP, visible: false },
  { id: 'drill-bit', name: '钻头', spec: 'Ø6 mm', parent: 'drill', shape: { type: 'compound', items: [{ type: 'cylinder', r: 3, h: 40, axis: 'x', at: [-20, 0, 0] }] }, fill: 'shade', finish: 'steel' },
  { id: 'hammer', name: '锤子', shape: hammerShape, at: AWAY(35), rot: [0, 90, 0], visible: false },
  { id: 'driver', name: '十字螺丝刀', shape: driverShape, at: AWAY(35), rot: POINT_UP, visible: false },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
/** 工具用完原地消失 */
const vanish = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false, dur: 0.1 }]))

/** 线路已接好：适配器在插座、USB-A 在适配器、Type-C 在摄像机背部 */
const CONNECTED: Record<string, PartState> = {
  adapter: { plug: 'socket' },
  'usb-a': { plug: 'adapter-usb' },
  'usb-c': { plug: 'port-c' },
}
const RUNNING: Record<string, PartState> = { ...CONNECTED, led: { light: 'on', color: BLUE } }

export const xiaomiCameraC400: ManualSpec = {
  id: 'xiaomi-camera-c400',
  name: '小米智能摄像机2 云台版（海外版 C400）',
  desc: '2.5K 云台摄像机 · 水平 / 垂直转动 · 红外夜视 · microSD 卡 · 米家 APP',
  category: '智能摄像头',
  dims: { width: 78, depth: 78, height: H },
  source: {
    title: '小米智能摄像机2 云台版使用说明书',
    url: 'https://cdn.cnbj1.fds.api.mi-img.com/iotweb-product-center/37371fe4fed2fac6cf865b046bab5abc_1789367236107.pdf',
    images: [],
  },
  package: [
    { name: '小米智能摄像机2 云台版', qty: 1, spec: '型号 MJSXJ17CM' },
    { name: '电源适配器', qty: 1, spec: 'USB-A 输出' },
    { name: '电源连接线', qty: 1, spec: 'USB-A ↔ Type-C' },
    { name: '挂墙配件包', qty: 1, spec: '挂墙底座、塑料膨胀螺母 ×2、螺钉 ×2' },
    { name: '说明书', qty: 1 },
  ],
  params: [
    { label: '产品型号', value: 'MJSXJ17CM', note: '产品名称：智能摄像机；海外版名 Xiaomi Smart Camera C400' },
    { label: '分辨率', value: '2560 × 1440' },
    { label: '电源输入', value: '5V⎓1A', note: 'Type-C 接口，请使用原装电源适配器' },
    { label: '无线连接', value: 'Wi-Fi 2.4GHz / 5GHz', note: 'IEEE 802.11a/b/g/n' },
    { label: '存储', value: 'microSD 卡', note: '最大 256GB，仅支持 FAT32' },
    { label: '工作温度', value: '-10℃ ~ 45℃' },
    { label: '产品尺寸', value: '119 × 78 × 78 mm', note: '净重约 281 g' },
    { label: '服务电话', value: '950816', note: 'www.mi.com/service' },
    { label: '说明书页码', value: 'PDF 共 14 页', note: '脚本页码 = PDF 页码 = 印刷页码 + 1' },
  ],
  parts,
  initial: {
    'anchor-1': { plug: { hole: 'bore-1', depth: -34 } },
    'anchor-2': { plug: { hole: 'bore-2', depth: -34 } },
    'screw-1': { plug: { hole: 'anchor-1-mouth', depth: -40 } },
    'screw-2': { plug: { hole: 'anchor-2-mouth', depth: -40 } },
  },
  stageSize: 1700,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ---------------------------------------------------------------- 认识与摆放
    {
      id: 'intro', title: '开箱：认识摄像机', kind: 'usage',
      start: show('booklet'),
      steps: [
        {
          id: 'unbox', title: '清点包装', page: 2,
          desc: '包装内有：小米智能摄像机2 云台版、电源适配器、电源连接线、挂墙配件包、说明书各 1 件。',
          camera: OVERVIEW, orbit: true,
          callouts: [
            { part: 'cam', text: '摄像机 ×1', at: [0, H, 0], offset: [-50, 50, 0] },
            { part: 'adapter', text: '电源适配器 ×1', offset: [30, 70, 0] },
            { part: 'usb-a', text: '电源连接线 ×1', sub: 'USB-A ↔ Type-C', offset: [60, 40, 30] },
            { part: 'mount', text: '挂墙配件包 ×1', sub: '底座 · 膨胀螺母 · 螺钉', offset: [40, 60, 20] },
            { part: 'booklet', text: '说明书 ×1', offset: [40, 70, 0] },
          ],
          chips: [{ label: '包装清单', sub: '5 项' }],
        },
        {
          id: 'front', title: '认识正面', page: 2,
          desc: '头部球体正面的黑色窗口里：镜头在中间，上方小圆点是指示灯，下方小孔是麦克风孔。microSD 卡槽在镜头窗口下沿，平放时藏在底座里，把镜头拨向上才看得到。',
          camera: FRONT,
          set: { booklet: { visible: false } },
          highlight: ['head', 'led', 'mic'],
          zoom: { target: 'head', offset: [0, 3, 40], dir: [0.15, 0.2, 1], dist: 120, caption: '指示灯 · 镜头 · 麦克风孔' },
          callouts: [
            { part: 'led', text: '指示灯', offset: [-55, 28, 0] },
            { part: 'head', text: '镜头', at: [0, 1, R + 1.5], offset: [-62, 2, 0] },
            { part: 'mic', text: '麦克风孔', offset: [-58, -20, 0] },
            { part: 'head', text: 'microSD 卡槽', sub: '镜头向上时可见', at: scale(SD_N, R), offset: [-40, -40, 0] },
          ],
        },
        {
          id: 'back', title: '认识背面', page: 2,
          desc: '头部背面的圆形孔阵是喇叭放音区。底座背面上方的长圆形按键是重置键，下面是 Type-C 电源接口。',
          camera: REAR,
          highlight: ['grille', 'reset', 'port-c'],
          zoom: { target: 'reset', offset: [0, -3, 0], dir: [0.2, 0.25, -1], dist: 80, caption: '重置键在上 · Type-C 电源接口在下' },
          callouts: [
            { part: 'grille', text: '喇叭放音区', at: scale(ballDir(-3), R), offset: [55, 45, 0] },
            { part: 'reset', text: '重置键', offset: [-60, 18, 0] },
            { part: 'port-c', text: 'Type-C 电源接口', offset: [-65, -2, 0] },
          ],
        },
        {
          id: 'plate', title: '底部铭牌', page: 2,
          desc: '铭牌标识在摄像机本体底部，印着产品名称、型号 MJSXJ17CM 和电源输入 5V⎓1A。把摄像机翻过来就能看到。',
          camera: FLIP_VIEW,
          set: { cam: FLIP },
          highlight: ['plate'],
          zoom: { target: 'plate', dir: [0.05, 0.45, 0.9], dist: 110, caption: '铭牌在本体底部' },
          chips: [
            { label: '型号', sub: 'MJSXJ17CM' },
            { label: '输入', sub: '5V⎓1A' },
            { label: '尺寸', sub: '119 × 78 × 78 mm' },
          ],
        },
        {
          id: 'place', title: '摆放在平稳的桌面', page: 3,
          desc: '可以把摄像机摆放在写字台、餐桌、茶几等平面上，也可以固定安装在墙体上（见「吸顶 / 挂墙安装」）。',
          camera: { target: [0, 60, 0], dir: [0.35, 0.4, 1], dist: 520 },
          set: { cam: HOME },
          highlight: ['cam'],
          chips: [{ label: '工作温度', sub: '-10℃ ~ 45℃' }],
          tip: '第 11 页：镜头正面和侧面别靠近玻璃、白墙等反光物体，否则画面近处亮、远处暗或者发白；放在 Wi-Fi 信号覆盖范围内，尽量远离金属和微波炉；不要在过度潮湿或可能进水的地方使用。',
        },
      ],
    },

    // ---------------------------------------------------------------- 吸顶 / 挂墙安装
    {
      id: 'mount', title: '吸顶 / 挂墙安装', kind: 'assembly',
      start: show('ceiling'),
      steps: [
        {
          id: 'kit', title: '准备：挂墙配件和工具', page: 3,
          desc: '挂墙配件包里有挂墙底座、两个塑料膨胀螺母和两颗螺钉；另备铅笔、电钻（Ø6 mm 钻头）、锤子和十字螺丝刀。底座一面标有箭头，安装时这一面朝上、贴着天花板。',
          camera: KIT_VIEW,
          highlight: ['mount'],
          zoom: { target: 'mount-arrow', dir: [0.1, 1, 0.35], dist: 110, caption: '底座标有箭头的一面' },
          callouts: [
            { part: 'mount', text: '挂墙底座', offset: [-40, 60, 20] },
            { part: 'ceiling', text: '天花板 / 墙体', at: [-150, -40, 160], offset: [-60, -40, 0] },
          ],
          tip: '第 4 页：安装墙面至少要能承受摄像机总重量的 3 倍以上。',
        },
        {
          id: 'mark', title: '按底座孔距画标记', page: 3,
          desc: '先用铅笔在墙体上按照基座孔距做好两个标记。',
          camera: CEIL,
          set: {
            pencil: { plug: { hole: 'mark-1', back: 60 }, visible: true, dur: 1.4 },
            'mark-1': { visible: true, delay: 1.2 },
            'mark-2': { visible: true, delay: 1.2 },
          },
          highlight: ['mark-1', 'mark-2', 'pencil'],
          zoom: { target: 'mark-1', dir: [0.3, -1, 0.5], dist: 90, caption: '两个标记的间距 = 底座两孔的间距' },
          chips: [{ label: '孔距', sub: '约 70 mm（推断）' }],
        },
        {
          id: 'drill', title: '钻两个孔：Ø6 mm，深 30 mm', page: 3,
          desc: '用钻孔工具在两个标记处各打一个孔，钻孔直径约 6 mm，孔深约 30 mm。',
          camera: CEIL,
          set: {
            ...vanish('pencil', 'mark-1', 'mark-2'),
            'bore-1': { visible: true },
            'bore-2': { visible: true, delay: 1.2 },
            drill: { plug: { hole: 'bore-2', back: 60, roll: 180 }, visible: true, dur: 1.4 },
          },
          highlight: ['bore-1', 'bore-2', 'drill'],
          actions: [{ type: 'spin', part: 'drill-bit', axis: 'x' }],
          zoom: { target: 'bore-1', dir: [0.3, -1, 0.5], dist: 100, caption: '孔径约 6 mm · 孔深约 30 mm' },
          chips: [
            { label: '孔径', sub: '约 6 mm' },
            { label: '孔深', sub: '约 30 mm' },
          ],
        },
        {
          id: 'anchor', title: '钉入塑料膨胀螺母', page: 3,
          desc: '将两个塑料膨胀螺母钉入打好的孔中，用锤子敲到和墙面齐平。',
          camera: CEIL,
          set: {
            ...vanish('drill'),
            'anchor-1': { plug: { hole: 'bore-1', back: 0 }, visible: true, delay: 0.2, dur: 0.9 },
            'anchor-2': { plug: { hole: 'bore-2', back: 0 }, visible: true, delay: 0.2, dur: 0.9 },
            hammer: { at: holeWorld(1, -0.3), visible: true, delay: 0.6, dur: 1 },
          },
          highlight: ['anchor-1', 'hammer'],
          actions: [{ type: 'shake', part: 'hammer', axis: 'y', amp: 2.5 }],
          zoom: { target: 'anchor-1-mouth', dir: [0.3, -1, 0.5], dist: 80, caption: '膨胀螺母敲到与墙面齐平' },
        },
        {
          id: 'base', title: '箭头面朝上，拧紧底座', page: 4,
          desc: '将底座标有箭头的一面向上，底座的孔对准墙面的孔放置，将螺钉穿过底座孔，用十字螺丝刀拧入墙上的膨胀螺母中。',
          camera: CEIL,
          set: {
            ...vanish('hammer'),
            mount: { parent: 'ceiling', at: [0, -40, 0], rot: [180, 0, 0], via: [CX, CYL - 120, 30], dur: 1.2 },
            'screw-1': { plug: { hole: 'anchor-1-mouth', back: 0 }, visible: true, delay: 1.3, dur: 1 },
            'screw-2': { plug: { hole: 'anchor-2-mouth', back: 0 }, visible: true, delay: 1.3, dur: 1 },
            driver: { at: holeWorld(1, -7.45), visible: true, delay: 1.8, dur: 0.9 },
          },
          highlight: ['mount', 'screw-1', 'screw-2'],
          actions: [{ type: 'spin', part: 'driver', axis: 'x' }],
          zoom: { target: [CX + 35, CYL - 8, 0], dir: [0.3, -0.8, 0.7], dist: 120, caption: '螺钉穿过底座孔，拧进膨胀螺母' },
          chips: [{ label: '工具', sub: '十字螺丝刀' }],
        },
        {
          id: 'hang', title: '凹槽对准凸起，扣上摄像机', page: 4,
          desc: '把摄像机倒过来举到底座下，让摄像机底部的凹槽对准底座上凸起的部分，向上安装扣合。',
          camera: CEIL_FLY,
          set: {
            ...vanish('driver'),
            cam: { parent: 'mount', at: [0, HANG_Y, 0], rot: [0, 210, 0], via: [CX - 40, CYL - 330, 60], lift: 60, delay: 0.2, dur: 1.8 },
          },
          highlight: ['cam'],
          zoom: { target: [CX, CYL - 10, 0], dir: [0.4, -0.45, 1], dist: 160, caption: '底部凹槽对准底座凸起' },
        },
        {
          id: 'lock', title: '顺时针旋转锁定', page: 4,
          desc: '扣合后顺时针旋转摄像机，直至锁定到位。',
          camera: MOUNTED,
          set: { cam: { rot: [0, 180, 0], dur: 1.4 } },
          highlight: ['cam', 'mount'],
          chips: [{ label: '方向', sub: '从下往上看顺时针' }],
          tip: '警告：为防止伤害，必须按安装说明把设备牢固地固定在天花板或墙壁上。倒装后画面是倒的，可在米家 APP 的画面设置里把画面旋转 180°（小米官网 FAQ）。',
        },
      ],
    },

    // ---------------------------------------------------------------- microSD 卡
    {
      id: 'sd', title: '安装 microSD 卡', kind: 'usage',
      start: { ...RUNNING, card: { visible: true } },
      steps: [
        {
          id: 'off', title: '先切断电源', page: 5,
          desc: '安装或取出 microSD 卡之前，先切断摄像机电源：把 Type-C 电源连接线从摄像机背部拔下，指示灯熄灭。',
          camera: REAR_PLUG,
          set: {
            'usb-c': { parent: null, at: [0, 2.8, -120], rot: TO_PLUS_Z, dur: 1.2 },
            led: { light: 'off', delay: 0.6 },
          },
          highlight: ['usb-c', 'port-c'],
          zoom: { target: 'port-c', dir: [0.3, 0.3, -1], dist: 80, caption: '拔掉 Type-C 电源线' },
        },
        {
          id: 'tilt', title: '拨动镜头向上，露出卡槽', page: 5,
          desc: '确保摄像机处于断电状态，用手拨动镜头使其向上，露出头部下沿的 microSD 卡槽。',
          camera: FRONT_LOW,
          set: { head: { rot: [-45, 0, 0], dur: 1.6 }, 'sd-slot': { visible: true } },
          highlight: ['head', 'sd-slot'],
          zoom: { target: 'sd-slot', dir: [0.1, 0.1, 1], dist: 75, caption: 'microSD 卡槽（镜头向上时可见）' },
        },
        {
          id: 'insert', title: '触点朝下插入 microSD 卡', page: 5,
          desc: '将 microSD 卡有触点的一面朝下，插入卡槽。',
          camera: FRONT_LOW,
          set: { card: { plug: { hole: 'sd-slot', back: 40 }, lift: 30, dur: 1.6 } },
          highlight: ['card', 'sd-slot'],
          zoom: { target: 'sd-slot', dir: [0.15, 0.3, 1], dist: 80, caption: '有触点的一面朝下' },
        },
        {
          id: 'format', title: '卡的容量与格式', page: 5,
          desc: '请使用正规厂商生产的 microSD 卡：最大支持 256GB、仅支持 FAT32 格式。64GB 及以上的卡可能要先在米家 APP 的摄像机插件里，进入「设置 › 存储设置」格式化成 FAT32 才能使用。',
          camera: PHONE_CAM,
          set: { phone: { ...HOLD, visible: true }, 'phone-screen': { ui: UI_FORMAT, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [
            { label: '容量', sub: '最大 256GB' },
            { label: '格式', sub: '仅 FAT32' },
            { label: '速度', sub: '不低于 U1 / Class10' },
          ],
        },
        {
          id: 'restore', title: '镜头放平，重新通电', page: 5,
          desc: '把镜头拨回水平，再把 Type-C 电源连接线插回背部接口，摄像机自动开机。开机后不要再拧动头部；指示灯蓝色常亮表示状态正常。',
          camera: SIDE,
          set: {
            phone: { visible: false },
            head: { rot: [0, 0, 0], dur: 1.4 },
            'usb-c': { plug: { hole: 'port-c', back: 40 }, delay: 1.3, dur: 1.2 },
            led: { light: 'on', color: BLUE, delay: 2.8 },
          },
          highlight: ['head', 'usb-c', 'led'],
          zoom: zoomLed('蓝色常亮 = 状态正常'),
          tip: '第 6 页：开机后请勿拧动摄像机的头部强制其旋转。',
        },
      ],
    },

    // ---------------------------------------------------------------- 通电与米家 APP
    {
      id: 'app', title: '通电与连接米家 APP', kind: 'usage',
      start: show('booklet'),
      steps: [
        {
          id: 'adapter', title: '连接线插上适配器，适配器插上插座', page: 6,
          desc: '把电源适配器插到电源插座上，再把电源连接线的 USB-A 端插进适配器。',
          camera: STRIP_VIEW,
          set: {
            adapter: { plug: { hole: 'socket', back: 50 }, lift: 40, dur: 1.4 },
            'usb-a': { plug: { hole: 'adapter-usb', back: 40 }, lift: 30, delay: 1.3, dur: 1.4 },
          },
          highlight: ['adapter', 'usb-a', 'strip'],
          chips: [{ label: '电源', sub: '请使用原装电源适配器' }],
        },
        {
          id: 'typec', title: 'Type-C 插入背部，自动开机', page: 6,
          desc: '将电源连接线的 Type-C 端插入摄像机背部的 Type-C 电源接口，摄像机自动开机，指示灯橙色快闪。',
          camera: REAR_PLUG,
          set: {
            'usb-c': { plug: { hole: 'port-c', back: 40 }, dur: 1.4 },
            led: { light: 'blink', color: ORANGE, delay: 1.6 },
          },
          highlight: ['usb-c', 'led'],
          zoom: zoomLed('橙色快闪 = 等待连接'),
          chips: [{ label: '输入', sub: '5V⎓1A' }],
        },
        {
          id: 'led', title: '看懂指示灯', page: 6,
          desc: '蓝色常亮：连接成功 / 状态正常；蓝色闪烁：网络异常；橙色快闪：等待连接；橙色慢闪：正在升级。现在是橙色快闪，可以开始连接米家 APP。',
          camera: FRONT,
          highlight: ['led'],
          zoom: zoomLed('橙色快闪 = 等待连接'),
          callouts: [{ part: 'led', text: '指示灯', sub: '橙色快闪', offset: [-70, 25, 0] }],
          chips: [
            { label: '蓝色常亮', sub: '连接成功' },
            { label: '蓝色闪烁', sub: '网络异常' },
            { label: '橙色快闪', sub: '等待连接' },
            { label: '橙色慢闪', sub: '正在升级' },
          ],
          tip: '开机后请勿拧动摄像机的头部强制其旋转；镜头定位不准确时可以在米家 APP 里校准。动画里快闪、慢闪都用同一种闪烁示意。',
        },
        {
          id: 'download', title: '扫码下载米家 APP', page: 7,
          desc: '用手机扫描说明书上的二维码，下载并安装米家 APP；已经装过米家 APP 的会直接进入设备连接页。也可以在应用商店搜索「米家」下载安装。',
          camera: SCAN_CAM,
          set: { phone: { ...SCAN, visible: true }, 'phone-screen': { ui: UI_SCAN, delay: 0.4 } },
          highlight: ['phone-screen', 'booklet-qr'],
          callouts: [{ part: 'booklet-qr', text: '说明书上的二维码', offset: [-80, 10, 40] }],
        },
        {
          id: 'add', title: '首页右上角「+」添加设备', page: 7,
          desc: '打开米家 APP 首页，在右上角点击「+」，根据 APP 提示添加设备。连接时要保证网络畅通，摄像机正常开启、指示灯橙色快闪。',
          camera: PHONE_CAM,
          set: { phone: { ...HOLD, dur: 1.4 }, 'phone-screen': { ui: UI_ADD, delay: 0.4 } },
          highlight: ['phone-screen'],
          zoom: zoomLed('橙色快闪 = 等待连接'),
          tip: '米家 APP 会升级与更新，实际操作可能与说明书描述略有差异，请按当前 APP 内的指引操作。',
        },
        {
          id: 'done', title: '连接成功：蓝色常亮', page: 7,
          desc: '按 APP 提示完成连接。连接成功后，指示灯变为蓝色常亮。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: UI_DONE, delay: 0.3 }, led: { light: 'on', color: BLUE, delay: 1.2 } },
          highlight: ['phone-screen'],
          zoom: zoomLed('蓝色常亮 = 连接成功'),
        },
        {
          id: 'live', title: '实时查看：转动云台', page: 8,
          desc: '在米家 APP 的摄像机控制界面里可以实时查看监控画面，调整清晰度、水平和垂直角度，截取和录制画面，还可以远程通话。拖动方向键，云台跟着转动。',
          camera: DUO,
          set: { 'phone-screen': { ui: UI_LIVE, delay: 0.3 }, head: { rot: [0, -40, 0], delay: 0.6, dur: 1.8 } },
          highlight: ['head', 'phone-screen'],
          callouts: [{ part: 'head', text: '云台水平转动', sub: '水平 355°（官网 FAQ）', at: [0, R, 0], offset: [-20, 55, 0] }],
        },
        {
          id: 'playback', title: '红外夜视与历史回放', page: 8,
          desc: '摄像机会根据周围光线，晚上自动切换到红外夜视。装了兼容的 microSD 卡或购买云存储后，在控制界面点「回看」，拖动时间轴选择时间段，还能倍速快进回放。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: UI_PLAYBACK, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [{ label: '回放', sub: '需 microSD 卡或云存储' }],
        },
        {
          id: 'guard', title: '自动看护：看家助手', page: 9,
          desc: '开启看家助手后，摄像机会侦测视角内的人形和移动变化，录下视频推送到 APP。可以设置全天、白天或晚上看护，也可以自定义看护时间、报警灵敏度和报警时间间隔。',
          camera: DUO,
          set: { 'phone-screen': { ui: UI_GUARD, delay: 0.3 }, head: { rot: [0, 35, 0], delay: 0.5, dur: 2.2 } },
          highlight: ['head', 'phone-screen'],
        },
        {
          id: 'share', title: '共享给家人', page: 10,
          desc: '在控制界面的设置菜单里选「设备共享」，可以邀请其他人观看。被分享者需要下载米家 APP，并用小米帐号登录。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: UI_SHARE, delay: 0.3 }, head: { rot: [0, 0, 0], dur: 1.6 } },
          highlight: ['phone-screen'],
        },
      ],
    },

    // ---------------------------------------------------------------- 恢复出厂与指示灯排查
    {
      id: 'reset', title: '恢复出厂设置与指示灯排查', kind: 'repair',
      start: RUNNING,
      steps: [
        {
          id: 'when', title: '换网络或换帐号前：找到重置键', page: 7,
          desc: '要更换摄像机连接的网络或米家 APP 帐号时，需要先恢复出厂设置。重置键在底座背面、Type-C 接口上方。',
          camera: REAR,
          highlight: ['reset'],
          zoom: { target: 'reset', dir: [0.2, 0.25, -1], dist: 75, caption: '重置键' },
        },
        {
          id: 'hold', title: '长按重置键约 3 秒', page: 7,
          desc: '长按重置键 3 秒左右，直到指示灯橙色快闪，摄像机就恢复出厂设置成功了。',
          camera: REAR,
          set: { led: { light: 'blink', color: ORANGE, delay: 3 } },
          highlight: ['reset', 'led'],
          actions: [{ type: 'press', part: 'reset', depth: 0.8 }],
          zoom: zoomLed('松手时机：指示灯橙色快闪'),
          chips: [{ label: '长按', sub: '约 3 秒' }],
        },
        {
          id: 'readd', title: '重新连接米家 APP', page: 7,
          desc: '恢复出厂设置后，重新在米家 APP 首页右上角点「+」连接摄像机，连接成功后指示灯蓝色常亮。',
          camera: PHONE_CAM,
          set: { phone: { visible: true }, 'phone-screen': { ui: UI_READD, delay: 0.3 }, led: { light: 'on', color: BLUE, delay: 2.2 } },
          highlight: ['phone-screen'],
          zoom: zoomLed('连接成功 → 蓝色常亮'),
          tip: '恢复出厂设置不会删除 microSD 卡中的内容。',
        },
        {
          id: 'net', title: '蓝色闪烁：网络异常', page: 6,
          desc: '指示灯蓝色闪烁表示网络异常。确认摄像机装在 Wi-Fi 信号覆盖的范围内、尽量远离金属和微波炉，路由器网络畅通。',
          camera: DUO,
          set: { 'phone-screen': { ui: UI_NET, delay: 0.3 }, led: { light: 'blink', color: BLUE } },
          highlight: ['led', 'phone-screen'],
          zoom: zoomLed('蓝色闪烁 = 网络异常'),
        },
        {
          id: 'upgrade', title: '橙色慢闪：正在升级', page: 6,
          desc: '指示灯橙色慢闪表示正在升级（比等待连接时的快闪慢），等它完成即可。',
          camera: FRONT,
          set: { phone: { visible: false }, led: { light: 'blink', color: ORANGE } },
          highlight: ['led'],
          zoom: zoomLed('橙色慢闪 = 正在升级'),
        },
        {
          id: 'calib', title: '镜头定位不准：APP 里校准', page: 6,
          desc: '开机后不要拧动头部强制它旋转。如果镜头定位不准确，可以在米家 APP 里校准（摄像机插件的「设置 › 校准」，小米官网 FAQ）。',
          camera: DUO,
          set: { phone: { visible: true }, 'phone-screen': { ui: UI_CALIB, delay: 0.3 }, led: { light: 'on', color: BLUE } },
          highlight: ['head', 'phone-screen'],
          zoom: zoomLed('蓝色常亮 = 状态正常'),
        },
        {
          id: 'service', title: '仍有问题：联系售后', page: 13,
          desc: '通电后无法开机、状态指示灯无效、无法正常连接网络、无法恢复出厂设置等属于产品性能故障。签收次日起 7 日内可退货或换货，15 日内可换货，12 个月内可免费维修。',
          camera: PHONE_CAM,
          set: { 'phone-screen': { ui: UI_SERVICE, delay: 0.3 } },
          highlight: ['phone-screen'],
          chips: [
            { label: '服务电话', sub: '950816' },
            { label: '网址', sub: 'www.mi.com/service' },
          ],
        },
      ],
    },
  ],
}
