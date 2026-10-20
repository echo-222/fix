import { generateDesk, type DeskModel, type JointRef } from './desk'
import { BOLT_LEN, PROFILES } from './profiles'
import type { Chip, Guide, Part, Step, ToolSpec, V3 } from './types'

const VIEW = {
  iso: [1.1, 0.8, 1.5] as V3,
  frontLeft: [-1.25, 0.55, 1.0] as V3,
  frontRight: [1.25, 0.55, 1.0] as V3,
  low: [0.9, 0.22, 1.35] as V3,
  top: [0.12, 1.7, 0.55] as V3,
  back: [0.9, 0.6, -1.35] as V3,
  under: [0.75, -0.3, 1.25] as V3,
}

const TORQUE: Record<string, string> = { M5: '约 4 N·m', M6: '约 8 N·m', M8: '约 15 N·m' }

function overallDist(m: DeskModel) {
  const c = m.config
  return Math.hypot(c.width, c.depth, c.height + (c.backFrame ? c.backFrameHeight : 0)) * 1.75
}

function toolFor(m: DeskModel, j: JointRef): ToolSpec {
  const p = m.byId[j.beamId]
  const module = p.geo.kind === 'profile' ? PROFILES[p.geo.profile].module : 40
  if (m.config.connector === 'bracket') {
    const t = module * 0.14
    return {
      at: [
        j.corner[0] + j.beamDir[0] * (t + 0.5),
        j.corner[1] - module * 0.55,
        j.corner[2] + j.beamDir[2] * (t + 0.5),
      ],
      axis: j.beamDir,
      size: module,
    }
  }
  return {
    at: [j.corner[0] + j.beamDir[0] * module * 0.8, j.corner[1] - 0.5, j.corner[2] + j.beamDir[2] * module * 0.8],
    axis: [0, -1, 0],
    size: module,
  }
}

const jointFor = (list: JointRef[], beamId: string, pick: (j: JointRef) => number) =>
  [...list.filter((j) => j.beamId === beamId)].sort((a, b) => pick(b) - pick(a))[0]

function lenOf(m: DeskModel, id: string) {
  const g = m.byId[id]?.geo
  return g && g.kind === 'profile' ? `${g.profile} · ${g.length}mm` : ''
}

function hwChips(m: DeskModel, joints: JointRef[]): Chip[] {
  const bolt = m.bolt
  if (m.config.connector === 'internal') return [{ label: `内置连接件 × ${joints.length}` }]
  const n = joints.reduce((s, j) => s + j.brackets.length, 0)
  return [{ label: `角码 × ${n}` }, { label: `${bolt}×${BOLT_LEN[bolt]} + T 型螺母`, sub: `× ${n * 2}` }]
}

function bracketsOf(joints: JointRef[]) {
  return joints.flatMap((j) => j.brackets)
}

export function buildAssemblyGuide(m: DeskModel): Guide {
  const c = m.config
  const f = m.frame
  const steps: Step[] = []
  const installAt: Record<string, number> = {}
  const add = (s: Step, newParts: string[]) => {
    for (const id of newParts) installAt[id] = steps.length
    steps.push({ ...s, active: s.active.length ? s.active : newParts })
  }
  const D = overallDist(m)
  const close = Math.max(560, Math.min(900, D * 0.32))
  const bolt = m.bolt
  const internal = c.connector === 'internal'
  const hasBrace = c.lowerBrace !== 'none'

  const profiles = m.parts.filter((p) => p.geo.kind === 'profile')
  const hwTotal = m.hardware.filter((h) => h.key !== 'top' && h.unit !== '米').reduce((s, h) => s + h.qty, 0)

  // 1. 清点
  steps.push({
    id: 'overview',
    title: '清点零件',
    desc: `共 ${profiles.length} 根型材、约 ${hwTotal} 件五金。按切割清单核对长度（误差 ±0.5mm），同长度的型材放在一起，五金按规格分盒。`,
    chips: [
      ...m.cutList.slice(0, 3).map((ci) => ({ label: `${ci.name} × ${ci.qty}`, sub: `${ci.profile} · ${ci.length}` })),
      { label: '查看完整清单', sub: '菜单 → 零件清单' },
    ],
    active: [],
    motion: 'explode',
    focus: [0, c.height * 0.45, 0],
    view: { dir: VIEW.iso, dist: D * 1.15 },
    tip: '型材切口锋利，搬运时戴手套。',
  })

  // 2/3. 左右侧框
  for (const side of ['L', 'R'] as const) {
    const joints = side === 'L' ? m.joints.sideL : m.joints.sideR
    const legs = side === 'L' ? ['leg-fl', 'leg-bl'] : ['leg-fr', 'leg-br']
    const beamId = `beam-side${side}`
    const ids = [...legs, beamId, ...(hasBrace ? [`brace-side${side}`] : []), ...bracketsOf(joints)]
    const j = jointFor(joints, beamId, (x) => x.corner[2])
    const first = side === 'L'
    add({
      id: `side-${side}`,
      title: first ? '组装左侧框架' : '组装右侧框架',
      desc: first
        ? `把左前、左后两根桌腿平放，中间装上左侧上横梁${hasBrace ? `和离地 ${Math.round(f.yBrace)}mm 的下横撑` : ''}。${internal ? '把内置连接件塞入横梁端部，对准桌腿中心槽后用扳手从工艺孔拧紧。' : `先把 T 型螺母从桌腿端部滑入槽内，再用角码和 ${bolt} 螺丝连接。`}`
        : `用同样的方法组装右侧框架。${internal ? '' : '角码朝向桌子内侧，'}两个侧框应完全对称，可以叠放比对。`,
      chips: [
        { label: `桌腿 × 2`, sub: lenOf(m, legs[0]) },
        { label: `上横梁 × 1`, sub: lenOf(m, beamId) },
        ...(hasBrace ? [{ label: `下横撑 × 1`, sub: lenOf(m, `brace-side${side}`) }] : []),
        ...hwChips(m, joints),
      ],
      active: [],
      motion: 'enter',
      focus: j.corner,
      view: { dir: first ? VIEW.frontLeft : VIEW.frontRight, dist: close },
      detail: internal ? 'internal' : first ? 'tnut' : 'bracket',
      tool: toolFor(m, j),
      tip: '螺丝先拧到零件不晃即可，整个框架方正后再统一拧紧。',
    }, ids)
  }

  // 4. 前后横梁
  {
    const joints = m.joints.long
    const j = jointFor(joints, 'beam-front', (x) => -x.corner[0])
    add({
      id: 'long',
      title: '连接前后横梁',
      desc: `把两个侧框立起，间距约 ${Math.round(f.Wf - 2 * f.lx)}mm，装上前横梁和后横梁，形成桌子的主框架。横梁顶面要与桌腿顶面齐平——可以把一块平板压在上面检查。`,
      chips: [
        { label: '前 / 后横梁 × 2', sub: lenOf(m, 'beam-front') },
        ...hwChips(m, joints),
      ],
      active: [],
      motion: 'enter',
      focus: [0, f.legTop * 0.6, f.zc],
      view: { dir: VIEW.iso, dist: D * 0.75 },
      detail: internal ? 'internal' : 'bracket',
      tool: toolFor(m, j),
      tip: c.beamProfile === '4080' ? '4080 横梁要竖放（80 面朝前），抗弯能力约为横放的 4 倍。' : undefined,
    }, ['beam-front', 'beam-back', ...bracketsOf(joints)])
  }

  // 5. 下横撑
  if (hasBrace) {
    const joints = m.joints.brace
    const ids = m.parts.filter((p) => p.id === 'brace-back' || p.id === 'brace-front').map((p) => p.id)
    const j = jointFor(joints, 'brace-back', (x) => -x.corner[0])
    add({
      id: 'brace',
      title: c.lowerBrace === 'full' ? '安装前后下横撑' : '安装后下横撑',
      desc: c.lowerBrace === 'full'
        ? `在离地 ${Math.round(f.yBrace)}mm 处装上前、后下横撑，四周闭合后桌子最稳，适合站立工作台。`
        : `在离地 ${Math.round(f.yBrace)}mm 处装上后下横撑。U 型结构前方不挡腿，同时大幅减少前后晃动。`,
      chips: [{ label: `下横撑 × ${ids.length}`, sub: lenOf(m, ids[0]) }, ...hwChips(m, joints)],
      active: [],
      motion: 'enter',
      focus: [0, f.yBrace + 160, f.zc],
      view: { dir: VIEW.low, dist: D * 0.72 },
      detail: internal ? 'internal' : 'bracket',
      tool: toolFor(m, j),
    }, [...ids, ...bracketsOf(joints)])
  }

  // 6. 中间加强梁
  if (f.hasCenter) {
    const joints = m.joints.center
    const j = joints[0]
    add({
      id: 'center',
      title: '安装中间加强梁',
      desc: `框架已闭合，横梁端部无法再滑入螺母——改用弹片 T 型螺母：从槽口直接放入，旋转 90° 卡紧。中间梁支撑桌面中部，防止长期使用后下沉。`,
      chips: [
        { label: '中间加强梁 × 1', sub: lenOf(m, 'beam-center') },
        ...(internal ? [{ label: `内置连接件 × ${joints.length}` }] : [{ label: `角码 × ${bracketsOf(joints).length}` }, { label: '弹片 T 型螺母', sub: `× ${bracketsOf(joints).length * 2}` }]),
      ],
      active: [],
      motion: 'enter',
      focus: j.corner,
      view: { dir: VIEW.under, dist: close * 1.25 },
      detail: 'dropin',
      tool: toolFor(m, j),
    }, ['beam-center', ...bracketsOf(joints)])
  }

  // 7. 方正 + 拧紧
  const diag = Math.round(Math.hypot(f.Wf, f.Df))
  steps.push({
    id: 'square',
    title: '检查方正并拧紧',
    desc: `测量顶部框架的两条对角线，理论值约 ${diag}mm，两者相差 ≤ 2mm 即为方正。确认后按对角顺序拧紧全部螺丝（${bolt} ${TORQUE[bolt]}，扳手稍用力即可，不要加力杆）。`,
    chips: [{ label: '对角线 A = B', sub: `${diag}mm` }, { label: '误差', sub: '≤ 2mm' }, { label: '工具', sub: '卷尺 · 直角尺' }],
    active: [],
    motion: 'none',
    focus: [0, f.legTop, f.zc],
    view: { dir: VIEW.top, dist: D * 0.75 },
    overlays: ['diagonals'],
    detail: 'square',
    tip: '对角线偏长的那一角，轻推使其收短，再测一次。',
  })

  // 8. 脚
  {
    const ids = ['foot-fl', 'foot-fr', 'foot-bl', 'foot-br']
    const leveler = c.feet === 'leveler'
    const tap = PROFILES[c.legProfile].endTap
    add({
      id: 'feet',
      title: leveler ? '安装调节脚杯' : '安装脚轮',
      desc: leveler
        ? `把脚杯旋入桌腿底部的 ${tap} 攻丝孔，先全部旋到底，再统一退出约 5mm，留出调平余量。`
        : `把脚轮丝杆旋入桌腿底部的 ${tap} 攻丝孔并拧紧。带刹车的两只装在前面，方便脚踩。`,
      chips: [
        { label: leveler ? '调节脚杯 × 4' : '万向脚轮 × 4', sub: `${tap}` },
        { label: '前提', sub: `桌腿底端已攻丝 ${tap}` },
      ],
      active: [],
      motion: 'enter',
      focus: m.byId['foot-fl'].position,
      view: { dir: VIEW.low, dist: close * 0.9 },
      detail: leveler ? 'leveler' : 'caster',
      tip: '如果商家没有代攻丝，用丝锥配合切削油垂直攻入约 20mm。',
    }, ids)
  }

  // 9. 桌面
  {
    add({
      id: 'top',
      title: '安装桌面板',
      desc: `把桌面放到框架上，四边各外伸 ${c.overhang}mm${c.backFrame ? '（后沿与框架齐平，给挂架让位）' : ''}。从下方用 ${m.topFixings} 个桌面固定片 + 弹片螺母固定，木螺丝长度不超过 ${c.topThickness - 6}mm，避免穿透桌面。`,
      chips: [
        { label: '桌面板 × 1', sub: `${c.width}×${c.depth}×${c.topThickness}` },
        { label: `固定片 × ${m.topFixings}`, sub: 'ST4.2×16' },
        { label: `弹片螺母 × ${m.topFixings}` },
      ],
      active: [],
      motion: 'enter',
      focus: [0, f.legTop, f.zc],
      view: { dir: VIEW.iso, dist: D * 0.85 },
      detail: 'topScrew',
      tip: '先在桌面上用铅笔描出框架轮廓，预钻 Ø2.5 引孔，木螺丝更好拧。',
    }, ['top'])
  }

  // 10. 线槽
  if (c.cableTray) {
    add({
      id: 'tray',
      title: '安装理线槽',
      desc: '线槽挂在后横梁下方：先在后横梁底槽放入 2 个弹片螺母，再把线槽挂耳对准拧紧。插排可用扎带固定在线槽内。',
      chips: [{ label: '理线槽 × 1' }, { label: '弹片螺母 × 2' }, { label: `${bolt}×${BOLT_LEN[bolt]} × 2` }],
      active: [],
      motion: 'enter',
      focus: m.byId['tray'].position,
      view: { dir: VIEW.under, dist: close * 1.4 },
      detail: 'tray',
    }, ['tray'])
  }

  // 11. 后挂架
  if (c.backFrame) {
    const joints = m.joints.back
    const ids = ['up-L', 'up-R', 'plate-L', 'plate-R', 'up-bar', 'cap-L', 'cap-R', ...bracketsOf(joints)]
    add({
      id: 'backframe',
      title: '安装后挂架',
      desc: `两根立柱紧贴后桌腿背面，用连接板各 4 颗螺丝固定；顶部装横杆，高出桌面 ${c.backFrameHeight}mm，可挂显示器支架、灯条或洞洞板。立柱顶端压入端盖。`,
      chips: [
        { label: '立柱 × 2', sub: lenOf(m, 'up-L') },
        { label: '横杆 × 1', sub: lenOf(m, 'up-bar') },
        { label: '连接板 × 2' },
        { label: '端盖 × 2' },
      ],
      active: [],
      motion: 'enter',
      focus: [0, c.height + c.backFrameHeight * 0.1, f.back],
      view: { dir: VIEW.back, dist: D * 0.95 },
      marker: m.byId['plate-R'].position,
      detail: 'plate',
    }, ids)
  }

  // 12. 调平 & 完成
  steps.push({
    id: 'finish',
    title: c.feet === 'leveler' ? '调平并完成' : '检查并完成',
    desc: c.feet === 'leveler'
      ? `放到使用位置，把水平仪放在桌面中央，旋转脚杯微调直到四角着地、不晃动，再锁紧脚杯螺母。${c.slotCover ? `最后沿外露槽口压入约 ${m.slotCoverM} 米槽封条。` : ''}`
      : `踩下前轮刹车，按压四角确认无晃动。${c.slotCover ? `沿外露槽口压入约 ${m.slotCoverM} 米槽封条。` : ''}`,
    chips: [
      { label: `总重`, sub: `约 ${m.stats.weightKg.toFixed(1)}kg` },
      { label: `承重评估`, sub: m.analysis.sagRating.label },
      { label: `稳定性`, sub: m.analysis.wobbleRating.label },
    ],
    active: [],
    motion: 'none',
    focus: [0, c.height * 0.55, 0],
    view: { dir: VIEW.iso, dist: D * 1.0 },
    overlays: ['dims'],
    detail: c.feet === 'leveler' ? 'leveler' : undefined,
    marker: c.feet === 'leveler' ? m.byId['foot-fr'].position : undefined,
    autoRotate: true,
  })

  return {
    id: 'assembly',
    kind: 'assembly',
    title: '安装指南',
    summary: `${steps.length} 步 · 约 ${m.stats.minutes} 分钟 · 1 人可完成`,
    visibility: 'progressive',
    steps,
    installAt,
  }
}

function suggestFrom(m: DeskModel, patch: Partial<DeskModel['config']>, pick: (p: Part) => boolean): Part[] {
  const alt = generateDesk({ ...m.config, ...patch })
  return alt.parts.filter((p) => !m.byId[p.id] && pick(p))
}

export function buildRepairGuides(m: DeskModel): Guide[] {
  const c = m.config
  const f = m.frame
  const D = overallDist(m)
  const close = Math.max(560, Math.min(900, D * 0.32))
  const brackets = m.parts.filter((p) => p.group === 'bracket').map((p) => p.id)
  const frameIds = m.parts.filter((p) => ['leg', 'beam', 'brace'].includes(p.group)).map((p) => p.id)
  const feet = ['foot-fl', 'foot-fr', 'foot-bl', 'foot-br']
  const internal = c.connector === 'internal'
  const leveler = c.feet === 'leveler'
  const jl = m.joints.long[0]
  const guides: Guide[] = []
  function g(id: string, title: string, summary: string, steps: Step[]): Guide {
    return { id, kind: 'repair', title, summary, visibility: 'all', steps, installAt: {} }
  }

  // 桌子晃动
  {
    const steps: Step[] = [
      {
        id: 'w1', title: '判断晃动方向',
        desc: '用手分别左右、前后推桌面：左右晃 → 侧面接头松了；前后晃 → 前后横梁或下横撑不足；只有一角翘 → 多半是脚杯没着地。',
        chips: [{ label: '左右晃', sub: '查侧框' }, { label: '前后晃', sub: '查横梁 / 下撑' }, { label: '单角翘', sub: '查脚杯' }],
        active: frameIds.filter((id) => id.startsWith('leg')), motion: 'wiggle',
        focus: [0, c.height * 0.5, 0], view: { dir: VIEW.iso, dist: D }, detail: 'wobble',
      },
      {
        id: 'w2', title: internal ? '拧紧内置连接件' : '逐个拧紧角码螺丝',
        desc: internal
          ? `从横梁工艺孔逐个检查 ${Object.values(m.joints).flat().length} 个内置连接件。`
          : `共 ${brackets.length} 个角码。逐个检查，若螺丝空转，说明 T 型螺母没转正，需要松开重新卡入槽内。`,
        chips: [{ label: internal ? '内置连接件' : `角码 × ${brackets.length}` }, { label: `内六角 ${m.hexKey}mm` }, { label: '扭矩', sub: TORQUE[m.bolt] }],
        active: brackets.length ? brackets : frameIds, motion: 'none',
        focus: jl.corner, view: { dir: VIEW.iso, dist: close * 1.6 }, detail: internal ? 'internal' : 'bracket', tool: toolFor(m, jl),
      },
      {
        id: 'w3', title: '检查框架方正',
        desc: `框架歪斜也会导致晃动。测量顶框两条对角线（约 ${Math.round(Math.hypot(f.Wf, f.Df))}mm），相差超过 2mm 时，松开四角螺丝、推正后再拧紧。`,
        chips: [{ label: '对角线 A = B' }, { label: '误差 ≤ 2mm' }],
        active: ['beam-front', 'beam-back', 'beam-sideL', 'beam-sideR'], motion: 'none',
        focus: [0, f.legTop, f.zc], view: { dir: VIEW.top, dist: D * 0.75 }, overlays: ['diagonals'], detail: 'square',
      },
      {
        id: 'w4', title: leveler ? '调节脚杯' : '检查脚轮',
        desc: leveler
          ? '把翘起的那只脚杯往外旋，直到四角同时着地；用对角按压测试，不再有“咔哒”声即可，然后锁紧螺母。'
          : '脚轮会放大晃动。确认 4 只轮子丝杆都已拧紧，并踩下刹车；常驻一处使用建议换成调节脚杯。',
        chips: [{ label: leveler ? '调节脚杯 × 4' : '脚轮 × 4' }, { label: '开口扳手 13mm' }],
        active: feet, motion: 'swap',
        focus: m.byId['foot-fl'].position, view: { dir: VIEW.low, dist: close * 1.1 }, detail: leveler ? 'leveler' : 'caster',
      },
    ]
    if (c.lowerBrace !== 'full') {
      const target = c.lowerBrace === 'none' ? 'u' : 'full'
      const sug = suggestFrom(m, { lowerBrace: target }, (p) => p.id.startsWith('brace-'))
      steps.push({
        id: 'w5', title: c.lowerBrace === 'none' ? '加装 U 型下横撑' : '升级为四周下横撑',
        desc: c.lowerBrace === 'none'
          ? `当前没有下横撑，这是晃动的主要原因。在离地约 ${Math.round(f.yBrace)}mm 处加装两侧 + 后方横撑（红色虚线），稳定性可提升约 1.8 倍。框架已组装，需使用弹片 T 型螺母。`
          : '在前方再加一根下横撑形成闭合框，适合高桌或重载场景（会占用一部分腿部空间）。',
        chips: [{ label: `新增型材 × ${sug.filter((p) => p.geo.kind === 'profile').length}` }, { label: '弹片 T 型螺母' }, { label: '菜单 → 自定义可一键加装' }],
        active: [], motion: 'none',
        focus: [0, f.yBrace, f.zc], view: { dir: VIEW.low, dist: D * 0.7 }, detail: 'dropin', suggest: sug,
      })
    }
    guides.push(g('repair-wobble', '修复：桌子晃动', `${steps.length} 步 · 约 15 分钟`, steps))
  }

  // 桌面中部下沉
  {
    const a = m.analysis
    const steps: Step[] = [
      {
        id: 's1', title: '确认下沉位置',
        desc: `把直尺侧立在桌面上检查缝隙。按当前配置估算，${c.loadKg}kg 均布时横梁下挠约 ${a.sagUniform.toFixed(1)}mm，中间按压 30kg 时约 ${a.sagPoint.toFixed(1)}mm（${a.sagRating.label}）。`,
        chips: [{ label: '横梁跨度', sub: `${Math.round(a.beamSpan)}mm` }, { label: '均布下挠', sub: `${a.sagUniform.toFixed(1)}mm` }, { label: '点载下挠', sub: `${a.sagPoint.toFixed(1)}mm` }],
        active: ['top', 'beam-front', 'beam-back'], motion: 'none',
        focus: [0, f.legTop, 0], view: { dir: VIEW.iso, dist: D * 0.9 }, overlays: ['load'], detail: 'sag',
      },
    ]
    if (!f.hasCenter) {
      const sug = suggestFrom(m, { centerBeam: 'on' }, (p) => p.id.startsWith('beam-center'))
      steps.push({
        id: 's2', title: '加装中间加强梁',
        desc: '在前后横梁中间加一根加强梁（红色虚线），直接托住桌面中部。用弹片 T 型螺母从下方装入，无需拆桌面。',
        chips: [{ label: '加强梁 × 1', sub: sug[0]?.spec }, { label: '角码 + 弹片螺母' }],
        active: [], motion: 'none', focus: [0, f.legTop - 40, f.zc], view: { dir: VIEW.under, dist: close * 1.4 },
        detail: 'dropin', suggest: sug,
      })
    } else {
      steps.push({
        id: 's2', title: '检查中间加强梁',
        desc: '确认中间加强梁两端的角码没有下滑，梁顶面与桌面贴紧；若有缝隙，松开角码上推后再拧紧。',
        chips: [{ label: '中间加强梁' }, { label: `内六角 ${m.hexKey}mm` }],
        active: ['beam-center', ...m.joints.center.flatMap((j) => j.brackets)], motion: 'swap',
        focus: m.joints.center[0].corner, view: { dir: VIEW.under, dist: close * 1.2 }, detail: 'bracket', tool: toolFor(m, m.joints.center[0]),
      })
    }
    if (c.beamProfile !== '4080') {
      const alt = generateDesk({ ...c, beamProfile: '4080', legProfile: c.legProfile === '3030' ? '4040' : c.legProfile })
      steps.push({
        id: 's3', title: '升级为 4080 横梁',
        desc: `若下挠仍超过 2.5mm，把前后横梁换成 4080 竖放：惯性矩约为 ${c.beamProfile} 的 ${(PROFILES['4080'].Ix / PROFILES[c.beamProfile].Ix).toFixed(1)} 倍，同样负载下挠可降到约 ${alt.analysis.sagUniform.toFixed(1)}mm。`,
        chips: [{ label: '4080 横梁 × 2', sub: lenOf(alt, 'beam-front') }, { label: '菜单 → 自定义一键切换' }],
        active: ['beam-front', 'beam-back'], motion: 'swap',
        focus: m.byId['beam-front'].position, view: { dir: VIEW.iso, dist: D * 0.7 },
      })
    }
    guides.push(g('repair-sag', '修复：桌面下沉', `${steps.length} 步 · 约 20 分钟`, steps))
  }

  // 脚杯 / 脚轮损坏
  {
    const tap = PROFILES[c.legProfile].endTap
    const steps: Step[] = [
      {
        id: 'f1', title: '卸力并抬起一角',
        desc: '清空桌面，两人配合把需要更换的那一角抬起约 5cm，下面垫书或木块。千万不要整张桌子侧翻，以免接头受力变形。',
        chips: [{ label: '需要 2 人' }, { label: '垫块高 50mm' }],
        active: ['leg-fl', 'foot-fl'], motion: 'none',
        focus: m.byId['foot-fl'].position, view: { dir: VIEW.low, dist: close },
      },
      {
        id: 'f2', title: leveler ? '旋出旧脚杯' : '旋出旧脚轮',
        desc: `逆时针旋出，检查桌腿底部的 ${tap} 螺纹孔。若滑丝，可换用加大一号螺纹或改装“脚杯连接板”（用 2 颗螺丝固定在桌腿侧槽）。`,
        chips: [{ label: '检查螺纹', sub: tap }, { label: '滑丝方案', sub: '脚杯连接板' }],
        active: ['foot-fl'], motion: 'swap',
        focus: m.byId['foot-fl'].position, view: { dir: VIEW.low, dist: close * 0.8 }, detail: leveler ? 'leveler' : 'caster',
      },
      {
        id: 'f3', title: '装新件并调平',
        desc: '旋入新件，放下桌子后按对角测试，旋转脚杯直到四角受力一致。',
        chips: [{ label: leveler ? `${tap} 调节脚杯` : `${tap} 万向轮` }, { label: '水平仪' }],
        active: feet, motion: 'none',
        focus: [0, c.height * 0.4, 0], view: { dir: VIEW.iso, dist: D * 0.9 }, overlays: ['dims'],
      },
    ]
    guides.push(g('repair-foot', leveler ? '修复：更换脚杯' : '修复：更换脚轮', `${steps.length} 步 · 约 10 分钟`, steps))
  }

  return guides
}

export function buildGuides(m: DeskModel): Guide[] {
  return [buildAssemblyGuide(m), ...buildRepairGuides(m)]
}
