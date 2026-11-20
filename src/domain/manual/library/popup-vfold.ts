import { Vector3 } from 'three'
import type { Finish, ManualSpec, PartState, SpecPart, Vec3 } from '../types'
import { axisQuat, euler, round, type P2 } from './popup-kit'

/**
 * V 形折（V-fold）：按 Superplexus「V-Folds」的规则，一片对折的山峰跨在中缝上，两条粘贴边各粘一页。
 *
 * 坐标：A4 卡纸竖着对折成书，中缝沿 z 轴、在 x = 0。右页（base）平放 x ∈ [0, 148.5]；
 *   左页（page）绕中缝转，rot [0, 0, −φ]：φ = 0 摊平（伸向 −x）、90 竖直、180 合上，书页张角 = 180° − φ。
 * 山峰：底边 2G、高 H，中线是山脊（V 的折线），底边下面多 6 mm 粘贴边。尖顶点压在中缝 z = ZV 处，
 *   两条粘贴线和中缝各成 A_DEG = 45°；山脊和粘贴线成 90°（V 角 / 剪角）。合上时山脊朝 (cos a, 0, sin a) 平躺在右页上。
 * 打开时每片山峰只绕自己的粘贴线转（tab 留在书页上）：两片的山脊必须重合、并且都垂直于各自的粘贴线，
 *   所以山脊 = 两条粘贴线的叉积方向。每片转多少度（ψ）随 φ 非线性变化：关键帧按真实几何算，
 *   过渡途中两片各按自己的角度线性插值，山尖会稍微错开；按真实几何搜一个很小的先后时差把错位压到 1 mm 左右。
 * 纸片正面（+y）是空白的里面，背面是画了山的外面：合上时右片画面朝下贴着右页、左片画面朝上贴着左页。
 * 合上时从下往上：右页 [0, 0.3]、右片与它的粘贴边 [0.35, 0.65]、左片与它的粘贴边 [0.75, 1.05]、左页 [1.2, 1.5]。
 */
const PW = 148.5
const PD = 210
const A_DEG = 45
const H = 85
const G = 70
const ZV = 30
const TAB = 6
const HY = 0.75
const DEG = Math.PI / 180

const PAGE_AT: Vec3 = [0, HY, 0]
const VB: Vec3 = [0, 0.35, ZV]
const VM: Vec3 = [0, -0.3, ZV]
const TABLE: Vec3 = [235, 0, 45]

const a = A_DEG * DEG
const gB = new Vector3(Math.sin(a), 0, -Math.cos(a))
const gMl = new Vector3(-Math.sin(a), 0, -Math.cos(a))
const v0B = new Vector3(Math.cos(a), 0, Math.sin(a))
const v0Ml = new Vector3(-Math.cos(a), 0, Math.sin(a))
const QB0 = axisQuat([0, 1, 0], -(90 + A_DEG))
const QM0 = axisQuat([0, 1, 0], 90 + A_DEG)
const pageQ = (phi: number) => axisQuat([0, 0, 1], -phi)

/** 书页张到 φ 时山脊的方向（世界坐标）：同时垂直于两条粘贴线，朝书页里面 */
function ridge(phi: number) {
  const d = new Vector3().crossVectors(gB, gMl.clone().applyQuaternion(pageQ(phi)))
  if (d.length() < 1e-9) return v0B.clone()
  d.normalize()
  return d.dot(new Vector3(0, 1, 0).applyQuaternion(pageQ(phi / 2))) > 0 ? d : d.negate()
}
const signed = (g: Vector3, from: Vector3, to: Vector3) => Math.atan2(new Vector3().crossVectors(from, to).dot(g), from.dot(to)) / DEG

/** [右片绕粘贴线转的角度, 左片在左页坐标里绕粘贴线转的角度] */
function wingAngles(phi: number): [number, number] {
  const v = ridge(phi)
  return [signed(gB, v0B, v), signed(gMl, v0Ml, v.clone().applyQuaternion(pageQ(phi).invert()))]
}
const rotB = (phi: number) => euler(axisQuat(gB, wingAngles(phi)[0]).multiply(QB0))
const rotM = (phi: number) => euler(axisQuat(gMl, wingAngles(phi)[1]).multiply(QM0))

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 过渡途中两片山尖的最大错位（mm）：打开时山峰晚 lag 出发，合上时书页晚 lag 出发 */
function ridgeGap(phi0: number, phi1: number, lag: number) {
  const [b0, m0] = wingAngles(phi0)
  const [b1, m1] = wingAngles(phi1)
  const opening = phi1 < phi0
  let worst = 0
  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    const late = ease(Math.max(0, (t - lag) / (1 - lag)))
    const kp = opening ? ease(t) : late
    const kw = opening ? late : ease(t)
    const vb = v0B.clone().applyAxisAngle(gB, (b0 + (b1 - b0) * kw) * DEG)
    const vm = v0Ml.clone().applyAxisAngle(gMl, (m0 + (m1 - m0) * kw) * DEG).applyQuaternion(pageQ(phi0 + (phi1 - phi0) * kp))
    worst = Math.max(worst, vb.distanceTo(vm) * H)
  }
  return worst
}
function bestLag(phi0: number, phi1: number) {
  let best = { lag: 0, gap: ridgeGap(phi0, phi1, 0) }
  for (let lag = 0.005; lag <= 0.1; lag += 0.005) {
    const gap = ridgeGap(phi0, phi1, lag)
    if (gap < best.gap) best = { lag, gap }
  }
  return best.lag
}

/** 书页从 φ0 转到 φ1，两片山峰跟着转 */
function spread(phi0: number, phi1: number, T = 1.8): Record<string, PartState> {
  const lag = bestLag(phi0, phi1)
  const opening = phi1 < phi0
  const late = { delay: round(lag * T, 1000), dur: round((1 - lag) * T, 1000) }
  const early = { dur: T }
  return {
    page: { rot: [0, 0, -phi1], arc: { at: PAGE_AT, axis: [0, 0, opening ? 1 : -1] }, ...(opening ? early : late) },
    'wing-b': { rot: rotB(phi1), ...(opening ? late : early) },
    'wing-m': { rot: rotM(phi1), ...(opening ? late : early) },
  }
}

// 山峰轮廓（纸片局部 [x, z]，尖顶点在原点，山脊沿 −z）：左半是右片，右半是左片，左右略有不同更像真山
const SNOW_B: P2[] = [[0, -63], [-4, -67], [-9, -62], [-14, -66], [-6, -78], [0, -H]]
const WING_B: P2[] = [[0, 0], [-G, 0], [-62, -14], [-50, -30], [-42, -40], [-34, -37], [-24, -52], [-14, -66], [-9, -62], [-4, -67], [0, -63]]
const SNOW_M: P2[] = [[0, -63], [0, -H], [7, -77], [15, -65], [10, -61], [4, -66]]
const WING_M: P2[] = [[0, 0], [0, -63], [4, -66], [10, -61], [15, -65], [25, -50], [33, -41], [40, -45], [49, -32], [60, -17], [G, 0]]
const TAB_B: P2[] = [[-12, 0], [-18, TAB], [-(G - 8), TAB], [-(G - 2), 0]]
const TAB_M: P2[] = [[12, 0], [G - 2, 0], [G - 8, TAB], [18, TAB]]

// edges：右片 [粘贴线, 山坡 ×6, 雪线 ×3, 山脊]；左片 [山脊, 雪线 ×3, 山坡 ×6, 粘贴线]；雪顶的雪线画浅灰
const wingEdges = (glue: string, ridgeLine: string) => ({
  'wing-b': { edges: `${glue}hhhhhh---${ridgeLine}` },
  'snow-b': { edges: `ssshh${ridgeLine}` },
  'wing-m': { edges: `${ridgeLine}---hhhhhh${glue}` },
  'snow-m': { edges: `${ridgeLine}hhsss` },
})
// 卡片：右页 [上, 外, 下, 中缝]，左页 [上, 中缝, 下, 外]
const cardEdges = (gutter: string) => ({ base: { edges: `hhh${gutter}` }, page: { edges: `h${gutter}hh` } })

const merge = (...sets: Record<string, PartState>[]) => {
  const out: Record<string, PartState> = {}
  for (const s of sets) for (const [id, st] of Object.entries(s)) out[id] = { ...out[id], ...st }
  return out
}

/** 中缝上 45° 的铅笔线（俯视 [x, z]），和粘贴边一样长 */
function markLine(dir: Vector3): P2[] {
  const n = new Vector3(-dir.z, 0, dir.x).multiplyScalar(0.5)
  const p = (t: number, s: number): P2 => [round(dir.x * t + n.x * s), round(ZV + dir.z * t + n.z * s)]
  return [p(12, -1), p(G - 2, -1), p(G - 2, 1), p(12, 1)]
}

const INSIDE_B: Finish = { color: '#eef4e4', roughness: 0.9 }
const INSIDE_P: Finish = { color: '#dcebf7', roughness: 0.9 }
const OUTSIDE: Finish = { color: '#c9a77a', roughness: 0.85 }
const MOUNTAIN: Finish = { color: '#5c9e6c', roughness: 0.85 }
const SNOW: Finish = { color: '#fbfbf7', roughness: 0.8 }

const piece = (id: string, name: string, points: P2[], parent: string, extra: Partial<SpecPart> = {}): SpecPart => ({
  id, name, parent, visible: false,
  shape: { type: 'sheet', points, back: id.startsWith('snow') ? 'white' : 'warm', backFinish: id.startsWith('snow') ? SNOW : MOUNTAIN },
  fill: 'white', finish: 'paper',
  ...extra,
})

const parts: SpecPart[] = [
  {
    id: 'base', name: '卡片右页', spec: `${PW} × ${PD} mm · A4 卡纸对折`,
    shape: { type: 'sheet', points: [[0, -PD / 2], [PW, -PD / 2], [PW, PD / 2], [0, PD / 2]], back: 'warm', backFinish: OUTSIDE },
    fill: 'white', finish: INSIDE_B,
  },
  {
    id: 'page', name: '卡片左页', spec: `${PW} × ${PD} mm`, at: PAGE_AT, pivot: [0, -HY, 0],
    shape: { type: 'sheet', points: [[-PW, -PD / 2], [0, -PD / 2], [0, PD / 2], [-PW, PD / 2]], back: 'warm', backFinish: OUTSIDE },
    fill: 'white', finish: INSIDE_P,
  },
  piece('wing-b', '山峰右片', WING_B, 'base', { spec: `底 ${G} mm · 高 ${H} mm`, at: TABLE }),
  piece('snow-b', '右片雪顶', SNOW_B, 'wing-b'),
  piece('tab-b', '右片粘贴边', TAB_B, 'wing-b', { spec: `${TAB} mm 宽` }),
  piece('wing-m', '山峰左片', WING_M, 'base', { spec: `底 ${G} mm · 高 ${H} mm`, at: TABLE }),
  piece('snow-m', '左片雪顶', SNOW_M, 'wing-m'),
  piece('tab-m', '左片粘贴边', TAB_M, 'wing-m', { spec: `${TAB} mm 宽` }),
  {
    id: 'mark-b', name: '右页 45° 铅笔线', parent: 'base', at: [0, 0.31, 0], visible: false,
    shape: { type: 'sheet', points: markLine(gB), th: 0.02 }, fill: 'shade', finish: { color: '#8a8a8a' },
  },
  {
    id: 'mark-m', name: '左页 45° 铅笔线', parent: 'page', at: [0, -0.44, 0], visible: false,
    shape: { type: 'sheet', points: markLine(gMl), th: 0.02 }, fill: 'shade', finish: { color: '#8a8a8a' },
  },
  {
    id: 'glue', name: '固体胶', visible: false, rot: [0, -(90 + A_DEG), 0],
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 8, h: 70, axis: 'y', at: [0, 38, 0], fill: 'warm', finish: { color: '#7d5bc4', roughness: 0.45 } },
        { type: 'cylinder', r: 6.5, h: 3, axis: 'y', at: [0, 1.5, 0], fill: 'white', finish: 'paper' },
      ],
    },
  },
]

// 粘好、合上的样子：两条粘贴边各自粘在书页上，两片山峰在粘贴线上转
const GLUED = merge(cardEdges('h'), wingEdges('h', 'h'), {
  page: { rot: [0, 0, -180] },
  'wing-b': { visible: true, at: VB, rot: rotB(180) },
  'snow-b': { visible: true },
  'tab-b': { visible: true, parent: 'base', at: VB, rot: rotB(180) },
  'wing-m': { visible: true, parent: 'page', at: VM, rot: rotM(180) },
  'snow-m': { visible: true },
  'tab-m': { visible: true, parent: 'page', at: VM, rot: rotM(180) },
})

const MOUNTAIN_IDS = ['wing-b', 'snow-b', 'wing-m', 'snow-m']
const glueStart: Vec3 = (() => {
  const side = new Vector3(0, 0, 1).applyQuaternion(QB0).multiplyScalar(TAB / 2)
  return [round(gB.x * 18 + side.x), 1.1, round(ZV + gB.z * 18 + side.z)]
})()

const CORNER_VIEW = { target: [42, 42, 30] as Vec3, dir: [0.14, 0.26, 1] as Vec3, dist: 560 }
const FLAT_VIEW = { target: [0, 36, 0] as Vec3, dir: [0.15, 0.55, 1] as Vec3, dist: 620 }
const CLOSED_VIEW = { target: [72, 1, 0] as Vec3, dir: [0.25, 1, 0.65] as Vec3, dist: 560 }

export const popupVfold: ManualSpec = {
  id: 'popup-vfold',
  name: 'V 形折：弹起的山峰',
  desc: '一片对折的山峰跨着中缝粘在两页上，书一打开它就自己立起来——立体书里最常用的 V 形折。',
  category: '立体书',
  genre: 'tutorial',
  dims: { width: PW * 2, depth: PD, height: H },
  source: { title: 'Superplexus · V-Folds（V 形折的角度规则）', url: 'https://school.superplexus.com/3d-design/possible-projects/pop-up-book/mechanisms-1/v-folds', images: [] },
  package: [
    { name: '卡纸', qty: 2, spec: 'A4（210 × 297 mm），一张对折做书页，一张剪山峰；160–250 g 的卡纸最好' },
    { name: '剪刀', qty: 1 },
    { name: '固体胶或双面胶', qty: 1, spec: '只涂在 6 mm 粘贴边上' },
    { name: '铅笔、直尺、量角器', qty: 1, spec: '画中缝两边的 45° 线' },
    { name: '彩笔', qty: 1, spec: '山峰背面涂绿、山顶留白' },
  ],
  params: [
    { label: '粘贴角', value: `${A_DEG}°（粘贴线和中缝的夹角）`, note: '必须大于 0°、小于 V 角，否则山峰立不起来或者合不上' },
    { label: 'V 角', value: '90°（山脊和粘贴线的夹角）', note: 'Superplexus：90° 的 V 形折在书页摊平时正好垂直立着' },
    { label: '山峰', value: `底 ${G * 2} mm × 高 ${H} mm`, note: `合上时山尖离卡片下边 ${PD / 2 - ZV - round(H * Math.sin(a), 1)} mm，不露出卡外` },
    { label: '粘贴边', value: `${TAB} mm 宽（约 1/4 英寸）`, note: '离中缝留 12 mm 不涂胶，开合时尖角处才不会撕' },
    { label: '尖角位置', value: `压在中缝上，离卡片中心 ${ZV} mm`, note: '尖角偏离中缝，开合时纸片会被扭皱' },
    { label: '最佳张角', value: '90°–180°', note: `张到 180° 时山峰最高（${H} mm），张角越小山峰越往右页倒` },
  ],
  parts,
  initial: merge(cardEdges('-'), wingEdges('s', 's')),
  stageSize: 760,
  guides: [
    {
      id: 'make',
      title: '做一座会弹起的山',
      kind: 'assembly',
      steps: [
        {
          id: 'card', title: '对折出书页', desc: '把一张 A4 卡纸左右对折，压出中缝再摊平。中缝就是书脊，山峰的尖角要压在这条线上。',
          camera: { target: [20, 25, 0], dir: [0.25, 1, 0.9], dist: 640 },
          set: cardEdges('s'), highlight: ['base', 'page'],
          actions: [{ type: 'swing', part: 'page', axis: 'z', amp: -160, period: 3.6, clip: 'pos' }],
          chips: [{ label: '对折后', sub: `${PW} × ${PD} mm` }],
        },
        {
          id: 'cut', title: '画一座山，剪下来', desc: `在另一张卡纸上画山：底边 ${G * 2} mm、高 ${H} mm，中间竖一条山脊线，底边下面再多画 ${TAB} mm 宽的粘贴边，靠中间各空出 12 mm。沿外轮廓剪下，背面涂成绿色、山顶留白。`,
          camera: { target: [235, 0, 8], dir: [0.15, 1, 0.55], dist: 330 },
          set: Object.fromEntries(['wing-b', 'snow-b', 'tab-b', 'wing-m', 'snow-m', 'tab-m'].map((id) => [id, { visible: true }])),
          highlight: [...MOUNTAIN_IDS, 'tab-b', 'tab-m'],
          callouts: [
            { part: 'wing-b', text: '山脊线', sub: `高 ${H} mm`, at: [0, 0, -40], offset: [-30, 20, 0] },
            { part: 'tab-m', text: '粘贴边', sub: `${TAB} mm`, at: [40, 0, TAB], offset: [20, 10, 25] },
          ],
          chips: [{ label: '山峰', sub: `${G * 2} × ${H} mm` }],
        },
        {
          id: 'fold', title: '沿山脊对折，折出粘贴边', desc: '把山峰沿山脊线对折，画面朝外；再把两边的粘贴边沿底边折一下又摊平，留下折痕。',
          camera: { target: [220, 0, 8], dir: [0.6, 1, 0.6], dist: 330 },
          set: merge(wingEdges('h', 'h'), { 'wing-m': { at: [TABLE[0], 0.65, TABLE[2]], rot: [0, 0, 180], arc: { at: [TABLE[0], 0.325, TABLE[2]], axis: [0, 0, 1] }, dur: 1.5 } }),
          highlight: ['wing-m', 'snow-m', 'tab-m'],
        },
        {
          id: 'mark', title: '在书页上画 45° 线', desc: `从中缝上离卡片中心 ${ZV} mm 的一点出发，往两边各画一条和中缝成 ${A_DEG}° 的线。两条线左右对称，粘贴边就贴着它们。`,
          camera: { target: [0, 0, 5], dir: [0.1, 1, 0.55], dist: 380 },
          set: { 'mark-b': { visible: true }, 'mark-m': { visible: true } }, highlight: ['mark-b', 'mark-m'],
          callouts: [{ part: 'mark-b', text: `${A_DEG}°`, sub: '和中缝的夹角', at: [35, 0, ZV - 35], offset: [40, 10, 0] }],
          zoom: { target: [0, 0, ZV - 18], dir: [0.05, 1, 0.3], dist: 150, caption: '两条线从中缝同一点出发' },
        },
        {
          id: 'glue-1', title: '先粘右边的粘贴边', desc: '在下面那条粘贴边背面涂胶，把对折好的山峰平放到右页上：尖角对准中缝上那一点，粘贴边贴住右边的 45° 线。',
          camera: { target: [120, 0, 15], dir: [0.15, 1, 0.75], dist: 640 },
          set: {
            'wing-b': { at: VB, rot: rotB(180), lift: 40, dur: 1.8 },
            'wing-m': { at: [0, 1.05, ZV], rot: euler(QB0.clone().multiply(axisQuat([0, 0, 1], 180))), lift: 40, dur: 1.8 },
          },
          highlight: ['wing-b', 'tab-b'],
        },
        {
          id: 'glue-2', title: '在上面的粘贴边涂胶', desc: '右边粘稳后，在朝上的那条粘贴边正面涂一层胶。别涂到山峰上，只涂 6 mm 宽的那一条。',
          camera: { target: [28, 2, 10], dir: [0.55, 1, 0.75], dist: 300 },
          set: {
            'tab-b': { parent: 'base', at: VB, rot: rotB(180) },
            'mark-b': { visible: false }, 'mark-m': { visible: false },
            glue: { visible: true, at: glueStart },
          },
          highlight: ['tab-m'],
          actions: [{ type: 'slide', part: 'glue', axis: 'x', amp: -44, period: 2.2, clip: 'pos' }],
        },
        {
          id: 'close', title: '合上书页', desc: '收起胶棒，把左页合上压到山峰上。左边的粘贴边就粘在了左页上，位置自动和右边对称。',
          camera: { target: [20, 45, 0], dir: [0.3, 0.75, 1], dist: 720 },
          set: merge(cardEdges('h'), {
            glue: { visible: false, dur: 0.3 },
            page: { rot: [0, 0, -180], arc: { at: PAGE_AT, axis: [0, 0, -1] }, dur: 2, delay: 0.3 },
          }),
          highlight: ['page'],
        },
        {
          id: 'press', title: '压紧，等胶干', desc: '隔着书页用手掌压住粘贴边的位置十几秒，让胶粘牢。这时山峰被压平在两页之间，从外面完全看不到。',
          camera: CLOSED_VIEW,
          set: {
            'wing-m': { parent: 'page', at: VM, rot: rotM(180) },
            'tab-m': { parent: 'page', at: VM, rot: rotM(180) },
          },
          highlight: ['page'],
          chips: [{ label: '压', sub: '10–15 秒' }],
        },
        {
          id: 'open-90', title: '打开到 90°：山峰抬头', desc: '慢慢打开书页。两条粘贴边被两页拉着往外走，山脊就从右页上抬起来，张到 90° 时斜斜地伸向你。',
          camera: CORNER_VIEW, set: spread(180, 90, 2), highlight: MOUNTAIN_IDS,
        },
        {
          id: 'open-flat', title: '摊平到 180°：山峰立直', desc: `继续打开到完全摊平，山脊竖直立起 ${H} mm，两片山坡对着你张开，像一座站在书页上的山。`,
          camera: FLAT_VIEW, set: spread(90, 0, 2), highlight: MOUNTAIN_IDS,
          tip: '如果山峰立不直或者往一边歪，检查两条粘贴线是不是左右对称、尖角是不是正好压在中缝上。',
        },
      ],
    },
    {
      id: 'motion',
      title: '开合演示：角度是怎么决定的',
      kind: 'usage',
      start: GLUED,
      steps: [
        {
          id: 'a45', title: '张开 45°：山峰贴着右页', desc: '书页刚打开时，山峰还几乎平躺在右页上，只是山脊慢慢翘起。',
          camera: { target: [55, 26, 30], dir: [0.16, 0.32, 1], dist: 520 }, set: spread(180, 135), highlight: MOUNTAIN_IDS,
        },
        {
          id: 'a90', title: '张开 90°：山脊斜着伸出来', desc: '张到 90° 时，山脊指向两页中间的斜上方，正对着翻书的人。',
          camera: CORNER_VIEW, set: spread(135, 90), highlight: MOUNTAIN_IDS,
        },
        {
          id: 'a135', title: '张开 135°：越来越直', desc: '书页越摊开，两条粘贴线越往两边分开，把山脊越往上拉。',
          camera: { target: [12, 42, 25], dir: [0.1, 0.42, 1], dist: 580 }, set: spread(90, 45), highlight: MOUNTAIN_IDS,
        },
        {
          id: 'a180', title: '摊平 180°：垂直站立', desc: `书页摊平时，两条 ${A_DEG}° 粘贴线正好成直角，90° V 角的山脊被拉成竖直，山峰垂直站在书页上，高 ${H} mm。`,
          camera: FLAT_VIEW, set: spread(45, 0), highlight: MOUNTAIN_IDS,
          chips: [{ label: '山高', sub: `${H} mm` }],
        },
        {
          id: 'why', title: '原理：粘贴角要小于 V 角', desc: `从上往下看：粘贴线和中缝成 ${A_DEG}°，山脊和粘贴线成 90°（V 角）。只有粘贴角小于 V 角，打开时山脊才会被往上推；粘贴角越接近 V 角，山峰站得越低、越往前倒。`,
          camera: { target: [0, 30, 8], dir: [0.04, 1, 0.3], dist: 400 },
          highlight: ['tab-b', 'tab-m'],
          callouts: [
            { part: 'tab-b', text: `粘贴角 ${A_DEG}°`, sub: '和中缝的夹角', at: [-40, 0, TAB], offset: [55, 0, -20] },
            { part: 'tab-m', text: `粘贴角 ${A_DEG}°`, sub: '左右对称', at: [40, 0, TAB], offset: [-55, 0, -20] },
            { part: 'snow-b', text: 'V 角 90°', sub: '山脊 ⊥ 粘贴线', at: [0, 0, -H], offset: [30, 30, 10] },
          ],
          chips: [{ label: '规则', sub: `0° < 粘贴角 ${A_DEG}° < V 角 90°` }],
        },
        {
          id: 'close', title: '合上：整片藏进书里', desc: `合上时两片山峰压平在两页之间，山尖停在离卡片下边 ${PD / 2 - ZV - round(H * Math.sin(a), 1)} mm 的地方。设计时先合着画一遍：任何一部分都不能超出卡片轮廓。`,
          camera: CLOSED_VIEW, set: spread(0, 180, 2.4), highlight: MOUNTAIN_IDS,
          tip: '尖角离卡片中心越远（往下边挪），合上时山尖越容易露出卡外。',
        },
      ],
    },
  ],
}
