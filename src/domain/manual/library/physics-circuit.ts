import type { CableEnd, CameraSpec, Fill, Finish, ManualSpec, PartState, Shape, SpecPart, Vec3 } from '../types'

/**
 * 串联与并联：两块一样的实验板，各有 2 节 5 号电池（3 V）、一个单刀闸刀开关、两个 3 V 0.3 A 小灯泡。
 * 左板串联（一条路），右板并联（两条支路）。灯泡按 R = U / I = 10 Ω 估算。
 * 参考 The Physics Classroom · Electric Circuits · Two Types of Connections。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。底板 12 mm 厚，元件都挂在底板上（父级 = 底板）。
 * 每块板：电池盒在左后 (-65, -62)，开关在右后 (72, -62)，灯座 L₁ / L₂ 在前排 (∓58, 48)。
 * 闸刀原点在铰链上，rot z = 50° 为断开、0 为合上。灯泡发光用灯泡正面的 led 面片：串联偏暗（小、橙），并联明亮（大、黄）。
 * 导线是 cable，两端挂在接线柱顶上；灯座后接线柱 z = -16、前接线柱 z = +16。
 */

type Item = Extract<Shape, { type: 'compound' }>['items'][number]
interface Opt { rot?: Vec3; fill?: Fill; finish?: Finish }
const box = (size: Vec3, at: Vec3, o: Opt & { chamfer?: number } = {}): Item => ({ type: 'box', size, at, ...o })
const cyl = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', o: Opt & { r2?: number } = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...o })
const txt = (text: string, size: number, at: Vec3, o: Opt = {}): Item => ({ type: 'text', text, size, at, ...o })

const RED: Finish = { color: '#d23b2a', roughness: 0.5 }
const BLACK: Finish = { color: '#26272a', roughness: 0.5 }
const YELLOW: Finish = { color: '#e3b522', roughness: 0.5 }
const GREEN: Finish = { color: '#3c9a52', roughness: 0.5 }
const COPPER: Finish = { color: '#c98b4f', roughness: 0.35, metalness: 0.7 }
const GLASS: Finish = { color: '#f3efe3', roughness: 0.15 }
const CELL: Finish = { color: '#2f6fb4', roughness: 0.4 }

const BOARD_H = 12
const OPEN = 50
const DIM = '#d9822b'
const BRIGHT = '#ffd23f'

// ---------- 元件 ----------

const BATTERY: Shape = {
  type: 'compound',
  items: [
    box([118, 4, 34], [0, 2, 0], { fill: 'dark', finish: 'plastic-black' }),
    box([4, 22, 34], [-57, 11, 0], { fill: 'dark', finish: 'plastic-black' }),
    box([4, 22, 34], [57, 11, 0], { fill: 'dark', finish: 'plastic-black' }),
    box([110, 8, 2], [0, 8, 16], { fill: 'dark', finish: 'plastic-black' }),
    box([110, 8, 2], [0, 8, -16], { fill: 'dark', finish: 'plastic-black' }),
    ...[-25.5, 25.5].flatMap((x) => [
      cyl(7.25, 49.5, [x, 11.25, 0], 'x', { fill: 'white', finish: CELL }),
      cyl(2.5, 1.5, [x + 25.5, 11.25, 0], 'x', { fill: 'shade', finish: 'steel' }),
      txt('1.5V', 5, [x, 11.25, 7.6]),
    ]),
    txt('2 × 1.5 V = 3 V', 5, [0, 8, 17.4], { fill: 'white' }),
    cyl(3, 20, [63, 10, 0], 'y', { fill: 'shade', finish: COPPER }),
    cyl(4.5, 3, [63, 21.5, 0], 'y', { fill: 'dark', finish: RED }),
    cyl(3, 20, [-63, 10, 0], 'y', { fill: 'shade', finish: COPPER }),
    cyl(4.5, 3, [-63, 21.5, 0], 'y', { fill: 'dark', finish: BLACK }),
  ],
}
const BAT_POS: Vec3 = [63, 23, 0]
const BAT_NEG: Vec3 = [-63, 23, 0]

const SWITCH: Shape = {
  type: 'compound',
  items: [
    box([74, 8, 28], [0, 4, 0], { fill: 'white', finish: 'plastic-white' }),
    box([8, 14, 2], [-22, 15, 3]),
    box([8, 14, 2], [-22, 15, -3]),
    box([8, 12, 2], [22, 14, 3]),
    box([8, 12, 2], [22, 14, -3]),
    cyl(3, 9, [-33, 12.5, 0]),
    cyl(3, 9, [33, 12.5, 0]),
    txt('S', 7, [0, 4, 14.4]),
  ],
}
const SW_L: Vec3 = [-33, 17, 0]
const SW_R: Vec3 = [33, 17, 0]
const BLADE: Shape = {
  type: 'compound',
  items: [box([52, 2.2, 3], [26, 0, 0]), cyl(3.2, 10, [50, 6.1, 0], 'y', { fill: 'dark', finish: 'plastic-black' })],
}

const holder = (label: string): Shape => ({
  type: 'compound',
  items: [
    box([36, 8, 44], [0, 4, 0], { fill: 'white', finish: 'plastic-white' }),
    cyl(9, 10, [0, 13, 0], 'y', { fill: 'shade', finish: 'zinc' }),
    ...[-16, 16].flatMap((z) => [cyl(2.5, 6, [0, 11, z], 'y', { fill: 'shade', finish: COPPER }), cyl(3.5, 2, [0, 15, z], 'y', { fill: 'shade', finish: 'steel' })]),
    txt(label, 8, [0, 4, 22.4]),
  ],
})
const BACK: Vec3 = [0, 16, -16]
const FRONT: Vec3 = [0, 16, 16]

const BULB: Shape = {
  type: 'compound',
  items: [
    cyl(5.2, 9, [0, 4.5, 0], 'y', { fill: 'shade', finish: 'zinc' }),
    cyl(5.5, 4, [0, 11, 0], 'y', { r2: 8, fill: 'white', finish: GLASS }),
    box([22, 22, 22], [0, 23, 0], { chamfer: 11, fill: 'white', finish: GLASS }),
  ],
}

// ---------- 两块板 ----------

const BX = 220
const UP: Vec3 = [0, 1, 0]
const BACK_UP: Vec3 = [0, 0.6, -0.8]
const FWD: Vec3 = [0, 0.3, 1]

const end = (part: string, at: Vec3, dir: Vec3): CableEnd => ({ part, at, dir })
const wire = (id: string, name: string, from: CableEnd, to: CableEnd, finish: Finish, slack?: number): SpecPart => ({
  id, name, shape: { type: 'cable', from, to, r: 1.3, ...(slack ? { slack } : {}) }, fill: 'dark', finish,
})

/** k = 's' 串联 / 'p' 并联 */
function board(k: 's' | 'p'): SpecPart[] {
  const id = (n: string) => `${n}-${k}`
  const series = k === 's'
  const parts: SpecPart[] = [
    {
      id: id('board'), name: series ? '串联实验板' : '并联实验板', spec: '320 × 230 mm 木板',
      shape: { type: 'compound', items: [{ type: 'slab', w: 320, d: 230, h: BOARD_H, r: 8 }, txt(series ? '串联电路' : '并联电路', 14, [0, BOARD_H + 0.2, 98], { rot: [-90, 0, 0] })] },
      at: [series ? -BX : BX, 0, 0], fill: 'warm', finish: 'wood',
    },
    { id: id('bat'), name: '电池盒', spec: '2 节 5 号电池串联 · 3 V', parent: id('board'), shape: BATTERY, at: [-65, BOARD_H, -62], fill: 'dark', finish: 'plastic-black' },
    { id: id('sw'), name: '开关 S', spec: '单刀闸刀开关', parent: id('board'), shape: SWITCH, at: [72, BOARD_H, -62], fill: 'shade', finish: COPPER },
    { id: id('bl'), name: '闸刀', parent: id('sw'), shape: BLADE, at: [-22, 18, 0], rot: [0, 0, OPEN], fill: 'shade', finish: COPPER },
    ...[1, 2].flatMap((n): SpecPart[] => [
      { id: id(`h${n}`), name: `灯座 L${n === 1 ? '₁' : '₂'}`, spec: 'E10 螺口', parent: id('board'), shape: holder(n === 1 ? 'L₁' : 'L₂'), at: [n === 1 ? -58 : 58, BOARD_H, 48], fill: 'white', finish: 'plastic-white' },
      { id: id(`b${n}`), name: `小灯泡 L${n === 1 ? '₁' : '₂'}`, spec: '3 V 0.3 A（约 10 Ω）', parent: id(`h${n}`), shape: BULB, at: [0, 18, 0], fill: 'white', finish: GLASS },
      { id: id(`g${n}`), name: `L${n === 1 ? '₁' : '₂'} 发光`, parent: id(`b${n}`), shape: { type: 'led', r: series ? 8 : 10, color: series ? DIM : BRIGHT }, at: [0, 23, 11.6] },
    ]),
    wire(id('w1'), '导线：正极 → 开关', end(id('bat'), BAT_POS, UP), end(id('sw'), SW_L, UP), RED),
    wire(id('w2'), '导线：开关 → L₂', end(id('sw'), SW_R, [0.3, 0.6, 0.75]), end(id('h2'), BACK, BACK_UP), YELLOW),
  ]
  if (series) {
    parts.push(
      wire(id('w3'), '导线：L₂ → L₁', end(id('h2'), FRONT, FWD), end(id('h1'), FRONT, FWD), GREEN),
      wire(id('w4'), '导线：L₁ → 负极', end(id('h1'), BACK, BACK_UP), end(id('bat'), BAT_NEG, UP), BLACK),
    )
  } else {
    parts.push(
      wire(id('w3'), '导线：L₂ 后 → L₁ 后', end(id('h2'), BACK, BACK_UP), end(id('h1'), BACK, BACK_UP), YELLOW),
      wire(id('w4'), '导线：L₂ 前 → L₁ 前', end(id('h2'), FRONT, FWD), end(id('h1'), FRONT, FWD), GREEN),
      wire(id('w5'), '导线：L₁ 前 → 负极', end(id('h1'), FRONT, [-1, 0.5, 0.2]), end(id('bat'), BAT_NEG, UP), BLACK),
    )
  }
  return parts
}

// ---------- 状态 ----------

const close = (k: 's' | 'p'): Record<string, PartState> => ({ [`bl-${k}`]: { rot: [0, 0, 0], dur: 0.7 } })
const open = (k: 's' | 'p'): Record<string, PartState> => ({ [`bl-${k}`]: { rot: [0, 0, OPEN], dur: 0.7 } })
const lights = (ids: string[], on: boolean, delay = 0): Record<string, PartState> =>
  Object.fromEntries(ids.map((g) => [g, { light: on ? 'on' : 'off', ...(delay ? { delay } : {}) } as PartState]))
const boardX = (k: 's' | 'p') => (k === 's' ? -BX : BX)
const OUT: Vec3 = [-75, 11 + BOARD_H, 96]
const unscrew = (k: 's' | 'p'): Record<string, PartState> => ({
  [`b1-${k}`]: { parent: `board-${k}`, at: OUT, rot: [0, 0, 90], via: [boardX(k) - 70, 120, 80], dur: 1.3 },
})
const screwIn = (k: 's' | 'p'): Record<string, PartState> => ({
  [`b1-${k}`]: { parent: `h1-${k}`, at: [0, 18, 0], rot: [0, 0, 0], via: [boardX(k) - 62, 120, 60], dur: 1.3 },
})

const cam = (k: 's' | 'p'): CameraSpec => ({ target: [boardX(k), 30, 12], dir: [0.15, 0.85, 1], dist: 560 })
const bulbZoom = (k: 's' | 'p', caption: string) => ({ target: [boardX(k), 55, 60] as Vec3, dir: [0.1, 0.35, 1] as Vec3, dist: 330, caption })
const TOP: Vec3 = [0, 34, 0]

export const physicsCircuit: ManualSpec = {
  id: 'physics-circuit',
  name: '串联与并联电路',
  desc: '同样的电池、开关和两个小灯泡，串起来一盏坏全灭、灯偏暗；并起来各管各的、灯更亮。',
  category: '物理原理',
  genre: 'tutorial',
  dims: { width: 760, depth: 230, height: 70 },
  source: { title: 'The Physics Classroom · Electric Circuits · Two Types of Connections', url: 'https://www.physicsclassroom.com/tutorial/electric-circuits/circuit-connections/two-types-of-connections', images: [] },
  package: [
    { name: '电池盒', qty: 2, spec: '每盒 2 节 5 号电池串联，3 V' },
    { name: '单刀开关', qty: 2, spec: '闸刀式，看得见通断' },
    { name: '小灯泡', qty: 4, spec: '3 V 0.3 A，电阻约 10 Ω' },
    { name: '灯座', qty: 4, spec: 'E10 螺口，带两个接线柱' },
    { name: '导线', qty: 9, spec: '红：接正极 · 黑：接负极' },
    { name: '实验底板', qty: 2, spec: '320 × 230 mm' },
  ],
  params: [
    { label: '欧姆定律', value: 'I = U / R', note: '小灯泡 3 V 0.3 A → R = 3 V ÷ 0.3 A = 10 Ω（按不变估算）' },
    { label: '串联', value: 'I = I₁ = I₂，U = U₁ + U₂', note: '只有一条路；总电阻 R = R₁ + R₂ = 20 Ω' },
    { label: '本例串联', value: 'I = 3 V ÷ 20 Ω = 0.15 A', note: '每盏分到 1.5 V，功率 P = UI = 0.225 W，只有额定的 1/4，所以暗' },
    { label: '并联', value: 'U = U₁ = U₂，I = I₁ + I₂', note: '每条支路各自接在电源两端；1/R = 1/R₁ + 1/R₂，总电阻 5 Ω' },
    { label: '本例并联', value: '每盏 3 V · 0.3 A · 0.9 W', note: '干路电流 I = 0.3 A + 0.3 A = 0.6 A，正常亮度' },
    { label: '生活里', value: '家里的灯和插座都是并联', note: '一盏灯坏了别的照样亮；节日小彩灯常用串联' },
  ],
  parts: [...board('s'), ...board('p')],
  stageSize: 1100,
  finishes: { white: 'plastic-white', shade: 'steel', dark: 'plastic-black', warm: 'wood' },
  guides: [
    {
      id: 'series',
      title: '串联：一条路走到底',
      kind: 'usage',
      steps: [
        {
          id: 'parts', title: '器材：电池盒、开关、两个小灯泡',
          desc: '左边这块板：电池盒里两节 1.5 V 电池首尾相连，一共 3 V；红色接线柱是正极，黑色是负极。开关现在是断开的（闸刀翘着）。前面两个灯座各拧着一个 3 V 0.3 A 的小灯泡。',
          camera: cam('s'), highlight: ['bat-s', 'sw-s', 'h1-s', 'h2-s'],
          callouts: [
            { part: 'bat-s', text: '电池盒 3 V', sub: '2 节 × 1.5 V', at: [-30, 18, 0], offset: [-45, 95, 0] },
            { part: 'sw-s', text: '开关 S', sub: '现在断开', at: [10, 30, 0], offset: [40, 95, 0] },
            { part: 'b1-s', text: '小灯泡 L₁', sub: '3 V 0.3 A', at: TOP, offset: [-55, 55, 0] },
            { part: 'b2-s', text: '小灯泡 L₂', sub: '3 V 0.3 A', at: TOP, offset: [55, 55, 0] },
          ],
          chips: [{ label: '电源', sub: '3 V' }, { label: '灯泡电阻', sub: 'R = 3 V ÷ 0.3 A = 10 Ω' }],
        },
        {
          id: 'path', title: '串联：电流只有一条路',
          desc: '顺着导线走一遍：从正极出发，经过开关，进 L₂，出来再进 L₁，最后回到负极。元件一个接一个首尾相连，中间没有岔路 —— 这就是串联。',
          camera: cam('s'), highlight: ['w1-s', 'w2-s', 'w3-s', 'w4-s'],
          callouts: [
            { part: 'bat-s', text: '① 正极出发', at: BAT_POS, offset: [5, 95, 0] },
            { part: 'sw-s', text: '② 经过开关', at: SW_R, offset: [-20, 90, 0] },
            { part: 'h2-s', text: '③ 穿过 L₂', at: FRONT, offset: [45, -25, 0] },
            { part: 'h1-s', text: '④ 穿过 L₁', at: FRONT, offset: [-15, -75, 0] },
            { part: 'bat-s', text: '⑤ 回到负极', at: BAT_NEG, offset: [20, 90, 0] },
          ],
          chips: [{ label: '路径', sub: '+ → S → L₂ → L₁ → −' }, { label: '岔路', sub: '没有' }],
        },
        {
          id: 'close', title: '合上开关：两盏灯一起亮，但偏暗',
          desc: '按下闸刀，电路接通，两盏灯同时亮起，可是都比较暗。两个 10 Ω 的灯串在一起，总电阻 20 Ω，电流只有 I = 3 V ÷ 20 Ω = 0.15 A；3 V 被两盏灯平分，每盏只分到 1.5 V，功率 0.225 W，是正常亮度时的 1/4。',
          camera: cam('s'),
          set: { ...close('s'), ...lights(['g1-s', 'g2-s'], true, 0.6) },
          highlight: ['bl-s', 'g1-s', 'g2-s'],
          callouts: [
            { part: 'b1-s', text: 'U₁ = 1.5 V', sub: '0.225 W', at: TOP, offset: [-55, 55, 0] },
            { part: 'b2-s', text: 'U₂ = 1.5 V', sub: '0.225 W', at: TOP, offset: [55, 55, 0] },
            { part: 'sw-s', text: '合上', sub: 'I = 0.15 A', at: [0, 20, 0], offset: [-80, 40, 0] },
          ],
          zoom: bulbZoom('s', '每盏只分到 1.5 V，发暗'),
          chips: [{ label: 'I', sub: '3 V ÷ 20 Ω = 0.15 A' }, { label: 'U₁ + U₂', sub: '1.5 V + 1.5 V = 3 V' }],
        },
        {
          id: 'remove', title: '拧下 L₁：L₂ 也灭了',
          desc: '把 L₁ 从灯座上拧下来，L₂ 跟着熄灭。串联只有一条路，L₁ 那里断开，整条路都断了，电流哪儿也去不了。老式节日小彩灯坏一个全串不亮，就是这个原因。',
          camera: cam('s'),
          set: { ...unscrew('s'), ...lights(['g1-s', 'g2-s'], false, 0.3) },
          highlight: ['b1-s', 'b2-s'],
          callouts: [
            { part: 'h1-s', text: '这里断开', sub: '灯座空了', at: [0, 18, 0], offset: [-55, 75, 0] },
            { part: 'b2-s', text: 'L₂ 也灭了', sub: '整条路断了', at: TOP, offset: [55, 55, 0] },
          ],
          chips: [{ label: '串联', sub: '一处断开，处处断开' }],
        },
        {
          id: 'refit', title: '装回 L₁：两盏灯重新亮起',
          desc: '把 L₁ 拧回灯座，路又通了，两盏灯重新一起亮起（还是偏暗）。',
          camera: cam('s'),
          set: { ...screwIn('s'), ...lights(['g1-s', 'g2-s'], true, 1.3) },
          highlight: ['b1-s', 'g1-s', 'g2-s'],
          callouts: [{ part: 'b1-s', text: '拧回去', sub: '电路又通了', at: TOP, offset: [-55, 55, 0] }],
          zoom: bulbZoom('s', '两盏一起亮'),
        },
        {
          id: 'off', title: '断开开关：一个开关管全部',
          desc: '把闸刀扳起来，两盏灯同时熄灭。串联电路里开关放在哪个位置都一样：断开任何一处，整条路就断了，一个开关就能管住所有灯。',
          camera: cam('s'),
          set: { ...open('s'), ...lights(['g1-s', 'g2-s'], false, 0.2) },
          highlight: ['bl-s'],
          callouts: [{ part: 'sw-s', text: '断开', sub: '全部熄灭', at: [0, 30, 0], offset: [45, 85, 0] }],
          chips: [{ label: '串联特点', sub: '一个开关控制全部；开关放哪儿都一样' }],
        },
      ],
    },
    {
      id: 'parallel',
      title: '并联：各走各的路',
      kind: 'usage',
      steps: [
        {
          id: 'branches', title: '并联：分成两条支路',
          desc: '右边这块板换了接法：电流从正极经过开关后，在 L₂ 的后接线柱分成两路，一路穿过 L₂，一路沿黄线到 L₁ 再穿过 L₁，两路在前面的绿线汇合，再沿黑线回到负极。两盏灯各自直接接在电池两端 —— 这就是并联。',
          camera: cam('p'), highlight: ['w2-p', 'w3-p', 'w4-p', 'w5-p'],
          callouts: [
            { part: 'sw-p', text: '干路', sub: '开关在这里', at: SW_R, offset: [35, 85, 0] },
            { part: 'h2-p', text: '分开', sub: '支路 2：L₂', at: BACK, offset: [55, 65, 0] },
            { part: 'h1-p', text: '支路 1：L₁', at: BACK, offset: [-55, 85, 0] },
            { part: 'h1-p', text: '汇合', sub: '回到负极', at: FRONT, offset: [-45, -55, 0] },
          ],
          chips: [{ label: '路径', sub: '+ → S → (L₁ ∥ L₂) → −' }, { label: '支路', sub: '2 条' }],
        },
        {
          id: 'close', title: '合上开关：两盏灯都很亮',
          desc: '合上开关，两盏灯同时亮，而且比串联时亮得多。并联时每盏灯两端都是完整的 3 V，各自电流 I = 3 V ÷ 10 Ω = 0.3 A，正好是额定值，功率 0.9 W，是串联时的 4 倍。干路里流着两路之和 0.6 A。',
          camera: cam('p'),
          set: { ...close('p'), ...lights(['g1-p', 'g2-p'], true, 0.6) },
          highlight: ['bl-p', 'g1-p', 'g2-p'],
          callouts: [
            { part: 'b1-p', text: 'U₁ = 3 V', sub: 'I₁ = 0.3 A', at: TOP, offset: [-55, 55, 0] },
            { part: 'b2-p', text: 'U₂ = 3 V', sub: 'I₂ = 0.3 A', at: TOP, offset: [55, 55, 0] },
            { part: 'sw-p', text: '干路 0.6 A', sub: 'I = I₁ + I₂', at: [0, 20, 0], offset: [-80, 40, 0] },
          ],
          zoom: bulbZoom('p', '每盏都是 3 V，正常亮度'),
          chips: [{ label: '每盏', sub: '3 V · 0.3 A · 0.9 W' }, { label: '干路', sub: '0.3 A + 0.3 A = 0.6 A' }],
        },
        {
          id: 'remove', title: '拧下 L₁：L₂ 照样亮',
          desc: '拧下 L₁，它所在的支路断了，可 L₂ 那条支路还连着电池两端，L₂ 照样亮，亮度也不变。家里的电灯、插座都是并联的，所以一盏灯坏了，别的电器照常工作。',
          camera: cam('p'),
          set: { ...unscrew('p'), ...lights(['g1-p'], false, 0.3) },
          highlight: ['b1-p', 'g2-p'],
          callouts: [
            { part: 'h1-p', text: '支路 1 断开', at: [0, 18, 0], offset: [-55, 75, 0] },
            { part: 'b2-p', text: 'L₂ 照样亮', sub: '仍是 3 V · 0.3 A', at: TOP, offset: [55, 55, 0] },
          ],
          zoom: bulbZoom('p', 'L₂ 不受影响'),
          chips: [{ label: '并联', sub: '各支路互不影响' }, { label: '干路', sub: '降到 0.3 A' }],
        },
        {
          id: 'refit', title: '装回 L₁',
          desc: '把 L₁ 拧回去，它的支路接通，L₁ 重新亮起；L₂ 全程没受影响。',
          camera: cam('p'),
          set: { ...screwIn('p'), ...lights(['g1-p'], true, 1.3) },
          highlight: ['b1-p', 'g1-p'],
          callouts: [{ part: 'b1-p', text: 'L₁ 重新亮起', at: TOP, offset: [-55, 55, 0] }],
          zoom: bulbZoom('p', '两盏都亮'),
        },
        {
          id: 'off', title: '断开干路开关：全部熄灭',
          desc: '开关装在干路上（分岔之前），所以断开它两条支路一起断电，两盏灯都灭。要想单独控制一盏灯，就得在它自己的支路上再装一个开关 —— 家里每盏灯的开关就是这么接的。',
          camera: cam('p'),
          set: { ...open('p'), ...lights(['g1-p', 'g2-p'], false, 0.2) },
          highlight: ['bl-p'],
          callouts: [{ part: 'sw-p', text: '干路开关', sub: '管住全部', at: [0, 30, 0], offset: [45, 85, 0] }],
          chips: [{ label: '干路开关', sub: '控制全部' }, { label: '支路开关', sub: '只控制本支路' }],
        },
        {
          id: 'compare', title: '对比：串联暗，并联亮',
          desc: '两块板都合上开关：左边串联的两盏灯各分到 1.5 V，偏暗；右边并联的两盏各有 3 V，正常亮。同一个电池，并联电路的总电阻只有 5 Ω，干路电流 0.6 A，是串联的 4 倍，电池也用得更快。',
          camera: { target: [0, 30, 10], dir: [0.1, 0.85, 1], dist: 1100 },
          set: { ...close('s'), ...close('p'), ...lights(['g1-s', 'g2-s', 'g1-p', 'g2-p'], true, 0.6) },
          highlight: ['g1-s', 'g2-s', 'g1-p', 'g2-p'],
          callouts: [
            { part: 'b2-s', text: '串联', sub: '每盏 1.5 V · 0.225 W', at: TOP, offset: [0, 95, 0] },
            { part: 'b1-p', text: '并联', sub: '每盏 3 V · 0.9 W', at: TOP, offset: [0, 95, 0] },
          ],
          zoom: { target: [-BX, 55, 60], dir: [0.1, 0.35, 1], dist: 330, caption: '串联这边偏暗' },
          chips: [{ label: '串联', sub: 'R = 20 Ω · I = 0.15 A' }, { label: '并联', sub: 'R = 5 Ω · I = 0.6 A' }],
        },
      ],
    },
  ],
}
