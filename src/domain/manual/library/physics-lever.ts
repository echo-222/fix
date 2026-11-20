import type { Action, CameraSpec, Fill, Finish, ManualSpec, Shape, SpecPart, Vec3 } from '../types'

/**
 * 杠杆：跷跷板式的木横梁架在三角支点上，1 kg 铁块叠在刻度上，演示 F₁L₁ = F₂L₂；
 * 第二个指南用撬棒、独轮车、钓鱼竿三个模型讲三类杠杆。
 * 参考 OpenStax《College Physics 2e》9.5 Simple Machines（MA = 动力臂 / 阻力臂、撬棍 / 独轮车 / 铲子三种杠杆）。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。
 * 横梁：原点在支点尖（横梁底面中点），沿 x，左 = -x；rot z 为正 = 左端下沉。横梁自身重心在支点上，不产生力矩。
 * 倾倒角 TIP 取到横梁一端正好落在底座上。g 取 9.8 N/kg。
 * 三类杠杆的模型（世界坐标）：撬棒在 x ≈ -2700 … -1150，独轮车在 -950 … 640，钓鱼竿在 1150 … 2850。
 * 推断：铁块、横梁、撬棒、独轮车、钓鱼竿尺寸按常见实物估计；撬石头时石块绕右下棱转起，棒尖上的力取「压在棒头上的那部分重力」。
 */

type Item = Extract<Shape, { type: 'compound' }>['items'][number]
interface Opt { rot?: Vec3; fill?: Fill; finish?: Finish }
const box = (size: Vec3, at: Vec3, o: Opt & { chamfer?: number } = {}): Item => ({ type: 'box', size, at, ...o })
const cyl = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', o: Opt & { r2?: number } = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...o })
const txt = (text: string, size: number, at: Vec3, o: Opt = {}): Item => ({ type: 'text', text, size, at, ...o })

const DEG = Math.PI / 180
const r2 = (v: number) => Math.round(v * 100) / 100

// ---------- 材质 ----------

const IRON: Finish = { color: '#4a4d52', roughness: 0.55, metalness: 0.6 }
const RED: Finish = { color: '#d6452c', roughness: 0.5 }
const BRICK_RED: Finish = { color: '#b5553a', roughness: 0.9 }
const STONE: Finish = { color: '#8d8a83', roughness: 0.95 }
const TUB: Finish = { color: '#3f8f5a', roughness: 0.5, metalness: 0.2 }
const SAND: Finish = { color: '#d9b77a', roughness: 1 }
const CORK: Finish = { color: '#b8875a', roughness: 0.8 }
const ROD: Finish = { color: '#1f3b5c', roughness: 0.35, metalness: 0.3 }
const FISH: Finish = { color: '#9fb3bf', roughness: 0.4, metalness: 0.4 }

// ---------- 跷跷板：横梁、支点、铁块 ----------

const BASE_H = 20
const HALF = 500
const BEAM_H = 30
const BEAM_D = 60
const FUL_H = 88
const APEX_Y = BASE_H + FUL_H
/** 一端落到底座上时的倾角（度），取下来一点免得穿进底座 */
const TIP = Math.floor((Math.asin(FUL_H / HALF) / DEG) * 100) / 100
const TOP = BEAM_H

const DISC_R = 35
const DISC_H = 32
function stack(n: number): Shape {
  const items: Item[] = []
  for (let i = 0; i < n; i++) {
    items.push(cyl(DISC_R, DISC_H - 1, [0, i * DISC_H + (DISC_H - 1) / 2, 0]))
    items.push(txt('1 kg', 9, [0, i * DISC_H + DISC_H / 2, DISC_R + 0.4]))
  }
  items.push(cyl(9, 12, [0, n * DISC_H + 6, 0]))
  return { type: 'compound', items }
}

const beamItems: Item[] = [box([2 * HALF, BEAM_H, BEAM_D], [0, BEAM_H / 2, 0])]
for (let x = -450; x <= 450; x += 50) {
  const major = x % 100 === 0
  beamItems.push(box([1.6, major ? 7 : 4, 0.6], [x, BEAM_H - (major ? 3.5 : 2), BEAM_D / 2 + 0.3], { fill: 'dark', finish: 'plastic-black' }))
}
for (let k = 0; k <= 4; k++) for (const s of k ? [-1, 1] : [1]) beamItems.push(txt(String(k * 10), 9, [s * k * 100, 15, BEAM_D / 2 + 0.4]))

/** 力臂：贴在横梁正面下沿的红条，从支点量到铁块中心 */
const arm = (id: string, x: number): SpecPart => ({
  id, name: `力臂 ${Math.abs(x) / 10} cm`, parent: 'beam',
  shape: { type: 'box', size: [Math.abs(x), 3, 1.2] }, at: [x / 2, 4, BEAM_D / 2 + 0.9], fill: 'dark', finish: RED, visible: false,
})

const seesawParts: SpecPart[] = [
  { id: 'base', name: '底座', spec: '1160 × 240 mm 木板', shape: { type: 'slab', w: 1160, d: 240, h: BASE_H, r: 8 }, fill: 'warm', finish: 'wood' },
  {
    id: 'fulcrum', name: '支点（三角支架）', spec: `高 ${FUL_H} mm`,
    shape: { type: 'poly', points: [[-60, 0], [60, 0], [0, FUL_H]], h: 100 }, rot: [-90, 0, 0], at: [0, BASE_H, 50], fill: 'shade', finish: 'steel',
  },
  { id: 'beam', name: '横梁（杠杆）', spec: '1 m 木条 · 刻度每格 10 cm', shape: { type: 'compound', items: beamItems }, at: [0, APEX_Y, 0], fill: 'warm', finish: 'wood' },
  { id: 'w2', name: '2 kg 铁块', spec: '两块 1 kg · 重力 19.6 N', parent: 'beam', shape: stack(2), at: [-300, TOP + 150, 0], fill: 'shade', finish: IRON, visible: false },
  { id: 'w3', name: '3 kg 铁块', spec: '三块 1 kg · 重力 29.4 N', parent: 'beam', shape: stack(3), at: [200, TOP + 150, 0], fill: 'shade', finish: IRON, visible: false },
  arm('arm-l30', -300), arm('arm-r20', 200), arm('arm-r30', 300), arm('arm-l45', -450),
]

// ---------- 第一类：撬棒 ----------

/** 砖块右上棱 E 是支点；撬棒原点放在 E，棒轴在 E 上方 BAR_R 处（绕 E 转时棒面一直贴着棱） */
const E: Vec3 = [-1700, 53, 0]
const BRICK: Vec3 = [240, 53, 115]
const BAR_R = 12
const ARM_IN = 1000
const ARM_OUT = 250
const TIP_Y = 14
const ALPHA = r2((Math.asin((E[1] - TIP_Y) / Math.hypot(ARM_OUT, BAR_R)) + Math.atan2(BAR_R, ARM_OUT)) / DEG)
const PUSH = 7
const tipY = (b: number) => E[1] - ARM_OUT * Math.sin(b * DEG) + BAR_R * Math.cos(b * DEG)
const RISE = tipY(ALPHA - PUSH) - tipY(ALPHA)
const TIP_X = E[0] + ARM_OUT * Math.cos(ALPHA * DEG) + BAR_R * Math.sin(ALPHA * DEG)
/** 棒尖端面上沿，石块底下的凹口与棒面平行、留 1.5 mm */
const TOP_EDGE: [number, number] = [TIP_X + BAR_R * Math.sin(ALPHA * DEG), TIP_Y + BAR_R * Math.cos(ALPHA * DEG)]
const ledge = (u: number) => r2(TOP_EDGE[1] + 1.5 + (TOP_EDGE[0] - (TIP_X + u)) * Math.tan(ALPHA * DEG))
/** 石块：侧面轮廓（相对棒尖 u、高 y），原点在右下棱（撬起时绕它转） */
const ROCK_RIGHT = 290
const rockProfile: [number, number][] = ([
  [290, 0], [305, 120], [250, 225], [120, 255], [-10, 215], [-50, 120], [-40, ledge(-40)], [12, ledge(12)], [45, 0],
] as [number, number][]).map(([u, y]) => [u - ROCK_RIGHT, y])
/** 撬起时石块绕右下棱转的角度：接触点离右下棱约 300 mm */
const ROCK_TILT = r2(Math.atan(RISE / 300) / DEG)

const crowbarParts: SpecPart[] = [
  { id: 'brick', name: '砖块（支点）', spec: '标准砖 240 × 115 × 53 mm', shape: { type: 'box', size: BRICK }, at: [E[0] - BRICK[0] / 2, BRICK[1] / 2, 0], fill: 'warm', finish: BRICK_RED, visible: false },
  {
    id: 'bar', name: '撬棒', spec: `Ø${2 * BAR_R} mm 钢棒 · 动力臂 ${ARM_IN / 10} cm · 阻力臂 ${ARM_OUT / 10} cm`,
    shape: {
      type: 'compound',
      items: [
        cyl(BAR_R, ARM_IN + ARM_OUT, [(ARM_OUT - ARM_IN) / 2, BAR_R, 0], 'x'),
        cyl(BAR_R + 3, 160, [-ARM_IN + 80, BAR_R, 0], 'x', { fill: 'dark', finish: 'rubber' }),
      ],
    },
    at: E, rot: [0, 0, -ALPHA], fill: 'shade', finish: 'steel', visible: false,
  },
  {
    id: 'rock', name: '石块', spec: '约 100 kg',
    shape: { type: 'poly', points: rockProfile, h: 300 }, rot: [-90, 0, 0], at: [r2(TIP_X + ROCK_RIGHT), 0, 150], fill: 'shade', finish: STONE, visible: false,
  },
]

// ---------- 第二类：独轮车 ----------

const WHEEL_R = 190
const W_AT: Vec3 = [450, WHEEL_R, 0]
const HANDLE_X = -1350
const HANDLE_Y = 430
const FRAME_ANGLE = r2(Math.atan2(HANDLE_Y, -HANDLE_X) / DEG)
const FRAME_LEN = r2(Math.hypot(HANDLE_X, HANDLE_Y))
const LEG_X = -880
const LEG_TOP = r2(-LEG_X * Math.tan(FRAME_ANGLE * DEG))
const LIFT = 9
const barrowItems: Item[] = [cyl(14, 500, [0, 0, 0], 'z', { fill: 'shade', finish: 'steel' })]
for (const z of [-230, 230]) {
  barrowItems.push(
    box([FRAME_LEN, 32, 32], [HANDLE_X / 2, HANDLE_Y / 2, z], { rot: [0, 0, -FRAME_ANGLE], fill: 'shade', finish: 'steel' }),
    box([32, LEG_TOP + WHEEL_R, 32], [LEG_X, (LEG_TOP - WHEEL_R) / 2, z], { fill: 'shade', finish: 'steel' }),
    cyl(18, 150, [HANDLE_X + 40, HANDLE_Y - 40 * Math.tan(FRAME_ANGLE * DEG), z], 'x', { rot: [0, 0, -FRAME_ANGLE], fill: 'dark', finish: 'rubber' }),
  )
}
barrowItems.push(
  { type: 'poly', points: [[-210, 128], [-800, 300], [-860, 560], [-40, 520]], h: 560, at: [0, 0, 280], rot: [-90, 0, 0], finish: TUB },
  { type: 'poly', points: [[-90, 524], [-820, 562], [-700, 612], [-260, 602]], h: 500, at: [0, 0, 250], rot: [-90, 0, 0], fill: 'warm', finish: SAND },
)

const barrowParts: SpecPart[] = [
  { id: 'barrow', name: '独轮车', spec: '车 + 沙土约 90 kg · 重力约 900 N', shape: { type: 'compound', items: barrowItems }, at: W_AT, fill: 'white', finish: TUB, visible: false },
  {
    id: 'wheel', name: '车轮（支点在轮轴）', parent: 'barrow',
    shape: { type: 'compound', items: [cyl(WHEEL_R, 80, [0, 0, 0], 'z', { finish: 'rubber', fill: 'dark' }), cyl(120, 84, [0, 0, 0], 'z', { fill: 'shade', finish: 'steel' }), cyl(36, 100, [0, 0, 0], 'z', { fill: 'shade', finish: 'steel' })] },
    fill: 'dark', finish: 'rubber',
  },
]

// ---------- 第三类：钓鱼竿 ----------

const ROD_AT: Vec3 = [1250, 460, 0]
const ROD_LEN = 1600
const ROD_UP = 15
const ROD_LIFT = 18
const HAND = 300
const LINE = 560
const rodParts: SpecPart[] = [
  {
    id: 'stand', name: '竿架（支点）', spec: '后手握住竿尾的位置',
    shape: {
      type: 'compound',
      items: [
        cyl(110, 16, [0, 8, 0], 'y', { fill: 'dark', finish: 'plastic-black' }),
        cyl(14, 420, [0, 226, 0]),
        box([40, 50, 6], [0, 460, 16]),
        box([40, 50, 6], [0, 460, -16]),
        cyl(4, 44, [0, 460, 0], 'z'),
      ],
    },
    at: [ROD_AT[0], 0, 0], fill: 'shade', finish: 'steel', visible: false,
  },
  {
    id: 'rod', name: '钓鱼竿', spec: `长 ${ROD_LEN / 1000} m · 前手离竿尾 ${HAND / 10} cm`, parent: 'stand',
    shape: {
      type: 'compound',
      items: [
        cyl(3, ROD_LEN, [ROD_LEN / 2, 0, 0], 'x', { r2: 11 }),
        cyl(16, 260, [180, 0, 0], 'x', { fill: 'warm', finish: CORK }),
        cyl(12, 20, [0, 0, 0], 'x', { fill: 'dark', finish: 'plastic-black' }),
      ],
    },
    at: [0, ROD_AT[1], 0], rot: [0, 0, ROD_UP], fill: 'dark', finish: ROD,
  },
  {
    id: 'fish', name: '鱼', spec: '约 0.5 kg · 重力约 4.9 N', parent: 'rod',
    shape: {
      type: 'compound',
      items: [
        cyl(0.8, LINE, [0, -LINE / 2, 0], 'y', { fill: 'dark', finish: 'plastic-black' }),
        cyl(36, 70, [0, -LINE - 35, 0], 'y', { r2: 6 }),
        cyl(10, 130, [0, -LINE - 135, 0], 'y', { r2: 36 }),
        { type: 'poly', points: [[0, -LINE - 195], [-42, -LINE - 255], [42, -LINE - 255]], h: 6, at: [0, 0, 3], rot: [-90, 0, 0] },
      ],
    },
    at: [ROD_LEN, 0, 0], rot: [0, 0, -ROD_UP], fill: 'white', finish: FISH,
  },
]

const classParts = [...crowbarParts, ...barrowParts, ...rodParts]

// ---------- 动作与镜头 ----------

const LOOP = 3
const pry: Action[] = [
  { type: 'swing', part: 'bar', axis: 'z', amp: PUSH, period: LOOP, clip: 'pos' },
  { type: 'swing', part: 'rock', axis: 'y', amp: ROCK_TILT, period: LOOP, clip: 'pos' },
]
const wheel: Action[] = [{ type: 'swing', part: 'barrow', axis: 'z', amp: LIFT, period: LOOP, clip: 'neg' }]
const fishing: Action[] = [
  { type: 'swing', part: 'rod', axis: 'z', amp: ROD_LIFT, period: LOOP, clip: 'pos' },
  { type: 'swing', part: 'fish', axis: 'z', amp: -ROD_LIFT, period: LOOP, clip: 'pos' },
]

const SEESAW: CameraSpec = { target: [0, 150, 0], dir: [0.22, 0.38, 1], dist: 1450 }
const at = (x: number) => [x, TOP, 0] as Vec3

export const physicsLever: ManualSpec = {
  id: 'physics-lever',
  name: '杠杆：F₁L₁ = F₂L₂ 与三类杠杆',
  desc: '在跷跷板上放铁块找平衡，看懂力 × 力臂；再用撬棒、独轮车、钓鱼竿认识省力和费力杠杆。',
  category: '物理原理',
  genre: 'tutorial',
  dims: { width: 1160, depth: 240, height: 210 },
  source: { title: 'OpenStax · College Physics 2e · 9.5 Simple Machines', url: 'https://openstax.org/books/college-physics-2e/pages/9-5-simple-machines', images: [] },
  package: [
    { name: '木横梁', qty: 1, spec: '1 m 长，正面每 10 cm 一个刻度' },
    { name: '三角支点', qty: 1, spec: '横梁中点架在尖上' },
    { name: '1 kg 铁块', qty: 5, spec: '一块的重力 1 kg × 9.8 N/kg = 9.8 N' },
    { name: '撬棒 · 砖块 · 石块', qty: 1, spec: '第一类杠杆' },
    { name: '独轮车', qty: 1, spec: '第二类杠杆' },
    { name: '钓鱼竿', qty: 1, spec: '第三类杠杆' },
  ],
  params: [
    { label: '平衡条件', value: 'F₁L₁ = F₂L₂', note: '动力 × 动力臂 = 阻力 × 阻力臂；力臂是支点到力的作用线的距离' },
    { label: '演示数据', value: '2 kg × 30 cm = 3 kg × 20 cm', note: '19.6 N × 0.3 m = 29.4 N × 0.2 m = 5.88 N·m' },
    { label: '重力', value: 'G = mg', note: 'g 取 9.8 N/kg' },
    { label: '机械利益', value: 'MA = F₂ / F₁ = L₁ / L₂', note: '动力臂越长越省力，但动力端要走更远' },
    { label: '第一类', value: '支点在中间', note: '撬棒、跷跷板、剪刀；天平是等臂杠杆' },
    { label: '第二类', value: '阻力在中间', note: '独轮车、开瓶器、核桃夹：总是省力' },
    { label: '第三类', value: '动力在中间', note: '钓鱼竿、镊子、筷子：费力，但省距离' },
  ],
  parts: [...seesawParts, ...classParts],
  stageSize: 2800,
  finishes: { white: 'plastic-white', shade: 'steel', dark: 'plastic-black', warm: 'wood' },
  guides: [
    {
      id: 'balance',
      title: '杠杆平衡：F₁L₁ = F₂L₂',
      kind: 'usage',
      steps: [
        {
          id: 'intro', title: '一根能绕支点转的硬棒', desc: '1 m 长的木横梁中点架在三角支点上，这就是一根杠杆：它能绕支点 O 转动。横梁的重心正好在支点上，自己的重力不会让它往哪边歪，所以空着时是平的。',
          camera: SEESAW, highlight: ['beam', 'fulcrum'],
          callouts: [
            { part: 'fulcrum', text: '支点 O', at: [0, 0, FUL_H - 20], offset: [-200, -40, 0] },
            { part: 'beam', text: '杠杆（横梁）', sub: '1 m · 重心在支点上', at: [-260, BEAM_H, 0], offset: [-20, 120, 0] },
            { part: 'beam', text: '刻度', sub: '每格 10 cm', at: [200, 15, BEAM_D / 2], offset: [60, -120, 0] },
          ],
          zoom: { target: [0, APEX_Y + 10, BEAM_D / 2], dir: [0.15, 0.2, 1], dist: 320, caption: '从支点往两边量距离' },
        },
        {
          id: 'left', title: '左边 30 cm 放 2 kg：往左倒',
          desc: '在左边 30 cm 处放 2 kg 铁块：它的重力 F₁ = 2 kg × 9.8 N/kg = 19.6 N，力臂 L₁ = 0.3 m，产生 F₁L₁ = 5.88 N·m 的力矩。右边什么都没有，杠杆绕支点往左转，左端落到底座上。',
          camera: SEESAW,
          set: { w2: { visible: true, at: at(-300), dur: 0.9 }, beam: { rot: [0, 0, TIP], delay: 0.9, dur: 1.2 }, 'arm-l30': { visible: true, delay: 0.9 } },
          highlight: ['w2', 'arm-l30'],
          callouts: [
            { part: 'w2', text: 'F₁ = 19.6 N', sub: '2 kg 的重力', at: [0, 2 * DISC_H + 12, 0], offset: [60, 110, 0] },
            { part: 'arm-l30', text: 'L₁ = 30 cm', offset: [40, -110, 0] },
          ],
          chips: [{ label: '左边', sub: '19.6 N × 0.3 m = 5.88 N·m' }, { label: '右边', sub: '0' }],
        },
        {
          id: 'balance', title: '右边 20 cm 放 3 kg：平衡了',
          desc: '在右边 20 cm 处放 3 kg 铁块：F₂ = 29.4 N，L₂ = 0.2 m，F₂L₂ = 5.88 N·m，和左边一样大。两边的力 × 力臂相等，杠杆转回水平停住 —— 这就是杠杆的平衡条件 F₁L₁ = F₂L₂。',
          camera: SEESAW,
          set: { w3: { visible: true, at: at(200), dur: 0.9 }, beam: { rot: [0, 0, 0], delay: 0.9, dur: 1.2 }, 'arm-r20': { visible: true, delay: 0.9 } },
          highlight: ['w3', 'arm-r20', 'arm-l30'],
          callouts: [
            { part: 'w2', text: 'F₁ = 19.6 N', at: [0, 2 * DISC_H + 12, 0], offset: [-60, 110, 0] },
            { part: 'w3', text: 'F₂ = 29.4 N', sub: '3 kg 的重力', at: [0, 3 * DISC_H + 12, 0], offset: [60, 90, 0] },
            { part: 'arm-l30', text: 'L₁ = 30 cm', offset: [-40, -110, 0] },
            { part: 'arm-r20', text: 'L₂ = 20 cm', offset: [60, -110, 0] },
          ],
          chips: [{ label: '左', sub: '19.6 × 0.3 = 5.88 N·m' }, { label: '右', sub: '29.4 × 0.2 = 5.88 N·m' }, { label: '平衡', sub: '2 × 30 = 3 × 20' }],
          tip: '重的一边离支点近、轻的一边离支点远，照样能平衡：力和力臂成反比。',
        },
        {
          id: 'farther', title: '3 kg 挪到 30 cm：往右倒',
          desc: '把 3 kg 往外挪到 30 cm：右边变成 29.4 N × 0.3 m = 8.82 N·m，比左边的 5.88 N·m 大，杠杆往右转。同样的重量，离支点越远，转动的效果越大。',
          camera: SEESAW,
          set: { w3: { at: at(300), lift: 50, dur: 1.0 }, 'arm-r20': { visible: false, dur: 0.3 }, 'arm-r30': { visible: true, delay: 1.0 }, beam: { rot: [0, 0, -TIP], delay: 1.0, dur: 1.2 } },
          highlight: ['w3', 'arm-r30'],
          callouts: [
            { part: 'arm-r30', text: 'L₂ = 30 cm', offset: [60, -110, 0] },
            { part: 'w3', text: '8.82 N·m', sub: '> 左边 5.88 N·m', at: [0, 3 * DISC_H + 12, 0], offset: [-80, 90, 0] },
          ],
          chips: [{ label: '左', sub: '5.88 N·m' }, { label: '右', sub: '29.4 × 0.3 = 8.82 N·m' }],
        },
        {
          id: 'rebalance', title: '2 kg 挪到 45 cm：又平衡了',
          desc: '左边的 2 kg 挪到 45 cm：19.6 N × 0.45 m = 8.82 N·m，又和右边相等，杠杆回到水平。轻的一边只要力臂够长，就能托起重的一边 —— 这就是「给我一个支点，我能撬起地球」。',
          camera: SEESAW,
          set: { w2: { at: at(-450), lift: 50, dur: 1.0 }, 'arm-l30': { visible: false, dur: 0.3 }, 'arm-l45': { visible: true, delay: 1.0 }, beam: { rot: [0, 0, 0], delay: 1.0, dur: 1.2 } },
          highlight: ['w2', 'arm-l45', 'arm-r30'],
          callouts: [
            { part: 'arm-l45', text: 'L₁ = 45 cm', offset: [-60, -110, 0] },
            { part: 'arm-r30', text: 'L₂ = 30 cm', offset: [60, -110, 0] },
          ],
          chips: [{ label: '左', sub: '19.6 × 0.45 = 8.82 N·m' }, { label: '右', sub: '29.4 × 0.3 = 8.82 N·m' }, { label: '平衡', sub: '2 × 45 = 3 × 30' }],
        },
      ],
    },
    {
      id: 'classes',
      title: '三类杠杆',
      kind: 'usage',
      start: {
        base: { visible: false }, fulcrum: { visible: false }, beam: { visible: false },
        ...Object.fromEntries(classParts.filter((p) => !p.parent).map((p) => [p.id, { visible: true }])),
      },
      steps: [
        {
          id: 'crowbar', title: '第一类：支点在中间 —— 撬棒',
          desc: `撬棒架在砖块的棱上：砖棱是支点，手在长的一头往下压，短的一头把石块撬起来。动力臂 ${ARM_IN / 10} cm 是阻力臂 ${ARM_OUT / 10} cm 的 4 倍，所以只要石块压在棒头上那个力的 1/4。代价是手要往下压 4 倍的距离。`,
          camera: { target: [-1930, 180, 0], dir: [0.25, 0.4, 1], dist: 2200 },
          highlight: ['bar'], actions: pry,
          callouts: [
            { part: 'brick', text: '支点 O', sub: '砖棱', at: [BRICK[0] / 2, BRICK[1] / 2, BRICK[2] / 2], offset: [-60, -110, 0] },
            { part: 'bar', text: '动力 F₁', sub: `手往下压 · L₁ = ${ARM_IN / 10} cm`, at: [-ARM_IN + 160, BAR_R, 0], offset: [60, 150, 0] },
            { part: 'rock', text: '阻力 F₂', sub: `石块压在棒头 · L₂ = ${ARM_OUT / 10} cm`, at: [-ROCK_RIGHT + 90, 0, 255], offset: [90, 120, 0] },
          ],
          chips: [{ label: 'L₁ : L₂', sub: '4 : 1' }, { label: '省力', sub: 'F₁ = F₂ / 4' }, { label: '费距离', sub: `手压下 ${Math.round(RISE * 4 / 10)} cm，棒头抬 ${Math.round(RISE / 10)} cm` }],
          tip: '跷跷板、剪刀、天平也是第一类：支点在中间。支点越靠近重物越省力；两边一样长（天平）就不省力也不费力。',
        },
        {
          id: 'barrow', title: '第二类：阻力在中间 —— 独轮车',
          desc: '独轮车的支点是车轮的轴，沙土的重力在中间，手在最后面往上抬。车把离轮轴约 135 cm，沙土重心离轮轴约 45 cm：动力臂是阻力臂的 3 倍，900 N 的一车沙土只要约 300 N 就抬得起来。',
          camera: { target: [-200, 420, 0], dir: [0.3, 0.4, 1], dist: 2300 },
          highlight: ['barrow'], actions: wheel,
          callouts: [
            { part: 'wheel', text: '支点 O', sub: '轮轴', offset: [-200, -150, 0] },
            { part: 'barrow', text: '阻力 F₂', sub: '沙土约 900 N · L₂ ≈ 45 cm', at: [-450, 600, 0], offset: [80, 110, 0] },
            { part: 'barrow', text: '动力 F₁', sub: '手往上抬 · L₁ ≈ 135 cm', at: [HANDLE_X, HANDLE_Y, 230], offset: [90, 150, 0] },
          ],
          chips: [{ label: 'L₁ : L₂', sub: '3 : 1' }, { label: '省力', sub: '约 300 N 抬起 900 N' }, { label: '同类', sub: '开瓶器 · 核桃夹' }],
          tip: '开瓶器的支点是瓶盖顶上那一点，瓶盖边是阻力，手在柄端用力；核桃夹的支点是两片夹子相连的地方。阻力总在中间，动力臂总比阻力臂长，所以第二类杠杆一定省力。',
        },
        {
          id: 'rod', title: '第三类：动力在中间 —— 钓鱼竿',
          desc: `钓鱼时后手握住竿尾当支点，前手在离竿尾 ${HAND / 10} cm 的地方往上抬，鱼挂在 ${ROD_LEN / 1000} m 外的竿梢。动力臂比阻力臂短得多，要用约 5 倍于鱼重的力 —— 费力；但前手只抬一点点，竿梢就扬起一大段 —— 省距离。`,
          camera: { target: [2000, 720, 0], dir: [0.2, 0.3, 1], dist: 2900 },
          highlight: ['rod', 'fish'], actions: fishing,
          callouts: [
            { part: 'stand', text: '支点 O', sub: '后手握竿尾', at: [0, 460, 20], offset: [160, -170, 0] },
            { part: 'rod', text: '动力 F₁', sub: `前手往上抬 · L₁ = ${HAND / 10} cm`, at: [HAND, 16, 0], offset: [-60, 220, 0] },
            { part: 'fish', text: '阻力 F₂', sub: `鱼的重力 · L₂ = ${ROD_LEN / 10} cm`, at: [0, -LINE - 100, 0], offset: [-220, 60, 0] },
          ],
          chips: [{ label: 'L₁ : L₂', sub: `${HAND / 10} : ${ROD_LEN / 10}` }, { label: '费力', sub: 'F₁ ≈ 5.3 × F₂' }, { label: '省距离', sub: '手抬 1 cm，竿梢扬 5 cm 多' }, { label: '同类', sub: '镊子 · 筷子' }],
          tip: '镊子的支点在尾端两片相连处，手指捏在中间，尖端夹住东西：同样费力、省距离，换来的是灵巧。',
        },
        {
          id: 'compare', title: '三类杠杆放在一起',
          desc: '看支点、动力、阻力三个点谁在中间：支点在中间是第一类（撬棒），阻力在中间是第二类（独轮车），动力在中间是第三类（钓鱼竿）。动力臂比阻力臂长就省力、费距离；短就费力、省距离 —— 没有既省力又省距离的杠杆。',
          camera: { target: [60, 450, 0], dir: [0.12, 0.35, 1], dist: 5000 },
          highlight: ['bar', 'barrow', 'rod'], actions: [...pry, ...wheel, ...fishing],
          callouts: [
            { part: 'bar', text: '第一类', sub: '支点在中间', at: [-ARM_IN / 2, BAR_R, 0], offset: [0, 520, 0] },
            { part: 'barrow', text: '第二类', sub: '阻力在中间', at: [-500, 600, 0], offset: [0, 380, 0] },
            { part: 'rod', text: '第三类', sub: '动力在中间', at: [ROD_LEN / 2, 0, 0], offset: [0, 380, 0] },
          ],
          chips: [{ label: '省力杠杆', sub: 'L₁ > L₂' }, { label: '费力杠杆', sub: 'L₁ < L₂' }, { label: '等臂杠杆', sub: 'L₁ = L₂（天平）' }],
        },
      ],
    },
  ],
}
