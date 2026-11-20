import type { Action, CameraSpec, Fill, Finish, ManualSpec, Shape, SpecPart, Vec3 } from '../types'

/**
 * 牛顿摆：五个 Ø40 mm 钢球，各用两根线 V 字形挂在两根平行横杆上（双线摆，只能在 xy 平面里摆）。
 * 参考 Virginia Tech Physics Demonstrations Wiki · Newton's Cradle（动量守恒 + 动能守恒决定「进几个出几个」）。
 *
 * 坐标：毫米，y 向上，地面 y = 0，观众在 +z。摆轴在 y = Y_P、z = ±D 的两根横杆上，摆长 L 从轴量到球心。
 * 每个摆的原点在摆轴上（零件旋转中心），rot z 为负 = 往左（-x）拉起。
 * 松手的写法：状态用 0.001 s 瞬间回到竖直，swing 动作的相位 0.75 让波形从 -1 开始（正好从拉起的角度松手），
 * clip 'neg' / 'pos' 让左边的球只在左半边摆、右边的球只在右半边摆，周期 T = 2π√(L/g)。
 * 推断：球之间留 1 mm 间隙（审计把球当方块，两球一起拉到 15° 时方块不会互相穿插；看上去仍是挨着的）。
 */

type Item = Extract<Shape, { type: 'compound' }>['items'][number]
interface Opt { rot?: Vec3; fill?: Fill; finish?: Finish }
const box = (size: Vec3, at: Vec3, o: Opt & { chamfer?: number } = {}): Item => ({ type: 'box', size, at, ...o })
const cyl = (r: number, h: number, at: Vec3, axis: 'x' | 'y' | 'z' = 'y', o: Opt & { r2?: number } = {}): Item => ({ type: 'cylinder', r, h, axis, at, ...o })

const DEG = Math.PI / 180
const r2 = (v: number) => Math.round(v * 100) / 100

const R_B = 20
const L = 200
const Y_P = 280
const D = 60
const GAP = 41
const XS = [-2, -1, 0, 1, 2].map((k) => k * GAP)
const T = r2(2 * Math.PI * Math.sqrt(L / 1000 / 9.8) * 1000) / 1000
const PULL1 = 30
const PULL2 = 15
/** 截图在动作开始后约 0.47 s：从竖直开始的摆延后这么多，截到的正好是最高点 */
const PEAK_DELAY = r2(0.47 - T / 4)

const STRING_TOP = L - R_B - 4
const STRING = r2(Math.hypot(STRING_TOP, D))
const PHI = r2(Math.atan2(D, STRING_TOP) / DEG)

const DARK: Finish = 'plastic-black'

const frame: SpecPart = {
  id: 'frame', name: '支架', spec: '520 × 200 mm 木底座 · 镀铬立柱和横杆',
  shape: {
    type: 'compound',
    items: [
      { type: 'slab', w: 520, d: 200, h: 20, r: 10, at: [0, 0, 0], fill: 'warm', finish: 'wood' },
      ...[-210, 210].flatMap((x) => [-D, D].flatMap((z) => [cyl(5, Y_P + 10 - 20, [x, 20 + (Y_P - 10) / 2, z]), cyl(7, 8, [x, Y_P + 12, z])])),
      cyl(4.5, 436, [0, Y_P, D], 'x'),
      cyl(4.5, 436, [0, Y_P, -D], 'x'),
    ],
  },
  fill: 'shade', finish: 'steel',
}

const pendulum = (i: number): SpecPart => ({
  id: `p${i + 1}`, name: `钢球 ${i + 1}`, spec: `Ø${2 * R_B} mm 钢球 · 约 263 g · 摆长 ${L} mm`, parent: 'frame',
  shape: {
    type: 'compound',
    items: [
      cyl(0.8, STRING, [0, -STRING_TOP / 2, D / 2], 'y', { rot: [PHI, 0, 0], fill: 'dark', finish: DARK }),
      cyl(0.8, STRING, [0, -STRING_TOP / 2, -D / 2], 'y', { rot: [-PHI, 0, 0], fill: 'dark', finish: DARK }),
      cyl(3, 6, [0, -L + R_B + 3, 0]),
      box([2 * R_B, 2 * R_B, 2 * R_B], [0, -L, 0], { chamfer: R_B, fill: 'white' }),
    ],
  },
  at: [XS[i], Y_P, 0], fill: 'shade', finish: 'steel',
})

const lengthBar: SpecPart = {
  id: 'len', name: '摆长 L', parent: 'frame',
  shape: { type: 'compound', items: [box([1.4, L, 1.4], [0, -L / 2, 0]), box([14, 1.4, 1.4], [0, 0, 0]), box([14, 1.4, 1.4], [0, -L, 0])] },
  at: [XS[4], Y_P, D + 12], fill: 'dark', finish: { color: '#d6452c', roughness: 0.5 }, visible: false,
}

const balls = ['p1', 'p2', 'p3', 'p4', 'p5']
const swing = (part: string, amp: number, clip?: 'pos' | 'neg', fromPeak = true): Action => ({
  type: 'swing', part, axis: 'z', amp, period: T, ...(clip ? { clip } : {}), ...(fromPeak ? { phase: 0.75 } : { delay: PEAK_DELAY }),
})
const one: Action[] = [swing('p1', PULL1, 'neg'), swing('p5', PULL1, 'pos')]
const two: Action[] = [swing('p1', PULL2, 'neg'), swing('p2', PULL2, 'neg'), swing('p4', PULL2, 'pos'), swing('p5', PULL2, 'pos')]
const three: Action[] = [swing('p1', PULL2, 'neg'), swing('p2', PULL2, 'neg'), swing('p3', PULL2), swing('p4', PULL2, 'pos'), swing('p5', PULL2, 'pos')]
const together: Action[] = balls.map((b) => swing(b, 4, undefined, false))

const pulled = (ids: string[], deg: number) => Object.fromEntries(ids.map((id) => [id, { rot: [0, 0, -deg] as Vec3, dur: 1.2 }]))
const release = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { rot: [0, 0, 0] as Vec3, dur: 0.001 }]))
const ball = (): Vec3 => [0, -L, R_B]

const FRONT: CameraSpec = { target: [0, 175, 0], dir: [0.18, 0.28, 1], dist: 1000 }

const h1 = r2(L * (1 - Math.cos(PULL1 * DEG)))
const v1 = r2(Math.sqrt(2 * 9.8 * h1 / 1000))
const h2 = r2(L * (1 - Math.cos(PULL2 * DEG)))

export const physicsNewtonCradle: ManualSpec = {
  id: 'physics-newton-cradle',
  name: '牛顿摆：动量和动能一起守恒',
  desc: '拉起一个球撞过去，另一头就弹出一个；拉两个出两个。看懂弹性碰撞里动量和动能怎么一起传过去。',
  category: '物理原理',
  genre: 'tutorial',
  dims: { width: 520, depth: 200, height: 300 },
  source: { title: "Virginia Tech Physics · Demonstrations Wiki · Newton's Cradle", url: 'https://www.phys.vt.edu/outreach/projects-and-demos/demonstrations-wiki/mechanics/newtons-cradle.html', images: [] },
  package: [
    { name: '钢球', qty: 5, spec: `Ø${2 * R_B} mm，约 263 g，大小质量完全一样` },
    { name: '细线', qty: 10, spec: '每个球两根，V 字形挂住' },
    { name: '支架', qty: 1, spec: `两根平行横杆，相距 ${2 * D} mm，高 ${Y_P} mm` },
  ],
  params: [
    { label: '动量守恒', value: 'm·v = m·v′', note: '碰撞前后总动量不变' },
    { label: '动能守恒', value: '½m·v² = ½m·v′²', note: '钢球几乎是弹性碰撞；两条一起满足，只能是「进几个出几个、速度不变」' },
    { label: '为什么不是两个球各 v/2', value: '¼m·v² ≠ ½m·v²', note: '动量 2m·(v/2) = mv 对得上，动能却只剩一半' },
    { label: '摆的周期', value: 'T = 2π√(L/g)', note: `L = ${L / 1000} m：T = 2π√(0.2 / 9.8) ≈ ${T.toFixed(2)} s，和球的质量、摆幅（小角度时）无关` },
    { label: '拉起 30° 时', value: `h = L(1 − cos30°) ≈ ${h1} mm`, note: `撞击速度 v = √(2gh) ≈ ${v1} m/s，动能 mgh ≈ 0.069 J` },
    { label: '能量损失', value: '每撞一次约损失 2%', note: '钢球恢复系数约 0.99；变成咔嗒声、热，再加空气阻力和线的摩擦' },
  ],
  parts: [frame, ...XS.map((_, i) => pendulum(i)), lengthBar],
  stageSize: 1400,
  finishes: { white: 'steel', shade: 'steel', dark: 'plastic-black', warm: 'wood' },
  guides: [
    {
      id: 'one',
      title: '一个进，一个出',
      kind: 'usage',
      steps: [
        {
          id: 'intro', title: '五个一样的钢球挂成一排',
          desc: `五个 Ø${2 * R_B} mm 钢球一样大、一样重，挂成一排刚好挨着。每个球用两根线拉成 V 字挂在前后两根横杆上：这样球只能左右摆，不会前后晃，也不会转圈。从横杆到球心的摆长 L = ${L} mm。`,
          camera: FRONT, highlight: balls,
          callouts: [
            { part: 'frame', text: '两根平行横杆', sub: `前后相距 ${2 * D} mm`, at: [-100, Y_P, D], offset: [-20, 90, 0] },
            { part: 'p5', text: '双线吊挂', sub: 'V 字形，只能左右摆', at: [0, -STRING_TOP / 2, D / 2], offset: [70, 100, 0] },
            { part: 'p3', text: '五个相同的钢球', sub: `Ø${2 * R_B} mm · 约 263 g`, at: ball(), offset: [0, -120, 0] },
          ],
          zoom: { target: [XS[4], 190, 0], dir: [1, 0.12, 0.04], dist: 640, caption: '侧面看：两根线拉成 V 字' },
        },
        {
          id: 'pull', title: `拉起左边一个球到 ${PULL1}°`,
          desc: `把最左边的球拉起 ${PULL1}°，它升高 h = L(1 − cos${PULL1}°) ≈ ${h1} mm，存下重力势能 mgh ≈ 0.069 J。其余四个球还挨在一起不动。`,
          camera: FRONT,
          set: pulled(['p1'], PULL1), highlight: ['p1'],
          callouts: [
            { part: 'p1', text: `拉起 ${PULL1}°`, sub: `升高 ${h1} mm`, at: ball(), offset: [20, 130, 0] },
            { part: 'p3', text: '其余四个不动', at: ball(), offset: [0, -120, 0] },
          ],
          chips: [{ label: '势能', sub: 'mgh ≈ 0.263 kg × 9.8 × 0.0268 m ≈ 0.069 J' }],
        },
        {
          id: 'release', title: '松手：撞进去一个，弹出来一个',
          desc: `松手后球摆下来，以 v ≈ ${v1} m/s 撞上第二个球，自己几乎停住；中间三个球纹丝不动，最右边那个球却以同样的速度弹出去，摆到同样的高度，再回来撞，左边的又弹出去……动量和动能一个接一个传过去。`,
          camera: FRONT,
          set: release(['p1']), highlight: ['p1', 'p5'], actions: one,
          callouts: [
            { part: 'p1', text: '撞进去 1 个', sub: `v ≈ ${v1} m/s`, at: ball(), offset: [-110, 50, 0] },
            { part: 'p5', text: '弹出来 1 个', sub: '速度、高度都一样', at: ball(), offset: [110, 70, 0] },
            { part: 'p3', text: '中间三个不动', sub: '只把冲击传过去', at: ball(), offset: [0, -120, 0] },
          ],
          chips: [{ label: '动量', sub: 'mv → mv' }, { label: '动能', sub: '½mv² → ½mv²' }],
          tip: '为什么不是两个球各带 v/2 弹出去？动量 2m·(v/2) = mv 没问题，可动能 2 × ½m(v/2)² = ¼mv²，只剩一半 —— 钢球碰撞几乎不损失动能，两条守恒同时成立，答案只能是一个球、速度 v。',
        },
        {
          id: 'period', title: `周期 T = 2π√(L/g) ≈ ${T.toFixed(2)} s`,
          desc: `每个球只摆半边：左边的球从最高点摆下来、撞完停住用 T/4，右边的球弹出去再回来用 T/2，左边的球再被撞起来用 T/4 —— 一来一回正好一个周期。L = 0.2 m 时 T = 2π√(0.2 / 9.8) ≈ ${T.toFixed(2)} s，和球多重、拉多高（小角度时）都没关系。`,
          camera: FRONT,
          set: { len: { visible: true } }, highlight: ['len', 'p1', 'p5'], actions: one,
          callouts: [
            { part: 'len', text: `L = ${L} mm`, sub: '横杆到球心', at: [0, -L / 2, 0], offset: [130, 30, 0] },
            { part: 'p1', text: '左半边', sub: '½ 个周期', at: ball(), offset: [-110, 50, 0] },
          ],
          chips: [{ label: 'T', sub: `2π√(L/g) ≈ ${T.toFixed(2)} s` }, { label: '每边', sub: `T/2 ≈ ${(T / 2).toFixed(2)} s` }, { label: `${PULL1}° 时`, sub: '实际约长 1.7%' }],
          tip: '摆长变成 4 倍，周期才变成 2 倍；在月球上 g 只有地球的 1/6，同一个牛顿摆会慢 2.4 倍。',
        },
      ],
    },
    {
      id: 'more',
      title: '两个、三个，和慢慢停下',
      kind: 'usage',
      steps: [
        {
          id: 'pull-two', title: `一起拉起左边两个球`,
          desc: `把左边两个球一起拉起 ${PULL2}°（升高约 ${h2} mm）。它们挨在一起，摆下来时速度相同，相当于一个两倍质量的「大球」。`,
          camera: FRONT,
          set: pulled(['p1', 'p2'], PULL2), highlight: ['p1', 'p2'],
          callouts: [{ part: 'p1', text: `两个一起拉起 ${PULL2}°`, at: ball(), offset: [-20, -110, 0] }],
        },
        {
          id: 'release-two', title: '撞进去两个，弹出来两个',
          desc: '松手后两个球一起撞过去，另一头就弹出两个，而不是一个球以两倍速度飞出去。一个球带 2v 出去，动量 m·2v = 2mv 守恒，动能却变成 ½m(2v)² = 2mv²，是原来 mv² 的两倍 —— 能量不可能凭空变多。',
          camera: FRONT,
          set: release(['p1', 'p2']), highlight: ['p1', 'p2', 'p4', 'p5'], actions: two,
          callouts: [
            { part: 'p2', text: '进 2 个', at: ball(), offset: [-150, 50, 0] },
            { part: 'p4', text: '出 2 个', at: ball(), offset: [150, 70, 0] },
          ],
          chips: [{ label: '动量', sub: '2mv → 2mv' }, { label: '动能', sub: 'mv² → mv²' }],
        },
        {
          id: 'pull-three', title: '再拉起三个',
          desc: `这次把左边三个球一起拉起 ${PULL2}°，只剩右边两个挨着不动。`,
          camera: FRONT,
          set: pulled(['p1', 'p2', 'p3'], PULL2), highlight: ['p1', 'p2', 'p3'],
          callouts: [{ part: 'p2', text: `三个一起拉起 ${PULL2}°`, at: ball(), offset: [-20, -110, 0] }],
        },
        {
          id: 'release-three', title: '进三个，出三个：中间那个两边跑',
          desc: '三个撞进去，右边就出三个 —— 可右边只有两个静止的球，所以中间那个球撞完不停，接着往右摆，和右边两个一起出去。回来时又带着它往左。规律一直是：进几个，出几个。',
          camera: FRONT,
          set: release(['p1', 'p2', 'p3']), highlight: ['p3', 'p4', 'p5'], actions: three,
          callouts: [
            { part: 'p3', text: '中间这个两边都跑', sub: '左边进来、右边出去', at: ball(), offset: [0, -120, 0] },
            { part: 'p5', text: '出 3 个', at: ball(), offset: [140, 70, 0] },
          ],
          chips: [{ label: '进', sub: '3 个' }, { label: '出', sub: '3 个' }],
        },
        {
          id: 'decay', title: '为什么会慢慢停下来',
          desc: '真实的牛顿摆不会永远撞下去。每撞一次都有一点动能变成咔嗒声和热（钢球的恢复系数约 0.99，每次损失约 2%），空气阻力和线在横杆上的摩擦也在消耗能量。撞得久了，运动在五个球之间越分越散，最后变成五个球一起小幅摆动，越摆越低，直到停下。',
          camera: FRONT, highlight: balls, actions: together,
          callouts: [
            { part: 'p1', text: '声音和热', sub: '每撞一次约损失 2%', at: ball(), offset: [-130, 60, 0] },
            { part: 'p5', text: '空气阻力 · 线的摩擦', at: ball(), offset: [60, 110, 0] },
          ],
          chips: [{ label: '恢复系数', sub: 'e ≈ 0.99' }, { label: '每撞一次', sub: '动能剩 e² ≈ 98%' }, { label: '100 次后', sub: '约剩 0.98¹⁰⁰ ≈ 13%' }],
        },
      ],
    },
  ],
}
