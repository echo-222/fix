/**
 * poly / gear 两种平面挤出形体的轮廓：渲染（three/manual/shapes.ts）和审计（audit.ts）共用，画出来的就是审计看到的。
 */

export type P2 = [number, number]

/** 点到多边形的有向距离：内部为负 */
export function polySdf(pts: P2[], x: number, z: number) {
  let d = Infinity
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j]
    const [bx, bz] = pts[i]
    const ex = bx - ax
    const ez = bz - az
    const len = ex * ex + ez * ez
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len)) : 0
    d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t))
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * ex) / ez) inside = !inside
  }
  return inside ? -d : d
}

/** 齿轮各半径与齿距：模数 m = 2r / teeth，齿顶 r + m，齿根 r - 1.25m */
export function gearDims(teeth: number, r: number) {
  const m = (2 * r) / teeth
  return { m, tip: r + m, root: Math.max(r * 0.3, r - 1.25 * m), pitch: (Math.PI * 2) / teeth }
}

/** 齿根、齿顶处齿厚的一半（按齿距的比例）：分度圆上齿厚约 0.43 齿距，留出侧隙 */
const ROOT_HALF = 0.3
const TIP_HALF = 0.15

const halfAt = (rho: number, root: number, tip: number) => ROOT_HALF + ((TIP_HALF - ROOT_HALF) * (rho - root)) / (tip - root)

/** 齿轮外轮廓（平面坐标，0° 方向是第一个齿的中心），逆时针 */
export function gearOutline(teeth: number, r: number): P2[] {
  const { tip, root, pitch } = gearDims(teeth, r)
  const at = (rho: number, a: number): P2 => [rho * Math.cos(a), rho * Math.sin(a)]
  const out: P2[] = []
  for (let i = 0; i < teeth; i++) {
    const c = i * pitch
    out.push(at(root, c - ROOT_HALF * pitch), at(tip, c - TIP_HALF * pitch), at(tip, c + TIP_HALF * pitch), at(root, c + ROOT_HALF * pitch))
    // 齿槽底部的圆弧
    for (let k = 1; k <= 2; k++) out.push(at(root, c + ROOT_HALF * pitch + ((1 - 2 * ROOT_HALF) * pitch * k) / 3))
  }
  return out
}

/** 平面上的点在齿轮里多深（mm），外部 ≤ 0 */
export function gearDepth(teeth: number, r: number, bore: number, x: number, y: number) {
  const { tip, root, pitch } = gearDims(teeth, r)
  const rho = Math.hypot(x, y)
  if (bore > 0 && rho < bore) return rho - bore
  if (rho <= root) return root - rho + 0.01
  if (rho >= tip) return tip - rho
  const a = Math.atan2(y, x)
  const off = Math.abs(((a / pitch) % 1 + 1.5) % 1 - 0.5) * pitch
  return Math.min(tip - rho, (halfAt(rho, root, tip) * pitch - off) * rho)
}
