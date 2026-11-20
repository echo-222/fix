import type { Action, ManualSpec, Shape, SpecPart, Vec3 } from '../types'

/**
 * 四冲程发动机剖面：按本田 CBR250R（MC41E 单缸）的缸径 76 × 行程 55 mm、压缩比 10.7 画，只留后半边壳体（z ≤ 0），运动件画完整。
 * 坐标：mm，Y 向上，地面 y = 0，观众在 +Z；曲轴中心 (0, YC, 0)，从前面看曲轴顺时针转，进气在左（-x）、排气在右（+x）。
 * 推断：连杆长 100 mm、活塞压缩高度、凸轮基圆 / 升程、壳体外形都是按比例估的；燃烧室按压缩比折成平顶，高 = 行程 / (压缩比 − 1)。
 *
 * 曲柄滑块（同一周期 P、同一延迟）：曲轴 spin z 1/P，曲柄销 (r cos θ, −r sin θ)，θ = 360°·t/P；
 * 活塞 slide y（amp r、rod L、phase 0.5），活塞销静止位置 = 曲轴中心 + L；连杆是活塞的子零件、原点在活塞销，swing z crank amp = asin(r/L)、phase 0.25。
 * 循环角 α（0° = 进气上止点）= 360°·t/P + 90°，每步用负的 delay 把动画起点放到想要的 α0，静止姿态（连杆竖直）永远不会出现。
 *
 * 气门一个循环（720°）只开一次 240°，clip 做不出来，用一个看不见的「驱动」父零件（rot z 180°，局部 −y = 世界向上）：
 * 父零件 slide（amp a、rod Lv、周期 4P、phase φ），气门 slide（amp a、周期 4P、phase φ + 0.5），合成位移 = Lv − √max(0, Lv² − a²cos²x)：
 * |cos x| ≥ Lv/a 时气门在静止位置上方 Lv（关），cos x = 0 时回到静止位置（全开）。a = 2Lv → 开 240° 曲轴角。火花同理，平时缩进火花塞里藏着。
 */
const BORE = 76
const STROKE = 55
const CR = 10.7
const R = STROKE / 2
const L = 100
const YC = 70
const PIN_UP = 26
const SKIRT = 24
const PR = BORE / 2 - 0.4
const TDC_CROWN = YC + L + R + PIN_UP
const CLEAR = STROKE / (CR - 1)
const DECK = Math.round((TDC_CROWN + CLEAR) * 100) / 100
const BLOCK_Y = 120
const HD = 46
const ROD_AMP = (Math.asin(R / L) * 180) / Math.PI

/** 气门：x 位置、头部半径；升程 Lv，驱动幅度 a = 2Lv；开启中心（循环角） */
const LV = 8
const VA = 2 * LV
const VALVE = { in: { x: -19, r: 15, center: 110 }, ex: { x: 20, r: 12, center: 610 } }
const BUCKET_R = 9
const BUCKET_TOP = 82
const RB = 13
const CAM_Y = BUCKET_TOP + 0.3 + RB
/** 火花：缩进火花塞 LZ，开窗 ±25° 曲轴角，中心在上止点前 10° */
const PLUG_X = 2
const LZ = 8
const SPARK_HALF = 25
const SPARK_AT = 350
const SA = LZ / Math.sin(((SPARK_HALF / 4) * Math.PI) / 180)

const r3 = (v: number) => Math.round(v * 1000) / 1000
const rad = (d: number) => (d * Math.PI) / 180
const mod = (v: number, m: number) => ((v % m) + m) % m
/** 驱动相位：开启中心 αc 处 x = 90° */
const phaseAt = (center: number) => r3(mod((90 - (center - 90) / 4) / 360, 1))
const PH = { in: phaseAt(VALVE.in.center), ex: phaseAt(VALVE.ex.center), spark: phaseAt(SPARK_AT) }

/** xy 剖面（rot 90° 绕 x）挤出到 z ∈ [z0, z1] */
const section = (pts: [number, number][], z0: number, z1: number, extra: { fill?: 'white' | 'warm' | 'shade' | 'dark' } = {}) => ({
  type: 'poly' as const, points: pts.map(([x, y]) => [r3(x), r3(-y)] as [number, number]), h: z1 - z0, at: [0, 0, z0] as Vec3, rot: [90, 0, 0] as Vec3, ...extra,
})
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(rad(a0 + ((a1 - a0) * k) / n)), cy + r * Math.sin(rad(a0 + ((a1 - a0) * k) / n))])
/** 俯视（[x, z]）半圆 / 半圆环，z ≤ 0 */
const halfDisc = (r: number): [number, number][] => arc(0, 0, r, 180, 360, 24).map(([x, z]) => [r3(x), r3(z)])
const halfRing = (r1: number, r2: number): [number, number][] => [...halfDisc(r2), ...halfDisc(r1).reverse()]

/** 凸轮：平底挺杆的升程 s(γ) = RB + Lv√max(0, 1 − 4sin²(γ/2))，轮廓取所有挺杆平面的公共内侧（凸、不穿挺杆）；尖顶朝局部 −y */
const camLift = (g: number) => LV * Math.sqrt(Math.max(0, 1 - 4 * Math.sin(rad(g) / 2) ** 2))
function camLobe(): [number, number][] {
  const pts: [number, number][] = []
  for (let f = -180; f < 180; f += 2) {
    let rho = Infinity
    for (let g = -180; g < 180; g += 0.5) {
      const c = Math.cos(rad(f - g))
      if (c > 0.05) rho = Math.min(rho, (RB + camLift(g)) / c)
    }
    pts.push([rho * Math.sin(rad(f)), -rho * Math.cos(rad(f))])
  }
  return pts
}
const LOBE = camLobe()

const ALU = { color: '#b9bec3', roughness: 0.45, metalness: 0.7 }
const PISTON_ALU = { color: '#d5d7d9', roughness: 0.35, metalness: 0.75 }
const ghost = (id: string, name: string, parent: string, at: Vec3): SpecPart => ({
  id, name, parent, at, rot: [0, 0, 180], shape: { type: 'text', text: ' ', size: 0.5 },
})

const valveShape = (rv: number): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: rv, h: 1.6, axis: 'y', at: [0, -0.8, 0] },
    { type: 'cylinder', r: 2.75, r2: rv - 1.5, h: 6, axis: 'y', at: [0, -4.6, 0] },
    { type: 'cylinder', r: 2.75, h: 70, axis: 'y', at: [0, -42.6, 0] },
    { type: 'cylinder', r: BUCKET_R, h: 8, axis: 'y', at: [0, -(BUCKET_TOP - 4), 0], fill: 'shade' },
  ],
})

const camShape = (z0: number): Shape => ({
  type: 'compound',
  items: [
    { type: 'cylinder', r: 6, h: HD + 12, axis: 'z', at: [0, 0, (12 - HD) / 2] },
    { type: 'poly', points: LOBE.map(([x, y]) => [r3(x), r3(-y)] as [number, number]), h: 7, at: [0, 0, z0], rot: [90, 0, 0] },
  ],
})

const ARROW: [number, number][] = [[0, -2.5], [11, -2.5], [11, -5.5], [19, 0], [11, 5.5], [11, 2.5], [0, 2.5]]
const arrow = (id: string, name: string, at: Vec3, deg: number): SpecPart => ({
  id, name, parent: 'head', at, rot: [0, 0, deg], visible: false,
  shape: { type: 'compound', items: [section(ARROW, 0, 0.8)] }, fill: 'white', finish: 'plastic-white',
})
const mark = (id: string, text: string, y: number): SpecPart => ({
  id, name: text, parent: 'block', at: [50, y - BLOCK_Y, 0], visible: false,
  shape: { type: 'compound', items: [{ type: 'hole', w: 22, h: 0.8 }, { type: 'text', text, size: 4.5, at: [0, -4.5, 0] }] },
})

/**
 * 发动机运转：周期 P 秒 / 曲轴一圈，从循环角 α0 开始。所有动作同一个 delay，保持同步。
 */
function run(P: number, alpha0: number): Action[] {
  const delay = -r3(mod((P * (alpha0 - 90)) / 360, 2 * P))
  const pair = (drive: string, part: string, amp: number, rod: number, phase: number): Action[] => [
    { type: 'slide', part: drive, axis: 'y', amp, rod, period: 4 * P, phase, delay },
    { type: 'slide', part, axis: 'y', amp, period: 4 * P, phase: r3(phase + 0.5), delay },
  ]
  return [
    { type: 'spin', part: 'crank', axis: 'z', speed: 1 / P, delay },
    { type: 'slide', part: 'piston', axis: 'y', amp: R, rod: L, period: P, phase: 0.5, delay },
    { type: 'swing', part: 'rod', axis: 'z', amp: ROD_AMP, crank: true, period: P, phase: 0.25, delay },
    ...pair('drive-in', 'valve-in', VA, LV, PH.in),
    ...pair('drive-ex', 'valve-ex', VA, LV, PH.ex),
    ...pair('drive-spark', 'spark', SA, LZ, PH.spark),
    { type: 'spin', part: 'cam-in', axis: 'z', speed: 1 / (2 * P), delay },
    { type: 'spin', part: 'cam-ex', axis: 'z', speed: 1 / (2 * P), delay },
  ]
}

const FULL = { target: [0, 178, 0] as Vec3, dir: [0.3, 0.16, 1] as Vec3, dist: 820 }
const STROKE_CAM = { target: [0, 182, 0] as Vec3, dir: [0.14, 0.1, 1] as Vec3, dist: 720 }
const SWEPT = (Math.PI / 4) * (BORE / 10) ** 2 * (STROKE / 10)

/** 标注锚在不动的壳体上（气缸盖 / 气缸体局部坐标） */
const AT = {
  in: { part: 'head', at: [VALVE.in.x, 40, 0] as Vec3 },
  ex: { part: 'head', at: [VALVE.ex.x, 40, 0] as Vec3 },
  plug: { part: 'head', at: [PLUG_X, 50, 0] as Vec3 },
  piston: { part: 'block', at: [-40, 70, 0] as Vec3 },
}

export const mechFourStroke: ManualSpec = {
  id: 'mech-four-stroke',
  name: '四冲程发动机：吸、压、爆、排',
  desc: '剖开一台单缸汽油机：活塞走四趟、曲轴转两圈，进排气门和火花塞按顺序配合。',
  category: '机械结构',
  genre: 'tutorial',
  dims: { width: 156, depth: 70, height: Math.round(DECK + 124) },
  source: { title: 'Wikipedia · Four-stroke engine', url: 'https://en.wikipedia.org/wiki/Four-stroke_engine', images: [] },
  package: [
    { name: '气缸体（剖开）', qty: 1, spec: `缸径 ${BORE} mm` },
    { name: '气缸盖（剖开）', qty: 1, spec: '进气道、排气道、燃烧室' },
    { name: '活塞', qty: 1, spec: '带活塞环槽、活塞销' },
    { name: '连杆', qty: 1, spec: `中心距 ${L} mm（推断）` },
    { name: '曲轴', qty: 1, spec: `曲柄半径 ${R} mm · 带配重` },
    { name: '进气门 / 排气门', qty: 2, spec: `气门头 ø${VALVE.in.r * 2} / ø${VALVE.ex.r * 2} mm` },
    { name: '凸轮轴', qty: 2, spec: '进气、排气各一根（DOHC）' },
    { name: '火花塞', qty: 1, spec: 'M12' },
  ],
  params: [
    { label: '缸径 × 行程', value: `${BORE.toFixed(1)} × ${STROKE.toFixed(1)} mm`, note: '本田 CBR250R（MC41E）单缸、每缸 4 气门的官方数据' },
    { label: '排量', value: `π/4 × 7.6² × 5.5 ≈ ${SWEPT.toFixed(1)} mL`, note: '活塞从上止点走到下止点扫过的体积（本田标称 249 cm³）' },
    { label: '压缩比', value: `${CR} : 1`, note: `燃烧室容积 = 排量 ÷ (压缩比 − 1) ≈ ${(SWEPT / (CR - 1)).toFixed(1)} mL` },
    { label: '一个循环', value: '曲轴 720° · 凸轮轴 360°', note: '四个冲程各占曲轴半圈，只有做功冲程出力' },
    { label: '曲柄半径', value: `${R} mm = 行程 ÷ 2`, note: `连杆 ${L} mm（推断），连杆比 r/L ≈ ${(R / L).toFixed(2)}` },
    { label: '配气相位（示例）', value: '进气 BTDC 10° 开 · ABDC 50° 关；排气 BBDC 50° 开 · ATDC 10° 关', note: '各开 240°，上止点附近两个气门同时开 20°（气门重叠）' },
    { label: '点火', value: '上止点前点火', note: '混合气烧起来要时间，转速越高点得越早（约 10°–30°）' },
    { label: '6000 rpm 时', value: '每秒做功 50 次', note: '曲轴每两圈做功一次：6000 ÷ 60 ÷ 2' },
  ],
  parts: [
    {
      id: 'crankcase', name: '曲轴箱（剖开）',
      shape: {
        type: 'compound',
        items: [
          section([[-78, 0], [78, 0], [78, BLOCK_Y], [54, BLOCK_Y], ...arc(0, YC, 54, 0, -180, 36), [-54, BLOCK_Y], [-78, BLOCK_Y]], -HD, 0),
          { type: 'box', size: [156, BLOCK_Y, 6], at: [0, BLOCK_Y / 2, -HD - 3] },
        ],
      },
      fill: 'shade', finish: ALU,
    },
    {
      id: 'crank', name: '曲轴', spec: `曲柄半径 ${R} mm`, parent: 'crankcase', at: [0, YC, 0],
      shape: {
        type: 'compound',
        items: [
          section([...arc(R, 0, 14, -90, 90, 12), [0, 18], [-23, 39.84], ...arc(0, 0, 46, 120, 240, 16).slice(1, -1), [-23, -39.84], [0, -18]], -19, -11),
          { type: 'cylinder', r: 11, h: 22, axis: 'z', at: [R, 0, 0], fill: 'white' },
          { type: 'cylinder', r: 15, h: HD - 19, axis: 'z', at: [0, 0, -(HD + 19) / 2] },
          { type: 'cylinder', r: 3, h: 0.6, axis: 'z', at: [-34, 0, -10.7], fill: 'dark', finish: 'plastic-black' },
        ],
      },
      fill: 'white', finish: 'steel',
    },
    {
      id: 'block', name: '气缸体（剖开）', spec: `缸径 ${BORE} mm`, parent: 'crankcase', at: [0, BLOCK_Y, 0],
      shape: { type: 'poly', points: [[-62, 0], ...halfDisc(BORE / 2), [62, 0], [62, -HD], [-62, -HD]], h: DECK - BLOCK_Y },
      fill: 'shade', finish: ALU,
    },
    mark('mark-tdc', '上止点', TDC_CROWN),
    mark('mark-bdc', '下止点', TDC_CROWN - STROKE),
    {
      id: 'piston', name: '活塞', spec: `ø${(PR * 2).toFixed(1)} mm`, parent: 'block', at: [0, YC + L - BLOCK_Y, 0],
      shape: {
        type: 'compound',
        items: [
          { type: 'poly', points: halfDisc(PR), h: PIN_UP - 13.5, at: [0, 13.5, 0] },
          { type: 'poly', points: halfRing(PR - 4, PR), h: 13.5 + SKIRT, at: [0, -SKIRT, 0] },
          { type: 'box', size: [28, 22, PR - 4 - 9], at: [0, 0, -(PR - 4 + 9) / 2] },
          { type: 'cylinder', r: 9, h: PR - 4 + 9, axis: 'z', at: [0, 0, (9 - (PR - 4)) / 2], fill: 'white', finish: 'steel' },
          ...[22.5, 19, 15.5].flatMap((y) => [-1, 1].map((s) => ({ type: 'hole' as const, w: 3, h: 1.1, at: [s * (PR - 1.5), y, 0] as Vec3 }))),
        ],
      },
      fill: 'white', finish: PISTON_ALU,
    },
    {
      id: 'rod', name: '连杆', spec: `${L} mm`, parent: 'piston',
      shape: {
        type: 'compound',
        items: [
          { type: 'cylinder', r: 12.5, h: 16, axis: 'z' },
          { type: 'box', size: [12, L - 22, 10], at: [0, -L / 2, 0] },
          { type: 'cylinder', r: 16, h: 18, axis: 'z', at: [0, -L, 0] },
        ],
      },
      fill: 'white', finish: 'steel',
    },
    {
      id: 'head', name: '气缸盖（剖开）', parent: 'block', at: [0, r3(DECK - BLOCK_Y), 0],
      shape: {
        type: 'compound',
        items: [
          section([[-72, 0], [-34, 0], [-46, 12], [-72, 18]], -HD, 0),
          section([[-4, 0], [-4, 18], [-7, 18], [-7, 30], [-5, 30], [-5, BUCKET_TOP], [-19 + BUCKET_R + 0.4, BUCKET_TOP], [-19 + BUCKET_R + 0.4, 60], [-19 - BUCKET_R - 0.4, 60], [-19 - BUCKET_R - 0.4, BUCKET_TOP], [-72, BUCKET_TOP], [-72, 40], [-30, 30], [-10, 18]], -HD, 0),
          section([[32, 0], [72, 0], [72, 16], [44, 11]], -HD, 0),
          section([[8, 0], [13, 16], [30, 28], [72, 37], [72, BUCKET_TOP], [20 + BUCKET_R + 0.4, BUCKET_TOP], [20 + BUCKET_R + 0.4, 60], [20 - BUCKET_R - 0.4, 60], [20 - BUCKET_R - 0.4, BUCKET_TOP], [9, BUCKET_TOP], [9, 30], [11, 30], [11, 18], [8, 18]], -HD, 0),
          section([[-72, BUCKET_TOP], [-72, 110], [-58, 124], [58, 124], [72, 110], [72, BUCKET_TOP], [66, BUCKET_TOP], [66, 108], [55, 118], [-55, 118], [-66, 108], [-66, BUCKET_TOP]], -HD, 0),
          section([[-72, 0], [72, 0], [72, 110], [58, 124], [-58, 124], [-72, 110]], -HD - 6, -HD),
        ],
      },
      fill: 'shade', finish: ALU,
    },
    {
      id: 'plug', name: '火花塞', spec: 'M12', parent: 'head', at: [PLUG_X, 0, 0],
      shape: {
        type: 'compound',
        items: [
          { type: 'cylinder', r: 5.5, h: 19, axis: 'y', at: [0, 9.5, 0], finish: 'steel' },
          { type: 'cylinder', r: 8, h: 7, axis: 'y', at: [0, 22.5, 0], finish: 'steel' },
          { type: 'cylinder', r: 4.8, r2: 4.2, h: 30, axis: 'y', at: [0, 41, 0] },
          { type: 'cylinder', r: 2.2, h: 6, axis: 'y', at: [0, 59, 0], finish: 'steel' },
          { type: 'cylinder', r: 1.1, h: 2, axis: 'y', at: [0, -1, 0], finish: 'steel' },
          { type: 'box', size: [1.2, 4.6, 1.6], at: [4.2, -2.3, 0], finish: 'steel' },
          { type: 'box', size: [5.4, 1.2, 1.6], at: [2.1, -4, 0], finish: 'steel' },
        ],
      },
      fill: 'white', finish: 'plastic-white',
    },
    ghost('drive-spark', '点火正时（隐藏）', 'plug', [0, -2.7, 0]),
    {
      id: 'spark', name: '电火花', parent: 'drive-spark',
      shape: { type: 'compound', items: [0, 60, 120].map((d) => ({ type: 'box' as const, size: [4.4, 0.5, 0.5] as Vec3, rot: [0, 0, d] as Vec3 })) },
      fill: 'white', finish: { color: '#9ad7ff', roughness: 0.2, metalness: 0 },
    },
    { id: 'spark-led', name: '电火花', parent: 'spark', at: [0, 0, 1.2], shape: { type: 'led', r: 1.6, color: '#9ad7ff' } },
    ghost('drive-in', '进气门正时（隐藏）', 'head', [VALVE.in.x, -LV, 0]),
    { id: 'valve-in', name: '进气门', spec: `ø${VALVE.in.r * 2} mm`, parent: 'drive-in', shape: valveShape(VALVE.in.r), fill: 'white', finish: 'steel' },
    ghost('drive-ex', '排气门正时（隐藏）', 'head', [VALVE.ex.x, -LV, 0]),
    { id: 'valve-ex', name: '排气门', spec: `ø${VALVE.ex.r * 2} mm`, parent: 'drive-ex', shape: valveShape(VALVE.ex.r), fill: 'white', finish: 'steel' },
    {
      id: 'cam-in', name: '进气凸轮轴', parent: 'head', at: [VALVE.in.x, CAM_Y, 0],
      rot: [0, 0, -90 + (VALVE.in.center - 90) / 2 + 90], shape: camShape(-9), fill: 'white', finish: 'steel',
    },
    {
      id: 'cam-ex', name: '排气凸轮轴', parent: 'head', at: [VALVE.ex.x, CAM_Y, 0],
      rot: [0, 0, -90 + (VALVE.ex.center - 90) / 2 + 90], shape: camShape(2), fill: 'white', finish: 'steel',
    },
    arrow('flow-in', '混合气', [-62, 26, 0], -21),
    arrow('flow-ex', '废气', [40, 16, 0], 22),
  ],
  initial: { 'spark-led': { light: 'on' } },
  stageSize: 700,
  guides: [
    {
      id: 'cycle',
      title: '四个冲程',
      kind: 'usage',
      steps: [
        {
          id: 'overview', title: '一个循环：吸、压、爆、排',
          desc: '活塞在气缸里上下走四趟（四个冲程），曲轴转两圈，才完成一次「进气 → 压缩 → 做功 → 排气」。四趟里只有做功那一趟在出力，另外三趟靠曲轴配重和飞轮的惯性带过去。',
          camera: FULL,
          actions: run(2, 280),
          callouts: [
            { ...AT.in, text: '进气门', offset: [-70, 50, 0] },
            { ...AT.ex, text: '排气门', offset: [70, 50, 0] },
            { ...AT.plug, text: '火花塞', offset: [0, 95, 0] },
            { ...AT.piston, text: '活塞', offset: [-70, 0, 0] },
            { part: 'crankcase', text: '连杆', at: [-10, 105, 0], offset: [-90, 0, 0] },
            { part: 'crankcase', text: '曲轴', at: [-30, YC, 0], offset: [-70, -20, 0] },
          ],
          chips: [{ label: '一个循环', sub: '曲轴转 2 圈 = 720°' }, { label: '做功', sub: '每 2 圈 1 次' }],
        },
        {
          id: 'intake', title: '① 进气：活塞下行，进气门开',
          desc: '活塞从上止点往下走，气缸里的空间变大、压力变低；进气门打开，空气和汽油的混合气被「吸」进来，排气门关着。曲轴转过 0° → 180°。',
          camera: STROKE_CAM,
          set: { 'flow-in': { visible: true, dur: 0.05 } },
          highlight: ['valve-in', 'piston', 'flow-in'],
          actions: run(4, 20),
          callouts: [
            { ...AT.in, text: '进气门 · 开', offset: [-70, 50, 0] },
            { ...AT.ex, text: '排气门 · 关', offset: [70, 50, 0] },
            { ...AT.piston, text: '活塞向下', offset: [-70, 0, 0] },
          ],
          chips: [{ label: '曲轴', sub: '0° → 180°' }, { label: '进气门', sub: '开' }, { label: '排气门', sub: '关' }],
        },
        {
          id: 'compression', title: '② 压缩：两个气门都关',
          desc: `活塞从下止点往上走，进气门、排气门都关紧，混合气被挤到原来体积的 1/${CR}，这就是压缩比。压得越紧，点着以后推力越大。曲轴转过 180° → 360°。`,
          camera: STROKE_CAM,
          highlight: ['piston'],
          actions: run(4, 200),
          callouts: [
            { ...AT.in, text: '进气门 · 关', offset: [-70, 50, 0] },
            { ...AT.ex, text: '排气门 · 关', offset: [70, 50, 0] },
            { ...AT.piston, text: '活塞向上', offset: [-70, 0, 0] },
          ],
          chips: [{ label: '曲轴', sub: '180° → 360°' }, { label: '压缩比', sub: `${CR} : 1` }],
        },
        {
          id: 'power', title: '③ 做功：火花塞点火',
          desc: '活塞快到顶时火花塞跳火，压紧的混合气一下子烧起来、膨胀，把活塞猛推下去；连杆把这一推传给曲轴，让它转起来。四个冲程里只有这一趟出力。曲轴转过 360° → 540°。',
          camera: STROKE_CAM,
          highlight: ['spark', 'plug', 'piston'],
          actions: run(4, 310),
          callouts: [
            { ...AT.plug, text: '火花塞跳火', offset: [-55, 45, 0] },
            { ...AT.piston, text: '活塞被推下', offset: [-70, 0, 0] },
          ],
          zoom: { target: [PLUG_X, DECK - 3, 0], dir: [0.15, -0.05, 1], dist: 90, caption: '上止点前跳火，点燃压紧的混合气' },
          chips: [{ label: '曲轴', sub: '360° → 540°' }, { label: '点火', sub: '上止点前' }, { label: '两个气门', sub: '关' }],
        },
        {
          id: 'exhaust', title: '④ 排气：排气门开',
          desc: '活塞再往上走，排气门打开，烧过的废气被推出去。快到顶时进气门已经提前打开，下一个循环接着开始。曲轴转过 540° → 720°。',
          camera: STROKE_CAM,
          set: { 'flow-in': { visible: false, dur: 0.05 }, 'flow-ex': { visible: true, dur: 0.05 } },
          highlight: ['valve-ex', 'piston', 'flow-ex'],
          actions: run(4, 560),
          callouts: [
            { ...AT.in, text: '进气门 · 关', offset: [-70, 50, 0] },
            { ...AT.ex, text: '排气门 · 开', offset: [70, 50, 0] },
            { ...AT.piston, text: '活塞向上', offset: [-70, 0, 0] },
          ],
          chips: [{ label: '曲轴', sub: '540° → 720°' }, { label: '排气门', sub: '开' }],
          tip: '排气快结束、进气刚开始时，两个气门会同时开一小会儿（气门重叠），让新鲜混合气把废气赶干净。',
        },
      ],
    },
    {
      id: 'numbers',
      title: '零件与数字',
      kind: 'usage',
      start: { 'flow-in': { visible: false }, 'flow-ex': { visible: false } },
      steps: [
        {
          id: 'crank', title: '曲柄连杆：上下变转圈',
          desc: `活塞销、连杆、曲柄销组成「曲柄滑块」。曲柄半径 ${R} mm，正好是行程 ${STROKE} mm 的一半：活塞直上直下，连杆一头跟着活塞、一头跟着曲柄销画圆，往复运动就变成了旋转。`,
          camera: { target: [0, 120, 0], dir: [0.3, 0.12, 1], dist: 560 },
          highlight: ['piston', 'rod', 'crank'],
          actions: run(2.5, 0),
          zoom: { target: [0, YC, 0], dir: [0.2, 0.05, 1], dist: 200, caption: '连杆大头套在曲柄销上，跟着转圈' },
          chips: [{ label: '曲柄半径', sub: `${R} mm = 行程 ÷ 2` }, { label: '连杆', sub: `${L} mm` }],
        },
        {
          id: 'bore-stroke', title: '缸径、行程和压缩比',
          desc: `缸径 ${BORE} mm、行程 ${STROKE} mm，排量 = π/4 × 7.6² × 5.5 ≈ ${SWEPT.toFixed(1)} mL。活塞到上止点时，头顶只剩约 ${CLEAR.toFixed(1)} mm 高的燃烧室：(${STROKE} + ${CLEAR.toFixed(1)}) ÷ ${CLEAR.toFixed(1)} ≈ ${CR}，就是压缩比。`,
          camera: { target: [0, 205, 0], dir: [0.2, 0.08, 1], dist: 420 },
          set: { 'mark-tdc': { visible: true, dur: 0.05 }, 'mark-bdc': { visible: true, dur: 0.05 } },
          highlight: ['piston', 'mark-tdc', 'mark-bdc'],
          actions: run(3, 0),
          chips: [{ label: '缸径 × 行程', sub: `${BORE} × ${STROKE} mm` }, { label: '排量', sub: `${SWEPT.toFixed(1)} mL` }, { label: '压缩比', sub: `${CR} : 1` }],
        },
        {
          id: 'cams', title: '凸轮轴：曲轴转两圈，它转一圈',
          desc: '每个气门一个循环只开一次，所以凸轮轴的转速是曲轴的一半（正时链条 2 : 1 带动）。凸轮的尖顶转到下面，压下挺杆、顶开气门；转过去以后，气门弹簧把气门拉回关紧。',
          camera: { target: [0, DECK + 70, 0], dir: [0.15, 0.1, 1], dist: 360 },
          set: { 'mark-tdc': { visible: false, dur: 0.05 }, 'mark-bdc': { visible: false, dur: 0.05 } },
          highlight: ['cam-in', 'cam-ex'],
          actions: run(2.5, 60),
          zoom: { target: [VALVE.in.x, DECK + BUCKET_TOP - 2, 0], dir: [0.15, 0.05, 1], dist: 110, caption: '凸轮尖顶压下挺杆，气门就打开' },
          chips: [
            { label: '进气门', sub: '上止点前 10° 开 · 下止点后 50° 关' },
            { label: '排气门', sub: '下止点前 50° 开 · 上止点后 10° 关' },
            { label: '凸轮轴', sub: '转速 = 曲轴 ÷ 2' },
          ],
        },
      ],
    },
  ],
}
