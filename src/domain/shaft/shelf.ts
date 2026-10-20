import type { HwItem, Metric, Rating, Step, V3 } from '../types'
import {
  Builder, FLIP_X, GuideBuilder, VIEW, basisQuat, boardWeightPrice, clampByFields, collarTool, explodeStep,
  hwTotal, norm2, overallDist, repairGuide, rodCutList, rodWeightPrice, screwTool,
  type FieldGroup, type ShaftModel,
} from './common'
import {
  CLAMP, COLLAR, D_OPTIONS, MATERIAL, SHAFT, WOOD, WOOD_OPTIONS,
  type ShaftD, type ShaftMaterial, type Wood,
} from './specs'

export interface ShelfConfig {
  kind: 'shelf'
  name: string
  width: number
  depth: number
  height: number
  tiers: number
  d: ShaftD
  material: ShaftMaterial
  wood: Wood
  boardT: number
  /** 光轴中心到层板边的距离 */
  inset: number
  feet: 'leveler' | 'pad'
  backBars: boolean
  /** 单层设计载重 */
  loadKg: number
}

export const SHELF_DEFAULT: ShelfConfig = {
  kind: 'shelf', name: '光轴落地置物架',
  width: 600, depth: 300, height: 1200, tiers: 4,
  d: 12, material: 'chrome', wood: 'rubber', boardT: 18, inset: 30,
  feet: 'leveler', backBars: false, loadKg: 15,
}

export const SHELF_FIELDS: FieldGroup<ShelfConfig>[] = [
  {
    title: '尺寸',
    fields: [
      { type: 'num', key: 'width', label: '宽', min: 400, max: 1200, step: 10 },
      { type: 'num', key: 'depth', label: '进深', min: 200, max: 450, step: 10 },
      { type: 'num', key: 'height', label: '高', min: 600, max: 2000, step: 10 },
      { type: 'num', key: 'tiers', label: '层数', min: 2, max: 6, step: 1, unit: '层' },
    ],
  },
  {
    title: '光轴',
    fields: [
      { type: 'seg', key: 'd', label: '直径', options: D_OPTIONS.map((o) => ({ ...o, hint: o.value === 10 ? '落地架最低推荐' : o.value === 12 ? '常用，稳' : undefined })) },
      { type: 'seg', key: 'material', label: '材质', options: (Object.keys(MATERIAL) as ShaftMaterial[]).map((k) => ({ value: k, label: MATERIAL[k].short, hint: MATERIAL[k].note })) },
      { type: 'seg', key: 'feet', label: '底脚', options: [{ value: 'leveler', label: '调节脚', hint: '轴端需攻丝' }, { value: 'pad', label: '橡胶脚套', hint: '免加工' }] },
      { type: 'bool', key: 'backBars', label: '背部加强横杆', hint: '十字夹固定，明显减少左右晃' },
    ],
  },
  {
    title: '层板',
    fields: [
      { type: 'seg', key: 'wood', label: '木材', options: WOOD_OPTIONS },
      { type: 'seg', key: 'boardT', label: '板厚', options: [{ value: 18, label: '18mm' }, { value: 25, label: '25mm' }] },
      { type: 'num', key: 'loadKg', label: '单层载重', min: 5, max: 40, step: 1, unit: 'kg' },
    ],
  },
]

export interface ShelfInfo {
  X: number
  Z: number
  tierY: number[]
  footH: number
  backBarY: number[]
}

export type ShelfModel = ShaftModel<ShelfConfig, ShelfInfo>

const CORNERS = [['fl', -1, 1, '左前'], ['fr', 1, 1, '右前'], ['bl', -1, -1, '左后'], ['br', 1, -1, '右后']] as const
const WOOD_E = 9000

export function generateShelf(input: ShelfConfig): ShelfModel {
  const c = clampByFields({ ...SHELF_DEFAULT, ...input, kind: 'shelf' as const }, SHELF_FIELDS)
  const d = c.d
  const col = COLLAR[d]
  const clamp = CLAMP[d]
  const T = c.boardT
  const X = c.width / 2 - c.inset
  const Z = c.depth / 2 - c.inset
  const footH = c.feet === 'leveler' ? 22 : 3
  const b = new Builder(d, c.material)

  const y0 = 100
  const yT = c.height - 35
  const n = c.tiers
  const tierY = Array.from({ length: n }, (_, i) => Math.round(y0 + ((yT - y0) * i) / (n - 1)))

  for (const [k, sx, sz, name] of CORNERS) {
    b.rod(`rod-${k}`, `${name}光轴`, 'leg', c.height - footH, 'y', [sx * X, footH + (c.height - footH) / 2, sz * Z], [0, 420, 0])
    if (c.feet === 'leveler') {
      b.push({ id: `foot-${k}`, name: '调节脚', group: 'foot', spec: `${SHAFT[d].endTap} 调节脚`, geo: { kind: 'leveler', size: footH }, position: [sx * X, footH, sz * Z], enterFrom: [0, -120, 0] })
    } else {
      b.push({ id: `foot-${k}`, name: '橡胶脚套', group: 'foot', spec: `Ø${d} 脚套`, geo: { kind: 'rodCap', d }, position: [sx * X, 0, sz * Z], enterFrom: [0, -100, 0] })
    }
  }

  const holes: [number, number][] = CORNERS.map(([, sx, sz]) => [sx * X, sz * Z])
  tierY.forEach((y, i) => {
    for (const [k, sx, sz] of CORNERS) {
      const out = norm2(sx, sz * 1.6)
      b.collar(`col-${i}-${k}-u`, [sx * X, y - T - col.w / 2, sz * Z], out, [0, 180, 0], 0)
      if (i === 0 || i === n - 1) b.collar(`col-${i}-${k}-a`, [sx * X, y + col.w / 2, sz * Z], out, [0, 160, 0], 0.7)
    }
    b.board(`board-${i}`, i === 0 ? '底层板' : i === n - 1 ? '顶层板' : `第 ${i + 1} 层板`, c.wood, c.width, T, c.depth, holes, [0, y - T / 2, 0], [0, 320, 0], 0.35)
  })

  for (const [k, sx, sz] of CORNERS) {
    b.push({ id: `cap-${k}`, name: '装饰端盖', group: 'foot', spec: `Ø${d} 端盖`, geo: { kind: 'rodCap', d }, position: [sx * X, c.height + 3, sz * Z], quaternion: FLIP_X, enterFrom: [0, 90, 0] })
  }

  const backBarY: number[] = []
  if (c.backBars) {
    const gaps = n === 2 ? [0] : [0, n - 2]
    for (const g of gaps) backBarY.push(Math.round((tierY[g] + tierY[g + 1] - T) / 2))
    const q = basisQuat([1, 0, 0], [0, 0, -1])
    backBarY.forEach((y, i) => {
      for (const sx of [-1, 1]) {
        b.push({ id: `bx-${i}-${sx > 0 ? 'r' : 'l'}`, name: '十字夹', group: 'bracket', spec: `Ø${d}×Ø${d} 十字夹`, geo: { kind: 'cross', d }, position: [sx * X, y, -Z - clamp.a / 2], quaternion: q, enterFrom: [0, 0, -90], delay: 0 })
      }
      b.rod(`bar-${i}`, '背部横杆', 'brace', 2 * X + 60, 'x', [0, y, -Z - clamp.a], [0, 0, -240], 0.4)
    })
  }

  const parts = b.parts
  const byId = b.byId

  // ---------- 清单 ----------
  const nCollar = parts.filter((p) => p.geo.kind === 'collar').length
  const nCross = parts.filter((p) => p.geo.kind === 'cross').length
  const cutList = rodCutList(parts, (p) => (p.group === 'leg' && c.feet === 'leveler' ? `底端攻丝 ${SHAFT[d].endTap}（装调节脚）` : undefined), c.material)
  const board = boardWeightPrice(c.wood, c.width, c.depth, T)
  const hardware: HwItem[] = [
    { key: 'collar', name: '限位环（固定环）', spec: `Ø${d} 顶丝式 · ${col.screw} 顶丝 · 建议多备 2 个`, qty: nCollar + 2, price: col.price },
    c.feet === 'leveler'
      ? { key: 'feet', name: '调节脚', spec: `${SHAFT[d].endTap} 螺杆 · Ø30 防滑底`, qty: 4, price: 2.5 }
      : { key: 'feet', name: '橡胶脚套', spec: `Ø${d} 内径`, qty: 4, price: 0.6 },
    { key: 'cap', name: '装饰端盖', spec: `Ø${d} 内径 · 黑色`, qty: 4, price: 0.6 },
    ...(nCross ? [{ key: 'cross', name: '十字夹', spec: `Ø${d}×Ø${d} 铝合金 · ${clamp.screw} 螺丝`, qty: nCross, price: clamp.cross }] : []),
    { key: 'board', name: '层板', spec: `${WOOD[c.wood].name} ${c.width}×${c.depth}×${T}mm，四角钻 Ø${d + 0.5} 通孔（孔心距边 ${c.inset}mm）`, qty: n, unit: '块', price: board.cny },
  ]
  const keys = [...new Set([col.key, ...(nCross ? [clamp.key] : [])])].sort((a, b2) => a - b2)
  const tools = [
    `内六角扳手 ${keys.join(' / ')}mm（限位环顶丝${nCross ? ' · 十字夹' : ''}）`,
    '卷尺 + 铅笔（标记层高）',
    '水平仪（手机水平仪 App 亦可）',
    '干抹布 / 酒精湿巾（擦光轴防锈油）',
    ...(c.feet === 'leveler' ? [`${SHAFT[d].endTap} 丝锥（若商家未代攻丝）`] : []),
  ]

  // ---------- 评估 ----------
  const allow = (4 * col.holdKg) / 2
  const holdRating: Rating = c.loadKg <= allow * 0.6 ? { level: 'good', label: '余量充足' } : c.loadKg <= allow ? { level: 'ok', label: '合格' } : { level: 'warn', label: '限位环可能打滑' }
  const span = 2 * X
  const I = (c.depth * T ** 3) / 12
  const w = (c.loadKg * 9.81) / span
  const sag = (5 * w * span ** 4) / (384 * WOOD_E * I)
  const sagRating: Rating = sag <= 1.5 ? { level: 'good', label: '刚性好' } : sag <= 3 ? { level: 'ok', label: '合格' } : { level: 'warn', label: '层板偏软' }
  const slender = c.height / d / (c.backBars ? 1.35 : 1)
  const wobble: Rating = slender < 75 ? { level: 'good', label: '稳固' } : slender < 105 ? { level: 'ok', label: '轻微晃动' } : { level: 'warn', label: '易晃动' }
  const warnings: string[] = []
  if (holdRating.level === 'warn') warnings.push(`单层 ${c.loadKg}kg 超过 4 个 Ø${d} 限位环的建议承载（约 ${allow}kg）：每角改用双环叠加，或换更粗的光轴。`)
  if (sagRating.level === 'warn') warnings.push(`层板跨度 ${Math.round(span)}mm，${T}mm 板下挠约 ${sag.toFixed(1)}mm：建议换 25mm 板或缩小宽度。`)
  if (wobble.level === 'warn') warnings.push(c.backBars ? `高 ${c.height}mm 对 Ø${d} 光轴偏细，建议换更粗的光轴。` : `高 ${c.height}mm、Ø${d} 光轴偏细，建议加背部加强横杆或换更粗的光轴。`)
  if (c.height > c.depth * 4) warnings.push('高宽比较大，放满后重心偏高：建议用防倾倒绑带固定到墙面。')
  if (d === 10 && c.height > 1400) warnings.push('Ø10 只建议做 1.4m 以下的落地架。')
  if (c.material === 'chrome') warnings.push('镀铬层怕水：放在厨房、卫生间或阳台请改用 304 不锈钢。')

  const rod = rodWeightPrice(parts, c.material)
  const hw = hwTotal(hardware)
  const weightKg = rod.kg + board.kg * n + nCollar * 0.03
  const minutes = Math.round(10 + nCollar * 1.2 + n * 3 + nCross * 2)
  const metrics: Metric[] = [
    { label: `单层承重（${c.loadKg}kg）`, value: `≤ ${allow}kg`, note: holdRating.label, level: holdRating.level },
    { label: '层板下挠', value: `${sag.toFixed(1)}mm`, note: sagRating.label, level: sagRating.level },
    { label: '长细比', value: slender.toFixed(0), note: wobble.label, level: wobble.level },
  ]
  return {
    product: 'shelf', name: c.name,
    dims: { width: c.width, depth: c.depth, height: c.height },
    parts, byId,
    cutList, cutTitle: `光轴切割清单（${MATERIAL[c.material].name}，两端倒角，公差 ±0.5mm）`,
    cutNote: `下单时备注：两端倒角去毛刺${c.feet === 'leveler' ? `，底端攻丝 ${SHAFT[d].endTap}` : ''}。层板请商家按 Ø${d + 0.5} 钻通孔，孔位误差 ≤ 0.5mm，否则光轴穿不进或晃动。`,
    hardware, tools,
    stats: { weightKg, priceCny: Math.round(rod.cny + hw), minutes },
    warnings, metrics,
    center: [0, c.height / 2, 0],
    designView: { focus: [0, c.height * 0.5, 0], dist: Math.hypot(c.width, c.depth, c.height) * 1.9 },
    overlay: { load: { y: tierY[n - 1] + 6, w: c.width, d: c.depth, kg: c.loadKg } },
    config: c, d, boardT: T, feet: c.feet,
    info: { X, Z, tierY, footH, backBarY },
  }
}

export function shelfGuides(m: ShelfModel) {
  const c = m.config
  const { X, Z, tierY, backBarY } = m.info
  const n = c.tiers
  const d = m.d
  const T = m.boardT
  const col = COLLAR[d]
  const D = overallDist(m.dims)
  const close = Math.max(520, Math.min(900, D * 0.3))
  const ks = ['fl', 'fr', 'bl', 'br']
  const g = new GuideBuilder()
  const nCollar = m.parts.filter((p) => p.geo.kind === 'collar').length
  const under = (i: number) => ks.map((k) => `col-${i}-${k}-u`)
  const above = (i: number) => (i === 0 || i === n - 1 ? ks.map((k) => `col-${i}-${k}-a`) : [])
  const marks = tierY.map((y) => y - T)

  g.add(explodeStep(m, `共 4 根光轴、${n} 块层板、${nCollar} 个限位环（清单里多备了 2 个）。先用干布或酒精湿巾把光轴表面的防锈油擦干净——油膜会让限位环打滑，这是光轴家具最常见的返工原因。`, '光轴端面又硬又利，搬运时注意别划到地板。'))

  g.add({
    id: 'rods', title: c.feet === 'leveler' ? '光轴装上调节脚' : '光轴套上脚套',
    desc: c.feet === 'leveler'
      ? `把调节脚旋入每根光轴底端的 ${SHAFT[d].endTap} 攻丝孔，先旋到底再退出约 3mm，留出调平余量。4 根光轴按层板孔位立好（可请人扶住）。`
      : '把橡胶脚套压到每根光轴底端，用手掌拍紧即可。4 根光轴按层板孔位立好（可请人扶住）。',
    chips: [{ label: '光轴 × 4', sub: `Ø${d} · ${c.height - m.info.footH}mm` }, { label: c.feet === 'leveler' ? '调节脚 × 4' : '脚套 × 4', sub: c.feet === 'leveler' ? SHAFT[d].endTap : undefined }],
    motion: 'enter', focus: [0, 120, 0], view: { dir: VIEW.low, dist: close * 1.5 },
    detail: c.feet === 'leveler' ? 'rodFoot' : 'rodPad',
    tip: '也可以先把底层板平放在地上，光轴从上往下穿，更省力。',
  }, [...ks.map((k) => `rod-${k}`), ...ks.map((k) => `foot-${k}`)])

  g.add({
    id: 'mark', title: '标记层高，装第一组限位环',
    desc: `从地面量起，在每根光轴上用铅笔标出各层板底面高度：${marks.map((y) => `${Math.round(y)}`).join(' / ')}mm。把 4 个限位环套到最低的标记处，顶丝朝外，先轻拧到不下滑即可。`,
    chips: [{ label: '限位环 × 4', sub: `Ø${d} · 内六角 ${col.key}mm` }, { label: '层板底面', sub: `${marks.map((y) => Math.round(y)).join(' / ')}` }],
    motion: 'enter', focus: m.byId[`col-0-fl-u`].position, view: { dir: VIEW.frontLeft, dist: close * 0.75 },
    detail: 'collar', tool: collarTool(m.byId['col-0-fr-u'], d),
    tip: '4 个标记一定要等高，可以先量好一根，再用它比着画其余三根。',
  }, under(0))

  for (let i = 0; i < n; i++) {
    const first = i === 0
    const last = i === n - 1
    const ids = [...(first ? [] : under(i)), `board-${i}`, ...above(i)]
    const lock = above(i).length > 0
    const toolCol = m.byId[lock ? `col-${i}-fr-a` : `col-${i}-fr-u`]
    g.add({
      id: `tier-${i}`,
      title: first ? '放入底层板并上下夹紧' : last ? '安装顶层板并上下夹紧' : `安装第 ${i + 1} 层板`,
      desc: first
        ? `层板 4 个孔对准光轴，从上往下套到限位环上。再在板面上方各套 1 个限位环压住层板——底层和顶层上下夹紧，整个架子就不会晃。`
        : last
          ? `在 ${Math.round(marks[i])}mm 标记处装 4 个限位环，套入顶层板，再在板面上方各装 1 个限位环压紧。光轴顶端会露出约 ${Math.round(c.height - tierY[i])}mm。`
          : `在 ${Math.round(marks[i])}mm 标记处装 4 个限位环（顶丝朝外，先轻拧），再把层板从顶端套下去，落在限位环上。`,
      chips: [
        { label: `${first ? '底层板' : last ? '顶层板' : `第 ${i + 1} 层板`} × 1`, sub: `${c.width}×${c.depth}×${T}` },
        { label: `限位环 × ${(first ? 0 : 4) + above(i).length}` },
        { label: '孔径', sub: `Ø${d + 0.5}` },
      ],
      motion: 'enter', focus: [0, tierY[i] - T / 2, 0],
      view: { dir: last ? VIEW.high : VIEW.iso, dist: close * 1.25 },
      marker: toolCol.position, detail: lock ? 'shelf' : 'shelfRest', tool: collarTool(toolCol, d),
      tip: first ? '水平仪放在板面上，哪角低就松开那角的限位环往上推一点，调平后再拧紧。' : undefined,
    }, ids)
  }

  if (backBarY.length) {
    const ids = m.parts.filter((p) => p.id.startsWith('bx-') || p.id.startsWith('bar-')).map((p) => p.id)
    const bx = m.byId['bx-0-r']
    g.add({
      id: 'backbars', title: '安装背部加强横杆',
      desc: `在两根后光轴离地 ${backBarY.map((y) => Math.round(y)).join(' / ')}mm 处各装一个十字夹，横杆从十字夹另一个孔穿过，两端各露出约 30mm。横杆和后光轴形成框，能明显减少左右晃动。`,
      chips: [{ label: `十字夹 × ${ids.filter((x) => x.startsWith('bx-')).length}`, sub: `内六角 ${CLAMP[d].key}mm` }, { label: `横杆 × ${backBarY.length}`, sub: `Ø${d} · ${2 * Math.round(X) + 60}mm` }],
      motion: 'enter', focus: [0, backBarY[0], -Z], view: { dir: VIEW.back, dist: close * 1.4 },
      marker: bx.position, detail: 'cross',
      tool: screwTool(bx, 'crossA', d),
    }, ids)
  }

  g.add({
    id: 'caps', title: '压入顶部端盖',
    desc: '把 4 个装饰端盖压到光轴顶端，盖住锋利的切口，家里有小孩时尤其重要。',
    chips: [{ label: '装饰端盖 × 4', sub: `Ø${d}` }],
    motion: 'enter', focus: m.byId['cap-fr'].position, view: { dir: VIEW.high, dist: close * 0.75 }, detail: 'rodCap',
  }, ks.map((k) => `cap-${k}`))

  g.add({
    id: 'finish', title: '逐层调平并拧紧',
    desc: `水平仪依次放在每层板上：整体歪先调${c.feet === 'leveler' ? '底部调节脚' : '底层限位环'}，单层歪就松开偏低那角的限位环上推。全部调平后，用 ${col.key}mm 内六角把 ${nCollar} 个顶丝逐个拧紧。`,
    chips: [{ label: '单层承重', sub: m.metrics[0].value }, { label: '稳定性', sub: m.metrics[2].note }, { label: '总重', sub: `约 ${m.stats.weightKg.toFixed(1)}kg` }],
    motion: 'none', focus: [0, c.height * 0.46, 0], view: { dir: VIEW.iso, dist: D * 1.2 },
    overlays: ['dims'], detail: 'level', marker: m.byId[`board-${n - 1}`].position, autoRotate: true,
    tip: c.height > c.depth * 4 ? '架子较高，放满东西前先用防倾倒绑带固定到墙上。' : undefined,
  })

  const assembly = g.build(`${g.steps.length} 步 · 约 ${m.stats.minutes} 分钟 · 1 人可完成`)

  // ---------- 修复：层板下滑 ----------
  const mid = Math.min(1, n - 1)
  const slip: Step[] = [
    {
      id: 's1', title: '找到打滑的限位环',
      desc: '层板往哪边歪，就是哪一角的限位环滑了。用手托住层板该角，确认限位环和铅笔标记之间有没有错位。',
      chips: [{ label: '层板歪向', sub: '= 打滑那角' }, { label: '常见原因', sub: '防锈油没擦净' }],
      active: [`board-${mid}`, ...under(mid)], motion: 'none',
      focus: m.byId[`board-${mid}`].position, view: { dir: VIEW.iso, dist: close * 1.4 }, detail: 'collar',
    },
    {
      id: 's2', title: '擦油后重新锁紧',
      desc: `先把这层东西搬空，松开顶丝，用酒精把限位环位置的光轴擦干净，推回标记处再拧紧（${col.screw} 顶丝，扳手拧到手腕吃力即可）。顶丝已经滑丝的直接换新环。`,
      chips: [{ label: `内六角 ${col.key}mm` }, { label: '酒精湿巾' }, { label: '备用限位环' }],
      active: under(mid), motion: 'swap',
      focus: m.byId[`col-${mid}-fr-u`].position, view: { dir: VIEW.frontRight, dist: close * 0.7 },
      detail: 'collar', tool: collarTool(m.byId[`col-${mid}-fr-u`], d),
    },
    {
      id: 's3', title: '受力大的层改为双环',
      desc: `在原限位环正下方再叠一个（红色虚线），两个环一起承重，防滑能力约翻倍。当前单层建议承重 ${m.metrics[0].value}。`,
      chips: [{ label: `新增限位环 × ${(n - 1) * 4}` }, { label: '适合', sub: '书本、绿植等重物层' }],
      active: [], motion: 'none',
      focus: m.byId[`col-${mid}-fl-u`].position, view: { dir: VIEW.frontLeft, dist: close * 0.8 }, detail: 'collar',
      suggest: m.parts.filter((p) => p.geo.kind === 'collar' && p.id.endsWith('-u') && !p.id.startsWith('col-0-')).map((p) => ({
        ...p, id: `${p.id}-x`, position: [p.position[0], p.position[1] - col.w - 1, p.position[2]] as V3,
      })),
    },
    {
      id: 's4', title: '复查水平',
      desc: '把水平仪放回这层板上，确认气泡居中后再放回物品。重物尽量放在底层。',
      chips: [{ label: '水平仪' }, { label: '重物放底层' }],
      active: [`board-${mid}`], motion: 'none',
      focus: m.byId[`board-${mid}`].position, view: { dir: VIEW.iso, dist: close * 1.5 }, detail: 'level',
    },
  ]

  // ---------- 修复：整体晃动 ----------
  const sandwich = m.parts.filter((p) => p.id.endsWith('-a') || p.id.startsWith('col-0-') || p.id.startsWith(`col-${n - 1}-`)).map((p) => p.id)
  const wob: Step[] = [
    {
      id: 'w1', title: '判断晃动方向',
      desc: '左右推顶层板：左右晃 → 缺少横向支撑；只有一角会“咔哒”响 → 那只脚没着地。',
      chips: [{ label: '左右晃', sub: '查夹环 / 加横杆' }, { label: '单角响', sub: '查底脚' }],
      active: ks.map((k) => `rod-${k}`), motion: 'wiggle',
      focus: [0, c.height * 0.5, 0], view: { dir: VIEW.front, dist: D * 0.95 }, detail: 'rodWobble',
    },
    {
      id: 'w2', title: '锁紧上下夹环',
      desc: '底层板和顶层板的上下两组限位环是整个架子的“节点”，任何一个松了都会晃。逐个检查并拧紧。',
      chips: [{ label: `夹环 × ${sandwich.length}` }, { label: `内六角 ${col.key}mm` }],
      active: sandwich, motion: 'none',
      focus: m.byId[`col-${n - 1}-fr-a`].position, view: { dir: VIEW.high, dist: close * 0.9 }, detail: 'shelf', tool: collarTool(m.byId[`col-${n - 1}-fr-a`], d),
    },
    {
      id: 'w3', title: c.feet === 'leveler' ? '调节底脚' : '检查脚套',
      desc: c.feet === 'leveler' ? '旋出翘起那只调节脚，直到 4 只同时着地、对角按压不再响。' : '地面不平时脚套无法补偿，可在悬空那只下面垫薄垫片，或改用调节脚。',
      chips: [{ label: c.feet === 'leveler' ? '调节脚 × 4' : '脚套 × 4' }],
      active: ks.map((k) => `foot-${k}`), motion: 'swap',
      focus: m.byId['foot-fr'].position, view: { dir: VIEW.low, dist: close * 0.9 }, detail: c.feet === 'leveler' ? 'rodFoot' : 'rodPad',
    },
  ]
  if (!c.backBars) {
    const alt = generateShelf({ ...c, backBars: true })
    const sug = alt.parts.filter((p) => !m.byId[p.id])
    wob.push({
      id: 'w4', title: '加装背部加强横杆',
      desc: `在两根后光轴之间用十字夹加 ${alt.info.backBarY.length} 根横杆（红色虚线），不用拆层板，长细比可降低约 25%。在「自定义设计」里打开即可生成新清单。`,
      chips: [{ label: `十字夹 × ${sug.filter((p) => p.geo.kind === 'cross').length}` }, { label: `横杆 × ${alt.info.backBarY.length}`, sub: `Ø${d} · ${2 * Math.round(X) + 60}mm` }],
      active: [], motion: 'none',
      focus: [0, alt.info.backBarY[0], -Z], view: { dir: VIEW.back, dist: close * 1.5 }, detail: 'cross', suggest: sug,
    })
  }
  if (c.height > 1000) {
    wob.push({
      id: 'w5', title: '用绑带固定到墙面',
      desc: '1 米以上的置物架建议用防倾倒绑带把顶层板和墙面连起来，地震或小孩攀爬时不会整体倾倒。',
      chips: [{ label: '防倾倒绑带 × 1' }, { label: '膨胀螺丝 × 2' }],
      active: [`board-${n - 1}`], motion: 'none',
      focus: m.byId[`board-${n - 1}`].position, view: { dir: VIEW.back, dist: close * 1.5 },
    })
  }

  return [
    assembly,
    repairGuide('repair-slip', '修复：层板下滑 / 倾斜', 10, slip),
    repairGuide('repair-wobble', '修复：置物架晃动', 15, wob),
  ]
}
