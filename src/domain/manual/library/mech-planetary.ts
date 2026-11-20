import type { Action, ManualSpec, SpecPart, Vec3 } from '../types'

/**
 * 行星齿轮：太阳轮 18 齿、行星轮 21 齿 × 3、内齿圈 60 齿，模数 2.5 —— 按 KHK 齿轮技术资料 17.1 节的三个条件（同心、装配、邻接）选的齿数。
 * 轴竖直（axis y）。平面角 ψ 从 +x 起、从上往下看逆时针，平面 (u, v) → 世界 (u, ·, -v)；spin 正转 = 从上往下看顺时针。
 * gear 只有外齿：齿圈用两块 poly（半圈带内齿的环）拼成，齿形和 profile.ts 的外齿同一套梯形（齿根 0.3、齿顶 0.15 齿距）。
 * 相位：太阳轮第 0 齿在 +x；行星轮 θp ≡ ψ(1 + Zs/Zp) + 180° − 180°/Zp，齿圈 θr ≡ ((Zs + Zr)ψ + 180°·Zp) / Zr（模一个齿距），
 * 三处啮合都是齿对齿槽。转速满足 Willis 公式 (ωs − ωc) / (ωr − ωc) = −Zr / Zs，行星轮相对行星架自转 −(ωs − ωc)·Zs / Zp。
 * 推断：底座、行星架、摇把的尺寸按比例画；齿宽 10 mm。
 */
const M = 2.5
const Z = { s: 18, p: 21, r: 60 }
const N = 3
const R = { s: (M * Z.s) / 2, p: (M * Z.p) / 2, r: (M * Z.r) / 2 }
const A = R.s + R.p
const H = 10
const Y = 8 + 1 + H / 2
const YC = Y + H / 2 + 2 + 3
const RING_OUT = 88
const PSI = [270, 30, 150]

const rad = (d: number) => (d * Math.PI) / 180
const round = (v: number) => Math.round(v * 100) / 100
const mod = (v: number, m: number) => ((v % m) + m) % m
const plane = (rho: number, deg: number, y = 0): Vec3 => [round(rho * Math.cos(rad(deg))), y, round(-rho * Math.sin(rad(deg)))]

const PLANET_ROT = PSI.map((psi) => round(mod(psi * (1 + Z.s / Z.p) + 180 - 180 / Z.p, 360 / Z.p)))
const RING_ROT = round(mod(((Z.s + Z.r) * PSI[0] + 180 * Z.p) / Z.r, 360 / Z.r))

/** 半圈齿圈：从第 from 个齿起 Zr / 2 个内齿，两端切在齿槽中间 */
function ringHalf(from: number): [number, number][] {
  const pitch = (2 * Math.PI) / Z.r
  const tip = R.r - M
  const root = R.r + 1.25 * M
  const th = rad(RING_ROT)
  const at = (rho: number, a: number): [number, number] => [round(rho * Math.cos(a)), round(-rho * Math.sin(a))]
  const n = Z.r / 2
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const c = th + (from + i) * pitch
    pts.push(at(root, c - 0.5 * pitch), at(root, c - 0.3 * pitch), at(tip, c - 0.15 * pitch), at(tip, c + 0.15 * pitch), at(root, c + 0.3 * pitch))
  }
  const a0 = th + (from - 0.5) * pitch
  const a1 = th + (from + n - 0.5) * pitch
  pts.push(at(root, a1))
  for (let k = 60; k >= 0; k--) pts.push(at(RING_OUT, a0 + ((a1 - a0) * k) / 60))
  return pts
}

/** 行星架中心孔：半个圆环，两块拼成一圈，让太阳轮轴从中间穿上来 */
function halfAnnulus(r1: number, r2: number, from: number): [number, number][] {
  const pts: [number, number][] = []
  for (let k = 0; k <= 24; k++) pts.push([round(r2 * Math.cos(rad(from + 7.5 * k))), round(-r2 * Math.sin(rad(from + 7.5 * k)))])
  for (let k = 24; k >= 0; k--) pts.push([round(r1 * Math.cos(rad(from + 7.5 * k))), round(-r1 * Math.sin(rad(from + 7.5 * k)))])
  return pts
}

const BRASS = { color: '#c9a227', roughness: 0.4, metalness: 0.6 }
const dot = (id: string, parent: string, at: Vec3): SpecPart => ({
  id, name: '记号', parent, at, shape: { type: 'cylinder', r: 3, h: 1, axis: 'y' }, fill: 'dark', finish: 'plastic-black',
})

/** 三个转速（圈 / 秒，从上往下看顺时针为正）→ 各零件的 spin；转速为 0 的零件不动 */
type W = { s: number; c: number; r: number }
const willisR = (s: number, c: number): W => ({ s, c, r: c - ((s - c) * Z.s) / Z.r })
const willisS = (c: number, r: number): W => ({ s: c - ((r - c) * Z.r) / Z.s, c, r })
function drive(w: W): Action[] {
  const planet = (-(w.s - w.c) * Z.s) / Z.p
  const out: Action[] = []
  if (w.s) out.push({ type: 'spin', part: 'sun', axis: 'y', speed: round(w.s * 1000) / 1000 })
  if (w.c) out.push({ type: 'spin', part: 'carrier', axis: 'y', speed: round(w.c * 1000) / 1000 })
  if (w.r) out.push({ type: 'spin', part: 'ring', axis: 'y', speed: round(w.r * 1000) / 1000 })
  if (Math.abs(planet) > 1e-6) PSI.forEach((_, i) => out.push({ type: 'spin', part: `planet-${i + 1}`, axis: 'y', speed: round(planet * 1000) / 1000 }))
  return out
}
const S = 0.3
const RING_FIXED = willisR(S, (S * Z.s) / (Z.s + Z.r))
const CARRIER_FIXED = willisR(S, 0)
const SUN_FIXED = willisR(0, 0.15)
const DIRECT: W = { s: 0.12, c: 0.12, r: 0.12 }
const SPLIT = willisS(0.12, 0.08)

const ratio = (v: number) => v.toFixed(2)
const iRing = 1 + Z.r / Z.s
const iCarrier = -Z.r / Z.s
const iSun = 1 + Z.s / Z.r

/** 标注锚在不动的底座上：齿圈外沿（左前方）、齿圈固定时的「刹车」位置 */
const RING_LABEL = plane(RING_OUT - 4, 200, Y + H / 2)
const OVERVIEW = { target: [0, Y + 6, 10] as Vec3, dir: [0.3, 1, 0.85] as Vec3, dist: 430 }

export const mechPlanetary: ManualSpec = {
  id: 'mech-planetary',
  name: '行星齿轮：一套齿轮三种速比',
  desc: '太阳轮、行星轮、内齿圈和行星架：固定其中一个，就能减速、反转或超速。',
  category: '机械结构',
  genre: 'tutorial',
  dims: { width: 210, depth: 210, height: 54 },
  source: {
    title: 'KHK 小原齿轮 · Gear Technical Reference（Gear Systems：Planetary Gear Mechanism）',
    url: 'https://khkgears.net/new/gear_knowledge/gear_technical_reference/gear_systems.html',
    images: [],
  },
  package: [
    { name: '太阳轮', qty: 1, spec: `${Z.s} 齿 · 分度圆直径 ${2 * R.s} mm · 带输入摇把` },
    { name: '行星轮', qty: N, spec: `${Z.p} 齿 · 分度圆直径 ${2 * R.p} mm` },
    { name: '内齿圈', qty: 1, spec: `${Z.r} 齿（齿朝里）· 分度圆直径 ${2 * R.r} mm` },
    { name: '行星架', qty: 1, spec: `三臂 · 行星轮轴间隔 120°，中心距 ${A} mm` },
  ],
  params: [
    { label: '模数 m', value: `${M}`, note: '四种零件模数相同才能咬合；分度圆直径 = 模数 × 齿数' },
    { label: '同心条件', value: `Zr = Zs + 2Zp：${Z.r} = ${Z.s} + 2 × ${Z.p}`, note: '太阳轮、行星架、齿圈三者同轴' },
    { label: '装配条件', value: `(Zs + Zr) / N = ${(Z.s + Z.r) / N}（整数）`, note: '三个行星轮能均匀装在 120° 上' },
    { label: '邻接条件', value: `Zp + 2 = ${Z.p + 2} < (Zs + Zp)·sin(180°/N) ≈ ${((Z.s + Z.p) * Math.sin(Math.PI / N)).toFixed(1)}`, note: '相邻两个行星轮的齿顶不相碰' },
    { label: 'Willis 公式', value: '(ωs − ωc) / (ωr − ωc) = −Zr / Zs', note: '站在行星架上看，太阳轮和齿圈就是一对定轴齿轮' },
    { label: '齿圈固定', value: `太阳轮 → 行星架：i = 1 + Zr/Zs ≈ ${ratio(iRing)}`, note: '同向减速，电动螺丝刀减速箱的常用接法' },
    { label: '行星架固定', value: `太阳轮 → 齿圈：i = −Zr/Zs ≈ ${ratio(iCarrier)}`, note: '负号 = 反向' },
    { label: '太阳轮固定', value: `行星架 → 齿圈：i = Zr/(Zs + Zr) ≈ ${ratio(1 / iSun)}`, note: `齿圈比行星架快 ${ratio(iSun)} 倍：超速` },
    { label: 'KHK 算例', value: '16 / 16 / 48 齿：i = 4、1.333、−3', note: '齿圈固定、太阳轮固定（齿圈输入）、行星架固定三种接法' },
  ],
  parts: [
    {
      id: 'base', name: '底座', spec: '210 × 210 mm',
      shape: { type: 'slab', w: 210, d: 210, h: 8, r: 22 },
      fill: 'warm', finish: 'wood',
    },
    {
      id: 'ring', name: '内齿圈', spec: `${Z.r} 齿 · 内齿`, parent: 'base', at: [0, Y, 0],
      shape: {
        type: 'compound',
        items: [
          { type: 'poly', points: ringHalf(0), h: H, at: [0, -H / 2, 0] },
          { type: 'poly', points: ringHalf(Z.r / 2), h: H, at: [0, -H / 2, 0] },
        ],
      },
      fill: 'white', finish: 'zinc',
    },
    dot('mark-ring', 'ring', plane(RING_OUT - 6, -45, H / 2 + 0.5)),
    {
      id: 'sun', name: '太阳轮', spec: `${Z.s} 齿`, parent: 'base', at: [0, Y, 0],
      shape: {
        type: 'compound',
        items: [
          { type: 'gear', teeth: Z.s, r: R.s, h: H },
          { type: 'cylinder', r: 5, h: 12, axis: 'y', at: [0, H / 2 + 6, 0] },
          { type: 'cylinder', r: 10, h: 5, axis: 'y', at: [0, H / 2 + 14.5, 0], fill: 'dark', finish: 'plastic-black' },
          { type: 'cylinder', r: 2.5, h: 9, axis: 'y', at: [6.5, H / 2 + 21.5, 0], fill: 'dark', finish: 'plastic-black' },
        ],
      },
      fill: 'white', finish: 'steel',
    },
    {
      id: 'carrier', name: '行星架', spec: '三臂', parent: 'base', at: [0, YC, 0],
      shape: {
        type: 'compound',
        items: [
          { type: 'poly', points: halfAnnulus(8, 17, 0), h: 6, at: [0, -3, 0] },
          { type: 'poly', points: halfAnnulus(8, 17, 180), h: 6, at: [0, -3, 0] },
          ...PSI.map((psi) => ({ type: 'box' as const, size: [A - 14, 5.6, 14] as Vec3, at: plane((A + 14) / 2, psi), rot: [0, psi, 0] as Vec3 })),
          ...PSI.map((psi) => ({ type: 'cylinder' as const, r: 10, h: 6, axis: 'y' as const, at: plane(A, psi) })),
          ...PSI.map((psi) => ({ type: 'cylinder' as const, r: 4, h: 12.5, axis: 'y' as const, at: plane(A, psi, -9.25), fill: 'white' as const, finish: 'steel' as const })),
        ],
      },
      fill: 'white', finish: { color: '#3f6fb5', roughness: 0.5, metalness: 0.2 },
    },
    ...PSI.flatMap((psi, i): SpecPart[] => [
      {
        id: `planet-${i + 1}`, name: '行星轮', spec: `${Z.p} 齿`, parent: 'carrier', at: plane(A, psi, Y - YC), rot: [0, PLANET_ROT[i], 0],
        shape: { type: 'gear', teeth: Z.p, r: R.p, h: H, bore: 4.6 }, fill: 'white', finish: BRASS,
      },
      dot(`mark-p${i + 1}`, `planet-${i + 1}`, [round(R.p * 0.62), H / 2 + 0.5, 0]),
    ]),
  ],
  stageSize: 560,
  guides: [
    {
      id: 'modes',
      title: '固定一个，得到不同速比',
      kind: 'usage',
      steps: [
        {
          id: 'parts', title: '四种零件',
          desc: `中间是 ${Z.s} 齿的太阳轮，三个 ${Z.p} 齿的行星轮围着它，最外面是齿朝里的 ${Z.r} 齿内齿圈；行星轮的轴插在蓝色的行星架上。三处同时咬合，力分给三个行星轮扛。`,
          camera: OVERVIEW,
          actions: drive({ s: RING_FIXED.s / 2, c: RING_FIXED.c / 2, r: 0 }),
          callouts: [
            { part: 'sun', text: '太阳轮', sub: `${Z.s} 齿`, at: [0, H / 2 + 17, 0], offset: [-25, 45, 0] },
            { part: 'planet-1', text: '行星轮', sub: `${Z.p} 齿 × ${N}`, at: [0, H / 2, 0], offset: [45, 30, 25] },
            { part: 'base', text: '内齿圈', sub: `${Z.r} 齿`, at: RING_LABEL, offset: [-35, 35, 0] },
            { part: 'carrier', text: '行星架', at: [0, 3, 0], offset: [40, 50, 0] },
          ],
          zoom: { target: [0, Y + H / 2, A + R.p - 2], dir: [0, 1, 0.35], dist: 110, caption: '内齿圈的齿朝里，行星轮从里面和它咬合' },
          chips: [{ label: '模数', sub: `${M}` }, { label: '齿数', sub: `${Z.s} · ${Z.p} · ${Z.r}` }],
        },
        {
          id: 'ring-fixed', title: '齿圈固定：减速',
          desc: `刹住齿圈，摇太阳轮：行星轮一边自转、一边贴着齿圈往前滚，把行星架带着同向慢慢转。速比 = 1 + ${Z.r} ÷ ${Z.s} ≈ ${ratio(iRing)}，转速降到约 1/4，扭矩放大约 4 倍。`,
          camera: { ...OVERVIEW, dir: [0.15, 1, 0.55] },
          highlight: ['sun', 'carrier'],
          actions: drive(RING_FIXED),
          callouts: [
            { part: 'sun', text: '输入', sub: '太阳轮', at: [0, H / 2 + 17, 0], offset: [-25, 45, 0] },
            { part: 'carrier', text: '输出', sub: '行星架 · 同向', at: [0, 3, 0], offset: [45, 45, 0] },
            { part: 'base', text: '固定', sub: '齿圈', at: RING_LABEL, offset: [-35, 35, 0] },
          ],
          chips: [{ label: '速比', sub: `1 + ${Z.r}/${Z.s} ≈ ${ratio(iRing)}` }, { label: '方向', sub: '同向' }],
          tip: '数一数：摇把转 4 圈多，行星架才转 1 圈。',
        },
        {
          id: 'carrier-fixed', title: '行星架固定：反转',
          desc: `行星架不动，行星轮只能原地自转，成了传话的「惰轮」。太阳轮顺时针，齿圈就逆时针：速比 = −${Z.r} ÷ ${Z.s} ≈ ${ratio(iCarrier)}，反向减速。自动变速箱的倒挡就是这个思路。`,
          camera: { ...OVERVIEW, dir: [-0.2, 1, 0.6] },
          highlight: ['sun', 'ring'],
          actions: drive(CARRIER_FIXED),
          callouts: [
            { part: 'sun', text: '输入', sub: '太阳轮 · 顺时针', at: [0, H / 2 + 17, 0], offset: [-25, 45, 0] },
            { part: 'base', text: '输出', sub: '齿圈 · 逆时针', at: RING_LABEL, offset: [-12, 40, 0] },
            { part: 'carrier', text: '固定', sub: '行星架', at: [0, 3, 0], offset: [45, 45, 0] },
          ],
          chips: [{ label: '速比', sub: `−${Z.r}/${Z.s} ≈ ${ratio(iCarrier)}` }, { label: '行星轮', sub: '只自转，不公转' }],
        },
        {
          id: 'sun-fixed', title: '太阳轮固定：超速',
          desc: `太阳轮不动，改成转行星架：行星轮绕着太阳轮滚，把齿圈推得比行星架还快 (${Z.s} + ${Z.r}) ÷ ${Z.r} = ${ratio(iSun)} 倍。输出比输入快，就是变速箱里的超速挡（速比 ≈ ${ratio(1 / iSun)}）。`,
          camera: { ...OVERVIEW, dir: [0.35, 1, 0.6] },
          highlight: ['carrier', 'ring'],
          actions: drive(SUN_FIXED),
          callouts: [
            { part: 'carrier', text: '输入', sub: '行星架', at: [0, 3, 0], offset: [45, 45, 0] },
            { part: 'base', text: '输出', sub: '齿圈 · 更快', at: RING_LABEL, offset: [-35, 35, 0] },
            { part: 'sun', text: '固定', sub: '太阳轮', at: [0, H / 2 + 17, 0], offset: [-25, 45, 0] },
          ],
          chips: [{ label: '速比', sub: `${Z.r}/(${Z.s} + ${Z.r}) ≈ ${ratio(1 / iSun)}` }, { label: '齿圈', sub: `快 ${ratio(iSun)} 倍` }],
        },
        {
          id: 'direct', title: '锁住两个：直接挡',
          desc: '把任意两个零件连在一起（比如太阳轮和行星架），行星轮就没法相对自转，整套齿轮像一整块一起转，速比正好是 1。',
          camera: OVERVIEW,
          highlight: ['sun', 'carrier', 'ring'],
          actions: drive(DIRECT),
          chips: [{ label: '速比', sub: '1 : 1' }, { label: '行星轮', sub: '不自转' }],
          tip: '看行星轮上的黑点：它始终朝着同一个方向，说明行星轮没有自转。',
        },
        {
          id: 'uses', title: '用在哪里',
          desc: '输入、输出在同一根轴上，几个行星轮一起分担受力，所以体积小、扛得住大扭矩。自动变速箱用几排行星齿轮加离合器、制动器换挡；电动螺丝刀里是两三级「齿圈固定」叠在一起；普锐斯的动力分配机构让三个零件同时转：发动机接行星架、发电机接太阳轮、驱动电机接齿圈。',
          camera: { ...OVERVIEW, dir: [0.25, 1, 0.75] },
          highlight: ['sun', 'carrier', 'ring'],
          actions: drive(SPLIT),
          callouts: [
            { part: 'carrier', text: '发动机', sub: '行星架', at: [0, 3, 0], offset: [45, 45, 0] },
            { part: 'sun', text: '发电机', sub: '太阳轮', at: [0, H / 2 + 17, 0], offset: [-25, 45, 0] },
            { part: 'base', text: '驱动电机', sub: '齿圈 → 车轮', at: RING_LABEL, offset: [-25, 30, 0] },
          ],
          chips: [
            { label: '自动变速箱', sub: '多排行星齿轮' },
            { label: '电动螺丝刀', sub: '2–3 级减速' },
            { label: '普锐斯 THS', sub: '太阳轮 30 · 齿圈 78' },
          ],
          tip: '三个零件都在转时，转速仍满足 Willis 公式：知道其中两个，第三个就定了。',
        },
      ],
    },
    {
      id: 'teeth',
      title: '齿数怎么配',
      kind: 'usage',
      steps: [
        {
          id: 'concentric', title: '同心：齿圈 = 太阳轮 + 两个行星轮',
          desc: `从太阳轮中心穿过一个行星轮到齿圈，正好是 太阳轮半径 + 行星轮直径 = 齿圈半径。换成齿数：${Z.r} = ${Z.s} + 2 × ${Z.p}。差一个齿，三者就没法同轴。`,
          camera: { target: [0, Y, A / 2 + 6], dir: 'top', dist: 300 },
          highlight: ['planet-1'],
          actions: drive({ s: RING_FIXED.s / 3, c: RING_FIXED.c / 3, r: 0 }),
          chips: [{ label: '同心条件', sub: `${Z.r} = ${Z.s} + 2 × ${Z.p}` }, { label: '中心距', sub: `(${Z.s} + ${Z.p}) × ${M} ÷ 2 = ${A} mm` }],
          zoom: { target: [0, Y + H / 2, A - R.p + 2], dir: [0, 1, 0.35], dist: 110, caption: '太阳轮和行星轮：一个齿插进对面的齿槽' },
        },
        {
          id: 'assembly', title: '能均匀装下几个行星轮',
          desc: `行星轮要等分 120° 装进去，三处的齿都得对上齿槽：(太阳轮齿数 + 齿圈齿数) ÷ 行星轮个数 = (${Z.s} + ${Z.r}) ÷ ${N} = ${(Z.s + Z.r) / N}，是整数才行。另外相邻两个行星轮的齿顶不能相碰。`,
          camera: { target: [0, Y, 0], dir: 'top', dist: 420 },
          highlight: ['planet-1', 'planet-2', 'planet-3'],
          chips: [
            { label: '装配条件', sub: `(${Z.s} + ${Z.r}) / ${N} = ${(Z.s + Z.r) / N}` },
            { label: '邻接条件', sub: `${Z.p + 2} < ${((Z.s + Z.p) * Math.sin(Math.PI / N)).toFixed(1)}` },
          ],
          tip: 'KHK 资料的算例是 16 / 16 / 48 齿：同心条件满足，但 (16 + 48) ÷ 3 不是整数，所以只能装 2 个或 4 个行星轮。',
        },
      ],
    },
  ],
}
