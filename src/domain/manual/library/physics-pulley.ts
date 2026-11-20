import type { Action, CableEnd, CameraSpec, Fill, Finish, ManualSpec, Shape, SpecPart, Vec3 } from '../types'

/**
 * 滑轮：龙门架横梁下挂三套装置，物体都是 G = 60 N，绳端各挂一个弹簧测力计。
 *   左 A：一个定滑轮（F = G，s = h，只改变方向）
 *   中 B：一个动滑轮（F = G / 2，s = 2h）
 *   右 C：两个定滑轮 + 两个动滑轮，吊着动滑轮的绳子 n = 4 段（F = G / n，s = n·h）
 * 参考 UW–Madison Ingersoll Wonders of Physics 展品 Pulleys：机械利益 = 吊着物体的绳子段数，拉出的绳长 = 升高 × 段数。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。绳子在 z = 0 的平面里。
 * 滑轮槽半径 RR（绳子中心线），定滑轮轴心 y = Y_AX；绕过轮槽的半圈绳挂在滑轮架（不转）上，用三次贝塞尔近似半圆。
 * 拉动是同周期、同相位的 slide：物体升 h 时绳端走 n·h，轮子按绳速转（角度 = 绳走的距离 / RR）。
 * 不计滑轮重和摩擦（理想滑轮）。
 */

type Item = Extract<Shape, { type: 'compound' }>['items'][number]
interface Opt { rot?: Vec3; fill?: Fill; finish?: Finish }
const box = (size: Vec3, at: Vec3, o: Opt & { chamfer?: number } = {}): Item => ({ type: 'box', size, at, ...o })
const cyl = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', o: Opt & { r2?: number } = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...o })
const txt = (text: string, size: number, at: Vec3, o: Opt = {}): Item => ({ type: 'text', text, size, at, ...o })

const DEG = Math.PI / 180
const r2 = (v: number) => Math.round(v * 100) / 100

const RED: Finish = { color: '#d6452c', roughness: 0.5 }
const ROPE: Finish = { color: '#d9c7a0', roughness: 0.9 }
const FRAME: Finish = { color: '#55606c', roughness: 0.5, metalness: 0.5 }
const IRON: Finish = { color: '#4a4d52', roughness: 0.55, metalness: 0.6 }

// ---------- 尺寸 ----------

const G = 60
const H = 100
const RR = 31.5
const Y_BAR = 900
const Y_AX = 838
const Y_ANCHOR = Y_BAR - 16
const XA = -480
const XB = -90
const XC = 230
const UP: Vec3 = [0, 1, 0]
const DOWN: Vec3 = [0, -1, 0]
/** 两端切线同向、相距 2r 时，控制柄 = 4r / 3 才是半圆：0.42 × 2r × slack = 4r / 3 */
const WRAP = r2(4 / 3 / 0.84)

// ---------- 形体 ----------

const SHEAVE: Shape = {
  type: 'compound',
  items: [
    cyl(29, 12, [0, 0, 0], 'z'),
    cyl(37, 2, [0, 0, 7], 'z'),
    cyl(37, 2, [0, 0, -7], 'z'),
    ...[90, 210, 330].map((a) => cyl(4.5, 16.4, [r2(17 * Math.cos(a * DEG)), r2(17 * Math.sin(a * DEG)), 0], 'z', { fill: 'dark', finish: 'hole' })),
  ],
}

/** 滑轮架：每个轮子两侧一对窄夹板 + 轴；up = 1 夹板往上接横梁（定滑轮），-1 往下接挂钩（动滑轮） */
function block(xs: number[], up: 1 | -1): Shape {
  const span = Math.max(...xs) - Math.min(...xs) + 20
  const items: Item[] = []
  for (const x of xs) items.push(box([16, 68, 3], [x, up * 22, 10.5]), box([16, 68, 3], [x, up * 22, -10.5]), cyl(4, 24, [x, 0, 0], 'z'))
  items.push(box([span, 6, 26], [0, up * 59, 0]))
  if (up < 0) items.push(box([6, 12, 4], [0, -68, 0]))
  return { type: 'compound', items }
}
const HOOK = -74

const LOAD: Shape = {
  type: 'compound',
  items: [
    box([10, 12, 4], [0, -6, 0], { fill: 'shade', finish: 'steel' }),
    cyl(14, 6, [0, -15, 0]),
    box([72, 130, 46], [0, -83, 0], { chamfer: 4 }),
    txt(`G = ${G} N`, 11, [0, -83, 23.4]),
  ],
}

/** 弹簧测力计：原点在挂绳的钩子尖；s = -1 秤身朝下（往下拉），1 朝上（往上拉） */
function scale(reading: string, s: 1 | -1): Shape {
  const y = (v: number) => s * v
  return {
    type: 'compound',
    items: [
      box([3, 14, 3], [0, y(7), 0], { fill: 'shade', finish: 'steel' }),
      box([34, 140, 14], [0, y(84), 0], { chamfer: 3 }),
      { type: 'hole', w: 12, h: 92, r: 3, at: [0, y(96), 7.1] },
      box([16, 2, 1], [0, y(70), 7.6], { fill: 'dark', finish: RED }),
      txt(reading, 8, [0, y(32), 7.4]),
      cyl(10, 3, [0, y(164), 0], 'z', { fill: 'shade', finish: 'steel' }),
    ],
  }
}

const end = (part: string, at: Vec3, dir: Vec3): CableEnd => ({ part, at, dir })
const rope = (id: string, name: string, from: CableEnd, to: CableEnd, slack?: number): SpecPart => ({
  id, name, shape: { type: 'cable', from, to, r: 2.5, ...(slack ? { slack } : {}) }, fill: 'warm', finish: ROPE,
})
const ruler = (id: string, name: string, at: Vec3, len: number): SpecPart => ({
  id, name,
  shape: { type: 'compound', items: [box([2, len, 2], [0, len / 2, 0]), box([14, 2, 2], [0, 1, 0]), box([14, 2, 2], [0, len - 1, 0])] },
  at, fill: 'dark', finish: RED, visible: false,
})
const lever = (id: string, parent: string): SpecPart => ({
  id, name: '把滑轮看成杠杆', parent, shape: { type: 'box', size: [2 * RR, 3, 1.2] }, at: [0, 0, 13.5], fill: 'dark', finish: RED, visible: false,
})

// ---------- 零件 ----------

const gantry: SpecPart = {
  id: 'frame', name: '龙门架', spec: '1.5 m × 0.94 m 钢架',
  shape: {
    type: 'compound',
    items: [
      box([1500, 40, 40], [0, Y_BAR + 20, 0]),
      ...[-720, 720].flatMap((x) => [box([40, Y_BAR - 20, 40], [x, 20 + (Y_BAR - 20) / 2, 0]), box([90, 20, 320], [x, 10, 0])]),
      box([14, 16, 14], [XB - RR, Y_BAR - 8, 0]),
      box([14, 16, 14], [XC - RR, Y_BAR - 8, 0]),
      txt('定滑轮', 16, [XA, Y_BAR + 20, 20.4], { fill: 'white' }),
      txt('动滑轮', 16, [XB, Y_BAR + 20, 20.4], { fill: 'white' }),
      txt('滑轮组 n = 4', 16, [XC + 3 * RR, Y_BAR + 20, 20.4], { fill: 'white' }),
    ],
  },
  fill: 'shade', finish: FRAME,
}

const sheave = (id: string, parent: string, x = 0): SpecPart => ({ id, name: '滑轮', spec: `Ø74 mm · 槽径 ${2 * RR} mm`, parent, shape: SHEAVE, at: [x, 0, 0], fill: 'white', finish: 'plastic-white' })

const rigA: SpecPart[] = [
  { id: 'ta', name: '定滑轮架', spec: '轴固定在横梁上', shape: block([0], 1), at: [XA, Y_AX, 0], fill: 'shade', finish: 'steel' },
  sheave('ta-s', 'ta'),
  { id: 'la', name: '物体 A', spec: `G = ${G} N`, shape: LOAD, at: [XA - RR, 330, 0], fill: 'shade', finish: IRON },
  { id: 'sa', name: '测力计 A', spec: `读数 ${G} N`, shape: scale(`${G} N`, -1), at: [XA + RR, 640, 0], fill: 'white', finish: 'plastic-white' },
  rope('ra1', '绳子（吊物体）', end('la', [0, 0, 0], UP), end('ta', [-RR, 0, 0], DOWN)),
  rope('ra-w', '绳子（绕过滑轮）', end('ta', [-RR, 0, 0], UP), end('ta', [RR, 0, 0], UP), WRAP),
  rope('ra2', '绳子（手拉的一端）', end('ta', [RR, 0, 0], DOWN), end('sa', [0, 0, 0], UP)),
  ruler('ha', '物体升高 h', [XA - RR - 58, 330, 0], H),
  ruler('sa-len', '绳端拉下 s', [XA + RR + 32, 640 - H, 0], H),
  lever('ta-arm', 'ta'),
]

const rigB: SpecPart[] = [
  { id: 'mb', name: '动滑轮架', spec: '和物体一起升降', shape: block([0], -1), at: [XB, 380, 0], fill: 'shade', finish: 'steel' },
  sheave('mb-s', 'mb'),
  { id: 'lb', name: '物体 B', spec: `G = ${G} N`, parent: 'mb', shape: LOAD, at: [0, HOOK, 0], fill: 'shade', finish: IRON },
  { id: 'sb', name: '测力计 B', spec: `读数 ${G / 2} N`, shape: scale(`${G / 2} N`, 1), at: [XB + RR, 500, 0], fill: 'white', finish: 'plastic-white' },
  rope('rb1', '绳子（固定在横梁）', end('frame', [XB - RR, Y_ANCHOR, 0], DOWN), end('mb', [-RR, 0, 0], UP)),
  rope('rb-w', '绳子（绕过动滑轮）', end('mb', [-RR, 0, 0], DOWN), end('mb', [RR, 0, 0], DOWN), WRAP),
  rope('rb2', '绳子（手拉的一端）', end('mb', [RR, 0, 0], UP), end('sb', [0, 0, 0], DOWN)),
  ruler('hb', '物体升高 h', [XB - 58, 380 + HOOK, 0], H),
  ruler('sb-len', '绳端拉上 s', [XB + RR + 32, 500, 0], 2 * H),
  lever('mb-arm', 'mb'),
]

const XT = XC + 4 * RR
const XM = XC + 2 * RR
const XS = XC + 7 * RR
const numItems: Item[] = [-3, -1, 1, 3].map((k, i) => txt(String(i + 1), 14, [k * RR + 13, 70, 3], { fill: 'dark' }))
const rigC: SpecPart[] = [
  { id: 'tc', name: '定滑轮组（上）', spec: '两个轮子同轴架', shape: block([-2 * RR, 2 * RR], 1), at: [XT, Y_AX, 0], fill: 'shade', finish: 'steel' },
  sheave('tc-1', 'tc', -2 * RR),
  sheave('tc-2', 'tc', 2 * RR),
  { id: 'bc', name: '动滑轮组（下）', spec: '两个轮子，挂物体', shape: block([-2 * RR, 2 * RR], -1), at: [XM, 420, 0], fill: 'shade', finish: 'steel' },
  sheave('bc-1', 'bc', -2 * RR),
  sheave('bc-2', 'bc', 2 * RR),
  { id: 'lc', name: '物体 C', spec: `G = ${G} N`, parent: 'bc', shape: LOAD, at: [0, HOOK, 0], fill: 'shade', finish: IRON },
  { id: 'sc', name: '测力计 C', spec: `读数 ${G / 4} N`, shape: scale(`${G / 4} N`, -1), at: [XS, 700, 0], fill: 'white', finish: 'plastic-white' },
  rope('c1', '第 1 段绳', end('frame', [XC - RR, Y_ANCHOR, 0], DOWN), end('bc', [-3 * RR, 0, 0], UP)),
  rope('c1w', '绳子（绕下轮 1）', end('bc', [-3 * RR, 0, 0], DOWN), end('bc', [-RR, 0, 0], DOWN), WRAP),
  rope('c2', '第 2 段绳', end('bc', [-RR, 0, 0], UP), end('tc', [-3 * RR, 0, 0], DOWN)),
  rope('c2w', '绳子（绕上轮 1）', end('tc', [-3 * RR, 0, 0], UP), end('tc', [-RR, 0, 0], UP), WRAP),
  rope('c3', '第 3 段绳', end('tc', [-RR, 0, 0], DOWN), end('bc', [RR, 0, 0], UP)),
  rope('c3w', '绳子（绕下轮 2）', end('bc', [RR, 0, 0], DOWN), end('bc', [3 * RR, 0, 0], DOWN), WRAP),
  rope('c4', '第 4 段绳', end('bc', [3 * RR, 0, 0], UP), end('tc', [RR, 0, 0], DOWN)),
  rope('c4w', '绳子（绕上轮 2）', end('tc', [RR, 0, 0], UP), end('tc', [3 * RR, 0, 0], UP), WRAP),
  rope('c5', '绳子（手拉的一端）', end('tc', [3 * RR, 0, 0], DOWN), end('sc', [0, 0, 0], UP)),
  { id: 'bc-num', name: '绳段编号', parent: 'bc', shape: { type: 'compound', items: numItems }, fill: 'dark', visible: false },
  ruler('hc', '物体升高 h', [XC - RR - 30, 420 + HOOK, 0], H),
  ruler('sc-len', '绳端拉下 s', [XS + 32, 700 - 4 * H, 0], 4 * H),
]

// ---------- 动作 ----------

const P = 3
/** 绳子走 mm 毫米，轮子转过的角度（度）；正 = 逆时针（从 +z 看） */
const turn = (mm: number) => r2(mm / RR / DEG)
const slide = (part: string, amp: number): Action => ({ type: 'slide', part, axis: 'y', amp, period: P, clip: 'pos' })
const roll = (part: string, mm: number): Action => ({ type: 'swing', part, axis: 'z', amp: turn(mm), period: P, clip: 'pos' })
const pullA: Action[] = [slide('la', H), slide('sa', -H), roll('ta-s', -H)]
const pullB: Action[] = [slide('mb', H), slide('sb', 2 * H), roll('mb-s', H)]
const pullC: Action[] = [slide('bc', H), slide('sc', -4 * H), roll('bc-1', H), roll('tc-1', -2 * H), roll('bc-2', 3 * H), roll('tc-2', -4 * H)]

const view = (x: number, dist = 1650): CameraSpec => ({ target: [x, 560, 0], dir: [0.2, 0.22, 1], dist })
const WIDE: CameraSpec = { target: [0, 500, 0], dir: [0.15, 0.25, 1], dist: 2300 }

export const physicsPulley: ManualSpec = {
  id: 'physics-pulley',
  name: '滑轮与滑轮组：F = G / n',
  desc: '同样 60 N 的物体，定滑轮拉 60 N、动滑轮拉 30 N、四段绳的滑轮组只拉 15 N，代价是绳子要多拉 n 倍。',
  category: '物理原理',
  genre: 'tutorial',
  dims: { width: 1500, depth: 320, height: 940 },
  source: { title: 'UW–Madison · Wonders of Physics (L. R. Ingersoll Museum) · Pulleys', url: 'https://www.physics.wisc.edu/ingersollmuseum/exhibits/mechanics/pulleys/', images: [] },
  package: [
    { name: '龙门架', qty: 1, spec: '横梁下有两个系绳点' },
    { name: '滑轮', qty: 6, spec: 'Ø74 mm 尼龙轮，带夹板和轴' },
    { name: '细绳', qty: 3, spec: 'Ø5 mm' },
    { name: '6 kg 钩码', qty: 3, spec: `重力 G ≈ ${G} N` },
    { name: '弹簧测力计', qty: 3, spec: '0 – 100 N' },
    { name: '刻度尺', qty: 1, spec: '量 h 和 s' },
  ],
  params: [
    { label: '定滑轮', value: 'F = G，s = h', note: '轴不动；不省力，只改变用力方向（实质是等臂杠杆）' },
    { label: '动滑轮', value: 'F = G / 2，s = 2h', note: '轴随物体移动；省一半力，费一倍距离（动力臂 = 2 × 阻力臂）' },
    { label: '滑轮组', value: 'F = G / n，s = n·h', note: 'n = 直接连着动滑轮的绳子段数；本例 n = 4' },
    { label: '演示数据', value: `G = ${G} N，h = 10 cm`, note: '定 60 N × 10 cm · 动 30 N × 20 cm · 组 15 N × 40 cm' },
    { label: '功', value: 'W = F·s = G·h = 6 J', note: '理想滑轮省力不省功' },
    { label: '考虑滑轮重', value: 'F = (G + G动) / n', note: '还有摩擦，实际拉力比理想值大，机械效率 η = Gh / Fs < 1' },
  ],
  parts: [gantry, ...rigA, ...rigB, ...rigC],
  stageSize: 2200,
  finishes: { white: 'plastic-white', shade: 'steel', dark: 'plastic-black', warm: 'wood' },
  guides: [
    {
      id: 'fixed',
      title: '定滑轮：只改变方向',
      kind: 'usage',
      steps: [
        {
          id: 'overview', title: '三套滑轮，吊同样重的物体',
          desc: `龙门架下挂着三套装置：左边一个定滑轮，中间一个动滑轮，右边是两个定滑轮加两个动滑轮组成的滑轮组。三个物体一样重，G = ${G} N（约 6 kg）。绳子末端都挂着弹簧测力计，它的读数就是手要用的拉力 F。`,
          camera: WIDE, highlight: ['sa', 'sb', 'sc'],
          callouts: [
            { part: 'sa', text: `F = ${G} N`, sub: '定滑轮', at: [0, -84, 7], offset: [70, -40, 0] },
            { part: 'sb', text: `F = ${G / 2} N`, sub: '动滑轮', at: [0, 84, 7], offset: [80, 60, 0] },
            { part: 'sc', text: `F = ${G / 4} N`, sub: '滑轮组', at: [0, -84, 7], offset: [100, -40, 0] },
            { part: 'lb', text: `G = ${G} N`, sub: '三个物体一样重', at: [0, -83, 23], offset: [-150, -80, 0] },
          ],
          chips: [{ label: '物体', sub: `G = ${G} N` }, { label: '理想滑轮', sub: '不计滑轮重和摩擦' }],
        },
        {
          id: 'fixed-intro', title: '定滑轮：轴固定在架子上',
          desc: `左边这个滑轮的轴用夹板固定在横梁上，轮子只能原地转。绳子一头吊着物体，绕过轮槽，另一头往下拉。测力计读数 ${G} N，和物体的重力一样大。`,
          camera: view(XA), highlight: ['ta', 'ta-s'],
          callouts: [
            { part: 'ta', text: '定滑轮', sub: '轴不动，轮子原地转', at: [0, 40, 0], offset: [-170, 20, 0] },
            { part: 'la', text: `G = ${G} N`, at: [-36, -83, 23], offset: [-110, 0, 0] },
            { part: 'sa', text: `F = ${G} N`, sub: '测力计读数', at: [17, -84, 7], offset: [110, 0, 0] },
          ],
          zoom: { target: [XA, Y_AX, 0], dir: [0.15, 0.15, 1], dist: 330, caption: '绳子嵌在轮槽里' },
        },
        {
          id: 'fixed-pull', title: '往下拉 10 cm，物体升 10 cm',
          desc: '手往下拉绳子，绳子绕过滑轮把物体往上提。绳端拉下去多少，物体就升起多少：s = h = 10 cm。定滑轮不省力也不费距离，它的好处是把「往上提」变成「往下拉」—— 改变了用力的方向。',
          camera: view(XA),
          set: { ha: { visible: true }, 'sa-len': { visible: true } },
          highlight: ['la', 'sa', 'ta-s'], actions: pullA,
          callouts: [
            { part: 'ha', text: 'h = 10 cm', at: [0, H / 2, 0], offset: [-110, 0, 0] },
            { part: 'sa-len', text: 's = 10 cm', at: [0, H / 2, 0], offset: [110, 0, 0] },
          ],
          chips: [{ label: '拉力', sub: `F = G = ${G} N` }, { label: '距离', sub: 's = h' }, { label: '用处', sub: '改变方向：升旗、拉窗帘' }],
        },
        {
          id: 'fixed-lever', title: '实质：等臂杠杆',
          desc: '把滑轮看成一根绕轴转动的杠杆：支点是轴心，两边绳子都沿轮槽的切线拉，力臂都是轮子半径 r。L₁ = L₂，所以 F = G —— 定滑轮就是一个等臂杠杆。',
          camera: { target: [XA, Y_AX - 20, 0], dir: [0.15, 0.15, 1], dist: 560 },
          set: { 'ta-arm': { visible: true } }, highlight: ['ta-arm'],
          callouts: [
            { part: 'ta-arm', text: '支点 O', sub: '轴心', at: [0, 0, 0.6], offset: [0, -140, 0] },
            { part: 'ta-arm', text: 'L₂ = r', sub: `物体 ${G} N`, at: [-RR / 2, 0, 0.6], offset: [-120, -60, 0] },
            { part: 'ta-arm', text: 'L₁ = r', sub: `拉力 ${G} N`, at: [RR / 2, 0, 0.6], offset: [120, -60, 0] },
          ],
          chips: [{ label: '等臂杠杆', sub: 'L₁ = L₂ = r' }, { label: '所以', sub: 'F = G' }],
        },
      ],
    },
    {
      id: 'movable',
      title: '动滑轮：省一半力',
      kind: 'usage',
      steps: [
        {
          id: 'movable-intro', title: '动滑轮：跟着物体一起升降',
          desc: `中间这套的绳子一头系在横梁上，往下绕过滑轮，另一头往上拉。物体挂在滑轮的钩子上，滑轮和物体一起动，所以叫动滑轮。测力计只读 ${G / 2} N。`,
          camera: view(XB), highlight: ['mb', 'mb-s'],
          callouts: [
            { part: 'frame', text: '绳子固定端', sub: '系在横梁上', at: [XB - RR, Y_ANCHOR, 7], offset: [-160, -30, 0] },
            { part: 'mb', text: '动滑轮', sub: '和物体一起动', at: [-37, 0, 0], offset: [-150, 0, 0] },
            { part: 'lb', text: `G = ${G} N`, at: [-36, -83, 23], offset: [-110, -20, 0] },
            { part: 'sb', text: `F = ${G / 2} N`, sub: '测力计读数', at: [17, 84, 7], offset: [110, 0, 0] },
          ],
        },
        {
          id: 'movable-pull', title: '往上拉 20 cm，物体升 10 cm',
          desc: '往上拉绳子，动滑轮带着物体上升。物体升 10 cm 时，滑轮左右两段绳子都要缩短 10 cm，这 20 cm 绳子全从手这边抽出：s = 2h。省了一半的力，就得多拉一倍的绳子。',
          camera: view(XB),
          set: { hb: { visible: true }, 'sb-len': { visible: true } },
          highlight: ['mb', 'lb', 'sb', 'mb-s'], actions: pullB,
          callouts: [
            { part: 'hb', text: 'h = 10 cm', at: [0, H / 2, 0], offset: [-110, 0, 0] },
            { part: 'sb-len', text: 's = 20 cm', at: [0, H, 0], offset: [110, 0, 0] },
          ],
          chips: [{ label: '拉力', sub: `F = G / 2 = ${G / 2} N` }, { label: '距离', sub: 's = 2h = 20 cm' }],
        },
        {
          id: 'movable-why', title: '两段绳子一起吊着它',
          desc: '动滑轮被左右两段绳子吊着，每段绳子的拉力都是 F，合起来 2F = G，所以 F = G / 2。也能看成杠杆：支点在左边绳子和轮子相切的地方，物体挂在轴心（阻力臂 r），手拉右边（动力臂 2r）—— 动力臂是阻力臂 2 倍的省力杠杆。',
          camera: { target: [XB, 420, 0], dir: [0.15, 0.15, 1], dist: 900 },
          set: { 'mb-arm': { visible: true }, hb: { visible: false }, 'sb-len': { visible: false } }, highlight: ['rb1', 'rb2', 'mb-arm'],
          callouts: [
            { part: 'mb', text: `${G / 2} N`, sub: '左段绳', at: [-RR, 90, 0], offset: [-110, 30, 0] },
            { part: 'mb', text: `${G / 2} N`, sub: '右段绳（手拉）', at: [RR, 90, 0], offset: [110, 30, 0] },
            { part: 'mb-arm', text: '支点', sub: '左边切点', at: [-RR, 0, 0.6], offset: [-120, -50, 0] },
            { part: 'mb-arm', text: '动力臂 2r', sub: '阻力臂 r', at: [RR / 2, 0, 0.6], offset: [130, -60, 0] },
          ],
          chips: [{ label: '受力', sub: `2F = G = ${G} N` }, { label: '杠杆', sub: 'L₁ = 2r，L₂ = r' }],
          tip: '滑轮自己也有重量：动滑轮重 G动 时，F = (G + G动) / 2，实际读数会比 30 N 大一点。',
        },
      ],
    },
    {
      id: 'tackle',
      title: '滑轮组：F = G / n',
      kind: 'usage',
      steps: [
        {
          id: 'tackle-intro', title: '两个定滑轮 + 两个动滑轮',
          desc: '右边这套：上面的架子装着两个定滑轮，下面的架子装着两个动滑轮，物体挂在下面。一根绳子从横梁上的固定点出发，下、上、下、上来回绕过四个轮子，最后从上面往下拉。',
          camera: view(XC + 110, 1700), highlight: ['tc', 'bc'],
          callouts: [
            { part: 'frame', text: '绳子起点', sub: '系在横梁上', at: [XC - RR, Y_ANCHOR, 7], offset: [-170, -30, 0] },
            { part: 'tc', text: '定滑轮组', sub: '固定在横梁', at: [2 * RR, 40, 0], offset: [170, 10, 0] },
            { part: 'bc', text: '动滑轮组', sub: '挂着物体', at: [-2 * RR - 37, 0, 0], offset: [-150, 0, 0] },
            { part: 'sc', text: `F = ${G / 4} N`, sub: '测力计读数', at: [17, -84, 7], offset: [110, 0, 0] },
          ],
        },
        {
          id: 'tackle-count', title: '数一数：4 段绳子吊着动滑轮',
          desc: `能省多少力，只看直接连着动滑轮（下面那组）的绳子有几段。这里是 4 段，每段的拉力都等于手上的拉力 F：4F = G，F = ${G} N ÷ 4 = ${G / 4} N。最后往下拉的那段连着定滑轮，不算在 n 里。`,
          camera: view(XC + 110, 1500),
          set: { 'bc-num': { visible: true } }, highlight: ['c1', 'c2', 'c3', 'c4', 'bc-num'],
          callouts: [
            { part: 'bc', text: `4 段 × ${G / 4} N = ${G} N`, sub: 'n = 4', at: [-3 * RR, 150, 0], offset: [-120, 60, 0] },
            { part: 'sc', text: `F = ${G / 4} N`, sub: '这段不算', at: [0, -40, 7], offset: [110, 0, 0] },
          ],
          zoom: { target: [XM, 500, 0], dir: [0.1, 0.1, 1], dist: 560, caption: '下面的动滑轮被 4 段绳子吊着' },
          chips: [{ label: 'n', sub: '4 段' }, { label: '拉力', sub: `F = G / n = ${G / 4} N` }],
        },
        {
          id: 'tackle-pull', title: '拉 40 cm，物体只升 10 cm',
          desc: '动滑轮升 10 cm，吊着它的 4 段绳子各缩短 10 cm，手就要拉出 4 × 10 = 40 cm 的绳子：s = n·h。看轮子也能看出来：越靠近手的轮子，绳子走得越快、转得越多。',
          camera: view(XC + 110, 1700),
          set: { hc: { visible: true }, 'sc-len': { visible: true } },
          highlight: ['bc', 'lc', 'sc', 'tc-2'], actions: pullC,
          callouts: [
            { part: 'hc', text: 'h = 10 cm', at: [0, H / 2, 0], offset: [-110, 0, 0] },
            { part: 'sc-len', text: 's = 40 cm', at: [0, 2 * H, 0], offset: [110, 0, 0] },
          ],
          chips: [{ label: '距离', sub: 's = n·h = 40 cm' }, { label: '轮子转速', sub: '1 : 2 : 3 : 4' }],
        },
        {
          id: 'compare', title: '省力，但不省功',
          desc: `三套装置都把 ${G} N 的物体提高 10 cm：定滑轮 60 N × 0.1 m，动滑轮 30 N × 0.2 m，滑轮组 15 N × 0.4 m，手做的功都是 6 J，正好等于 G·h。省了力就要多走距离，任何机械都不省功。`,
          camera: WIDE,
          set: { ha: { visible: true }, 'sa-len': { visible: true }, hb: { visible: true }, 'sb-len': { visible: true } },
          highlight: ['la', 'lb', 'lc'], actions: [...pullA, ...pullB, ...pullC],
          callouts: [
            { part: 'sa-len', text: '60 N × 10 cm', at: [0, H / 2, 0], offset: [90, 0, 0] },
            { part: 'sb-len', text: '30 N × 20 cm', at: [0, H, 0], offset: [90, 0, 0] },
            { part: 'sc-len', text: '15 N × 40 cm', at: [0, 2 * H, 0], offset: [60, 0, 0] },
          ],
          chips: [{ label: '定滑轮', sub: 'W = 6 J' }, { label: '动滑轮', sub: 'W = 6 J' }, { label: '滑轮组', sub: 'W = 6 J' }, { label: 'G·h', sub: '60 N × 0.1 m = 6 J' }],
        },
      ],
    },
  ],
}
