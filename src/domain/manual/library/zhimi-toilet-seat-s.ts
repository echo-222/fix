import type { CameraSpec, Finish, ManualSpec, PartState, Shape, SpecPart, Vec3 } from '../types'

/**
 * 智米智能马桶盖 S（ZNMTG02ZM，米家生态链）
 * 说明书：智米智能马桶盖S 使用说明书（2 页折页，拆成 16 个版面），逐版面转写见 manuals-src/zhimi-toilet-seat-s/transcript.md
 * step.page 为版面序号（p1 包装内容 … p14 注意事项），对应关系见转写文件。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。墙面在 z = -280，马桶正面朝 +z。
 * 坐在马桶上的人朝 +z，他的右手边是 -x：控制面板、侧键、拆卸按钮、进水口、角阀、插座、遥控器挂架都在 -x 一侧。
 *
 * 推断（说明书没有给出）：
 * - 马桶陶瓷按 p3 尺寸图取：连体式，安装孔距 140、孔到水箱 65、孔到座圈前沿 479，台面高 400，水箱 380 × 190 × 330。
 * - 马桶盖底座深 160、高 80（铰链座到 96），座圈高 50，座盖铰链在底座后上沿，合上时前沿压在座圈上（倾 5°）。
 * - 侧键、五个指示灯、拆卸按钮、进水口在底座右侧面（-x）的排布按产品图比例估计；夜灯在底座前脸。
 * - 角阀在马桶右后方墙面离地 150 mm、出水口离墙 42 mm（> 20 mm，按方式 A 直接装过滤器），插座离地 450 mm，挂架在插座右侧上方。
 * - 接口 ⓐⓑⓒⓓ 依次取：过滤器-角阀、过滤器-水箱软管、水箱软管-马桶进水口、马桶盖软管-马桶盖进水口。
 * - 遥控器约 160 × 62 × 18 mm，按键 2 行 × 6 列按官方图排；遥控器指示灯放在正面上沿中间。
 *
 * 外观模型：马桶盖主机按一张官方产品图生成（models/zhimi-toilet-seat-s/tripo.json，来源见 refs/sources.json），
 * 侧面控制板的按键、指示灯和座圈顶上那排小灯在参考图里抹平，做成几何体。
 * 遥控器整个用几何体：正面全是按键，抹掉按键只剩一块白板，生成不出有用的外观；留着按键生成又会和几何体按键叠成两层。
 * 主机模型的座盖被生成成半开（约 44°）且整体前低后高约 11°：先绕模型 z 轴转 11° 摆正，再裁掉座盖和底座下方多生成的一截，
 * 只留底座 + 座圈；座盖按几何体建，用 plastic-white。陶瓷、墙、地面、角阀、过滤器、软管都是几何体 + 材质。
 */

const hide = (...ids: string[]): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible: false }]))
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

const CERAMIC: Finish = { color: '#f7f7f5', roughness: 0.15 }
const TILE: Finish = { color: '#d8d5cf', roughness: 0.55 }
const ORANGE: Finish = { color: '#f08a24', roughness: 0.4 }
/** 不锈钢编织软管 */
const BRAID: Finish = { color: '#c9ccd0', roughness: 0.55, metalness: 0.6 }
const LED_BLUE = '#2f7bf5'
const LED_GREEN = '#34c759'

// ---------- 布局 ----------

const WALL_Z = -280
const WALL_AT: Vec3 = [0, 700, WALL_Z - 10]
const onWall = (p: Vec3) => sub(p, WALL_AT)

/** 马桶盖：原点在底面中心，前沿 +z。装好时后沿距水箱 25 mm */
const SEAT_AT: Vec3 = [0, 400, 214.5]
const SEAT_OUT: Vec3 = [0, 400, 400]
const HALF_D = 259.5
const BASE_FRONT = -99.5
const HINGE: Vec3 = [0, 96, -HALF_D]
const LID_CLOSED: PartState = { rot: [5.07, 0, 0], dur: 1.1 }
const LID_OPEN: PartState = { rot: [-88, 0, 0], dur: 1.1 }

/** 右侧面（-x）上的侧键、指示灯、拆卸按钮、进水口 */
const SIDE_X = -195
const KEY_Y = 45
const LED_Y = 66
const INLET: Vec3 = [SIDE_X - 0.3, 25, -245]

/** 清洗器（喷杆）在座圈上方的几个位置（马桶盖局部） */
const NOZZLE = {
  home: [0, 52, -150] as Vec3,
  rear: [0, 52, -30] as Vec3,
  rear2: [0, 52, -15] as Vec3,
  front: [0, 52, 0] as Vec3,
  clean: [0, 52, 20] as Vec3,
}
const nozzleAt = (k: keyof typeof NOZZLE, dur = 1.2): PartState => ({ at: NOZZLE[k], dur })

/** 角阀（墙上），出水口朝上；过滤器装在出水口上 */
const VALVE_AT: Vec3 = [-300, 150, WALL_Z]
const FILTER_AT: Vec3 = [0, 82, 42]
const KNOB_OPEN: PartState = { rot: [0, 0, 0], dur: 0.8 }
const KNOB_CLOSED: PartState = { rot: [0, 0, 90], dur: 0.8 }

/** 马桶进水口（马桶局部），在水箱下部右侧面 */
const TOILET_INLET = { at: [-224, 300, -200] as Vec3, dir: [-1, 0, 0] as Vec3 }

const SOCKET_AT: Vec3 = [-480, 450, WALL_Z + 0.3]
const PLUG_LOOSE: PartState = { parent: 'wall', at: onWall([-480, 300, -200]), rot: [0, 90, 0] }

const HOLDER_AT: Vec3 = [-560, 700, -266]
/** via 必须足够靠前：二次贝塞尔控制点 = 2·via − ½(p0+p1)，via.z 太靠后会穿墙 */
const REMOTE_VIA: Vec3 = [-400, 1050, 180]
const REMOTE_HOME: PartState = { parent: 'holder', at: [0, 33, 1], rot: [0, 0, 0], via: REMOTE_VIA, dur: 1.6 }
const REMOTE_HAND: PartState = { parent: null, at: [-260, 640, 420], rot: [-35, 0, 0], via: REMOTE_VIA, dur: 1.8 }
const REMOTE_BACK: PartState = { parent: null, at: [-260, 640, 420], rot: [35, 180, 0], dur: 1.2 }

const HOSE_LOOSE: PartState = { at: [-240, -40, -245], rot: [0, 0, 0], dur: 1.2 }
const MESH_HOME: Vec3 = [-180, 25, -245]
const MESH_OUT: Vec3 = [-240, 25, -245]

// ---------- 形体 ----------

const toiletShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'slab', w: 330, d: 470, h: 340, r: 150, at: [0, 0, 215] },
    { type: 'slab', w: 384, d: 520, h: 60, r: 185, at: [0, 340, 220] },
    { type: 'slab', w: 400, d: 220, h: 400, r: 30, at: [0, 0, -150] },
    { type: 'slab', w: 380, d: 190, h: 330, r: 30, at: [0, 400, -165] },
    { type: 'hole', w: 280, h: 340, r: 140, at: [0, 400.3, 235], rot: [-90, 0, 0], fill: 'shade', finish: { color: '#e4e4e1', roughness: 0.2 } },
    { type: 'hole', w: 18, h: 18, r: 9, at: [70, 400.3, -5], rot: [-90, 0, 0], fill: 'dark', finish: 'hole' },
    { type: 'hole', w: 18, h: 18, r: 9, at: [-70, 400.3, -5], rot: [-90, 0, 0], fill: 'dark', finish: 'hole' },
    { type: 'cylinder', r: 18, h: 4, at: [0, 732, -165], fill: 'shade', finish: 'steel' },
    { type: 'cylinder', r: 10, h: 24, axis: 'x', at: [-212, 300, -200], fill: 'shade', finish: 'steel' },
  ],
})

const seatShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'slab', w: 390, d: 160, h: 80, r: 30, at: [0, 0, -179.5] },
    { type: 'box', size: [300, 16, 30], chamfer: 3, at: [0, 88, -244.5] },
    { type: 'slab', w: 384, d: 370, h: 50, r: 180, at: [0, 0, 74.5] },
    { type: 'hole', w: 250, h: 290, r: 125, at: [0, 50.3, 80], rot: [-90, 0, 0], fill: 'dark', finish: 'hole' },
    { type: 'text', text: 'smartmi', size: 12, at: [0, 40, BASE_FRONT + 0.3] },
  ],
})

const lidShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'slab', w: 384, d: 519, h: 14, r: 185 },
    { type: 'slab', w: 350, d: 470, h: 6, r: 165, at: [0, 14, 20] },
  ],
})

const valveShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 10, h: 30, axis: 'z', at: [0, 0, 15] },
    { type: 'box', size: [30, 30, 30], chamfer: 3, at: [0, 0, 42] },
    { type: 'cylinder', r: 8, h: 22, at: [0, 26, 42] },
    { type: 'cylinder', r: 26, h: 4, axis: 'z', at: [0, 0, 2] },
  ],
})

const filterShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 20, h: 90 },
    { type: 'cylinder', r: 13, h: 10, at: [0, -40, 0], fill: 'shade', finish: 'steel' },
    { type: 'cylinder', r: 8, h: 14, at: [0, 52, 0], fill: 'shade', finish: 'steel' },
    { type: 'cylinder', r: 7, h: 16, axis: 'x', at: [27, 20, 0], fill: 'shade', finish: 'steel' },
    { type: 'text', text: '连接水箱', size: 5, at: [0, 36, 20.2] },
  ],
})

/** 马桶盖软管接头：原点在接头端面，+x 拧进马桶盖进水口 */
const hoseEndShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 10, h: 14, axis: 'x', at: [-7, 0, 0] },
    { type: 'cylinder', r: 5, h: 6, axis: 'x', at: [3, 0, 0] },
  ],
})

/** 漏电保护插头：原点在插头与插座交界，+x 插入；-x 面上是复位 / 试验键和指示灯 */
const plugShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [40, 64, 46], chamfer: 6, at: [-20, 0, 0] },
    { type: 'box', size: [12, 2, 7], at: [6, 9, -8], fill: 'shade', finish: 'zinc' },
    { type: 'box', size: [12, 2, 7], at: [6, 9, 8], fill: 'shade', finish: 'zinc' },
    { type: 'box', size: [12, 7, 2], at: [6, -11, 0], fill: 'shade', finish: 'zinc' },
  ],
})

/** 遥控器正面 6 列按键（官方图）：前三列上下两个键，后三列是上下两半的长条翘板键 */
const KEY_PITCH = 25
const KEY_ROW = 12
const remoteKey = (label: string, mark?: Finish): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [23.5, 23, 1.6], chamfer: 0.6 },
    ...(mark ? [{ type: 'box' as const, size: [4.5, 4.5, 0.4] as Vec3, at: [0, 4.5, 0.9] as Vec3, fill: 'warm' as const, finish: mark }] : []),
    { type: 'text', text: label, size: 4.2, at: [0, mark ? -4.5 : 0, 0.85], fill: 'dark' },
  ],
})

const holderShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [176, 70, 4], chamfer: 1, at: [0, 32, -12] },
    { type: 'box', size: [176, 6, 30], chamfer: 1, at: [0, 0, 2] },
    { type: 'box', size: [176, 8, 3], chamfer: 1, at: [0, 7, 15.5] },
  ],
})

const brushShape = (): Shape => ({
  type: 'compound',
  items: [
    { type: 'box', size: [11, 10, 24], chamfer: 1, at: [0, -7, 0], fill: 'white' },
    { type: 'box', size: [11, 6, 150], chamfer: 2, at: [0, 0, -82], fill: 'shade', finish: { color: '#5aa9e6', roughness: 0.4 } },
  ],
})

// ---------- 零件 ----------

const sideKey = (id: string, name: string, spec: string, z: number): SpecPart => ({
  id, name, spec, parent: 'seat', shape: { type: 'box', size: [3, 10, 12], chamfer: 1 }, at: [SIDE_X - 1, KEY_Y, z], fill: 'shade',
})
const sideLed = (id: string, name: string, z: number): SpecPart => ({
  id, name, parent: 'seat', shape: { type: 'led', r: 3, color: LED_BLUE }, at: [SIDE_X - 0.3, LED_Y, z], rot: [0, -90, 0],
})
/** col 0–5 从左到右，top = 上排 */
const rKey = (id: string, name: string, label: string, col: number, top: boolean, mark?: Finish): SpecPart => ({
  id, name, parent: 'remote', shape: remoteKey(label, mark), at: [(col - 2.5) * KEY_PITCH, top ? KEY_ROW : -KEY_ROW, 9.8], finish: 'plastic-white',
})

const parts: SpecPart[] = [
  { id: 'wall', name: '墙面', shape: { type: 'box', size: [1800, 1400, 20] }, at: WALL_AT, finish: 'wall' },
  { id: 'floor', name: '地面', shape: { type: 'box', size: [1800, 0.4, 1300] }, at: [0, 0.2, 360], fill: 'shade', finish: TILE },
  { id: 'toilet', name: '连体式马桶（陶瓷）', spec: '安装孔距 140 · 座圈宽 < 400', shape: toiletShape(), finish: CERAMIC },

  // 安装配件：固定套 → 固定件 → 螺丝依次叠放
  {
    id: 'sleeves', name: '橡胶固定套 ×2', spec: '塞进马桶安装孔', parent: 'toilet',
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 8, h: 30, at: [70, 0, 0] }, { type: 'cylinder', r: 8, h: 30, at: [-70, 0, 0] }] },
    at: [0, 385, -5], fill: 'dark', finish: 'rubber',
  },
  { id: 'card', name: '安装纸卡', spec: '居中放在马桶台面上', parent: 'toilet', shape: { type: 'box', size: [380, 1, 200] }, at: [0, 400.5, 40], fill: 'warm', finish: 'paper' },
  { id: 'plate', name: '固定件', spec: '平时卡在马桶盖底座下，按 ⓐ 取下', parent: 'sleeves', shape: { type: 'box', size: [200, 6, 60], chamfer: 2 }, at: [0, 19, 0], fill: 'shade', finish: 'plastic-grey' },
  {
    id: 'screws', name: '螺丝 + 调节片、压板组件 ×2', parent: 'plate',
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 9, h: 4, at: [70, 0, 0] },
        { type: 'cylinder', r: 9, h: 4, at: [-70, 0, 0] },
        { type: 'cylinder', r: 3.5, h: 44, at: [70, -24, 0] },
        { type: 'cylinder', r: 3.5, h: 44, at: [-70, -24, 0] },
      ],
    },
    at: [0, 5, 0], fill: 'shade', finish: 'steel',
  },
  {
    id: 'old-seat', name: '原马桶盖板',
    shape: { type: 'compound', items: [{ type: 'slab', w: 370, d: 500, h: 22, r: 175 }, { type: 'slab', w: 370, d: 480, h: 18, r: 175, at: [0, 22, 10] }] },
    at: SEAT_AT,
  },

  // 马桶盖主机
  {
    id: 'seat', name: '智米智能马桶盖 S', spec: 'ZNMTG02ZM · 519 × 390 × 131 mm',
    shape: seatShape(), at: SEAT_AT,
    model: { src: '/models/zhimi-toilet-seat-s/seat.glb', rot: [0, -90, 11], fit: 'stretch', crop: { min: [0, 0.13, 0], max: [1, 0.345, 1] } },
  },
  { id: 'lid', name: '座盖', parent: 'seat', shape: lidShape(), at: HINGE, pivot: [0, 0, HALF_D], rot: LID_CLOSED.rot, finish: 'plastic-white' },
  { id: 'sensor', name: '着座感应点', spec: '座圈左前部 · 皮肤贴住才能清洗', parent: 'seat', shape: { type: 'hole', w: 36, h: 14, r: 5 }, at: [150, 50.3, 170], rot: [-90, 0, 0], fill: 'shade' },
  { id: 'nozzle', name: '清洗器（喷杆）', spec: '臀洗 / 妇洗 · 四挡位置', parent: 'seat', shape: { type: 'cylinder', r: 6, h: 90, axis: 'z' }, at: NOZZLE.home, fill: 'shade', finish: 'steel' },
  sideKey('k-dry', '③ 烘干键（侧键）', '长按 5 秒 = Wi-Fi 重置', -220),
  sideKey('k-front', '⑧ 妇洗键（侧键）', '', -190),
  sideKey('k-rear', '② 臀洗键（侧键）', '配对时短按', -160),
  sideKey('k-stop', '① 停止 / 电源键（侧键）', '长按 2 秒待机', -130),
  sideLed('led-power', '电源指示灯', -225),
  sideLed('led-seat', '座温指示灯', -200),
  sideLed('led-water', '水温指示灯', -175),
  sideLed('led-remote', '遥控器指示灯（主机）', -150),
  sideLed('led-wifi', 'WIFI 指示灯', -125),
  { id: 'night-led', name: '夜灯', parent: 'seat', shape: { type: 'led', r: 5, color: '#ffd9a0' }, at: [90, 65, BASE_FRONT + 0.3] },
  { id: 'release', name: '拆卸按钮', spec: '按住后把马桶盖向前拉出', parent: 'seat', shape: { type: 'box', size: [3, 10, 24], chamfer: 1 }, at: [SIDE_X - 1, 18, -112], fill: 'shade' },
  { id: 'seat-inlet', name: '马桶盖进水口', parent: 'seat', shape: { type: 'hole', w: 16, h: 16, r: 8 }, at: INLET, rot: [0, -90, 0], fill: 'dark', finish: 'hole' },
  { id: 'mesh', name: '钢网过滤器', spec: '装在进水口里，螺丝刀拧出', parent: 'seat', shape: { type: 'cylinder', r: 6, h: 14, axis: 'x' }, at: MESH_HOME, fill: 'shade', finish: 'steel' },

  // 供水
  { id: 'valve', name: '供水角阀', spec: '向左旋转打开', parent: 'wall', shape: valveShape(), at: onWall(VALVE_AT), fill: 'shade', finish: 'steel' },
  { id: 'valve-knob', name: '角阀手柄', spec: '竖直 = 开 · 水平 = 关', parent: 'valve', shape: { type: 'box', size: [8, 40, 6], chamfer: 1.5 }, at: [0, 0, 60], fill: 'dark', finish: { color: '#2b6cd6', roughness: 0.4 } },
  { id: 'filter', name: '马桶盖过滤器', spec: '下接角阀 · 上接水箱 · 侧口接马桶盖', parent: 'valve', shape: filterShape(), at: FILTER_AT, finish: 'plastic-white' },
  { id: 'filter-cap', name: '过滤器盖', spec: '逆时针拧下', parent: 'filter', shape: { type: 'cylinder', r: 13, h: 12, axis: 'z' }, at: [0, -15, 20], fill: 'shade', finish: 'plastic-grey' },
  { id: 'cartridge', name: '滤芯', spec: '黑色橡胶圈一端朝里', parent: 'filter', shape: { type: 'cylinder', r: 8, h: 26, axis: 'z' }, at: [0, -15, 0], fill: 'warm', finish: 'paper' },
  { id: 'old-hose', name: '原马桶供水软管', shape: { type: 'cable', from: { part: 'valve', at: [0, 37, 42], dir: [0, 1, 0] }, to: { part: 'toilet', ...TOILET_INLET }, r: 6 }, finish: BRAID },
  { id: 'tank-hose', name: '马桶供水软管', spec: '接过滤器「连接水箱」口', shape: { type: 'cable', from: { part: 'filter', at: [0, 59, 0], dir: [0, 1, 0] }, to: { part: 'toilet', ...TOILET_INLET }, r: 6 }, finish: BRAID },
  { id: 'hose-end', name: '马桶盖供水软管接头', parent: 'seat', shape: hoseEndShape(), at: add(INLET, [-30, 0, 0]), finish: 'steel' },
  { id: 'seat-hose', name: '马桶盖供水软管', shape: { type: 'cable', from: { part: 'hose-end', at: [-14, 0, 0], dir: [-1, 0, 0] }, to: { part: 'filter', at: [35, 20, 0], dir: [1, 0, 0] }, r: 5, slack: 0.25 }, finish: BRAID },

  // 电源
  { id: 'socket', name: '墙面插座', spec: '220V 10A 以上 · 可靠接地', parent: 'wall', shape: { type: 'hole', w: 86, h: 86, r: 8 }, at: onWall(SOCKET_AT), fill: 'white', finish: 'plastic-white' },
  { id: 'plug', name: '漏电保护插头', parent: 'wall', shape: plugShape(), finish: 'plastic-white' },
  { id: 'plug-reset', name: '复位键', parent: 'plug', shape: { type: 'box', size: [3, 12, 18], chamfer: 1 }, at: [-41, 10, 0], fill: 'shade', finish: { color: '#3a8ee6', roughness: 0.4 } },
  { id: 'plug-test', name: '试验键', parent: 'plug', shape: { type: 'box', size: [3, 10, 14], chamfer: 1 }, at: [-41, -12, 0], fill: 'shade', finish: { color: '#e14b3b', roughness: 0.4 } },
  { id: 'plug-led', name: '插头电源指示灯', parent: 'plug', shape: { type: 'led', r: 3, color: LED_GREEN }, at: [-40.3, 25, 0], rot: [0, -90, 0] },
  { id: 'cord', name: '电源线', spec: '约 1.5 m', shape: { type: 'cable', from: { part: 'plug', at: [-40, -22, 0], dir: [-1, 0, 0] }, to: { part: 'seat', at: [-150, 20, -HALF_D], dir: [0, 0, -1] }, r: 3.5, slack: 0.3 }, finish: 'plastic-white' },

  // 遥控器
  { id: 'holder', name: '遥控器挂架', spec: '膨胀螺丝或双面胶固定', shape: holderShape(), at: HOLDER_AT, finish: 'plastic-white' },
  {
    id: 'remote', name: '遥控器', spec: 'AAA 1.5V × 4',
    shape: { type: 'box', size: [160, 62, 18], chamfer: 4 }, parent: 'holder', at: [0, 33, 1], finish: 'plastic-white',
  },
  rKey('r-stop', '① 停止 / 电源', '停止', 0, true, ORANGE),
  rKey('r-front', '⑧ 妇洗 / 往复', '妇洗', 0, false),
  rKey('r-rear', '② 臀洗 / 往复', '臀洗', 1, true),
  rKey('r-massage', '⑦ 冷热按摩', '按摩', 1, false),
  rKey('r-dry', '③ 烘干 / 风温', '烘干', 2, true),
  rKey('r-heat', '⑨ 坐圈加热', '座温', 2, false),
  rKey('r-fwd', '④ 喷头前移', '前移', 3, true),
  rKey('r-back', '④ 喷头后移', '后移', 3, false),
  rKey('r-fup', '⑤ 水流增大', '水流+', 4, true),
  rKey('r-fdown', '⑤ 水流减小', '水流−', 4, false),
  rKey('r-tup', '⑥ 水温升高', '水温+', 5, true),
  rKey('r-tdown', '⑥ 水温降低', '水温−', 5, false),
  { id: 'r-led', name: '遥控器指示灯', parent: 'remote', shape: { type: 'led', r: 1.4, color: LED_BLUE }, at: [0, 26.2, 9.2] },
  { id: 'r-cover', name: '电池盖', parent: 'remote', shape: { type: 'box', size: [90, 46, 1.6], chamfer: 0.6 }, at: [25, 0, -9.6], finish: 'plastic-white' },
  {
    id: 'batt', name: '电池 AAA ×4', parent: 'remote',
    shape: { type: 'compound', items: [-15, -5, 5, 15].map((y) => ({ type: 'cylinder' as const, r: 4.8, h: 44, axis: 'x' as const, at: [25, y, -3] as Vec3 })) },
    fill: 'shade', finish: 'zinc', visible: false,
  },

  // 工具
  { id: 'phone', name: '手机', shape: { type: 'box', size: [72, 150, 8], chamfer: 6 }, at: [-60, 640, 470], rot: [-15, 15, 0], fill: 'dark', visible: false },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', shape: { type: 'screen', w: 64, h: 136 }, at: [0, 0, 4.2] },
  { id: 'brush', name: '牙刷', shape: brushShape(), at: [0, 471, 285], visible: false },
  { id: 'towel', name: '热水布', spec: '盖住供水软管和接头', shape: { type: 'box', size: [110, 3, 80], chamfer: 1 }, at: [-300, 300, -232], fill: 'warm', finish: { color: '#f2c6a0', roughness: 0.9 }, visible: false },
  { id: 'cloth', name: '软湿布', shape: { type: 'box', size: [180, 3, 140], chamfer: 1 }, at: [60, 490, 300], rot: [5, 0, 0], fill: 'warm', finish: { color: '#9fd0e8', roughness: 0.9 }, visible: false },
]

// ---------- 状态 ----------

const LEDS_OFF: Record<string, PartState> = {
  'led-power': { light: 'off' }, 'led-seat': { light: 'off' }, 'led-water': { light: 'off' },
  'led-remote': { light: 'off' }, 'led-wifi': { light: 'off' }, 'night-led': { light: 'off' }, 'r-led': { light: 'off' },
}

const INSTALLED: Record<string, PartState> = {
  ...hide('old-seat', 'sleeves', 'card', 'old-hose'),
  ...LEDS_OFF,
  'led-power': { light: 'on' },
  'led-remote': { light: 'on' },
  'led-wifi': { light: 'on' },
  'plug-led': { light: 'on' },
  'hose-end': { plug: 'seat-inlet' },
  plug: { plug: 'socket' },
  'valve-knob': { rot: KNOB_OPEN.rot },
  lid: { rot: LID_CLOSED.rot },
  remote: REMOTE_HOME,
}

// ---------- 镜头 ----------

const OVERVIEW: CameraSpec = { target: [-160, 400, 40], dir: [-0.55, 0.45, 1], dist: 2300 }
const DECK: CameraSpec = { target: [0, 420, 120], dir: [-0.35, 1, 0.75], dist: 1250 }
const PLUMB: CameraSpec = { target: [-260, 290, -170], dir: [-0.7, 0.35, 1], dist: 1050 }
const SIDE: CameraSpec = { target: [-160, 440, 40], dir: [-1, 0.45, 0.55], dist: 950 }
const POWER: CameraSpec = { target: [-360, 430, -150], dir: [-0.45, 0.3, 1], dist: 1200 }
const WALL_VIEW: CameraSpec = { target: [-460, 600, -220], dir: [-0.2, 0.15, 1], dist: 1150 }
const HAND: CameraSpec = { target: 'remote', dir: [0.1, 0.55, 1], dist: 420 }
const BOWL: CameraSpec = { target: [0, 450, 200], dir: [-0.3, 1.1, 0.9], dist: 1050 }
const SCENE: CameraSpec = { target: [-150, 520, 220], dir: [-0.45, 0.5, 1], dist: 1450 }
const FRONT: CameraSpec = { target: [0, 430, 300], dir: [-0.5, 0.45, 1], dist: 1500 }

const zoomOn = (target: string, caption: string, dir: Vec3, dist: number) => ({ target, dir, dist, caption })
const zoomSide = (target: string, caption: string, dist = 200) => zoomOn(target, caption, [-1, 0.25, 0.2], dist)
const zoomNozzle = (caption: string) => zoomOn('nozzle', caption, [0.3, 1, 0.7], 230)

// ---------- 说明书 ----------

export const zhimiToiletSeatS: ManualSpec = {
  id: 'zhimi-toilet-seat-s',
  name: '智米智能马桶盖 S（ZNMTG02ZM）',
  desc: '即热式智能马桶盖：安装与通水、按键与遥控器、清洁保养、故障排查',
  category: '卫浴',
  dims: { width: 390, depth: 519, height: 131 },
  source: {
    title: '智米智能马桶盖S 使用说明书',
    url: 'https://home.mi.com/views/introduction.html?model=zhimi.toilet.va1&pdid=1663&region=cn',
    images: [],
  },
  package: [
    { name: '智能马桶盖', qty: 1, spec: 'ZNMTG02ZM' },
    { name: '橡胶固定套', qty: 2 },
    { name: '螺丝', qty: 2 },
    { name: '调节片、压板组件', qty: 2 },
    { name: '马桶盖过滤器', qty: 1 },
    { name: '马桶盖供水软管', qty: 1 },
    { name: '固定件', qty: 1 },
    { name: '安装纸卡', qty: 1 },
    { name: '说明书', qty: 1 },
    { name: '膨胀螺丝', qty: 2 },
    { name: '遥控器', qty: 1 },
    { name: '电池', qty: 4, spec: 'AAA 1.5V' },
    { name: '遥控器挂架', qty: 1 },
    { name: '弯头', qty: 1, spec: '角阀离墙 < 20 mm 时用' },
  ],
  params: [
    { label: '型号', value: 'ZNMTG02ZM' },
    { label: '外形尺寸', value: '519 × 390 × 131 mm' },
    { label: '重量', value: '净重约 4.5 kg', note: '毛重约 6.5 kg' },
    { label: '额定电压 / 功率', value: '220V~ 50Hz / 1200W' },
    { label: '加热方式', value: '即热式' },
    { label: '进水水压', value: '0.08–0.75 MPa' },
    { label: '供水温度', value: '5–35℃', note: '使用环境 4–40℃' },
    { label: '防水等级', value: 'IPX4' },
    { label: '遥控器电池', value: 'AAA 1.5V × 4' },
    { label: 'CMIIT ID', value: '2017DP6053' },
  ],
  parts,
  initial: INSTALLED,
  stageSize: 1900,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
  guides: [
    // ================= 安装 =================
    {
      id: 'install', title: '安装与通水', kind: 'assembly',
      start: {
        ...hide('seat', 'hose-end', 'seat-hose', 'cord', 'plug', 'filter', 'tank-hose', 'holder', 'remote', 'card', 'sleeves'),
        ...LEDS_OFF,
        'old-seat': { visible: true },
        'old-hose': { visible: true },
        sleeves: { visible: false, at: [0, 470, -5] },
        plate: { visible: false, at: [0, 80, 0] },
        screws: { visible: false, at: [0, 60, 0] },
        card: { visible: false, at: [0, 460, 40] },
        seat: { visible: false, at: SEAT_OUT },
        filter: { visible: false, at: add(FILTER_AT, [0, 80, 0]), rot: [0, 0, 0] },
        'hose-end': { visible: false, parent: 'seat', ...HOSE_LOOSE },
        plug: { visible: false, ...PLUG_LOOSE },
        'plug-led': { light: 'off' },
        'valve-knob': { rot: KNOB_CLOSED.rot },
        holder: { visible: false, at: add(HOLDER_AT, [0, 0, 120]) },
        remote: { visible: false, parent: null, at: [-560, 733, -60], rot: [0, 0, 0] },
      },
      steps: [
        {
          id: 'a-check', title: '安装前确认：尺寸、水压、电源', page: 3,
          desc: '先确认马桶能装：两个安装孔孔距 116–178 mm，安装孔离水箱 55–85 mm，安装孔到座便圈前沿推荐 450–505 mm，座便圈宽小于 400 mm，马桶盖后沿离水箱至少 25 mm。供水角阀全开 10 秒出水超过 2.3 升，插座为 220V、10A 以上并可靠接地。',
          tip: '角阀与马桶距离不超过 600 mm（电源线约 1.5 m）。安装完成前请勿插电。',
          camera: OVERVIEW,
          highlight: ['toilet'],
          chips: [{ label: '孔距', sub: '116–178 mm' }, { label: '孔到水箱', sub: '55–85 mm' }, { label: '孔到前沿', sub: '450–505 mm' }, { label: '水压', sub: '10 秒 > 2.3 升' }],
          callouts: [
            { part: 'toilet', text: '安装孔 ×2', sub: '孔距 140 mm', at: [70, 400, -5], offset: [120, 120, 0] },
            { part: 'valve', text: '供水角阀', sub: '离马桶 ≤ 600 mm', offset: [-80, 90, 0] },
            { part: 'socket', text: '插座', sub: '220V · 10A · 接地', offset: [-60, 90, 0] },
          ],
        },
        {
          id: 'a-old', title: '拆下原来的马桶盖板', page: 4,
          desc: '拧下原马桶盖板的固定螺丝，把旧盖板整个取下，清理干净安装孔周围的台面。',
          camera: OVERVIEW,
          set: { 'old-seat': { at: [720, 0, 380], via: [300, 760, 260], dur: 1.8 } },
          highlight: ['old-seat'],
        },
        {
          id: 'a-sleeve', title: '把橡胶固定套塞进安装孔', page: 4,
          desc: '把两个橡胶固定套分别插入马桶的两个安装孔，压到与台面齐平。',
          camera: DECK,
          set: { 'old-seat': { visible: false }, sleeves: { visible: true, at: [0, 385, -5], dur: 1.2 } },
          highlight: ['sleeves'],
          zoom: zoomOn('sleeves', '橡胶固定套 ×2：压进安装孔', [-0.2, 1, 0.7], 380),
        },
        {
          id: 'a-card', title: '居中放好安装纸卡', page: 4,
          desc: '安装纸卡居中放在马桶台面上，方框对准两个安装孔；把纸卡上清洗器位置的折边垂直往下折，靠近陶瓷内圈。',
          camera: DECK,
          set: { card: { visible: true, at: [0, 400.5, 40], dur: 1.2 } },
          highlight: ['card'],
          callouts: [{ part: 'card', text: '折边往下折', sub: '靠近陶瓷内圈', at: [0, 0.5, 100], offset: [0, 120, 80] }],
        },
        {
          id: 'a-plate', title: '放固定件，拧入螺丝', page: 4,
          desc: '固定件平时卡在马桶盖底座下面，按住底座上的拆卸按钮 ⓐ 把它取下，放进纸卡的方框里；两颗螺丝套上调节片、压板组件，穿过固定件拧进橡胶固定套。',
          tip: '先不要拧到最紧，方便下一步对正马桶盖。',
          camera: DECK,
          set: {
            plate: { visible: true, at: [0, 19, 0], dur: 1.2 },
            screws: { visible: true, at: [0, 5, 0], dur: 1.2, delay: 1.2 },
          },
          actions: [{ type: 'spin', part: 'screws', axis: 'y', delay: 2.6 }],
          highlight: ['plate', 'screws'],
          zoom: zoomOn('plate', '固定件 + 螺丝拧进固定套', [-0.2, 1, 0.6], 420),
        },
        {
          id: 'a-seat', title: '取下纸卡，把马桶盖平推到位', page: 4,
          desc: '抽走安装纸卡，把马桶盖放到台面上，对准固定件向后平推，听到“咔哒”一声卡扣自动锁定。',
          tip: '马桶盖与陶瓷不吻合时，按住侧面拆卸按钮把主机拉出，松开螺丝调整固定件位置后再锁紧。',
          camera: SCENE,
          set: {
            card: { visible: false, dur: 0.4 },
            plate: { visible: false, dur: 0.4 },
            seat: { visible: true, at: SEAT_AT, dur: 1.6, delay: 0.6 },
          },
          actions: [{ type: 'press', part: 'seat', depth: 3, delay: 2.4 }],
          highlight: ['seat'],
          chips: [{ label: '离水箱', sub: '≥ 25 mm' }],
        },
        {
          id: 'a-flush', title: '拆下原供水软管，放水冲掉砂石', page: 5,
          desc: '先关闭角阀，拧下原来连在角阀上的马桶供水软管；拿桶接住出水口，打开供水角阀，排净水管里可能残留的砂石等杂质。',
          tip: '原软管不能重复使用，请使用随附的新软管。',
          camera: PLUMB,
          set: { 'old-hose': { visible: false }, 'valve-knob': KNOB_OPEN },
          actions: [{ type: 'spin', part: 'valve-knob', axis: 'z' }],
          highlight: ['valve', 'valve-knob'],
          zoom: zoomOn('valve', '角阀出水口：先放水排砂', [-0.4, 0.4, 1], 260),
        },
        {
          id: 'a-filter', title: '关阀，把马桶盖过滤器装到角阀上', page: 5,
          desc: '关闭角阀。角阀出水口外沿离墙超过 20 mm 时，把马桶盖过滤器的进水口直接装到角阀出水口上，顺时针拧紧（方式 A）。',
          tip: '离墙不足 20 mm 时先在角阀上接随附的弯头，再把过滤器装到弯头出水口（方式 B）。禁止使用中水。',
          camera: PLUMB,
          set: {
            'valve-knob': KNOB_CLOSED,
            filter: { visible: true, at: FILTER_AT, dur: 1.3, delay: 0.6 },
          },
          actions: [{ type: 'spin', part: 'filter', axis: 'y', delay: 2.2 }],
          highlight: ['filter', 'valve-knob'],
          zoom: zoomOn('filter', '过滤器拧到角阀出水口', [-0.4, 0.35, 1], 320),
        },
        {
          id: 'a-tank-hose', title: '马桶供水软管接到「连接水箱」口', page: 5,
          desc: '把通往马桶水箱的供水软管拧到过滤器顶部标有「连接水箱」的接口上，注意螺纹对正，再用扳手加固拧紧。',
          camera: PLUMB,
          set: { 'tank-hose': { visible: true } },
          highlight: ['tank-hose', 'filter'],
          callouts: [
            { part: 'filter', text: '连接水箱', at: [0, 59, 0], offset: [-90, 70, 0] },
            { part: 'toilet', text: '马桶进水口', at: TOILET_INLET.at, offset: [-60, 90, 0] },
          ],
        },
        {
          id: 'a-seat-hose', title: '接马桶盖供水软管', page: 5,
          desc: '马桶盖供水软管一头拧到过滤器侧面的出水口，另一头拧进马桶盖右侧后部的进水口，两端都拧紧。',
          camera: PLUMB,
          set: {
            'hose-end': { visible: true, plug: 'seat-inlet', dur: 1.3 },
            'seat-hose': { visible: true },
          },
          highlight: ['hose-end', 'seat-hose'],
          zoom: zoomSide('hose-end', '马桶盖进水口：软管拧紧', 220),
        },
        {
          id: 'a-water', title: '打开角阀，检查四处接口不漏水', page: 6,
          desc: '确认 ⓐⓑⓒⓓ 四处接口螺母都已装到位，没有破裂、歪斜或松动；把供水角阀向左旋转打开到最大，观察各连接处有没有漏水。',
          tip: 'ⓐ、ⓓ 漏水请重新拧紧；ⓑ、ⓒ 漏水请检查密封圈。',
          camera: PLUMB,
          set: { 'valve-knob': KNOB_OPEN },
          highlight: ['valve-knob', 'filter', 'hose-end'],
          callouts: [
            { part: 'filter', text: 'ⓐ', at: [0, -40, 0], offset: [-70, -30, 0] },
            { part: 'filter', text: 'ⓑ', at: [0, 59, 0], offset: [-70, 50, 0] },
            { part: 'toilet', text: 'ⓒ', at: TOILET_INLET.at, offset: [-40, 70, 0] },
            { part: 'hose-end', text: 'ⓓ', offset: [-60, 60, 0] },
            { part: 'valve-knob', text: '向左开到最大', offset: [-110, -40, 0] },
          ],
        },
        {
          id: 'a-power', title: '插电，复位 / 试验检查漏电保护', page: 6,
          desc: '把电源插头插进墙面插座，按「复位」键，插头上的电源指示灯亮；再按「试验」键，指示灯熄灭、电源切断，说明漏电保护正常；最后再按一次「复位」，指示灯亮起即可使用。',
          tip: '请使用单独的插座并可靠接地，严禁把地线接到零线或水管上。',
          camera: POWER,
          set: {
            plug: { visible: true, plug: 'socket', dur: 1.3 },
            cord: { visible: true },
            'plug-led': { light: 'on', delay: 1.8 },
            'led-power': { light: 'on', delay: 1.8 },
          },
          actions: [
            { type: 'press', part: 'plug-reset', delay: 1.5 },
            { type: 'press', part: 'plug-test', delay: 2.6 },
            { type: 'press', part: 'plug-reset', delay: 3.6 },
          ],
          highlight: ['plug', 'plug-reset', 'plug-test', 'plug-led', 'led-power'],
          zoom: zoomOn('plug', '复位 → 试验（灯灭）→ 复位', [-0.15, 0.2, 1], 230),
        },
        {
          id: 'a-trial', title: '试运行：手贴感应点，试臀洗', page: 6,
          desc: '掀开座盖，用手贴住座圈左前部的着座感应点（不着座不能启动臀洗、妇洗），按臀洗、妇洗，检查清洗强度、喷嘴位置、水温和座温；松开手或按「停止」即关闭。',
          tip: '试按时用塑料布罩住清洗器前端，以免水花四溅。',
          camera: BOWL,
          set: { lid: LID_OPEN, nozzle: { ...nozzleAt('rear'), delay: 1.2 } },
          highlight: ['sensor', 'nozzle'],
          callouts: [
            { part: 'sensor', text: '着座感应点', sub: '手贴住', offset: [60, 80, 0] },
            { part: 'nozzle', text: '清洗器伸出', offset: [-90, 100, 0] },
          ],
        },
        {
          id: 'a-remote', title: '装遥控器挂架，放好遥控器', page: 5,
          desc: '用 φ6 钻头在墙上打孔，塞入膨胀螺丝固定遥控器挂架，再把遥控器放进挂架；不方便打孔时，清理墙面后用双面胶粘贴。',
          camera: WALL_VIEW,
          set: {
            holder: { visible: true, at: HOLDER_AT, dur: 1.2 },
            remote: { visible: true, ...REMOTE_HOME, delay: 1.2 },
            lid: LID_CLOSED,
            nozzle: nozzleAt('home'),
          },
          highlight: ['holder', 'remote'],
        },
      ],
    },

    // ================= 日常使用 =================
    {
      id: 'use', title: '按键与日常使用', kind: 'usage',
      start: { 'led-water': { light: 'off' }, 'led-seat': { light: 'off' }, 'led-remote': { light: 'off' } },
      steps: [
        {
          id: 'u-panel', title: '认识侧键和上壳指示灯', page: 7,
          desc: '马桶盖右侧面从后到前是 ③烘干、⑧妇洗、②臀洗、①停止四个侧键，上方一排是电源、座温、水温、遥控器、WIFI 五个指示灯；最前面是拆卸按钮。',
          camera: SIDE,
          highlight: ['k-dry', 'k-front', 'k-rear', 'k-stop', 'led-power', 'led-wifi'],
          zoom: zoomSide('k-front', '侧键：烘干 · 妇洗 · 臀洗 · 停止', 230),
          callouts: [
            { part: 'k-dry', text: '③ 烘干', offset: [-40, -80, 0] },
            { part: 'k-front', text: '⑧ 妇洗', offset: [-30, -130, 0] },
            { part: 'k-rear', text: '② 臀洗', offset: [0, -80, 0] },
            { part: 'k-stop', text: '① 停止', offset: [20, -130, 0] },
            { part: 'led-seat', text: '指示灯 ×5', sub: '电源 · 座温 · 水温 · 遥控器 · WIFI', offset: [-40, 90, 0] },
            { part: 'release', text: '拆卸按钮', offset: [80, -70, 0] },
          ],
        },
        {
          id: 'u-remote', title: '认识遥控器', page: 7,
          desc: '遥控器正面两排按键：停止/电源、冷热按摩、臀洗、妇洗、烘干/风温、坐圈加热、喷头前移/后移、水流增大/减小、水温升高/降低；背面还有除臭、夜灯两键和电池盖。',
          camera: HAND,
          set: { remote: REMOTE_HAND },
          highlight: ['remote'],
          callouts: [
            { part: 'r-stop', text: '停止 / 电源', offset: [-40, 60, 0] },
            { part: 'r-rear', text: '臀洗', offset: [0, 70, 0] },
            { part: 'r-front', text: '妇洗', offset: [-20, -60, 0] },
            { part: 'r-dry', text: '烘干 / 风温', offset: [20, 70, 0] },
            { part: 'r-fwd', text: '喷头前移 / 后移', offset: [40, 60, 0] },
            { part: 'r-tup', text: '水温', offset: [40, 50, 0] },
          ],
        },
        {
          id: 'u-on', title: '开机，掀开座盖坐好', page: 8,
          desc: '待机状态短按「停止/电源」开机，清洗强度、喷头位置、水温、座温恢复为上次的挡位；掀开座盖坐好。开机时长按「停止/电源」2 秒进入待机。',
          camera: SCENE,
          set: { lid: { ...LID_OPEN, delay: 0.8 } },
          actions: [{ type: 'press', part: 'r-stop', depth: 1 }],
          highlight: ['r-stop', 'lid'],
        },
        {
          id: 'u-rear', title: '臀洗：坐着按「臀洗」', page: 8,
          desc: '着座状态下按「臀洗」，清洗器伸出开始臀部清洗，按设定的强度、位置、水温喷水，周期 3 分钟；清洗中再按一次可开 / 关往复移动。',
          tip: '使用中请保持皮肤紧贴座圈感应区域，否则会停止清洗。',
          camera: BOWL,
          set: { nozzle: nozzleAt('rear') },
          actions: [{ type: 'press', part: 'r-rear', depth: 1 }],
          highlight: ['nozzle', 'r-rear'],
          zoom: zoomNozzle('清洗器伸出到臀洗位置'),
          chips: [{ label: '周期', sub: '3 分钟' }],
        },
        {
          id: 'u-adjust', title: '调喷头位置和水流', page: 8,
          desc: '清洗中按「喷头前移 / 后移」可前后移动喷头，共四挡；按「水流增大 / 减小」调节水流强度，也是四挡。',
          camera: BOWL,
          set: { nozzle: nozzleAt('rear2') },
          actions: [{ type: 'press', part: 'r-fwd', depth: 1 }],
          highlight: ['nozzle', 'r-fwd'],
          zoom: zoomNozzle('喷头前移一挡'),
          chips: [{ label: '喷头位置', sub: '4 挡' }, { label: '水流', sub: '4 挡' }],
        },
        {
          id: 'u-temp', title: '调水温，冷热按摩', page: 8,
          desc: '清洗中按「水温升高 / 降低」调水温，共 5 挡，水温指示灯亮起。按「冷热按摩」后冷热交替喷水：5 秒不加热、15 秒最高挡加热为一个周期，按「停止」结束。',
          camera: SIDE,
          set: { 'led-water': { light: 'on' } },
          actions: [{ type: 'press', part: 'r-tup', depth: 1 }],
          highlight: ['led-water'],
          zoom: zoomSide('led-water', '水温指示灯亮起', 160),
          chips: [{ label: '常温', sub: '灯不亮' }, { label: '1 挡', sub: '约 33℃' }, { label: '2 挡', sub: '约 35℃' }, { label: '3 挡', sub: '约 37℃' }, { label: '4 挡', sub: '约 39℃' }],
        },
        {
          id: 'u-front', title: '妇洗：按「妇洗」', page: 8,
          desc: '着座状态下按「妇洗」，清洗器伸到更靠前的妇洗位置喷水，周期 3 分钟；清洗中再按一次可开 / 关往复，其余调节与臀洗相同。',
          camera: BOWL,
          set: { nozzle: nozzleAt('front') },
          actions: [{ type: 'press', part: 'r-front', depth: 1 }],
          highlight: ['nozzle', 'r-front'],
          zoom: zoomNozzle('清洗器伸到妇洗位置'),
        },
        {
          id: 'u-dry', title: '停止清洗，烘干', page: 8,
          desc: '按「停止」中止清洗，清洗器收回；着座时按「烘干」开始暖风烘干，周期 4 分钟。烘干中或离座时再按可切换风温：常温 → 1 → 2 → 3 → 4 挡循环。',
          camera: BOWL,
          set: { nozzle: nozzleAt('home') },
          actions: [{ type: 'press', part: 'r-stop', depth: 1 }, { type: 'press', part: 'r-dry', depth: 1, delay: 1.4 }],
          highlight: ['nozzle', 'r-dry'],
          chips: [{ label: '烘干', sub: '4 分钟' }, { label: '风温', sub: '5 挡' }],
        },
        {
          id: 'u-heat', title: '坐圈加热、除臭和夜灯', page: 9,
          desc: '按「坐圈加热」调座温，共 5 挡，指示灯不亮为室温，实际座温约 30–42℃，每挡约差 2℃。遥控器背面的「除臭」「夜灯」可在自动 / 强制关闭间切换：自动模式着座即除臭、离座 30 秒后关闭；夜灯在光线暗时自动打开。',
          camera: SIDE,
          set: { 'led-seat': { light: 'on' }, 'night-led': { light: 'on' } },
          actions: [{ type: 'press', part: 'r-heat', depth: 1 }],
          highlight: ['led-seat', 'night-led'],
          zoom: zoomSide('led-seat', '座温指示灯亮起', 160),
          chips: [{ label: '座温', sub: '30–42℃ · 5 挡' }, { label: '除臭', sub: '离座 30 秒关' }, { label: '夜灯', sub: '暗时自动亮' }],
        },
        {
          id: 'u-pair', title: '遥控器配对', page: 9,
          desc: '首次使用需手动配对：在遥控器上同时长按「臀洗」「妇洗」5 秒，遥控器指示灯闪烁，主机遥控器指示灯闪烁并间断蜂鸣；30 秒内短按主机侧面的「臀洗」键，长鸣一声、主机遥控器指示灯常亮即配对成功。',
          camera: SCENE,
          set: { 'r-led': { light: 'blinkThenOff' }, 'led-remote': { light: 'on', delay: 2.5 }, lid: LID_CLOSED },
          actions: [
            { type: 'press', part: 'r-rear', depth: 1 },
            { type: 'press', part: 'r-front', depth: 1 },
            { type: 'press', part: 'k-rear', depth: 1, delay: 2 },
          ],
          highlight: ['r-rear', 'r-front', 'r-led', 'k-rear', 'led-remote'],
          zoom: zoomSide('led-remote', '主机遥控器指示灯：闪烁 → 常亮', 170),
          chips: [{ label: '长按', sub: '臀洗 + 妇洗 5 秒' }, { label: '30 秒内', sub: '按主机臀洗' }],
        },
        {
          id: 'u-app', title: 'Wi-Fi 重置，连接米家 APP', page: 9,
          desc: '手机初次连接或连不上时，长按机身「烘干」侧键 5 秒，听到提示音后松手，WIFI 指示灯闪烁。扫码或在应用商店搜索「米家」下载，首页右上角点「+」，按提示添加设备。',
          camera: SCENE,
          set: {
            'led-wifi': { light: 'blink' },
            phone: { visible: true },
            'phone-screen': { ui: { app: '米家', title: '添加设备', items: [{ text: '智米智能马桶盖 S', sub: 'zhimi.toilet.va1', state: 'selected' }, { text: '扫码添加', state: 'muted' }], button: '下一步', buttonActive: true } },
            remote: REMOTE_HOME,
          },
          actions: [{ type: 'press', part: 'k-dry', depth: 1 }],
          highlight: ['k-dry', 'led-wifi', 'phone'],
          zoom: zoomSide('led-wifi', 'WIFI 指示灯闪烁', 170),
        },
      ],
    },

    // ================= 清洁保养 =================
    {
      id: 'care', title: '清洁保养', kind: 'usage',
      steps: [
        {
          id: 'c-wipe', title: '用柔软湿布擦拭塑料件', page: 10,
          desc: '用拧干的柔软湿布擦拭座盖、座圈等塑料件，防止静电吸灰发黑变脏。',
          tip: '请勿向马桶盖内部加水或清洁剂，勿用水弄湿马桶盖和电源插头；塑料件勿用浓硫酸、酒精、汽油等擦拭。',
          camera: FRONT,
          set: { cloth: { visible: true } },
          actions: [{ type: 'shake', part: 'cloth', axis: 'x', amp: 40 }],
          highlight: ['cloth', 'lid'],
        },
        {
          id: 'c-remove', title: '按住拆卸按钮，向前拉出马桶盖', page: 10,
          desc: '要清洁马桶盖与陶瓷之间的缝隙时，按住马桶盖右侧的拆卸按钮，把马桶盖向前平拉，从固定件上取下。',
          tip: '移动马桶盖前请先停机并拔下电源插头。',
          camera: { ...SIDE, dist: 1250 },
          set: { cloth: { visible: false }, seat: { at: SEAT_OUT, dur: 1.5, delay: 0.6 } },
          actions: [{ type: 'press', part: 'release', depth: 1.5 }],
          highlight: ['release', 'seat'],
          zoom: zoomSide('release', '按住拆卸按钮', 180),
        },
        {
          id: 'c-back', title: '清洁后平推装回', page: 10,
          desc: '擦干净台面和固定件后，把马桶盖对准固定件向后平推，听到“咔哒”声即锁定。',
          camera: SIDE,
          set: { seat: { at: SEAT_AT, dur: 1.5 } },
          actions: [{ type: 'press', part: 'seat', depth: 3, delay: 1.6 }],
          highlight: ['seat'],
        },
        {
          id: 'c-nozzle', title: '手动清洁：伸出喷嘴，用牙刷刷', page: 11,
          desc: '离座时同时长按遥控器「喷头前移」「喷头后移」5 秒，喷嘴全部伸出并保持 5 分钟，用牙刷清除喷孔上的污垢或堵塞的杂质；按「停止」可提前收回。',
          camera: BOWL,
          set: {
            lid: LID_OPEN,
            remote: REMOTE_HAND,
            nozzle: { ...nozzleAt('clean'), delay: 1.4 },
            brush: { visible: true, delay: 2.6 },
          },
          actions: [
            { type: 'press', part: 'r-fwd', depth: 1 },
            { type: 'press', part: 'r-back', depth: 1 },
            { type: 'shake', part: 'brush', axis: 'z', amp: 15, delay: 2.8 },
          ],
          highlight: ['nozzle', 'brush'],
          zoom: zoomNozzle('喷嘴全部伸出 5 分钟'),
        },
        {
          id: 'c-mesh', title: '关角阀，拆下钢网过滤器刷洗', page: 10,
          desc: '清洗强度变弱时清洗钢网过滤器：先关闭供水角阀，拧下马桶盖进水口上的软管，用螺丝刀把钢网过滤器从进水口拧出，用牙刷刷净过滤网。',
          tip: '拆卸前务必关闭供水角阀。',
          camera: SIDE,
          set: {
            lid: LID_CLOSED,
            nozzle: nozzleAt('home'),
            remote: REMOTE_HOME,
            brush: { visible: false },
            'valve-knob': KNOB_CLOSED,
            'hose-end': { parent: 'seat', ...HOSE_LOOSE, delay: 0.8 },
            mesh: { at: MESH_OUT, dur: 1.2, delay: 2 },
          },
          highlight: ['mesh', 'valve-knob', 'hose-end'],
          zoom: zoomSide('mesh', '钢网过滤器从进水口拧出', 200),
        },
        {
          id: 'c-mesh-back', title: '装回过滤网，接回软管并拧紧', page: 10,
          desc: '把钢网过滤器拧回进水口并用力拧紧，再拧上马桶盖供水软管，打开供水角阀，确认没有漏水。',
          camera: SIDE,
          set: {
            mesh: { at: MESH_HOME, dur: 1.2 },
            'hose-end': { plug: 'seat-inlet', dur: 1.2, delay: 1.2 },
            'valve-knob': { ...KNOB_OPEN, delay: 2.4 },
          },
          highlight: ['mesh', 'hose-end', 'valve-knob'],
          zoom: zoomSide('hose-end', '用力拧紧，以免漏水', 200),
        },
        {
          id: 'c-cart-out', title: '更换滤芯：拧下过滤器盖，抽出旧滤芯', page: 5,
          desc: '关闭供水角阀，一手握住过滤器壳体，另一只手把过滤器盖逆时针旋转取下，抽出旧滤芯。',
          tip: '清洗强度变弱时更换滤芯；滤芯请到官网或官方指定地点购买。',
          camera: PLUMB,
          set: {
            'valve-knob': KNOB_CLOSED,
            'filter-cap': { at: [50, -15, 60], dur: 1.2, delay: 0.6 },
            cartridge: { at: [0, -15, 70], dur: 1.2, delay: 1.8 },
          },
          actions: [{ type: 'spin', part: 'filter-cap', axis: 'z' }],
          highlight: ['filter-cap', 'cartridge'],
          zoom: zoomOn('filter', '盖子逆时针拧下 · 抽出滤芯', [-0.3, 0.3, 1], 320),
        },
        {
          id: 'c-cart-in', title: '插入新滤芯，拧回盖子，开阀检漏', page: 5,
          desc: '新滤芯黑色橡胶圈一端朝里插进过滤器，把过滤器盖顺时针旋紧，打开供水角阀，检查没有漏水。',
          camera: PLUMB,
          set: {
            cartridge: { at: [0, -15, 0], dur: 1.2 },
            'filter-cap': { at: [0, -15, 20], dur: 1.2, delay: 1.2 },
            'valve-knob': { ...KNOB_OPEN, delay: 2.6 },
          },
          highlight: ['filter-cap', 'valve-knob'],
          zoom: zoomOn('filter', '黑色橡胶圈朝里 · 顺时针拧紧', [-0.3, 0.3, 1], 320),
        },
        {
          id: 'c-battery', title: '更换遥控器电池', page: 7,
          desc: '遥控器指示灯不亮、按键没反应时，取下遥控器背面的电池盖，装入 4 节 AAA 1.5V 电池，注意正负极，盖回电池盖。',
          camera: HAND,
          set: {
            remote: REMOTE_BACK,
            'r-cover': { at: [25, 0, -60], dur: 1, delay: 1.3 },
            batt: { visible: true, delay: 2.3 },
          },
          highlight: ['r-cover', 'batt'],
        },
      ],
    },

    // ================= 故障排查 =================
    {
      id: 'repair', title: '故障排查', kind: 'repair',
      start: { 'plug-led': { light: 'off' }, 'led-power': { light: 'off' } },
      steps: [
        {
          id: 'r-power', title: '无法开机：检查漏电保护插头', page: 13,
          desc: '先看插头上的电源指示灯：不亮时按一下「复位」键；按了仍不亮，检查插座是否有电、是否可靠接地。复位后马上又跳闸，请停止使用并联系售后。',
          tip: '售后服务电话 400-008-5678。',
          camera: POWER,
          set: { 'plug-led': { light: 'on', delay: 1.2 }, 'led-power': { light: 'on', delay: 1.2 } },
          actions: [{ type: 'press', part: 'plug-reset', delay: 0.6 }],
          highlight: ['plug', 'plug-reset', 'plug-led', 'led-power'],
          zoom: zoomOn('plug', '按「复位」，指示灯应亮起', [-0.15, 0.2, 1], 230),
        },
        {
          id: 'r-nowash', title: '按臀洗没反应：没有着座', page: 14,
          desc: '臀洗、妇洗只有在着座状态下才能启动。确认皮肤贴住座圈左前部的着座感应点；清洗中身体离开感应区域会自动停止。',
          camera: BOWL,
          set: { lid: LID_OPEN },
          highlight: ['sensor'],
          zoom: zoomOn('sensor', '着座感应点：保持贴住', [0.3, 1, 0.6], 220),
        },
        {
          id: 'r-weak', title: '清洗水流变弱', page: 10,
          desc: '先确认供水角阀已向左开到最大；仍然偏弱时，依次清洗马桶盖进水口的钢网过滤器、更换马桶盖过滤器的滤芯。',
          tip: '水压不足（全开 10 秒出水不到 2.3 升）时需加装增压泵。',
          camera: PLUMB,
          highlight: ['valve-knob', 'filter', 'mesh'],
          zoom: zoomSide('mesh', '进水口里的钢网过滤器', 200),
          callouts: [
            { part: 'valve-knob', text: '角阀开到最大', offset: [-100, 60, 0] },
            { part: 'filter', text: '换滤芯', offset: [-110, -50, 0] },
            { part: 'hose-end', text: '洗钢网过滤器', offset: [-40, 90, 0] },
          ],
        },
        {
          id: 'r-leak', title: '接口漏水', page: 6,
          desc: '关闭角阀后找到漏水的位置：过滤器与角阀之间 ⓐ、马桶盖进水口 ⓓ 漏水，重新拧紧；水箱软管两端 ⓑ、ⓒ 漏水，检查密封圈是否装好、有无破损。',
          camera: PLUMB,
          set: { 'valve-knob': KNOB_CLOSED },
          highlight: ['filter', 'tank-hose', 'hose-end'],
          callouts: [
            { part: 'filter', text: 'ⓐ 拧紧', at: [0, -40, 0], offset: [-80, -30, 0] },
            { part: 'filter', text: 'ⓑ 密封圈', at: [0, 59, 0], offset: [-80, 50, 0] },
            { part: 'toilet', text: 'ⓒ 密封圈', at: TOILET_INLET.at, offset: [-40, 70, 0] },
            { part: 'hose-end', text: 'ⓓ 拧紧', offset: [-60, 60, 0] },
          ],
        },
        {
          id: 'r-freeze', title: '冬天喷不出水：解冻', page: 11,
          desc: '室温过低管路结冰时：在温暖的室内把座温调到 4 挡，合上座盖放置 30 分钟自然解冻后再通水通电；仍喷不出水时，用浸过热水的布盖住供水软管及两端接头。',
          tip: '勿往软管上浇热水或用热风吹；内部未解冻前请勿接通电源。马桶盖过滤器应远离取暖器、浴霸灯等热源，禁止装在会结冰的地方。',
          camera: PLUMB,
          set: { lid: LID_CLOSED, 'led-seat': { light: 'on' }, towel: { visible: true } },
          highlight: ['towel', 'led-seat'],
          zoom: zoomSide('led-seat', '座温调到 4 挡', 170),
          chips: [{ label: '座温', sub: '4 挡' }, { label: '静置', sub: '30 分钟' }],
        },
        {
          id: 'r-remote', title: '遥控器没反应', page: 9,
          desc: '先更换遥控器电池；仍无反应时重新配对：遥控器上同时长按「臀洗」「妇洗」5 秒，30 秒内短按主机侧面「臀洗」键，主机遥控器指示灯常亮即可。',
          camera: SCENE,
          set: { remote: REMOTE_HAND, 'r-led': { light: 'blinkThenOff' } },
          actions: [{ type: 'press', part: 'r-rear', depth: 1 }, { type: 'press', part: 'r-front', depth: 1 }, { type: 'press', part: 'k-rear', depth: 1, delay: 2 }],
          highlight: ['r-rear', 'r-front', 'r-led', 'k-rear', 'led-remote'],
          zoom: zoomSide('led-remote', '主机遥控器指示灯常亮 = 已配对', 170),
        },
      ],
    },
  ],
}
