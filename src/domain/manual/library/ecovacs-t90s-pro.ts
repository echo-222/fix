import type { CameraSpec, Fill, ManualSpec, PartState, ScreenUI, Shape, SpecPart, SpecStep, Vec3 } from '../types'

/**
 * 科沃斯 地宝 T90S PRO 上下水（扫拖机器人 + 全能基站，自动上下水）
 * 官方 PDF 32 页：P4–6 部件 / 指示灯，P8–12 安装、配网、充电、清洁液、启动清扫，P13–22 保养，P23–26 排查，P27 参数。
 *
 * 场景：地面 y=0，观众在 +z。全能基站放在中间靠后（世界 z=-150），斜坡底座朝前；背面接上下水与电源。
 * 基站局部：前方 +z，右侧 +x；机身 338×285×247（含斜坡底座总深 459）。上部是集尘仓（左侧两个清洁液盒、右侧尘袋，
 * 前面一块可取下的集尘仓盖板），下部前方是停靠凹位（后壁充电极片，底部清洁槽），上部悬挑在凹位上方。
 * 背面：电源接口在上部偏右，排水口、进水口在右侧走管槽（p5 / p8 背视图量取）。上水立管、工字接头与地漏在基站右后方，
 * 插线板在左后方（代替 p8 的墙插，免得墙体挡住背面镜头）。
 * 地宝局部：前方 +z（停靠时倒车入站，正面朝向观众），右侧 -x；机身 φ352 × 95。顶部面盖上 Y 形按键 + 指示灯；
 * 面盖下（地宝自身右侧）电源开关「I/O」与重置键（网络状态灯），中间尘盒；底部：右前边刷、前万向轮、中部滚刷、
 * 两侧驱动轮、后部滚筒拖布与接水槽；背面充电极片与补水口，右后侧滚筒释放键。
 * 翻面绕 z 轴 180°：前方仍朝观众，地宝右侧（边刷、释放键）转到画面右侧。
 *
 * 推断（说明书未给）：基站内部分隔与尘袋 / 液盒尺寸、停靠凹位深度、极片高度（取 80 mm 与地宝背面对齐）、
 * 背面接口坐标、面盖下按键位置与「I」方向、尘盒 / 滚刷 / 滚筒 / 驱动轮尺寸、指示灯在 Y 键交汇处、浮球位置；
 * 白灯用浅冷白 #cfe6ff 显示，「呼吸」用闪烁近似；手机横握以便界面可读。
 */

type Item = Shape & { at?: Vec3; rot?: Vec3; fill?: Fill }

// ---------- 基站 ----------
const ST_Z = -150
const COVER_AT: Vec3 = [0, 185.5, 139.4]
const BAG_AT: Vec3 = [43, 184, 70]
const BLUE_AT: Vec3 = [-141, 182, 72]
const BLACK_AT: Vec3 = [-101, 182, 72]
const TROUGH_AT: Vec3 = [0, 0, 19]
/** 托盘是浅盘（底 5 mm + 围边到 7 mm），滤网搁在底面上、不嵌进实体，取出时一开始就不穿插 */
const FILTER_AT: Vec3 = [0, 5.2, 0]
const RAMP_AT: Vec3 = [0, 0, 195.75]
const PORT_ROT: Vec3 = [0, 180, 0]

// ---------- 地宝 ----------
/** 停靠（基站局部）：后背离极片 1 mm，轮子压在斜坡底座上（底座高 7） */
const DOCK_AT: Vec3 = [0, 7, 143]
const FRONT_AT: Vec3 = [0, 0, 400]
const SIDE_AT: Vec3 = [420, 0, 240]
const LID_AT: Vec3 = [0, 93.25, -14]
const PWR = { x: -58, z: 112, y: 90, on: -50.5, off: -65.5 }
const RESET = { x: -28, z: 112 }
const DUSTBOX_AT: Vec3 = [0, 67.7, -16]
/** 翻面：面盖已取下，面盖下最高的拨钮 / 重置键离地 0.1 mm */
const FLIP_AT: Vec3 = [0, 90.9, 400]
const FLIPPED: Vec3 = [0, 0, 180]

const DOCK: PartState = { parent: 'station', at: DOCK_AT, rot: [0, 0, 0] }
const IN: PartState = { ...DOCK, lift: 14, dur: 1.8 }
const OUT: PartState = { parent: null, at: FRONT_AT, rot: [0, 0, 0], lift: 14, dur: 1.8 }
const SIDE: PartState = { parent: null, at: SIDE_AT, rot: [0, -35, 0] }

/** 面盖取下放到地宝旁边：先竖直抬起再横移，避免擦过机身 */
const LID_VIA_FRONT: Vec3 = [-300, 200, 400]
const LID_VIA_SIDE: Vec3 = [420, 200, 470]
const LID_OFF_FRONT: PartState = { parent: null, at: [-420, 2.25, 400], rot: [0, 0, 0], via: LID_VIA_FRONT, dur: 1.3 }
const LID_OFF_SIDE: PartState = { parent: null, at: [420, 2.25, 600], rot: [0, 0, 0], via: LID_VIA_SIDE, dur: 1.3 }
const lidOn = (via: Vec3): PartState => ({ parent: 'robot', at: LID_AT, rot: [0, 0, 0], via, dur: 1.3 })

// ---------- 灯色 ----------
const WHITE = '#cfe6ff'
const RED = '#ff3b30'

// ---------- 形体小工具 ----------
const box = (size: Vec3, at: Vec3, o: { chamfer?: number; rot?: Vec3; fill?: Fill } = {}): Item => ({ type: 'box', size, at, ...o })
const cyl = (r: number, h: number, at: Vec3, o: { axis?: 'x' | 'y' | 'z'; fill?: Fill } = {}): Item => ({ type: 'cylinder', r, h, at, ...o })
const hole = (w: number, h: number, at: Vec3, rot: Vec3, o: { r?: number; fill?: Fill } = {}): Item => ({ type: 'hole', w, h, at, rot, ...o })
const UP: Vec3 = [-90, 0, 0]
const DOWN: Vec3 = [90, 0, 0]

// ---------- 零件 ----------
const parts: SpecPart[] = [
  // ===== 全能基站 =====
  {
    id: 'station', name: '全能基站', spec: '338 × 285 × 247 mm（含斜坡底座深 459 mm）',
    at: [0, 0, ST_Z],
    shape: {
      type: 'compound',
      items: [
        // 上部集尘仓：顶板、底板（凹位顶）、后段、两侧壁、液盒 / 尘袋分隔
        box([338, 8, 285], [0, 243, 0]),
        box([338, 12, 285], [0, 126, 0]),
        box([338, 107, 125], [0, 185.5, -80]),
        box([8, 107, 160], [-165, 185.5, 62.5]),
        box([8, 107, 160], [165, 185.5, 62.5]),
        box([6, 107, 150], [-78, 185.5, 57.5]),
        // 下部：后段与停靠凹位两侧壁
        box([338, 120, 102.5], [0, 60, -91.25]),
        box([15, 120, 83], [-161.5, 60, 1.5]),
        box([15, 120, 83], [161.5, 60, 1.5]),
        // 背面：铭牌、散热孔、竖向走管槽
        hole(110, 36, [0, 172, -142.65], PORT_ROT, { r: 3, fill: 'white' }),
        hole(30, 40, [72, 70, -142.65], PORT_ROT, { r: 2, fill: 'dark' }),
        hole(16, 92, [152, 80, -142.65], PORT_ROT, { r: 6, fill: 'shade' }),
      ],
    },
  },
  {
    id: 'st-cover', name: '集尘仓盖板', parent: 'station', at: COVER_AT,
    shape: { type: 'compound', items: [box([320, 106, 6], [0, 0, 0], { chamfer: 1.5 }), hole(44, 9, [-118, 44, 3.05], [0, 0, 0], { r: 4, fill: 'dark' })] },
  },
  {
    id: 'dust-bag', name: '一次性尘袋', spec: '提手取出时自动封口', parent: 'station', at: BAG_AT,
    shape: {
      type: 'compound',
      items: [
        box([200, 98, 120], [0, 0, 0], { chamfer: 5, fill: 'warm' }),
        hole(56, 56, [100.05, 0, -6], [0, 90, 0], { r: 28, fill: 'dark' }),
        box([70, 14, 6], [0, 22, 63], { fill: 'shade' }),
      ],
    },
  },
  {
    id: 'fluid-blue', name: '蓝盒 · 清洁消毒液', parent: 'station', at: BLUE_AT, fill: 'shade',
    shape: { type: 'compound', items: [box([34, 92, 110], [0, 0, 0], { chamfer: 3 }), cyl(8, 6, [0, 49, 30], { fill: 'white' })] },
  },
  {
    id: 'fluid-black', name: '黑盒 · 重污清洁液', parent: 'station', at: BLACK_AT, fill: 'dark',
    shape: { type: 'compound', items: [box([34, 92, 110], [0, 0, 0], { chamfer: 3 }), cyl(8, 6, [0, 49, 30], { fill: 'white' })] },
  },
  {
    id: 'dock-contacts', name: '全能基站充电极片', parent: 'station', at: [0, 80, -37],
    shape: {
      type: 'compound',
      items: [
        box([150, 44, 6], [0, 0, 0], { chamfer: 2 }),
        hole(22, 12, [-48, 0, 3.05], [0, 0, 0], { r: 2, fill: 'shade' }),
        hole(22, 12, [48, 0, 3.05], [0, 0, 0], { r: 2, fill: 'shade' }),
        // 补水 / 抽水嘴（后壁）
        hole(12, 12, [-10, -37, -2.95], [0, 0, 0], { r: 6, fill: 'dark' }),
        hole(12, 12, [10, -37, -2.95], [0, 0, 0], { r: 6, fill: 'dark' }),
      ],
    },
  },
  {
    id: 'trough', name: '清洁槽（托盘）', parent: 'station', at: TROUGH_AT,
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 260, d: 112, h: 5, r: 4, at: [0, 0, 0] },
        box([260, 2, 4], [0, 6, 54]),
        box([260, 2, 4], [0, 6, -54]),
        box([4, 2, 104], [128, 6, 0]),
        box([4, 2, 104], [-128, 6, 0]),
        hole(220, 76, [0, 5.05, 0], UP, { r: 8, fill: 'dark' }),
      ],
    },
  },
  { id: 'trough-filter', name: '清洁槽可替换滤网', parent: 'trough', at: FILTER_AT, fill: 'shade', shape: { type: 'slab', w: 200, d: 60, h: 1.5, r: 3 } },
  { id: 'float', name: '浮球', parent: 'trough', at: [-117, 9.1, 30], shape: { type: 'cylinder', r: 7, h: 8 } },
  {
    id: 'ramp', name: '基站斜坡底座', parent: 'station', at: RAMP_AT,
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 330, d: 241.5, h: 7, r: 6, at: [0, 0, 0] },
        hole(72, 200, [-125, 7.05, 0], UP, { r: 8, fill: 'shade' }),
        hole(72, 200, [125, 7.05, 0], UP, { r: 8, fill: 'shade' }),
        hole(60, 40, [0, 7.05, 80], UP, { r: 4, fill: 'shade' }),
      ],
    },
  },
  { id: 'port-power', name: '电源接口', parent: 'station', at: [47, 212, -142.7], rot: PORT_ROT, fill: 'dark', shape: { type: 'hole', w: 10, h: 18, r: 4 } },
  { id: 'port-drain', name: '排水口', parent: 'station', at: [152, 135, -142.7], rot: PORT_ROT, fill: 'dark', shape: { type: 'hole', w: 16, h: 16, r: 8 } },
  { id: 'port-inlet', name: '进水口', parent: 'station', at: [112, 35, -142.7], rot: PORT_ROT, fill: 'dark', shape: { type: 'hole', w: 12, h: 12, r: 6 } },

  // ===== 上下水与电源（场景道具）：接口零件写在插头之前 =====
  { id: 'floor-drain', name: '地漏', spec: '在基站侧面', at: [300, 0.06, -215], rot: UP, fill: 'dark', shape: { type: 'hole', w: 80, h: 80, r: 40 } },
  {
    id: 'strip', name: '插线板', at: [-330, 0, -345],
    shape: {
      type: 'compound',
      items: [
        { type: 'slab', w: 220, d: 60, h: 32, r: 8, at: [0, 0, 0] },
        hole(26, 20, [10, 32.05, 0], UP, { r: 4, fill: 'dark' }),
        hole(26, 20, [60, 32.05, 0], UP, { r: 4, fill: 'dark' }),
        box([16, 4, 22], [-88, 33, 0], { chamfer: 1, fill: 'shade' }),
      ],
    },
  },
  { id: 'strip-socket', name: '插座', parent: 'strip', at: [-40, 32.05, 0], rot: UP, fill: 'dark', shape: { type: 'hole', w: 26, h: 20, r: 4 } },
  { id: 'riser', name: '上水立管', at: [300, 200, -340], fill: 'shade', shape: { type: 'cylinder', r: 11, h: 400 } },
  {
    id: 'tee', name: '工字接头 + 前置过滤器', parent: 'riser', at: [0, 60, 0],
    shape: {
      type: 'compound',
      items: [
        box([28, 40, 28], [0, 0, 0], { chamfer: 3, fill: 'shade' }),
        box([8, 8, 34], [0, 10, 26], { fill: 'dark' }),
        cyl(6, 46, [-37, 0, 0], { axis: 'x', fill: 'shade' }),
        cyl(20, 56, [-75, -20, 0]),
        cyl(22, 8, [-75, 12, 0], { fill: 'shade' }),
        cyl(4, 16, [-75, -56, 0], { fill: 'shade' }),
      ],
    },
  },
  {
    id: 'inlet-fit', name: '进水管快插接头', at: [230, 8, -420],
    shape: { type: 'compound', items: [cyl(3.5, 10, [5, 0, 0], { axis: 'x', fill: 'shade' }), cyl(7, 22, [-11, 0, 0], { axis: 'x' })] },
  },
  {
    id: 'hose-in', name: '进水软管', spec: '随机附带的新软管',
    shape: { type: 'cable', from: { part: 'tee', at: [-75, -64, 0], dir: [0, -1, 0] }, to: { part: 'inlet-fit', at: [-22, 0, 0], dir: [-1, 0, 0] }, r: 4, slack: 0.9 },
  },
  {
    id: 'drain-fit', name: '专用排水接头', spec: '扫地机器人专用（三分管）', at: [200, 10, -420],
    shape: { type: 'compound', items: [cyl(5.5, 10, [5, 0, 0], { axis: 'x', fill: 'shade' }), cyl(9, 26, [-13, 0, 0], { axis: 'x' })] },
  },
  {
    id: 'drain-end', name: '排水管出水端', at: [360, 10, -260],
    shape: { type: 'compound', items: [cyl(8, 36, [-18, 0, 0], { axis: 'x' }), cyl(10, 6, [-3, 0, 0], { axis: 'x', fill: 'shade' })] },
  },
  {
    id: 'hose-out', name: '排水波纹管',
    shape: { type: 'cable', from: { part: 'drain-fit', at: [-26, 0, 0], dir: [-1, 0, 0] }, to: { part: 'drain-end', at: [-36, 0, 0], dir: [-1, 0, 0] }, r: 5, slack: 1.1 },
  },
  {
    id: 'power-dc', name: '基站电源插头', at: [-250, 13, -400],
    shape: { type: 'compound', items: [box([8, 12, 6], [4, 0, 0], { fill: 'shade' }), box([18, 22, 12], [-9, -2, 0], { chamfer: 2.5 })] },
  },
  {
    id: 'power-ac', name: '电源插头', spec: '220–240 V~', at: [-200, 18, -420],
    shape: {
      type: 'compound',
      items: [box([10, 1.6, 6.5], [5, 0, 5.5], { fill: 'shade' }), box([10, 1.6, 6.5], [5, 0, -5.5], { fill: 'shade' }), box([30, 26, 36], [-15, 0, 0], { chamfer: 3 })],
    },
  },
  {
    id: 'cord', name: '基站电源线',
    shape: { type: 'cable', from: { part: 'power-dc', at: [-12, -13, 0], dir: [0, -1, 0] }, to: { part: 'power-ac', at: [-30, 0, 0], dir: [-1, 0, 0] }, r: 3, slack: 1 },
  },

  // ===== 地宝 =====
  {
    id: 'robot', name: '地宝 T90S PRO', spec: '353 × 351 × 95 mm', parent: 'station', at: DOCK_AT,
    shape: {
      type: 'compound',
      items: [
        cyl(176, 80, [0, 50, 0]),
        // 驱动轮（不单独拆装，并进机身）
        cyl(32, 22, [128, 32, -5], { axis: 'x' }),
        cyl(32, 22, [-128, 32, -5], { axis: 'x' }),
        // 底面凹位（朝下）
        hole(190, 60, [0, 9.9, 25], DOWN, { r: 6, fill: 'dark' }),
        hole(224, 68, [0, 9.9, -100], DOWN, { r: 8, fill: 'dark' }),
        hole(30, 72, [128, 9.9, -5], DOWN, { r: 6, fill: 'dark' }),
        hole(30, 72, [-128, 9.9, -5], DOWN, { r: 6, fill: 'dark' }),
        hole(44, 44, [0, 9.9, 130], DOWN, { r: 22, fill: 'dark' }),
        hole(110, 28, [0, 9.9, 82], DOWN, { r: 4, fill: 'shade' }),
        // 尘盒仓（尘盒取出后可见）
        hole(150, 88, [0, PWR.y + 0.05, -16], UP, { r: 2, fill: 'dark' }),
      ],
    },
  },
  {
    id: 'front-sensors', name: '导航模组 · AIVI 摄像头 · 避障模组', parent: 'robot', at: [0, 0, 0],
    shape: {
      type: 'compound',
      items: [
        box([74, 26, 12], [0, 46, 171], { chamfer: 3, fill: 'dark' }),
        hole(16, 9, [-14, 50, 177.05], [0, 0, 0], { r: 3, fill: 'white' }),
        hole(16, 9, [14, 50, 177.05], [0, 0, 0], { r: 3, fill: 'white' }),
        hole(30, 4, [0, 39, 177.05], [0, 0, 0], { r: 1.5, fill: 'white' }),
        ...[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((a) => box([28, 8, 4], [175.5 * Math.sin((a * Math.PI) / 180), 70, 175.5 * Math.cos((a * Math.PI) / 180)], { rot: [0, a, 0], fill: 'dark' })),
      ],
    },
  },
  { id: 'lid', name: '面盖', parent: 'robot', at: LID_AT, shape: { type: 'cylinder', r: 160, h: 4.5 } },
  {
    id: 'btn', name: '地宝按键', spec: '短按开始 / 暂停 · 长按 3 秒回充', parent: 'lid', at: [0, 2.85, 120],
    shape: {
      type: 'compound',
      items: [
        box([7, 1.2, 20], [0, 0, 10], { chamfer: 0.5 }),
        box([7, 1.2, 22], [8.43, 0, -7.07], { chamfer: 0.5, rot: [0, -50, 0] }),
        box([7, 1.2, 22], [-8.43, 0, -7.07], { chamfer: 0.5, rot: [0, 50, 0] }),
      ],
    },
  },
  { id: 'robot-led', name: '地宝指示灯', parent: 'lid', at: [0, 3.5, 120], rot: UP, shape: { type: 'led', r: 4, color: WHITE } },
  { id: 'power-slot', name: '电源开关槽', parent: 'robot', at: [PWR.x, PWR.y + 0.05, PWR.z], rot: UP, fill: 'dark', shape: { type: 'hole', w: 22, h: 8, r: 3 } },
  { id: 'power-knob', name: '电源开关', spec: '「I」开机 /「O」关机', parent: 'robot', at: [PWR.on, PWR.y, PWR.z], shape: { type: 'box', size: [7, 1.6, 6], chamfer: 0.6 } },
  { id: 'sw-on', name: 'I', parent: 'robot', at: [-42, PWR.y + 0.08, PWR.z], rot: UP, shape: { type: 'text', text: 'I', size: 5 } },
  { id: 'sw-off', name: 'O', parent: 'robot', at: [-74, PWR.y + 0.08, PWR.z], rot: UP, shape: { type: 'text', text: 'O', size: 5 } },
  { id: 'reset-key', name: '重置键', spec: '兼网络状态指示', parent: 'robot', at: [RESET.x, PWR.y, RESET.z], shape: { type: 'cylinder', r: 4.5, h: 1.6 } },
  { id: 'wifi-led', name: 'Wi-Fi 指示灯', parent: 'robot', at: [RESET.x, PWR.y + 0.85, RESET.z], rot: UP, shape: { type: 'led', r: 2.6, color: WHITE } },
  { id: 'qr', name: '机身二维码', parent: 'robot', at: [42, PWR.y + 0.05, 100], rot: UP, fill: 'dark', shape: { type: 'hole', w: 20, h: 20, r: 1 } },
  {
    id: 'dustbox', name: '尘盒', parent: 'robot', at: DUSTBOX_AT, fill: 'warm',
    shape: { type: 'compound', items: [box([150, 46, 88], [0, 0, 0], { chamfer: 2 }), hole(44, 12, [0, 23.05, 26], UP, { r: 4, fill: 'dark' })] },
  },
  { id: 'filter', name: '滤芯', parent: 'dustbox', at: [0, 10, -5], fill: 'shade', shape: { type: 'box', size: [110, 12, 50], chamfer: 1 } },
  {
    id: 'robot-contacts', name: '地宝充电极片', parent: 'robot', at: [0, 72, -169.4], rot: [0, 180, 0],
    shape: {
      type: 'compound',
      items: [hole(20, 9, [-48, 0, 0.05], [0, -15.84, 0], { r: 2, fill: 'shade' }), hole(20, 9, [48, 0, 0.05], [0, 15.84, 0], { r: 2, fill: 'shade' })],
    },
  },
  { id: 'refill-port', name: '补水口', parent: 'robot', at: [0, 36, -176.05], rot: PORT_ROT, fill: 'dark', shape: { type: 'hole', w: 26, h: 9, r: 4 } },
  { id: 'roller-key', name: '滚筒释放键', parent: 'robot', at: [-146, 32, -100], rot: [0, 0, 90], fill: 'shade', shape: { type: 'box', size: [12, 8, 14], chamfer: 1.5 } },
  { id: 'caster', name: '万向轮', parent: 'robot', at: [0, 10, 130], shape: { type: 'cylinder', r: 9.5, h: 12, axis: 'x' } },
  {
    id: 'side-brush', name: '边刷', parent: 'robot', at: [-105, 2, 108],
    shape: {
      type: 'compound',
      items: [
        cyl(11, 5, [0, 2.5, 0]),
        hole(5, 5, [0, -0.05, 0], DOWN, { r: 2.5, fill: 'dark' }),
        ...[90, 210, 330].map((p) => box([58, 1.5, 4], [37 * Math.cos((p * Math.PI) / 180), 1.5, 37 * Math.sin((p * Math.PI) / 180)], { rot: [0, -p, 0] })),
      ],
    },
  },
  { id: 'main-brush', name: '滚刷', parent: 'robot', at: [0, 22, 25], shape: { type: 'cylinder', r: 20, h: 170, axis: 'x' } },
  {
    id: 'brush-cover', name: '滚刷盖板', parent: 'robot', at: [0, 8.5, 25],
    shape: {
      type: 'compound',
      items: [
        box([200, 3, 8], [0, 0, 32]),
        box([200, 3, 8], [0, 0, -32]),
        box([8, 3, 72], [100, 0, 0]),
        box([8, 3, 72], [-100, 0, 0]),
        box([12, 3, 6], [40, 0, -38], { fill: 'shade' }),
        box([12, 3, 6], [-40, 0, -38], { fill: 'shade' }),
      ],
    },
  },
  {
    id: 'water-tray', name: '接水槽', parent: 'robot', at: [0, 6, -62],
    shape: { type: 'compound', items: [box([230, 8, 14], [0, 0, 0], { chamfer: 1 }), box([10, 3, 8], [100, -2, 0], { fill: 'shade' })] },
  },
  { id: 'roller', name: '可替换滚筒拖布', parent: 'robot', at: [0, 28.5, -100], shape: { type: 'cylinder', r: 28, h: 212, axis: 'x' } },
  {
    id: 'cliff', name: '下视感应器 · 地毯传感器', parent: 'robot', at: [0, 0, 0],
    shape: {
      type: 'compound',
      items: [
        hole(14, 8, [55, 9.9, 160], DOWN, { r: 2, fill: 'dark' }),
        hole(14, 8, [-55, 9.9, 160], DOWN, { r: 2, fill: 'dark' }),
        hole(8, 14, [150, 9.9, 60], DOWN, { r: 2, fill: 'dark' }),
        hole(8, 14, [-150, 9.9, 60], DOWN, { r: 2, fill: 'dark' }),
        hole(14, 14, [-62, 9.9, 118], DOWN, { r: 7, fill: 'dark' }),
      ],
    },
  },

  // ===== 工具与手机 =====
  {
    id: 'screwdriver', name: '螺丝刀', spec: '十字', at: [300, 10, 530], visible: false,
    shape: { type: 'compound', items: [cyl(2.5, 70, [35, 0, 0], { axis: 'x', fill: 'shade' }), cyl(10, 75, [-37.5, 0, 0], { axis: 'x' })] },
  },
  { id: 'phone', name: '手机', at: [-380, 200, 250], rot: [-15, 28, 0], visible: false, shape: { type: 'box', size: [160, 76, 8], chamfer: 5 } },
  { id: 'phone-screen', name: 'ECOVACS HOME App', parent: 'phone', at: [0, 0, 4.05], shape: { type: 'screen', w: 148, h: 68 } },
]

const show = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
const hide = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false }]))

// ---------- 手机界面 ----------
const APP = 'ECOVACS HOME'
const UI_ADD: ScreenUI = { app: APP, title: '添加机器人', items: [{ text: '扫码添加机器人', state: 'selected' }, { text: '扫描机身二维码', sub: '面盖下方' }] }
const UI_WIFI: ScreenUI = {
  app: APP, title: '选择家庭 Wi-Fi',
  items: [{ text: 'Home-2.4G', sub: '2.4 GHz', state: 'selected' }, { text: 'Home-5G', sub: '纯 5 GHz 不可用', state: 'muted' }],
  button: '下一步', buttonActive: true,
}
const UI_DONE: ScreenUI = { app: APP, title: '地宝 T90S PRO 上下水', items: [{ text: 'Wi-Fi', sub: '已连接', state: 'done' }], toast: '配网成功' }
const UI_ALARM: ScreenUI = { app: APP, title: '地宝报警', items: [{ text: '红灯闪烁', sub: '查看故障原因', state: 'selected' }, { text: '橙灯闪烁', sub: '基站报警' }] }
const UI_BT: ScreenUI = { app: APP, title: '蓝牙配网', items: [{ text: '已短按重置键', sub: '语音提示配网', state: 'done' }, { text: '连接 Home-2.4G', state: 'selected' }] }

// ---------- 镜头 ----------
const OVERVIEW: CameraSpec = { target: [60, 110, -20], dir: [0.55, 0.55, 1], dist: 1900 }
const ST_FRONT: CameraSpec = { target: [-10, 130, -60], dir: [0.38, 0.4, 1], dist: 1150 }
/** 背面从左后方看：立管在基站右后方，不会挡住接口 */
const ST_BACK: CameraSpec = { target: [120, 140, -320], dir: [-0.55, 0.5, -1], dist: 1000 }
const PHONE: CameraSpec = { target: 'phone-screen', dir: [0.469, 0.229, 0.853], dist: 300 }
const TOP_FRONT: CameraSpec = { target: [0, 80, 440], dir: [0.25, 1, 0.85], dist: 700 }
const TOP_SIDE: CameraSpec = { target: [400, 80, 270], dir: [0.25, 1, 0.85], dist: 700 }
const BOTTOM: CameraSpec = { target: [0, 40, 560], dir: [0.15, 1, 0.7], dist: 1100 }
const DOCK_VIEW: CameraSpec = { target: [0, 70, 40], dir: [0.45, 0.6, 1], dist: 1000 }
const zoomTop = (target: string, caption: string, dist = 90) => ({ target, dir: [0.15, 1, 0.5] as Vec3, dist, caption })
const zoomBack = (target: string, caption: string) => ({ target, dir: [-0.45, 0.35, -1] as Vec3, dist: 150, caption })

// ---------- 复用步骤片段 ----------
/** 盖板先向前拔出再平放到基站左侧地面 */
const COVER_OFF: PartState = { parent: null, at: [-345, 3, 90], rot: [90, 0, 0], via: [-150, 170, 150], dur: 1.4 }
const RAMP_OFF: PartState = { parent: null, at: [0, 0, 520], rot: [0, 0, 0], lift: 40, dur: 1.4 }
const TROUGH_OUT: PartState = { parent: null, at: [0, 0, 250], rot: [0, 0, 0], dur: 1.3 }
const cleanStep = (s: Omit<SpecStep, 'camera'> & { camera?: CameraSpec }): SpecStep => ({ camera: TOP_FRONT, ...s })

export const ecovacsT90sPro: ManualSpec = {
  id: 'ecovacs-t90s-pro',
  name: '科沃斯 地宝 T90S PRO 上下水',
  desc: '扫拖机器人 + 全能基站 · 自动上下水 · 滚筒拖布',
  category: '扫地机器人',
  dims: { width: 338, depth: 459, height: 247 },
  source: {
    title: '地宝 T90S PRO上下水产品使用说明书（地面清洁机器人说明书）',
    url: 'https://static.ecovacs.cn/upload/oms/2026/10/16/20261016101026742.pdf',
    images: [],
  },
  package: [
    { name: '地宝 T90S PRO', qty: 1, spec: '353 × 351 × 95 mm · 含尘盒、滚刷、边刷、滚筒拖布、接水槽' },
    { name: '全能基站', qty: 1, spec: '338 × 285 × 247 mm · 含尘袋、清洁液盒、清洁槽' },
    { name: '基站斜坡底座', qty: 1, spec: '装上后总深 459 mm' },
    { name: '上下水软管套件', qty: 1, spec: '随机附带的新软管；排水接头需另购专用件（三分管）' },
    { name: '说明书', qty: 1, spec: '说明书未列装箱清单，以上按部件章节整理' },
  ],
  params: [
    { label: '地宝尺寸', value: '353 × 351 × 95 mm', note: '宽 × 深 × 高' },
    { label: '基站尺寸', value: '338 × 459 × 247 mm', note: '含斜坡底座；不含为 338 × 285 × 247' },
    { label: '安装预留', value: '宽 ≥ 358 · 高 ≥ 252 · 深 ≥ 490 mm', note: '前方 0.6 m 内不放物品' },
    { label: '水压', value: '0.1–0.7 MPa', note: '最大水压 0.7 MPa' },
    { label: '基站电源', value: '220–240 V~ 50–60 Hz', note: '集尘 450 W' },
    { label: '地宝输入', value: '17.8 V⎓2 A / 20 V⎓2 A', note: 'ZJ2583 快充 16.4 V⎓10.5 A' },
    { label: '充电时间', value: '约 2.5 h / 约 3.5 h', note: 'ZJ2583 / ZJ2641' },
    { label: 'Wi-Fi', value: '2.4 GHz 或 2.4/5 GHz 混合', note: 'WPA / WPA2，不支持 WEP、EAP' },
    { label: '传感器', value: '激光导航 10 m · 红外避障 0.3 m', note: '下视防跌落：白地面 > 55 mm、黑地面 > 30 mm' },
    { label: '型号', value: 'ZJ2583 / ZJ2641', note: '基站 CH2605 / CH2601 / CH2642' },
  ],
  parts,
  initial: {
    'inlet-fit': { plug: 'port-inlet' },
    'drain-fit': { plug: 'port-drain' },
    'drain-end': { plug: 'floor-drain' },
    'power-dc': { plug: 'port-power' },
    'power-ac': { plug: 'strip-socket' },
  },
  stageSize: 1500,
  guides: [
    // ================= 1. 上下水安装 =================
    {
      id: 'install', title: '上下水安装', kind: 'assembly',
      start: {
        robot: SIDE,
        'power-knob': { at: [PWR.off, PWR.y, PWR.z] },
        ramp: { parent: null, at: [0, 0, 420], rot: [0, 0, 0] },
        'inlet-fit': { parent: null, at: [230, 8, -420], rot: [0, 0, 0], visible: false },
        'drain-fit': { parent: null, at: [200, 10, -420], rot: [0, 0, 0], visible: false },
        'drain-end': { parent: null, at: [360, 10, -260], rot: [0, 0, 0], visible: false },
        'power-dc': { parent: null, at: [-250, 13, -400], rot: [0, 0, 0], visible: false },
        'power-ac': { parent: null, at: [-200, 18, -420], rot: [0, 0, 0], visible: false },
        ...hide('hose-in', 'hose-out', 'cord'),
      },
      steps: [
        {
          id: 'site', title: '预留安装空间', page: 8,
          desc: '基站嵌入安装需预留宽 ≥ 358 mm、高 ≥ 252 mm、深 ≥ 490 mm。基站前方 0.6 m 内不要放置物品，两侧各留 ≥ 0.01 m；上下水管路两侧均可安装。',
          camera: OVERVIEW, orbit: true,
          highlight: ['station'],
          callouts: [
            { part: 'station', text: '全能基站', sub: '338 × 285 × 247 mm', at: [0, 247, 0], offset: [-80, 110, 0] },
            { part: 'ramp', text: '基站斜坡底座', sub: '装上后总深 459 mm', offset: [-60, 90, 80] },
            { part: 'robot', text: '地宝', sub: '353 × 351 × 95 mm', at: [0, 96, 0], offset: [60, 110, 0] },
          ],
          chips: [{ label: '预留', sub: '宽 358 · 高 252 · 深 490 mm' }, { label: '前方', sub: '0.6 m 内不放物品' }, { label: '两侧', sub: '≥ 0.01 m' }],
          tip: '需由专业安装人员勘测后安装，请勿自行安装；扫描外包装二维码即可预约安装人员上门。',
        },
        {
          id: 'rear', title: '认识基站背面接口', page: 5,
          desc: '基站背面上部是电源接口，右侧走管槽里上为排水口、下为进水口。上水从立管上的工字接头经前置过滤器接入，下水排进基站侧面的地漏。',
          camera: ST_BACK,
          highlight: ['port-power', 'port-drain', 'port-inlet'],
          callouts: [
            { part: 'port-power', text: '电源接口', offset: [0, 80, -30] },
            { part: 'port-drain', text: '排水口', offset: [20, 50, -50] },
            { part: 'port-inlet', text: '进水口', offset: [30, -20, -60] },
            { part: 'tee', text: '工字接头 + 过滤器', offset: [-50, 70, 0] },
            { part: 'floor-drain', text: '地漏（基站侧面）', offset: [-60, 60, -60] },
          ],
          zoom: { target: 'port-drain', offset: [-30, -40, 0], dir: [-0.4, 0.3, -1], dist: 300, caption: '电源接口 · 排水口 · 进水口' },
          tip: '如下水采用地漏，地漏不要预留在机器底部或正后方，请预留在机器侧面。',
        },
        {
          id: 'inlet', title: '连接进水管', page: 8,
          desc: '把随机附带的进水软管一端接在工字接头的前置过滤器出口，另一端插入基站背面的进水口。',
          camera: ST_BACK,
          set: {
            'hose-in': { visible: true },
            'inlet-fit': { visible: true, plug: { hole: 'port-inlet', back: 50 }, lift: 20, dur: 1.6 },
          },
          highlight: ['inlet-fit', 'hose-in', 'tee'],
          zoom: zoomBack('inlet-fit', '进水管插入进水口'),
          chips: [{ label: '水压', sub: '0.1–0.7 MPa' }],
          tip: '应使用随设备附带的新软管套件，不应重复使用旧软管；装好工字接头后测试水压，要求 0.1–0.7 MPa（第 2 页）。',
        },
        {
          id: 'drain', title: '连接排水管', page: 8,
          desc: '排水波纹管一端插入基站背面的排水口，另一端插进基站侧面的地漏。',
          camera: ST_BACK,
          set: {
            'hose-out': { visible: true },
            'drain-fit': { visible: true, plug: { hole: 'port-drain', back: 50 }, lift: 20, dur: 1.6 },
            'drain-end': { visible: true, plug: { hole: 'floor-drain', back: 60 }, delay: 0.3, dur: 1.6 },
          },
          highlight: ['drain-fit', 'drain-end', 'hose-out'],
          zoom: zoomBack('drain-fit', '排水管插入排水口'),
          tip: '下水请购买扫地机器人专用排水接头（三分管），避免水压导致下水管移动造成漏水。',
        },
        {
          id: 'power', title: '接通基站电源', page: 8,
          desc: '把电源线的 L 形插头插入基站背面的电源接口，另一端插上插座。',
          camera: { ...ST_BACK, target: [-90, 130, -330], dir: [-0.35, 0.55, -1] },
          set: {
            cord: { visible: true },
            'power-dc': { visible: true, plug: { hole: 'port-power', back: 50 }, lift: 20, dur: 1.6 },
            'power-ac': { visible: true, plug: { hole: 'strip-socket', back: 50 }, delay: 0.4, dur: 1.6 },
          },
          highlight: ['power-dc', 'power-ac', 'cord'],
          zoom: zoomBack('power-dc', 'L 形插头插入电源接口'),
          chips: [{ label: '基站电源', sub: '220–240 V~ 50–60 Hz' }],
          tip: '插上电源后，听到基站底部发出轻微机械启动声，表示基站已接通电源（第 9 页）。',
        },
        {
          id: 'ramp', title: '安装斜坡底座', page: 9,
          desc: '移除地宝和全能基站上的所有防护物，把斜坡底座对准基站底部装入并向下压，听到「嗒」的一声表示安装到位。',
          camera: ST_FRONT,
          set: { ramp: { parent: 'station', at: RAMP_AT, rot: [0, 0, 0], lift: 30, dur: 1.6 } },
          highlight: ['ramp'],
          actions: [{ type: 'press', part: 'ramp', depth: 1 }],
          chips: [{ label: '到位', sub: '听到「嗒」' }],
          tip: '全能基站附近若有镜子、反光踢脚线等，需遮挡其底部 14 cm；勿放在阳光直射或高温处，建议放在 Wi-Fi 信号强的位置。',
        },
        {
          id: 'switch-on', title: '打开地宝电源开关', page: 10,
          desc: '取下地宝面盖，把面盖下方的电源开关拨到「I」（开机）。',
          camera: TOP_SIDE,
          set: { lid: LID_OFF_SIDE, 'power-knob': { at: [PWR.on, PWR.y, PWR.z], delay: 1.4, dur: 0.5 } },
          highlight: ['power-knob'],
          zoom: zoomTop('power-knob', '拨到「I」= 开机'),
          chips: [{ label: '电源开关', sub: 'O → I' }],
          tip: '「I」代表开机，「O」代表关机；地宝无法在电源关闭的状态下充电。',
        },
      ],
    },

    // ================= 2. 配网与清扫 =================
    {
      id: 'setup', title: '配网与首次清扫', kind: 'usage',
      start: { robot: { parent: null, at: FRONT_AT, rot: [0, 0, 0] }, lid: { parent: null, at: [-420, 2.25, 400], rot: [0, 0, 0] }, ...show('phone') },
      steps: [
        {
          id: 'app', title: '打开 App，扫码添加机器人', page: 10,
          desc: '打开 ECOVACS HOME App，点击「扫码添加机器人」，扫描地宝面盖下方的机身二维码，按提示进入配网流程。',
          camera: PHONE,
          set: { 'phone-screen': { ui: UI_ADD } },
          highlight: ['phone-screen'],
          zoom: zoomTop('qr', '机身二维码在面盖下方', 110),
          tip: '还没有 App：扫描机身二维码，或在手机应用商店搜索「ECOVACS HOME」下载（第 9 页）。',
        },
        {
          id: 'reset', title: '按一下重置键，进入配网', page: 4,
          desc: '按一下面盖下方的重置键，地宝语音提示配网，Wi-Fi 指示灯白灯快闪。',
          camera: { ...TOP_FRONT, target: [-20, 85, 480], dist: 520 },
          set: { 'wifi-led': { light: 'blink', color: WHITE, delay: 0.5 } },
          highlight: ['reset-key', 'wifi-led'],
          actions: [{ type: 'press', part: 'reset-key', delay: 0 }],
          zoom: zoomTop('wifi-led', '白灯快闪 = 配网中', 70),
          chips: [{ label: 'Wi-Fi 灯', sub: '白灯快闪 = 配网中' }],
          tip: 'Wi-Fi 指示灯：白灯慢闪 = 已断开，白灯快闪 = 配网中，白灯常亮 = 已连接（第 10 页）。',
        },
        {
          id: 'wifi', title: '选择 2.4 GHz Wi-Fi', page: 10,
          desc: '在 App 中选择家庭 Wi-Fi 并输入密码。需使用 2.4 GHz 或 2.4/5 GHz 混合网络，路由器支持 802.11b/g/n 与 IPv4。',
          camera: PHONE,
          set: { 'phone-screen': { ui: UI_WIFI } },
          highlight: ['phone-screen'],
          chips: [{ label: '网络', sub: '2.4 GHz / 2.4+5 GHz 混合' }, { label: '加密', sub: 'WPA / WPA2' }],
          tip: '切勿使用 VPN、代理服务器或隐藏网络；不支持 WEP、EAP；使用中继器时 SSID 和密码需与主网络相同。',
        },
        {
          id: 'connected', title: '配网成功，白灯常亮', page: 10,
          desc: 'App 提示配网成功，地宝的 Wi-Fi 指示灯变为白灯常亮。',
          camera: PHONE,
          set: { 'wifi-led': { light: 'on', color: WHITE }, 'phone-screen': { ui: UI_DONE } },
          highlight: ['phone-screen'],
          zoom: zoomTop('wifi-led', '白灯常亮 = 已连接 Wi-Fi', 70),
          chips: [{ label: 'Wi-Fi 灯', sub: '白灯常亮' }],
        },
        {
          id: 'charge', title: '盖回面盖，放回基站充电', page: 10,
          desc: '盖回面盖，把地宝搬回基站。听到语音「开始充电」并看到白灯呼吸，表示对接成功、开始充电。',
          camera: DOCK_VIEW,
          set: {
            ...hide('phone'),
            lid: lidOn(LID_VIA_FRONT),
            robot: { ...IN, delay: 1.5 },
            'robot-led': { light: 'blink', color: WHITE, delay: 3.4 },
          },
          highlight: ['robot', 'robot-led'],
          zoom: zoomTop('robot-led', '白灯呼吸 = 充电中', 120),
          chips: [{ label: '指示灯', sub: '白灯呼吸 = 充电中' }],
          tip: '首次清扫前请确保地宝在基站上且充满电；结束工作后建议不要关机，保持在基站上充电。',
        },
        {
          id: 'start', title: '短按按键，开始清扫', page: 12,
          desc: '点击地宝上的按键（或在 App 中启动），地宝驶出基站开始清扫，白灯常亮。水箱由基站自动补水，遇地毯自动抬升拖布。',
          camera: { target: [0, 60, 250], dir: [0.4, 0.65, 1], dist: 1150 },
          set: { robot: { ...OUT, at: [0, 0, 430], delay: 0.6 }, 'robot-led': { light: 'on', color: WHITE, delay: 0.4 } },
          highlight: ['btn', 'robot-led'],
          actions: [{ type: 'press', part: 'btn', delay: 0 }, { type: 'glide', part: 'robot' }],
          zoom: zoomTop('btn', '短按 = 开始清扫', 130),
          chips: [{ label: '短按', sub: '开始 / 暂停' }, { label: '指示灯', sub: '白灯常亮 = 工作中' }],
          tip: '首次建图时请跟随地宝，可垫高或遮挡低矮家具，或在 App 中设置虚拟墙；勿在长毛地毯上使用。',
        },
        {
          id: 'pause', title: '短按按键，暂停', page: 12,
          desc: '地宝工作中短按按键即可暂停（或用 App 控制）。暂停一段时间后，面板所有指示灯熄灭；再次短按继续清扫。',
          camera: { target: [0, 90, 480], dir: [0.3, 0.9, 1], dist: 650 },
          set: { 'robot-led': { light: 'off', delay: 2.2 } },
          highlight: ['btn'],
          actions: [{ type: 'press', part: 'btn', delay: 0.3 }],
          zoom: zoomTop('btn', '工作中短按 = 暂停', 130),
        },
        {
          id: 'home', title: '长按 3 秒，返回基站', page: 12,
          desc: '长按地宝按键 3 秒（或使用 App），地宝返回基站开始充电，白灯呼吸。',
          camera: DOCK_VIEW,
          set: { robot: { ...IN, delay: 0.9 }, 'robot-led': { light: 'blink', color: WHITE, delay: 2.8 } },
          highlight: ['btn', 'robot-led'],
          actions: [{ type: 'press', part: 'btn', delay: 0 }],
          zoom: zoomTop('robot-led', '白灯呼吸 = 充电中', 120),
          chips: [{ label: '长按', sub: '3 秒 = 返回充电' }],
          tip: '为了顺利回充，建议地宝从基站出发，清扫过程中请勿搬动全能基站。',
        },
      ],
    },

    // ================= 3. 地宝保养 =================
    {
      id: 'robot-care', title: '地宝保养', kind: 'usage',
      start: { robot: { parent: null, at: FRONT_AT, rot: [0, 0, 0] } },
      steps: [
        cleanStep({
          id: 'dustbox-out', title: '关机，取出尘盒', page: 14,
          desc: '取下面盖，先把电源开关拨到「O」关机，再把尘盒从地宝中取出，打开尘盒面盖倾倒垃圾。',
          camera: { target: [110, 60, 410], dir: [0.25, 1, 0.85], dist: 820 },
          set: {
            lid: LID_OFF_FRONT,
            'power-knob': { at: [PWR.off, PWR.y, PWR.z], delay: 1.4, dur: 0.5 },
            dustbox: { parent: null, at: [300, 23, 330], rot: [0, 0, 0], via: [150, 190, 370], delay: 2.0, dur: 1.3 },
          },
          highlight: ['dustbox', 'power-knob'],
          zoom: zoomTop('power-knob', '先拨到「O」关机'),
          chips: [{ label: '尘盒 / 滤芯', sub: '每 1 周清理' }],
          tip: '清洁和维护产品前请先关闭电源（第 2 页）。',
        }),
        cleanStep({
          id: 'filter', title: '取下滤芯，冲洗晾干', page: 14,
          desc: '从尘盒里取下滤芯。尘盒和滤芯可用清水冲洗，冲洗后甩干水珠，再完全晾干。',
          camera: { target: [300, 20, 400], dir: [0.3, 0.9, 1], dist: 650 },
          set: { filter: { parent: null, at: [300, 6, 450], rot: [0, 0, 0], via: [300, 110, 380], dur: 1.3 } },
          highlight: ['filter'],
          chips: [{ label: '滤芯', sub: '每 3–6 个月更换' }],
          tip: '请勿用刷子或手刷洗滤芯；务必把滤材完全晾干后再使用。',
        }),
        cleanStep({
          id: 'dustbox-in', title: '装回滤芯和尘盒', page: 14,
          desc: '滤芯和尘盒晾干后，把滤芯装回尘盒，再把尘盒装回地宝。',
          set: {
            filter: { parent: 'dustbox', at: [0, 10, -5], rot: [0, 0, 0], via: [300, 110, 380], dur: 1.1 },
            dustbox: { parent: 'robot', at: DUSTBOX_AT, rot: [0, 0, 0], via: [150, 190, 370], delay: 1.3, dur: 1.3 },
          },
          highlight: ['dustbox', 'filter'],
          tip: '使用产品前确保尘盒、过滤材料已安装到位（第 2 页）。',
        }),
        cleanStep({
          id: 'flip', title: '翻转地宝，取下接水槽', page: 17,
          desc: '先倒掉接水槽中的残余积水，把地宝翻转、底部朝上，向上拨动接水槽释放键取下接水槽，清理并擦干。',
          camera: BOTTOM,
          set: {
            robot: { parent: null, at: FLIP_AT, rot: FLIPPED, lift: 230, dur: 1.6 },
            'water-tray': { parent: null, at: [0, 4, 700], rot: FLIPPED, via: [0, 180, 460], delay: 1.8, dur: 1.3 },
          },
          highlight: ['water-tray'],
          callouts: [
            { part: 'main-brush', text: '滚刷', offset: [-60, 60, -40] },
            { part: 'side-brush', text: '边刷', offset: [70, 50, 0] },
            { part: 'roller', text: '滚筒拖布', offset: [-160, 50, -40] },
            { part: 'robot', text: '驱动轮', at: [-128, 32, -5], offset: [90, 50, -40] },
          ],
          chips: [{ label: '接水槽', sub: '每 1 周清理' }],
          tip: '将地宝翻转操作前，请务必先倒掉接水槽中的残余积水（第 15 页）；非烘干状态下翻转可能有少量残留水渍流出。',
        }),
        cleanStep({
          id: 'brush-out', title: '打开滚刷盖板，取出滚刷', page: 15,
          desc: '打开滚刷盖板，取出滚刷，清理滚刷和滚刷腔内的毛发与灰尘。',
          camera: BOTTOM,
          set: {
            'brush-cover': { parent: null, at: [-250, 1.75, 650], rot: FLIPPED, via: [-200, 200, 470], dur: 1.2 },
            'main-brush': { parent: null, at: [-250, 20, 760], rot: FLIPPED, via: [-200, 210, 480], delay: 1.3, dur: 1.3 },
          },
          highlight: ['brush-cover', 'main-brush'],
          chips: [{ label: '滚刷', sub: '每 1 周清理 · 6–12 个月更换' }],
        }),
        cleanStep({
          id: 'brush-in', title: '装回滚刷和滚刷盖板', page: 15,
          desc: '把滚刷装回滚刷腔，再盖上滚刷盖板并扣好卡扣。',
          camera: BOTTOM,
          set: {
            'main-brush': { parent: 'robot', at: [0, 22, 25], rot: [0, 0, 0], via: [-200, 210, 480], dur: 1.3 },
            'brush-cover': { parent: 'robot', at: [0, 8.5, 25], rot: [0, 0, 0], via: [-200, 200, 470], delay: 1.4, dur: 1.2 },
          },
          highlight: ['main-brush', 'brush-cover'],
        }),
        cleanStep({
          id: 'side-brush', title: '用螺丝刀取下边刷', page: 15,
          desc: '用螺丝刀拧下边刷螺丝，取下边刷并清理缠绕的毛发。',
          camera: BOTTOM,
          set: {
            ...show('screwdriver'),
            'side-brush': { parent: null, at: [250, 5, 660], rot: FLIPPED, via: [140, 170, 560], delay: 0.3, dur: 1.3 },
          },
          highlight: ['side-brush', 'screwdriver'],
          zoom: { target: 'side-brush', dir: [0.2, 1, 0.5], dist: 260, caption: '边刷中心螺丝：用螺丝刀拧下' },
          chips: [{ label: '边刷', sub: '每 2 周清理 · 3–6 个月更换' }],
        }),
        cleanStep({
          id: 'roller-out', title: '按住释放键，抽出滚筒拖布', page: 16,
          desc: '按住滚筒拖布侧面的滚筒释放键，轻轻向上提起，抽出滚筒拖布。拔下滚筒端盖，清理拖布并晾干，用拧干的湿抹布清理滚筒腔。',
          camera: BOTTOM,
          set: { roller: { parent: null, at: [0, 28.5, 790], rot: FLIPPED, via: [40, 200, 330], delay: 0.6, dur: 1.5 } },
          highlight: ['roller', 'roller-key'],
          actions: [{ type: 'press', part: 'roller-key', depth: 2, delay: 0 }],
          zoom: { target: 'roller-key', dir: [1, 0.6, 0.3], dist: 110, caption: '按住侧面的滚筒释放键' },
          chips: [{ label: '滚筒拖布', sub: '每 1–2 个月更换' }],
          tip: '清理过程中请勿暴力拉拽滚筒电机组件；请勿用水冲洗机身。',
        }),
        cleanStep({
          id: 'roller-in', title: '套回滚筒拖布，听到「嗒」', page: 16,
          desc: '装回滚筒端盖，把滚筒拖布套入滚筒电机并装紧，再把滚筒释放键对准滚筒腔侧面凹槽按压，听到「嗒」声表示安装到位。',
          camera: BOTTOM,
          set: { roller: { parent: 'robot', at: [0, 28.5, -100], rot: [0, 0, 0], via: [40, 200, 330], dur: 1.5 } },
          highlight: ['roller', 'roller-key'],
          actions: [{ type: 'press', part: 'roller-key', depth: 2, delay: 1.6 }],
          zoom: { target: 'roller-key', dir: [1, 0.6, 0.3], dist: 110, caption: '对准凹槽按压，「嗒」= 到位' },
        }),
        cleanStep({
          id: 'reassemble', title: '装回边刷和接水槽', page: 17,
          desc: '用螺丝刀装回边刷并拧紧螺丝；再装回接水槽，向下按压确保安装到位。',
          camera: BOTTOM,
          set: {
            'side-brush': { parent: 'robot', at: [-105, 2, 108], rot: [0, 0, 0], via: [140, 170, 560], dur: 1.3 },
            'water-tray': { parent: 'robot', at: [0, 6, -62], rot: [0, 0, 0], via: [0, 180, 460], delay: 1.4, dur: 1.3 },
          },
          highlight: ['side-brush', 'water-tray'],
          actions: [{ type: 'shake', part: 'water-tray', axis: 'y', amp: 1.2 }],
          tip: '安装边刷时确保螺丝拧紧，否则边刷可能脱落（第 23 页）。',
        }),
      ],
    },

    // ================= 4. 基站保养 =================
    {
      id: 'station-care', title: '基站保养：尘袋 · 清洁液 · 清洁槽', kind: 'usage',
      start: { robot: SIDE },
      steps: [
        {
          id: 'cover-off', title: '取下集尘仓盖板', page: 20,
          desc: '捏住盖板上方的扣手，把集尘仓盖板向外取下。',
          camera: { ...ST_FRONT, target: [-130, 120, -20] },
          set: { 'st-cover': { ...COVER_OFF } },
          highlight: ['st-cover'],
          callouts: [
            { part: 'dust-bag', text: '尘袋', offset: [60, 90, 40] },
            { part: 'fluid-blue', text: '清洁液盒 ×2', offset: [-70, 90, 40] },
          ],
        },
        {
          id: 'bag-out', title: '取出尘袋并丢弃', page: 20,
          desc: '按箭头方向向外取出一次性尘袋并丢弃。取出时尘袋提手会把尘袋密闭起来，防止灰尘漏出。',
          camera: ST_FRONT,
          set: { 'dust-bag': { parent: null, at: [43, 184, 170], rot: [0, 0, 0], visible: false, dur: 1.4 } },
          highlight: ['dust-bag'],
          chips: [{ label: '尘袋', sub: '在 App 提示时更换' }],
        },
        {
          id: 'bag-in', title: '安装新尘袋，听到「嗒」', page: 20,
          desc: '用干抹布擦拭集尘仓，把新尘袋推入集尘仓，听到「嗒」声表示安装到位。',
          camera: ST_FRONT,
          set: { 'dust-bag': { parent: 'station', at: BAG_AT, rot: [0, 0, 0], visible: true, dur: 1.4 } },
          highlight: ['dust-bag'],
          chips: [{ label: '到位', sub: '听到「嗒」' }],
        },
        {
          id: 'fluid-out', title: '抽出两个清洁液盒', page: 11,
          desc: '向外抽拉出两个清洁液盒，放在硬质水平面上，打开盒盖。',
          camera: { ...ST_FRONT, target: [-110, 170, -20], dist: 900 },
          set: {
            'fluid-blue': { parent: null, at: [-141, 182, 110], rot: [0, 0, 0], dur: 1.1 },
            'fluid-black': { parent: null, at: [-101, 182, 130], rot: [0, 0, 0], delay: 0.3, dur: 1.1 },
          },
          highlight: ['fluid-blue', 'fluid-black'],
          callouts: [
            { part: 'fluid-blue', text: '蓝盒', sub: '清洁消毒液', offset: [-80, 60, 30] },
            { part: 'fluid-black', text: '黑盒', sub: '重污清洁液', offset: [70, 70, 30] },
          ],
        },
        {
          id: 'fluid-in', title: '加入清洁液，装回基站', page: 11,
          desc: '向蓝盒加入清洁消毒液、向黑盒加入重污清洁液（务必对应类型），盖紧盒盖后装回基站。',
          camera: { ...ST_FRONT, target: [-110, 170, -20], dist: 900 },
          set: {
            'fluid-blue': { parent: 'station', at: BLUE_AT, rot: [0, 0, 0], dur: 1.1 },
            'fluid-black': { parent: 'station', at: BLACK_AT, rot: [0, 0, 0], delay: 0.3, dur: 1.1 },
          },
          highlight: ['fluid-blue', 'fluid-black'],
          tip: '请勿倒入过满，否则盖上盖子后会溢出；仅使用科沃斯官方专用清洁液；日常无需清洁液可跳过并在 App 中关闭智能加液。',
        },
        {
          id: 'cover-on', title: '装回盖板，按压两侧密封', page: 20,
          desc: '装回集尘仓盖板，按压两侧确保仓门密封。',
          camera: ST_FRONT,
          set: { 'st-cover': { parent: 'station', at: COVER_AT, rot: [0, 0, 0], via: COVER_OFF.via, dur: 1.4 } },
          highlight: ['st-cover'],
          actions: [{ type: 'shake', part: 'st-cover', axis: 'z', amp: 1.5 }],
        },
        {
          id: 'ramp-off', title: '取下斜坡底座', page: 21,
          desc: '取下基站斜坡底座并清理。',
          camera: { target: [0, 40, 180], dir: [0.4, 0.7, 1], dist: 1100 },
          set: { ramp: RAMP_OFF },
          highlight: ['ramp'],
          chips: [{ label: '机身和底部', sub: '每 1 月清理' }],
        },
        {
          id: 'trough-out', title: '取出清洁槽，取下滤网', page: 21,
          desc: '取出清洁槽，按住清洁槽托盘卡扣取下可替换滤网，清理滤网和托盘。',
          camera: { target: [0, 20, 220], dir: [0.3, 0.9, 1], dist: 850 },
          set: {
            trough: TROUGH_OUT,
            'trough-filter': { parent: null, at: [0, 0, 350], rot: [0, 0, 0], via: [0, 40, 310], delay: 1.4, dur: 1.1 },
          },
          highlight: ['trough', 'trough-filter'],
          chips: [{ label: '清洁槽滤网', sub: '每 2 周清理 · 1–2 个月更换' }],
        },
        {
          id: 'trough-in', title: '依次装回，听到「嗒」', page: 21,
          desc: '依次装回清洁槽可替换滤网、清洁槽托盘和基站斜坡底座，听到「嗒」声表示安装到位。',
          camera: { target: [0, 40, 180], dir: [0.4, 0.7, 1], dist: 1100 },
          set: {
            'trough-filter': { parent: 'trough', at: FILTER_AT, rot: [0, 0, 0], via: [0, 40, 310], dur: 1.0 },
            trough: { parent: 'station', at: TROUGH_AT, rot: [0, 0, 0], delay: 1.2, dur: 1.2 },
            ramp: { parent: 'station', at: RAMP_AT, rot: [0, 0, 0], lift: 40, delay: 2.5, dur: 1.3 },
          },
          highlight: ['trough-filter', 'trough', 'ramp'],
          tip: '请正确安装，以免影响使用；斜坡底座未装到位会导致地宝无法充电（第 24 页）。',
        },
      ],
    },

    // ================= 5. 指示灯与故障 =================
    {
      id: 'troubleshoot', title: '指示灯与故障排查', kind: 'repair',
      steps: [
        {
          id: 'alarm', title: '红灯 / 橙灯闪烁：到 App 查看原因', page: 5,
          desc: '地宝指示灯：白灯呼吸 = 充电中，白灯常亮 = 充满电 / 工作中，红灯常亮 = 电量低，红灯闪烁 = 地宝报警，橙灯闪烁 = 基站报警。出现红灯或橙灯闪烁时，打开 App 查看具体故障原因。',
          camera: PHONE,
          set: { 'robot-led': { light: 'blink', color: RED }, ...show('phone'), 'phone-screen': { ui: UI_ALARM } },
          highlight: ['phone-screen'],
          zoom: zoomTop('robot-led', '红灯闪烁 = 地宝报警', 120),
          chips: [{ label: '红灯常亮', sub: '电量低' }, { label: '红灯闪烁', sub: '地宝报警' }, { label: '橙灯闪烁', sub: '基站报警' }],
          tip: '地宝在基站内洗拖布时，请勿取出地宝。',
        },
        {
          id: 'switch', title: '无法充电：电源开关须在「I」', page: 24,
          desc: '地宝电源开关需要打开到「I」状态才能充电。取出地宝、取下面盖，确认电源开关在「I」位置。',
          camera: TOP_FRONT,
          set: { 'robot-led': { light: 'off' }, ...hide('phone'), robot: OUT, lid: { ...LID_OFF_FRONT, delay: 1.9 } },
          highlight: ['power-knob'],
          actions: [{ type: 'shake', part: 'power-knob', axis: 'x', amp: 1 }],
          zoom: zoomTop('power-knob', '开关在「I」才能充电'),
        },
        {
          id: 'contacts', title: '无法充电：擦拭充电极片', page: 24,
          desc: '确保地宝与全能基站的充电极片充分接触。极片脏污时，用干抹布擦拭地宝背面和基站凹位里的充电极片。',
          camera: { target: [180, 70, 20], dir: [0.35, 0.17, 1], dist: 1150 },
          set: { lid: lidOn(LID_VIA_FRONT), robot: { parent: null, at: SIDE_AT, rot: [0, -150, 0], delay: 1.4, dur: 1.8 } },
          highlight: ['robot-contacts', 'dock-contacts'],
          zoom: { target: 'dock-contacts', dir: [0.08, 0.12, 1], dist: 320, caption: '基站极片：用干抹布擦拭' },
          tip: '请用干净的软布擦拭，勿用湿抹布、洗剂或喷雾；基站未接通电源或斜坡底座未装到位也会导致无法充电。',
        },
        {
          id: 'net', title: '连不上 App：短按重置键重新配网', page: 23,
          desc: '确认 Wi-Fi 名称和密码正确、地宝在路由器信号范围内。地宝未进入配网状态时，取下面盖短按重置键进入蓝牙配网，按 App 提示操作。',
          camera: TOP_SIDE,
          set: {
            lid: LID_OFF_SIDE,
            'wifi-led': { light: 'blink', color: WHITE, delay: 1.6 },
            ...show('phone'),
            'phone-screen': { ui: UI_BT, delay: 1.0 },
          },
          highlight: ['reset-key', 'wifi-led'],
          actions: [{ type: 'press', part: 'reset-key', delay: 1.4 }],
          zoom: zoomTop('wifi-led', '白灯快闪 = 进入配网', 70),
          tip: 'Wi-Fi 名称避免 ！@#&￥%/\\ 等特殊字符，不要使用纯 5 GHz 网络；请从应用市场下载正确的 ECOVACS HOME App。',
        },
        {
          id: 'factory', title: '恢复出厂设置：长按重置键 5 秒', page: 4,
          desc: '长按重置键 5 秒，提示音后开机音乐响起，地宝恢复出厂设置。',
          camera: TOP_SIDE,
          set: { 'wifi-led': { light: 'off' }, ...hide('phone') },
          highlight: ['reset-key'],
          actions: [{ type: 'press', part: 'reset-key', delay: 0.3 }],
          zoom: zoomTop('reset-key', '长按 5 秒 = 恢复出厂', 70),
          chips: [{ label: '长按', sub: '5 秒' }],
          tip: '重置将会清除现有地图及清洁设置，请谨慎使用。',
        },
        {
          id: 'trough', title: '清洁槽水满吸不出：检查滤网和浮球', page: 26,
          desc: '语音播报清洁槽异常时：取下斜坡底座、取出清洁槽，检查托盘和滤网是否安装到位、吸水口有无异物；底座无水时检查浮球是否卡住，把浮球放回原位。',
          camera: { target: [0, 20, 220], dir: [0.3, 0.9, 1], dist: 850 },
          set: { ramp: RAMP_OFF, trough: { ...TROUGH_OUT, delay: 1.5 } },
          highlight: ['trough-filter', 'float'],
          zoom: { target: 'float', dir: [0.3, 1, 0.6], dist: 120, caption: '浮球卡住时放回原位' },
          tip: '仍无法抽水：把地宝放回基站、处于充电状态时双击按键；仍报警请重新插拔基站电源，或联系售后 400-886-8888。',
        },
      ],
    },
  ],
}
