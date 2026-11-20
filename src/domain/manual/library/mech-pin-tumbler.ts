import type { ManualSpec, PartState, SpecPart, Vec3 } from '../types'

/**
 * 弹子锁（销子锁）剖面：按 Schlage 经典锁芯的规格画 —— 5 颗弹子，弹子 ø.115"，间距 .156"，第一刀离钥匙肩 .231"，
 * 齿深一级 .015"（0.381 mm，0–9 级），齿根平台 .031"、齿形 100°，钥匙宽 .343"，锁芯 ø.500"。
 * 下弹子长度按 .165" + 级数 × .015" 配，所以「齿根高度 + 下弹子长度」恒等于锁芯直径 12.7 mm：钥匙对时，每颗下弹子的上沿正好在锁芯外圆（剪切线）上。
 * 坐标：mm，Y 向上，观众在 +Z；锁芯轴线沿 x、高 YP，钥匙从 −x 插进来，锁芯前端面 x = 0。壳体、锁芯只留后半边（z ≤ 0），弹子、钥匙画完整。
 * 推断：上弹子长 .180"、壳体外形、弹簧（用 3 圈倾斜的线圈表示，只能整体平移，没法真的压缩）。
 *
 * 插钥匙时弹子要先被钥匙尖顶起、贴着齿形滑过、最后落进自己的齿槽：一步只有一段过渡，用 via（抛物线）+ 负的 lift（正弦）
 * 拼出「先升、平走、再落」的路径；每颗弹子的 delay / dur / via / lift 是按下面的齿形逐帧拟合的（弹子尖始终在钥匙上方 ≥ 0.03 mm）。
 */
const IN = 25.4
const FIRST = 0.231 * IN
const SPACING = 0.156 * IN
const INC = 0.015 * IN
const FLAT = 0.031 * IN
const SLOPE = 1 / Math.tan((50 * Math.PI) / 180)
const BLADE = 0.343 * IN
const PLUG_R = 0.25 * IN
const BORE_R = PLUG_R + 0.1
const PIN_R = (0.115 * IN) / 2
const CH_R = 1.55
const DRIVER = 0.18 * IN
const YP = 14
const YB = YP - PLUG_R
const YS = YP + PLUG_R
const YT = YS + 12.15
const YH = YT + 2
const X_FRONT = 1.2
const X_BACK = 30
const TIP = 25.4
const TIP_Y = 3
const BEVEL_X = 23.3
/** 没插钥匙时下弹子尖离钥匙底边的高度（被锁芯里的台阶托住） */
const REST = 4.18
const KEY_OUT = -30
const COILS = [0.25, 0.5, 0.75]

const BITTING = [2, 7, 4, 8, 3]
const WRONG = [2, 4, 4, 8, 6]
const pinX = (i: number) => FIRST + SPACING * i
/** 齿根离钥匙底边的高度、下弹子长度（英寸规格换算） */
const depth = (n: number) => (0.335 - 0.015 * n) * IN
const keyPinLen = (n: number) => (0.165 + 0.015 * n) * IN

/** 插钥匙过渡的拟合结果：下弹子尖的 delay、dur，via 比起止中点高 A，lift = B（钥匙 delay 0.2、dur 2.6） */
const KEY_MOVE = { delay: 0.2, dur: 2.6 }
const FIT = {
  right: [
    { delay: 0.45, dur: 2.35, A: 12, B: -8.4 },
    { delay: 0.65, dur: 2.1, A: 13.5, B: -9.45 },
    { delay: 0.8, dur: 1.95, A: 11.5, B: -8.05 },
    { delay: 1.15, dur: 1.6, A: 13.5, B: -9.45 },
    { delay: 1.5, dur: 1.25, A: 9, B: -6.3 },
  ],
  wrong: [
    { delay: 0.5, dur: 2.35, A: 14, B: -11.2 },
    { delay: 0.65, dur: 2.2, A: 10.25, B: -7.175 },
    { delay: 0.9, dur: 1.85, A: 10, B: -7 },
    { delay: 1.05, dur: 1.7, A: 9.75, B: -6.825 },
    { delay: 1.5, dur: 1.25, A: 8.25, B: -5.775 },
  ],
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const rad = (d: number) => (d * Math.PI) / 180
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(rad(a0 + ((a1 - a0) * k) / n)), cy + r * Math.sin(rad(a0 + ((a1 - a0) * k) / n))])

/** xy 剖面（rot 90° 绕 x）挤出到 z ∈ [z0, z1] */
const xySection = (pts: [number, number][], z0: number, z1: number) => ({
  type: 'poly' as const, points: pts.map(([x, y]) => [r3(x), r3(-y)] as [number, number]), h: r3(z1 - z0), at: [0, 0, z0] as Vec3, rot: [90, 0, 0] as Vec3,
})
/** 横截面 [y, z]（相对锁芯轴线，rot −90° 绕 z）沿 x 挤出到 [x0, x1] */
const xSection = (pts: [number, number][], x0: number, x1: number) => ({
  type: 'poly' as const, points: pts.map(([y, z]) => [r3(-y), r3(z)] as [number, number]), h: r3(x1 - x0), at: [x0, 0, 0] as Vec3, rot: [0, 0, -90] as Vec3,
})

/** 钥匙齿形上沿：钥匙局部 x 从肩部算起，y 从刀身底边算起 */
function keyTop(bitting: number[], x: number) {
  let y = BLADE
  bitting.forEach((n, i) => { y = Math.min(y, depth(n) + Math.max(0, Math.abs(x - pinX(i)) - FLAT / 2) * SLOPE) })
  if (x > BEVEL_X) y = Math.min(y, BLADE - ((x - BEVEL_X) * (BLADE - TIP_Y)) / (TIP - BEVEL_X))
  return y
}
function keyOutline(bitting: number[]): [number, number][] {
  const top: [number, number][] = []
  for (let k = Math.round(TIP / 0.05); k >= 0; k--) top.push([k * 0.05, keyTop(bitting, k * 0.05)])
  const simple = top.filter((p, i) => {
    if (i === 0 || i === top.length - 1) return true
    const [a, b] = [top[i - 1], top[i + 1]]
    return Math.abs((p[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (p[0] - a[0])) > 1e-6
  })
  return [
    [0, 0], [TIP - 0.8, 0], [TIP, 1.2],
    ...simple,
    [0, BLADE + 1.5], [-3, BLADE + 1.5],
    ...arcPts(-7, 11, 4, 0, 90, 6), ...arcPts(-22, 11, 4, 90, 180, 6), ...arcPts(-22, -2, 4, 180, 270, 6), ...arcPts(-7, -2, 4, 270, 360, 6),
    [-3, -1.5], [0, -1.5],
  ]
}
const keyPart = (id: string, name: string, bitting: number[], visible: boolean): SpecPart => ({
  id, name, spec: `齿深 ${bitting.join('-')}`, parent: 'plug', at: [KEY_OUT, YB - YP, 0], visible,
  shape: {
    type: 'compound',
    items: [
      xySection(keyOutline(bitting), -1.05, 1.05),
      { type: 'hole', w: 5, h: 5, r: 2.5, at: [-19, 4.5, 1.05] },
    ],
  },
  fill: 'white', finish: { color: '#c8c3b4', roughness: 0.3, metalness: 0.85 },
})

/** 锁芯横截面（后半边）：背板 z ≤ −CH_R 一整条；上面的窄条在弹子孔处断开；前端法兰带钥匙孔 */
const zc = (r: number, z: number) => Math.sqrt(r * r - z * z)
const SLAB: [number, number][] = [[zc(PLUG_R, CH_R), -CH_R], [-zc(PLUG_R, CH_R), -CH_R], ...arcPts(0, 0, PLUG_R, 180 + (Math.asin(CH_R / PLUG_R) * 180) / Math.PI, 360 - (Math.asin(CH_R / PLUG_R) * 180) / Math.PI, 20).slice(1, -1).map(([y, z]) => [y, z] as [number, number])]
const STRIP: [number, number][] = [[2.5, 0], [PLUG_R, 0], ...arcPts(0, 0, PLUG_R, 0, -(Math.asin(CH_R / PLUG_R) * 180) / Math.PI, 3).slice(1), [2.5, -CH_R]]
const FLANGE: [number, number][] = [...arcPts(0, 0, 7.6, 0, -180, 20), [-PLUG_R, 0], [-PLUG_R, -CH_R], [2.5, -CH_R], [2.5, 0]]
const stripGaps = (): [number, number][] => {
  const cuts = [X_FRONT, ...BITTING.flatMap((_, i) => [pinX(i) - CH_R, pinX(i) + CH_R]), X_BACK]
  return Array.from({ length: cuts.length / 2 }, (_, k) => [cuts[2 * k], cuts[2 * k + 1]])
}

/** 壳体正面一层（z ∈ [−CH_R, 0]）：弹子孔切成槽 */
function comb(): [number, number][] {
  const y0 = YP + BORE_R
  const pts: [number, number][] = [[X_FRONT, y0]]
  BITTING.forEach((_, i) => pts.push([pinX(i) - CH_R, y0], [pinX(i) - CH_R, YT], [pinX(i) + CH_R, YT], [pinX(i) + CH_R, y0]))
  pts.push([X_BACK, y0], [X_BACK, YH], [X_FRONT, YH])
  return pts
}

const BRASS = { color: '#c9a227', roughness: 0.35, metalness: 0.8 }
const W = X_BACK - X_FRONT
const XM = (X_BACK + X_FRONT) / 2

/** 静止（没插钥匙）：下弹子尖在 REST，上弹子压在下弹子上，弹簧在上弹子和孔顶之间 */
const tipAt = (y: number, i: number) => ({ kpin: y, driver: y + keyPinLen(BITTING[i]) - 0.04 })
const coilY = (driverBottom: number, f: number) => r3((1 - f) * (driverBottom + DRIVER) + f * YT)

function pinParts(): SpecPart[] {
  return BITTING.flatMap((n, i): SpecPart[] => {
    const x = r3(pinX(i))
    const len = keyPinLen(n) - 0.08
    const rest = tipAt(YB + REST, i)
    return [
      {
        id: `kpin-${i + 1}`, name: '下弹子', spec: `${n} 号 · 长 ${keyPinLen(n).toFixed(2)} mm`, parent: 'plug', at: [x, r3(rest.kpin - YP), 0],
        shape: {
          type: 'compound',
          items: [
            { type: 'cylinder', r: 0.4, r2: PIN_R, h: 0.9, axis: 'y', at: [0, 0.45, 0] },
            { type: 'cylinder', r: PIN_R, h: r3(len - 0.9), axis: 'y', at: [0, r3(0.9 + (len - 0.9) / 2), 0] },
          ],
        },
        fill: 'white', finish: BRASS,
      },
      {
        id: `driver-${i + 1}`, name: '上弹子', spec: `长 ${DRIVER.toFixed(2)} mm`, parent: 'housing', at: [x, r3(rest.driver), 0],
        shape: { type: 'compound', items: [{ type: 'cylinder', r: PIN_R, h: r3(DRIVER), axis: 'y', at: [0, r3(DRIVER / 2), 0] }] },
        fill: 'warm', finish: 'steel',
      },
      ...COILS.map((f, j): SpecPart => ({
        id: `coil-${i + 1}${j + 1}`, name: '弹簧', parent: 'housing', at: [x, coilY(rest.driver, f), 0], rot: [0, 0, 12],
        shape: { type: 'cylinder', r: 1.3, h: 0.35, axis: 'y' }, fill: 'dark', finish: 'steel',
      })),
    ]
  })
}

/** 插入钥匙这一步：钥匙推到底，每摞弹子按拟合的路径被顶起、滑过、落进齿槽 */
function insert(keyId: string, bitting: number[], fit: typeof FIT.right): Record<string, PartState> {
  const s: Record<string, PartState> = { [keyId]: { visible: true, at: [0, r3(YB - YP), 0], ...KEY_MOVE } }
  bitting.forEach((n, i) => {
    const x = r3(pinX(i))
    const { delay, dur, A, B } = fit[i]
    const to = tipAt(YB + depth(n) + 0.06, i)
    const via = (YB + REST + YB + depth(n) + 0.06) / 2 + A
    const off = to.driver - to.kpin
    s[`kpin-${i + 1}`] = { at: [x, r3(to.kpin - YP), 0], via: [x, r3(via), 0], lift: B, delay, dur }
    s[`driver-${i + 1}`] = { at: [x, r3(to.driver), 0], via: [x, r3(via + off), 0], lift: B, delay, dur }
    COILS.forEach((f, j) => {
      s[`coil-${i + 1}${j + 1}`] = { at: [x, coilY(to.driver, f), 0], via: [x, coilY(via + off, f), 0], lift: r3((1 - f) * B), delay, dur }
    })
  })
  return s
}

const FRONT = { target: [10, 19, 0] as Vec3, dir: [0.08, 0.1, 1] as Vec3, dist: 125 }
const PINS_ZOOM = (caption: string) => ({ target: [r3(pinX(2)), YS, 0] as Vec3, dir: [0.05, 0.05, 1] as Vec3, dist: 42, caption })

export const mechPinTumbler: ManualSpec = {
  id: 'mech-pin-tumbler',
  name: '弹子锁：锁芯怎么开',
  desc: '剖开一个 5 弹子锁芯：上下弹子卡住剪切线，对的钥匙把每颗弹子顶到刚好齐平，锁芯才转得动。',
  category: '机械结构',
  genre: 'tutorial',
  dims: { width: 90, depth: 20, height: Math.round(YH) },
  source: { title: 'Wikipedia · Pin tumbler lock', url: 'https://en.wikipedia.org/wiki/Pin_tumbler_lock', images: [] },
  package: [
    { name: '锁壳（剖开）', qty: 1, spec: '5 个弹子孔' },
    { name: '锁芯', qty: 1, spec: `ø${(2 * PLUG_R).toFixed(1)} mm（.500"）· 尾部拨片` },
    { name: '下弹子', qty: 5, spec: `ø${(2 * PIN_R).toFixed(2)} mm · 尖头 100° · 长短按钥匙配` },
    { name: '上弹子', qty: 5, spec: `ø${(2 * PIN_R).toFixed(2)} mm · 长 ${DRIVER.toFixed(2)} mm（推断）` },
    { name: '弹簧', qty: 5 },
    { name: '钥匙', qty: 1, spec: `齿深 ${BITTING.join('-')}` },
    { name: '不对的钥匙', qty: 1, spec: `齿深 ${WRONG.join('-')}` },
  ],
  params: [
    { label: '弹子数', value: '5 颗（Schlage 经典款，也有 6 颗的）', note: '每颗弹子 = 下弹子 + 上弹子 + 弹簧' },
    { label: '弹子间距', value: `.156" ≈ ${SPACING.toFixed(2)} mm`, note: `第一刀离钥匙肩 .231" ≈ ${FIRST.toFixed(2)} mm` },
    { label: '齿深一级', value: `Schlage .015" ≈ ${INC.toFixed(3)} mm（0–9 级）`, note: 'Kwikset 是 .023" ≈ 0.584 mm（1–7 级）' },
    { label: '剪切线', value: `锁芯外圆 ø${(2 * PLUG_R).toFixed(1)} mm`, note: '锁芯和锁壳的分界：所有弹子的分缝都对齐它，锁芯才能转' },
    { label: '下弹子长度', value: '.165" + 级数 × .015"', note: '齿根高度 + 下弹子长度 = 锁芯直径，所以对的钥匙刚好齐平' },
    { label: '理论组合', value: '10⁵ = 10 万种', note: '实际要扣掉相邻齿深差太大（Schlage 最多差 7 级）切不出来的组合' },
    { label: '防盗等级', value: 'GA/T 73-2015：A / B / C 级', note: '防技术开启时间 ≥ 1 / 5 / 10 分钟；互开率 A 级 ≤ 0.03%、B / C 级 ≤ 0.01%' },
  ],
  parts: [
    {
      id: 'housing', name: '锁壳（剖开）', spec: '5 个弹子孔',
      shape: {
        type: 'compound',
        items: [
          xySection(comb(), -CH_R, 0),
          { type: 'box', size: [W, r3(YH - YP - BORE_R), r3(6.6 - CH_R)], at: [XM, r3((YP + BORE_R + YH) / 2), r3(-(6.6 + CH_R) / 2)] },
          { type: 'box', size: [W, r3(YH), 1.9], at: [XM, r3(YH / 2), -7.55] },
          { type: 'box', size: [W, r3(YP - BORE_R), 6.6], at: [XM, r3((YP - BORE_R) / 2), -3.3] },
        ],
      },
      fill: 'shade', finish: BRASS,
    },
    {
      id: 'plug', name: '锁芯', spec: `ø${(2 * PLUG_R).toFixed(1)} mm`, parent: 'housing', at: [0, YP, 0],
      shape: {
        type: 'compound',
        items: [
          xSection(FLANGE, 0, X_FRONT),
          xSection(SLAB, X_FRONT, X_BACK),
          ...stripGaps().map(([a, b]) => xSection(STRIP, a, b)),
          { type: 'box', size: [2.4, 9, 4], at: [X_BACK + 1.2, -4.5, -1], finish: 'steel' },
        ],
      },
      fill: 'white', finish: BRASS,
    },
    {
      id: 'shear', name: '剪切线', parent: 'housing', at: [15, r3(YS + 0.05), 1.7], visible: false,
      shape: { type: 'box', size: [34, 0.3, 0.3] }, fill: 'white', finish: { color: '#e5484d' },
    },
    ...pinParts(),
    keyPart('key', '钥匙', BITTING, false),
    keyPart('key-wrong', '不对的钥匙', WRONG, false),
  ],
  stageSize: 200,
  guides: [
    {
      id: 'open',
      title: '对的钥匙怎么开锁',
      kind: 'usage',
      steps: [
        {
          id: 'locked', title: '锁着：上弹子卡在剪切线上',
          desc: '锁芯（白色）能在锁壳里转，但每个孔里都有一摞弹子：下弹子、上弹子、弹簧。弹簧把上弹子压下来，一半在锁壳、一半在锁芯，正好卡在两者的分界 —— 剪切线上，锁芯就转不动。',
          camera: FRONT,
          set: { shear: { visible: true } },
          highlight: ['driver-1', 'driver-2', 'driver-3', 'driver-4', 'driver-5', 'shear'],
          callouts: [
            { part: 'housing', text: '锁壳', at: [8, YH, 0], offset: [-4, 9, 0] },
            { part: 'plug', text: '锁芯', at: [X_BACK - 3, -3, 0], offset: [14, -8, 0] },
            { part: 'driver-1', text: '上弹子', at: [0, DRIVER / 2, 0], offset: [-14, 8, 0] },
            { part: 'kpin-1', text: '下弹子', at: [0, 2, 0], offset: [-14, -6, 0] },
            { part: 'coil-52', text: '弹簧', offset: [12, 8, 0] },
            { part: 'shear', text: '剪切线', at: [-17, 0, 0], offset: [-10, 0, 0] },
          ],
          zoom: PINS_ZOOM('上弹子跨在剪切线上，锁芯被卡住'),
          chips: [{ label: '弹子', sub: '5 摞' }, { label: '锁芯直径', sub: '12.7 mm' }],
        },
        {
          id: 'insert', title: '插入钥匙：弹子被顶到剪切线',
          desc: `钥匙尖把弹子一颗颗顶起来，滑过齿形，最后每颗下弹子落进自己的齿槽。齿槽深浅（这把是 ${BITTING.join('-')}）正好和下弹子的长短配对：五个分缝全都齐平剪切线。`,
          camera: { ...FRONT, target: [-6, 17, 0], dist: 150 },
          set: insert('key', BITTING, FIT.right),
          highlight: ['key', 'kpin-1', 'kpin-2', 'kpin-3', 'kpin-4', 'kpin-5'],
          zoom: PINS_ZOOM('五颗下弹子的上沿都在剪切线上'),
          chips: [{ label: '齿深一级', sub: `${INC.toFixed(3)} mm` }, { label: '这把钥匙', sub: BITTING.join('-') }],
          tip: '齿越深（号数越大），配的下弹子越长 —— 两者加起来总是 12.7 mm。',
        },
        {
          id: 'turn', title: '转动钥匙：锁芯转起来',
          desc: '分缝都对齐了，剪切线上没有东西挡着：拧钥匙，锁芯带着下弹子一起转，上弹子留在锁壳里。锁芯尾部的拨片跟着转，拉动锁舌，门就开了。',
          camera: { target: [12, 15, 0], dir: [-0.6, 0.55, 1], dist: 140 },
          set: { shear: { visible: false }, plug: { rot: [90, 0, 0], arc: { at: [0, YP, 0], axis: [1, 0, 0] }, delay: 0.2, dur: 1.6 } },
          highlight: ['plug', 'key'],
          callouts: [
            { part: 'housing', text: '上弹子留在锁壳里', at: [r3(pinX(2)), YS + 3, 0], offset: [6, 12, 0] },
            { part: 'plug', text: '拨片', at: [X_BACK + 1.2, -8, -1], offset: [14, -4, 0] },
          ],
          chips: [{ label: '转角', sub: '约 90°' }],
        },
        {
          id: 'numbers', title: '数字：为什么钥匙能有那么多种',
          desc: `5 个位置、每个位置 10 级深度（一级 ${INC.toFixed(3)} mm），理论上有 10 万种齿形。实际要去掉相邻两刀深度差太大、切不出来的组合，还要给万能钥匙等留余量，所以一个品牌能用的组合比这少得多。`,
          camera: { ...FRONT, target: [-6, 17, 0], dist: 150 },
          set: { plug: { rot: [0, 0, 0], arc: { at: [0, YP, 0], axis: [-1, 0, 0] }, delay: 0.1, dur: 1.2 } },
          highlight: ['key'],
          chips: [
            { label: 'Schlage', sub: '.015" ≈ 0.381 mm / 级' },
            { label: 'Kwikset', sub: '.023" ≈ 0.584 mm / 级' },
            { label: '组合', sub: '10⁵ 种（理论）' },
          ],
        },
      ],
    },
    {
      id: 'wrong',
      title: '钥匙不对会怎样',
      kind: 'usage',
      start: { 'key-wrong': { visible: true } },
      steps: [
        {
          id: 'wrong-insert', title: '插一把不对的钥匙',
          desc: `这把钥匙是 ${WRONG.join('-')}：第 2 刀浅了 3 级，下弹子被顶过了剪切线；第 5 刀深了 3 级，下弹子落得太低，上弹子还有一截留在锁芯里。只差 1.14 mm，两处都卡住。`,
          camera: { ...FRONT, target: [-6, 17, 0], dist: 150 },
          set: { shear: { visible: true }, ...insert('key-wrong', WRONG, FIT.wrong) },
          highlight: ['key-wrong', 'kpin-2', 'driver-5'],
          callouts: [
            { part: 'kpin-2', text: '下弹子顶过头', at: [0, 6.5, 0], offset: [-12, 9, 0] },
            { part: 'driver-5', text: '上弹子没顶上', at: [0, 1, 0], offset: [5, 10, 0] },
          ],
          zoom: PINS_ZOOM('第 2、5 颗的分缝不在剪切线上'),
          chips: [{ label: '对的', sub: BITTING.join('-') }, { label: '这把', sub: WRONG.join('-') }],
        },
        {
          id: 'wrong-turn', title: '拧不动',
          desc: '拧钥匙时，第 2 颗的下弹子和第 5 颗的上弹子都横跨在剪切线上，像两根销子把锁芯和锁壳别在一起，锁芯只能晃一点点。',
          camera: { ...FRONT, dist: 110 },
          highlight: ['kpin-2', 'driver-5'],
          actions: [{ type: 'swing', part: 'plug', axis: 'x', amp: 2.5, period: 0.6 }],
          zoom: PINS_ZOOM('跨在剪切线上的弹子挡住了锁芯'),
        },
        {
          id: 'security', title: '技术开启和防盗等级',
          desc: '零件总有加工误差：锁芯被轻轻拧住时，弹子孔并不完全在一条线上，总有一颗先被别住。技术开启就是利用这一点，把弹子一颗颗挑到剪切线。所以防盗锁芯会加异形弹子、侧边弹子、多排弹子，让这件事慢得多。',
          camera: { ...FRONT, dist: 110 },
          set: { shear: { visible: false } },
          highlight: ['driver-1', 'driver-2', 'driver-3', 'driver-4', 'driver-5'],
          zoom: PINS_ZOOM('上弹子：防盗锁芯常把它做成蘑菇形、花生形'),
          chips: [
            { label: 'A 级', sub: '防技术开启 ≥ 1 分钟' },
            { label: 'B 级', sub: '≥ 5 分钟' },
            { label: 'C 级', sub: '≥ 10 分钟' },
          ],
          tip: '等级出自公安部标准 GA/T 73-2015《机械防盗锁》，买锁芯时看包装上的等级标注。',
        },
      ],
    },
  ],
}
