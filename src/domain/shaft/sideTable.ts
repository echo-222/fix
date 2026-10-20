import type { HwItem, Metric, Rating, Step } from '../types'
import {
  Builder, GuideBuilder, VIEW, boardWeightPrice, clampByFields, collarTool, explodeStep, hwTotal, norm2, overallDist,
  repairGuide, rodCutList, rodWeightPrice, screwTool, type FieldGroup, type ShaftModel,
} from './common'
import { COLLAR, D_OPTIONS, MATERIAL, SHAFT, SHF, WOOD, WOOD_OPTIONS, type ShaftD, type ShaftMaterial, type Wood } from './specs'

export interface TableConfig {
  kind: 'table'
  name: string
  width: number
  depth: number
  height: number
  d: ShaftD
  material: ShaftMaterial
  wood: Wood
  boardT: number
  inset: number
  lowerShelf: boolean
  /** 下层板顶面离地高度 */
  shelfHeight: number
  feet: 'leveler' | 'pad'
}

export const TABLE_DEFAULT: TableConfig = {
  kind: 'table', name: '光轴边几',
  width: 450, depth: 450, height: 500,
  d: 12, material: 'chrome', wood: 'walnut', boardT: 18, inset: 45,
  lowerShelf: true, shelfHeight: 150, feet: 'pad',
}

export const TABLE_FIELDS: FieldGroup<TableConfig>[] = [
  {
    title: '尺寸',
    fields: [
      { type: 'num', key: 'width', label: '桌面宽', min: 300, max: 800, step: 10 },
      { type: 'num', key: 'depth', label: '桌面进深', min: 300, max: 800, step: 10 },
      { type: 'num', key: 'height', label: '高', min: 350, max: 750, step: 5 },
      { type: 'num', key: 'inset', label: '桌腿内缩', min: 30, max: 120, step: 5 },
    ],
  },
  {
    title: '光轴',
    fields: [
      { type: 'seg', key: 'd', label: '桌腿直径', options: D_OPTIONS },
      { type: 'seg', key: 'material', label: '材质', options: (Object.keys(MATERIAL) as ShaftMaterial[]).map((k) => ({ value: k, label: MATERIAL[k].short, hint: MATERIAL[k].note })) },
      { type: 'seg', key: 'feet', label: '底脚', options: [{ value: 'pad', label: '橡胶脚套' }, { value: 'leveler', label: '调节脚', hint: '轴端需攻丝' }] },
    ],
  },
  {
    title: '板材',
    fields: [
      { type: 'seg', key: 'wood', label: '木材', options: WOOD_OPTIONS },
      { type: 'seg', key: 'boardT', label: '板厚', options: [{ value: 18, label: '18mm' }, { value: 25, label: '25mm' }] },
      { type: 'bool', key: 'lowerShelf', label: '下层置物板', hint: '同时起到加固桌腿的作用' },
      { type: 'num', key: 'shelfHeight', label: '下层板离地', min: 80, max: 400, step: 5, show: (c) => c.lowerShelf },
    ],
  },
]

export interface TableInfo {
  X: number
  Z: number
  yUnder: number
  shelfY: number
  footH: number
}

export type TableModel = ShaftModel<TableConfig, TableInfo>

const CORNERS = [['fl', -1, 1, '左前'], ['fr', 1, 1, '右前'], ['bl', -1, -1, '左后'], ['br', 1, -1, '右后']] as const
const STD_SCREW = [10, 12, 14, 16, 20, 25]

export function generateTable(input: TableConfig): TableModel {
  const c0 = clampByFields({ ...TABLE_DEFAULT, ...input, kind: 'table' as const }, TABLE_FIELDS)
  const c = { ...c0, shelfHeight: Math.min(c0.shelfHeight, c0.height - 200) }
  const d = c.d
  const shf = SHF[d]
  const col = COLLAR[d]
  const T = c.boardT
  const X = c.width / 2 - c.inset
  const Z = c.depth / 2 - c.inset
  const footH = c.feet === 'leveler' ? 22 : 3
  const yUnder = c.height - T
  const b = new Builder(d, c.material)

  b.board('top', '桌面板', c.wood, c.width, T, c.depth, [], [0, c.height - T / 2, 0], [0, 260, 0])
  for (const [k, sx, sz, name] of CORNERS) {
    b.push({ id: `shf-${k}`, name: '法兰支座', group: 'bracket', spec: `SHF${d}`, geo: { kind: 'flange', d }, position: [sx * X, yUnder, sz * Z], enterFrom: [0, -110, 0] })
    const top = yUnder - 1
    b.rod(`rod-${k}`, `${name}桌腿`, 'leg', top - footH, 'y', [sx * X, footH + (top - footH) / 2, sz * Z], [0, -420, 0])
    if (c.feet === 'leveler') {
      b.push({ id: `foot-${k}`, name: '调节脚', group: 'foot', spec: `${SHAFT[d].endTap} 调节脚`, geo: { kind: 'leveler', size: footH }, position: [sx * X, footH, sz * Z], enterFrom: [0, -120, 0] })
    } else {
      b.push({ id: `foot-${k}`, name: '橡胶脚套', group: 'foot', spec: `Ø${d} 脚套`, geo: { kind: 'rodCap', d }, position: [sx * X, 0, sz * Z], enterFrom: [0, -100, 0] })
    }
  }

  const shelfY = c.shelfHeight
  if (c.lowerShelf) {
    const holes: [number, number][] = CORNERS.map(([, sx, sz]) => [sx * X, sz * Z])
    for (const [k, sx, sz] of CORNERS) {
      const out = norm2(sx, sz * 1.6)
      b.collar(`col-${k}-a`, [sx * X, shelfY + col.w / 2, sz * Z], out, [0, -260, 0], 0)
      b.collar(`col-${k}-u`, [sx * X, shelfY - T - col.w / 2, sz * Z], out, [0, -180, 0], 0.8)
    }
    b.board('shelf', '下层板', c.wood, c.width, T, c.depth, holes, [0, shelfY - T / 2, 0], [0, -320, 0], 0.4)
  }

  const parts = b.parts
  const byId = b.byId

  const screwLen = STD_SCREW.find((l) => l >= shf.T + Math.min(T - 6, 12)) ?? 20
  const nCollar = parts.filter((p) => p.geo.kind === 'collar').length
  const top = boardWeightPrice(c.wood, c.width, c.depth, T)
  const hardware: HwItem[] = [
    { key: 'shf', name: '法兰支座', spec: `SHF${d} 铝合金 · 孔距 ${shf.B}mm · ${shf.clamp} 夹紧螺丝`, qty: 4, price: shf.price },
    { key: 'wood', name: '木螺丝', spec: `ST4.2×${screwLen} 沉头（不超过板厚，避免穿透桌面）`, qty: 8, price: 0.1 },
    ...(nCollar ? [{ key: 'collar', name: '限位环（固定环）', spec: `Ø${d} 顶丝式 · ${col.screw} · 建议多备 2 个`, qty: nCollar + 2, price: col.price }] : []),
    c.feet === 'leveler'
      ? { key: 'feet', name: '调节脚', spec: `${SHAFT[d].endTap} 螺杆 · Ø30 防滑底`, qty: 4, price: 2.5 }
      : { key: 'feet', name: '橡胶脚套', spec: `Ø${d} 内径 · 防滑`, qty: 4, price: 0.6 },
    { key: 'top', name: '桌面板', spec: `${WOOD[c.wood].name} ${c.width}×${c.depth}×${T}mm`, qty: 1, unit: '块', price: top.cny },
    ...(c.lowerShelf ? [{ key: 'shelf', name: '下层板', spec: `${WOOD[c.wood].name} ${c.width}×${c.depth}×${T}mm，四角钻 Ø${d + 0.5} 通孔（孔心距边 ${c.inset}mm）`, qty: 1, unit: '块', price: top.cny }] : []),
  ]
  const keys = [...new Set([shf.key, ...(nCollar ? [col.key] : [])])].sort((a, b2) => a - b2)
  const tools = [
    `内六角扳手 ${keys.join(' / ')}mm`,
    '十字螺丝刀 / 电钻（固定法兰支座）',
    'Ø3 钻头（预钻引孔）',
    '软垫或毯子（桌面朝下时保护漆面）',
    '卷尺 + 铅笔',
    ...(c.feet === 'leveler' ? [`${SHAFT[d].endTap} 丝锥（若商家未代攻丝）`] : []),
  ]

  const legLen = yUnder - 1 - footH
  const slender = c.height / d / (c.lowerShelf ? 1.5 : 1)
  const wobble: Rating = slender < 30 ? { level: 'good', label: '稳固' } : slender < 45 ? { level: 'ok', label: '轻微晃动' } : { level: 'warn', label: '易晃动' }
  const allow = 3 * col.holdKg
  const loadRating: Rating = { level: 'good', label: '日常使用足够' }
  const warnings: string[] = []
  if (wobble.level === 'warn') warnings.push(c.lowerShelf ? `高 ${c.height}mm 对 Ø${d} 桌腿偏细，建议换更粗的光轴。` : `没有下层板时只靠法兰支座固定桌腿，高 ${c.height}mm 会晃：建议加下层板或换更粗的光轴。`)
  if (c.inset < shf.W / 2 + 5) warnings.push(`桌腿内缩 ${c.inset}mm 太小，SHF${d} 法兰（长 ${shf.W}mm）会超出桌面边缘：至少 ${Math.ceil(shf.W / 2 + 5)}mm。`)
  if (T < 18 && d >= 16) warnings.push('板太薄，木螺丝握钉力不足。')
  if (c.lowerShelf && c.height - c.shelfHeight < 200) warnings.push('下层板离桌面太近，放不下东西。')
  if (c.material === 'chrome') warnings.push('镀铬层怕水：沙发边常放水杯，可考虑 304 不锈钢。')

  const rod = rodWeightPrice(parts, c.material)
  const hw = hwTotal(hardware)
  const weightKg = rod.kg + top.kg * (c.lowerShelf ? 2 : 1) + 4 * 0.03 + nCollar * 0.03
  const minutes = Math.round(12 + 4 * 3 + nCollar * 1.2 + (c.lowerShelf ? 3 : 0))
  const metrics: Metric[] = [
    { label: '桌面承重', value: `≤ ${allow}kg`, note: loadRating.label, level: loadRating.level },
    { label: '长细比', value: slender.toFixed(0), note: wobble.label, level: wobble.level },
  ]

  return {
    product: 'table', name: c.name,
    dims: { width: c.width, depth: c.depth, height: c.height },
    parts, byId,
    cutList: rodCutList(parts, () => (c.feet === 'leveler' ? `底端攻丝 ${SHAFT[d].endTap}（装调节脚）` : undefined), c.material),
    cutTitle: `光轴切割清单（${MATERIAL[c.material].name}，两端倒角，公差 ±0.5mm）`,
    cutNote: `桌腿长 ${Math.round(legLen)}mm = 桌高 ${c.height} − 板厚 ${T} − 1mm 间隙${c.feet === 'leveler' ? ` − 调节脚 ${footH}` : ' − 脚套 3'}。${c.lowerShelf ? `下层板请商家钻 Ø${d + 0.5} 通孔，孔位与桌面法兰中心对齐。` : ''}`,
    hardware, tools,
    stats: { weightKg, priceCny: Math.round(rod.cny + hw), minutes },
    warnings, metrics,
    center: [0, c.height / 2, 0],
    designView: { focus: [0, c.height * 0.5, 0], dist: Math.hypot(c.width, c.depth, c.height) * 2.1 },
    overlay: { load: { y: c.height + 6, w: c.width, d: c.depth, kg: 10 } },
    config: c, d, boardT: T, feet: c.feet,
    info: { X, Z, yUnder, shelfY, footH },
  }
}

export function tableGuides(m: TableModel) {
  const c = m.config
  const d = m.d
  const T = m.boardT
  const shf = SHF[d]
  const col = COLLAR[d]
  const { yUnder, shelfY } = m.info
  const D = overallDist(m.dims)
  const close = Math.max(420, Math.min(700, D * 0.38))
  const ks = ['fl', 'fr', 'bl', 'br']
  const g = new GuideBuilder()
  const screw = m.hardware.find((h) => h.key === 'wood')!.spec.split(' ')[0]

  g.add(explodeStep(m, `共 4 根桌腿、4 个 SHF${d} 法兰支座、${c.lowerShelf ? '2 块板' : '1 块桌面'}。边几建议倒过来装：桌面朝下放在软垫上，最后再翻正。`, '先擦掉光轴表面的防锈油，否则法兰支座和限位环都容易打滑。'))

  g.add({
    id: 'flange', title: '桌面朝下，固定法兰支座',
    desc: `把桌面朝下放在软垫上。在四角距两边各 ${c.inset}mm 处画十字线，法兰支座中心对准十字，用 Ø3 钻头预钻 8 个引孔（深约 ${T - 6}mm），再用 ${screw} 木螺丝固定。`,
    chips: [{ label: '法兰支座 × 4', sub: `SHF${d}` }, { label: '木螺丝 × 8', sub: screw }, { label: '引孔', sub: `Ø3 · 深 ${T - 6}mm` }],
    motion: 'enter', pose: 'flipped',
    focus: [0, yUnder, 0], view: { dir: VIEW.high, dist: D * 0.72 }, detail: 'flange',
    tip: '引孔深度用胶带在钻头上做记号，千万别钻穿桌面。',
  }, ['top', ...ks.map((k) => `shf-${k}`)])

  g.add({
    id: 'legs', title: '插入桌腿并锁紧',
    desc: `把 4 根桌腿插进法兰支座的轴孔，插到底后用 ${shf.key}mm 内六角拧紧支座侧面的 ${shf.clamp} 夹紧螺丝。4 根腿要一样长，插好后目测是否平行。`,
    chips: [{ label: '桌腿 × 4', sub: m.byId['rod-fl'].spec }, { label: '夹紧螺丝', sub: `${shf.clamp} · 内六角 ${shf.key}mm` }],
    motion: 'enter', pose: 'flipped',
    focus: [0, c.height * 0.5, 0], view: { dir: VIEW.iso, dist: D * 0.9 },
    detail: 'flangeRod', tool: screwTool(m.byId['shf-fr'], 'shf', d),
  }, ks.map((k) => `rod-${k}`))

  if (c.lowerShelf) {
    const mark = Math.round(yUnder - shelfY - col.w)
    g.add({
      id: 'shelf', title: '装下层板',
      desc: `从桌面底面量起 ${mark}mm，在每根腿上装一个限位环（现在桌子倒着，环在下层板“下方”）。套入下层板，再在板的另一面各装一个限位环夹紧。`,
      chips: [{ label: '下层板 × 1', sub: `${c.width}×${c.depth}×${T}` }, { label: '限位环 × 8', sub: `Ø${d} · 内六角 ${col.key}mm` }, { label: '标记', sub: `距桌面底 ${mark}mm` }],
      motion: 'enter', pose: 'flipped',
      focus: m.byId['shelf'].position, view: { dir: VIEW.iso, dist: D * 0.75 },
      marker: m.byId['col-fr-u'].position, detail: 'shelf', tool: collarTool(m.byId['col-fr-u'], d),
      tip: '下层板把 4 根腿连成一个框，是边几不晃的关键，限位环一定要拧紧。',
    }, [...ks.map((k) => `col-${k}-a`), 'shelf', ...ks.map((k) => `col-${k}-u`)])
  }

  g.add({
    id: 'feet', title: c.feet === 'leveler' ? '旋入调节脚' : '套上脚套',
    desc: c.feet === 'leveler' ? `把调节脚旋入桌腿末端的 ${SHAFT[d].endTap} 攻丝孔，先旋到底再退出约 2mm。` : '把橡胶脚套压到 4 根桌腿末端，既防滑又保护地板。',
    chips: [{ label: c.feet === 'leveler' ? '调节脚 × 4' : '脚套 × 4', sub: `Ø${d}` }],
    motion: 'enter', pose: 'flipped',
    focus: [0, c.feet === 'leveler' ? 30 : 10, 0], view: { dir: VIEW.iso, dist: D * 0.7 }, detail: c.feet === 'leveler' ? 'rodFoot' : 'rodCap',
  }, ks.map((k) => `foot-${k}`))

  g.add({
    id: 'finish', title: '翻正并检查',
    desc: `两手握住两根桌腿把边几翻正（不要只拎桌面）。放到使用位置，对角按压桌面，有晃动就${c.feet === 'leveler' ? '调节那只调节脚' : '检查法兰支座螺丝'}。`,
    chips: [{ label: '桌面承重', sub: m.metrics[0].value }, { label: '稳定性', sub: m.metrics[1].note }, { label: '总重', sub: `约 ${m.stats.weightKg.toFixed(1)}kg` }],
    motion: 'none', focus: [0, c.height * 0.45, 0], view: { dir: VIEW.iso, dist: D * 1.3 },
    overlays: ['dims'], detail: 'level', marker: m.byId['top'].position, autoRotate: true,
  })

  const assembly = g.build(`${g.steps.length} 步 · 约 ${m.stats.minutes} 分钟 · 1 人可完成`)

  const wob: Step[] = [
    {
      id: 't1', title: '判断松动位置',
      desc: '按住桌面左右推：整张桌子晃 → 法兰支座或下层板松了；只有一角响 → 那只脚没着地。',
      chips: [{ label: '整体晃', sub: '查支座 / 下层板' }, { label: '单角响', sub: '查底脚' }],
      active: ks.map((k) => `rod-${k}`), motion: 'wiggle',
      focus: [0, c.height * 0.5, 0], view: { dir: VIEW.front, dist: D }, detail: 'rodWobble',
    },
    {
      id: 't2', title: '拧紧法兰支座夹紧螺丝',
      desc: `4 个法兰支座侧面各有一颗 ${shf.clamp} 夹紧螺丝，用 ${shf.key}mm 内六角逐个拧紧。桌腿能在支座里转动，说明这颗螺丝松了。`,
      chips: [{ label: '法兰支座 × 4' }, { label: `内六角 ${shf.key}mm` }],
      active: ks.map((k) => `shf-${k}`), motion: 'none',
      focus: m.byId['shf-fr'].position, view: { dir: VIEW.low, dist: close * 0.8 }, detail: 'flangeRod', tool: screwTool(m.byId['shf-fr'], 'shf', d),
    },
    {
      id: 't3', title: '木螺丝滑牙的处理',
      desc: '支座本身晃说明木螺丝滑牙了：把支座旋转 90° 换新位置重新打孔；反复拆装的家具，建议改用 M5 预埋螺母 + 机制螺丝。',
      chips: [{ label: '方案 1', sub: '支座转 90° 换孔位' }, { label: '方案 2', sub: 'M5 预埋螺母' }],
      active: ks.map((k) => `shf-${k}`), motion: 'swap',
      focus: m.byId['shf-fl'].position, view: { dir: VIEW.low, dist: close * 0.8 }, detail: 'flange',
    },
  ]
  if (c.lowerShelf) {
    wob.push({
      id: 't4', title: '锁紧下层板限位环',
      desc: '下层板上下的 8 个限位环把桌腿连成框，逐个拧紧。若下层板已经下滑，先松开下方 4 个环，把板推回原位再锁。',
      chips: [{ label: '限位环 × 8' }, { label: `内六角 ${col.key}mm` }],
      active: m.parts.filter((p) => p.geo.kind === 'collar').map((p) => p.id), motion: 'none',
      focus: m.byId['col-fr-a'].position, view: { dir: VIEW.frontRight, dist: close * 0.8 }, detail: 'shelf', tool: collarTool(m.byId['col-fr-a'], d),
    })
  } else {
    const alt = generateTable({ ...c, lowerShelf: true })
    wob.push({
      id: 't4', title: '加装下层板',
      desc: '没有下层板时，桌腿只靠 4 个法兰支座固定，久了必然会晃。加一块下层板（红色虚线）把 4 根腿连成框：需要拆下桌腿，套入限位环和下层板后再装回。',
      chips: [{ label: '下层板 × 1', sub: '四角钻孔' }, { label: '限位环 × 8' }, { label: '自定义设计里可一键打开' }],
      active: [], motion: 'none',
      focus: [0, alt.info.shelfY, 0], view: { dir: VIEW.iso, dist: close * 1.4 }, detail: 'shelf',
      suggest: alt.parts.filter((p) => !m.byId[p.id]),
    })
  }

  return [assembly, repairGuide('repair-wobble', '修复：边几晃动', 10, wob)]
}
