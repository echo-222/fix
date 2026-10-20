import type { HwItem, Metric, Q4, Rating, Step } from '../types'
import {
  Builder, GuideBuilder, VIEW, basisQuat, clampByFields, explodeStep, hwTotal, overallDist, repairGuide,
  rodCutList, rodWeightPrice, screwTool, type FieldGroup, type ShaftModel,
} from './common'
import { CLAMP, COLLAR, D_OPTIONS, E_STEEL, MATERIAL, SHAFT, type ShaftD, type ShaftMaterial } from './specs'

export interface RackConfig {
  kind: 'rack'
  name: string
  /** 两根立柱中心距 */
  width: number
  /** 底座横杆长度 */
  depth: number
  /** 挂衣杆中心高度 */
  height: number
  d: ShaftD
  material: ShaftMaterial
  shoeBars: boolean
  midBar: boolean
  /** 挂衣杆伸出立柱的长度 */
  overhang: number
  loadKg: number
}

export const RACK_DEFAULT: RackConfig = {
  kind: 'rack', name: '光轴挂衣架',
  width: 1000, depth: 450, height: 1600,
  d: 16, material: 'chrome', shoeBars: true, midBar: false, overhang: 80, loadKg: 20,
}

export const RACK_FIELDS: FieldGroup<RackConfig>[] = [
  {
    title: '尺寸',
    fields: [
      { type: 'num', key: 'width', label: '立柱间距', min: 600, max: 1600, step: 10 },
      { type: 'num', key: 'depth', label: '底座长度', min: 300, max: 600, step: 10 },
      { type: 'num', key: 'height', label: '挂衣杆高度', min: 1200, max: 1900, step: 10 },
      { type: 'num', key: 'overhang', label: '挂衣杆外伸', min: 0, max: 200, step: 10 },
    ],
  },
  {
    title: '光轴',
    fields: [
      { type: 'seg', key: 'd', label: '直径', options: D_OPTIONS.filter((o) => o.value !== 10).map((o) => ({ ...o, hint: o.value === 12 ? '挂衣最低推荐' : o.value === 16 ? '推荐，挂满也稳' : undefined })) },
      { type: 'seg', key: 'material', label: '材质', options: (Object.keys(MATERIAL) as ShaftMaterial[]).map((k) => ({ value: k, label: MATERIAL[k].short, hint: MATERIAL[k].note })) },
    ],
  },
  {
    title: '结构',
    fields: [
      { type: 'bool', key: 'shoeBars', label: '底部鞋架横杆', hint: '十字夹架在底座上' },
      { type: 'bool', key: 'midBar', label: '加强横杆', hint: '立柱之间，明显减少左右晃' },
      { type: 'num', key: 'loadKg', label: '挂衣重量', min: 5, max: 40, step: 1, unit: 'kg' },
    ],
  },
]

export interface RackInfo {
  X: number
  yb: number
  zs: number
  ym: number
  a: number
}

export type RackModel = ShaftModel<RackConfig, RackInfo>

const Q_BASE_TEE = basisQuat([0, 0, 1], [0, 1, 0])
const Q_TOP_TEE = basisQuat([1, 0, 0], [0, -1, 0])
const Q_UPRIGHT_CROSS = basisQuat([1, 0, 0], [0, 0, -1])
/** 端盖封住的方向（端盖局部 +Y 指向轴内侧） */
const capQuat = (inward: 'x+' | 'x-' | 'z+' | 'z-'): Q4 => ({
  'x+': basisQuat([0, 0, 1], [1, 0, 0]),
  'x-': basisQuat([0, 0, 1], [-1, 0, 0]),
  'z+': basisQuat([1, 0, 0], [0, 0, 1]),
  'z-': basisQuat([1, 0, 0], [0, 0, -1]),
})[inward]

export function generateRack(input: RackConfig): RackModel {
  const c0 = clampByFields({ ...RACK_DEFAULT, ...input, kind: 'rack' as const }, RACK_FIELDS)
  const c = { ...c0, d: (c0.d === 10 ? 12 : c0.d) as ShaftD }
  const d = c.d
  const cl = CLAMP[d]
  const a = cl.a
  const X = c.width / 2
  const H = c.height
  const yb = a / 2 + 2
  const b = new Builder(d, c.material)
  const tee = (id: string, name: string, position: [number, number, number], q: Q4, enterFrom: [number, number, number], delay?: number) =>
    b.push({ id, name, group: 'bracket', spec: `Ø${d} T 型夹`, geo: { kind: 'tclamp', d }, position, quaternion: q, enterFrom, delay })
  const cross = (id: string, position: [number, number, number], q: Q4, enterFrom: [number, number, number], delay?: number) =>
    b.push({ id, name: '十字夹', group: 'bracket', spec: `Ø${d}×Ø${d} 十字夹`, geo: { kind: 'cross', d }, position, quaternion: q, enterFrom, delay })
  const cap = (id: string, position: [number, number, number], inward: 'x+' | 'x-' | 'z+' | 'z-', enterFrom: [number, number, number]) =>
    b.push({ id, name: '端盖', group: 'foot', spec: `Ø${d} 橡胶端盖`, geo: { kind: 'rodCap', d }, position, quaternion: capQuat(inward), enterFrom, delay: 0.9 })

  // 底座
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? 'l' : 'r'
    b.rod(`base-${s}`, sx < 0 ? '左底座横杆' : '右底座横杆', 'beam', c.depth, 'z', [sx * X, yb, 0], [0, 0, 260], 0)
    tee(`tee-b-${s}`, 'T 型夹', [sx * X, yb, 0], Q_BASE_TEE, [0, 140, 0], 0.4)
    cap(`cap-b-${s}-f`, [sx * X, yb, c.depth / 2 + 3], 'z-', [0, 0, 70])
    cap(`cap-b-${s}-b`, [sx * X, yb, -c.depth / 2 - 3], 'z+', [0, 0, -70])
  }

  // 鞋架横杆
  const zs = c.depth / 2 - 70
  if (c.shoeBars) {
    for (const sz of [1, -1]) {
      const f = sz > 0 ? 'f' : 'b'
      for (const sx of [-1, 1]) cross(`x-s-${f}-${sx < 0 ? 'l' : 'r'}`, [sx * X, yb + a / 2, sz * zs], [0, 0, 0, 1], [0, 110, 0], 0)
      const len = 2 * X + 100
      b.rod(`shoe-${f}`, sz > 0 ? '前鞋架横杆' : '后鞋架横杆', 'brace', len, 'x', [0, yb + a, sz * zs], [sz * 0, 0, sz * 220], 0.45)
      cap(`cap-s-${f}-l`, [-len / 2 - 3, yb + a, sz * zs], 'x+', [-70, 0, 0])
      cap(`cap-s-${f}-r`, [len / 2 + 3, yb + a, sz * zs], 'x-', [70, 0, 0])
    }
  }

  // 立柱：两端插到 T 型夹通孔边缘
  const yLow = yb + a / 2
  const yHigh = H - a / 2
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? 'l' : 'r'
    b.rod(`up-${s}`, sx < 0 ? '左立柱' : '右立柱', 'leg', yHigh - yLow, 'y', [sx * X, (yLow + yHigh) / 2, 0], [0, 520, 0], 0)
  }

  // 加强横杆
  const ym = Math.max(300, Math.round(H * 0.28))
  if (c.midBar) {
    for (const sx of [-1, 1]) cross(`x-m-${sx < 0 ? 'l' : 'r'}`, [sx * X, ym, -a / 2], Q_UPRIGHT_CROSS, [0, 0, -100], 0)
    const len = 2 * X + 60
    b.rod('mid', '加强横杆', 'brace', len, 'x', [0, ym, -a], [0, 0, -260], 0.45)
    cap('cap-m-l', [-len / 2 - 3, ym, -a], 'x+', [-70, 0, 0])
    cap('cap-m-r', [len / 2 + 3, ym, -a], 'x-', [70, 0, 0])
  }

  // 顶部挂衣杆
  const topLen = 2 * X + 2 * c.overhang + a
  for (const sx of [-1, 1]) tee(`tee-t-${sx < 0 ? 'l' : 'r'}`, 'T 型夹', [sx * X, H, 0], Q_TOP_TEE, [0, 160, 0], 0)
  b.rod('top', '挂衣杆', 'beam', topLen, 'x', [0, H, 0], [0, 260, 0], 0.4)
  cap('cap-t-l', [-topLen / 2 - 3, H, 0], 'x+', [-80, 0, 0])
  cap('cap-t-r', [topLen / 2 + 3, H, 0], 'x-', [80, 0, 0])

  const parts = b.parts
  const byId = b.byId
  const nTee = parts.filter((p) => p.geo.kind === 'tclamp').length
  const nCross = parts.filter((p) => p.geo.kind === 'cross').length
  const nCap = parts.filter((p) => p.geo.kind === 'rodCap').length
  const hardware: HwItem[] = [
    { key: 'tee', name: 'T 型夹', spec: `Ø${d} 铝合金 · ${cl.screw} 螺丝 · 注意不是十字夹`, qty: nTee, price: cl.tee },
    ...(nCross ? [{ key: 'cross', name: '十字夹', spec: `Ø${d}×Ø${d} 铝合金 · ${cl.screw} 螺丝`, qty: nCross, price: cl.cross }] : []),
    { key: 'cap', name: '橡胶端盖', spec: `Ø${d} 内径 · 底座端盖兼作防滑脚`, qty: nCap, price: 0.6 },
    { key: 'spare', name: '备用夹具螺丝', spec: `${cl.screw}×16 内六角`, qty: 4, price: 0.15 },
  ]
  const tools = [
    `内六角扳手 ${cl.key}mm（全部夹具）`,
    '卷尺',
    '水平仪（检查立柱垂直）',
    '干抹布 / 酒精湿巾（擦光轴防锈油）',
  ]

  // ---------- 评估 ----------
  const span = 2 * X
  const w = (c.loadKg * 9.81) / span
  const sag = (5 * w * span ** 4) / (384 * E_STEEL * SHAFT[d].I)
  const sagRating: Rating = sag <= 3 ? { level: 'good', label: '刚性好' } : sag <= 6 ? { level: 'ok', label: '合格' } : { level: 'warn', label: '挂满会下弯' }
  const allow = Math.round(1.5 * COLLAR[d].holdKg)
  const holdRating: Rating = c.loadKg <= allow * 0.6 ? { level: 'good', label: '余量充足' } : c.loadKg <= allow ? { level: 'ok', label: '合格' } : { level: 'warn', label: '夹具可能打滑' }
  const slender = H / d / (c.midBar ? 1.3 : 1) / (c.shoeBars ? 1.1 : 1)
  const wobble: Rating = slender < 80 ? { level: 'good', label: '稳固' } : slender < 110 ? { level: 'ok', label: '轻微晃动' } : { level: 'warn', label: '易晃动' }
  const warnings: string[] = []
  if (sagRating.level === 'warn') warnings.push(`挂衣杆跨度 ${span}mm，Ø${d} 挂 ${c.loadKg}kg 下弯约 ${sag.toFixed(1)}mm：建议换更粗的光轴或缩短间距。`)
  if (holdRating.level === 'warn') warnings.push(`${c.loadKg}kg 超过 2 个顶部 T 型夹的建议承载（约 ${allow}kg）。`)
  if (wobble.level === 'warn') warnings.push(c.midBar ? `立柱 Ø${d} 偏细，建议换更粗的光轴。` : `立柱 Ø${d}、高 ${H}mm 会左右晃：建议打开「加强横杆」或换更粗的光轴。`)
  if (c.depth < H * 0.25) warnings.push(`底座 ${c.depth}mm 偏短，挂单侧时容易前后倾倒：建议至少 ${Math.ceil((H * 0.25) / 10) * 10}mm。`)
  if (c.overhang > 150) warnings.push('挂衣杆外伸过长，两端挂重物会让立柱向外歪。')

  const rod = rodWeightPrice(parts, c.material)
  const hw = hwTotal(hardware)
  const weightKg = rod.kg + nTee * 0.06 + nCross * 0.05
  const minutes = Math.round(8 + nTee * 2.5 + nCross * 2 + nCap * 0.3)
  const metrics: Metric[] = [
    { label: `挂衣杆下弯（${c.loadKg}kg）`, value: `${sag.toFixed(1)}mm`, note: sagRating.label, level: sagRating.level },
    { label: '夹具承载', value: `≤ ${allow}kg`, note: holdRating.label, level: holdRating.level },
    { label: '长细比', value: slender.toFixed(0), note: wobble.label, level: wobble.level },
  ]

  return {
    product: 'rack', name: c.name,
    dims: { width: topLen, depth: c.depth, height: H + a / 2 },
    parts, byId,
    cutList: rodCutList(parts, () => undefined, c.material),
    cutTitle: `光轴切割清单（${MATERIAL[c.material].name}，两端倒角，公差 ±0.5mm）`,
    cutNote: `立柱长 ${Math.round(yHigh - yLow)}mm 已扣除上下 T 型夹（夹块 ${a}mm）。T 型夹和十字夹外观相似，下单时看清：T 型夹一个孔是盲孔，用来插立柱。`,
    hardware, tools,
    stats: { weightKg, priceCny: Math.round(rod.cny + hw), minutes },
    warnings, metrics,
    center: [0, H / 2, 0],
    designView: { focus: [0, H * 0.5, 0], dist: Math.hypot(topLen, c.depth, H) * 1.8 },
    overlay: { load: { y: H + a, w: span, d: 0, kg: c.loadKg } },
    config: c, d, boardT: 0, feet: 'pad',
    info: { X, yb, zs, ym, a },
  }
}

export function rackGuides(m: RackModel) {
  const c = m.config
  const d = m.d
  const { X, ym } = m.info
  const cl = CLAMP[d]
  const H = c.height
  const D = overallDist(m.dims)
  const close = Math.max(520, Math.min(900, D * 0.28))
  const g = new GuideBuilder()
  const ids = (pre: string) => m.parts.filter((p) => p.id.startsWith(pre)).map((p) => p.id)
  const nClamp = m.parts.filter((p) => p.geo.kind === 'tclamp' || p.geo.kind === 'cross').length

  g.add(explodeStep(m, `共 ${m.parts.filter((p) => p.geo.kind === 'rod').length} 根光轴、${ids('tee-').length} 个 T 型夹${ids('x-').length ? `、${ids('x-').length} 个十字夹` : ''}。先把 T 型夹和十字夹分开放：T 型夹有一个盲孔（插立柱），十字夹是两个通孔，装错要拆掉重来。`, '光轴先用干布擦掉防锈油，夹具才夹得紧。'))

  g.add({
    id: 'base', title: '组装底座',
    desc: `把 T 型夹的通孔套到底座横杆正中间，盲孔朝上，用 ${cl.key}mm 内六角轻拧。横杆两端压入橡胶端盖，它们同时是防滑脚。`,
    chips: [{ label: '底座横杆 × 2', sub: `Ø${d} · ${c.depth}mm` }, { label: 'T 型夹 × 2' }, { label: '端盖 × 4' }],
    motion: 'enter', focus: [X, m.info.yb, 0], view: { dir: VIEW.frontRight, dist: close * 0.8 },
    detail: 'tclamp', tool: screwTool(m.byId['tee-b-r'], 'teeThrough', d),
    tip: '从底座一端量到 T 型夹中心，两边都等于底座长度的一半。',
  }, [...ids('base-'), ...ids('tee-b-'), ...ids('cap-b-')])

  if (c.shoeBars) {
    const xs = m.byId['x-s-f-r']
    g.add({
      id: 'shoe', title: '安装鞋架横杆',
      desc: `在两根底座横杆距前后端各 70mm 处装十字夹，再把两根鞋架横杆穿过十字夹上层的孔。两根横杆把左右底座连成一个框，后面立柱就不会歪。`,
      chips: [{ label: '十字夹 × 4' }, { label: '鞋架横杆 × 2', sub: m.byId['shoe-f'].spec }],
      motion: 'enter', focus: [0, m.info.yb + m.info.a, 0], view: { dir: VIEW.high, dist: close * 1.5 },
      marker: xs.position, detail: 'cross', tool: screwTool(xs, 'crossA', d),
    }, [...ids('x-s-'), ...ids('shoe-'), ...ids('cap-s-')])
  }

  g.add({
    id: 'uprights', title: '插入立柱',
    desc: `把两根立柱插进底座 T 型夹的盲孔，插到底后拧紧侧面螺丝。立柱是最长的两根（${m.byId['up-l'].spec.split('· ')[1]}）。`,
    chips: [{ label: '立柱 × 2', sub: m.byId['up-l'].spec }, { label: `内六角 ${cl.key}mm` }],
    motion: 'enter', focus: [X, H * 0.25, 0], view: { dir: VIEW.frontRight, dist: close * 1.5 },
    marker: m.byId['tee-b-r'].position, detail: 'tclamp', tool: screwTool(m.byId['tee-b-r'], 'teeBoss', d),
  }, ids('up-'))

  if (c.midBar) {
    const xm = m.byId['x-m-r']
    g.add({
      id: 'mid', title: '安装加强横杆',
      desc: `在两根立柱离地 ${ym}mm 处装十字夹，加强横杆从立柱后方穿过。它和挂衣杆、立柱组成一个框，能大幅减少左右晃动，也可以挂包。`,
      chips: [{ label: '十字夹 × 2' }, { label: '加强横杆 × 1', sub: m.byId['mid'].spec }],
      motion: 'enter', focus: [0, ym, 0], view: { dir: VIEW.back, dist: close * 1.6 },
      marker: xm.position, detail: 'cross', tool: screwTool(xm, 'crossB', d),
    }, [...ids('x-m-'), 'mid', ...ids('cap-m-')])
  }

  g.add({
    id: 'top', title: '安装挂衣杆',
    desc: `把两个 T 型夹的盲孔套到立柱顶端，挂衣杆从两个通孔中穿过，两边各伸出 ${c.overhang}mm，最后压入端盖。这一步两个人配合更容易。`,
    chips: [{ label: 'T 型夹 × 2' }, { label: '挂衣杆 × 1', sub: m.byId['top'].spec }, { label: '端盖 × 2' }],
    motion: 'enter', focus: [X, H, 0], view: { dir: VIEW.frontRight, dist: close * 0.9 },
    detail: 'tclampTop', tool: screwTool(m.byId['tee-t-r'], 'teeBoss', d),
  }, [...ids('tee-t-'), 'top', 'cap-t-l', 'cap-t-r'])

  g.add({
    id: 'square', title: '校正立柱并拧紧',
    desc: `水平仪竖着贴在立柱侧面，前后、左右都要垂直；挂衣杆上放水平仪检查是否水平。确认后从下往上，把全部 ${nClamp} 个夹具的螺丝拧紧。`,
    chips: [{ label: '立柱垂直' }, { label: '挂衣杆水平' }, { label: `夹具 × ${nClamp}`, sub: `内六角 ${cl.key}mm` }],
    active: [...ids('up-'), 'top'], motion: 'none',
    focus: [0, H * 0.47, 0], view: { dir: VIEW.front, dist: D * 1.05 }, detail: 'level', marker: [X, H * 0.6, 0],
  })

  g.add({
    id: 'finish', title: '完成',
    desc: `建议挂衣重量不超过 ${c.loadKg}kg，重的大衣挂在靠近立柱的两端。移动衣架时托住立柱，不要拽挂衣杆。`,
    chips: m.metrics.map((x) => ({ label: x.label.replace(/（.*）/, ''), sub: x.note })),
    motion: 'none', focus: [0, H * 0.45, 0], view: { dir: VIEW.iso, dist: D * 1.15 }, overlays: ['dims'], autoRotate: true,
  })

  const assembly = g.build(`${g.steps.length} 步 · 约 ${m.stats.minutes} 分钟 · 2 人更轻松`)

  const wob: Step[] = [
    {
      id: 'r1', title: '判断晃动来源',
      desc: '推挂衣杆：整体左右晃 → 夹具松或缺少横向支撑；立柱在 T 型夹里转动 → 那个夹具螺丝松了。',
      chips: [{ label: '左右晃', sub: '查夹具 / 加横杆' }, { label: '立柱转动', sub: '拧紧 T 型夹' }],
      active: ids('up-'), motion: 'wiggle',
      focus: [0, H * 0.47, 0], view: { dir: VIEW.front, dist: D * 1.05 }, detail: 'rodWobble',
    },
    {
      id: 'r2', title: '拧紧 4 个 T 型夹',
      desc: `每个 T 型夹有 2 颗螺丝：通孔一颗、盲孔一颗，都要拧紧。螺丝拧到底仍然打滑，说明夹块变形，换新夹具。`,
      chips: [{ label: 'T 型夹 × 4' }, { label: `内六角 ${cl.key}mm` }, { label: '备用螺丝' }],
      active: ids('tee-'), motion: 'none',
      focus: m.byId['tee-t-r'].position, view: { dir: VIEW.frontRight, dist: close * 0.8 }, detail: 'tclampTop', tool: screwTool(m.byId['tee-t-r'], 'teeBoss', d),
    },
  ]
  if (!c.midBar) {
    const alt = generateRack({ ...c, midBar: true })
    wob.push({
      id: 'r3', title: '加装加强横杆',
      desc: `在两根立柱离地 ${alt.info.ym}mm 处用十字夹加一根横杆（红色虚线），不用拆挂衣杆。长细比可从 ${m.metrics[2].value} 降到 ${alt.metrics[2].value}。`,
      chips: [{ label: '十字夹 × 2' }, { label: '横杆 × 1', sub: `Ø${d} · ${2 * X + 60}mm` }, { label: '自定义设计里可一键打开' }],
      active: [], motion: 'none',
      focus: [0, alt.info.ym, 0], view: { dir: VIEW.back, dist: close * 1.6 }, detail: 'cross',
      suggest: alt.parts.filter((p) => !m.byId[p.id]),
    })
  } else {
    wob.push({
      id: 'r3', title: '检查加强横杆十字夹',
      desc: '加强横杆的十字夹松动后会沿立柱下滑，先推回原高度再拧紧两颗螺丝。',
      chips: [{ label: '十字夹 × 2' }, { label: `内六角 ${cl.key}mm` }],
      active: ids('x-m-'), motion: 'none',
      focus: m.byId['x-m-r'].position, view: { dir: VIEW.back, dist: close }, detail: 'cross', tool: screwTool(m.byId['x-m-r'], 'crossB', d),
    })
  }
  wob.push({
    id: 'r4', title: '检查挂衣杆下弯',
    desc: `挂满后挂衣杆中部估算下弯 ${m.metrics[0].value}（${m.metrics[0].note}）。明显下弯时把重衣服挪到两端，或换 Ø${d === 20 ? 20 : d === 16 ? 20 : 16} 光轴。`,
    chips: [{ label: '挂衣重量', sub: `${c.loadKg}kg` }, { label: '下弯', sub: m.metrics[0].value }],
    active: ['top'], motion: 'none',
    focus: [0, H, 0], view: { dir: VIEW.front, dist: D * 0.75 }, overlays: ['load'],
  })

  return [assembly, repairGuide('repair-wobble', '修复：衣架摇晃', 10, wob)]
}
