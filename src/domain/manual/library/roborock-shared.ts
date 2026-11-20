import type { CameraSpec, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 石头扫拖机器人（P10 / P20 Pro）共用的建模与姿态。只导出函数和常量，不导出 ManualSpec。
 *
 * 机器人局部坐标：原点在底面圆心（地面），y 向上，**前方（缓冲器、按键、避障传感器）为 +z**，
 * 机器人自身的右侧为 -x（沿墙传感器、边刷在右前方）。底面 y = 6，拖布 / 主刷 / 边刷凸出到 y ≈ 0。
 * 入座时机器人倒车进基座：机器人后方（-z，充电触片）朝基座，前方朝观众。
 * 翻面 = 绕 z 轴转 180°，由 LDS 顶端着地；翻面后从上方看，画面右侧 = 机器人局部 -x（右侧）。
 */

export const LIT = {
  /** 说明书写「白色」：线稿底色是白的，用浅冷白表示亮起 */
  white: '#c9dcf2',
  red: '#ff3b30',
  blue: '#2f7bf5',
} as const

export const show = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: true }]))
export const hide = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

// ---------- 机器人 ----------

export interface RobotSpec {
  name: string
  spec: string
  /** 机身半径、机身顶面高度 */
  r: number
  h: number
  /** 激光测距（LDS）凸台 */
  turret: { r: number; h: number; z: number }
  /** hinged：上盖后沿掀起（P10）；magnetic：磁吸上盖整块取下（P20 Pro） */
  lid: 'hinged' | 'magnetic'
  /** 上盖下的 WiFi 指示灯（P10 有，P20 Pro 用电源灯蓝色表示网络） */
  wifiLed: boolean
  /** 主刷是否左右分段（P20 Pro「主刷分别装回」） */
  splitBrush: boolean
}

export const BOTTOM = 6
export const BRUSH_Z = 35
export const robotTop = (o: RobotSpec) => o.h + o.turret.h
/** 按键在机身顶面前沿 */
export const btnZ = (o: RobotSpec) => o.r - 38
/** 尘盒顶面与机身顶面齐平（略高 0.5 mm，打开上盖就能看到） */
export const dustbinAt = (o: RobotSpec): Vec3 => [0, o.h - 21.5, -108]

const sideBrush = (): Shape => {
  const arms = [30, 150, 270].map((a) => ({
    type: 'box' as const, size: [64, 1.2, 3.4] as Vec3,
    at: [32 * Math.cos((a * Math.PI) / 180), 0, 32 * Math.sin((a * Math.PI) / 180)] as Vec3, rot: [0, -a, 0] as Vec3,
  }))
  return { type: 'compound', items: [{ type: 'cylinder', r: 10, h: 3, at: [0, 0, 0], fill: 'shade' }, ...arms] }
}

const mopShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 60, h: 4, at: [0, -1, 0], fill: 'warm' },
    { type: 'cylinder', r: 50, h: 2, at: [0, 2, 0] },
  ],
})

const brushCover = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [216, 3, 8], at: [0, 0, 26] },
    { type: 'box', size: [216, 3, 8], at: [0, 0, -26] },
    { type: 'box', size: [8, 3, 44], at: [104, 0, 0] },
    { type: 'box', size: [8, 3, 44], at: [-104, 0, 0] },
  ],
})

export function robotParts(o: RobotSpec): SpecPart[] {
  const top = o.h
  const hingeZ = o.turret.z - o.turret.r - 2
  const parts: SpecPart[] = [
    {
      id: 'robot', name: o.name, spec: o.spec,
      shape: {
        type: 'compound',
        items: [
          { type: 'cylinder', r: o.r, h: top - BOTTOM, at: [0, (top + BOTTOM) / 2, 0] },
          { type: 'cylinder', r: o.turret.r, h: o.turret.h, at: [0, top + o.turret.h / 2, o.turret.z] },
          { type: 'cylinder', r: 17, h: 22, axis: 'x', at: [128, 17, 0], fill: 'shade' },
          { type: 'cylinder', r: 17, h: 22, axis: 'x', at: [-128, 17, 0], fill: 'shade' },
          { type: 'cylinder', r: 8, h: 12, axis: 'x', at: [0, 8, 132], fill: 'shade' },
          { type: 'hole', w: 60, h: 14, r: 4, at: [0, 52, o.r + 0.4], fill: 'dark' },
          { type: 'hole', w: 16, h: 6, r: 2, at: [28, 30, -o.r - 0.4], rot: [0, 180, 0] },
          { type: 'hole', w: 16, h: 6, r: 2, at: [-28, 30, -o.r - 0.4], rot: [0, 180, 0] },
        ],
      },
    },
    o.lid === 'hinged'
      ? { id: 'lid', name: '上盖', spec: '后沿掀起', parent: 'robot', shape: { type: 'slab', w: 240, d: 130, h: 3, r: 50 }, pivot: [0, 0, -65], at: [0, top, hingeZ] }
      : { id: 'lid', name: '磁吸上盖', spec: '整块取下', parent: 'robot', shape: { type: 'slab', w: 300, d: 270, h: 4, r: 130 }, at: [0, top, -30] },
    { id: 'btn-power', name: '开关机 / 清扫键', spec: '长按开关机 · 短按清扫', parent: 'robot', shape: { type: 'box', size: [17, 3, 10], chamfer: 1.2 }, at: [12, top + 1.5, btnZ(o)] },
    { id: 'btn-home', name: '回充键', spec: '短按回充 · 长按局部清扫', parent: 'robot', shape: { type: 'box', size: [17, 3, 10], chamfer: 1.2 }, at: [-12, top + 1.5, btnZ(o)] },
    { id: 'power-led', name: '电源指示灯', parent: 'btn-power', shape: { type: 'led', r: 3, color: LIT.white }, at: [0, 1.55, 0], rot: [-90, 0, 0] },
    { id: 'reset-key', name: '系统重置键', parent: 'robot', shape: { type: 'hole', w: 8, h: 5, r: 2 }, at: o.lid === 'hinged' ? [66, top + 0.2, -45] : [58, top + 0.2, -62], rot: [-90, 0, 0], fill: 'dark' },
    { id: 'dustbin', name: '尘盒', parent: 'robot', shape: { type: 'box', size: [150, 44, 82], chamfer: 4 }, at: dustbinAt(o) },
    { id: 'filter', name: '可水洗滤网', parent: 'dustbin', shape: { type: 'box', size: [118, 30, 6], chamfer: 1 }, at: [0, 0, 44], fill: 'shade' },
    { id: 'brush-cover', name: '主刷罩', spec: '卡扣固定 · 4 齿入槽', parent: 'robot', shape: brushCover(), at: [0, 4.6, BRUSH_Z] },
    ...(o.splitBrush
      ? [
          { id: 'brush-l', name: '主刷（左段）', parent: 'robot', shape: { type: 'cylinder', r: 12, h: 92, axis: 'x' }, at: [48, 12.5, BRUSH_Z], fill: 'shade' } as SpecPart,
          { id: 'brush-r', name: '主刷（右段）', parent: 'robot', shape: { type: 'cylinder', r: 12, h: 92, axis: 'x' }, at: [-48, 12.5, BRUSH_Z], fill: 'shade' } as SpecPart,
        ]
      : [{ id: 'brush', name: '软胶主刷', parent: 'robot', shape: { type: 'cylinder', r: 12, h: 190, axis: 'x' }, at: [0, 12.5, BRUSH_Z], fill: 'shade' } as SpecPart]),
    { id: 'side-brush', name: '边刷', spec: '螺丝固定', parent: 'robot', shape: sideBrush(), at: [-118, 4.5, 100] },
    { id: 'mop-l', name: '拖布（左）', spec: '粘贴在拖布支架上', parent: 'robot', shape: mopShape(), at: [70, 3, -78] },
    { id: 'mop-r', name: '拖布（右）', spec: '粘贴在拖布支架上', parent: 'robot', shape: mopShape(), at: [-70, 3, -78] },
  ]
  if (o.wifiLed) {
    parts.push({ id: 'wifi-led', name: 'WiFi 指示灯', parent: 'robot', shape: { type: 'led', r: 2.6, color: LIT.blue }, at: [40, top + 0.2, -45], rot: [-90, 0, 0] })
  }
  return parts
}

/** 机器人在地面上的几种姿态（世界坐标）。dock：入座位置；out：基座前方的空地 */
export function robotPoses(o: RobotSpec, dock: Vec3, out: Vec3) {
  const top = robotTop(o)
  const flipAt: Vec3 = [out[0], top, out[2]]
  return {
    flipAt,
    /** 从空地倒车入座 */
    dock: { parent: null, at: dock, rot: [0, 0, 0], lift: 10, dur: 2.2 } as PartState,
    /** 出座到空地 */
    leave: { parent: null, at: out, rot: [0, 0, 0], lift: 10, dur: 2.2 } as PartState,
    /** 翻面：绕 z 转 180°，转到侧立时抬得足够高，不擦地 */
    flip: { parent: null, at: flipAt, rot: [0, 0, 180], lift: 230, dur: 1.8 } as PartState,
    unflip: { parent: null, at: out, rot: [0, 0, 0], lift: 230, dur: 1.8 } as PartState,
  }
}

/** 机器人顶部（按键 / 指示灯）近景 */
export const zoomTop = (target: string, caption: string, dist = 110) => ({ target, dir: [0.25, 1, 0.75] as Vec3, dist, caption })

// ---------- 墙面道具 ----------

export interface WallLayout {
  /** 墙根所在 z（墙面朝 +z）。墙面只画墙根线，镜头可以从墙后看基座背面的管路 */
  z: number
  /** 自来水立管 x、三通阀阀体中心高度 */
  riserX: number
  valveY: number
  /** 插座 x、高度 */
  socketX: number
  socketY: number
  /** 地漏位置（地面） */
  drain: [number, number]
}

/** 墙根线（地面上一条细线）、自来水立管、清水三通阀（含自来水滤网）、阀门手柄、插座、地漏 */
export function wallParts(w: WallLayout): SpecPart[] {
  const origin: Vec3 = [0, 0.6, w.z]
  const riserZ = w.z + 18
  const riserTop = 900
  const riserBottom = w.valveY + 42
  return [
    { id: 'wall', name: '墙根', spec: '基座靠墙一侧', shape: { type: 'box', size: [1700, 1.2, 6] }, at: origin, fill: 'dark' },
    {
      id: 'riser', name: '自来水水源', spec: '墙面给水管', parent: 'wall',
      shape: { type: 'cylinder', r: 11, h: riserTop - riserBottom }, at: sub([w.riserX, (riserTop + riserBottom) / 2, riserZ], origin), fill: 'shade',
    },
    {
      id: 'tee', name: '清水三通阀', spec: '上接自来水滤网，下接进水管', parent: 'riser',
      shape: {
        type: 'compound',
        items: [
          { type: 'box', size: [30, 34, 30], chamfer: 3, at: [0, 0, 0] },
          { type: 'cylinder', r: 16, h: 24, at: [0, 30, 0], fill: 'shade' },
          { type: 'cylinder', r: 6, h: 26, at: [0, -30, 0] },
        ],
      },
      at: [0, w.valveY - (riserTop + riserBottom) / 2, 0],
    },
    { id: 'tee-knob', name: '三通阀手柄', spec: '竖直 = 开 · 水平 = 关', parent: 'tee', shape: { type: 'box', size: [8, 40, 6], chamfer: 1.5 }, at: [0, 0, 19], fill: 'shade' },
    { id: 'socket', name: '电源插座', parent: 'wall', shape: { type: 'hole', w: 86, h: 86, r: 8 }, at: sub([w.socketX, w.socketY, w.z + 0.3], origin), fill: 'white' },
    {
      id: 'floor-drain', name: '地漏', spec: '或下水管',
      shape: {
        type: 'compound',
        items: [
          { type: 'cylinder', r: 48, h: 2, at: [0, 1, 0], fill: 'shade' },
          { type: 'hole', w: 56, h: 56, r: 28, at: [0, 2.2, 0], rot: [-90, 0, 0], fill: 'dark' },
        ],
      },
      at: [w.drain[0], 0, w.drain[1]],
    },
  ]
}

/** 三通阀下方出水口（tee 局部），进水管从这里向下引出 */
export const TEE_OUTLET = { at: [0, -43, 0] as Vec3, dir: [0, -1, 0] as Vec3 }
export const KNOB_OPEN: PartState = { rot: [0, 0, 0], dur: 0.6 }
export const KNOB_CLOSED: PartState = { rot: [0, 0, 90], dur: 0.6 }
/** 地漏入口（floor-drain 局部） */
export const DRAIN_INLET = { at: [0, 6, 0] as Vec3, dir: [0, 1, 0] as Vec3 }

// ---------- 管路配件 ----------

/** 水管插头：原点在接口端面，+x 插进接口；外侧是快插卡环（collet），里面是管子 */
export const pipeEnd = (collet: number, pipe: number): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: collet, h: 9, axis: 'x', at: [-4.5, 0, 0] },
    { type: 'cylinder', r: pipe, h: 6, axis: 'x', at: [3, 0, 0], fill: 'shade' },
  ],
})
/** 水管插头外端（pipeEnd 局部）：管子从这里引出 */
export const PIPE_OUT = { at: [-9, 0, 0] as Vec3, dir: [-1, 0, 0] as Vec3 }

/**
 * U 形锁片：水平卡在竖直水管的快插卡环下方，两臂沿 z 夹住水管，开口朝 +z（从后往前推入）。
 * spread 为两臂间距的一半
 */
export const clipItems = (spread: number, at: Vec3 = [0, 0, 0]) => [
  { type: 'box' as const, size: [2.4, 3, spread * 2 + 4] as Vec3, at: [at[0] + spread, at[1], at[2]] as Vec3, fill: 'shade' as const },
  { type: 'box' as const, size: [2.4, 3, spread * 2 + 4] as Vec3, at: [at[0] - spread, at[1], at[2]] as Vec3, fill: 'shade' as const },
  { type: 'box' as const, size: [spread * 2 + 2.4, 3, 2.4] as Vec3, at: [at[0], at[1], at[2] - spread - 2] as Vec3, fill: 'shade' as const },
]

/** 电源插头：原点在插头与插口交界，+x 插入 */
export const dcPlug = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [14, 10, 10], chamfer: 2, at: [-7, 0, 0] },
    { type: 'cylinder', r: 2.5, h: 8, axis: 'x', at: [4, 0, 0], fill: 'shade' },
  ],
})
/** 基座端 L 形电源插头：线从插头下方引出 */
export const lPlug = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [22, 26, 24], chamfer: 3, at: [-11, 0, 0] },
    { type: 'box', size: [9, 10, 14], at: [4.5, 0, 0], fill: 'shade' },
  ],
})
export const L_PLUG_OUT = { at: [-11, -13, 0] as Vec3, dir: [0, -1, 0] as Vec3 }
/** 墙插头 */
export const wallPlug = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [30, 38, 30], chamfer: 5, at: [-15, 0, 0] },
    { type: 'box', size: [12, 2, 7], at: [6, 7, 0], fill: 'shade' },
    { type: 'box', size: [12, 2, 7], at: [6, -7, 0], fill: 'shade' },
  ],
})
export const WALL_PLUG_OUT = { at: [-30, 0, 0] as Vec3, dir: [-1, 0, 0] as Vec3 }

// ---------- 手机 / 清洁液 ----------

export function phoneParts(at: Vec3, rot: Vec3): SpecPart[] {
  return [
    { id: 'phone', name: '手机', shape: { type: 'box', size: [72, 150, 8], chamfer: 6 }, at, rot, visible: false },
    { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 64, h: 136 }, at: [0, 0, 4.2] },
  ]
}

export const PHONE_VIEW: CameraSpec = { target: 'phone', offset: [0, 0, 0], dir: [0.12, 0.18, 1], dist: 430 }

export const bottleShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 32, h: 130, at: [0, 65, 0], fill: 'warm' },
    { type: 'cylinder', r: 13, h: 22, at: [0, 141, 0] },
  ],
})

export const APP = {
  store: (alt?: string): ScreenUI => ({
    app: '应用商店', title: '搜索「Roborock」',
    items: [
      { text: 'Roborock', sub: '获取', state: 'selected' },
      ...(alt ? [{ text: alt, sub: '获取', state: 'muted' as const }] : []),
    ],
    button: '打开', buttonActive: true,
  }),
  add: (): ScreenUI => ({
    app: 'Roborock', title: '我的设备',
    items: [{ text: '+ 添加设备', state: 'selected' }, { text: '扫一扫', state: 'muted' }],
  }),
  pick: (model: string): ScreenUI => ({
    app: '添加设备', title: '发现附近设备',
    items: [{ text: model, sub: '扫拖机器人', state: 'selected' }, { text: '仅支持 2.4GHz WiFi', state: 'muted' }],
    button: '下一步', buttonActive: true,
  }),
  wifi: (): ScreenUI => ({
    app: '添加设备', title: '连接家庭 WiFi',
    items: [{ text: 'Home-2.4G', sub: '2.4GHz', state: 'selected' }, { text: 'Home-5G', sub: '不支持', state: 'muted' }],
    button: '连接', buttonActive: true,
  }),
  done: (model: string): ScreenUI => ({
    app: 'Roborock', title: '我的设备',
    items: [{ text: model, sub: '已连接', state: 'done' }],
    toast: '添加成功',
  }),
}
