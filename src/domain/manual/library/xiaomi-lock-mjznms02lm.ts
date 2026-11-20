import type { CameraSpec, Fill, ManualSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 小米智能门锁（标准锁体版，MJZNMS02LM 一代 / MJZNMS03LM 二代，米家 lumi.lock.mcn01）
 * 说明书 8 页：P2 前面板，P3 后面板，P4 安装须专业人员 + 电池 / 重置 + 米家，P5 日常使用，P6 本地设置 + 参数。
 * 说明书没有锁体 / 面板的安装步骤（P4 只写「请务必聘请专业人员进行安装」），安装指南按 6068 标准锁体的通用装法演示，
 * 门厚、导向片、锁体类型等数值来自官方安装须知网页（manuals-src/xiaomi-lock-mjznms02lm/notes.md）。
 *
 * 场景：只建一段门（宽 600、高 900、厚 60）+ 门框立柱。毫米，Y 向上，地面 y = 0。
 *   门外（前面板）朝 +z，门内（后面板）朝 -z；锁边（门边）在 x = 0，合页在 x = 600 的门内侧（从门外看合页在右 = 右内开）。
 *   门绕合页转：门零件原点在合页 [600, 0, -30]，开门 rot y 为负（门边往 -z 走）。
 *   门边在锁体周围开了一个贯穿的剖切窗口（x 0–100、y 362–582），方便看锁体、方钢、锁芯和线束。
 * 锁体局部：原点在门边（导向片内侧面）把手轴高度，+x 指向门里；6068：方孔距门边 60、锁芯孔在方孔下 68。
 * 前面板局部：原点在把手轴、贴门的背面，面朝 +z；后面板绕 y 转 180°，局部 +z 朝门内，局部 +x = 从室内看的右手边。
 *
 * 推断（说明书未给出）：门厚 60；导向片 240 × 24；锁体盒 80 × 205 × 16；斜舌伸出 12、方舌伸出 18；
 * 方钢 8 × 8、裁切后 84（原长 100）；锁芯长 80；后面板厚 34；线束接口、对拉螺丝、锁芯固定螺丝的位置；
 * 电池盖：说明书 P3 是整块后壳从面板底边掀开，这里简化成盖住电池仓和按键的上半块；灯色（灯圈「白色」用浅蓝示意）。
 * 面板上键位、灯、钥匙孔盖板、反锁旋钮等位置按 P2 / P3 图纸比例量取（约 0.59 mm/px）。
 */

// ---------- 尺寸 ----------
const H = 520
/** 门关着时的世界坐标 → 门的局部坐标 */
const D = (x: number, y: number, z: number): Vec3 => [x - 600, y, z + 30]

const LATCH_OUT: Vec3 = [0, 25, 0]
const LATCH_IN: Vec3 = [12, 25, 0]
const BOLTS_OUT: Vec3 = [0, 0, 0]
const BOLTS_IN: Vec3 = [18, 0, 0]
const DOOR_OPEN: Vec3 = [0, -25, 0]
/** 后面板局部：取下的电池盖放在面板旁边 */
const COVER_ASIDE: Vec3 = [100, 30, 70]
const BATT_HOLD: Vec3 = [0, 0, 60]
const PHONE_OUT: PartState = { parent: null, at: [-150, 620, 230], rot: [0, 15, 0] }

// ---------- 颜色 ----------
const RING_OK = '#7cc6ff'
const RING_FAIL = '#e8462f'
const ALARM = '#f08a24'

// ---------- 形体 ----------
type Item = Extract<Shape, { type: 'compound' }>['items'][number]
const bx = (size: Vec3, at: Vec3, rot?: Vec3, fill?: Fill): Item => ({ type: 'box', size, at, rot, fill })
const cy = (r: number, h: number, axis: 'x' | 'y' | 'z', at: Vec3, fill?: Fill): Item => ({ type: 'cylinder', r, h, axis, at, fill })
const sl = (w: number, d: number, h: number, r: number, at: Vec3): Item => ({ type: 'slab', w, d, h, r, at, rot: [90, 0, 0] })
const tx = (text: string, size: number, at: Vec3, rot?: Vec3): Item => ({ type: 'text', text, size, at, rot })
const hl = (w: number, h: number, r: number, at: Vec3, rot?: Vec3): Item => ({ type: 'hole', w, h, r, at, rot })

/** 斜舌：俯视为楔形，斜面在 +z 一侧（朝门外），平面在 -z；尾部藏在锁体里 */
const LATCH_SHAPE: Shape = {
  type: 'compound',
  items: [
    bx([12, 20, 4], [-6, 0, -6]),
    bx([15.62, 20, 6], [-4.7, 0, 0.08], [0, -50.19, 0]),
    bx([2, 20, 12], [-1, 0, 2]),
    bx([22, 18, 14], [11, 0, 0], undefined, 'shade'),
  ],
}

/** 面板外壳：圆角面板 + 四周围边（中空，方钢和锁芯的端头伸进来） */
const panelShell = (top: number, bottom: number, wall: number, face: number): Item[] => {
  const len = top - bottom
  const mid = (top + bottom) / 2
  const cx = 37.8 - 16
  return [
    sl(75.6, len, face, 16, [0, mid, wall]),
    cy(16, wall, 'z', [cx, top - 16, wall / 2]),
    cy(16, wall, 'z', [-cx, top - 16, wall / 2]),
    cy(16, wall, 'z', [cx, bottom + 16, wall / 2]),
    cy(16, wall, 'z', [-cx, bottom + 16, wall / 2]),
    bx([3, len - 32, wall], [36.3, mid, wall / 2]),
    bx([3, len - 32, wall], [-36.3, mid, wall / 2]),
    bx([43.6, 3, wall], [0, top - 1.5, wall / 2]),
    bx([43.6, 3, wall], [0, bottom + 1.5, wall / 2]),
  ]
}

const BATTERY_ROWS = Array.from({ length: 8 }, (_, i) => 153.6 - i * 14.75)

const parts: SpecPart[] = [
  // ---- 门（场景道具）：剖切窗口 x 0–100、y 362–582 ----
  {
    id: 'door', name: '入户门（局部）', spec: '门厚 60 mm（示意）',
    shape: {
      type: 'compound',
      items: [
        bx([500, 900, 60], [-250, 450, 30]),
        bx([100, 362, 60], [-550, 181, 30]),
        bx([100, 318, 60], [-550, 741, 30]),
        cy(7, 100, 'y', [0, 150, 0], 'shade'),
        cy(7, 100, 'y', [0, 750, 0], 'shade'),
        tx('门外', 26, [-150, 790, 60.2]),
        tx('门内', 26, [-150, 790, -0.2], [0, 180, 0]),
      ],
    },
    at: [600, 0, -30],
  },
  {
    id: 'frame', name: '门框（锁边立柱）', spec: '含门扣板、门扣盒',
    shape: {
      type: 'compound',
      items: [
        bx([70, 410, 60], [-40, 205, 0]),
        bx([70, 335, 60], [-40, 732.5, 0]),
        bx([45, 155, 60], [-52.5, 487.5, 0]),
        bx([25, 155, 19], [-17.5, 487.5, 20.5], undefined, 'shade'),
        bx([25, 155, 19], [-17.5, 487.5, -20.5], undefined, 'shade'),
        bx([87, 900, 12], [-31.5, 450, 36]),
      ],
    },
  },
  { id: 'strike', name: '门扣板开口', parent: 'frame', shape: { type: 'hole', w: 22, h: 155, r: 3 }, at: [-4.9, 487.5, 0], rot: [0, 90, 0] },

  // ---- 旧机械锁 ----
  {
    id: 'old-lock', name: '旧锁体', spec: '普通锁体 · 导向片约 24 cm', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        bx([3, 240, 24], [-1.5, -48, 0]),
        bx([80, 205, 16], [40, -47.5, 0], undefined, 'warm'),
        cy(11, 17, 'z', [60, 0, 0]),
        cy(8.5, 60, 'z', [60, -68, 0], 'shade'),
      ],
    },
    at: D(0, H, 0), visible: false,
  },
  { id: 'old-latch', name: '旧锁斜舌', parent: 'old-lock', shape: LATCH_SHAPE, at: LATCH_OUT },
  {
    id: 'old-out', name: '旧外把手', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        cy(27, 8, 'z', [0, 0, 4]),
        cy(9, 30, 'z', [0, 0, 23]),
        bx([110, 18, 14], [47, 0, 40]),
        cy(16, 6, 'z', [0, -68, 3]),
        hl(3.5, 9, 1.5, [0, -68, 6.1]),
      ],
    },
    at: D(60, H, 30), visible: false,
  },
  {
    id: 'old-in', name: '旧内把手', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        cy(27, 8, 'z', [0, 0, 4]),
        cy(9, 30, 'z', [0, 0, 23]),
        bx([110, 18, 14], [-47, 0, 40]),
        cy(16, 6, 'z', [0, -68, 3]),
        bx([5, 22, 6], [0, -68, 9]),
      ],
    },
    at: D(60, H, -30), rot: [0, 180, 0], visible: false,
  },

  // ---- 锁体（6068 标准锁体） ----
  {
    id: 'lockbody', name: '锁体', spec: '标准锁体 6068 · 导向片 240 × 24（推断）', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        bx([3, 240, 24], [-1.5, -48, 0]),
        bx([80, 205, 16], [40, -47.5, 0], undefined, 'warm'),
        cy(11, 17, 'z', [60, 0, 0]),
        tx('6068', 7, [28, 38, 8.1]),
      ],
    },
    at: D(0, H, 0),
  },
  { id: 'latch', name: '斜舌', spec: '斜面朝关门方向', parent: 'lockbody', shape: LATCH_SHAPE, at: LATCH_OUT },
  {
    id: 'bolts', name: '方舌', spec: '上锁时伸出', parent: 'lockbody',
    shape: { type: 'compound', items: [bx([26, 14, 12], [-5, -45, 0]), bx([26, 14, 12], [-5, -90, 0])] },
    at: BOLTS_IN,
  },
  { id: 'hole-spindle', name: '方孔', parent: 'lockbody', shape: { type: 'hole', w: 8.4, h: 8.4, r: 0.8 }, at: [60, 0, 8.6] },
  { id: 'hole-cyl', name: '锁芯孔', parent: 'lockbody', shape: { type: 'hole', w: 17, h: 17, r: 8.5 }, at: [60, -68, 8.1] },
  { id: 'cyl-screw', name: '锁芯固定螺丝', parent: 'lockbody', shape: { type: 'cylinder', r: 2.6, h: 1.2, axis: 'x' }, at: [-3.6, -68, 0], fill: 'shade' },
  {
    id: 'body-screws', name: '导向片螺丝 ×2', parent: 'lockbody',
    shape: { type: 'compound', items: [cy(2.6, 1.2, 'x', [-3.6, -158, 0]), cy(2.6, 1.2, 'x', [-3.6, 62, 0])] },
    fill: 'shade',
  },
  // 方钢 / 锁芯：插头约定，局部 +x 指向锁体里（门外 → 门内）
  { id: 'spindle', name: '方钢', spec: '8 × 8 mm · 裁切后 84 mm（推断）', parent: 'lockbody', shape: { type: 'box', size: [84, 8, 8] }, at: [60, 0, 0], rot: [0, 90, 0], fill: 'shade' },
  { id: 'offcut', name: '方钢裁下的一段', parent: 'spindle', shape: { type: 'box', size: [16, 8, 8] }, at: [-50, 0, 0], fill: 'shade', visible: false },
  {
    id: 'cyl', name: '智能锁芯', spec: 'C 级 · 标准款适配 40–80 mm 门厚', parent: 'lockbody',
    shape: { type: 'compound', items: [cy(8.5, 80, 'x', [0, 0, 0]), bx([80, 15, 10], [0, -8, 0])] },
    at: [60, -68, 0], rot: [0, 90, 0], fill: 'warm',
  },

  // ---- 前面板（门外） ----
  {
    id: 'front', name: '前面板', spec: '365.6 × 75.6 × 24.5 mm', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        ...panelShell(178, -188, 21, 3.5),
        tx('MI', 8, [0, -134, 24.65]),
        hl(8, 2.4, 1.2, [14, -188.1, 12], [90, 0, 0]),
        hl(8, 2.4, 1.2, [-14, -188.1, 12], [90, 0, 0]),
      ],
    },
    at: D(60, H, 30),
  },
  {
    id: 'f-handle', name: '前面板把手', spec: '验证成功后下压开锁 · 上提上锁', parent: 'front',
    shape: {
      type: 'compound',
      items: [
        cy(16, 4, 'z', [0, 0, 2]),
        cy(11, 22, 'z', [0, 0, 14]),
        bx([126, 27, 20], [63, 0, 32]),
        cy(13.5, 20, 'z', [0, 0, 32]),
        cy(13.5, 20, 'z', [126, 0, 32]),
      ],
    },
    at: [0, 0, 24.5],
  },
  { id: 'f-ring', name: '验证结果指示灯圈', spec: '白色旋转：成功 · 红色闪烁：失败', parent: 'f-handle', shape: { type: 'led', r: 11, color: RING_OK }, at: [0, 0, 42.05] },
  { id: 'f-finger', name: '指纹识别区', parent: 'f-handle', shape: { type: 'hole', w: 12, h: 15, r: 6 }, at: [0, 0, 42.3] },
  {
    id: 'f-keys', name: '密码输入区', spec: '1–9、0 · 返回键 < · 确认键 ✓', parent: 'front',
    shape: {
      type: 'compound',
      items: [
        hl(62, 118, 10, [0, 0, 0]),
        ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', '✓'].map((k, i) => tx(k, 6, [-17 + (i % 3) * 17, [42, 24, 6, -11.5][Math.floor(i / 3)], 0.25])),
      ],
    },
    at: [0, 108, 24.6],
  },
  { id: 'led-dual', name: '双重验证灯', spec: '亮起：已开启', parent: 'front', shape: { type: 'led', r: 2.4, color: '#22b04b' }, at: [-17, 79, 24.9] },
  { id: 'led-lock', name: '未锁告警灯', spec: '闪烁：门未关好 / 门未锁', parent: 'front', shape: { type: 'led', r: 2.4, color: ALARM }, at: [0, 79, 24.9] },
  { id: 'led-batt', name: '电量告警灯', spec: '闪烁：电池电量低', parent: 'front', shape: { type: 'led', r: 2.4, color: ALARM }, at: [17, 79, 24.9] },
  {
    id: 'f-nfc', name: 'NFC 识别区', parent: 'front',
    shape: { type: 'compound', items: [hl(28, 9, 4.5, [0, 0, 0]), tx('(( NFC ))', 3.4, [0, 0, 0.25])] },
    at: [0, 61, 24.8],
  },
  // 钥匙孔盖板：转轴在盖板上沿（pivot 把圆片挪到转轴下方），局部 y = 盖板法线，press 往面板里按
  { id: 'f-cover', name: '应急钥匙孔盖板', spec: '① 按下 ② 弹起后旋转', parent: 'front', shape: { type: 'cylinder', r: 14, h: 3, axis: 'y' }, pivot: [0, 0, 14], at: [0, -54, 26], rot: [90, 0, 0] },
  { id: 'f-keyhole', name: '应急钥匙孔', parent: 'front', shape: { type: 'hole', w: 4, h: 12, r: 2 }, at: [0, -68, 24.6], fill: 'dark' },
  { id: 'f-usb', name: '应急供电口', spec: 'Micro-USB · 5 V', parent: 'front', shape: { type: 'hole', w: 8, h: 3, r: 1.2 }, at: [0, -188.15, 12], rot: [90, 0, 0], fill: 'dark' },

  // ---- 线束：前面板 → 门上的过线位置 → 后面板接口 ----
  {
    id: 'conn', name: '线束插头', parent: 'rear',
    shape: { type: 'compound', items: [bx([10, 10, 6], [-5, 0, 0]), bx([4, 7, 4], [2, 0, 0], undefined, 'shade')] },
    at: [-26, -110, 13.95], rot: [0, -90, 0],
  },
  {
    id: 'harness', name: '前面板线束',
    shape: { type: 'cable', from: { part: 'front', at: [26, -110, 6], dir: [0, 0, -1] }, to: { part: 'conn', at: [-10, 0, 0], dir: [-1, 0, 0] }, r: 2.2 },
  },

  // ---- 后面板（门内） ----
  {
    id: 'rear', name: '后面板', spec: '约 366 × 75.6 mm · 厚 34（推断）', parent: 'door',
    shape: {
      type: 'compound',
      items: [
        ...panelShell(183, -183, 14, 3),
        // 电池盖以下的外壳（上沿方角，与电池盖拼缝）
        sl(75.6, 168, 17, 16, [0, -99, 17]),
        bx([75.4, 140, 16.8], [0, -29, 25.4]),
        cy(22, 4, 'z', [0, -124, 36]),
        // 电池盖下：按键槽与丝印
        hl(8, 4.5, 2, [8, 170, 17.05]),
        tx('设置', 2.2, [-19, 164.5, 17.05]),
        tx('配对', 2.2, [-5, 164.5, 17.05]),
        tx('静音', 2.2, [8, 164.5, 17.05]),
        tx('重置', 2.2, [21, 164.5, 17.05]),
      ],
    },
    at: D(60, H, -30), rot: [0, 180, 0],
  },
  { id: 'r-socket', name: '后面板线束接口', parent: 'rear', shape: { type: 'hole', w: 7, h: 12, r: 1 }, at: [-26, -110, 13.95], rot: [0, 180, 0], fill: 'dark' },
  {
    id: 'r-handle', name: '后面板把手', spec: '按住按钮后下压开锁 · 上提上锁', parent: 'rear',
    shape: {
      type: 'compound',
      items: [
        cy(22, 6, 'z', [0, 0, 3]),
        cy(11, 20, 'z', [0, 0, 14]),
        bx([126, 27, 20], [-63, 0, 30]),
        cy(13.5, 20, 'z', [0, 0, 30]),
        cy(13.5, 20, 'z', [-126, 0, 30]),
      ],
    },
    at: [0, 0, 34],
  },
  { id: 'r-button', name: '防猫眼开锁按钮', parent: 'r-handle', shape: { type: 'cylinder', r: 8, h: 3, axis: 'y' }, at: [0, 0, 40.6], rot: [90, 0, 0], fill: 'shade' },
  {
    id: 'r-knob', name: '反锁旋钮', spec: '① 压到底 ② 旋转至水平', parent: 'rear',
    shape: { type: 'compound', items: [cy(16, 8, 'y', [0, 4, 0]), bx([6, 8, 30], [0, 11, 0])] },
    at: [0, -124, 38], rot: [90, 0, 0],
  },
  { id: 'r-led', name: '未锁告警灯（后）', parent: 'rear', shape: { type: 'led', r: 2, color: ALARM }, at: [0, 35.5, 33.9] },
  {
    id: 'r-cover', name: '电池盖', spec: '实物为整块后壳，从面板底边掀开（P3）', parent: 'rear',
    shape: { type: 'compound', items: [sl(75.6, 100, 17, 16, [0, 133, 17]), bx([75.4, 50, 16.8], [0, 66, 25.4])] },
  },
  {
    id: 'batteries', name: '5 号电池 ×8', spec: '6 V', parent: 'rear',
    shape: { type: 'compound', items: BATTERY_ROWS.map((y) => cy(7.1, 50.5, 'x', [0, y, 24.3], 'warm')) },
    visible: false,
  },
  { id: 'r-set', name: '设置键', spec: '短按进入设置模式', parent: 'rear', shape: { type: 'box', size: [7, 2, 4.5], chamfer: 0.6 }, at: [-19, 170, 17.6], rot: [90, 0, 0], visible: false },
  { id: 'r-pair', name: '蓝牙配对键', spec: '短按进行蓝牙配对', parent: 'rear', shape: { type: 'box', size: [7, 2, 4.5], chamfer: 0.6 }, at: [-5, 170, 17.6], rot: [90, 0, 0], visible: false },
  { id: 'r-mute', name: '开锁提示音静音开关', spec: '右：关闭静音 · 左：开启静音', parent: 'rear', shape: { type: 'box', size: [3.5, 2, 4], chamfer: 0.5 }, at: [10, 170, 17.6], rot: [90, 0, 0], visible: false },
  { id: 'r-reset', name: '重置孔', spec: '长按 5 秒重置', parent: 'rear', shape: { type: 'hole', w: 3, h: 3, r: 1.5 }, at: [21, 170, 17.05], fill: 'dark' },
  { id: 'screw-a', name: '对拉螺丝（上）', parent: 'rear', shape: { type: 'compound', items: [cy(4, 2, 'z', [0, 0, 0]), bx([5.5, 1.1, 0.5], [0, 0, 1.1], undefined, 'dark')] }, at: [0, -62, 35] },
  { id: 'screw-b', name: '对拉螺丝（下）', parent: 'rear', shape: { type: 'compound', items: [cy(4, 2, 'z', [0, 0, 0]), bx([5.5, 1.1, 0.5], [0, 0, 1.1], undefined, 'dark')] }, at: [0, -165, 35] },

  // ---- 配件与道具 ----
  {
    id: 'pin', name: '重置针', parent: 'rear',
    shape: { type: 'compound', items: [cy(0.5, 8, 'x', [4, 0, 0]), cy(2.2, 36, 'x', [-18, 0, 0], 'warm')] },
    at: [60, 230, 90], rot: [0, 90, 0], visible: false,
  },
  {
    id: 'phone', name: '手机（米家 APP）',
    shape: { type: 'compound', items: [sl(76, 160, 8, 11, [0, 0, 0]), bx([22, 22, 2], [-20, 60, -1], undefined, 'shade')] },
    at: [-150, 620, -230], rot: [0, 200, 0], visible: false,
  },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 70, h: 152 }, at: [0, 0, 8.1] },
  // 钥匙：外层只负责插进钥匙孔（空字占位），里层负责转动
  { id: 'key-holder', name: '应急钥匙（插入）', parent: 'front', shape: { type: 'text', text: ' ', size: 1 }, at: [50, -110, 110], rot: [0, 90, 0], visible: false },
  {
    id: 'key', name: '应急钥匙', spec: '包装内 2 把', parent: 'key-holder',
    shape: { type: 'compound', items: [bx([12, 6, 2], [6, 0, 0], undefined, 'shade'), bx([8, 7, 2.4], [-4, 0, 0]), cy(12, 3, 'z', [-19, 0, 0], 'warm')] },
  },
  { id: 'powerbank', name: '充电宝', shape: { type: 'box', size: [66, 130, 16], chamfer: 4 }, at: [175, 230, 125], visible: false },
  {
    id: 'usb-plug', name: 'Micro-USB 插头',
    shape: { type: 'compound', items: [bx([6, 2.4, 7], [3, 0, 0], undefined, 'shade'), bx([14, 6, 11], [-7, 0, 0])] },
    at: [150, 318, 122], rot: [90, 90, 0], visible: false,
  },
  {
    id: 'usb-cable', name: 'USB 线',
    shape: { type: 'cable', from: { part: 'powerbank', at: [0, 65, 0], dir: [0, 1, 0] }, to: { part: 'usb-plug', at: [-14, 0, 0], dir: [-1, 0, 0] }, r: 1.6, slack: 1.2 },
  },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
const KEYS_UNDER_COVER = ['r-set', 'r-pair', 'r-mute']

// ---------- 镜头 ----------
const FRONT_HANDLE: CameraSpec = { target: [100, 535, 70], dir: [0.35, 0.3, 1], dist: 420 }
const FRONT_KEYPAD: CameraSpec = { target: [70, 600, 60], dir: [0.2, 0.25, 1], dist: 400 }
const FRONT_LOWER: CameraSpec = { target: [70, 470, 60], dir: [0.3, 0.3, 1], dist: 380 }
const LATCH_TOP: CameraSpec = { target: [-150, 545, 0], dir: [-0.3, 1, 0.6], dist: 460 }
const REAR_TOP: CameraSpec = { target: [60, 660, -60], dir: [-0.3, 0.45, -1], dist: 380 }
const PHONE_IN_VIEW: CameraSpec = { target: 'phone-screen', offset: [0, 30, 0], dir: [-0.3, 0.12, -1], dist: 210 }
const PHONE_OUT_VIEW: CameraSpec = { target: 'phone-screen', offset: [0, 30, 0], dir: [0.25, 0.12, 1], dist: 210 }
const zoomLatch = (caption: string) => ({ target: 'latch', offset: [-7, 0, -2] as Vec3, dir: [-0.04, 1, 0.07] as Vec3, dist: 140, caption })
const zoomRing = (caption: string) => ({ target: 'f-ring', dir: [0.2, 0.15, 1] as Vec3, dist: 90, caption })

// ---------- 屏幕 ----------
const UI_SERVICE: ScreenUI = {
  app: '安装服务', title: '预约上门安装',
  items: [
    { text: '扫码上传门体照片', state: 'done' },
    { text: '电话预约上门时间', state: 'selected' },
    { text: '上门安装 + 米家配置', state: 'muted' },
  ],
  button: '提交预约', buttonActive: true,
}
const UI_HOME: ScreenUI = {
  app: '米家', title: '我的家',
  items: [
    { text: '客厅', sub: '3 个设备', state: 'muted' },
    { text: '蓝牙网关', sub: '在线', state: 'muted' },
  ],
  button: '右上角「+」添加设备', buttonActive: true,
}
const UI_FOUND: ScreenUI = {
  app: '米家', title: '添加设备',
  items: [
    { text: '小米智能门锁', sub: '蓝牙', state: 'selected' },
    { text: '短按门锁后面板「配对」键' },
    { text: '手机离门锁 10 m 以内', state: 'muted' },
  ],
  button: '连接', buttonActive: true,
}
const UI_ADMIN: ScreenUI = {
  app: '小米智能门锁', title: '添加首个用户',
  items: [
    { text: '门锁', sub: '添加成功', state: 'done' },
    { text: '蓝牙网关', sub: '自动连接', state: 'done' },
    { text: '首个用户', sub: '默认为管理员', state: 'selected' },
  ],
  button: '添加用户', buttonActive: true,
}
const UI_FINGER: ScreenUI = {
  app: '小米智能门锁', title: '添加指纹',
  items: [
    { text: '手指轻按指纹识别区', state: 'selected' },
    { text: '按提示抬起、再按' },
    { text: '最多 50 个指纹', state: 'muted' },
  ],
  toast: '按 APP 提示完成录入',
}

// ---------- 各指南起点 ----------
const OLD_LOCK = { ...show('old-lock', 'old-out', 'old-in'), ...hide('lockbody', 'front', 'rear') }

export const xiaomiLockMjznms02lm: ManualSpec = {
  id: 'xiaomi-lock-mjznms02lm',
  name: '小米智能门锁（标准锁体版）',
  desc: '指纹 / 密码 / NFC / 蓝牙 / 应急钥匙五种开锁；装前自查门体，斜舌换向、方钢裁切、线束穿门，米家绑定与应急开锁',
  category: '智能门锁',
  dims: { width: 75.6, depth: 24.5, height: 365.6 },
  source: {
    title: '小米智能门锁使用说明书',
    url: 'https://cdn.cnbj1.fds.api.mi-img.com/iotweb-product-center/04c6fe28def691f8c4e22c6e29f378a2_1666344379079.pdf',
    images: [],
  },
  package: [
    { name: '前面板', qty: 1 },
    { name: '后面板', qty: 1 },
    { name: '锁体', qty: 1, spec: '标准锁体' },
    { name: '智能锁芯', qty: 1, spec: '标准款 · 40–80 mm 门厚' },
    { name: '应急钥匙', qty: 2 },
    { name: '门扣板', qty: 1 },
    { name: '门扣盒', qty: 1 },
    { name: '配件包（一代）', qty: 1 },
    { name: '配件包（二代）', qty: 1 },
    { name: '五号电池', qty: 8 },
    { name: '安装开孔图', qty: 1 },
    { name: '使用说明书', qty: 1 },
  ],
  params: [
    { label: '面板尺寸', value: '365.6 × 75.6 × 24.5 mm' },
    { label: '开锁方式', value: '指纹 / 密码 / NFC / 手机蓝牙 / 应急钥匙' },
    { label: '用户容量', value: '指纹 50 · 密码 50 · NFC 25', note: '官网规格页' },
    { label: '供电', value: '8 节 5 号电池（6 V）', note: 'Micro-USB 应急供电（5 V）' },
    { label: '无线', value: '蓝牙 5.0' },
    { label: '适配门厚', value: '40–120 mm', note: '标配锁芯 40–80，可换加长款 80–120' },
    { label: '工作温度', value: '−25 ~ 55 ℃' },
    { label: '净重', value: '5.1 kg（标准锁体版）', note: '霸王锁体版 6.6 kg' },
    { label: '安全级别', value: 'B 级（GA 374-2019）', note: '锁芯 C 级' },
    { label: '产品代码', value: 'MJZNMS02LM（一代）/ MJZNMS03LM（二代）' },
  ],
  parts,
  stageSize: 1500,
  guides: [
    // ================= 安装前检查 =================
    {
      id: 'precheck', title: '安装前检查', kind: 'usage',
      start: { ...OLD_LOCK, phone: { at: [-170, 640, 220], rot: [0, 15, 0] } },
      steps: [
        {
          id: 'pc-swing', title: '看开门方向：右内开', page: 4,
          desc: '站在门外看：合页在右边，门往室内推开，这扇门是「右内开」。开门方向决定锁体斜舌的斜面朝哪边。',
          tip: '斜舌的斜面要朝关门方向：内开门斜面朝门外，外开门斜面朝门内。方向不对，安装时要给斜舌换向（见「安装锁体与面板」第 2–4 步）。',
          chips: [{ label: '本门', sub: '右内开' }],
          camera: { target: [250, 900, -80], dir: [0.15, 1, 0.55], dist: 1500 },
          set: { 'old-latch': { at: LATCH_IN, dur: 0.4 }, door: { rot: DOOR_OPEN, delay: 0.5, dur: 1.4 } },
          highlight: ['door'],
          callouts: [
            { part: 'door', at: [0, 900, 0], text: '合页在右（门外看）', offset: [-90, 0, 60] },
            { part: 'door', at: [-600, 900, 30], text: '往室内推开 = 内开', offset: [-60, 0, -80] },
          ],
        },
        {
          id: 'pc-latch', title: '对照斜舌：斜面应朝门外', page: 4,
          desc: '门开着时松开把手，斜舌弹出。从上往下看：斜面朝门外、平面朝门内，关门时斜面先碰到门扣板被压进去，门才关得上。',
          tip: '新锁体的斜舌也要按这个方向装。这是安装时最常见的返工点。',
          camera: { target: 'old-latch', dir: [-0.2, 1, 0.5], dist: 420 },
          set: { 'old-latch': { at: LATCH_OUT, dur: 0.4 } },
          highlight: ['old-latch'],
          zoom: { target: 'old-latch', offset: [-5.5, 0, -4.8], dir: [-0.04, 1, 0.07], dist: 140, caption: '斜面朝门外 = 适合内开门' },
          callouts: [{ part: 'old-latch', at: [-7, 0, 4], text: '斜面', sub: '朝门外（关门方向）', offset: [-70, 0, 30] }],
        },
        {
          id: 'pc-thick', title: '量门厚：40–120 mm 才能装', page: 4,
          desc: '门开着，在门边量门的厚度。门厚 40–120 mm 支持安装；小于 40 mm 或大于 120 mm 不支持。场景里门边开了剖切窗口，方便看到里面的锁体。',
          tip: '见官方安装须知。场景门厚 60 mm 为示意值。',
          chips: [{ label: '支持', sub: '40–120 mm' }, { label: '不支持', sub: '< 40 或 > 120 mm' }],
          camera: { target: 'old-lock', offset: [0, 120, 0], dir: [-1, 0.45, -0.25], dist: 900 },
          highlight: ['door'],
          callouts: [{ part: 'door', at: D(0, 700, 0), text: '门厚 60 mm', sub: '支持 40–120 mm', offset: [0, 30, 80] }],
        },
        {
          id: 'pc-plate', title: '量导向片：判断锁体类型', page: 4,
          desc: '导向片长 210–300 mm、宽 23–33 mm，选标准锁体版；导向片长 388 mm、宽 30–40 mm，选霸王锁体版。导向片约 24 cm 且没有双钩锁舌，就是普通锁体（含标准 / 6068、王力、盼盼、小帅）。',
          tip: '见官方安装须知：王力、小帅、保德安锁体，以及盼盼门、老式防盗门需要改造后安装。',
          chips: [{ label: '标准锁体', sub: '210–300 × 23–33 mm' }, { label: '霸王锁体', sub: '388 × 30–40 mm' }],
          camera: { target: 'old-lock', offset: [0, -40, 0], dir: [-1, 0.35, -0.2], dist: 620 },
          highlight: ['old-lock'],
          callouts: [
            { part: 'old-lock', at: [-3, 40, 0], text: '导向片 240 × 24 mm', sub: '→ 标准锁体', offset: [0, 40, 80] },
            { part: 'old-latch', at: [-12, 0, 0], text: '没有双钩锁舌', sub: '→ 普通锁体', offset: [0, 10, -90] },
          ],
        },
        {
          id: 'pc-width', title: '看面板位置和门型', page: 4,
          desc: '门上装面板的位置宽度不能小于 110 mm；内、外两扇门之间的距离不能小于 160 mm。铁艺门、栅栏门、双锁体门、玻璃防盗门、牛头锁、隐藏锁都不能装。',
          tip: '见官方安装须知：门内填充物易碎或有腐蚀性（石膏、珍珠岩等）也不能装；不建议装带天地钩的门（门顶、门底有锁舌就是天地钩）。',
          chips: [{ label: '面板位置', sub: '≥ 110 mm' }, { label: '两扇门距离', sub: '≥ 160 mm' }],
          camera: { target: 'old-out', offset: [0, 80, 0], dir: [0.15, 0.3, 1], dist: 950 },
          highlight: ['door'],
          callouts: [{ part: 'door', at: D(60, 760, 30), text: '面板位置宽度 ≥ 110 mm', sub: '面板本身宽 75.6 mm', offset: [-150, 30, 0] }],
        },
        {
          id: 'pc-service', title: '预约专业安装', page: 4,
          desc: '说明书：门锁安装过程需要使用具有危险性的专业工具，请务必聘请专业人员进行安装。安装须知的流程：扫码上传门体照片 → 电话预约 → 上门安装 → 用米家 APP 完成配置。',
          tip: '见官方安装须知：必须由小米授权工程师安装；门体开孔、切割不可逆；拆掉旧锁后原有孔位可能外露。',
          chips: [{ label: '安装', sub: '170 元（首次免费）' }, { label: '拆机 / 移机', sub: '50 / 220 元' }],
          camera: PHONE_OUT_VIEW,
          set: { phone: { visible: true }, 'phone-screen': { ui: UI_SERVICE } },
          highlight: ['phone-screen'],
        },
      ],
    },

    // ================= 安装锁体与面板 =================
    {
      id: 'install', title: '安装锁体与面板', kind: 'assembly',
      start: {
        ...OLD_LOCK,
        frame: { visible: false },
        lockbody: { visible: false, at: D(-150, H, 0) },
        latch: { rot: [180, 0, 0] },
        'cyl-screw': { visible: false },
        'body-screws': { visible: false },
        cyl: { parent: null, at: [60, H - 68, 300], rot: [0, 90, 0], visible: false },
        spindle: { parent: null, at: [60, H, 330], rot: [0, 90, 0], visible: false },
        offcut: { visible: true },
        front: { visible: false, at: D(60, H, 200) },
        conn: { parent: 'front', at: [26, -110, -40], rot: [0, 90, 0] },
        rear: { visible: false, at: D(60, H, -180) },
        'screw-a': { visible: false },
        'screw-b': { visible: false },
        batteries: { at: BATT_HOLD },
      },
      steps: [
        {
          id: 'as-remove', title: '拆旧锁：先卸把手，再抽锁体', page: 4,
          desc: '卸下门内、门外的旧把手，再从门边抽出旧锁体。',
          tip: '通用做法：说明书没有拆装步骤，安装须知要求由小米授权工程师操作。场景门边的剖切窗口只为看清内部，真实门上只有锁体槽和过线孔。',
          camera: { target: [30, 500, 0], dir: [-0.8, 0.45, 0.9], dist: 1100 },
          set: {
            'old-out': { at: D(60, H, 200), dur: 1 },
            'old-in': { at: D(60, H, -200), dur: 1 },
            'old-lock': { at: D(-170, H, 0), delay: 1, dur: 1.2 },
          },
          highlight: ['old-out', 'old-in', 'old-lock'],
        },
        {
          id: 'as-check', title: '检查新锁体斜舌朝向', page: 4,
          desc: '先别急着装：从上往下看斜舌。这把锁体的斜面朝门内，和右内开门需要的方向（朝门外）相反，要先换向。',
          tip: '口诀：斜面朝关门方向。装反了关门时斜舌的平面顶住门扣板，门关不上。出厂方向以实物为准。',
          chips: [{ label: '内开门', sub: '斜面朝门外' }, { label: '外开门', sub: '斜面朝门内' }],
          camera: LATCH_TOP,
          set: {
            ...Object.fromEntries(['old-out', 'old-in', 'old-lock'].map((id) => [id, { visible: false, dur: 0.3 }])),
            lockbody: { visible: true, delay: 0.4 },
          },
          highlight: ['latch'],
          zoom: zoomLatch('斜面朝门内，和内开门相反'),
        },
        {
          id: 'as-flip', title: '换向：压进斜舌，转 180°', page: 4,
          desc: '按住斜舌把它压进锁体，保持压住，把斜舌整体转 180°。',
          tip: '通用做法：多数 6068 锁体可直接按压旋转换向；部分锁体要先拨换向片或拆侧盖，以锁体说明为准。',
          camera: LATCH_TOP,
          set: { latch: { at: [7, 25, 0], rot: [0, 0, 0], dur: 1.5 } },
          highlight: ['latch'],
          zoom: { target: 'latch', dir: [-1, 0.8, 0.25], dist: 90, caption: '压进锁体再转 180°' },
        },
        {
          id: 'as-flip-done', title: '松手：斜面朝门外', page: 4,
          desc: '松开手，斜舌弹回原位。现在斜面朝门外，和右内开门一致。',
          tip: '换完用手推几下斜舌，能顺畅压进、弹出就对了。',
          camera: LATCH_TOP,
          set: { latch: { at: LATCH_OUT, dur: 0.5 } },
          highlight: ['latch'],
          zoom: zoomLatch('斜面朝门外 ✓'),
          callouts: [{ part: 'latch', at: [-7, 0, 4], text: '斜面朝门外', offset: [-60, 0, 50] }],
        },
        {
          id: 'as-body', title: '装入锁体，拧紧导向片螺丝', page: 4,
          desc: '把锁体推进门边的锁体槽，导向片贴平门边，上下两颗螺丝拧紧。',
          tip: '通用做法。导向片尺寸在 210–300 × 23–33 mm 之内才用标准锁体（见官方安装须知）。',
          camera: { target: [0, 480, 0], dir: [-1, 0.4, 0.6], dist: 700 },
          set: { lockbody: { at: D(0, H, 0), dur: 1.4 }, 'body-screws': { visible: true, delay: 1.5, dur: 0.3 } },
          highlight: ['lockbody', 'body-screws'],
          callouts: [{ part: 'body-screws', at: [-4, 62, 0], text: '导向片螺丝 ×2', offset: [0, 45, 60] }],
        },
        {
          id: 'as-cyl', title: '按门厚选锁芯，从门外插入', page: 4,
          desc: '门厚 60 mm，用标配的标准款锁芯。从门外把锁芯穿过锁体的锁芯孔。',
          tip: '官网规格页：标准锁体版标配标准款锁芯（适配 40–80 mm 门厚），门厚 80–120 mm 可免费换加长款。',
          chips: [{ label: '标准款', sub: '40–80 mm 门厚' }, { label: '加长款', sub: '80–120 mm 门厚' }],
          camera: { target: [60, 452, 140], dir: [-0.85, 0.35, 0.7], dist: 850 },
          set: { cyl: { visible: true, plug: { hole: 'hole-cyl', depth: 8.1, back: 0 }, dur: 1.5 } },
          highlight: ['cyl'],
          callouts: [{ part: 'cyl', at: [-40, 0, 0], text: '智能锁芯（C 级）', sub: '贯穿锁体的直插芯', offset: [0, -60, 50] }],
        },
        {
          id: 'as-cyl-screw', title: '拧紧锁芯固定螺丝', page: 4,
          desc: '在导向片上拧紧锁芯固定螺丝，把锁芯固定在锁体里。',
          tip: '通用做法，螺丝位置为示意。',
          camera: { target: [0, 452, 0], dir: [-1, 0.35, 0.5], dist: 450 },
          set: { 'cyl-screw': { visible: true } },
          highlight: ['cyl-screw'],
          actions: [{ type: 'spin', part: 'cyl-screw', axis: 'x' }],
          zoom: { target: 'cyl-screw', dir: [-1, 0.25, 0.3], dist: 80, caption: '导向片上这颗螺丝锁住锁芯' },
        },
        {
          id: 'as-cut', title: '方钢按门厚裁切', page: 4,
          desc: '方钢要穿过门、两端伸进前后面板。按门厚量好长度，把多余的一段裁掉。',
          tip: '推断值：门厚 60 mm，两端各伸出约 12 mm，留 84 mm。安装须知「8」：工程师可能需要更换方轴。',
          chips: [{ label: '方钢', sub: '8 × 8 mm' }, { label: '保留', sub: '约 84 mm（推断）' }],
          camera: { target: [75, 505, 360], dir: [0.6, 0.5, 1], dist: 460 },
          set: { spindle: { visible: true }, offcut: { parent: null, at: [100, 480, 410], rot: [0, 60, 0], delay: 1, dur: 0.8 } },
          highlight: ['spindle', 'offcut'],
          callouts: [
            { part: 'spindle', text: '保留 84 mm', sub: '门厚 60 + 两侧各 12', offset: [-90, 50, 0] },
            { part: 'offcut', text: '裁掉多余部分', offset: [70, -40, 0] },
          ],
        },
        {
          id: 'as-spindle', title: '方钢插入锁体方孔', page: 4,
          desc: '从门外把方钢插进锁体的方孔，两端露出的长度大致相等。',
          tip: '通用做法。方钢太长面板贴不平，太短把手带不动锁舌。',
          camera: { target: [60, 500, 130], dir: [-0.85, 0.4, 0.7], dist: 850 },
          set: { spindle: { plug: { hole: 'hole-spindle', depth: 8.6, back: 0 }, dur: 1.5 }, offcut: { visible: false, dur: 0.3 } },
          highlight: ['spindle'],
          callouts: [{ part: 'spindle', at: [-42, 0, 0], text: '门外露出约 12 mm', sub: '插进前面板', offset: [0, 50, 50] }],
        },
        {
          id: 'as-front', title: '前面板穿线，贴上门外', page: 4,
          desc: '前面板的线束从门上的过线位置穿到门内，再把前面板贴平门外侧，方钢、锁芯端头进到面板里。',
          tip: '通用做法：真实门上在锁体旁开过线孔（见包装里的安装开孔图）。穿线时别让线束被锁体或门板刮伤。',
          camera: { target: [60, 470, 40], dir: [-1, 0.35, 0.5], dist: 950 },
          set: {
            front: { visible: true, at: D(60, H, 30), delay: 0.2, dur: 1.6 },
            conn: { parent: 'door', at: D(86, 410, -60), delay: 0.2, dur: 1.6 },
          },
          highlight: ['front', 'harness'],
          callouts: [{ part: 'conn', text: '线束插头穿到门内', offset: [0, -60, -50] }],
        },
        {
          id: 'as-plug', title: '门内：插好线束插头', page: 4,
          desc: '拿起后面板，把前面板穿过来的线束插头插进后面板背面的接口，插到底。',
          tip: '通用做法，接口位置为示意。插头没插紧，面板会没电或指纹、键盘没反应。',
          camera: { target: [70, 450, -110], dir: [-1, 0.35, 0.3], dist: 750 },
          set: { rear: { visible: true }, conn: { plug: { hole: 'r-socket', back: 40 }, delay: 0.5, dur: 1.3 } },
          highlight: ['conn'],
          zoom: { target: 'conn', dir: [-0.6, 0.3, 1], dist: 130, caption: '插头对准后面板接口，插到底' },
        },
        {
          id: 'as-rear', title: '后面板贴上门内', page: 4,
          desc: '把多余的线束收进面板内侧，后面板贴平门内侧，方钢和锁芯端头进到后面板里。',
          tip: '通用做法：别让线束被面板边压住，压线会导致断线。',
          camera: { target: [60, 520, -60], dir: [-0.7, 0.4, -1], dist: 950 },
          set: { rear: { at: D(60, H, -30), dur: 1.4 } },
          highlight: ['rear'],
          callouts: [{ part: 'rear', at: [-26, -110, 34], text: '线束收在面板内侧', sub: '别被面板压住', offset: [100, -40, 0] }],
        },
        {
          id: 'as-screws', title: '拧紧前后面板对拉螺丝', page: 4,
          desc: '从后面板拧进对拉螺丝，把前后面板夹紧在门上。',
          tip: '通用做法，螺丝位置为示意。先不拧死，试试两边把手和反锁旋钮都顺畅再拧紧。',
          camera: { target: [60, 410, -64], dir: [-0.4, 0.35, -1], dist: 520 },
          set: { 'screw-a': { visible: true }, 'screw-b': { visible: true } },
          highlight: ['screw-a', 'screw-b'],
          actions: [{ type: 'spin', part: 'screw-a', axis: 'z' }, { type: 'spin', part: 'screw-b', axis: 'z' }],
          zoom: { target: 'screw-a', dir: [-0.3, 0.3, -1], dist: 110, caption: '前后面板对拉固定' },
        },
        {
          id: 'as-battery', title: '打开电池盖，装 8 节 5 号电池', page: 4,
          desc: '取下电池盖，装入 8 节 5 号电池。电池盖下面还有设置键、配对键、静音开关和重置孔。',
          tip: '说明书：普通电池长期使用时，可能因漏液而损坏产品，建议使用原装电池。实物电池盖是整块后壳、从面板底边掀开（P3），场景简化成上半块。',
          chips: [{ label: '电池', sub: '8 节 5 号（6 V）' }],
          camera: { target: [10, 640, -110], dir: [-0.3, 0.35, -1], dist: 700 },
          set: {
            'r-cover': { at: COVER_ASIDE, dur: 1 },
            ...Object.fromEntries(KEYS_UNDER_COVER.map((id) => [id, { visible: true, delay: 0.9, dur: 0.2 }])),
            batteries: { visible: true, at: [0, 0, 0], delay: 1.1, dur: 1.2 },
          },
          highlight: ['r-cover', 'batteries'],
          callouts: [{ part: 'batteries', at: [-25, 102, 31], text: '8 节 5 号电池', offset: [80, 10, 0] }],
        },
        {
          id: 'as-strike', title: '门框装门扣板，试开关门', page: 4,
          desc: '盖回电池盖。在门框上对准斜舌、方舌的位置装门扣板和门扣盒，然后下压把手把门打开。装好后多试几次开关门、上锁和反锁，确认顺畅。',
          tip: '通用做法：门扣板、门扣盒在包装清单里，位置以锁舌为准。',
          camera: { target: [0, 500, -40], dir: [0.6, 0.35, 0.9], dist: 950 },
          set: {
            'r-cover': { at: [0, 0, 0], dur: 0.8 },
            ...Object.fromEntries([...KEYS_UNDER_COVER, 'batteries'].map((id) => [id, { visible: false, dur: 0.4 }])),
            frame: { visible: true },
            latch: { at: LATCH_IN, delay: 0.8, dur: 0.4 },
            door: { rot: DOOR_OPEN, delay: 1.3, dur: 1.4 },
          },
          highlight: ['frame', 'strike'],
          callouts: [{ part: 'strike', text: '门扣板 + 门扣盒', sub: '对准斜舌、方舌', offset: [0, 90, 60] }],
        },
      ],
    },

    // ================= 绑定米家与录指纹 =================
    {
      id: 'bind', title: '绑定米家与录指纹', kind: 'usage',
      start: { 'r-cover': { at: COVER_ASIDE }, ...show(...KEYS_UNDER_COVER, 'batteries') },
      steps: [
        {
          id: 'bd-reset', title: '重置：重置针长按 5 秒', page: 4,
          desc: '把重置针插入重置孔，长按 5 秒，听到语音提示后松开，重置完成。',
          tip: '说明书注意：重置成功后用户为空，门锁无法正常上锁，请尽快完成门锁设置。',
          camera: { target: [45, 680, -70], dir: [-0.3, 0.45, -1], dist: 400 },
          set: { pin: { visible: true, plug: { hole: 'r-reset', back: 40 }, dur: 1.2 } },
          highlight: ['pin'],
          actions: [{ type: 'shake', part: 'pin', axis: 'x', amp: 0.6 }],
          zoom: { target: 'pin', dir: [-0.6, 0.5, -1], dist: 120, caption: '长按 5 秒，听到语音提示后松开' },
        },
        {
          id: 'bd-app', title: '打开米家 APP，点右上角「+」', page: 4,
          desc: '打开米家 APP 首页，在页面右上角点击「+」，根据 APP 提示方式添加设备。',
          tip: '门锁添加成功后，会自动连接账号下的蓝牙网关，无需配置。门锁的蓝牙通讯有效距离为 10 m。',
          camera: PHONE_IN_VIEW,
          set: { pin: { visible: false, dur: 0.3 }, phone: { visible: true }, 'phone-screen': { ui: UI_HOME } },
          highlight: ['phone-screen'],
        },
        {
          id: 'bd-pair', title: '短按「配对」键，APP 发现门锁', page: 3,
          desc: '按 APP 提示短按后面板的蓝牙配对键，APP 里出现「小米智能门锁」，点连接。',
          tip: '说明书 P3：蓝牙配对键，短按进行蓝牙配对。具体提示以 APP 为准。',
          camera: PHONE_IN_VIEW,
          set: { 'phone-screen': { ui: UI_FOUND } },
          highlight: ['phone-screen'],
          actions: [{ type: 'press', part: 'r-pair', depth: 1 }],
          zoom: { target: 'r-pair', dir: [-0.25, 0.4, -1], dist: 90, caption: '短按「配对」键' },
        },
        {
          id: 'bd-admin', title: '添加首个用户（管理员）', page: 4,
          desc: '进入门锁设备页面，按照 APP 提示添加首个用户，默认为管理员。',
          tip: '说明书注意：未添加用户状态下，门锁无法正常上锁。',
          camera: PHONE_IN_VIEW,
          set: { 'phone-screen': { ui: UI_ADMIN } },
          highlight: ['phone-screen'],
        },
        {
          id: 'bd-finger', title: '到门外录入指纹', page: 4,
          desc: '拿着手机到门外，按 APP 提示把手指轻按在前面板把手根部的指纹识别区，抬起再按，直到录入完成。',
          tip: '录入次数和手势以 APP 提示为准。官网规格：最多 50 个指纹、50 组密码、25 张 NFC。',
          camera: PHONE_OUT_VIEW,
          set: { phone: { ...PHONE_OUT, dur: 1.6 }, 'phone-screen': { ui: UI_FINGER, delay: 1 } },
          highlight: ['phone-screen'],
          zoom: { target: 'f-finger', dir: [0.3, 0.25, 1], dist: 110, caption: '手指轻按把手根部的指纹识别区' },
        },
        {
          id: 'bd-local', title: '本地设置：短按「设置」键', page: 6,
          desc: '不用手机也能设置：短按电池盖下的「设置」键，验证管理员指纹或密码后，可添加 / 删除普通用户指纹、密码，设置音量和语音语言（中 / 英）。',
          tip: '说明书 P3 提示：进入设置模式前，请先使用米家 APP 完成添加门锁、添加用户。',
          camera: REAR_TOP,
          highlight: ['r-set'],
          actions: [{ type: 'press', part: 'r-set', depth: 1 }],
          zoom: { target: 'r-set', dir: [-0.2, 0.4, -1], dist: 90, caption: '短按「设置」键进入设置模式' },
          callouts: [{ part: 'r-mute', text: '静音开关', sub: '右：关闭静音 · 左：开启静音', offset: [60, -40, 0] }],
        },
        {
          id: 'bd-close', title: '盖回电池盖', page: 3,
          desc: '设置完成后盖回电池盖。',
          tip: '说明书 P3：电池盖从面板底边打开 / 扣合。',
          camera: { target: [60, 600, -60], dir: [-0.35, 0.35, -1], dist: 650 },
          set: {
            'r-cover': { at: [0, 0, 0], dur: 1 },
            ...Object.fromEntries([...KEYS_UNDER_COVER, 'batteries'].map((id) => [id, { visible: false, dur: 0.5 }])),
          },
          highlight: ['r-cover'],
        },
      ],
    },

    // ================= 日常开锁 =================
    {
      id: 'daily', title: '日常开锁与上锁', kind: 'usage',
      start: { bolts: { at: BOLTS_OUT } },
      steps: [
        {
          id: 'use-finger', title: '指纹验证：手指轻按识别区', page: 5,
          desc: '把添加过指纹的手指轻按在指纹识别区。验证成功：指示灯圈白色旋转，播放成功音效（未静音时）。',
          camera: FRONT_HANDLE,
          set: { 'f-ring': { light: 'on', color: RING_OK } },
          highlight: ['f-finger', 'f-ring'],
          zoom: zoomRing('白色旋转 = 验证成功（画面用浅蓝示意）'),
        },
        {
          id: 'use-open', title: '下压把手开门', page: 5,
          desc: '验证成功后下压把手，斜舌和方舌缩回，推门进屋。',
          camera: { target: [150, 600, -40], dir: [0.25, 0.8, 1], dist: 1350 },
          set: {
            'f-ring': { light: 'off' },
            'f-handle': { rot: [0, 0, -35], dur: 0.6 },
            latch: { at: LATCH_IN, delay: 0.2, dur: 0.4 },
            bolts: { at: BOLTS_IN, delay: 0.2, dur: 0.4 },
            door: { rot: DOOR_OPEN, delay: 0.8, dur: 1.4 },
          },
          highlight: ['f-handle'],
          chips: [{ label: '下压把手', sub: '斜舌、方舌缩回' }],
        },
        {
          id: 'use-lock', title: '关门后上提把手上锁', page: 5,
          desc: '关上门，斜舌弹进门扣板；再上提把手，方舌伸出，门就锁上了。室内、室外都是上提把手上锁。',
          tip: '门没关好或没上锁时，前后面板的未锁告警会闪烁（P2、P3）。',
          chips: [{ label: '上锁', sub: '关门后上提把手' }],
          camera: { target: [80, 560, 60], dir: [0.3, 0.35, 1], dist: 700 },
          set: {
            door: { rot: [0, 0, 0], dur: 1.3 },
            latch: { at: LATCH_OUT, delay: 1.35, dur: 0.25 },
            'f-handle': { rot: [0, 0, 30], delay: 1.5, dur: 0.5 },
            bolts: { at: BOLTS_OUT, delay: 1.7, dur: 0.5 },
          },
          highlight: ['f-handle'],
        },
        {
          id: 'use-code', title: '密码或 NFC 验证', page: 5,
          desc: '密码开锁：输入密码，按确认键 ✓。NFC 开锁：把添加过的 NFC 设备贴近识别区。验证成功后同样下压把手开锁。',
          chips: [{ label: '密码', sub: '最多 50 组' }, { label: 'NFC', sub: '最多 25 张' }],
          camera: FRONT_KEYPAD,
          set: { 'f-handle': { rot: [0, 0, 0], dur: 0.4 }, 'f-ring': { light: 'on', color: RING_OK, delay: 0.6 } },
          highlight: ['f-keys', 'f-ring'],
          callouts: [
            { part: 'f-keys', at: [17, -11.5, 0], text: '输完密码按 ✓', offset: [70, 10, 0] },
            { part: 'f-nfc', text: 'NFC 识别区', sub: '贴近添加过的设备', offset: [-90, -15, 0] },
          ],
        },
        {
          id: 'use-inside', title: '室内开锁：按住按钮下压把手', page: 5,
          desc: '在室内按住后面板把手上的防猫眼开锁按钮，再下压把手开锁。',
          tip: '防猫眼开锁按钮防止有人从猫眼伸工具进来直接压把手。',
          camera: { target: [90, 530, -80], dir: [-0.3, 0.35, -1], dist: 520 },
          set: {
            'f-ring': { light: 'off' },
            'r-handle': { rot: [0, 0, 35], delay: 0.5, dur: 0.6 },
            latch: { at: LATCH_IN, delay: 0.7, dur: 0.4 },
            bolts: { at: BOLTS_IN, delay: 0.7, dur: 0.4 },
          },
          highlight: ['r-button', 'r-handle'],
          actions: [{ type: 'press', part: 'r-button', depth: 2, delay: 0 }],
          callouts: [{ part: 'r-button', text: '防猫眼开锁按钮', sub: '按住再下压把手', offset: [70, 55, 0] }],
        },
        {
          id: 'use-deadlock', title: '室内反锁：旋钮压到底再转平', page: 5,
          desc: '在室内把反锁旋钮压到底，再旋转至水平，门就反锁了。',
          camera: { target: [60, 430, -80], dir: [-0.3, 0.3, -1], dist: 420 },
          set: {
            'r-handle': { rot: [0, 0, 0], dur: 0.4 },
            latch: { at: LATCH_OUT, delay: 0.4, dur: 0.3 },
            'r-knob': { rot: [90, 90, 0], delay: 0.7, dur: 0.8 },
            bolts: { at: BOLTS_OUT, delay: 0.9, dur: 0.5 },
          },
          highlight: ['r-knob'],
          actions: [{ type: 'press', part: 'r-knob', depth: 3, delay: 0 }],
          zoom: { target: 'r-knob', dir: [-0.15, 0.25, -1], dist: 130, caption: '压到底，再转到水平 = 反锁' },
        },
      ],
    },

    // ================= 应急开锁 =================
    {
      id: 'emergency', title: '验证失败、没电与应急钥匙', kind: 'repair',
      start: { bolts: { at: BOLTS_OUT } },
      steps: [
        {
          id: 'em-fail', title: '灯圈红色闪烁：验证失败', page: 5,
          desc: '验证失败时，指示灯圈红色闪烁，并播放失败音效。重新用已添加的指纹、密码或 NFC 验证。',
          tip: '指纹按不上时，先擦干手指和识别区再试（通用建议）。',
          camera: FRONT_HANDLE,
          set: { 'f-ring': { light: 'blink', color: RING_FAIL } },
          highlight: ['f-ring', 'f-finger'],
          zoom: zoomRing('红色闪烁 = 验证失败'),
        },
        {
          id: 'em-battery', title: '电量告警闪烁：尽快换电池', page: 2,
          desc: '前面板的电量告警灯闪烁，表示电池电量低。到门内打开电池盖，换上 8 节新的 5 号电池。',
          tip: '换电池的位置见「安装锁体与面板」第 14 步。建议使用原装电池（P4）。',
          chips: [{ label: '电池', sub: '8 节 5 号（6 V）' }],
          camera: FRONT_KEYPAD,
          set: { 'f-ring': { light: 'off' }, 'led-batt': { light: 'blink' } },
          highlight: ['led-batt'],
          zoom: { target: 'led-batt', dir: [0.15, 0.2, 1], dist: 70, caption: '电量告警闪烁 = 电池电量低' },
          callouts: [
            { part: 'led-lock', text: '未锁告警', sub: '闪烁：门未关好 / 门未锁', offset: [-45, -30, 0] },
            { part: 'led-dual', text: '双重验证', sub: '亮起：已开启', offset: [-45, 35, 0] },
          ],
        },
        {
          id: 'em-usb', title: '电池耗尽：Micro-USB 应急供电', page: 2,
          desc: '电池没电进不了门时，用充电宝接前面板底部的应急供电口（Micro-USB），供上电后再验证开锁。',
          tip: '说明书只标注了「应急供电口（Micro-USB）」和「Micro-USB 应急供电（5 V）」，接充电宝后验证开锁为推断用法，以官方客服为准。',
          chips: [{ label: '应急供电', sub: 'Micro-USB · 5 V' }],
          camera: { target: [100, 330, 90], dir: [0.55, 0.12, 1], dist: 560 },
          set: { powerbank: { visible: true }, 'usb-plug': { visible: true, plug: { hole: 'f-usb', back: 40 }, delay: 0.3, dur: 1.3 } },
          highlight: ['usb-plug'],
          zoom: { target: 'usb-plug', dir: [0.35, -0.5, 1], dist: 110, caption: '应急供电口在前面板底面' },
        },
        {
          id: 'em-key-press', title: '应急钥匙 ①：按下盖板', page: 5,
          desc: '按下前面板上的应急钥匙孔盖板。',
          camera: FRONT_LOWER,
          set: { ...hide('usb-plug', 'powerbank'), 'led-batt': { light: 'off' } },
          highlight: ['f-cover'],
          actions: [{ type: 'press', part: 'f-cover', depth: 1.5, delay: 0.4 }],
          zoom: { target: 'f-cover', dir: [0.25, 0.2, 1], dist: 100, caption: '① 按下应急钥匙孔盖板' },
        },
        {
          id: 'em-key-turn', title: '应急钥匙 ②：盖板弹起后旋转', page: 5,
          desc: '盖板弹起后把它旋转开，露出应急钥匙孔。',
          camera: FRONT_LOWER,
          set: { 'f-cover': { at: [0, -54, 28], rot: [90, 180, 0], dur: 1 } },
          highlight: ['f-cover', 'f-keyhole'],
          zoom: { target: 'f-keyhole', dir: [0.2, 0.2, 1], dist: 90, caption: '② 盖板转开，露出钥匙孔' },
        },
        {
          id: 'em-key-open', title: '应急钥匙 ③：插入钥匙旋转开锁', page: 5,
          desc: '插入应急钥匙，旋转钥匙开锁，方舌、斜舌缩回。',
          tip: '说明书注意：请勿将应急钥匙锁在屋内。',
          chips: [{ label: '应急钥匙', sub: '包装内 2 把' }],
          camera: { target: [70, 460, 70], dir: [0.5, 0.3, 1], dist: 420 },
          set: {
            'key-holder': { visible: true, plug: { hole: 'f-keyhole', back: 40 }, dur: 1.2 },
            key: { rot: [90, 0, 0], delay: 1.3, dur: 0.6 },
            latch: { at: LATCH_IN, delay: 1.9, dur: 0.4 },
            bolts: { at: BOLTS_IN, delay: 1.9, dur: 0.4 },
          },
          highlight: ['key'],
          zoom: { target: 'key', dir: [0.7, 0.3, 1], dist: 130, caption: '③ 插入钥匙，旋转开锁' },
        },
      ],
    },
  ],
}
