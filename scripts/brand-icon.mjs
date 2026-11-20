// 品牌图标「懂了 Dongle」：一只亮着的灯泡，灯丝是一笔连写、发光的 dongle。
// 所有尺寸（logo / favicon / 等待页动画）都由这里的参数生成，scripts/icons.mjs 负责写文件。
//
// 灯丝字形取自 Hershey Script 1-stroke（d o n g l e 六个字母，平滑成曲线）：
//   The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the
//   U. S. National Bureau of Standards. The format of the Font data in this distribution
//   was originally created by James Hurt, Cognition, Inc., 900 Technology Park Drive,
//   Billerica, MA 01821. SVG conversion by Windell H. Oskay, www.evilmadscientist.com.

const INK = '#161616'
const CREAM = '#f8e8a8'
const WHITE = '#fff'
const GREY = '#e4e4e1'
const CORE = '#d9650a'
const GLOW = '#ffc23d'

// 字形：字体单位，y 向上，基线 y = 0；每个字母是若干笔折线 [x, y, x, y, …]
const GLYPHS = {
  d: { adv: 504, strokes: [
    [315, 189, 284, 252, 220, 284, 158, 284, 94.5, 252, 63, 220, 31.5, 158, 31.5, 94.5, 63, 31.5, 126, 0, 189, 0, 252, 31.5, 284, 94.5, 472, 662],
    [346, 284, 315, 126, 315, 31.5, 346, 0, 378, 0, 441, 31.5, 472, 63, 536, 158]] },
  o: { adv: 441, strokes: [
    [220, 284, 158, 284, 94.5, 252, 63, 220, 31.5, 158, 31.5, 94.5, 63, 31.5, 126, 0, 189, 0, 252, 31.5, 284, 63, 315, 126, 315, 189, 284, 252, 220, 284, 189, 252, 189, 189, 220, 126, 284, 94.5, 378, 94.5, 441, 126, 472, 158]] },
  n: { adv: 567, strokes: [
    [31.5, 158, 94.5, 252, 158, 284, 189, 252, 189, 220, 158, 94.5, 126, 0],
    [158, 94.5, 189, 158, 252, 252, 315, 284, 378, 284, 410, 252, 410, 189, 378, 94.5, 378, 31.5, 410, 0, 441, 0, 504, 31.5, 536, 63, 598, 158]] },
  g: { adv: 472, strokes: [
    [315, 189, 284, 252, 220, 284, 158, 284, 94.5, 252, 63, 220, 31.5, 158, 31.5, 94.5, 63, 31.5, 126, 0, 189, 0, 252, 31.5, 284, 63],
    [346, 284, 284, 63, 158, -284, 126, -346, 63, -378, 31.5, -346, 31.5, -284, 63, -189, 158, -94.5, 252, -31.5, 315, 0, 410, 63, 504, 158]] },
  l: { adv: 252, strokes: [
    [31.5, 158, 94.5, 252, 189, 410, 220, 472, 252, 567, 252, 630, 220, 662, 158, 630, 126, 567, 94.5, 441, 63, 220, 63, 31.5, 94.5, 0, 126, 0, 189, 31.5, 220, 63, 284, 158]] },
  e: { adv: 315, strokes: [
    [63, 63, 126, 94.5, 158, 126, 189, 189, 189, 252, 158, 284, 126, 284, 63, 252, 31.5, 189, 31.5, 94.5, 63, 31.5, 126, 0, 189, 0, 252, 31.5, 284, 63, 346, 158]] },
}

/** dongle 的三笔（提笔两次）：d（上提后回笔接第二笔）｜o + n（n 底部回笔接第二笔）｜g（碗收口后上提再下行）+ l + e */
function word() {
  const at = {}
  let x = 0
  for (const ch of 'dongle') {
    at[ch] = x
    x += GLYPHS[ch].adv
  }
  const pts = (ch, i) => {
    const s = GLYPHS[ch].strokes[i]
    const out = []
    for (let j = 0; j < s.length; j += 2) out.push([s[j] + at[ch], s[j + 1]])
    return out
  }
  const e = pts('e', 0)
  return {
    strokes: [
      [...pts('d', 0), ...pts('d', 1)],
      [...pts('o', 0), ...pts('n', 0), ...pts('n', 1)],
      // l 的收笔不碰 e 的左边，直接连进 e 的起笔（经典 le 连笔）
      [...pts('g', 0), ...pts('g', 1), ...pts('l', 0).slice(1, -1), ...e],
    ],
    minX: 31.5,
    maxX: at.e + 346,
    // 两根支架丝接在 d 的碗底和 e 的收尾
    anchors: [[at.d + 140, 0], e[e.length - 1]],
  }
}

// 灯泡（设计坐标，最后整体缩放进 32×32）
const C = [16, 14]
const R = 8.7
const NECK = 3.6
const Y_NECK = C[1] + 10.1
const Y_BASE = Y_NECK + 5
const E = 1.35 // 螺口椭圆的短半轴（略微俯视）
const RAY = [R + 1.9, R + 4]
const WORD_W = 14.2
const BASELINE = C[1] + 1.3

const f = (n) => +n.toFixed(2)
const rad = (deg) => (deg * Math.PI) / 180

/** Catmull-Rom → 三次贝塞尔；转角大于 100° 的点（回笔）保留尖角 */
function smooth(pts) {
  const sharp = pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return true
    const a = [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]]
    const b = [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]]
    return (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1) < Math.cos(rad(100))
  })
  const tan = (i) => (sharp[i] ? [0, 0] : [(pts[i + 1][0] - pts[i - 1][0]) / 6, (pts[i + 1][1] - pts[i - 1][1]) / 6])
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, t1] = [tan(i), tan(i + 1)]
    d += `C${f(pts[i][0] + t0[0])} ${f(pts[i][1] + t0[1])} ${f(pts[i + 1][0] - t1[0])} ${f(pts[i + 1][1] - t1[1])} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`
    len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  return { d, len }
}

/** pad：在灯泡外再留多少比例的边（0 = 光芒顶到 32 格的边） */
function build(pad) {
  const top = C[1] - RAY[1] - 0.9
  const bottom = Y_BASE + 2.9 + 0.4
  const half = RAY[1] * Math.cos(rad(20)) + 0.9
  const k = 32 / (Math.max(bottom - top, half * 2) * (1 + pad))
  const cy = (top + bottom) / 2
  const T = (x, y) => [f(16 + (x - 16) * k), f(16 + (y - cy) * k)]
  const P = (x, y) => T(x, y).join(' ')
  const arc = (rx, ry, sweep, x, y) => `A${f(rx * k)} ${f(ry * k)} 0 0 ${sweep} ${P(x, y)}`

  const w = word()
  const s = WORD_W / (w.maxX - w.minX)
  const W = ([gx, gy]) => T(16 - WORD_W / 2 + (gx - w.minX) * s, BASELINE - gy * s)

  const L = 16 - NECK, Rt = 16 + NECK
  const shineR = R - 2.2
  return {
    k,
    tip: `M${P(16 - 1.8, Y_BASE + 0.7)}L${P(16 - 1.25, Y_BASE + 2.2)}Q${P(16, Y_BASE + 2.9)} ${P(16 + 1.25, Y_BASE + 2.2)}L${P(16 + 1.8, Y_BASE + 0.7)}z`,
    glass: `M${P(L, Y_NECK)}C${P(L, Y_NECK - 3)} ${P(C[0] - R, C[1] + 5.7)} ${P(C[0] - R, C[1])}${arc(R, R, 1, C[0] + R, C[1])}C${P(C[0] + R, C[1] + 5.7)} ${P(Rt, Y_NECK - 3)} ${P(Rt, Y_NECK)}z`,
    shine: `M${P(C[0] + shineR * Math.cos(rad(-160)), C[1] + shineR * Math.sin(rad(-160)))}${arc(shineR, shineR, 1, C[0] + shineR * Math.cos(rad(-118)), C[1] + shineR * Math.sin(rad(-118)))}`,
    wires: w.anchors.map((a, i) => `M${W(a).join(' ')}L${P(16 + (i ? 1.3 : -1.3), Y_NECK + 0.6)}`).join(''),
    filament: w.strokes.map((st) => smooth(st.map(W))),
    base: `M${P(L, Y_NECK)}${arc(NECK, E, 0, Rt, Y_NECK)}V${T(0, Y_BASE)[1]}${arc(NECK, E, 1, L, Y_BASE)}z`,
    threads: [Y_NECK + 1.7, Y_NECK + 3.4].map((y) => `M${P(L, y)}${arc(NECK, E, 0, Rt, y)}`).join(''),
    rays: [-160, -125, -90, -55, -20].map((a) => `M${P(C[0] + RAY[0] * Math.cos(rad(a)), C[1] + RAY[0] * Math.sin(rad(a)))}L${P(C[0] + RAY[1] * Math.cos(rad(a)), C[1] + RAY[1] * Math.sin(rad(a)))}`),
    halo: { c: T(...C), r: f((R + 1.4) * k) },
  }
}

const glowFilter = (id, blur) => `<filter id="${id}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${blur}" /></filter>`

/** 静态图标。tile：白底圆角（favicon 用）；sw：轮廓线宽；fw：灯丝线宽 */
function staticIcon({ sw, fw, pad = 0, tile = false }) {
  const g = build(pad)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`,
    `  <defs>`,
    `    ${glowFilter('glow', 0.75)}`,
    `    <path id="dongle" d="${g.filament.map((s) => s.d).join('')}" />`,
    `  </defs>`,
    ...(tile ? [`  <rect width="32" height="32" rx="7.5" fill="${WHITE}" />`] : []),
    `  <g stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">`,
    `    <path d="${g.tip}" fill="${INK}" />`,
    `    <path d="${g.glass}" fill="${CREAM}" />`,
    `    <path d="${g.shine}" fill="none" stroke="${WHITE}" stroke-width="${f(sw * 0.85)}" />`,
    `    <path d="${g.wires}" fill="none" stroke-width="${f(Math.max(0.42, sw * 0.3))}" />`,
    `    <use href="#dongle" fill="none" stroke="${GLOW}" stroke-width="${f(fw * 3.4)}" filter="url(#glow)" />`,
    `    <use href="#dongle" fill="none" stroke="${CORE}" stroke-width="${fw}" />`,
    `    <path d="${g.base}" fill="${GREY}" />`,
    `    <path d="${g.threads}" fill="none" stroke-width="${f(sw * 0.5)}" />`,
    `    <path d="${g.rays.join('')}" fill="none" />`,
    `  </g>`,
    `</svg>`,
  ].join('\n') + '\n'
}

export const logoSvg = () => staticIcon({ sw: 1.35, fw: 0.62 })
export const faviconSvg = () => staticIcon({ sw: 2.2, fw: 0.9, pad: 0.02, tile: true })

/** 等待页：分层的 SVG + 灯丝三笔各自的 keyframes（按笔画长度分配写字时间，写字匀速）。
 *  周期里的时间点要和 index.html 里手写的 splash-bulb / splash-glass / splash-halo / splash-ray 对上：
 *  18% 灯泡落定开始写，52% 写完、灯亮，82% 开始熄灭 */
export function splash() {
  const g = build(0.14)
  const sw = 0.85
  const WRITE = [18, 52]
  const GAP = 1.2
  const total = g.filament.reduce((n, s) => n + s.len, 0)
  const span = WRITE[1] - WRITE[0] - GAP * (g.filament.length - 1)
  let t = WRITE[0]
  const keyframes = g.filament.map((s, i) => {
    const a = t
    const b = t + (span * s.len) / total
    t = b + GAP
    return [
      `@keyframes splash-w${i} {`,
      `  0%, ${f(a)}% { stroke-dashoffset: 1; opacity: 0; }`,
      `  ${f(a + 0.3)}% { opacity: 1; }`,
      `  ${f(b)}%, 82% { stroke-dashoffset: 0; opacity: 1; }`,
      `  92%, 100% { stroke-dashoffset: 0; opacity: 0; }`,
      `}`,
    ].join('\n')
  }).join('\n')
  const uses = (cls, attrs) => g.filament.map((_, i) => `      <use class="${cls} w${i}" href="#splash-w${i}" ${attrs} />`)
  const svg = [
    `<svg class="splash-art" viewBox="0 0 32 32" aria-hidden="true">`,
    `  <defs>`,
    `    ${glowFilter('splash-glow', 0.68)}`,
    ...g.filament.map((s, i) => `    <path id="splash-w${i}" d="${s.d}" pathLength="1" />`),
    `  </defs>`,
    `  <circle class="halo" cx="${g.halo.c[0]}" cy="${g.halo.c[1]}" r="${g.halo.r}" />`,
    `  <g class="bulb" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">`,
    `    <path d="${g.tip}" fill="${INK}" />`,
    `    <path class="glass" d="${g.glass}" />`,
    `    <path d="${g.shine}" fill="none" stroke="${WHITE}" stroke-width="${f(sw * 0.85)}" />`,
    `    <path d="${g.wires}" fill="none" stroke-width="${f(sw * 0.4)}" />`,
    `    <g class="fil" fill="none">`,
    ...uses('glow', `stroke="${GLOW}" stroke-width="1.7" filter="url(#splash-glow)"`),
    ...uses('core', `stroke="${CORE}" stroke-width="0.5"`),
    `    </g>`,
    `    <path d="${g.base}" fill="${GREY}" />`,
    `    <path d="${g.threads}" fill="none" stroke-width="${f(sw * 0.5)}" />`,
    `  </g>`,
    ...g.rays.map((r, i) => `  <path class="ray r${i}" d="${r}" pathLength="1" />`),
    `</svg>`,
  ].join('\n')
  return { svg, keyframes }
}
