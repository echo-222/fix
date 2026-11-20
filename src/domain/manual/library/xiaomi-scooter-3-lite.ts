import type { CameraSpec, ManualSpec, PartState, ScreenItem, ScreenUI, SpecPart, Vec3 } from '../types'

/**
 * 米家电动滑板车3 青春版（MJDDHBC03ZM）
 * 说明书：米家电动滑板车3 青春版使用说明书（17 页 PDF），逐页转写见 manuals-src/xiaomi-scooter-3-lite/transcript.md
 * 任务原定 4 Pro，但 4 Pro 没有官方中文说明书（只在海外销售），按同系列顺序换成有官方中文 PDF 的 3 青春版。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。车长沿 x，车头朝 -x，车身左侧朝 +z（停车支架、充电口都在左侧）。
 * 原点在两轮中点正下方的地面。竖管铰链 HINGE 在前管顶端（折叠关节上沿），竖管绕 z 轴向后（+x）折叠。
 *
 * 外观模型：整车照 mi.com 海外站 3 Lite 的官方 3/4 产品图生成一个 GLB（models/xiaomi-scooter-3-lite/tripo.json），
 * 按真实的分开处切成几块挂在零件上，每块都用同一个 frame（整个模型落在世界 WORLD 里），原位时拼回去严丝合缝：
 * 车身（高 0–30%）、折叠关节（30–44%）、竖管（44–82%）、车把（82–100%）；折叠扳手、扳手顶上的锁扣、停车支架的支腿
 * 从关节 / 竖管 / 车身里挖出来（crop.cut），单独挂在会动的零件上。切口沿面精确切开并补封口，拆开、折叠时不露锯齿和空壳。
 * 几块的比例框（rot 之后，x 0 = 车头，z 1 = 左侧）是对着模型截面图量的：npm run model:section -- … --rot 0,-90,0（局部外观看 model:views --focus）。
 * 车铃在车把模型里，没有步骤用到，不另建几何体（重叠画会两层）。
 *
 * 推断（说明书没有给出）：
 * - 整车画出来长约 954 mm（说明书 1105 mm）：生成模型车身偏短，按高度等比缩放才能让轮子是圆的、竖管折下后挂钩正好落到卡扣上。
 *   宽 430、高 1137 与说明书一致。
 * - 铰链高度约 500 mm（说明书折叠后高 484 mm）；竖管后倾约 11.5°；折叠角 101.6° 按挂钩落到卡扣算出。
 * - 充电口在前管下段左侧（苏宁官方旗舰店细节图「充电口位置上移」），橡胶塞上沿为铰链。
 * - 停车支架在踏板左侧中部，收起时向后贴着踏板；前轮气嘴在轮毂左侧；机械刹调节螺母在后轮左侧拉线末端。
 * - 仪表盘按说明书 p8 图：车把中间竖长面板，上方模式 / 时速，下方电源键；屏幕关机时隐藏，露出模型里的黑色面板。
 * - 具体故障代码说明书没有列出，故障步骤只写「时速表显示故障代码」。
 */

const HINGE: Vec3 = [-282, 500, 0]
/** 竖管转轴在折叠关节后沿（扳手在前沿锁住开口）；竖管几何仍以 HINGE 为原点，靠 pivot 平移 */
const STEM_AT: Vec3 = [-255, 500, 0]
const STEM_PIVOT: Vec3 = [-27, 0, 0]
/** 车把零件原点在竖管局部坐标里的位置（世界 [-210, 1000, 0]） */
const BAR_AT: Vec3 = [45, 500, 0]
const FOLD = -102.2
const LEAN = -11.5
const SRC = '/models/xiaomi-scooter-3-lite/scooter.glb'
/** 整个模型（rot [0,-90,0] 之后）在世界里的包围盒：长 / 高 ×1.137、宽 ×0.944 */
const WORLD = { min: [-477, 0, -215.3] as Vec3, max: [477, 1136.8, 215.3] as Vec3 }
type Frac = { min: Vec3; max: Vec3 }
/**
 * 扳手（含顶上的锁扣）= 转轴圆环以上的扳手板 + 伸向前管的横臂。横臂下面那块是前管上的下挂钩座，不能切到：
 * 切口要都横穿细杆（截面是闭合的一圈），切进前管、挂钩座的实体会开出补不全的豁口。
 * 下沿 0.3815 横穿扳手板；再低会擦着板底边和挂钩尖（都在 0.375 上下），切出来是开口的碎线，补不成面
 */
const LEVER_PLATE: Frac = { min: [0.12, 0.3815, 0.46], max: [0.158, 0.45, 0.54] }
const LEVER_ARM: Frac = { min: [0.158, 0.406, 0.46], max: [0.17, 0.45, 0.54] }
const LEVER: Frac[] = [LEVER_PLATE, LEVER_ARM]
/** 扳手外框里挂钩座的那个角 */
const LEVER_CORNER: Frac = { min: [0.158, 0.37, 0.45], max: [0.171, 0.406, 0.55] }
/** 锁扣：扳手顶端横臂以上那一截竖条 */
const LOCK: Frac = { min: [0.148, 0.43, 0.47], max: [0.17, 0.45, 0.53] }
/**
 * 停车支架的支腿（收起时贴在踏板左侧下沿）；前端的铰座留在车身上。
 * 直段（z ≥ 0.597）离踏板侧壁只有几毫米（侧壁从前往后 z 0.589 → 0.583），框从 0.59 起才不会把侧壁一起挖走；
 * 末端的脚往里弯到 0.581，和后叉的安装板长在一起，脚的框从 0.585 起，脚尖那一两毫米留在车身上
 */
const STAND_ROD: Frac = { min: [0.666, 0.079, 0.59], max: [0.75, 0.106, 0.645] }
const STAND_FOOT: Frac = { min: [0.745, 0.079, 0.585], max: [0.786, 0.106, 0.645] }
const STAND: Frac[] = [STAND_ROD, STAND_FOOT]
/** 支腿那块 = 两个框的并集：外框减掉直段贴着侧壁的那一条 */
const STAND_PIECE = {
  min: STAND_ROD.min.map((v, k) => Math.min(v, STAND_FOOT.min[k])) as Vec3,
  max: STAND_ROD.max.map((v, k) => Math.max(v, STAND_FOOT.max[k])) as Vec3,
  cut: [{ min: [0.6, 0.07, 0.5] as Vec3, max: [STAND_FOOT.min[0], 0.12, STAND_ROD.min[2]] as Vec3 }],
}
/** 外观模型的一块：origin 是零件原位时几何体原点在世界里的位置 */
const piece = (origin: Vec3, crop: { min?: Vec3; max?: Vec3; cut?: Frac[] }) => ({
  src: SRC, rot: [0, -90, 0] as Vec3, crop,
  frame: { min: WORLD.min.map((v, k) => v - origin[k]) as Vec3, max: WORLD.max.map((v, k) => v - origin[k]) as Vec3 },
})
/** 扳手转轴（模型里扳手底下的圆环）、锁扣底边、支架铰点，世界坐标 */
const WRENCH_PIVOT: Vec3 = [-343.4, 416.1, 0]
const LOCK_BASE: Vec3 = [-325.3, 488.8, 0]
const KICK_PIVOT: Vec3 = [141, 104, 49]

const RED = '#e8462f'
const GREEN = '#35b36b'
const RUBBER_RED = { color: '#c8372d', roughness: 0.75 }
const FRAME = { color: '#2b2d30', roughness: 0.55, metalness: 0.25 }

/** 螺丝在竖管上的孔位（竖管局部）：①左上 ②右下 ③右上 ④左下 */
const SCREW_AT: Record<string, Vec3> = {
  'screw-1': [56, 412, 22],
  'screw-2': [52, 392, -22],
  'screw-3': [56, 412, -22],
  'screw-4': [52, 392, 22],
}
const SCREW_FLOOR: Record<string, Vec3> = {
  'screw-1': [230, 4.5, 330],
  'screw-2': [250, 4.5, 330],
  'screw-3': [270, 4.5, 330],
  'screw-4': [290, 4.5, 330],
}
const LOCK_DOWN: Vec3 = [LOCK_BASE[0] - WRENCH_PIVOT[0], LOCK_BASE[1] - WRENCH_PIVOT[1], 0]
const LOCK_UP: Vec3 = [LOCK_DOWN[0], LOCK_DOWN[1] + 10, 0]
const KEY_FLOOR: Vec3 = [380, 2, 320]
const keyOn = (id: string): Vec3 => [SCREW_AT[id][0], SCREW_AT[id][1], SCREW_AT[id][2] + 3]
/** 支架放下：支腿末端着地 */
const DOWN = -46
const VALVE: Vec3 = [-320, 64, 46]
const NUT: Vec3 = [420, 80, 50]

const screwHome = (id: string): PartState => ({ parent: 'stem', at: SCREW_AT[id], rot: [0, id === 'screw-2' || id === 'screw-3' ? 180 : 0, 0] })
const screwsHome = Object.fromEntries(Object.keys(SCREW_AT).map((id) => [id, screwHome(id)]))
const screwsFloor = Object.fromEntries(Object.keys(SCREW_AT).map((id) => [id, { parent: null, at: SCREW_FLOOR[id], rot: [0, 0, 0] } as PartState]))

const item = (text: string, state?: ScreenItem['state'], sub?: string): ScreenItem => ({ text, state, sub })
const dash = (title: string, items: ScreenItem[], toast?: string): ScreenUI => ({ app: '仪表盘', title, items, toast })
const BATT = item('电量', undefined, '5 格 · 每格约 20%')
const DASH_D = (speed: number) => dash(`${speed} km/h`, [item('D 标准模式', 'selected', '约 15km/h'), BATT])

const ON: Record<string, PartState> = { screen: { visible: true, ui: DASH_D(0) } }
const OFF: Record<string, PartState> = { screen: { visible: false }, headlight: { light: 'off' }, tail: { light: 'off' } }
const UPRIGHT: Record<string, PartState> = { stem: { rot: [0, 0, 0] }, wrench: { rot: [0, 0, 0] }, lock: { at: LOCK_DOWN } }

const hidden = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: false } as PartState]))
const shown = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { visible: true } as PartState]))
const ACCESSORIES = ['manual', 'adapter', 'adapter-led', 'dc-plug', 'dc-cable', 'ac-plug', 'ac-cable', 'strip', 'strip-hole', 'ext-valve', 'screw-spare', 'hexkey', 'pump', 'pump-handle', 'pump-hose', 'socket', 'phone', 'phone-screen']
const CHARGER = ['adapter', 'adapter-led', 'dc-plug', 'dc-cable', 'ac-plug', 'ac-cable', 'strip', 'strip-hole']

// ---------- 镜头 ----------
const WHOLE: CameraSpec = { target: [0, 480, 0], dir: [0.55, 0.32, 1], dist: 2300 }
const SIDE: CameraSpec = { target: [0, 420, 0], dir: 'front', dist: 2200 }
const BAR_VIEW: CameraSpec = { target: [-200, 1080, 0], dir: [0.9, 0.9, 0.55], dist: 700 }
const JOINT_VIEW: CameraSpec = { target: [-320, 420, 0], dir: [-0.6, 0.25, 1], dist: 650 }
const NECK_VIEW: CameraSpec = { target: [-230, 210, 30], dir: [-0.15, 0.25, 1], dist: 620 }
const REAR_VIEW: CameraSpec = { target: [330, 200, 0], dir: [0.3, 0.45, 1], dist: 800 }
const FLOOR_VIEW: CameraSpec = { target: [0, 150, 220], dir: [0.3, 0.75, 1], dist: 1900 }
const FRONT_WHEEL: CameraSpec = { target: [-300, 140, 120], dir: [-0.2, 0.35, 1], dist: 900 }
const zoomOn = (target: string | Vec3, caption: string, dist = 260, dir: CameraSpec['dir'] = [0.3, 0.5, 1]): SpecStep['zoom'] => ({ target, dir, dist, caption })
type SpecStep = ManualSpec['guides'][number]['steps'][number]

// ---------- 零件 ----------
const parts: SpecPart[] = [
  {
    id: 'body', name: '车身', spec: '踏板 · 前叉 · 轮毂电机 · 后轮 · 挡泥板', fill: 'dark', finish: FRAME,
    model: piece([0, 0, 0], { max: [1, 0.3, 1], cut: STAND }),
    shape: {
      type: 'compound', items: [
        { type: 'box', size: [440, 60, 120], at: [20, 116, 0] },
        { type: 'cylinder', r: 111, h: 46, axis: 'z', at: [-366, 111, 0], finish: 'rubber' },
        { type: 'cylinder', r: 111, h: 46, axis: 'z', at: [356, 111, 0], finish: 'rubber' },
        { type: 'box', size: [240, 12, 58], at: [357, 236, 0] },
        { type: 'box', size: [110, 10, 52], at: [-366, 232, 0] },
        { type: 'cylinder', r: 24, h: 230, at: [-305, 226, 0] },
        { type: 'box', size: [60, 200, 70], at: [-250, 190, 0], rot: [0, 0, 35] },
        { type: 'box', size: [300, 20, 14], at: [80, 105, 67] },
      ],
    },
  },
  {
    id: 'joint', name: '折叠关节', spec: '前管顶端 · 折叠机构前置', fill: 'dark', finish: FRAME, at: HINGE,
    model: piece(HINGE, { min: [0, 0.3, 0], max: [1, 0.44, 1], cut: LEVER }),
    shape: {
      type: 'compound', items: [
        { type: 'cylinder', r: 27, h: 159, at: [-16, -79.5, 0] },
        { type: 'box', size: [42, 70, 40], at: [-61, -100, 0] },
        { type: 'box', size: [11, 40, 30], at: [16.5, -30, 0] },
        { type: 'box', size: [16, 60, 24], at: [-20, -60, 36] },
      ],
    },
  },
  {
    id: 'wrench', name: '折叠扳手', parent: 'joint', at: [WRENCH_PIVOT[0] - HINGE[0], WRENCH_PIVOT[1] - HINGE[1], 0], fill: 'dark', finish: 'plastic-black',
    model: piece(WRENCH_PIVOT, { min: LEVER_PLATE.min, max: [LEVER_ARM.max[0], LEVER_PLATE.max[1], LEVER_PLATE.max[2]], cut: [LEVER_CORNER, LOCK] }),
    shape: { type: 'compound', items: [{ type: 'box', size: [26, 58, 22], at: [6, 43, 0], chamfer: 2 }, { type: 'box', size: [10, 14, 22], at: [24, 63, 0] }] },
  },
  {
    id: 'lock', name: '折叠锁扣', parent: 'wrench', at: LOCK_DOWN, fill: 'shade', finish: 'plastic-black',
    model: piece(LOCK_BASE, { min: LOCK.min, max: LOCK.max }),
    shape: { type: 'compound', items: [{ type: 'box', size: [18, 22, 20], at: [0, 11, 0] }] },
  },
  {
    id: 'stem', name: '竖管', spec: '铝合金竖管，后倾约 11.5°', fill: 'dark', finish: FRAME, at: STEM_AT, pivot: STEM_PIVOT,
    model: piece(HINGE, { min: [0, 0.44, 0], max: [1, 0.82, 1], cut: LEVER }),
    shape: {
      type: 'compound', items: [
        { type: 'cylinder', r: 20, h: 432, at: [44, 216, 0], rot: [0, 0, LEAN] },
        { type: 'cylinder', r: 3, h: 380, at: [-31, 200, 14], rot: [0, 0, -5], finish: { color: '#c8372d', roughness: 0.5 } },
        { type: 'cylinder', r: 27, h: 30, at: [3, 15, 0] },
        { type: 'cylinder', r: 22, h: 24, at: [88, 420, 0] },
      ],
    },
  },
  {
    id: 'bar', name: '车把', spec: '含仪表盘、前灯、刹车手把、油门指拨、车铃', parent: 'stem', at: BAR_AT, fill: 'dark', finish: FRAME,
    model: piece([STEM_AT[0] + BAR_AT[0], STEM_AT[1] + BAR_AT[1], 0], { min: [0, 0.82, 0] }),
    shape: {
      type: 'compound', items: [
        { type: 'cylinder', r: 12, h: 280, axis: 'z', at: [-28, 74, 0] },
        { type: 'cylinder', r: 18, h: 90, axis: 'z', at: [-28, 74, 170], finish: 'rubber' },
        { type: 'cylinder', r: 18, h: 90, axis: 'z', at: [-28, 74, -170], finish: 'rubber' },
        { type: 'cylinder', r: 19, h: 140, at: [10, 2, 0], rot: [0, 0, LEAN] },
        { type: 'box', size: [80, 26, 44], at: [24, 124, 0], chamfer: 6 },
        { type: 'cylinder', r: 4, h: 60, at: [-58, -30, 16], finish: { color: '#c8372d', roughness: 0.5 } },
      ],
    },
  },
  { id: 'screen', name: '控制面板', spec: '模式 · 时速表 · 锁车 / 蓝牙 / 巡航 · 故障 · 电量 · 温度', parent: 'bar', at: [22, 137.4, 0], rot: [-90, 0, 90], visible: false, shape: { type: 'screen', w: 30, h: 44 } },
  { id: 'power', name: '电源开关', spec: '短按开机 / 开关灯，长按 2–3 秒关机，连按两次切换模式', parent: 'bar', at: [52, 137, 0], fill: 'shade', finish: 'plastic-grey', shape: { type: 'cylinder', r: 7, h: 2.4 } },
  { id: 'headlight', name: '前灯', parent: 'bar', at: [-18, -38, 0], rot: [0, -90, 0], shape: { type: 'led', r: 9, color: '#fffbe8' } },
  { id: 'brake', name: '刹车手把', spec: '左手，电子刹 + 机械刹', parent: 'bar', at: [-50, 66, 150], rot: [0, 0, 90], fill: 'dark', finish: 'plastic-black', shape: { type: 'box', size: [6, 8, 72], chamfer: 2 } },
  { id: 'throttle', name: '油门指拨', spec: '右手拇指', parent: 'bar', at: [-44, 80, -122], rot: [0, 0, -90], fill: 'dark', finish: 'plastic-black', shape: { type: 'box', size: [22, 6, 16], chamfer: 2 } },
  { id: 'hook', name: '折叠挂钩', parent: 'bar', at: [64, 128, 0], fill: 'dark', finish: 'plastic-black', shape: { type: 'compound', items: [{ type: 'box', size: [10, 14, 14], at: [5, 0, 0], chamfer: 2 }] } },
  { id: 'catch', name: '卡扣', spec: '后挡泥板顶部', parent: 'body', at: [338, 244, 0], fill: 'dark', finish: 'plastic-black', shape: { type: 'cylinder', r: 6, h: 12 } },
  {
    id: 'kickstand', name: '停车支架', parent: 'body', at: KICK_PIVOT, fill: 'dark', finish: { color: '#2a2a2a', roughness: 0.4, metalness: 0.5 },
    model: piece(KICK_PIVOT, STAND_PIECE),
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 7, h: 100, axis: 'x', at: [67, 0, 0] }, { type: 'box', size: [28, 22, 18], at: [117, -1, 0], finish: 'rubber' }] },
  },
  { id: 'tail', name: '尾灯', parent: 'body', at: [478, 175, 0], rot: [0, 90, 0], shape: { type: 'led', r: 9, color: RED } },
  { id: 'port', name: '充电口', spec: 'DC 圆口', parent: 'body', at: [-206, 195, 40], rot: [0, 0, 32], shape: { type: 'hole', w: 10, h: 10, r: 5 } },
  {
    id: 'port-cover', name: '充电口橡胶塞', parent: 'port', at: [0, 15, 0.6], pivot: [0, -15, 1.5], fill: 'shade', finish: RUBBER_RED,
    shape: { type: 'box', size: [16, 30, 3], chamfer: 1 },
  },
  ...Object.keys(SCREW_AT).map((id, i): SpecPart => ({
    id, name: `螺丝 ${'①②③④'[i]}`, spec: '车把固定螺丝', parent: 'stem', at: SCREW_AT[id], rot: [0, id === 'screw-2' || id === 'screw-3' ? 180 : 0, 0], fill: 'shade', finish: 'steel',
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 4.5, h: 3, axis: 'z', at: [0, 0, 1.5] }, { type: 'hole', w: 4, h: 4, r: 0.6, at: [0, 0, 3.05] }] },
  })),
  {
    id: 'screw-spare', name: '备用螺丝', at: [310, 4.5, 330], fill: 'shade', finish: 'steel', visible: false,
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 4.5, h: 3, axis: 'z', at: [0, 0, 1.5] }, { type: 'cylinder', r: 2.5, h: 10, axis: 'z', at: [0, 0, -5] }] },
  },
  {
    id: 'hexkey', name: '六角扳手', at: KEY_FLOOR, rot: [0, 0, 90], fill: 'dark', finish: 'zinc', visible: false,
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 2, h: 22, axis: 'z', at: [0, 0, 11] }, { type: 'cylinder', r: 2, h: 72, at: [0, 36, 22] }] },
  },
  { id: 'manual', name: '使用说明书', spec: '说明书 · 法律声明 · 快速入门指南', at: [-300, 0, 330], fill: 'warm', finish: 'paper', visible: false, shape: { type: 'slab', w: 148, d: 210, h: 5, r: 2 } },
  { id: 'adapter', name: '电源适配器', spec: 'LI-0554200130NA · 41.0V 1.3A', at: [-480, 0, 330], fill: 'dark', finish: 'plastic-black', visible: false, shape: { type: 'slab', w: 150, d: 66, h: 42, r: 10 } },
  { id: 'adapter-led', name: '适配器指示灯', parent: 'adapter', at: [40, 42.2, 0], rot: [-90, 0, 0], visible: false, shape: { type: 'led', r: 3.5, color: RED } },
  {
    id: 'dc-plug', name: '充电插头', at: [-30, 8, 380], rot: [0, 90, 0], fill: 'dark', finish: 'plastic-black', visible: false,
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 3.6, h: 10, axis: 'x', at: [5, 0, 0], finish: 'steel' }, { type: 'cylinder', r: 7, h: 30, axis: 'x', at: [-15, 0, 0] }] },
  },
  { id: 'dc-cable', name: '充电线', fill: 'dark', finish: 'plastic-black', visible: false, shape: { type: 'cable', from: { part: 'adapter', at: [75, 21, 0], dir: [1, 0, 0] }, to: { part: 'dc-plug', at: [-30, 0, 0], dir: [-1, 0, 0] }, r: 2.5, slack: 0.35 } },
  { id: 'strip', name: '插线板', at: [-500, 0, 330], fill: 'white', finish: 'plastic-white', visible: false, shape: { type: 'slab', w: 240, d: 60, h: 36, r: 8 } },
  { id: 'strip-hole', name: '插座孔', parent: 'strip', at: [-40, 36.2, 0], rot: [-90, 0, 0], visible: false, shape: { type: 'hole', w: 26, h: 18, r: 4 } },
  {
    id: 'ac-plug', name: '电源插头', at: [-300, 15, 380], fill: 'dark', finish: 'plastic-black', visible: false,
    shape: { type: 'compound', items: [{ type: 'box', size: [16, 3, 7], at: [8, 0, 6], finish: 'steel' }, { type: 'box', size: [16, 3, 7], at: [8, 0, -6], finish: 'steel' }, { type: 'box', size: [30, 24, 34], at: [-15, 0, 0], chamfer: 4 }] },
  },
  { id: 'ac-cable', name: '电源线', fill: 'dark', finish: 'plastic-black', visible: false, shape: { type: 'cable', from: { part: 'adapter', at: [-75, 21, 0], dir: [-1, 0, 0] }, to: { part: 'ac-plug', at: [-30, 0, 0], dir: [-1, 0, 0] }, r: 3, slack: 0.3 } },
  { id: 'valve-cap', name: '轮胎充气嘴帽', parent: 'body', at: VALVE, fill: 'dark', finish: 'plastic-black', shape: { type: 'compound', items: [{ type: 'cylinder', r: 4.5, h: 10, axis: 'z', at: [0, 0, 5] }] } },
  { id: 'ext-valve', name: '延长充气嘴', spec: '连接气筒和气嘴', at: [170, 5, 300], fill: 'shade', finish: 'steel', visible: false, shape: { type: 'compound', items: [{ type: 'cylinder', r: 4, h: 60, axis: 'z', at: [0, 0, 30] }, { type: 'cylinder', r: 5.5, h: 8, axis: 'z', at: [0, 0, 4], finish: 'rubber' }] } },
  {
    id: 'pump', name: '打气筒', spec: '用户自备', at: [-60, 0, 420], fill: 'dark', finish: { color: '#3a3d42', roughness: 0.5, metalness: 0.3 }, visible: false,
    shape: { type: 'compound', items: [{ type: 'box', size: [180, 14, 60], at: [0, 7, 0] }, { type: 'cylinder', r: 22, h: 480, at: [0, 254, 0] }] },
  },
  {
    id: 'pump-handle', name: '打气筒手柄', parent: 'pump', at: [0, 520, 0], fill: 'dark', finish: 'rubber', visible: false,
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 10, h: 180, axis: 'z' }, { type: 'cylinder', r: 6, h: 40, at: [0, -20, 0], finish: 'steel' }] },
  },
  { id: 'pump-hose', name: '打气管', fill: 'dark', finish: 'rubber', visible: false, shape: { type: 'cable', from: { part: 'pump', at: [0, 40, 22], dir: [0, 0, 1] }, to: { part: 'ext-valve', at: [0, 0, 60], dir: [0, 0, 1] }, r: 3.5, slack: 0.5 } },
  { id: 'brake-nut', name: '机械刹调节螺母', spec: '14mm', parent: 'body', at: NUT, fill: 'shade', finish: 'zinc', shape: { type: 'cylinder', r: 6, h: 8, axis: 'x' } },
  {
    id: 'socket', name: '14mm T 型套筒', spec: '用户自备', at: [300, 10, 360], rot: [0, 0, 0], fill: 'shade', finish: 'steel', visible: false,
    shape: { type: 'compound', items: [{ type: 'cylinder', r: 10, h: 60, axis: 'x', at: [35, 0, 0] }, { type: 'cylinder', r: 6, h: 140, axis: 'z', at: [64, 0, 0], finish: { color: '#c8372d', roughness: 0.5 } }] },
  },
  { id: 'phone', name: '手机', spec: '米家 APP', at: [150, 720, 330], fill: 'dark', finish: 'plastic-black', visible: false, shape: { type: 'box', size: [74, 152, 8], chamfer: 6 } },
  { id: 'phone-screen', name: '手机屏幕', parent: 'phone', at: [0, 0, 4.1], visible: false, shape: { type: 'screen', w: 66, h: 140 } },
]

// ---------- 指南 ----------
const APP = (title: string, items: ScreenItem[], button?: string, toast?: string): ScreenUI => ({ app: '米家', title, items, button, buttonActive: !!button, toast })

const ASSEMBLY_START: Record<string, PartState> = {
  stem: { rot: [0, 0, FOLD] },
  wrench: { rot: [0, 0, 75] },
  kickstand: { rot: [0, 0, 0] },
  bar: { parent: null, at: [40, 64, 300], rot: [0, 0, 90] },
  ...screwsFloor,
  ...shown(['manual', 'adapter', 'ext-valve', 'screw-spare', 'hexkey']),
}

const steps = {
  assembly: [
    {
      id: 'unbox', title: '开箱清点', page: 7,
      desc: '取出折叠状态的整车和配件：使用说明书 / 法律声明 / 快速入门指南、延长充气嘴、螺丝 ×5（含 1 颗备用）、六角扳手、电源适配器。车把单独包装。',
      chips: [{ label: '整车 + 车把' }, { label: '螺丝 ×5', sub: '含 1 颗备用' }, { label: '六角扳手' }, { label: '延长充气嘴' }, { label: '电源适配器' }],
      camera: FLOOR_VIEW,
      highlight: ['bar', 'hexkey', 'screw-1', 'screw-2', 'screw-3', 'screw-4'],
      zoom: zoomOn([270, 5, 330], '螺丝 ×5（含 1 颗备用）', 260, [0.2, 1, 0.6]),
      callouts: [
        { part: 'bar', text: '车把', sub: '含仪表盘、前灯' },
        { part: 'screw-spare', text: '螺丝 ×5', sub: '含 1 颗备用', offset: [-40, 110, 0] },
        { part: 'hexkey', text: '六角扳手', offset: [80, 50, 0] },
        { part: 'ext-valve', text: '延长充气嘴', offset: [10, 40, 110] },
        { part: 'adapter', text: '电源适配器', offset: [0, 70, 0] },
        { part: 'manual', text: '说明书', offset: [0, 60, 0] },
      ],
    },
    {
      id: 'raise', title: '扶起竖管', page: 8,
      desc: '握住竖管向上扶起，直到完全处于直立状态。',
      camera: SIDE,
      set: { stem: { rot: [0, 0, 0], dur: 1.6 } },
      highlight: ['stem'],
    },
    {
      id: 'lock-wrench', title: '提起锁扣，推紧折叠扳手', page: 8,
      desc: '提起折叠锁扣，用力将折叠扳手向内推紧。',
      tip: '扳手没推到底时竖管会晃动，骑行前务必确认已锁紧。',
      camera: JOINT_VIEW,
      set: { wrench: { rot: [0, 0, 0], dur: 1.2 } },
      highlight: ['wrench', 'lock'],
      callouts: [{ part: 'lock', text: '折叠锁扣', sub: '先向上提起', offset: [-60, 40, 0] }, { part: 'wrench', text: '折叠扳手', sub: '向内推紧', at: [0, 40, 0], offset: [-90, -20, 0] }],
      zoom: zoomOn('lock', '提起锁扣 → 扳手向内推紧', 240, [-0.6, 0.3, 1]),
    },
    {
      id: 'stand', title: '打开停车支架', page: 8,
      desc: '竖管锁紧后，用脚把左侧的停车支架向下踢开，车就能自己立住。',
      camera: { target: [120, 80, 60], dir: [0.2, 0.3, 1], dist: 900 },
      set: { kickstand: { rot: [0, 0, DOWN] } },
      highlight: ['kickstand'],
    },
    {
      id: 'bar', title: '装上车把（前灯朝前）', page: 8,
      desc: '把车把下方的插管对准竖管顶端向下插入。注意方向：前灯朝前、仪表盘朝向骑行者。',
      tip: '前灯朝前装反会导致仪表盘背对骑行者。',
      camera: { target: [-200, 1000, 0], dir: [-0.7, 0.35, 1], dist: 1100 },
      set: { bar: { parent: 'stem', at: BAR_AT, rot: [0, 0, 0], via: [-170, 1350, 120], lift: 150, dur: 1.8 } },
      highlight: ['bar', 'headlight'],
      callouts: [{ part: 'headlight', text: '前灯朝前', offset: [-80, 0, 0] }],
    },
    {
      id: 'screws', title: '按顺序预紧四颗螺丝', page: 8,
      desc: '用六角扳手按 ①②③④ 的顺序（对角交替）预紧竖管两侧的四颗螺丝，先把车把位置固定。',
      camera: { target: [-200, 910, 0], dir: [0.15, 0.2, 1], dist: 420 },
      set: {
        ...Object.fromEntries(Object.keys(SCREW_AT).map((id, i) => [id, { ...screwHome(id), delay: i * 0.35, lift: 80 }])),
        hexkey: { parent: 'stem', at: keyOn('screw-1'), rot: [0, 0, 0], delay: 1.6 },
      },
      highlight: ['screw-1', 'screw-2', 'screw-3', 'screw-4', 'hexkey'],
      actions: [{ type: 'spin', part: 'hexkey', axis: 'z' }, { type: 'spin', part: 'screw-1', axis: 'z' }],
      callouts: [
        { part: 'screw-1', text: '①', offset: [-30, 30, 0] },
        { part: 'screw-4', text: '④', offset: [-30, -30, 0] },
      ],
      zoom: zoomOn('screw-3', '另一侧：② ③', 200, [0.2, 0.2, -1]),
    },
    {
      id: 'tighten', title: '彻底拧紧', page: 8,
      desc: '车把位置摆正后，再按同样顺序把四颗螺丝彻底拧紧。',
      camera: { target: [-200, 910, 0], dir: [0.15, 0.2, 1], dist: 420 },
      set: { hexkey: { at: keyOn('screw-4'), lift: 20 } },
      highlight: ['screw-1', 'screw-2', 'screw-3', 'screw-4'],
      actions: [{ type: 'spin', part: 'hexkey', axis: 'z' }, { type: 'spin', part: 'screw-4', axis: 'z' }],
      zoom: zoomOn('screw-2', '另一侧 ② ③ 同样拧紧', 200, [0.2, 0.2, -1]),
    },
    {
      id: 'power-test', title: '开关机检测', page: 8,
      desc: '短按电源开关开机，仪表盘点亮；再长按电源开关 2–3 秒关机，确认开关机正常。',
      camera: BAR_VIEW,
      set: { hexkey: { parent: null, at: KEY_FLOOR, rot: [0, 0, 90] }, ...ON },
      highlight: ['power', 'screen'],
      actions: [{ type: 'press', part: 'power', depth: 1.2 }],
      zoom: zoomOn('screen', '短按开机 · 长按 2–3 秒关机', 180, [0.6, 1, 0.2]),
    },
  ] as SpecStep[],

  fold: [
    {
      id: 'off', title: '关机且未在充电', page: 12,
      desc: '折叠前确认电动滑板车已关机，且没有在充电。',
      camera: BAR_VIEW,
      highlight: ['power'],
      actions: [{ type: 'press', part: 'power', depth: 1.2 }],
      zoom: zoomOn('power', '长按 2–3 秒关机', 200, [0.6, 1, 0.2]),
    },
    {
      id: 'open-wrench', title: '提锁扣，向外掰开扳手', page: 12,
      desc: '一手扶住竖管，向上提折叠锁扣，同时向外掰开折叠扳手。',
      camera: JOINT_VIEW,
      set: { lock: { at: LOCK_UP, dur: 0.5 }, wrench: { rot: [0, 0, 40], delay: 0.5 } },
      highlight: ['wrench', 'lock'],
      callouts: [{ part: 'lock', text: '折叠锁扣', sub: '向上提', offset: [-60, 40, 0] }, { part: 'wrench', text: '折叠扳手', sub: '向外掰', at: [0, 40, 0], offset: [-90, -20, 0] }],
      zoom: zoomOn('lock', '提锁扣 + 向外掰扳手', 240, [-0.6, 0.3, 1]),
    },
    {
      id: 'open-more', title: '扳手掰到底，下挂钩脱开', page: 12,
      desc: '再次提起折叠锁扣，把折叠扳手继续向外掰，直到下折叠挂钩离开竖管。',
      camera: JOINT_VIEW,
      set: { wrench: { rot: [0, 0, 75] }, lock: { at: LOCK_DOWN, delay: 0.9 } },
      highlight: ['wrench', 'joint'],
    },
    {
      id: 'fold-stem', title: '折下竖管，挂钩扣上卡扣', page: 12,
      desc: '把竖管向车尾折下，对准车把上的折叠挂钩和后挡泥板上的卡扣，把二者勾挂在一起。',
      camera: SIDE,
      set: { stem: { rot: [0, 0, FOLD], dur: 1.8 } },
      highlight: ['stem', 'hook', 'catch'],
      zoom: zoomOn('catch', '折叠挂钩 ↔ 卡扣', 260, [0.3, 0.6, 1]),
    },
    {
      id: 'stand-up', title: '收起停车支架', page: 12,
      desc: '收起停车支架，折叠完成。搬运时单手或双手握住竖管提起。',
      tip: '折叠后的尺寸约 1104 × 429 × 484 mm（说明书 p14）。',
      camera: WHOLE,
      set: { kickstand: { rot: [0, 0, 0] } },
      highlight: ['kickstand', 'stem'],
      callouts: [{ part: 'stem', text: '搬运时握住竖管', at: [90, 300, 0], offset: [0, 120, 0] }],
    },
    {
      id: 'unhook', title: '展开：挂钩脱离卡扣', page: 12,
      desc: '展开时先提拉折叠挂钩，使它脱离卡扣。',
      camera: REAR_VIEW,
      set: { stem: { rot: [0, 0, FOLD + 8] }, kickstand: { rot: [0, 0, DOWN] } },
      highlight: ['hook', 'catch'],
      zoom: zoomOn('catch', '提拉挂钩脱离卡扣', 260, [0.3, 0.6, 1]),
    },
    {
      id: 'unfold', title: '竖管立起，推紧扳手', page: 12,
      desc: '把竖管向上合起，确认下折叠挂钩吸附在竖管上；提起折叠锁扣，用力把折叠扳手向内推紧。',
      camera: WHOLE,
      set: { stem: { rot: [0, 0, 0], dur: 1.6 }, wrench: { rot: [0, 0, 0], delay: 1.7 } },
      highlight: ['stem', 'wrench'],
      zoom: zoomOn('lock', '扳手向内推紧', 240, [-0.6, 0.3, 1]),
    },
  ] as SpecStep[],

  charge: [
    {
      id: 'prepare', title: '充电前：关机、保持干燥', page: 9,
      desc: '先关闭电动滑板车电源。充电口、电源适配器或插座潮湿时严禁充电；请在 0℃–40℃ 下充电。',
      tip: '只能用原装 LI-0554200130NA 电源适配器。',
      camera: { target: [-230, 120, 180], dir: [-0.1, 0.45, 1], dist: 1250 },
      highlight: ['port-cover', 'adapter'],
      zoom: zoomOn('port-cover', '前管左侧的橡胶塞', 200, [0, 0.2, 1]),
      callouts: [{ part: 'port-cover', text: '充电口', sub: '前管左侧橡胶塞', offset: [-140, 30, 0] }],
    },
    {
      id: 'open-cover', title: 'a. 打开橡胶塞', page: 9,
      desc: '掀开充电口的橡胶塞，露出圆形充电口。',
      camera: NECK_VIEW,
      set: { 'port-cover': { rot: [-160, 0, 0] } },
      highlight: ['port-cover', 'port'],
      zoom: zoomOn('port', '掀开橡胶塞', 160, [0, 0.2, 1]),
    },
    {
      id: 'plug-in', title: 'b. 插入充电插头', page: 9,
      desc: '电源插头插上插座，再把充电插头插入充电口。适配器指示灯亮红色 = 充电中，仪表时速表改为显示当前电量。',
      chips: [{ label: '红灯', sub: '充电中' }, { label: '约 4.5 小时', sub: '充满' }],
      camera: { target: [-250, 150, 200], dir: [-0.1, 0.45, 1], dist: 1100 },
      set: {
        'ac-plug': { plug: 'strip-hole', via: [-520, 160, 330] },
        'dc-plug': { plug: 'port', via: [-190, 260, 200], delay: 0.9 },
        'adapter-led': { light: 'on', color: RED, delay: 2 },
        screen: { visible: true, ui: dash('充电中', [item('时速表', 'selected', '显示当前电量'), BATT]), delay: 2 },
      },
      highlight: ['dc-plug', 'adapter-led'],
      zoom: zoomOn('adapter-led', '红灯：充电中', 160, [0.2, 1, 0.4]),
    },
    {
      id: 'full', title: '充满：指示灯变绿', page: 9,
      desc: '充电完成后，电源适配器上的 LED 灯会从红色（充电中）变为绿色（充电完成），约 4.5 小时。',
      camera: { target: [-120, 40, 330], dir: [0.2, 1, 0.6], dist: 500 },
      set: { 'adapter-led': { color: GREEN } },
      highlight: ['adapter-led'],
      zoom: zoomOn('screen', '时速表显示电量', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'unplug', title: 'c. 拔下插头', page: 9,
      desc: '充电完成后，先从充电口拔下充电插头，再拔下插座上的电源插头。',
      camera: { target: [-250, 150, 200], dir: [-0.1, 0.45, 1], dist: 1100 },
      set: {
        'dc-plug': { parent: null, at: [-30, 8, 380], rot: [0, 90, 0], via: [-190, 260, 200] },
        'ac-plug': { parent: null, at: [-300, 15, 380], rot: [0, 0, 0], via: [-520, 160, 330], delay: 0.8 },
        'adapter-led': { light: 'off', delay: 0.8 },
        screen: { visible: false },
      },
      highlight: ['dc-plug'],
    },
    {
      id: 'close-cover', title: 'd. 紧扣橡胶塞', page: 9,
      desc: '把橡胶塞重新扣紧在充电口上，未充电时一直保持扣紧，防止进水。',
      camera: NECK_VIEW,
      set: { 'port-cover': { rot: [0, 0, 0] } },
      highlight: ['port-cover'],
      zoom: zoomOn('port-cover', '扣紧橡胶塞，谨防进水', 160, [0, 0.2, 1]),
    },
  ] as SpecStep[],

  ride: [
    {
      id: 'panel', title: '认识控制面板', page: 8,
      desc: '面板从上到下：模式（推行 / D / S）、时速表、锁车 · 蓝牙 · 定速巡航图标、扳手故障图标、5 格电量、温度提示，最下方是电源开关。',
      chips: [{ label: '推行', sub: '约 6km/h' }, { label: 'D 标准', sub: '约 15km/h' }, { label: 'S 运动', sub: '约 25km/h' }],
      camera: BAR_VIEW,
      set: { ...ON },
      highlight: ['screen', 'power'],
      zoom: zoomOn('screen', '控制面板 & 电源开关', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'activate-beep', title: '新车未激活：持续嘀声、限速', page: 9,
      desc: '全新电动滑板车激活前，开机后会持续发出「嘀」声，并限速 10km/h。初次使用前必须用米家 APP 激活。',
      camera: BAR_VIEW,
      set: { screen: { ui: dash('0 km/h', [item('D 标准模式', 'selected'), BATT], '未激活 · 限速 10km/h') } },
      highlight: ['screen'],
      zoom: zoomOn('screen', '嘀……嘀……', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'app-add', title: '米家 APP 扫码添加', page: 9,
      desc: '打开米家 APP，点右上角「+」→「扫一扫」，扫描控制面板贴纸、踏板右侧区域或说明书封底的二维码，按提示添加设备。',
      tip: '二维码是产品唯一码，请妥善保管。',
      camera: { target: [0, 760, 150], dir: [0.4, 0.2, 1], dist: 1300 },
      set: { phone: { visible: true }, 'phone-screen': { visible: true, ui: APP('添加设备', [item('扫一扫', 'selected', '控制面板 / 踏板右侧 / 封底'), item('米家电动滑板车3 青春版', 'muted')]) } },
      highlight: ['phone'],
    },
    {
      id: 'app-activate', title: '看完驾驶指南，点「激活」', page: 10,
      desc: '观看驾驶指南，完成前不要退出教程，否则激活失败；最后点击「激活」，蜂鸣声停止、限速解除。',
      chips: [{ label: '定速巡航' }, { label: '一键锁车' }, { label: '能量回收' }, { label: '一键开启尾灯' }],
      camera: { target: [0, 760, 150], dir: [0.4, 0.2, 1], dist: 1300 },
      set: {
        'phone-screen': { ui: APP('驾驶指南', [item('驾驶指南', 'done', '已看完')], '激活') },
        screen: { ui: DASH_D(0), delay: 1 },
      },
      highlight: ['phone-screen'],
    },
    {
      id: 'kick-off', title: '单脚蹬地滑行', page: 10,
      desc: '戴好头盔、护肘和护膝。收起停车支架，单脚站上脚踏板，另一只脚向后蹬地；滑起来后再踏上脚踏板。车速达到 5km/h 后电机才会启动。',
      tip: '骑行前检查胎压，建议 50psi。',
      camera: WHOLE,
      set: { phone: { visible: false }, 'phone-screen': { visible: false }, kickstand: { rot: [0, 0, 0] }, screen: { ui: DASH_D(5), delay: 1 } },
      highlight: ['kickstand', 'body'],
      zoom: zoomOn('screen', '≥ 5km/h 才启动', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'throttle', title: '轻按油门加速', page: 10,
      desc: '右手拇指轻按油门指拨即可加速，速度不宜过快。',
      camera: BAR_VIEW,
      set: { screen: { ui: DASH_D(15), delay: 0.4 } },
      highlight: ['throttle'],
      actions: [{ type: 'press', part: 'throttle', depth: 4 }],
      zoom: zoomOn('throttle', '拇指按油门指拨', 200, [0.4, 0.6, -1]),
    },
    {
      id: 'lights', title: '短按一次：开关前灯和尾灯', page: 8,
      desc: '开机状态下短按一次电源开关，打开（或关闭）前灯及尾灯。',
      camera: { target: [0, 560, 0], dir: [1, 0.3, 0.8], dist: 2500 },
      set: { headlight: { light: 'on' }, tail: { light: 'on' } },
      highlight: ['headlight', 'tail'],
      zoom: zoomOn('headlight', '前灯', 260, [-1, 0.2, 0.4]),
      actions: [{ type: 'press', part: 'power', depth: 1.2 }],
    },
    {
      id: 'modes', title: '连按两次：切换骑行模式', page: 8,
      desc: '连续短按两次电源开关，在推行 / D 标准 / S 运动模式之间切换。推行模式最高约 6km/h，尾灯红色闪烁；S 模式最高约 25km/h，熟练后再用。',
      camera: BAR_VIEW,
      set: { screen: { ui: dash('25 km/h', [item('S 运动模式', 'selected', '约 25km/h'), BATT]) } },
      highlight: ['power', 'screen'],
      actions: [{ type: 'press', part: 'power', depth: 1.2 }, { type: 'press', part: 'power', depth: 1.2, delay: 0.35 }],
      zoom: zoomOn('screen', '推行 → D → S', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'brake', title: '松油门或捏刹车减速', page: 11,
      desc: '缓慢松开油门指拨，或按压左手刹车手把减速。转向时身体重心略向转向方向倾斜，缓慢转动车把。',
      tip: '不要急刹车，轮胎可能失去抓地力导致摔倒。',
      camera: BAR_VIEW,
      set: { screen: { ui: DASH_D(0), delay: 0.6 } },
      highlight: ['brake'],
      actions: [{ type: 'press', part: 'brake', depth: 8 }],
      zoom: zoomOn('brake', '左手刹车手把', 220, [0.4, 0.6, 1]),
    },
    {
      id: 'park', title: '停车放下停车支架', page: 11,
      desc: '慢速或停住时单脚放下正常下车；停车时放下停车支架。停车后可在米家 APP 里一键锁车。',
      camera: { target: [120, 80, 60], dir: [0.2, 0.3, 1], dist: 900 },
      set: { kickstand: { rot: [0, 0, DOWN] } },
      highlight: ['kickstand'],
    },
    {
      id: 'power-off', title: '长按 2–3 秒关机', page: 8,
      desc: '长按电源开关 2–3 秒以上关闭电动滑板车，灯光随之熄灭。',
      camera: BAR_VIEW,
      set: { ...OFF },
      highlight: ['power'],
      actions: [{ type: 'press', part: 'power', depth: 1.2 }],
      zoom: zoomOn('power', '长按 2–3 秒', 180, [0.6, 1, 0.2]),
    },
  ] as SpecStep[],

  care: [
    {
      id: 'check', title: '定期检查紧固件', page: 13,
      desc: '定期检查各连接部件的松紧，特别是折叠系统、转向系统（车把螺丝）和刹车。清洁用带少量清水的软布擦拭，勿用压力水枪。',
      tip: '存放时打开停车支架；长期存放电量保持 30%–70%，至少每 2 个月补电一次。',
      camera: { target: [-260, 700, 0], dir: [-0.3, 0.2, 1], dist: 1300 },
      highlight: ['joint', 'screw-1', 'screw-4'],
      zoom: zoomOn('screw-4', '车把螺丝', 200, [0.1, 0.2, 1]),
      actions: [{ type: 'shake', part: 'screw-1', axis: 'z', amp: 0.6 }, { type: 'shake', part: 'screw-4', axis: 'z', amp: 0.6 }],
      callouts: [{ part: 'joint', text: '折叠系统', offset: [-120, 40, 0] }, { part: 'screw-4', text: '车把螺丝', offset: [-90, 40, 0] }],
    },
    {
      id: 'valve', title: '拧下气嘴帽，接延长充气嘴', page: 13,
      desc: '拧下轮胎充气嘴帽，把延长充气嘴连接到轮胎充气嘴上并拧紧。',
      camera: FRONT_WHEEL,
      set: {
        'valve-cap': { parent: null, at: [-300, 4.5, 170], rot: [0, 0, 0], lift: 40 },
        'ext-valve': { visible: true, parent: 'body', at: VALVE, rot: [0, 0, 0], delay: 0.9 },
      },
      highlight: ['valve-cap', 'ext-valve'],
      actions: [{ type: 'spin', part: 'ext-valve', axis: 'z', delay: 2.2 }],
      zoom: zoomOn(VALVE, '前轮气嘴', 220, [0, 0.3, 1]),
    },
    {
      id: 'pump', title: '连接打气筒充气至 50psi', page: 13,
      desc: '把打气筒接到延长充气嘴上充气，胎压建议值 50psi；建议每月检查一次胎压。',
      chips: [{ label: '50 psi' }, { label: '每月检查' }],
      camera: { target: [-200, 260, 260], dir: [-0.1, 0.35, 1], dist: 1500 },
      set: { ...shown(['pump', 'pump-handle', 'pump-hose']) },
      highlight: ['pump', 'pump-hose'],
      actions: [{ type: 'press', part: 'pump-handle', depth: 160 }],
    },
    {
      id: 'cap-back', title: '拧回气嘴帽', page: 13,
      desc: '充气完成后，取下延长充气嘴，把轮胎充气嘴帽拧紧。',
      camera: FRONT_WHEEL,
      set: {
        ...hidden(['pump', 'pump-handle', 'pump-hose']),
        'ext-valve': { parent: null, at: [170, 5, 300], rot: [0, 0, 0] },
        'valve-cap': { parent: 'body', at: VALVE, rot: [0, 0, 0], delay: 0.9, lift: 40 },
      },
      highlight: ['valve-cap'],
      actions: [{ type: 'spin', part: 'valve-cap', axis: 'z', delay: 2.2 }],
      zoom: zoomOn(VALVE, '拧紧气嘴帽', 220, [0, 0.3, 1]),
    },
    {
      id: 'brake-adjust', title: '机械刹调试', page: 14,
      desc: '关机且未充电时，用 14mm T 型套筒转动后轮机械刹螺杆上的调节螺母：刹车过紧逆时针转（外露尾部稍缩短），过松顺时针转（稍加长）。',
      tip: '14mm T 型套筒需用户自备。',
      camera: REAR_VIEW,
      set: { socket: { visible: true, parent: 'body', at: NUT, rot: [0, 0, 0], via: [560, 140, 160] } },
      highlight: ['brake-nut', 'socket'],
      actions: [{ type: 'spin', part: 'socket', axis: 'x' }],
      zoom: zoomOn('brake-nut', '调节螺母', 200, [0.3, 0.3, 1]),
    },
    {
      id: 'fault', title: '扳手图标红色常亮 = 故障', page: 8,
      desc: '仪表扳手图标红色常亮表示故障，此时时速表显示故障错误代码。温度计图标亮表示电池温度过高或过低，加速减弱、可能无法充电，待温度恢复后再用。',
      tip: '保修：主机 1 年、附件 6 个月、外观易损件 3 个月；服务电话 400-100-5678。',
      camera: BAR_VIEW,
      set: { socket: { visible: false, parent: null, at: [300, 10, 360], via: [560, 140, 160] }, screen: { visible: true, ui: dash('故障代码', [item('扳手图标', 'selected', '红色常亮 = 故障'), item('温度计图标', undefined, '电池过热 / 过冷')]) } },
      highlight: ['screen'],
      zoom: zoomOn('screen', '扳手图标红色常亮', 180, [0.6, 1, 0.2]),
    },
    {
      id: 'reset-bt', title: '重置车辆蓝牙', page: 10,
      desc: '开机状态下按住油门指拨，同时连按 5 次电源开关，听到「嘀」的一声即重置成功。骑行或锁定状态下不可执行。',
      camera: BAR_VIEW,
      set: { screen: { ui: dash('0 km/h', [item('蓝牙', 'selected', '已重置'), BATT], '嘀') , delay: 1.6 } },
      highlight: ['throttle', 'power'],
      zoom: zoomOn('power', '按住油门 + 连按 5 次电源', 260, [0.6, 1, 0.2]),
      actions: [{ type: 'press', part: 'throttle', depth: 4 }, { type: 'press', part: 'power', depth: 1.2 }, { type: 'press', part: 'power', depth: 1.2, delay: 0.3 }],
    },
    {
      id: 'factory', title: '恢复出厂设置', page: 10,
      desc: '开机状态下捏住刹车手把，同时按住油门指拨和电源开关保持 7 秒，直到「嘀」一声。会删除车上除总里程和激活状态以外的数据，请谨慎操作。',
      camera: BAR_VIEW,
      set: { screen: { ui: dash('0 km/h', [item('恢复出厂设置', 'done', '保持 7 秒'), BATT], '嘀'), delay: 2 } },
      highlight: ['brake', 'throttle', 'power'],
      zoom: zoomOn('power', '刹车 + 油门 + 电源 保持 7 秒', 300, [0.6, 1, 0.2]),
      actions: [{ type: 'press', part: 'brake', depth: 8 }, { type: 'press', part: 'throttle', depth: 4 }, { type: 'press', part: 'power', depth: 1.2 }],
    },
  ] as SpecStep[],
}

export const xiaomiScooter3Lite: ManualSpec = {
  id: 'xiaomi-scooter-3-lite',
  name: '米家电动滑板车3 青春版',
  desc: '开箱组装、折叠展开、充电、APP 激活与骑行、胎压与机械刹保养',
  category: '电动出行',
  dims: { width: 1105, depth: 430, height: 1137 },
  source: {
    title: '米家电动滑板车3 青春版使用说明书',
    url: 'https://cdn.cnbj1.fds.api.mi-img.com/iotweb-product-center/69ccd9cf6e85e9cb0d5b730e67dd3fcb_1645588117268.pdf',
    images: [],
  },
  package: [
    { name: '整车', qty: 1, spec: 'MJDDHBC03ZM' },
    { name: '使用说明书 / 法律声明 / 快速入门指南', qty: 1 },
    { name: '延长充气嘴', qty: 1, spec: '连接气筒和气嘴，方便打气' },
    { name: '螺丝', qty: 5, spec: '含 1 颗备用螺丝' },
    { name: '六角扳手', qty: 1 },
    { name: '电源适配器', qty: 1, spec: 'LI-0554200130NA' },
  ],
  params: [
    { label: '型号', value: 'MJDDHBC03ZM' },
    { label: '整车尺寸', value: '1105 × 430 × 1137 mm' },
    { label: '折叠后', value: '1104 × 429 × 484 mm' },
    { label: '整车净重', value: '约 13 kg' },
    { label: '最大载重', value: '100 kg' },
    { label: '适用年龄 / 身高', value: '16–50 岁 · 120–200 cm' },
    { label: '最高车速', value: '25 km/h' },
    { label: '典型续航', value: '约 20 km', note: '75kg 载重、25℃、标准模式 15km/h 匀速' },
    { label: '最大爬坡', value: '约 13%' },
    { label: '防护等级', value: 'IPX4' },
    { label: '充电时间', value: '约 4.5 小时' },
    { label: '电池', value: 'P2185-BA2A · 36V · 187Wh · 5.2Ah', note: '最高充电电压 42V' },
    { label: '电机额定功率', value: '250 W' },
    { label: '电源适配器', value: 'LI-0554200130NA · 100–240V～ · 41.0V 1.3A', note: '输出功率 53.3W，最大输出 42.0V' },
    { label: '轮胎', value: '外胎 230×50 · 内胎 8 1/2×2 直嘴' },
    { label: '工作 / 储存温度', value: '-10–40℃ / -20–40℃', note: '充电 0–40℃' },
  ],
  parts,
  initial: {
    kickstand: { rot: [0, 0, DOWN] },
    ...hidden(ACCESSORIES),
  },
  guides: [
    { id: 'assembly', title: '开箱组装', kind: 'assembly', start: ASSEMBLY_START, steps: steps.assembly },
    { id: 'fold', title: '折叠与展开', kind: 'usage', start: { ...UPRIGHT, ...screwsHome }, steps: steps.fold },
    { id: 'charge', title: '充电', kind: 'usage', start: { ...shown(CHARGER), adapter: { visible: true, at: [-180, 0, 330] } }, steps: steps.charge },
    { id: 'ride', title: '激活与骑行', kind: 'usage', steps: steps.ride },
    { id: 'care', title: '保养与故障', kind: 'repair', start: { ...ON }, steps: steps.care },
  ],
  stageSize: 1500,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' },
}
