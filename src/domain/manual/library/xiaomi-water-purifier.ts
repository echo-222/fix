import type { CameraSpec, Finish, ManualSpec, PartModel, PartState, ScreenUI, Shape, SpecPart, Vec3 } from '../types'

/**
 * 米家净水器 1000G（MR1082，yunmi.waterpuri.lx27）· 厨下式 RO 反渗透净水器
 * 说明书：米家 App 产品百科《米家净水器1000G 使用说明书》PDF 12 页（转写见 manuals-src/xiaomi-water-purifier/transcript.md）
 *
 * 坐标（mm）：y 向上，地面 y = 0；厨下柜正面朝 +z。
 * - 厨下柜 x ∈ ±450，柜体 z ∈ [-600, -20]，底板顶面 y = 118，背板内表面 z = -591；台面 y 820–850，水槽开口 x ±380、z [-510, -70]。
 * - 双槽水槽原点 = 台面顶面 [0, 850, -290]；后沿龙头台 z 局部 [-230, -150]，纯净水龙头在局部 [250, 2, -190]，自来水龙头在 [0, 2, -190]。
 * - 主机原点 = 底面中心，前面（防尘盖）朝局部 +z：宽 162.5（x）× 高 403.2（y）× 深 434（z），防尘盖外表面 z = 217，中框面 z = 203.5。
 *   放进橱柜 [240, 118, -330]（背面离背板 44 mm，说明书建议各方向 ≥ 40 mm）；安装时放在柜前地面、背面朝左 [250, 0, 160] rot [0, 90, 0]；
 *   换滤芯时搬到柜前地面 [240, 0, 300]。
 * - 滤芯：局部 +x 指向机内（插入方向），拧手在 x ∈ [-9, 0]；roll -90 = 拧手水平（开锁），roll 0 = 拧手 12:00（锁定）。
 *
 * 推定（说明书未给尺寸）：
 * - 橱柜、台面、水槽、角阀、自来水龙头、下水管、墙插的尺寸与位置（常见厨下柜，参考官方安装示意图）。
 * - 主机背面三个快接口（进水 / 纯水 / 浓水）与电源线、龙头引线出口的坐标（评测图文只说「在背面、颜色卡扣区分」）。
 * - 中框上滤芯桶（PPC 上 Ø104、RO 下 Ø120）、四个指示灯、两个按键的坐标（按第 6 页前面板图比例估算）。
 * - 滤芯外形：PPC Ø100 × 339、RO Ø118 × 299（含拧手，按官方白底图长宽比与主机深度推定）。
 * - 纯净水龙头：高 300、出水嘴伸出 ≈ 120、显示屏 26 × 18（按主图比例）。
 * - 防尘盖：整块前面板式浅盘（厚 13），从顶部卡槽掀开取下（滤芯详情图「从机器顶部卡槽掀开前盖」）。
 */

const ID = 'xiaomi-water-purifier'
const M = (name: string): string => `/models/${ID}/${name}.glb`

const ORANGE = '#ff8a1f'
const BLUE = '#2a7fff'

const STEEL: Finish = 'steel'
const QUARTZ: Finish = { color: '#e6e3dc', roughness: 0.5 }
const PE: Finish = { color: '#f3f3ee', roughness: 0.45 }
const PVC: Finish = { color: '#9fa3a6', roughness: 0.6 }
const WATER: Finish = { color: '#bfe6f5', roughness: 0.05, metalness: 0 }
const BAG: Finish = { color: '#dde6ec', roughness: 0.25 }
const CLIP: Finish = { color: '#2f6fd6', roughness: 0.4 }

type Item = Shape & { at?: Vec3; rot?: Vec3; finish?: Finish; fill?: 'white' | 'warm' | 'shade' | 'dark' }
const box = (size: Vec3, at: Vec3, more: Partial<Item> = {}): Item => ({ type: 'box', size, at, ...more } as Item)
const cyl = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', more: Partial<Item> = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...more } as Item)
const compound = (items: Item[]): Shape => ({ type: 'compound', items })

// ---------- 场景位置 ----------

const P_CAB: Vec3 = [240, 118, -330]
const P_INSTALL: Vec3 = [250, 0, 160]
const P_SERVICE: Vec3 = [240, 0, 300]
const COVER_REST: Vec3 = [0, 4, 217]
const COVER_FLOOR_G2: Vec3 = [240, 0, 60]
const COVER_FLOOR_G3: Vec3 = [520, 0, 560]
const PPC_FLOOR: Vec3 = [240, 50, 830]
const RO_FLOOR: Vec3 = [420, 59, 1260]
const PPC_NEW_FLOOR: Vec3 = [240, 50, 1300]
const PPC_ASIDE: Vec3 = [700, 50, 900]
/** 滤芯平放在地上、插入方向朝橱柜（-z），飞向滤芯桶时不用转身 */
const LIE: Vec3 = [0, 90, 0]
/** 滤芯对准滤芯桶、整支还在机外时的插入深度 */
const HOVER = 350
const TEE_AT: Vec3 = [0, 40, 45]
const LEAD_REST: Vec3 = [-20, 407.5, -150]
const POWER_REST: Vec3 = [30, 419, -110]
const FAUCET_AT: Vec3 = [250, 2, -190]
const DRAIN_END_AT: Vec3 = [29, 120, 0]

// ---------- 屏幕 ----------

const TDS: ScreenUI = { app: '净水龙头', title: '006', items: [{ text: '纯净水TDS' }] }
const PPC_DUE: ScreenUI = { app: '净水龙头', title: 'PPC滤芯', items: [{ text: '请换滤芯', state: 'selected' }] }
const HOT: ScreenUI = { app: '净水龙头', title: '过热保护', items: [{ text: '请稍候', state: 'selected' }] }
const APP_ADD: ScreenUI = { app: '米家', title: '添加设备', items: [{ text: '米家净水器1000G', sub: '附近的设备', state: 'selected' }, { text: '仅支持 2.4 GHz Wi-Fi', state: 'muted' }], button: '连接', buttonActive: true }

// ---------- 镜头 ----------

const WIDE: CameraSpec = { target: [60, 420, -200], dir: [0.45, 0.55, 1], dist: 2600 }
const CABINET: CameraSpec = { target: [80, 420, -300], dir: [0.3, 0.35, 1], dist: 1900 }
const FRONT_PANEL: CameraSpec = { target: [240, 300, -126], dir: [0.2, 0.3, 1], dist: 900 }
const LED_ROW: Vec3 = [240, 213, -126]
const BACK_WORK: CameraSpec = { target: [-60, 380, 0], dir: [-0.55, 0.45, 1], dist: 1900 }
const SERVICE: CameraSpec = { target: [240, 250, 380], dir: [0.45, 0.6, 1], dist: 1500 }
const SERVICE_PANEL: CameraSpec = { target: [240, 220, 520], dir: [0.2, 0.3, 1], dist: 800 }
const KEYS_ZOOM = (caption: string): CameraSpec & { caption: string } => ({ target: 'led-ppc', offset: [10, -14, 0], dir: [0.1, 0.2, 1], dist: 200, caption })

// ---------- 零件 ----------

const purifierModel: PartModel = { src: M('purifier'), rot: [0, 90, 0], fit: 'stretch', crop: { max: [1, 1, 0.968] } }
const coverModel: PartModel = { src: M('purifier'), rot: [0, 90, 0], fit: 'stretch', crop: { min: [0, 0, 0.968] } }
const filterModel = (name: string): PartModel => ({ src: M(name), rot: [0, 0, 90], fit: 'contain' })

/** 滤芯：原点在拧手 / 滤芯头交界，局部 +x 指向机内 */
const filter = (r: number, len: number): Shape => compound([
  box([9, r * 1.15, 14], [-4.5, 0, 0]),
  cyl(r, 30, [15, 0, 0], 'x'),
  cyl(r - 3, len - 30, [30 + (len - 30) / 2, 0, 0], 'x'),
  cyl(r * 0.45, 12, [len + 6, 0, 0], 'x'),
])

/** 快接头 + PE 管头：原点在接口面，局部 +x 插进接口 */
const pipeEnd: Shape = compound([
  cyl(3.2, 10, [4, 0, 0], 'x', { finish: PE }),
  cyl(6.5, 10, [-5, 0, 0], 'x', { finish: CLIP }),
  cyl(3.2, 14, [-17, 0, 0], 'x', { finish: PE }),
])

const port = (id: string, name: string, y: number): SpecPart => ({
  id, name, parent: 'purifier', shape: { type: 'hole', w: 15, h: 15, r: 7.5 }, at: [-40, y, -217.2], rot: [0, 180, 0],
})
const end = (id: string, name: string): SpecPart => ({
  id, name, spec: 'PE 管 + 卡销', shape: pipeEnd, parent: 'purifier', at: [-40, 0, -260], fill: 'white', finish: PE,
})

const led = (id: string, name: string, x: number, color = ORANGE): SpecPart => ({
  id, name, parent: 'frame', shape: { type: 'led', r: 3.2, color }, at: [x, 95, 203.7],
})
const key = (id: string, name: string, x: number): SpecPart => ({
  id, name, spec: '触摸按键', parent: 'frame', shape: compound([cyl(7, 3, [0, 0, 1.5], 'z')]), at: [x, 70, 203.5], fill: 'shade', finish: 'plastic-grey',
})

const parts: SpecPart[] = [
  // —— 厨房 ——
  {
    id: 'cabinet', name: '厨下柜', spec: '宽 900 × 深 600（推定）', fill: 'warm', finish: 'board-white',
    shape: compound([
      box([18, 820, 580], [-441, 410, -310]),
      box([18, 820, 580], [441, 410, -310]),
      box([864, 18, 571], [0, 109, -305.5]),
      box([864, 100, 18], [0, 50, -60]),
      box([864, 702, 9], [0, 469, -595.5]),
    ]),
  },
  {
    id: 'counter', name: '台面', parent: 'cabinet', fill: 'white', finish: QUARTZ, at: [0, 820, -300],
    shape: compound([
      box([920, 30, 100], [0, 15, -260]),
      box([920, 30, 80], [0, 15, 270]),
      box([80, 30, 440], [-420, 15, 10]),
      box([80, 30, 440], [420, 15, 10]),
    ]),
  },
  {
    id: 'sink', name: '双槽水槽', spec: '不锈钢', parent: 'counter', at: [0, 30, 10], fill: 'shade', finish: STEEL,
    shape: compound([
      box([780, 2, 80], [0, 1, -190]),
      box([780, 2, 20], [0, 1, 220]),
      box([20, 2, 360], [-380, 1, 30]),
      box([20, 2, 360], [380, 1, 30]),
      box([30, 2, 360], [0, 1, 30]),
      ...[-192.5, 192.5].flatMap((cx): Item[] => [
        box([355, 1, 360], [cx, -200, 30]),
        box([355, 200, 1], [cx, -100, 209.5]),
        box([355, 200, 1], [cx, -100, -149.5]),
        box([1, 200, 360], [cx - 177, -100, 30]),
        box([1, 200, 360], [cx + 177, -100, 30]),
        cyl(22, 40, [cx, -220, 30]),
      ]),
    ]),
  },
  {
    id: 'tap', name: '自来水龙头', parent: 'sink', at: [0, 2, -190], fill: 'shade', finish: STEEL,
    shape: compound([
      cyl(26, 8, [0, 4, 0]),
      cyl(20, 110, [0, 63, 0]),
      box([10, 8, 56], [0, 112, 34]),
      cyl(9, 140, [0, -71, 0]),
    ]),
  },
  {
    id: 'tap-spout', name: '自来水龙头出水管', fill: 'shade', finish: STEEL,
    shape: { type: 'cable', from: { part: 'tap', at: [0, 118, 0], dir: [0, 1, 0] }, to: { part: 'tap', at: [-110, 150, 130], dir: [0, 1, 0] }, r: 11 },
  },
  {
    id: 'angle-valve', name: '冷水角阀', parent: 'cabinet', at: [-250, 430, -591], fill: 'shade', finish: STEEL,
    shape: compound([
      cyl(24, 6, [0, 0, 3], 'z'),
      cyl(10, 40, [0, 0, 26], 'z'),
      cyl(10, 40, [0, 20, 45]),
      cyl(15, 12, [0, 0, 52], 'z', { finish: { color: '#2a6fd6', roughness: 0.4 }, fill: 'dark' }),
    ]),
  },
  {
    id: 'tee', name: '三通球阀', spec: '随机附带', parent: 'angle-valve', at: TEE_AT, fill: 'shade', finish: STEEL,
    shape: compound([
      cyl(12, 56, [0, 28, 0]),
      cyl(7, 32, [24, 30, 0], 'x'),
      cyl(9, 10, [24, 37, 0]),
    ]),
  },
  {
    id: 'tee-handle', name: '球阀手柄', parent: 'tee', at: [24, 44, 0], fill: 'dark', finish: { color: '#d8432b', roughness: 0.45 },
    shape: compound([cyl(6, 6, [0, 0, 0]), box([44, 4, 10], [22, 0, 0])]),
  },
  {
    id: 'tap-hose', name: '龙头软管', fill: 'shade', finish: STEEL,
    shape: { type: 'cable', from: { part: 'tee', at: [0, 56, 0], dir: [0, 1, 0] }, to: { part: 'tap', at: [0, -141, 0], dir: [0, -1, 0] }, r: 5 },
  },
  {
    id: 'drain', name: '下水管', spec: '水槽下水 + 地面排水口（推定 Ø80）', parent: 'cabinet', at: [-192.5, 118, -260], fill: 'shade', finish: PVC,
    shape: compound([
      cyl(40, 170, [0, 85, 0]),
      cyl(44, 10, [0, 165, 0]),
      cyl(18, 360, [0, 312, 0]),
    ]),
  },
  {
    id: 'outlet', name: '墙面插座', parent: 'cabinet', at: [360, 660, -591], fill: 'white', finish: 'plastic-white',
    shape: compound([box([80, 80, 10], [0, 0, 5])]),
  },
  { id: 'outlet-hole', name: '插座孔', parent: 'outlet', shape: { type: 'hole', w: 22, h: 14, r: 2 }, at: [0, 0, 10.1] },

  // —— 纯净水龙头 ——
  {
    id: 'faucet', name: '纯净水龙头', spec: '带 TDS 显示屏（随机附带）', parent: 'sink', at: FAUCET_AT, fill: 'shade', finish: STEEL,
    model: { src: M('faucet'), align: true, rot: [0, 0, 0], fit: 'contain' },
    shape: compound([
      cyl(24, 8, [0, 4, 0]),
      cyl(21, 92, [0, 54, 0]),
      cyl(14, 26, [34, 55, 0], 'x'),
      box([6, 28, 10], [44, 78, 0]),
      cyl(7, 190, [0, 195, -4]),
      cyl(7, 100, [0, 292, 46], 'z'),
      cyl(6, 60, [0, 262, 112]),
    ]),
  },
  { id: 'faucet-screen', name: '龙头显示屏', parent: 'faucet', shape: { type: 'screen', w: 26, h: 18 }, at: [0, 100.6, 9], rot: [-90, 0, 0] },
  {
    id: 'faucet-shank', name: '龙头螺杆与接头', parent: 'faucet', fill: 'shade', finish: STEEL,
    shape: compound([
      cyl(8, 130, [0, -66, 0]),
      cyl(20, 8, [0, -8, 0]),
      cyl(7, 14, [0, -138, 0], 'y', { finish: PE }),
      box([16, 12, 12], [20, -110, 0], { finish: 'plastic-black', fill: 'dark' }),
    ]),
  },
  { id: 'faucet-socket', name: '龙头引线插口', parent: 'faucet-shank', shape: { type: 'hole', w: 8, h: 5, r: 1 }, at: [20, -116.2, 0], rot: [90, 0, 0] },
  { id: 'faucet-hole', name: '龙头安装孔', parent: 'sink', shape: { type: 'hole', w: 28, h: 28, r: 14 }, at: [250, 2.2, -190], rot: [-90, 0, 0], visible: false },
  {
    id: 'stream', name: '出水', parent: 'faucet', fill: 'white', finish: WATER, visible: false,
    shape: compound([cyl(4, 436, [0, 12, 112])]),
  },
  {
    id: 'drill', name: '电钻', spec: '开孔钻头', parent: 'sink', at: [250, 2, -190], fill: 'dark', visible: false,
    finish: { color: '#1f6fd1', roughness: 0.45 },
    shape: compound([
      cyl(3, 50, [0, 25, 0], 'y', { finish: STEEL, fill: 'shade' }),
      cyl(13, 30, [0, 65, 0], 'y', { finish: 'plastic-black' }),
      cyl(30, 140, [0, 150, 0]),
      box([34, 44, 120], [0, 190, 85], { finish: 'plastic-black' }),
      box([70, 40, 90], [0, 190, 165]),
    ]),
  },

  // —— 主机 ——
  {
    id: 'purifier', name: '米家净水器 1000G 主机', spec: 'MR1082 · 434×162.5×403.2 mm', at: P_CAB, fill: 'white', finish: 'plastic-white',
    model: purifierModel,
    shape: compound([
      box([162, 397, 420], [0, 204.5, -7], { chamfer: 10 }),
      ...[-55, 55].flatMap((x): Item[] => [cyl(9, 6, [x, 3, -170]), cyl(9, 6, [x, 3, 170])]),
    ]),
  },
  {
    id: 'cover', name: '防尘盖', parent: 'purifier', at: COVER_REST, fill: 'white', finish: 'plastic-white', model: coverModel,
    shape: compound([
      box([162, 399, 3], [0, 199.5, -1.5]),
      box([162, 3, 10], [0, 397.5, -8]),
      box([162, 3, 10], [0, 1.5, -8]),
      box([3, 393, 10], [-79.5, 199.5, -8]),
      box([3, 393, 10], [79.5, 199.5, -8]),
      { type: 'text', text: '1000G', size: 5, at: [0, 46, 0.1] },
    ]),
  },
  {
    id: 'frame', name: '中框', parent: 'purifier', fill: 'white', finish: 'plastic-white',
    shape: compound([box([150, 392, 4.5], [0, 202, 201.25])]),
  },
  { id: 'ppc-bay', name: 'PPC 滤芯桶', parent: 'frame', shape: { type: 'hole', w: 104, h: 104, r: 52 }, at: [0, 300, 203.65] },
  { id: 'ro-bay', name: 'RO 滤芯桶', parent: 'frame', shape: { type: 'hole', w: 120, h: 120, r: 60 }, at: [0, 180, 203.65] },
  led('led-wifi', 'Wi-Fi 指示灯', -30, ORANGE),
  led('led-ppc', '1 号（PPC）滤芯灯', -10),
  led('led-ro', '2 号（RO）滤芯灯', 10),
  led('led-fault', '异常指示灯', 30),
  key('key-select', '滤芯选择键', -22),
  key('key-reset', '滤芯复位键', 22),
  {
    id: 'ppc', name: 'PPC 复合滤芯', spec: '更换周期 ≤ 24 个月', shape: filter(50, 330), fill: 'white', finish: 'plastic-white', model: filterModel('ppc'),
    at: PPC_FLOOR,
  },
  {
    id: 'ppc-new', name: '新 PPC 复合滤芯', spec: '小米净水器复合滤芯 PPC5', shape: filter(50, 330), fill: 'white', finish: 'plastic-white', model: filterModel('ppc'),
    at: PPC_FLOOR, visible: false,
  },
  {
    id: 'ro', name: 'RO 1000G 反渗透滤芯', spec: '更换周期 ≤ 72 个月', shape: filter(59, 290), fill: 'white', finish: 'plastic-white', model: filterModel('ro'),
    at: RO_FLOOR,
  },
  { id: 'bag-ppc', name: 'PPC 滤芯包装袋', at: [-100, 0, 650], fill: 'warm', finish: BAG, shape: compound([box([110, 110, 370], [0, 55, 0], { chamfer: 20 })]), visible: false },
  { id: 'bag-ro', name: 'RO 滤芯包装袋', at: [-260, 0, 1080], fill: 'warm', finish: BAG, shape: compound([box([126, 126, 330], [0, 63, 0], { chamfer: 20 })]), visible: false },

  port('port-in', '进水口', 360),
  port('port-pure', '纯净水出口', 325),
  port('port-conc', '浓缩水出口', 290),
  end('end-in', '进水管接头'),
  end('end-pure', '纯净水管接头'),
  end('end-conc', '浓缩水管接头'),
  {
    id: 'drain-end', name: '浓缩水管出口 + 废水塞', spec: '废水塞 1000cc（进水 TDS≤150）/ 1100cc（>150）', parent: 'drain', at: DRAIN_END_AT, fill: 'white', finish: PE,
    shape: compound([
      cyl(3.2, 220, [0, 110, 0]),
      cyl(6.5, 40, [0, 180, 0], 'y', { finish: 'plastic-white' }),
    ]),
  },
  {
    id: 'tie', name: '扎带', parent: 'drain-end', fill: 'dark', finish: 'plastic-black',
    shape: compound([cyl(33, 4, [-14, 225, 0]), box([8, 8, 8], [22, 225, 0])]),
  },
  { id: 'pipe-in', name: '进水管', spec: '3 分 PE 管', fill: 'white', finish: PE, shape: { type: 'cable', from: { part: 'tee', at: [39, 30, 0], dir: [1, 0, 0] }, to: { part: 'end-in', at: [-24, 0, 0], dir: [-1, 0, 0] }, r: 4.5, slack: 1.2 } },
  { id: 'pipe-pure', name: '纯净水管', spec: '3 分 PE 管', fill: 'white', finish: PE, shape: { type: 'cable', from: { part: 'faucet-shank', at: [0, -145, 0], dir: [0, -1, 0] }, to: { part: 'end-pure', at: [-24, 0, 0], dir: [-1, 0, 0] }, r: 4.5, slack: 1.2 } },
  { id: 'pipe-conc', name: '浓缩水管', spec: '2 分 PE 管（非饮用水）', fill: 'white', finish: PE, shape: { type: 'cable', from: { part: 'end-conc', at: [-24, 0, 0], dir: [-1, 0, 0] }, to: { part: 'drain-end', at: [0, 220, 0], dir: [0, 1, 0] }, r: 3.5, slack: 1.2 } },
  {
    id: 'lead-plug', name: '龙头引线插头', parent: 'faucet-shank', fill: 'dark', finish: 'plastic-black',
    shape: compound([box([6, 4, 7], [3, 0, 0]), box([18, 8, 10], [-9, 0, 0])]),
  },
  { id: 'lead', name: '龙头引线', fill: 'white', finish: 'plastic-white', shape: { type: 'cable', from: { part: 'purifier', at: [40, 340, -217], dir: [0, 0, -1] }, to: { part: 'lead-plug', at: [-18, 0, 0], dir: [-1, 0, 0] }, r: 2.5, slack: 1.2 } },
  {
    id: 'power-plug', name: '电源插头', spec: '220 V~ 50 Hz', parent: 'outlet', fill: 'white', finish: 'plastic-white',
    shape: compound([
      box([12, 2, 6], [6, 6, 0], { finish: STEEL, fill: 'shade' }),
      box([12, 2, 6], [6, -6, 0], { finish: STEEL, fill: 'shade' }),
      box([28, 30, 24], [-14, 0, 0], { chamfer: 4 }),
    ]),
  },
  { id: 'power', name: '电源线', fill: 'white', finish: 'plastic-white', shape: { type: 'cable', from: { part: 'purifier', at: [40, 280, -217], dir: [0, 0, -1] }, to: { part: 'power-plug', at: [-28, 0, 0], dir: [-1, 0, 0] }, r: 3, slack: 1.3 } },

  // —— 手机 ——
  { id: 'phone', name: '手机', at: [-420, 856, -100], rot: [-90, 0, 0], fill: 'dark', finish: 'plastic-black', shape: compound([box([68, 146, 8], [0, 0, 0], { chamfer: 6 })]), visible: false },
  { id: 'phone-screen', name: '米家 APP', parent: 'phone', shape: { type: 'screen', w: 60, h: 128 }, at: [0, 0, 4.1] },
]

// ---------- 状态片段 ----------

const plugged = (hole: string, extra: Partial<{ depth: number; roll: number; back: number }> = {}): PartState => ({ plug: { hole, ...extra } })
const ENDS_IN: Record<string, PartState> = {
  'end-in': plugged('port-in', { back: 0 }),
  'end-pure': plugged('port-pure', { back: 0 }),
  'end-conc': plugged('port-conc', { back: 0 }),
}
const FILTERS_IN: Record<string, PartState> = {
  ppc: plugged('ppc-bay', { roll: 0, back: 0 }),
  ro: plugged('ro-bay', { roll: 0, back: 0 }),
}
const OPEN: PartState = { rot: [0, 0, 0] }
const CLOSED: PartState = { rot: [0, -90, 0] }

const initial: Record<string, PartState> = {
  ...ENDS_IN,
  ...FILTERS_IN,
  'lead-plug': plugged('faucet-socket', { back: 0 }),
  'power-plug': plugged('outlet-hole', { back: 0 }),
  'tee-handle': OPEN,
  'faucet-screen': { ui: TDS },
}

/** 防尘盖从顶部卡槽向前掀开，正面朝下放在地上（绕下沿向前转 90°） */
const coverOff = (at: Vec3, via: Vec3): PartState => ({ parent: null, at, rot: [90, 0, 0], via, dur: 1.4 })
const coverOn = (via: Vec3): PartState => ({ parent: 'purifier', at: COVER_REST, rot: [0, 0, 0], via, dur: 1.4 })
const VIA_G2: Vec3 = [240, 260, 60]
const VIA_G3: Vec3 = [400, 330, 700]

// ---------- 指南 ----------

export const xiaomiWaterPurifier: ManualSpec = {
  id: ID,
  name: '米家净水器 1000G（MR1082）',
  desc: '厨下式 RO 反渗透净水器：安装管路、首次装滤芯冲洗、换滤芯、看懂指示灯',
  category: '净水器',
  dims: { width: 162.5, depth: 434, height: 403.2 },
  source: {
    title: '米家净水器1000G 使用说明书（12 页）',
    url: 'https://home.mi.com/cgi-op/api/v1/baike/v2/introduction?model=yunmi.waterpuri.lx27&region=cn',
    images: [],
  },
  package: [
    { name: '主机', qty: 1, spec: '含电源线和龙头引线' },
    { name: 'PPC 复合滤芯', qty: 1 },
    { name: 'RO 反渗透滤芯', qty: 1 },
    { name: '纯净水龙头', qty: 1 },
    { name: '三通球阀', qty: 1 },
    { name: 'PE 管', qty: 2 },
    { name: '卡销', qty: 3 },
    { name: '扎带', qty: 2 },
    { name: '废水塞', qty: 2, spec: '其中 1 个已安装在废水管上' },
    { name: '说明书', qty: 1 },
  ],
  params: [
    { label: '型号', value: 'MR1082', note: '米家牌 MR1082 型反渗透净水器' },
    { label: '净水流量', value: '2.65 L/min' },
    { label: '额定总净水量', value: '6500 L' },
    { label: '额定功率', value: '180 W' },
    { label: '进水压力', value: '0.1~0.4 MPa', note: '工作压力 0.4~0.9 MPa' },
    { label: '电源', value: '220 V~ 50 Hz' },
    { label: '环境温度', value: '4~40 ℃', note: '进水 5~38 ℃' },
    { label: '净重', value: '12.0 kg' },
    { label: '水效等级', value: '1 级' },
    { label: '无线连接', value: 'Wi-Fi 2.4 GHz' },
    { label: '噪声', value: '53 dB(A)' },
  ],
  parts,
  initial,
  stageSize: 2400,
  finishes: { white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'board-white' },
  guides: [
    {
      id: 'install',
      title: '安装概览',
      kind: 'assembly',
      start: {
        purifier: { at: P_INSTALL, rot: [0, 90, 0] },
        'end-in': { ...plugged('port-in', { depth: -60, back: 0 }), visible: false },
        'end-pure': { ...plugged('port-pure', { depth: -60, back: 0 }), visible: false },
        'end-conc': { ...plugged('port-conc', { depth: -60, back: 0 }), visible: false },
        'lead-plug': { parent: 'purifier', at: LEAD_REST, rot: [0, 0, 0] },
        'power-plug': { parent: 'purifier', at: POWER_REST, rot: [0, 0, 0] },
        'drain-end': { parent: null, at: [-40, 6.5, 330], rot: [0, 0, 90] },
        tie: { visible: false },
        faucet: { at: [250, 400, -190], visible: false },
        tee: { at: [0, 40, 125], visible: false },
        'tee-handle': CLOSED,
        ppc: { parent: null, at: PPC_FLOOR, rot: LIE, visible: false },
        ro: { parent: null, at: RO_FLOOR, rot: LIE, visible: false },
        'bag-ppc': { visible: true },
        'bag-ro': { visible: true },
      },
      steps: [
        {
          id: 'prep', title: '预约专业人员上门安装', page: 2,
          desc: '米家净水器不建议自行安装：拨打 950816 或联系在线客服 www.mi.com/service/contact，预约小米授权服务网点的专业人员上门。下面的步骤帮你看懂师傅在做什么、检查装得对不对。',
          tip: '用户自行安装发生的事故及损失由用户自行承担。',
          camera: WIDE, highlight: ['purifier'],
          callouts: [{ part: 'purifier', text: '米家净水器 1000G', sub: '434 × 162.5 × 403.2 mm · 12 kg', at: [0, 403, 0] }],
        },
        {
          id: 'parts', title: '清点配件', page: 5,
          desc: '主机 ×1（自带电源线和龙头引线）、PPC 复合滤芯和 RO 反渗透滤芯各 1 支、纯净水龙头、三通球阀、PE 管 ×2、卡销 ×3、扎带 ×2、废水塞 ×2（其中 1 个已装在废水管上）。',
          camera: { target: [60, 120, 600], dir: [0.3, 0.8, 1], dist: 1900 },
          highlight: ['purifier', 'bag-ppc', 'bag-ro', 'drain-end'],
          callouts: [
            { part: 'bag-ppc', text: 'PPC 复合滤芯', at: [0, 110, 0] },
            { part: 'bag-ro', text: 'RO 反渗透滤芯', at: [0, 126, 0] },
            { part: 'drain-end', text: '废水管 + 废水塞', at: [0, 180, 0] },
          ],
        },
        {
          id: 'space', title: '确认橱柜空间', page: 6,
          desc: '主机尺寸 434 × 162.5 × 403.2 mm，建议各方向至少预留 40 mm。附近 1.5 米内要有可靠地漏，主机只能放室内、不低于 4 ℃ 的地方。',
          camera: CABINET, highlight: ['cabinet'],
          callouts: [{ part: 'cabinet', text: '主机放这里', sub: '四周各留 ≥ 40 mm', at: [240, 560, -330] }],
        },
        {
          id: 'tee', title: '关水，装三通球阀', page: 6,
          desc: '先关闭冷水角阀，把自来水龙头软管从角阀上拆下，装上三通球阀：一路接回自来水龙头，侧口留给净水器进水管。球阀手柄先保持关闭（与侧口垂直）。',
          camera: { target: 'angle-valve', offset: [40, 40, 0], dir: [0.35, 0.25, 1], dist: 1100 },
          set: { tee: { at: TEE_AT, visible: true } },
          highlight: ['tee', 'angle-valve'],
          callouts: [
            { part: 'tee', text: '三通球阀', at: [0, 56, 0] },
            { part: 'tee-handle', text: '手柄：关闭', at: [0, 0, 44], offset: [90, -50, 0] },
          ],
        },
        {
          id: 'drill', title: '在台面上开龙头孔', page: 6,
          desc: '确认纯净水龙头的安装位置并钻孔。如果水槽上已经预留了尺寸合适的龙头孔（如皂液孔），可以跳过这一步。',
          camera: { target: 'drill', offset: [0, 120, 0], dir: [0.5, 0.45, 1], dist: 900 },
          set: { drill: { visible: true } },
          actions: [{ type: 'spin', part: 'drill', axis: 'y' }],
          highlight: ['drill'],
        },
        {
          id: 'faucet', title: '固定纯净水龙头', page: 6,
          desc: '把纯净水龙头装进孔里，从台面下拧紧螺母：龙头底座要稳固不旋转、台面无渗漏，水管连接处密封不漏水。',
          camera: { target: 'faucet', offset: [0, 120, 0], dir: [0.45, 0.4, 1], dist: 900 },
          set: { drill: { visible: false }, faucet: { at: FAUCET_AT, visible: true, delay: 1.1 } },
          highlight: ['faucet', 'faucet-shank'],
          callouts: [
            { part: 'faucet', text: '纯净水龙头', at: [0, 300, 0] },
            { part: 'faucet-screen', text: '显示屏', sub: '显示纯净水 TDS' },
          ],
        },
        {
          id: 'pipe-in', title: '接进水管', page: 6,
          desc: '进水管一头插进三通球阀侧口，另一头插进主机背面的进水口，插到底后装上卡销锁住快接头。',
          camera: BACK_WORK,
          set: { 'end-in': { ...plugged('port-in', { back: 0 }), visible: true } },
          highlight: ['end-in', 'pipe-in'],
          zoom: { target: 'port-in', dir: [-1, 0.35, 0.25], dist: 170, caption: '进水口：PE 管插到底，再装卡销' },
        },
        {
          id: 'pipe-pure', title: '接纯净水管', page: 6,
          desc: '纯净水管连接主机的纯净水出口和纯净水龙头底部的快接头，同样插到底装卡销。',
          camera: BACK_WORK,
          set: { 'end-pure': { ...plugged('port-pure', { back: 0 }), visible: true } },
          highlight: ['end-pure', 'pipe-pure', 'faucet-shank'],
          zoom: { target: 'port-pure', dir: [-1, 0.35, 0.25], dist: 170, caption: '纯净水出口' },
        },
        {
          id: 'lead', title: '接龙头引线', page: 6,
          desc: '主机自带的龙头引线插到纯净水龙头底部的插口，龙头显示屏靠它供电和显示水质。',
          camera: { target: 'faucet-shank', offset: [0, -80, 0], dir: [0.35, -0.15, 1], dist: 900 },
          set: { 'lead-plug': plugged('faucet-socket') },
          highlight: ['lead-plug', 'lead'],
          zoom: { target: 'faucet-socket', dir: [0.5, -0.7, 1], dist: 150, caption: '龙头引线插口' },
        },
        {
          id: 'pipe-conc', title: '接浓缩水管，管口放进下水道', page: 6,
          desc: '浓缩水管一头接主机的浓缩水出口，另一头（带废水塞）放进下水道。浓缩水是非饮用水，不能接到龙头。废水塞按自来水 TDS 选：进水 TDS ≤ 150 装 1000cc，> 150 装 1100cc（出厂已装好 1 个）。',
          camera: BACK_WORK,
          set: {
            'end-conc': { ...plugged('port-conc', { back: 0 }), visible: true },
            'drain-end': { parent: 'drain', at: DRAIN_END_AT, rot: [0, 0, 0], lift: 150, delay: 0.6, dur: 1.4 },
          },
          highlight: ['end-conc', 'pipe-conc', 'drain-end'],
          zoom: { target: 'port-conc', dir: [-1, 0.35, 0.25], dist: 170, caption: '浓缩水出口' },
          callouts: [{ part: 'drain-end', text: '废水塞', sub: 'TDS≤150：1000cc；>150：1100cc', at: [0, 180, 0] }],
        },
        {
          id: 'drain', title: '用扎带固定浓缩水管', page: 6,
          desc: '浓缩水管务必放进下水道并固定：用随机附带的扎带把管子绑在下水管上，防止脱出漏水。',
          camera: { target: 'drain', offset: [0, 250, 0], dir: [0.3, 0.35, 1], dist: 1000 },
          set: { tie: { visible: true } },
          highlight: ['drain-end', 'tie', 'drain'],
          zoom: { target: 'tie', offset: [0, 225, 0], dir: [0.4, 0.3, 1], dist: 260, caption: '扎带把浓缩水管固定在下水管上' },
        },
        {
          id: 'place', title: '把主机放进橱柜', page: 3,
          desc: '主机平放进橱柜，背后留出空间，水管不要折弯。请勿侧放或倒立放置净水器。',
          camera: CABINET,
          set: { purifier: { at: P_CAB, rot: [0, 0, 0], via: [245, 190, 130], dur: 1.6 } },
          highlight: ['purifier'],
          callouts: [{ part: 'purifier', text: '平放，勿侧放或倒立', at: [0, 403, 0] }],
        },
        {
          id: 'power', title: '插上电源', page: 2,
          desc: '电源插头完全插进插座，保持接触良好；需要延长线时用符合国标的延长线插座。安装完成后请务必连接米家 APP。',
          camera: { target: 'outlet', offset: [-80, -60, 0], dir: [0.25, 0.3, 1], dist: 1100 },
          set: { 'power-plug': plugged('outlet-hole', { back: 120 }) },
          highlight: ['power-plug', 'outlet'],
        },
      ],
    },
    {
      id: 'first-use',
      title: '首次安装滤芯与冲洗',
      kind: 'usage',
      start: {
        'tee-handle': CLOSED,
        ppc: { parent: null, at: PPC_FLOOR, rot: LIE, visible: false },
        ro: { parent: null, at: RO_FLOOR, rot: LIE, visible: false },
        'bag-ppc': { visible: true },
        'bag-ro': { visible: true },
        'faucet-screen': { ui: null },
      },
      steps: [
        {
          id: 'cover-off', title: '取下防尘盖', page: 6,
          desc: '从主机顶部的卡槽把防尘盖向前掀开取下，露出中框：上面是 PPC 复合滤芯桶，下面是 RO 反渗透滤芯桶。',
          camera: { target: [240, 250, 60], dir: [0.55, 0.45, 1], dist: 1500 },
          set: { cover: coverOff(COVER_FLOOR_G2, VIA_G2) },
          highlight: ['cover'],
          callouts: [
            { part: 'ppc-bay', text: 'PPC 复合滤芯（上）' },
            { part: 'ro-bay', text: 'RO 1000G 反渗透滤芯（下）' },
          ],
        },
        {
          id: 'unpack', title: '剪开包装，取出滤芯', page: 7,
          desc: '剪开滤芯包装袋，从袋中取出两支滤芯，分别对准上、下两个滤芯桶：细的 PPC 复合滤芯在上，粗的 RO 反渗透滤芯在下。',
          camera: { target: [240, 240, 100], dir: [0.8, 0.45, 1], dist: 1500 },
          set: {
            'bag-ppc': { visible: false }, 'bag-ro': { visible: false },
            ppc: { ...plugged('ppc-bay', { depth: -HOVER, roll: -90, back: 0 }), visible: true, dur: 1.4 },
            ro: { ...plugged('ro-bay', { depth: -HOVER, roll: -90, back: 0 }), visible: true, delay: 0.9, dur: 1.4 },
          },
          highlight: ['ppc', 'ro'],
          callouts: [
            { part: 'ppc', text: 'PPC 复合滤芯（上）', at: [160, 50, 0] },
            { part: 'ro', text: 'RO 反渗透滤芯（下）', at: [145, 59, 0] },
          ],
        },
        {
          id: 'ppc-in', title: '手柄对准「开锁」放入 PPC 滤芯', page: 7,
          desc: '拧手转到水平的「开锁」位置，把 PPC 复合滤芯轻轻推进上面的滤芯桶。',
          camera: { target: [240, 260, 330], dir: [0.8, 0.45, 1], dist: 1700 },
          set: { ppc: plugged('ppc-bay', { roll: -90, back: 0 }) },
          highlight: ['ppc', 'ppc-bay'],
        },
        {
          id: 'ppc-lock', title: '轻压并顺时针旋转 90°', page: 7,
          desc: '轻压滤芯并顺时针旋转 90°。到位有 3 个指示：滤芯指向「锁」标识、拧手在 12:00 方向、滤芯顶面与中框外表面平齐。',
          camera: FRONT_PANEL,
          set: { ppc: plugged('ppc-bay', { roll: 0, back: 0 }) },
          highlight: ['ppc'],
          zoom: { target: 'ppc-bay', dir: [0.35, 0.25, 1], dist: 320, caption: '拧手 12:00，顶面与中框平齐' },
        },
        {
          id: 'ro-in', title: '同样装好 RO 滤芯', page: 7,
          desc: '依次完成两支滤芯：RO 1000G 反渗透滤芯放进下面的滤芯桶，同样拧手水平放入、轻压顺时针转 90° 锁定。',
          camera: { target: [240, 220, 500], dir: [0.8, 0.45, 1], dist: 2000 },
          set: { ro: { ...plugged('ro-bay', { roll: 0, back: 0 }), dur: 1.6 } },
          highlight: ['ro', 'ro-bay'],
        },
        {
          id: 'flush', title: '打开三通球阀，开龙头冲洗', page: 7,
          desc: '打开三通球阀，再打开纯净水龙头冲洗，冲洗完成后就能正常使用。龙头显示屏显示纯净水 TDS，例如「006」。',
          tip: 'RO 膜内含食品级甘油保湿：初装第一天产水不建议饮用，可用于厨房清洗；或每隔 2 小时制水 20 分钟并排掉，循环 12 次以上。',
          camera: { target: [40, 640, -420], dir: [0.35, 0.2, 1], dist: 1900 },
          set: { 'tee-handle': OPEN, stream: { visible: true, delay: 0.8 }, 'faucet-screen': { ui: TDS, delay: 0.8 } },
          highlight: ['tee-handle', 'faucet', 'stream'],
          zoom: { target: 'faucet-screen', dir: [0, 1, 0.7], dist: 110, caption: '006 · 纯净水 TDS' },
        },
        {
          id: 'app', title: '连接米家 APP', page: 8,
          desc: '扫描说明书二维码或在应用商店搜索「米家」安装 APP，在首页右上角点「+」，按提示添加设备。本机只支持 2.4 GHz Wi-Fi。',
          tip: '首次安装后请尽快连接 Wi-Fi，长时间不连接 Wi-Fi 热点会休眠，需要先重置 Wi-Fi 再连接。',
          camera: { target: 'phone', dir: [0.15, 1, 0.45], dist: 520 },
          set: { stream: { visible: false }, phone: { visible: true }, 'phone-screen': { ui: APP_ADD }, 'led-wifi': { light: 'blink', color: BLUE } },
          highlight: ['phone'],
          zoom: { target: 'led-wifi', dir: [0.1, 0.15, 1], dist: 200, caption: 'Wi-Fi 灯蓝色快闪：正在连接' },
        },
        {
          id: 'wifi-reset', title: '需要时重置 Wi-Fi', page: 8,
          desc: '换路由器或 Wi-Fi 出故障时：同时按住「选择」和「复位」键 7 秒，Wi-Fi 指示灯橙色闪烁，听到「嘀嘀嘀」提示音即重置成功。',
          camera: FRONT_PANEL,
          set: { phone: { visible: false }, 'led-wifi': { light: 'blink', color: ORANGE } },
          actions: [{ type: 'press', part: 'key-select' }, { type: 'press', part: 'key-reset' }],
          highlight: ['key-select', 'key-reset', 'led-wifi'],
          zoom: KEYS_ZOOM('「选择」+「复位」同时长按 7 秒'),
        },
        {
          id: 'cover-on', title: '装回防尘盖', page: 6,
          desc: '把防尘盖下沿对准卡位，向后合上直到上沿卡入顶部卡槽。',
          camera: FRONT_PANEL,
          set: { cover: coverOn(VIA_G2), 'led-wifi': { light: 'off' } },
          highlight: ['cover'],
        },
      ],
    },
    {
      id: 'replace',
      title: '更换滤芯',
      kind: 'usage',
      start: {
        'bag-ppc': { at: [240, 0, 1500], visible: true },
        'ppc-new': { parent: null, at: PPC_NEW_FLOOR, rot: LIE, visible: false },
      },
      steps: [
        {
          id: 'remind', title: '看到换芯提示', page: 7,
          desc: '滤芯寿命即将到期，龙头屏显示「PPC滤芯 即将到期」、主机上 1 号灯橙色闪烁；到期后显示「请换滤芯」、灯橙色常亮。滤芯可在 mi.com、米家 APP 或扫滤芯二维码购买。',
          tip: '建议更换周期：PPC 复合滤芯 ≤ 24 个月，RO-1000G 反渗透滤芯 ≤ 72 个月。',
          camera: { target: 'faucet', offset: [0, 120, 0], dir: [0.3, 0.6, 1], dist: 800 },
          set: { 'faucet-screen': { ui: PPC_DUE } },
          highlight: ['faucet-screen'],
          zoom: { target: 'faucet-screen', dir: [0, 1, 0.7], dist: 110, caption: 'PPC滤芯 · 请换滤芯' },
        },
        {
          id: 'close', title: '关闭三通球阀并泄压', page: 9,
          desc: '关闭三通球阀，然后打开龙头几秒钟，泄掉机器内部的压力，方便取滤芯。',
          camera: { target: [40, 640, -420], dir: [0.35, 0.2, 1], dist: 1900 },
          set: { 'tee-handle': CLOSED, stream: { visible: true, delay: 0.8 } },
          highlight: ['tee-handle', 'faucet'],
        },
        {
          id: 'unplug', title: '断电关机 2 分钟', page: 9,
          desc: '拔下电源插头（不要拽电源线），等 2 分钟再搬动主机。',
          camera: { target: 'outlet', offset: [-80, -80, 0], dir: [0.25, 0.3, 1], dist: 1100 },
          set: { stream: { visible: false }, 'power-plug': { parent: 'purifier', at: POWER_REST, rot: [0, 0, 0] } },
          highlight: ['power-plug'],
        },
        {
          id: 'pull-out', title: '把主机从橱柜里搬出', page: 9,
          desc: '把主机搬出橱柜放平，注意不要用力拉扯水管和龙头引线，以免造成通电故障或漏水。',
          camera: SERVICE,
          set: { purifier: { at: P_SERVICE, rot: [0, 0, 0], via: [240, 190, 110], dur: 1.6 } },
          highlight: ['purifier'],
          callouts: [{ part: 'purifier', text: '别拉扯水管和引线', at: [0, 403, -217] }],
        },
        {
          id: 'cover-off', title: '取下防尘盖', page: 9,
          desc: '从顶部卡槽掀开防尘盖，放在一边。',
          camera: { target: [380, 200, 620], dir: [0.45, 0.6, 1], dist: 1900 },
          set: { cover: coverOff(COVER_FLOOR_G3, VIA_G3) },
          highlight: ['cover'],
        },
        {
          id: 'unlock', title: '逆时针转 90° 解锁旧滤芯', page: 9,
          desc: '握住要换的滤芯拧手，逆时针旋转 90° 到水平的「开锁」位置。',
          camera: { target: [240, 300, 520], dir: [0.2, 0.3, 1], dist: 800 },
          set: { ppc: plugged('ppc-bay', { roll: -90, back: 0 }) },
          highlight: ['ppc'],
          zoom: { target: 'ppc-bay', dir: [0.3, 0.25, 1], dist: 320, caption: '拧手转到水平：开锁' },
        },
        {
          id: 'pull', title: '拔出旧滤芯', page: 9,
          desc: '沿滤芯桶方向把旧滤芯平着拔出来。',
          camera: { target: [240, 300, 700], dir: [0.7, 0.4, 1], dist: 1300 },
          set: { ppc: plugged('ppc-bay', { roll: -90, depth: -HOVER, back: 0 }) },
          highlight: ['ppc'],
        },
        {
          id: 'new-in', title: '取出新滤芯，对准滤芯桶', page: 9,
          desc: '旧滤芯放一边。剪开新滤芯包装，按「首次安装滤芯」1–2 步：拧手转到水平的「开锁」位置，对准上面的 PPC 滤芯桶。',
          camera: { target: [400, 200, 950], dir: [0.8, 0.6, 1], dist: 2000 },
          set: {
            ppc: { parent: null, at: PPC_ASIDE, rot: LIE },
            'bag-ppc': { visible: false },
            'ppc-new': { ...plugged('ppc-bay', { depth: -HOVER, roll: -90, back: 0 }), visible: true, delay: 1, dur: 1.4 },
          },
          highlight: ['ppc-new'],
          callouts: [{ part: 'ppc', text: '旧滤芯', at: [160, 50, 0] }],
        },
        {
          id: 'lock', title: '推到底，顺时针转 90° 锁定', page: 9,
          desc: '把新滤芯平推进滤芯桶，轻压并顺时针转 90°：拧手到 12:00、对准「锁」标识、顶面与中框平齐。',
          camera: { target: [240, 300, 640], dir: [0.5, 0.3, 1], dist: 1100 },
          set: { 'ppc-new': { ...plugged('ppc-bay', { roll: 0, back: 0 }), dur: 1.6 } },
          highlight: ['ppc-new'],
          zoom: { target: 'ppc-bay', dir: [0.3, 0.25, 1], dist: 320, caption: '拧手 12:00，顶面平齐' },
        },
        {
          id: 'power-on', title: '开阀通电，确认换芯完成', page: 9,
          desc: '打开三通球阀，插上电源开机：换上新滤芯的那一位指示灯橙色闪亮后熄灭，就表示换芯完成。',
          camera: { target: [120, 420, -60], dir: [0.3, 0.4, 1], dist: 2300 },
          set: { 'tee-handle': OPEN, 'power-plug': plugged('outlet-hole'), 'led-ppc': { light: 'blinkThenOff', delay: 1.2 } },
          highlight: ['power-plug', 'tee-handle'],
          zoom: { target: 'led-ppc', dir: [0.1, 0.2, 1], dist: 180, caption: '1 号灯橙色闪亮后熄灭 = 换芯完成' },
        },
        {
          id: 'reset', title: '没断电换芯时：选择 + 复位', page: 9,
          desc: '如果换芯时没断电：轻触「选择」键切到新滤芯对应的灯（选中的灯闪烁），再长按「复位」键 3 秒，蜂鸣器响 3 声即完成。净水器会读取滤芯的实际寿命。',
          camera: SERVICE_PANEL,
          set: { 'led-ppc': { light: 'blink' } },
          actions: [{ type: 'press', part: 'key-select' }, { type: 'press', part: 'key-reset', delay: 0.8 }],
          highlight: ['key-select', 'key-reset', 'led-ppc'],
          zoom: KEYS_ZOOM('选中 1 号灯，长按「复位」3 秒'),
        },
        {
          id: 'flush', title: '装回防尘盖，冲洗新滤芯', page: 9,
          desc: '装回防尘盖，打开纯净水龙头冲洗：换 PPC 约冲 15 分钟；换 RO 按首次安装的方式冲洗。出水呈灰黑色或有气泡属正常，冲到清澈即可。',
          camera: { target: [150, 480, 0], dir: [0.4, 0.4, 1], dist: 2500 },
          set: { 'led-ppc': { light: 'off' }, cover: coverOn(VIA_G3), stream: { visible: true, delay: 1 }, 'faucet-screen': { ui: TDS } },
          highlight: ['cover', 'stream'],
        },
        {
          id: 'push-in', title: '把主机放回橱柜', page: 9,
          desc: '冲洗完成后关闭龙头，把主机平放回橱柜，理顺水管和引线，不要折弯。',
          camera: CABINET,
          set: { stream: { visible: false }, purifier: { at: P_CAB, rot: [0, 0, 0], via: [240, 190, 110], dur: 1.6 } },
          highlight: ['purifier'],
        },
      ],
    },
    {
      id: 'lights',
      title: '指示灯与故障排查',
      kind: 'repair',
      start: { cover: { parent: null, at: COVER_FLOOR_G2, rot: [90, 0, 0] } },
      steps: [
        {
          id: 'screen', title: '看懂龙头显示屏', page: 7,
          desc: '「006 纯净水TDS」= 工作正常；「PPC滤芯 / RO1000G 即将到期」「请换滤芯」= 对应滤芯快到期 / 已到期；「过热保护 请稍候」= 水泵过热，稍后再用；「连接故障」= 龙头与主机通信异常。',
          camera: { target: 'faucet', offset: [0, 120, 0], dir: [0.3, 0.6, 1], dist: 800 },
          highlight: ['faucet-screen'],
          zoom: { target: 'faucet-screen', dir: [0, 1, 0.7], dist: 110, caption: '006 · 工作正常' },
        },
        {
          id: 'wifi', title: 'Wi-Fi 指示灯', page: 9,
          desc: '橙色快闪 = 待连接或未连接；蓝色快闪 = 掉线或正在连接 → 增强无线信号或重置 Wi-Fi。熄灭 = 30 分钟未配网 → 长按「选择」+「复位」7 秒重置。',
          camera: { target: LED_ROW, dir: [0.15, 0.3, 1], dist: 650 },
          set: { 'led-wifi': { light: 'blink', color: ORANGE } },
          highlight: ['led-wifi'],
          zoom: { target: 'led-wifi', dir: [0.1, 0.15, 1], dist: 180, caption: 'Wi-Fi 灯橙色快闪：待连接' },
        },
        {
          id: 'overheat', title: '异常灯闪烁：水泵过热保护', page: 9,
          desc: '异常灯橙色闪烁、龙头屏显示「过热保护 请稍候」：水泵长时间工作过热，停止制水 10 分钟后恢复。橙色快闪 = 滤芯检测板通讯异常（断电重启或更换检测板）；橙色常亮 = 机器异常，在米家 APP 查看具体故障。',
          camera: { target: LED_ROW, dir: [0.15, 0.3, 1], dist: 650 },
          set: { 'led-wifi': { light: 'off' }, 'led-fault': { light: 'blink' }, 'faucet-screen': { ui: HOT } },
          highlight: ['led-fault'],
          zoom: { target: 'led-fault', dir: [0.1, 0.15, 1], dist: 180, caption: '异常灯橙色闪烁：过热保护' },
        },
        {
          id: 'filter-check', title: '异常灯 + 滤芯灯一起快闪', page: 9,
          desc: '异常灯和 1 号灯同时橙色快闪 = PPC 滤芯检测异常；异常灯 + 2 号灯 = RO 滤芯检测异常；三灯一起 = 两支都异常。断电重启、重新安装或更换对应滤芯。只有 1 / 2 号灯橙色闪烁 = 寿命即将耗尽，常亮 = 已耗尽。',
          camera: { target: LED_ROW, dir: [0.15, 0.3, 1], dist: 650 },
          set: { 'faucet-screen': { ui: TDS }, 'led-ppc': { light: 'blink' } },
          highlight: ['led-fault', 'led-ppc'],
          zoom: { target: LED_ROW, offset: [10, 0, 0], dir: [0.1, 0.15, 1], dist: 180, caption: '异常 + 1 号快闪：PPC 检测异常' },
        },
        {
          id: 'no-water', title: '不出纯净水 / 浓缩水不排', page: 10,
          desc: '不出纯净水：电源线是否插好、三通球阀是否打开、滤芯是否装到位且为正品、是否到更换周期、自来水是否超过 38 ℃ 或水压过低、纯净水管与进水管是否折弯破损。浓缩水管不排水：检查是否弯折或堵塞。',
          tip: '超过 3 天不用请关闭电源和三通球阀，再用时冲洗 10 分钟以上（超过 7 天冲 30 分钟）；气温低于 4 ℃ 要关阀排空存水。',
          camera: CABINET,
          set: { 'led-fault': { light: 'off' }, 'led-ppc': { light: 'off' } },
          highlight: ['power-plug', 'tee-handle', 'pipe-in', 'pipe-pure', 'pipe-conc'],
          callouts: [
            { part: 'power-plug', text: '电源插好了吗' },
            { part: 'tee-handle', text: '球阀打开了吗' },
            { part: 'drain-end', text: '浓缩水管别弯折', at: [0, 220, 0] },
          ],
        },
      ],
    },
  ],
}
