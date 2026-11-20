import type { Finish, ManualSpec, PartState, SpecPart, Vec3 } from '../types'
import { axisQuat, circle, euler, quat, rect, round, windowed, type P2 } from './popup-kit'

/**
 * 拉片与转盘：立体书里两种「平着动」的机关，各做一张卡。
 *
 * 拉片窗口卡（Stamptastic Designs「Pull Tab Window Cards」的尺寸，换成毫米）：
 *   底卡 140 × 108（A2 卡片正面），上面贴两条 3 mm 宽、1.5 mm 厚的泡棉条当滑轨，左端一条当挡块；
 *   滑片 79 × 92 夹在滑轨中间、右边伸出一个拉手；最上面是开了 70 mm 方窗的面板 133 × 102。
 *   拉手往右拉 80 mm，滑片上的礼物图从窗口滑走，露出底卡上写好的祝福。
 *   从下往上：底卡 [0, 0.3]、祝福 [0.3, 0.33]、滑片 [0.4, 0.7] 和上面的图、泡棉条 [0.3, 1.8]、面板 [1.85, 2.15]。
 * 四季转盘卡（Beccy's Place「View Finder Card」的尺寸）：
 *   底卡 140 见方；前面板 133 见方，开一个 38 mm 圆窗；127 mm 的花边圆盘用双脚钉钉在前面板背面，
 *   圆心离窗口中心 34 mm，转盘右边正好和底卡右边齐平；前面板右边剪半圆缺口露出转盘边，四角用泡棉胶垫高贴到底卡上。
 *   从下往上：底卡 [0, 0.3]、泡棉胶 [0.3, 1.6]、转盘 [0.9, 1.2]（挂在面板下面）、面板 [1.6, 1.9]、钉帽。
 *   转盘离面板留 0.4 mm：小画上的字比纸面略高，贴得太近会从面板背面透出来。
 * 两张卡都放在原点，各自的指南用 start 把另一张藏起来。
 */

// ---------- 拉片窗口卡 ----------
const SB: [number, number] = [140, 108]
const SP: [number, number] = [133, 102]
const WIN = 70
const SL: [number, number] = [79, 92]
const TAB_END = 85
const TAB_W = 22
const PULL = 80
const RAIL_Z = 48.5
const RAIL: { w: number; x: number } = { w: 111, x: 10.5 }
const STOP_X = -43.5

const SLIDE_PANEL = (ring: string) => windowed(rect(SP[0], SP[1]), rect(WIN, WIN), 'hhhh', ring)
const SLIDER: P2[] = [
  [-SL[0] / 2, -SL[1] / 2], [SL[0] / 2, -SL[1] / 2], [SL[0] / 2, -TAB_W / 2], [TAB_END - 4, -TAB_W / 2], [TAB_END, -TAB_W / 2 + 4],
  [TAB_END, TAB_W / 2 - 4], [TAB_END - 4, TAB_W / 2], [SL[0] / 2, TAB_W / 2], [SL[0] / 2, SL[1] / 2], [-SL[0] / 2, SL[1] / 2],
]

/** 心形，宽 size，尖朝 +z（朝读者） */
function heart(size: number, cx: number, cz: number, n = 36): P2[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    return [round(cx + (x * size) / 32), round(cz - (y * size) / 32)] as P2
  })
}

const FLAT: Vec3 = [-90, 0, 0]
const KRAFT: Finish = { color: '#d9b98c', roughness: 0.9 }
const CREAM: Finish = { color: '#fbf5e9', roughness: 0.85 }
const PINK: Finish = { color: '#f2b8c2', roughness: 0.85 }
const RED: Finish = { color: '#d9463b', roughness: 0.7 }
const GOLD: Finish = { color: '#f2c14e', roughness: 0.5 }
const FOAM: Finish = { color: '#f7f7f3', roughness: 0.95 }

// ---------- 四季转盘卡 ----------
const WB = 140
const WP = 133
const DISC_R = 63.5
const DC: [number, number] = [6.5, 0]
const WIN_R = 19
const PIC_DIST = 34
const NOTCH_R = 12
const DISC_HANG = -0.7

const notchArc: P2[] = Array.from({ length: 9 }, (_, i) => {
  const t = (Math.PI * i) / 8
  return [round(WP / 2 - NOTCH_R * Math.sin(t)), round(-NOTCH_R * Math.cos(t))] as P2
})
const WHEEL_OUTER: P2[] = [[-WP / 2, -WP / 2], [WP / 2, -WP / 2], ...notchArc, [WP / 2, WP / 2], [-WP / 2, WP / 2]]
// 圆窗从最靠近上边的那一点开始绕，桥直直地连到上边
const windowRing = (() => {
  const c = circle(WIN_R, 40, DC[0], DC[1] - PIC_DIST)
  return [...c.slice(10), ...c.slice(0, 10)]
})()
const WHEEL_PANEL = (notch: string, ring: string) => windowed(WHEEL_OUTER, windowRing, `hh${notch.repeat(8)}hhh`, ring)
const DISC: P2[] = Array.from({ length: 96 }, (_, i) => {
  const t = (i / 96) * Math.PI * 2
  const r = DISC_R - 1.6 + 1.6 * Math.abs(Math.cos(12 * t))
  return [round(r * Math.cos(t)), round(-r * Math.sin(t))] as P2
})
const SEASONS = [
  { text: '春', color: '#f4a7b9' },
  { text: '夏', color: '#7cc47f' },
  { text: '秋', color: '#f0a04b' },
  { text: '冬', color: '#9fcbeb' },
]

const sheet = (points: P2[], th?: number) => ({ type: 'sheet' as const, points, ...(th ? { th } : {}) })

const parts: SpecPart[] = [
  // 拉片窗口卡
  { id: 's-base', name: '底卡', spec: `${SB[0]} × ${SB[1]} mm 卡纸`, shape: { ...sheet(rect(SB[0], SB[1])), back: 'warm', backFinish: KRAFT }, fill: 'white', finish: CREAM },
  {
    id: 's-msg', name: '藏起来的祝福', parent: 's-base', at: [0, 0.3, 0], visible: false,
    shape: {
      type: 'compound',
      items: [
        { ...sheet(heart(34, 0, -8), 0.02), fill: 'warm', finish: RED },
        { type: 'text', text: '生日快乐', size: 9, at: [0, 0.03, 22], rot: FLAT },
      ],
    },
  },
  { id: 's-rail-t', name: '泡棉条（上）', spec: '3 × 1.5 mm', at: [RAIL.x, 0, 75], shape: { type: 'slab', w: RAIL.w, d: 3, h: 1.5 }, fill: 'white', finish: FOAM },
  { id: 's-rail-b', name: '泡棉条（下）', spec: '3 × 1.5 mm', at: [RAIL.x, 0, 82], shape: { type: 'slab', w: RAIL.w, d: 3, h: 1.5 }, fill: 'white', finish: FOAM },
  { id: 's-stop', name: '挡块', spec: '泡棉条一小段', at: [10, 0, 92], rot: [0, 90, 0], shape: { type: 'slab', w: 3, d: 93, h: 1.5 }, fill: 'white', finish: FOAM },
  { id: 's-slider', name: '滑片', spec: `${SL[0]} × ${SL[1]} mm + 拉手`, at: [175, 0, 0], shape: { ...sheet(SLIDER), back: 'white', backFinish: CREAM }, fill: 'white', finish: CREAM },
  {
    id: 's-art', name: '礼物图', parent: 's-slider', at: [0, 0.3, 0],
    shape: {
      type: 'compound',
      items: [
        { ...sheet(rect(40, 30, 0, 8), 0.02), fill: 'warm', finish: RED },
        { ...sheet(rect(46, 9, 0, -11.5), 0.02), fill: 'warm', finish: RED },
        { ...sheet(rect(6, 39.5, 0, 3.25), 0.02), at: [0, 0.02, 0], fill: 'shade', finish: GOLD },
        { ...sheet([[0, -16], [-11, -24], [-10, -14]], 0.02), at: [0, 0.02, 0], fill: 'shade', finish: GOLD },
        { ...sheet([[0, -16], [11, -24], [10, -14]], 0.02), at: [0, 0.02, 0], fill: 'shade', finish: GOLD },
        { type: 'text', text: '拉', size: 10, at: [TAB_END - 12, 0.03, 0], rot: FLAT },
      ],
    },
  },
  { id: 's-panel', name: '开窗面板', spec: `${SP[0]} × ${SP[1]} mm · ${WIN} mm 方窗`, at: [-175, 0, 0], shape: { ...sheet(SLIDE_PANEL('h').points), back: 'shade' }, fill: 'warm', finish: PINK },
  { id: 's-plug', name: '方窗里剪下的纸', parent: 's-panel', shape: { ...sheet(rect(WIN, WIN)), back: 'shade' }, fill: 'warm', finish: PINK },
  {
    id: 's-ptext', name: '面板上的字', parent: 's-panel', at: [0, 0.3, 0],
    shape: {
      type: 'compound',
      items: [
        { type: 'text', text: '猜猜是什么？', size: 7, at: [0, 0.02, -43], rot: FLAT },
        { type: 'text', text: '拉开看看 →', size: 5.5, at: [32, 0.02, 43.5], rot: FLAT },
      ],
    },
  },
  // 四季转盘卡
  { id: 'w-base', name: '转盘底卡', spec: `${WB} × ${WB} mm 卡纸`, visible: false, shape: { ...sheet(rect(WB, WB)), back: 'warm', backFinish: KRAFT }, fill: 'white', finish: CREAM },
  {
    id: 'w-tape', name: '泡棉胶', spec: '8 × 8 × 1.3 mm × 4', parent: 'w-base', at: [0, 0.3, 0], visible: false,
    shape: {
      type: 'compound',
      items: [[-60, -60], [60, -60], [60, 60], [-60, 60]].map(([x, z]) => ({ type: 'slab' as const, w: 8, d: 8, h: 1.3, at: [x, 0, z] as Vec3, fill: 'white' as const, finish: FOAM })),
    },
  },
  {
    id: 'w-panel', name: '前面板', spec: `${WP} × ${WP} mm · ${WIN_R * 2} mm 圆窗`, at: [-175, 0, 0], visible: false,
    shape: { ...sheet(WHEEL_PANEL('h', 'h').points), back: 'shade' }, fill: 'warm', finish: { color: '#2f7f86', roughness: 0.85 },
  },
  { id: 'w-plug', name: '圆窗里剪下的纸', parent: 'w-panel', visible: false, shape: { ...sheet(circle(WIN_R, 40, DC[0], DC[1] - PIC_DIST)), back: 'shade' }, fill: 'warm', finish: { color: '#2f7f86' } },
  { id: 'w-nip', name: '缺口里剪下的纸', parent: 'w-panel', visible: false, shape: { ...sheet(notchArc), back: 'shade' }, fill: 'warm', finish: { color: '#2f7f86' } },
  {
    id: 'w-ptext', name: '面板上的字', parent: 'w-panel', at: [0, 0.3, 0], visible: false,
    shape: {
      type: 'compound',
      items: [
        { type: 'text', text: '四季转盘', size: 9, at: [-18, 0.02, 44], rot: FLAT },
        { type: 'text', text: '转一转 ↻', size: 5.5, at: [-18, 0.02, 56], rot: FLAT },
      ],
    },
  },
  {
    id: 'w-brad', name: '双脚钉', spec: '钉帽 Ø8 mm', parent: 'w-panel', at: [DC[0], 25, DC[1]], visible: false,
    shape: {
      type: 'compound',
      items: [
        { type: 'cylinder', r: 3, r2: 4, h: 0.4, axis: 'y', at: [0, 0.2, 0], fill: 'shade', finish: GOLD },
        { type: 'cylinder', r: 4, r2: 2.2, h: 0.9, axis: 'y', at: [0, 0.85, 0], fill: 'shade', finish: GOLD },
        { type: 'cylinder', r: 0.6, h: 1, axis: 'y', at: [0, -0.5, 0], fill: 'shade', finish: 'steel' },
      ],
    },
  },
  { id: 'w-disc', name: '花边转盘', spec: `Ø${DISC_R * 2} mm`, at: [175, 0, 0], visible: false, shape: { ...sheet(DISC), back: 'white', backFinish: CREAM }, fill: 'white', finish: CREAM },
  {
    id: 'w-pics', name: '四季小画', parent: 'w-disc', at: [0, 0.3, 0], visible: false,
    shape: {
      type: 'compound',
      // 第 i 幅在 R_y(−90i)·(0, 0, −34)：转盘每转 +90° 换下一幅进窗口，字也正好转正
      items: SEASONS.flatMap((s, i) => {
        const t = (-90 * i * Math.PI) / 180
        const c = (y: number): Vec3 => [round(-PIC_DIST * Math.sin(t)), y, round(-PIC_DIST * Math.cos(t))]
        return [
          { ...sheet(circle(15, 32), 0.02), at: c(0), fill: 'warm' as const, finish: { color: s.color, roughness: 0.8 } },
          { type: 'text' as const, text: s.text, size: 13, at: c(0.03), rot: euler(axisQuat([0, 1, 0], -90 * i).multiply(quat(FLAT))) },
        ]
      }),
    },
  },
]

const SLIDE_IDS = ['s-base', 's-rail-t', 's-rail-b', 's-stop', 's-slider', 's-art', 's-panel', 's-plug', 's-ptext']
const WHEEL_SHOWN = ['w-base', 'w-panel', 'w-plug', 'w-nip', 'w-ptext', 'w-disc']
const show = (ids: string[], visible: boolean): Record<string, PartState> => Object.fromEntries(ids.map((id) => [id, { visible }]))

const SLIDE_VIEW = { target: [12, 0, 2] as Vec3, dir: [0.2, 1, 0.75] as Vec3, dist: 400 }
const PULL_VIEW = { target: [48, 0, 2] as Vec3, dir: [0.2, 1, 0.75] as Vec3, dist: 460 }
const WHEEL_VIEW = { target: [4, 1, 2] as Vec3, dir: [0.2, 1, 0.75] as Vec3, dist: 420 }
const TABLE_VIEW = { target: [0, 0, 12] as Vec3, dir: [0.1, 1, 0.7] as Vec3, dist: 760 }

export const popupPulltab: ManualSpec = {
  id: 'popup-pulltab',
  name: '拉片与转盘：会变的卡片',
  desc: '拉一下，窗口里的礼物换成祝福；转一转，四季轮流出现——立体书里最常见的拉片和转盘机关。',
  category: '立体书',
  genre: 'tutorial',
  dims: { width: SB[0], depth: SB[1], height: 2 },
  source: { title: 'Stamptastic Designs · Pull Tab Window Cards（拉片窗口卡）', url: 'https://stamptasticdesigns.com/2025/02/19/pull-tab-window-cards/', images: [] },
  package: [
    { name: '卡纸', qty: 3, spec: '底卡 140 × 108 mm、面板 133 × 102 mm、滑片 79 × 92 mm（转盘卡再加 140、133 见方各一张和 127 mm 圆盘）' },
    { name: '泡棉条 / 泡棉胶', qty: 1, spec: '3 mm 宽、约 1.5 mm 厚，给滑片和转盘留出活动的缝' },
    { name: '双脚钉', qty: 1, spec: '转盘卡用，钉帽约 8 mm' },
    { name: '美工刀、切割垫、直尺', qty: 1, spec: '开方窗、圆窗（有圆形切刀更方便）' },
    { name: '彩笔或印章', qty: 1, spec: '画礼物、祝福和四季小画' },
  ],
  params: [
    { label: '拉片 · 窗口', value: `${WIN} mm 方窗（2¾ 英寸）`, note: `开在 ${SP[0]} × ${SP[1]} mm（5¼ × 4 英寸）面板正中` },
    { label: '拉片 · 滑片', value: `${SL[0]} × ${SL[1]} mm`, note: '3⅛ × 3⅝ 英寸：比窗口每边大 4 mm 以上，挡住窗口时看不到缝' },
    { label: '拉片 · 滑轨', value: '3 mm 宽泡棉条，离滑片各 1 mm', note: '太紧拉不动，太松滑片会歪；左端再贴一段当挡块' },
    { label: '拉片 · 行程', value: `${PULL} mm`, note: '比滑片宽度多一点，拉到头窗口里正好全是底卡上的字' },
    { label: '转盘 · 尺寸', value: `转盘 Ø${DISC_R * 2} mm · 窗口 Ø${WIN_R * 2} mm`, note: "Beccy's Place · View Finder Card（beccysplace.blogspot.com/2020/02/tutorial-view-finder-card.html）：5 英寸圆盘、1½ 英寸圆窗、5¼ 与 5½ 英寸方卡" },
    { label: '转盘 · 画的位置', value: `离圆心 ${PIC_DIST} mm，每隔 90° 一幅`, note: '和窗口到钉子的距离一样，转一格就换一幅' },
  ],
  parts,
  initial: merge(edgesOf('s-panel', SLIDE_PANEL('s').edges), edgesOf('s-plug', '----'), edgesOf('w-plug', '-'.repeat(40)),
    edgesOf('w-panel', WHEEL_PANEL('-', 's').edges), edgesOf('w-nip', `${'s'.repeat(8)}h`)),
  stageSize: 640,
  guides: [
    {
      id: 'slide',
      title: '拉片窗口卡',
      kind: 'assembly',
      steps: [
        {
          id: 'parts', title: '准备三层卡纸和泡棉条', desc: `从左到右：开窗面板 ${SP[0]} × ${SP[1]} mm、底卡 ${SB[0]} × ${SB[1]} mm、带拉手的滑片 ${SL[0]} × ${SL[1]} mm，前面是三段泡棉条。滑片上先画好一个礼物盒。`,
          camera: TABLE_VIEW, highlight: ['s-panel', 's-base', 's-slider'],
        },
        {
          id: 'window', title: '在面板正中开方窗', desc: `在面板正中画一个 ${WIN} mm 的正方形，垫着切割垫用美工刀沿直尺切下来。`,
          camera: { target: [-175, 0, 0], dir: [0.15, 1, 0.6], dist: 330 },
          set: merge(edgesOf('s-panel', SLIDE_PANEL('h').edges), { 's-plug': { visible: false, at: [0, 30, 0], lift: 10, dur: 1.2 } }),
          highlight: ['s-panel', 's-plug'],
          chips: [{ label: '方窗', sub: `${WIN} × ${WIN} mm` }],
        },
        {
          id: 'message', title: '在底卡上写好藏起来的祝福', desc: '在底卡正中（窗口会对着的位置）画一颗心、写上祝福。拉开拉片以后，窗口里露出来的就是它。',
          camera: { target: [0, 0, 2], dir: [0.15, 1, 0.6], dist: 300 }, set: { 's-msg': { visible: true } }, highlight: ['s-msg'],
        },
        {
          id: 'rails', title: '贴滑轨和挡块', desc: `沿底卡上下各贴一条泡棉条，两条相距 ${2 * RAIL_Z - 3} mm，比滑片高度多 2 mm；左端再竖着贴一小段当挡块，滑片推回去时停在窗口正下方。`,
          camera: SLIDE_VIEW,
          set: {
            's-rail-t': { at: [RAIL.x, 0.3, -RAIL_Z], lift: 15, dur: 1.4 },
            's-rail-b': { at: [RAIL.x, 0.3, RAIL_Z], lift: 15, dur: 1.4, delay: 0.2 },
            's-stop': { at: [STOP_X, 0.3, 0], rot: [0, 0, 0], lift: 15, dur: 1.4, delay: 0.4 },
          },
          highlight: ['s-rail-t', 's-rail-b', 's-stop'],
          callouts: [{ part: 's-rail-t', text: '泡棉条', sub: '3 mm 宽 · 1.5 mm 厚', at: [40, 1.5, 0], offset: [30, 20, -30] }],
        },
        {
          id: 'slider', title: '把滑片放进滑轨中间', desc: '滑片放在两条泡棉条之间，左边顶住挡块，拉手从右边伸出卡外。来回推一推，要能顺滑地滑动。',
          camera: SLIDE_VIEW, set: { 's-slider': { at: [0, 0.4, 0], lift: 25, dur: 1.6 } }, highlight: ['s-slider', 's-art'],
          tip: '滑片上下各留 1 mm 左右的缝，太紧会卡住，太松拉的时候会歪。',
        },
        {
          id: 'panel', title: '盖上开窗面板', desc: '在泡棉条朝上的一面撕掉离型纸，把面板对齐盖上压紧。窗口里正好露出滑片上的礼物盒。',
          camera: SLIDE_VIEW, set: { 's-panel': { at: [0, 1.85, 0], lift: 30, dur: 1.6 } }, highlight: ['s-panel'],
        },
        {
          id: 'pull', title: '拉出拉手：礼物换成祝福', desc: `捏住拉手往右拉 ${PULL} mm，滑片沿滑轨滑出，窗口里的礼物盒移走，露出底卡上的「生日快乐」。`,
          camera: PULL_VIEW, set: { 's-slider': { at: [PULL, 0.4, 0], dur: 1.6 } }, highlight: ['s-slider'],
          callouts: [{ part: 's-msg', text: '露出祝福', at: [0, 0, 0], offset: [-40, 20, -45] }],
          chips: [{ label: '行程', sub: `${PULL} mm` }],
        },
        {
          id: 'loop', title: '推回去，再拉一次', desc: '把拉手推回去，滑片顶到挡块停在窗口下面，礼物盒又回来了。拉、推、拉，窗口里的画面来回切换。',
          camera: PULL_VIEW, set: { 's-slider': { at: [0, 0.4, 0], dur: 1.4 } }, highlight: ['s-slider'],
          actions: [{ type: 'slide', part: 's-slider', axis: 'x', amp: PULL, period: 3.2, clip: 'pos', delay: 0.4 }],
        },
      ],
    },
    {
      id: 'wheel',
      title: '四季转盘卡',
      kind: 'assembly',
      start: merge(show(SLIDE_IDS, false), show(WHEEL_SHOWN, true)),
      steps: [
        {
          id: 'parts', title: '准备两张方卡和一个圆盘', desc: `左边是 ${WP} mm 见方的前面板，中间是 ${WB} mm 见方的底卡，右边是直径 ${DISC_R * 2} mm 的花边圆盘。面板上先用铅笔画好圆窗和右边的半圆缺口。`,
          camera: TABLE_VIEW, highlight: ['w-panel', 'w-base', 'w-disc'],
        },
        {
          id: 'window', title: '开一个圆窗', desc: `在面板上离钉子位置 ${PIC_DIST} mm 的地方，切一个直径 ${WIN_R * 2} mm（1½ 英寸）的圆窗。`,
          camera: { target: [-175, 0, -10], dir: [0.15, 1, 0.6], dist: 330 },
          set: merge(edgesOf('w-panel', WHEEL_PANEL('-', 'h').edges), { 'w-plug': { visible: false, at: [0, 30, 0], lift: 10, dur: 1.2 } }),
          highlight: ['w-panel', 'w-plug'],
        },
        {
          id: 'draw', title: '在圆盘上画四幅小画', desc: `在圆盘上离圆心 ${PIC_DIST} mm 的地方，每隔 90° 画一幅：春、夏、秋、冬。距离和窗口到钉子的距离一样，转一格正好换一幅。`,
          camera: { target: [175, 0, -5], dir: [0.15, 1, 0.6], dist: 330 }, set: { 'w-pics': { visible: true } }, highlight: ['w-pics'],
          tip: '把面板叠在圆盘上，透过窗口描出圆圈，转 90° 再描下一个，位置最准。',
        },
        {
          id: 'brad', title: '用双脚钉把圆盘钉在面板背面', desc: '面板叠到圆盘上，让「春」对准窗口，在面板和圆盘的圆心处扎一个小孔，穿进双脚钉，背面把两只脚分开压平。',
          camera: { target: [172, 0, -5], dir: [0.3, 1, 0.65], dist: 360 },
          set: {
            'w-panel': { at: [175 - DC[0], -DISC_HANG, 0], lift: 30, dur: 1.6 },
            'w-brad': { visible: true, at: [DC[0], 0.3, DC[1]], dur: 0.8, delay: 1.8 },
          },
          highlight: ['w-panel', 'w-brad'],
          zoom: { target: [175, 1, 0], dir: [0.4, 0.8, 1], dist: 60, caption: '钉子穿过面板和圆盘的圆心' },
        },
        {
          id: 'nip', title: '在面板右边剪一个半圆缺口', desc: `在面板右边正中剪一个半径 ${NOTCH_R} mm 的半圆缺口，转盘边从这里露出来，拇指一拨就能转。`,
          camera: { target: [235, 0, 0], dir: [0.3, 1, 0.6], dist: 260 },
          set: merge(edgesOf('w-panel', WHEEL_PANEL('h', 'h').edges), { 'w-nip': { visible: false, at: [12, 25, 0], lift: 10, dur: 1.2 } }),
          highlight: ['w-nip', 'w-disc'],
        },
        {
          id: 'tape', title: '底卡四角贴泡棉胶', desc: '在底卡四个角各贴一块 8 mm 的泡棉胶，把面板垫高 1.3 mm，转盘夹在中间才转得动。泡棉胶要贴在转盘够不到的角上。',
          camera: { target: [0, 0, 0], dir: [0.3, 1, 0.75], dist: 340 },
          set: {
            'w-tape': { visible: true },
            'w-disc': { parent: 'w-panel', at: [DC[0], DISC_HANG, DC[1]], rot: [0, 0, 0] },
          },
          highlight: ['w-tape'],
          chips: [{ label: '泡棉胶', sub: '8 × 8 × 1.3 mm × 4' }],
        },
        {
          id: 'mount', title: '把面板连同转盘贴到底卡上', desc: '撕掉泡棉胶的离型纸，把面板对齐底卡贴上。转盘右边正好和底卡右边齐平，从缺口里露出一截花边。',
          camera: WHEEL_VIEW, set: { 'w-panel': { at: [0, 1.6, 0], lift: 40, dur: 1.8 } }, highlight: ['w-panel', 'w-disc'],
          callouts: [{ part: 'w-disc', text: '从缺口拨转盘', at: [DISC_R - 2, 0.3, 0], offset: [40, 20, 30] }],
        },
        {
          id: 'turn', title: '拨一格：春天换成夏天', desc: '在缺口处用拇指把转盘边往上拨四分之一圈，窗口里的「春」转走，「夏」转进来。',
          camera: WHEEL_VIEW, set: { 'w-disc': { rot: [0, 90, 0], dur: 1.6 } },
          callouts: [{ part: 'w-panel', text: '拇指往上拨', sub: '转 ¼ 圈', at: [WP / 2, 0.3, 0], offset: [40, 20, 25] }],
          zoom: { target: [DC[0], 2, DC[1] - PIC_DIST], dir: [0.1, 1, 0.5], dist: 110, caption: '窗口里换成了「夏」' },
        },
        {
          id: 'spin', title: '一直转：四季轮流出现', desc: '继续往同一个方向拨，春、夏、秋、冬依次从窗口经过，转一圈回到春天。',
          camera: WHEEL_VIEW,
          callouts: [{ part: 'w-panel', text: '一直拨', sub: '转一圈 = 四季', at: [WP / 2, 0.3, 0], offset: [40, 20, 25] }],
          actions: [{ type: 'spin', part: 'w-disc', axis: 'y', speed: -0.125 }],
          zoom: { target: [DC[0], 2, DC[1] - PIC_DIST], dir: [0.1, 1, 0.5], dist: 110, caption: '窗口里的画一直在换' },
        },
      ],
    },
  ],
}

function edgesOf(id: string, edges: string): Record<string, PartState> {
  return { [id]: { edges } }
}
function merge(...sets: Record<string, PartState>[]) {
  const out: Record<string, PartState> = {}
  for (const s of sets) for (const [id, st] of Object.entries(s)) out[id] = { ...out[id], ...st }
  return out
}
