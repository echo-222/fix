import type { Finish, ManualSpec, PartState, SpecPart, Vec3 } from '../types'
import { rect } from './popup-kit'

/**
 * 平行折（Box / Step / Parallel fold）：按 Robert Sabuda「Single Sheet Layer」的做法，一张卡纸、两刀、不用胶。
 * 8½ × 11 英寸卡纸横向对折成 216 × 139.5 mm，从折边剪两条 2 英寸（51 mm）的平行口，把中间的小条推进卡片里，打开到 90° 弹出一个小盒子。
 *
 * 坐标：中缝沿 x 轴、在 z = 0。下半张（base）平放在桌面上，z ∈ [0, D] 朝观众；上半张（page）绕中缝转，
 *   rot [α, 0, 0]：α = 0 摊平（伸向 -z）、90 竖直、180 合上，卡片张角 θ = 180° − α。
 * 小条是两块纸：A（盒子前面）挂在 base 上、铰链在 z = L；B（盒子顶面）挂在 page 上、铰链在 page 局部 z = −L。
 *   推进去以后 A 和 page 同角度转（rot α），B 在 page 上反着转同样的角度（rot −α）：A 始终 ∥ page、B 始终 ∥ base，
 *   中缝、两条铰链、盒子棱四条线围成边长 L 的平行四边形。三块纸的 dur / delay 相同，过渡途中也严格成立。
 * 纸厚 0.3 mm。三条转轴都抬高（pivot 再把纸面放回原处），合上时从下往上依次是：
 *   底页 [0, 0.3]、装饰卡 [0.35, 0.65]、A [0.7, 1.0]、B [1.05, 1.35]、上页 [1.4, 1.7]，每层之间留 0.05 mm。
 */
const W = 216
const D = 139.5
const L = 51
const CUT_GAP = 64
const HY = 0.85
const hw = CUT_GAP / 2

const INSIDE: Finish = 'paper'
const OUTSIDE: Finish = { color: '#3f7fc4', roughness: 0.85 }

const PAGE_AT: Vec3 = [0, HY, 0]
const A_AT: Vec3 = [0, 0.5, L]
const A_PIVOT: Vec3 = [0, -0.5, 0]
const B_AT: Vec3 = [0, -0.525, -L]
const B_PIVOT: Vec3 = [0, -0.325, 0]
const DECO_AT: Vec3 = [0, -0.15, -L / 2]
const PAPER_TOP = 2 * HY

/** 刀 / 铅笔向后倾 35°：零件局部坐标不转，只把各块形体按倾角摆好，slide 沿 z 走就是沿剪口走 */
const TILT = 35
const tilt = (y: number, z: number): Vec3 => {
  const t = (TILT * Math.PI) / 180
  return [0, Math.round((y * Math.cos(t) - z * Math.sin(t)) * 100) / 100, Math.round((y * Math.sin(t) + z * Math.cos(t)) * 100) / 100]
}

// edges：base [左中缝, 左剪口, A 铰链, 右剪口, 右中缝, 右边, 前边, 左边]；page [左边, 上边, 右边, 右中缝, 右剪口, B 铰链, 左剪口, 左中缝]
// A [左剪口, 盒棱, 右剪口, 铰链]；B [铰链, 右剪口, 盒棱, 左剪口]
const EDGES = {
  flat: { base: '-----hhh', page: 'hhh-----', 'flap-a': '----', 'flap-b': '----' },
  folded: { base: 'h---hhhh', page: 'hhhh---h', 'flap-a': '-h--', 'flap-b': '--h-' },
  marked: { page: 'hhhhs-sh', 'flap-b': '-shs' },
  cutLeft: { base: 'hh--hhhh', page: 'hhhhs-hh', 'flap-a': 'hh--', 'flap-b': '-shh' },
  cutRight: { base: 'hh-hhhhh', page: 'hhhhh-hh', 'flap-a': 'hhh-', 'flap-b': '-hhh' },
  done: { base: 'hhhhhhhh', page: 'hhhhhhhh', 'flap-a': 'hhhh', 'flap-b': 'hhhh' },
}
const edges = (e: Record<string, string>): Record<string, PartState> => Object.fromEntries(Object.entries(e).map(([id, s]) => [id, { edges: s }]))
const merge = (...sets: Record<string, PartState>[]) => {
  const out: Record<string, PartState> = {}
  for (const s of sets) for (const [id, st] of Object.entries(s)) out[id] = { ...out[id], ...st }
  return out
}

/** 卡片从 α0 转到 α1；popped = 小条已经推进去（A、B 跟着成平行四边形） */
function swing(a0: number, a1: number, popped: boolean, dur = 1.6): Record<string, PartState> {
  const s = a1 >= a0 ? 1 : -1
  const set: Record<string, PartState> = { page: { rot: [a1, 0, 0], arc: { at: PAGE_AT, axis: [s, 0, 0] }, dur } }
  if (popped) {
    set['flap-a'] = { rot: [a1, 0, 0], arc: { at: A_AT, axis: [s, 0, 0] }, dur }
    set['flap-b'] = { rot: [-a1, 0, 0], arc: { at: B_AT, axis: [-s, 0, 0] }, dur }
  }
  return set
}

// 往上翻折小条时两层一起绕「最上面那层的表面、z = L」这条线转：A 在 base 坐标、B 在合上的 page 坐标里各算一次终点
const CREASE_W: Vec3 = [0, PAPER_TOP + 0.05, L]
const CREASE_B: Vec3 = [0, -(CREASE_W[1] - HY), -L]
const flipY = (p: Vec3, c: Vec3): Vec3 => [p[0], Math.round((2 * c[1] - p[1]) * 100) / 100, 2 * c[2] - p[2]]

const card = (id: 'base' | 'page'): SpecPart => ({
  id,
  name: id === 'base' ? '卡片下半张' : '卡片上半张',
  spec: `${W} × ${D} mm · 8½ × 11 英寸卡纸对折`,
  shape: {
    type: 'sheet',
    points: id === 'base'
      ? [[-W / 2, 0], [-hw, 0], [-hw, L], [hw, L], [hw, 0], [W / 2, 0], [W / 2, D], [-W / 2, D]]
      : [[-W / 2, 0], [-W / 2, -D], [W / 2, -D], [W / 2, 0], [hw, 0], [hw, -L], [-hw, -L], [-hw, 0]],
    back: 'warm', backFinish: OUTSIDE,
  },
  ...(id === 'page' ? { at: PAGE_AT, pivot: [0, -HY, 0] as Vec3 } : {}),
  fill: 'white', finish: INSIDE,
})

const parts: SpecPart[] = [
  card('base'),
  card('page'),
  {
    id: 'flap-a', name: '小条 · 盒子前面', spec: `${CUT_GAP} × ${L} mm`, parent: 'base', at: A_AT, pivot: A_PIVOT,
    shape: { type: 'sheet', points: [[-hw, 0], [-hw, -L], [hw, -L], [hw, 0]], back: 'warm', backFinish: OUTSIDE },
    fill: 'white', finish: INSIDE,
  },
  {
    id: 'flap-b', name: '小条 · 盒子顶面', spec: `${CUT_GAP} × ${L} mm`, parent: 'page', at: B_AT, pivot: B_PIVOT,
    shape: { type: 'sheet', points: [[-hw, 0], [hw, 0], [hw, L], [-hw, L]], back: 'warm', backFinish: OUTSIDE },
    fill: 'white', finish: INSIDE,
  },
  {
    id: 'deco', name: '装饰卡', spec: '52 × 40 mm 彩色卡纸', parent: 'flap-a', at: [0, 30, -L / 2], visible: false,
    shape: { type: 'sheet', points: rect(52, 40), back: 'shade' }, fill: 'warm', finish: { color: '#e0533d', roughness: 0.8 },
  },
  { id: 'deco-text', name: '祝福语', parent: 'deco', at: [0, 0.35, 1], rot: [-90, 0, 0], shape: { type: 'text', text: '生日快乐', size: 7.5 } },
  {
    id: 'pencil', name: '铅笔', visible: false, at: [hw, PAPER_TOP + 0.05, 0],
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 3.5, r2: 0.4, h: 14, axis: 'z', at: tilt(0, -7), rot: [TILT, 0, 0], fill: 'shade', finish: 'wood' },
        { type: 'cylinder', r: 3.5, h: 120, axis: 'z', at: tilt(0, -74), rot: [TILT, 0, 0], fill: 'warm', finish: { color: '#f2a516', roughness: 0.6 } },
      ],
    },
  },
  {
    id: 'knife', name: '美工刀', visible: false, at: [-hw, 0.1, 0],
    shape: {
      type: 'compound',
      items: [
        { type: 'poly', points: [[0, 0], [7, -3], [7, -22], [2.5, -22]], h: 0.6, at: [0.3, 0, 0], rot: [TILT, 0, 90], fill: 'shade', finish: 'steel' },
        { type: 'box', size: [11, 13, 95], at: tilt(4.5, -67.5), rot: [TILT, 0, 0], fill: 'warm', finish: { color: '#f2b705', roughness: 0.5 } },
      ],
    },
  },
]

const POPPED = merge(edges(EDGES.done), {
  page: { rot: [90, 0, 0] }, 'flap-a': { rot: [90, 0, 0] }, 'flap-b': { rot: [-90, 0, 0] },
  deco: { visible: true, at: DECO_AT },
})

const BOX_VIEW = { target: [0, 32, 40] as Vec3, dir: [0.75, 0.5, 1] as Vec3, dist: 470 }
const CLOSED_VIEW = { target: [0, 1, D / 2] as Vec3, dir: [0.35, 1, 0.8] as Vec3, dist: 430 }
const CUT_VIEW = { target: [0, 14, 12] as Vec3, dir: [0.55, 1, 0.75] as Vec3, dist: 340 }

export const popupParallel: ManualSpec = {
  id: 'popup-parallel',
  name: '平行折：弹出小盒子',
  desc: '一张卡纸剪两刀、往里一推，打开到 90° 就弹出一个小方盒——立体书最基础的平行折。',
  category: '立体书',
  genre: 'tutorial',
  dims: { width: W, depth: D, height: L },
  source: { title: 'Robert Sabuda · Single Sheet Layer（单张纸的平行折）', url: 'https://www.robertsabuda.com/8203single-sheet-layer.html', images: [] },
  package: [
    { name: '卡纸', qty: 1, spec: '8½ × 11 英寸（216 × 279 mm）厚卡纸或美术纸；A4 卡纸也一样' },
    { name: '剪刀或美工刀', qty: 1, spec: '从折边往里剪，两层一起剪开' },
    { name: '铅笔、直尺', qty: 1, spec: '画两条一样长的线' },
    { name: '装饰材料', qty: 1, spec: '可选：彩纸、贴纸、固体胶，贴在盒子正面' },
  ],
  params: [
    { label: '难度', value: '入门 · 不用胶', note: 'Sabuda 推荐给第一次做立体书的小朋友' },
    { label: '卡片', value: `对折后 ${W} × ${D} mm`, note: '8½ × 11 英寸卡纸横向对折' },
    { label: '剪口', value: '两条平行线，一样长', note: '本例 2 英寸 ≈ 51 mm、相距 64 mm；美国女性艺术博物馆的教程建议 2–3 英寸' },
    { label: '盒子尺寸', value: `高 = 深 = 剪口长 ${L} mm`, note: '宽度 = 两刀间距；两刀越近，盒子越窄' },
    { label: '不露出卡外', value: `剪口长 ≤ 卡片高度的一半（${D / 2} mm）`, note: `合上时盒子折平，伸到离中缝 2 × 剪口长 = ${2 * L} mm 处` },
    { label: '最佳打开角度', value: '90°', note: '摊平到 180° 时盒子会被拉平，所以平行折适合立在桌上看的卡片' },
  ],
  parts,
  initial: edges(EDGES.flat),
  stageSize: 700,
  guides: [
    {
      id: 'make',
      title: '做一个弹出小盒子',
      kind: 'assembly',
      steps: [
        {
          id: 'paper', title: '准备一张卡纸', desc: '取一张 8½ × 11 英寸（216 × 279 mm）的卡纸横着放。卡纸比打印纸硬，弹出来的盒子才立得住。',
          camera: { target: [0, 0, 0], dir: [0.3, 1, 0.85], dist: 620 }, highlight: ['base', 'page', 'flap-a', 'flap-b'],
          chips: [{ label: '卡纸', sub: '216 × 279 mm' }],
        },
        {
          id: 'fold', title: '对折成卡片', desc: '上下对折成 216 × 139.5 mm 的卡片，边角对齐，用指甲把折边刮平。后面剪口都从这条折边开始。',
          camera: CLOSED_VIEW, set: merge(swing(0, 180, false), edges(EDGES.folded)), highlight: ['page', 'flap-b'],
        },
        {
          id: 'mark', title: '画两条一样长的线', desc: `在合起来的卡片上，从折边往里画两条平行线，各长 ${L} mm（2 英寸）、相距 ${CUT_GAP} mm。线不用画得很直，只要两条一样长。`,
          camera: CUT_VIEW, set: merge(edges(EDGES.marked), { pencil: { visible: true } }), highlight: ['flap-b'],
          actions: [{ type: 'slide', part: 'pencil', axis: 'z', amp: L, period: 2.4, clip: 'pos' }],
          callouts: [{ part: 'flap-b', text: '两条线一样长', sub: `${L} mm · 相距 ${CUT_GAP} mm`, at: [hw, 0, L / 2], offset: [30, 20, 25] }],
          chips: [{ label: '线长', sub: `${L} mm ≤ 卡高一半 ${D / 2} mm` }],
          tip: '线长不能超过卡片高度的一半，不然合上时盒子会从卡片边上露出来。',
        },
        {
          id: 'cut-left', title: '从折边起剪第一刀', desc: '沿第一条线，从折边往里剪到线的末端，两层纸一起剪开。',
          camera: CUT_VIEW, set: merge(edges(EDGES.cutLeft), { pencil: { visible: false }, knife: { visible: true } }), highlight: ['knife'],
          actions: [{ type: 'slide', part: 'knife', axis: 'z', amp: L, period: 2.4, clip: 'pos' }],
        },
        {
          id: 'cut-right', title: '再剪第二刀', desc: '另一条线也一样从折边剪到末端。两刀之间这条小纸条，就是以后的盒子。',
          camera: CUT_VIEW, set: merge(edges(EDGES.cutRight), { knife: { at: [hw, 0.1, 0], lift: 15, dur: 0.8 } }), highlight: ['knife'],
          actions: [{ type: 'slide', part: 'knife', axis: 'z', amp: L, period: 2.4, clip: 'pos' }],
        },
        {
          id: 'crease', title: '把小条往上翻折、压出折痕', desc: '沿两刀末端的连线，把小条（两层一起）往上翻折过去，用拇指来回压，折痕压得越实，盒子弹得越利落。',
          camera: { ...CUT_VIEW, dir: [0.9, 0.8, 0.7], dist: 320 },
          set: merge(edges(EDGES.done), {
            knife: { visible: false, dur: 0.3 },
            'flap-a': { rot: [180, 0, 0], at: flipY(A_AT, CREASE_W), arc: { at: CREASE_W, axis: [1, 0, 0] }, dur: 1.4, delay: 0.3 },
            'flap-b': { rot: [180, 0, 0], at: flipY(B_AT, CREASE_B), arc: { at: CREASE_B, axis: [1, 0, 0] }, dur: 1.4, delay: 0.3 },
          }),
          highlight: ['flap-a', 'flap-b'],
          tip: '翻到卡片另一面，再往另一个方向折一次，折痕两边都软了更好推。',
        },
        {
          id: 'unfold', title: '翻回原位', desc: '把小条翻回原来的位置，卡片看起来又是完整的，只是多了两道剪口和一道折痕。',
          camera: { ...CUT_VIEW, dir: [0.9, 0.8, 0.7], dist: 320 },
          set: {
            'flap-a': { rot: [0, 0, 0], at: A_AT, arc: { at: CREASE_W, axis: [-1, 0, 0] }, dur: 1.4 },
            'flap-b': { rot: [0, 0, 0], at: B_AT, arc: { at: CREASE_B, axis: [-1, 0, 0] }, dur: 1.4 },
          },
          highlight: ['flap-a', 'flap-b'],
        },
        {
          id: 'tent', title: '把卡片打开一点', desc: '把卡片打开到约 150°，像搭一个很矮的帐篷，小条还跟着两边卡片一起折着。',
          camera: { target: [0, 10, 0], dir: [1, 0.55, 0.75], dist: 430 }, set: swing(180, 30, false, 1.4), highlight: ['page'],
        },
        {
          id: 'push', title: '把小条推到卡片里面', desc: '从卡片外面用拇指顶住小条的折边，往里推：小条翻到卡片内侧，原来往外凸的折痕变成往里凸。',
          camera: { target: [0, 10, 10], dir: [1, 0.45, 0.6], dist: 300 },
          set: {
            'flap-a': { rot: [30, 0, 0], arc: { at: A_AT, axis: [1, 0, 0] }, dur: 1 },
            'flap-b': { rot: [-30, 0, 0], arc: { at: B_AT, axis: [-1, 0, 0] }, dur: 1 },
          },
          highlight: ['flap-a', 'flap-b'],
          callouts: [{ part: 'flap-a', text: '往里推', sub: '折痕反过来', at: [0, 0, -L], offset: [55, 45, 0] }],
        },
        {
          id: 'press', title: '合上卡片，用力压平', desc: '推好后合上卡片，从外面用力压一压。小盒子在里面折平了，三道折痕都定了型。',
          camera: { target: [0, 4, D / 2], dir: [1, 0.7, 0.75], dist: 440 }, set: swing(30, 180, true), highlight: ['flap-a', 'flap-b'],
          tip: `剪口 ${L} mm，合上后小条伸到离中缝 ${2 * L} mm，比卡片高度 ${D} mm 小，所以不会露出来。`,
        },
        {
          id: 'pop', title: '打开到 90°：盒子弹出来', desc: '把卡片立起来打开到 90°，中间的小条自己顶出来，成了一个前面、顶面都是 51 mm 的小方盒。',
          camera: BOX_VIEW, set: swing(180, 90, true), highlight: ['flap-a', 'flap-b'],
          callouts: [
            { part: 'flap-a', text: '盒子前面', sub: `${L} mm 高`, at: [12, 0, -L / 2], offset: [95, 0, 30] },
            { part: 'flap-b', text: '盒子顶面', sub: `${L} mm 深`, at: [-hw, 0, L / 2], offset: [-70, 40, 0] },
          ],
        },
        {
          id: 'decorate', title: '在盒子正面贴装饰（可选）', desc: '剪一张比盒子正面略小的彩纸，写上祝福贴在盒子正面。也可以贴人物、蛋糕，让它「站」在卡片上。',
          camera: BOX_VIEW, set: { deco: { visible: true, at: DECO_AT, dur: 1.2 } }, highlight: ['deco'],
          tip: '装饰只贴在盒子正面，别超出盒子太多：合上时它跟着盒子折进卡片，超出卡边就会露在外面。',
        },
      ],
    },
    {
      id: 'motion',
      title: '开合演示：为什么会弹起来',
      kind: 'usage',
      start: POPPED,
      steps: [
        {
          id: 'flat', title: '摊平到 180°：盒子被拉平', desc: '把卡片完全摊平，盒子的前面和顶面也被拉回纸面里，又成了一张平纸。所以平行折要立着看，不适合摊平看的书页。',
          camera: { target: [0, 0, 0], dir: [0.45, 1, 0.9], dist: 560 }, set: swing(90, 0, true), highlight: ['flap-a', 'flap-b'],
        },
        {
          id: 'a135', title: '合到 135°：盒子慢慢立起', desc: '从摊平往回合，小条两块纸跟着各自那半张卡片转：前面跟着后页立起来，顶面跟着底页保持水平。',
          camera: BOX_VIEW, set: swing(0, 45, true), highlight: ['flap-a', 'flap-b'],
        },
        {
          id: 'a90', title: '90°：正好一个方盒', desc: '卡片张开 90° 时，盒子前面竖直、顶面水平，高和深都等于剪口长 51 mm。这是平行折最好看的角度。',
          camera: BOX_VIEW, set: swing(45, 90, true), highlight: ['flap-a', 'flap-b'],
          chips: [{ label: '高 = 深', sub: `${L} mm` }],
        },
        {
          id: 'a45', title: '合到 45°：盒子往前倒', desc: '继续合，前面跟着后页往前倒，顶面仍然和底页平行，盒子被压成一个斜斜的平行四边形。',
          camera: { target: [0, 20, 45], dir: [1, 0.5, 0.55], dist: 430 }, set: swing(90, 135, true), highlight: ['flap-a', 'flap-b'],
        },
        {
          id: 'closed', title: '合上：盒子折平藏在里面', desc: `完全合上时盒子压成两层，平躺在卡片里，最远伸到离中缝 ${2 * L} mm，离卡片边还有 ${D - 2 * L} mm。`,
          camera: { target: [0, 4, D / 2], dir: [1, 0.7, 0.75], dist: 440 }, set: swing(135, 180, true), highlight: ['flap-a', 'flap-b'],
          chips: [{ label: '离卡边', sub: `${D - 2 * L} mm` }],
        },
        {
          id: 'why', title: '原理：一个会变形的平行四边形', desc: '从侧面看，中缝、两道折痕和盒子棱是平行四边形的四个角，四条边都是 51 mm。卡片开合时它只会「歪」，对边始终平行，所以盒子前面总跟后页平行、顶面总跟底页平行。',
          camera: { target: [0, 40, 40], dir: [1, 0.22, 0.3], dist: 450 }, set: swing(180, 90, true), highlight: ['flap-a', 'flap-b'],
          actions: [
            { type: 'swing', part: 'page', axis: 'x', amp: 35, period: 4 },
            { type: 'swing', part: 'flap-a', axis: 'x', amp: 35, period: 4 },
            { type: 'swing', part: 'flap-b', axis: 'x', amp: -35, period: 4 },
          ],
          callouts: [
            { part: 'flap-a', text: '前面 ∥ 后页', at: [0, 0, -L / 2], offset: [0, 10, 70] },
            { part: 'flap-b', text: '顶面 ∥ 底页', at: [0, 0, L / 2], offset: [0, 45, 0] },
          ],
          chips: [{ label: '四条边', sub: `都是 ${L} mm` }],
        },
      ],
    },
  ],
}
