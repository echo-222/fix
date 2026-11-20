import type { ManualSpec, SpecPart } from '../types'

/**
 * 齿轮传动：三只直齿轮平放在底板上，齿数和中心距按 KHK 齿轮技术资料的算例（模数 3、12 / 24 齿、中心距 54 mm），
 * 再加一只 36 齿的输出轮演示惰轮；第二个指南把小齿轮换到齿条上，演示转动变直线。
 * 齿轮轴竖直（axis y），从上往下看逆时针 = 角度增大；spin 正转 = 从上往下看顺时针。
 */
const M = 3
const Z = { a: 12, b: 24, c: 36 }
const R = { a: (M * Z.a) / 2, b: (M * Z.b) / 2, c: (M * Z.c) / 2 }
const H = 10
const Y = 8 + 1 + H / 2
const X = { a: -90, b: -90 + R.a + R.b, c: -90 + R.a + 2 * R.b + R.c }
// 主动轮转速（圈 / 秒）；啮合的齿轮转速与齿数成反比、方向相反
const S = 0.5
const speed = { a: S, b: -S * (Z.a / Z.b), c: S * (Z.a / Z.c) }

// 齿条：节线在 z = R.a（小齿轮正前方），齿朝 -z；齿距 πm，x = 0 处是齿槽，正对小齿轮的一个齿
const P = Math.PI * M
const RACK_LEN = 160
const rackPitch = R.a
const tip = rackPitch - M
const root = rackPitch + 1.25 * M
const back = root + 12
function rackOutline(): [number, number][] {
  const pts: [number, number][] = [[-RACK_LEN / 2, back], [RACK_LEN / 2, back], [RACK_LEN / 2, root]]
  const n = Math.floor((RACK_LEN / 2 - P / 2) / P)
  for (let i = n; i >= -n - 1; i--) {
    const c = P / 2 + i * P
    pts.push([c + 2.4, root], [c + 1.2, tip], [c - 1.2, tip], [c - 2.4, root])
  }
  pts.push([-RACK_LEN / 2, root])
  return pts.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100])
}
// 小齿轮来回转 ±90°，齿条同相位走 ±r·π/2，节圆上的点和齿条走得一样快
const SWING = 90
const TRAVEL = Math.round(R.a * (SWING * Math.PI) / 180 * 100) / 100
const PERIOD = 4

const marker = (id: string, parent: string, r: number): SpecPart => ({
  id, name: '记号', parent, at: [r * 0.62, H / 2 + 0.5, 0], shape: { type: 'cylinder', r: 3, h: 1, axis: 'y' }, fill: 'dark', finish: 'plastic-black',
})

export const mechGearTrain: ManualSpec = {
  id: 'mech-gear-train',
  name: '齿轮传动：减速、换向与齿条',
  desc: '三只直齿轮看懂传动比、转向和惰轮，再用齿轮齿条把转动变成直线移动。',
  category: '机械结构',
  genre: 'tutorial',
  dims: { width: 250, depth: 140, height: 25 },
  source: { title: 'KHK 小原齿轮 · Gear Technical Reference（Gear Trains / Calculation of Gear Dimensions）', url: 'https://khkgears.net/new/gear_knowledge/gear_technical_reference/gear-trains.html', images: [] },
  package: [
    { name: '小齿轮 A', qty: 1, spec: `${Z.a} 齿 · 分度圆直径 ${2 * R.a} mm` },
    { name: '中齿轮 B', qty: 1, spec: `${Z.b} 齿 · 分度圆直径 ${2 * R.b} mm` },
    { name: '大齿轮 C', qty: 1, spec: `${Z.c} 齿 · 分度圆直径 ${2 * R.c} mm` },
    { name: '齿条', qty: 1, spec: `长 ${RACK_LEN} mm · 齿距 πm ≈ ${P.toFixed(2)} mm` },
  ],
  params: [
    { label: '模数 m', value: `${M}`, note: '分度圆直径 = 模数 × 齿数；模数相同的齿轮才能咬合' },
    { label: '中心距', value: `a = m(z₁ + z₂) / 2 = ${(M * (Z.a + Z.b)) / 2} mm`, note: 'A 和 B 的轴心距离' },
    { label: '传动比', value: `i = z₂ / z₁ = ${Z.b / Z.a}`, note: '从动轮齿数 ÷ 主动轮齿数；大于 1 就是减速' },
    { label: '惰轮', value: `A → B → C：i = z_C / z_A = ${Z.c / Z.a}`, note: '中间的轮只改转向，不改传动比' },
    { label: '齿条', value: `转一圈走 πmz = ${(P * Z.a).toFixed(1)} mm`, note: '小齿轮每转一圈，齿条移动齿距 × 齿数' },
  ],
  parts: [
    {
      id: 'board', name: '底板', spec: '250 × 140 mm',
      shape: {
        type: 'compound',
        items: [
          { type: 'slab', w: 250, d: 140, h: 8, r: 6 },
          ...(['a', 'b', 'c'] as const).map((k) => ({ type: 'cylinder' as const, r: 2.6, h: 16, axis: 'y' as const, at: [X[k], 8 + 8, 0] as [number, number, number], fill: 'shade' as const })),
        ],
      },
      fill: 'warm', finish: 'wood',
    },
    { id: 'gear-a', name: '小齿轮 A', spec: `${Z.a} 齿`, at: [X.a, Y, 0], shape: { type: 'gear', teeth: Z.a, r: R.a, h: H, bore: 3 }, fill: 'shade', finish: { color: '#c9a227', roughness: 0.4, metalness: 0.6 } },
    {
      id: 'knob', name: '摇把', parent: 'gear-a', at: [R.a * 0.55, H / 2, 0],
      shape: { type: 'compound', items: [{ type: 'cylinder', r: 3.5, h: 14, axis: 'y', at: [0, 7, 0] }, { type: 'cylinder', r: 5, h: 4, axis: 'y', at: [0, 14, 0] }] },
      fill: 'dark', finish: 'plastic-black',
    },
    { id: 'gear-b', name: '中齿轮 B', spec: `${Z.b} 齿`, at: [X.b, Y, 0], rot: [0, 180 / Z.b, 0], shape: { type: 'gear', teeth: Z.b, r: R.b, h: H, bore: 3 }, fill: 'white', finish: 'steel', visible: false },
    marker('mark-b', 'gear-b', R.b),
    { id: 'gear-c', name: '大齿轮 C', spec: `${Z.c} 齿`, at: [X.c, Y, 0], shape: { type: 'gear', teeth: Z.c, r: R.c, h: H, bore: 3 }, fill: 'white', finish: 'steel', visible: false },
    marker('mark-c', 'gear-c', R.c),
    {
      id: 'rail', name: '齿条导轨', spec: '240 × 70 mm', visible: false,
      shape: {
        type: 'compound',
        items: [
          { type: 'slab', w: 240, d: 70, h: 8, r: 6, at: [0, 0, 15] },
          { type: 'cylinder', r: 2.6, h: 16, axis: 'y', at: [0, 16, 0], fill: 'shade' },
          { type: 'box', size: [240, 6, 4], at: [0, 11, back + 3], fill: 'shade' },
        ],
      },
      fill: 'warm', finish: 'wood',
    },
    { id: 'rack', name: '齿条', spec: `${RACK_LEN} mm`, at: [0, Y - H / 2, 0], shape: { type: 'poly', points: rackOutline(), h: H }, fill: 'shade', finish: 'steel', visible: false },
  ],
  stageSize: 520,
  guides: [
    {
      id: 'train',
      title: '齿轮怎么传动',
      kind: 'usage',
      steps: [
        {
          id: 'driver', title: '主动轮', desc: '摇把装在小齿轮 A 上，人摇它、它带别的轮转，所以叫主动轮。它有 12 个齿，模数 3，分度圆直径 36 mm。',
          camera: { target: 'gear-a', dir: [0.5, 0.9, 1], dist: 200 }, highlight: ['gear-a', 'knob'],
          actions: [{ type: 'spin', part: 'gear-a', axis: 'y', speed: speed.a }],
          chips: [{ label: '齿数', sub: `${Z.a}` }, { label: '分度圆', sub: `${2 * R.a} mm = 3 × 12` }],
        },
        {
          id: 'mesh', title: '两个齿轮咬合，方向相反', desc: '放上 24 齿的 B：A 的齿插进 B 的齿槽，一推一转。从上往下看，A 顺时针，B 就逆时针。',
          camera: { target: [(X.a + X.b) / 2, Y, 0], dir: [0.3, 1, 0.8], dist: 260 },
          set: { 'gear-b': { visible: true } }, highlight: ['gear-b'],
          actions: [{ type: 'spin', part: 'gear-a', axis: 'y', speed: speed.a }, { type: 'spin', part: 'gear-b', axis: 'y', speed: speed.b }],
          callouts: [
            { part: 'gear-a', text: '顺时针', at: [0, H / 2, 0], offset: [-30, 40, 0] },
            { part: 'gear-b', text: '逆时针', at: [0, H / 2, 0], offset: [30, 40, 0] },
          ],
          zoom: { target: [X.a + R.a, Y, 0], dir: [0, 1, 0.25], dist: 60, caption: '一个齿正好卡进对面的齿槽' },
        },
        {
          id: 'ratio', title: '小带大：转得慢、力气大', desc: 'A 转 2 圈，B 才转 1 圈：传动比 = 从动轮齿数 ÷ 主动轮齿数 = 24 ÷ 12 = 2。转速降一半，转动的力（扭矩）大约翻倍。',
          camera: { target: [(X.a + X.b) / 2, Y, 0], dir: 'top', dist: 280 }, highlight: ['gear-b'],
          actions: [{ type: 'spin', part: 'gear-a', axis: 'y', speed: speed.a }, { type: 'spin', part: 'gear-b', axis: 'y', speed: speed.b }],
          chips: [{ label: '传动比', sub: '24 ÷ 12 = 2' }, { label: '转速', sub: 'B 是 A 的 1/2' }],
          tip: '看 B 上的黑点：它转一圈的时间，A 的摇把正好转两圈。',
        },
        {
          id: 'idler', title: '加一个惰轮：方向不变', desc: '再接一只 36 齿的 C。中间的 B 成了惰轮：A 和 C 转向相同，传动比只看两头 —— 36 ÷ 12 = 3，和 B 有几个齿无关。',
          camera: { target: [X.b, Y, 0], dir: [0.2, 1, 0.75], dist: 360 },
          set: { 'gear-c': { visible: true } }, highlight: ['gear-c', 'gear-b'],
          actions: [
            { type: 'spin', part: 'gear-a', axis: 'y', speed: speed.a },
            { type: 'spin', part: 'gear-b', axis: 'y', speed: speed.b },
            { type: 'spin', part: 'gear-c', axis: 'y', speed: speed.c },
          ],
          callouts: [
            { part: 'gear-a', text: '顺时针', at: [0, H / 2, 0], offset: [15, 45, 0] },
            { part: 'gear-b', text: '惰轮 · 逆时针', at: [0, H / 2, 0], offset: [0, 50, 0] },
            { part: 'gear-c', text: '顺时针', at: [0, H / 2, 0], offset: [20, 45, 0] },
          ],
          chips: [{ label: 'A → C', sub: 'i = 36 ÷ 12 = 3' }],
        },
        {
          id: 'reverse', title: '倒过来：大带小加速', desc: '换成摇大齿轮 C：小齿轮 A 转得是它的 3 倍快，但要用 3 倍的力才摇得动。自行车的大牙盘带小飞轮就是这个道理。',
          camera: { target: [X.b, Y, 0], dir: [-0.3, 1, 0.75], dist: 360 }, highlight: ['gear-c'],
          actions: [
            { type: 'spin', part: 'gear-a', axis: 'y', speed: -speed.a },
            { type: 'spin', part: 'gear-b', axis: 'y', speed: -speed.b },
            { type: 'spin', part: 'gear-c', axis: 'y', speed: -speed.c },
          ],
          chips: [{ label: '增速', sub: 'A 是 C 的 3 倍' }],
        },
      ],
    },
    {
      id: 'rack',
      title: '齿轮齿条',
      kind: 'usage',
      start: {
        board: { visible: false }, 'gear-b': { visible: false }, 'gear-c': { visible: false },
        rail: { visible: true }, rack: { visible: true }, 'gear-a': { at: [0, Y, 0] },
      },
      steps: [
        {
          id: 'convert', title: '转动变成直线', desc: '把小齿轮 A 放到一根齿条上：齿轮来回转，齿条就在导轨上左右走。汽车的转向机、钻床的手柄进给都是这样。',
          camera: { target: [0, Y, 10], dir: [0.35, 0.8, 1], dist: 260 }, highlight: ['rack'],
          actions: [
            { type: 'swing', part: 'gear-a', axis: 'y', amp: SWING, period: PERIOD },
            { type: 'slide', part: 'rack', axis: 'x', amp: TRAVEL, period: PERIOD },
          ],
        },
        {
          id: 'distance', title: '转一圈走多远', desc: `齿条的齿距和齿轮一样是 π × 模数 ≈ ${P.toFixed(2)} mm。小齿轮转一圈推过 12 个齿，齿条就走 12 × ${P.toFixed(2)} ≈ ${(P * Z.a).toFixed(1)} mm。`,
          camera: { target: [0, Y, R.a], dir: 'top', dist: 200 }, highlight: ['gear-a', 'rack'],
          actions: [
            { type: 'swing', part: 'gear-a', axis: 'y', amp: SWING, period: PERIOD },
            { type: 'slide', part: 'rack', axis: 'x', amp: TRAVEL, period: PERIOD },
          ],
          chips: [{ label: '转 90°', sub: `走 ${TRAVEL.toFixed(1)} mm` }, { label: '转一圈', sub: `走 ${(P * Z.a).toFixed(1)} mm` }],
        },
      ],
    },
  ],
}
