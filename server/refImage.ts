// 外观模型参考图的「抹平」：产品表面上要保持几何体的东西（按键、屏幕、指示灯、接口）在生成前用周围外壳的颜色盖掉，
// Tripo 生成的模型里就没有它们，几何体叠上去不会两层（manual-to-3d skill 第 10 步「一物一画」）。
// 网页导入（server/appearance.ts）和手工流程（scripts/ref-cover.mjs）共用。

export interface RgbaImage {
  width: number
  height: number
  data: Uint8Array
}

/** 框外取样的厚度（px）和沿边平滑的窗口（px） */
const RING = 3
const SMOOTH = 4

/**
 * 把像素框 [x0, y0, x1, y1] 里抹成周围外壳的颜色：取框外一圈的颜色（每个位置取 RING 层的中位数，再沿边平滑），
 * 框里每个点按离四条边的远近，在左右两边和上下两边之间插值，外壳上的明暗渐变也带过去。
 * 框要贴着外壳画：框外一圈是背景的话，抹出来就是背景色。
 */
export function coverBox(img: RgbaImage, box: [number, number, number, number]) {
  const { width: W, height: H, data: px } = img
  const x0 = Math.max(RING, Math.floor(box[0]))
  const y0 = Math.max(RING, Math.floor(box[1]))
  const x1 = Math.min(W - 1 - RING, Math.ceil(box[2]))
  const y1 = Math.min(H - 1 - RING, Math.ceil(box[3]))
  if (x1 <= x0 || y1 <= y0) return
  const at = (x: number, y: number, c: number) => px[(y * W + x) * 4 + c]
  const median = (vals: number[]) => vals.sort((a, b) => a - b)[vals.length >> 1]
  /** 一条边上每个位置的颜色：沿 (dx, dy) 往框外取 RING 个像素的中位数 */
  const edge = (n: number, pos: (i: number, k: number) => [number, number]) => {
    const raw = Array.from({ length: n }, (_, i) => [0, 1, 2].map((c) => median(Array.from({ length: RING }, (_, k) => at(...pos(i, k + 1), c)))))
    return raw.map((_, i) => [0, 1, 2].map((c) => {
      let s = 0
      let m = 0
      for (let j = Math.max(0, i - SMOOTH); j <= Math.min(n - 1, i + SMOOTH); j++, m++) s += raw[j][c]
      return s / m
    }))
  }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const left = edge(h, (i, k) => [x0 - k, y0 + i])
  const right = edge(h, (i, k) => [x1 + k, y0 + i])
  const top = edge(w, (i, k) => [x0 + i, y0 - k])
  const bottom = edge(w, (i, k) => [x0 + i, y1 + k])
  for (let j = 0; j < h; j++) {
    const ty = (j + 1) / (h + 1)
    for (let i = 0; i < w; i++) {
      const tx = (i + 1) / (w + 1)
      // 离哪条边近就更像哪条边：贴边处和框外接得上，不留缝
      const wh = 1 / Math.min(tx, 1 - tx)
      const wv = 1 / Math.min(ty, 1 - ty)
      const o = ((y0 + j) * W + x0 + i) * 4
      for (let c = 0; c < 3; c++) {
        const hc = left[j][c] * (1 - tx) + right[j][c] * tx
        const vc = top[i][c] * (1 - ty) + bottom[i][c] * ty
        px[o + c] = Math.round((wh * hc + wv * vc) / (wh + wv))
      }
    }
  }
}
