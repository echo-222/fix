import { Matrix4, Quaternion, Vector3 } from 'three'
import type { CameraSpec, FoldOp, FoldPoint, FoldSelect, OrigamiShape, PartState, SpecPart, Vec3 } from './types'

/**
 * 折纸模拟（顺序简单折叠）：一张纸切成若干块刚性的「面」，每折一次，折线一侧选中的面绕折线转过去（缺省 180° 压平）。
 * 折线穿过的面先沿折线切开，切口记成这一步的折痕；相邻两块面之间的折痕在画面上弯过去连成一张纸（OrigamiView）。
 * 层次：往上折的面落在它盖住的所有层上面，往下折的落在最下面，层间留 2 × GAP 的缝，压平后整张纸最低处贴桌面。
 *
 * 坐标：纸平铺在桌面（y = 0），中心在原点。内部用俯视 [x, z]；对外（FoldOp）用图解坐标 [x, y]，y = -z。
 * 程序是纯数据（ManualSpec 里的 OrigamiShape.ops），网站导入流程里模型写的 JSON 和手写的 TS 走同一份模拟。
 */

/** 纸面 / 俯视坐标 [x, z] */
export type P2 = [number, number]

interface Facet {
  key: string
  pts: P2[]
  /** born[i]：边 pts[i] → pts[i + 1] 是哪一步折出来的折痕；-1 = 纸的原边 */
  born: number[]
  /** hist[k]：第 k 步之后的变换（纸面坐标 → 零件局部），hist[0] 是平铺 */
  hist: Matrix4[]
  moved: Set<number>
}

export interface FoldArc {
  at: Vec3
  axis: Vec3
}

export interface OrigamiData {
  th: number
  /** 面的局部 +y 一侧 / -y 一侧的颜色 */
  top: string
  bottom: string
  faces: { pts: P2[]; born: number[] }[]
  /** 两块面在纸面上共用的一段边：born 是哪一步折出来的折痕 */
  links: { a: number; b: number; p: P2; q: P2; born: number }[]
  /** 画在纸上的点：side = 1 画在局部 +y 那面 */
  marks: { face: number; at: P2; r: number; color: string; side: 1 | -1; born: number }[]
  /** frames[k][i]：第 k 步之后第 i 块面的变换 */
  frames: Matrix4[][]
  /** arcs[k][i]：进入第 k 步时第 i 块面绕哪条轴翻过去；null = 直接插值（整体落回桌面这类平移） */
  arcs: (FoldArc | null)[][]
  /** moving[k]：第 k 步翻动的面 */
  moving: number[][]
  /** lifts[k]：进入第 k 步的过渡里整张纸要抬多高才不穿过桌面 */
  lifts: number[]
  steps: number
  errors: string[]
}

export interface PaperOptions {
  size: number | [number, number]
  color?: string
  white?: string
  up?: 'white' | 'color'
  th?: number
  /** 零件 id，缺省 paper */
  name?: string
}

const EPS = 1e-6
/** 层间缝的一半（mm）：比真纸夸张一点，画面上看得出一层层 */
const GAP = 0.08
const DEG = 180 / Math.PI
export const PAPER_WHITE = '#f7f4ec'
export const PAPER_COLOR = '#e4573d'

const toP2 = ([x, y]: FoldPoint): P2 => [x, -y]
const finite = (v: number[]) => v.every((x) => typeof x === 'number' && Number.isFinite(x))
const isPoint = (p: unknown): p is FoldPoint => Array.isArray(p) && p.length === 2 && finite(p)
const round = (v: number) => Math.round(v * 1e4) / 1e4

/** 按 s（到折线的有向距离）保留 keep 一侧；沿折线新切出的边记为第 step 步的折痕，其余边沿用原来的 born */
function clip(pts: P2[], born: number[], s: number[], keep: 1 | -1, step: number) {
  const out: P2[] = []
  const meta: number[] = []
  const cross = (i: number, j: number): P2 => {
    const t = s[i] / (s[i] - s[j])
    return [pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t]
  }
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    const a = s[i] * keep
    const b = s[j] * keep
    if (a >= -EPS) {
      if (b < -EPS) {
        if (a > EPS) {
          out.push(pts[i], cross(i, j))
          meta.push(born[i], step)
        } else {
          out.push(pts[i])
          meta.push(step)
        }
      } else {
        out.push(pts[i])
        meta.push(born[i])
      }
    } else if (b > EPS) {
      out.push(cross(i, j))
      meta.push(born[i])
    }
  }
  return { pts: out, born: meta }
}

function area(pts: P2[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    a += x0 * z1 - x1 * z0
  }
  return Math.abs(a / 2)
}

/** 俯视投影的凸包（单调链） */
function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P2[] = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** 两个凸多边形（俯视）重叠得比 tol 深：贴着边、只碰到一个角的不算 */
function overlaps(A: P2[], B: P2[], tol = 0.3) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const nx = q[1] - p[1]
      const nz = p[0] - q[0]
      const len = Math.hypot(nx, nz)
      if (len < 1e-9) continue
      const span = (P: P2[]) => {
        let lo = Infinity
        let hi = -Infinity
        for (const v of P) {
          const s = (v[0] * nx + v[1] * nz) / len
          lo = Math.min(lo, s)
          hi = Math.max(hi, s)
        }
        return [lo, hi]
      }
      const [a0, a1] = span(A)
      const [b0, b1] = span(B)
      if (Math.min(a1, b1) - Math.max(a0, b0) < tol) return false
    }
  }
  return true
}

export function insidePoly(pts: P2[], [x, z]: P2) {
  let r = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j]
    const [bx, bz] = pts[i]
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) r = !r
  }
  if (r) return true
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j]
    const [bx, bz] = pts[i]
    const ex = bx - ax
    const ez = bz - az
    const len = ex * ex + ez * ez
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len)) : 0
    if (Math.hypot(x - ax - ex * t, z - az - ez * t) < 0.05) return true
  }
  return false
}

export class Paper {
  readonly th: number
  readonly w: number
  readonly l: number
  readonly ops: FoldOp[] = []
  readonly errors: string[] = []
  private facets: Facet[]
  private arcs: Map<string, FoldArc>[] = [new Map()]
  private drawn: { key: string; at: P2; r: number; color: string; side: 1 | -1; born: number }[] = []
  private opts: PaperOptions
  private shapeObj?: OrigamiShape
  private cache?: OrigamiData

  constructor(opts: PaperOptions) {
    this.opts = opts
    const [w, l] = typeof opts.size === 'number' ? [opts.size, opts.size] : opts.size
    if (!(w > 0 && l > 0)) this.errors.push('size 要是正数（mm）')
    this.w = w > 0 ? w : 150
    this.l = l > 0 ? l : 150
    this.th = opts.th && opts.th > 0 ? opts.th : 0.3
    const [hw, hl] = [this.w / 2, this.l / 2]
    this.facets = [{ key: 'f', pts: [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]], born: [-1, -1, -1, -1], hist: [new Matrix4()], moved: new Set() }]
  }

  /** 已经折了几步（步号从 1 开始，0 是平铺） */
  get steps() {
    return this.arcs.length - 1
  }

  /** 零件 id：整张纸就是一个零件 */
  get id() {
    return this.opts.name ?? 'paper'
  }

  // ---------- 折纸程序 ----------

  /** 执行一步（FoldOp），返回步号。出错时这一步保持原样，错误记在 errors 里（编译时报出来） */
  run(op: FoldOp): number {
    this.ops.push(op)
    this.cache = undefined
    const k = this.begin()
    try {
      this.apply(op, k)
    } catch (e) {
      this.errors.push(`第 ${k} 步（${op?.op ?? '?'}）：${e instanceof Error ? e.message : String(e)}`)
    }
    this.settle(k)
    return k
  }

  /**
   * 沿直线 a → b（图解坐标）折，move 那一侧翻过去。
   * under：山折（往下翻到纸底下）；angle：只转这么多度（缺省 180 压平）；only：只折选中的面
   */
  fold(a: FoldPoint, b: FoldPoint, move: FoldPoint, opt: { under?: boolean; angle?: number; only?: FoldSelect } = {}) {
    return this.run({ op: 'fold', line: [a, b], move, ...opt })
  }

  /** 把点 p 折到点 q 上（折线是 pq 的中垂线，p 那一侧翻过去） */
  bring(p: FoldPoint, q: FoldPoint, opt: { under?: boolean; angle?: number; only?: FoldSelect } = {}) {
    return this.run({ op: 'fold', bring: p, onto: q, ...opt })
  }

  unfold(step: number) {
    return this.run({ op: 'unfold', step })
  }

  flip(way: 'left-right' | 'top-bottom' = 'left-right') {
    return this.run({ op: 'flip', way })
  }

  turn(angle: number) {
    return this.run({ op: 'turn', angle })
  }

  rotate(groups: Extract<FoldOp, { op: 'rotate' }>['groups']) {
    return this.run({ op: 'rotate', groups })
  }

  stand(crease: number, angle?: number) {
    return this.run({ op: 'stand', crease, ...(angle ? { angle } : {}) })
  }

  draw(marks: Extract<FoldOp, { op: 'draw' }>['marks']) {
    return this.run({ op: 'draw', marks })
  }

  private apply(op: FoldOp, k: number) {
    if (!op || typeof op !== 'object') throw new Error('不是有效的 op')
    switch (op.op) {
      case 'fold': {
        let a: P2, b: P2, move: P2
        if (op.bring !== undefined || op.onto !== undefined) {
          if (!isPoint(op.bring) || !isPoint(op.onto)) throw new Error('bring / onto 要写两个点 [x, y]')
          const p = toP2(op.bring)
          const q = toP2(op.onto)
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5) throw new Error('bring 和 onto 是同一个点')
          const m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
          const d: P2 = [q[1] - p[1], p[0] - q[0]]
          a = [m[0] - d[0], m[1] - d[1]]
          b = [m[0] + d[0], m[1] + d[1]]
          move = p
        } else {
          if (!Array.isArray(op.line) || !isPoint(op.line[0]) || !isPoint(op.line[1])) throw new Error('fold 要写 line: [[x, y], [x, y]]，或者 bring / onto')
          if (!isPoint(op.move)) throw new Error('fold 要写 move：要翻过去那一侧的任意一点 [x, y]')
          a = toP2(op.line[0])
          b = toP2(op.line[1])
          move = toP2(op.move)
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) throw new Error('line 的两个点重合了')
        }
        const angle = op.angle ?? 180
        if (!finite([angle]) || Math.abs(angle) > 180) throw new Error('angle 要在 -180 到 180 之间')
        this.foldAt(a, b, move, k, !!op.under, angle, this.select(op.only, k))
        return
      }
      case 'unfold': {
        const s = op.step
        if (!Number.isInteger(s) || s < 1 || s >= k) throw new Error(`unfold 的 step 要是前面的步号（1–${k - 1}）`)
        let n = 0
        for (const f of this.facets) {
          if (!f.moved.has(s)) continue
          const arc = this.arcs[s].get(f.key)
          f.hist[k] = f.hist[s - 1].clone()
          f.moved.add(k)
          if (arc) this.arcs[k].set(f.key, { at: arc.at, axis: arc.axis.map((v) => -v) as Vec3 })
          n++
        }
        if (!n) throw new Error(`第 ${s} 步没有翻动过的面`)
        return
      }
      case 'flip': {
        const b = this.bounds(k)
        const axis = op.way === 'top-bottom' ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)
        this.turnFacets(this.facets, b.center, axis, 180, k)
        return
      }
      case 'turn': {
        if (!finite([op.angle])) throw new Error('turn 要写 angle（度）')
        const c = this.bounds(k).center
        this.turnFacets(this.facets, new Vector3(c.x, 0, c.z), new Vector3(0, 1, 0), op.angle, k)
        return
      }
      case 'rotate': {
        if (!Array.isArray(op.groups) || !op.groups.length) throw new Error('rotate 要写 groups')
        op.groups.forEach((g, gi) => {
          if (!finite([g.angle])) throw new Error(`第 ${gi + 1} 组要写 angle（度）`)
          let at: Vec3, axis: Vec3
          if (g.crease !== undefined) {
            if (!Number.isInteger(g.crease) || g.crease < 1 || g.crease >= k) throw new Error(`第 ${gi + 1} 组的 crease 要是前面的步号`)
            ;({ at, axis } = this.crease(g.crease, k - 1))
          } else {
            if (!Array.isArray(g.at) || !finite(g.at) || !Array.isArray(g.axis) || !finite(g.axis)) throw new Error(`第 ${gi + 1} 组要写 crease（绕第几步的折痕转），或者 at + axis`)
            at = g.at
            axis = g.axis
          }
          const sel = this.select(g.only, k)
          const list = this.facets.filter((f) => !this.arcs[k].has(f.key) && sel(f))
          if (!list.length) throw new Error(`第 ${gi + 1} 组没有选中任何面`)
          this.turnFacets(list, new Vector3(...at), new Vector3(...axis), g.angle, k)
        })
        return
      }
      case 'stand': {
        if (!Number.isInteger(op.crease) || op.crease < 1 || op.crease >= k) throw new Error(`stand 的 crease 要是前面的步号（1–${k - 1}）`)
        const angle = op.angle ?? 90
        if (!finite([angle]) || angle <= 0 || angle > 180) throw new Error('stand 的 angle 要在 0–180 度')
        const { at, axis } = this.crease(op.crease, k - 1)
        const c = new Vector3(...at)
        const n = new Vector3(...axis).normalize()
        const rise = (sign: number) => {
          const R = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationAxis(n, (sign * angle) / DEG)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z))
          let y = 0
          for (const f of this.facets) for (const v of this.corners(f, k)) y += v.applyMatrix4(R).y
          return y
        }
        this.turnFacets(this.facets, c, n, rise(1) >= rise(-1) ? angle : -angle, k)
        return
      }
      case 'draw': {
        if (!Array.isArray(op.marks) || !op.marks.length) throw new Error('draw 要写 marks')
        for (const m of op.marks) {
          if (!isPoint(m.at) || !(m.r > 0)) throw new Error('mark 要写 at: [x, y] 和 r > 0')
          const hit = this.topAt(toP2(m.at), k)
          if (!hit) throw new Error(`[${m.at}] 这个位置没有纸`)
          this.drawn.push({ key: hit.f.key, at: hit.local, r: m.r, color: m.color ?? '#1f1a17', side: hit.up, born: k })
        }
        return
      }
      default:
        throw new Error(`没有「${(op as { op: string }).op}」这种 op（可选 fold / unfold / flip / turn / rotate / stand / draw）`)
    }
  }

  private T(f: Facet, k = this.steps) {
    return f.hist[Math.min(k, f.hist.length - 1)]
  }

  private corners(f: Facet, k = this.steps) {
    const m = this.T(f, k)
    return f.pts.flatMap(([x, z]) => [new Vector3(x, 0, z).applyMatrix4(m), new Vector3(x, this.th, z).applyMatrix4(m)])
  }

  private begin() {
    for (const f of this.facets) f.hist.push(this.T(f).clone())
    this.arcs.push(new Map())
    return this.steps
  }

  /** 俯视点 p 处最上面那层：哪块面、纸面坐标、朝上的是哪面 */
  private topAt(p: P2, k: number) {
    let best: { f: Facet; local: P2; y: number; up: 1 | -1 } | null = null
    const inv = new Matrix4()
    const a = new Vector3()
    const b = new Vector3()
    for (const f of this.facets) {
      const m = this.T(f, k)
      inv.copy(m).invert()
      a.set(p[0], 0, p[1]).applyMatrix4(inv)
      b.set(p[0], 1, p[1]).applyMatrix4(inv)
      const dy = b.y - a.y
      if (Math.abs(dy) < 0.2) continue
      const t = (this.th / 2 - a.y) / dy
      const local: P2 = [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]
      if (!insidePoly(f.pts, local)) continue
      const y = new Vector3(local[0], this.th / 2, local[1]).applyMatrix4(m).y
      if (!best || y > best.y) best = { f, local, y, up: m.elements[5] > 0 ? 1 : -1 }
    }
    return best
  }

  private select(sel: FoldSelect | undefined, k: number): (f: Facet) => boolean {
    if (sel === undefined || sel === 'all') return () => true
    if (!sel || typeof sel !== 'object') throw new Error(`only 写法不对：${JSON.stringify(sel)}`)
    if ('moved' in sel) {
      if (!Number.isInteger(sel.moved) || sel.moved < 1 || sel.moved >= k) throw new Error(`only.moved 要是前面的步号（1–${k - 1}）`)
      return (f) => f.moved.has(sel.moved)
    }
    if ('not' in sel) {
      const s = this.select(sel.not, k)
      return (f) => !s(f)
    }
    if ('any' in sel) {
      const list = sel.any.map((s) => this.select(s, k))
      return (f) => list.some((s) => s(f))
    }
    if ('every' in sel) {
      const list = sel.every.map((s) => this.select(s, k))
      return (f) => list.every((s) => s(f))
    }
    if ('flap' in sel) {
      if (!isPoint(sel.flap)) throw new Error('only.flap 要写一个点 [x, y]')
      const hit = this.topAt(toP2(sel.flap), k)
      if (!hit) throw new Error(`only.flap 的位置 [${sel.flap}] 没有纸`)
      const sig = (f: Facet) => [...f.moved].sort((x, y) => x - y).join(',')
      const ref = sig(hit.f)
      return (f) => sig(f) === ref
    }
    throw new Error(`only 写法不对：${JSON.stringify(sel)}`)
  }

  /** 沿俯视直线 a → b 把选中的面切开，返回直线 move 一侧的面 */
  private split(a: P2, b: P2, move: P2, k: number, only: (f: Facet) => boolean) {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    const sd = (x: number, z: number) => (dx * (z - a[1]) - dz * (x - a[0])) / len
    const side = Math.sign(sd(move[0], move[1])) as 1 | -1
    if (!side) throw new Error('move 点在折线上')
    const moving: Facet[] = []
    const next: Facet[] = []
    for (const f of this.facets) {
      if (!only(f)) {
        next.push(f)
        continue
      }
      const m = this.T(f, k)
      const s = f.pts.map(([x, z]) => {
        const v = new Vector3(x, this.th / 2, z).applyMatrix4(m)
        return sd(v.x, v.z) * side
      })
      const hi = Math.max(...s)
      const lo = Math.min(...s)
      if (hi <= 0.01) next.push(f)
      else if (lo >= -0.01) {
        next.push(f)
        moving.push(f)
      } else {
        const ca = clip(f.pts, f.born, s, 1, k)
        const cb = clip(f.pts, f.born, s, -1, k)
        const kids = [ca, cb].map((c, i) => ({ key: f.key + (i ? 'b' : 'a'), pts: c.pts, born: c.born, hist: f.hist.map((h) => h.clone()), moved: new Set(f.moved) }))
        // 之前各步记在父块名下的翻折，两块都要带上
        for (const ch of this.arcs) {
          const c = ch.get(f.key)
          if (c) for (const kid of kids) ch.set(kid.key, c)
        }
        if (area(ca.pts) > 0.5) {
          next.push(kids[0])
          moving.push(kids[0])
        }
        if (area(cb.pts) > 0.5) next.push(kids[1])
      }
    }
    this.facets = next
    return { moving, side, dir: [dx / len, dz / len] as P2 }
  }

  private turnFacets(list: Facet[], at: Vector3, axis: Vector3, angle: number, k: number) {
    const n = axis.clone().normalize()
    if (!(n.lengthSq() > 0.5)) throw new Error('转轴方向不能是 0')
    const R = new Matrix4().makeTranslation(at.x, at.y, at.z)
      .multiply(new Matrix4().makeRotationAxis(n, angle / DEG))
      .multiply(new Matrix4().makeTranslation(-at.x, -at.y, -at.z))
    const s = Math.sign(angle) || 1
    for (const f of list) {
      f.hist[k] = R.clone().multiply(f.hist[k])
      f.moved.add(k)
      this.arcs[k].set(f.key, { at: [round(at.x), round(at.y), round(at.z)], axis: [n.x * s, n.y * s, n.z * s] })
    }
  }

  /** 让整张纸最低处贴着桌面：往下翻过的面会把整张纸垫高 */
  private settle(k: number) {
    let low = Infinity
    for (const f of this.facets) for (const v of this.corners(f, k)) low = Math.min(low, v.y)
    if (!Number.isFinite(low) || Math.abs(low) < 1e-4) return
    const m = new Matrix4().makeTranslation(0, -low, 0)
    for (const f of this.facets) f.hist[k] = m.clone().multiply(f.hist[k])
  }

  private foldAt(a: P2, b: P2, move: P2, k: number, under: boolean, angle: number, only: (f: Facet) => boolean) {
    const { moving, side, dir } = this.split(a, b, move, k, only)
    if (!moving.length) throw new Error('折线 move 那一侧没有选中的纸')
    // 转轴高度：压在要翻过去的面、以及翻过去会盖住的面上面一点点（往下折就在最下面一点点）
    const nx = -dir[1] * side
    const nz = dir[0] * side
    const movingKeys = new Set(moving.map((f) => f.key))
    const mirror = (x: number, z: number): P2 => {
      const d = (x - a[0]) * nx + (z - a[1]) * nz
      return [x - 2 * d * nx, z - 2 * d * nz]
    }
    // 翻过去之后落在哪儿（俯视凸包），只和真正盖住的面比高度，别被旁边的层垫高
    const land = moving.map((f) => hull(this.corners(f, k).map((v) => mirror(v.x, v.z))))
    let hi = -Infinity
    let lo = Infinity
    let coverHi = -Infinity
    let coverLo = Infinity
    for (const f of this.facets) {
      const c = this.corners(f, k)
      const own = movingKeys.has(f.key)
      if (!own && !land.some((L) => overlaps(L, hull(c.map((v) => [v.x, v.z] as P2))))) continue
      for (const v of c) {
        hi = Math.max(hi, v.y)
        lo = Math.min(lo, v.y)
        if (!own) {
          coverHi = Math.max(coverHi, v.y)
          coverLo = Math.min(coverLo, v.y)
        }
      }
    }
    const at = new Vector3(a[0], under ? lo - GAP : hi + GAP, a[1])
    // 往上折：转轴 = 法向 × y；往下折反过来
    const axis = new Vector3(nx, 0, nz).cross(new Vector3(0, 1, 0)).multiplyScalar(under ? -1 : 1)
    this.turnFacets(moving, at, axis, angle, k)
    // 压平：薄的一片翻到厚的一叠上，绕一根轴转过去会悬在半空，整片落下来贴着它盖住的那几层
    if (Math.abs(angle) !== 180 || !Number.isFinite(coverHi)) return
    const ys = moving.flatMap((f) => this.corners(f, k).map((v) => v.y))
    const dy = under ? Math.max(0, coverLo - 2 * GAP - Math.max(...ys)) : Math.min(0, coverHi + 2 * GAP - Math.min(...ys))
    if (Math.abs(dy) < 1e-6) return
    const m = new Matrix4().makeTranslation(0, dy, 0)
    for (const f of moving) f.hist[k] = m.clone().multiply(f.hist[k])
  }

  // ---------- 查询（写脚本时用） ----------

  /** 第 k 步之后整张纸的包围盒（零件局部坐标） */
  bounds(k = this.steps) {
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    for (const f of this.facets) for (const v of this.corners(f, k)) {
      min.min(v)
      max.max(v)
    }
    return { min, max, center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min) }
  }

  /** 第 k 步的镜头：看向纸的中心，dir 缺省斜前上方；远近按纸在这个方向上投影出来的大小定（细长的纸从头看过去也能占满画面） */
  view(k = this.steps, dir: Vec3 = DEFAULT_DIR, scale = 1): CameraSpec {
    return fitView(this.facets.flatMap((f) => this.corners(f, k)), dir, scale)
  }

  /** 第 step 步那条折痕在第 k 步之后的位置（转轴上一点 + 方向），按没跟着翻的那一侧的面换算 */
  crease(step: number, k = this.steps): FoldArc {
    const arc = [...this.arcs[step].values()][0]
    if (!arc) throw new Error(`第 ${step} 步没有翻折`)
    const a = new Vector3(...arc.at)
    const d = new Vector3(...arc.axis).normalize()
    // 参照面：没跟着这一步翻、有一整条边贴着折痕的面；之后动得最少的那块（只碰到一个角的面可能是后来折走的翼片）
    const onLine = (v: Vector3) => {
      const r = v.clone().sub(a)
      return r.sub(d.clone().multiplyScalar(r.dot(d))).setY(0).length() < 0.5
    }
    const later = (f: Facet) => [...f.moved].filter((s) => s > step && s <= k).length
    const ref = this.facets
      .filter((f) => !f.moved.has(step))
      .filter((f) => {
        const m = this.T(f, step - 1)
        return f.pts.some((p, i) => {
          const q = f.pts[(i + 1) % f.pts.length]
          return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1 && onLine(new Vector3(p[0], this.th / 2, p[1]).applyMatrix4(m)) && onLine(new Vector3(q[0], this.th / 2, q[1]).applyMatrix4(m))
        })
      })
      .sort((x, y) => later(x) - later(y))[0]
    if (!ref) throw new Error(`第 ${step} 步的折痕旁边找不到没翻动的面`)
    const M = this.T(ref, k).clone().multiply(this.T(ref, step - 1).clone().invert())
    const at = a.applyMatrix4(M)
    const axis = d.transformDirection(M)
    return { at: [round(at.x), round(at.y), round(at.z)], axis: [round(axis.x), round(axis.y), round(axis.z)] }
  }

  /** 俯视点 p（图解坐标）处最上面那层纸面的位置（零件局部坐标），细节窗、标注对准用 */
  where(p: FoldPoint, k = this.steps): Vec3 {
    const hit = this.topAt(toP2(p), k)
    if (!hit) throw new Error(`[${p}] 这个位置没有纸`)
    const v = new Vector3(hit.local[0], hit.up > 0 ? this.th : 0, hit.local[1]).applyMatrix4(this.T(hit.f, k))
    return [round(v.x), round(v.y), round(v.z)]
  }

  // ---------- 输出 ----------

  shape(): OrigamiShape {
    this.shapeObj ??= {
      type: 'origami', size: typeof this.opts.size === 'number' ? this.opts.size : [this.w, this.l],
      ...(this.opts.color ? { color: this.opts.color } : {}),
      ...(this.opts.white ? { white: this.opts.white } : {}),
      ...(this.opts.up ? { up: this.opts.up } : {}),
      ...(this.opts.th ? { th: this.opts.th } : {}),
      ops: this.ops,
    }
    return this.shapeObj
  }

  /** 整张纸零件 */
  part(name = '纸'): SpecPart {
    return { id: this.id, name, shape: this.shape() }
  }

  parts(): SpecPart[] {
    return [this.part()]
  }

  /** 第 k 步的 set：折到第 k 步 */
  set(k: number, dur?: number): Record<string, PartState> {
    return { [this.id]: { fold: k, ...(dur ? { dur } : {}) } }
  }

  /** 另一个指南从第 k 步折好的样子开始时用作 start */
  state(k = this.steps): Record<string, PartState> {
    return { [this.id]: { fold: k } }
  }

  /** 第 k 步有面翻动时高亮整张纸（画面上只给翻动的那几块面上色） */
  movedIds(k: number) {
    return this.data().moving[k]?.length ? [this.id] : []
  }

  all() {
    return [this.id]
  }

  /** 整张纸的零件 id：整体移动、扔出去这类动作写在它上面 */
  get carrier() {
    return this.id
  }

  data(): OrigamiData {
    if (this.cache && this.cache.steps === this.steps) return this.cache
    const faces = this.facets
    const frames = this.arcs.map((_, k) => faces.map((f) => this.T(f, k).clone()))
    const arcs = this.arcs.map((ch) => faces.map((f) => ch.get(f.key) ?? null))
    const colorUp = this.opts.up === 'color'
    const color = this.opts.color ?? PAPER_COLOR
    const white = this.opts.white ?? PAPER_WHITE
    const d: OrigamiData = {
      th: this.th,
      top: colorUp ? color : white,
      bottom: colorUp ? white : color,
      faces: faces.map((f) => ({ pts: f.pts, born: f.born })),
      links: links(faces),
      marks: this.drawn.flatMap((m) => {
        const i = faces.findIndex((f) => f.key.startsWith(m.key) && insidePoly(f.pts, m.at))
        return i < 0 ? [] : [{ face: i, at: m.at, r: m.r, color: m.color, side: m.side, born: m.born }]
      }),
      frames,
      arcs,
      moving: arcs.map((row) => row.flatMap((a, i) => (a ? [i] : []))),
      lifts: [],
      steps: this.steps,
      errors: [...this.errors],
    }
    d.lifts = frames.map((_, k) => (k === 0 ? 0 : liftFor(d, k)))
    this.cache = d
    return d
  }
}

/** 两块面在纸面上共线重叠的边 */
function links(faces: Facet[]): OrigamiData['links'] {
  const out: OrigamiData['links'] = []
  faces.forEach((f, i) => f.born.forEach((born, e) => {
    if (born < 0) return
    const a = f.pts[e]
    const c = f.pts[(e + 1) % f.pts.length]
    const dx = c[0] - a[0]
    const dz = c[1] - a[1]
    const len = Math.hypot(dx, dz)
    if (len < 0.2) return
    const off = (p: P2) => Math.abs(dx * (p[1] - a[1]) - dz * (p[0] - a[0])) / len
    const along = (p: P2) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len
    for (let j = i + 1; j < faces.length; j++) {
      const g = faces[j]
      g.pts.forEach((p, gi) => {
        const q = g.pts[(gi + 1) % g.pts.length]
        if (off(p) > 0.05 || off(q) > 0.05) return
        const lo = Math.max(0, Math.min(along(p), along(q)))
        const hi = Math.min(len, Math.max(along(p), along(q)))
        if (hi - lo < 0.2) return
        const at = (t: number): P2 => [a[0] + (dx * t) / len, a[1] + (dz * t) / len]
        out.push({ a: i, b: j, p: at(lo), q: at(hi), born })
      })
    }
  }))
  return out
}

// ---------- 过渡插值（OrigamiView 和审计共用） ----------

const tmp = {
  p0: new Vector3(), p1: new Vector3(), p: new Vector3(), c: new Vector3(), s: new Vector3(), u: new Vector3(), ax: new Vector3(), sc: new Vector3(),
  q0: new Quaternion(), q1: new Quaternion(), q: new Quaternion(), d: new Quaternion(), qi: new Quaternion(), one: new Vector3(1, 1, 1),
}

/** 绕 arc 转过去：p = c + R(kθ)(p0 - c)，终点和纯转动的差按进度补上（和 pose.ts 的 arc 一样） */
function arcBlend(A: Matrix4, B: Matrix4, arc: FoldArc, k: number, out: Matrix4, reverse: boolean) {
  const { p0, p1, p, c, s, u, ax, sc, q0, q1, q, d, qi, one } = tmp
  A.decompose(p0, q0, sc)
  B.decompose(p1, q1, sc)
  d.copy(q1).multiply(qi.copy(q0).invert())
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
  const half = Math.sqrt(Math.max(0, 1 - d.w * d.w))
  let theta = half < 1e-7 ? 0 : 2 * Math.acos(Math.min(1, d.w))
  if (half < 1e-7) u.set(1, 0, 0)
  else u.set(d.x, d.y, d.z).divideScalar(half)
  ax.fromArray(arc.axis)
  if (reverse) ax.negate()
  if (theta > 1e-6 && u.dot(ax) < 0) {
    u.negate()
    theta = Math.PI * 2 - theta
  }
  c.fromArray(arc.at)
  p0.sub(c)
  s.copy(p0).applyQuaternion(d).add(c)
  p1.sub(s)
  q.setFromAxisAngle(u, theta * k)
  p.copy(p0).applyQuaternion(q).add(c).addScaledVector(p1, k)
  q.multiply(q0)
  out.compose(p, q, one)
}

function rigidBlend(A: Matrix4, B: Matrix4, k: number, out: Matrix4) {
  const { p0, p1, q0, q1, sc, one } = tmp
  A.decompose(p0, q0, sc)
  B.decompose(p1, q1, sc)
  p0.lerp(p1, k)
  q0.slerp(q1, k)
  out.compose(p0, q0, one)
}

/** 从第 from 步过渡到第 to 步、进度 k（0–1）时每块面的变换，写进 out */
export function foldFrame(d: OrigamiData, from: number, to: number, k: number, out: Matrix4[]) {
  const f = Math.max(0, Math.min(d.steps, from))
  const t = Math.max(0, Math.min(d.steps, to))
  const A = d.frames[f]
  const B = d.frames[t]
  const arcs = t === f + 1 ? d.arcs[t] : f === t + 1 ? d.arcs[f] : null
  out.length = d.faces.length
  for (let i = 0; i < d.faces.length; i++) {
    const m = (out[i] ??= new Matrix4())
    if (k >= 1 || f === t) m.copy(B[i])
    else if (k <= 0) m.copy(A[i])
    else if (arcs?.[i]) arcBlend(A[i], B[i], arcs[i]!, k, m, f > t)
    else rigidBlend(A[i], B[i], k, m)
  }
  return out
}

/** 这组面变换下纸的最低点 */
function lowest(d: OrigamiData, mats: Matrix4[]) {
  let low = Infinity
  const v = new Vector3()
  d.faces.forEach((f, i) => {
    for (const [x, z] of f.pts) for (const y of [0, d.th]) low = Math.min(low, v.set(x, y, z).applyMatrix4(mats[i]).y)
  })
  return low
}

function liftFor(d: OrigamiData, k: number) {
  const mats: Matrix4[] = []
  let need = 0
  for (let i = 1; i < 24; i++) {
    const t = i / 24
    const low = lowest(d, foldFrame(d, k - 1, k, t, mats))
    if (low < -0.05) need = Math.max(need, -low / Math.sin(Math.PI * t))
  }
  return need > 0 ? Math.ceil(need + 1) : 0
}

/** 第 k 步之后的包围盒（零件局部坐标） */
export function origamiBounds(d: OrigamiData, k: number) {
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  const v = new Vector3()
  const mats = d.frames[Math.max(0, Math.min(d.steps, k))]
  d.faces.forEach((f, i) => {
    for (const [x, z] of f.pts) for (const y of [0, d.th]) {
      v.set(x, y, z).applyMatrix4(mats[i])
      min.min(v)
      max.max(v)
    }
  })
  return { min, max, center: min.clone().add(max).multiplyScalar(0.5) }
}

const DEFAULT_DIR: Vec3 = [0.35, 1, 0.75]

/** 看向这些点的包围盒中心，远近按它们在 dir 方向上投影出来的宽高定（画面按 1.6 : 1 留边） */
export function fitView(points: Vector3[], dir: Vec3 = DEFAULT_DIR, scale = 1): CameraSpec {
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const v of points) {
    min.min(v)
    max.max(v)
  }
  const c = min.add(max).multiplyScalar(0.5)
  const back = new Vector3(...dir).normalize()
  const right = new Vector3(0, 1, 0).cross(back)
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()
  const up = back.clone().cross(right)
  let w = 0
  let h = 0
  const d = new Vector3()
  for (const v of points) {
    d.copy(v).sub(c)
    w = Math.max(w, Math.abs(d.dot(right)))
    h = Math.max(h, Math.abs(d.dot(up)))
  }
  const span = Math.max(2 * h, (2 * w) / 1.6, 50)
  return { target: [round(c.x), round(c.y), round(c.z)], dir, dist: Math.round(span * 3.1 * scale) }
}

/** 第 k 步纸的取景（place = 零件的世界位置和朝向，缺省在原点）：网站导入流程给只写了 dir 的镜头补 target / dist */
export function origamiView(d: OrigamiData, k: number, dir: Vec3 = DEFAULT_DIR, place?: { pos: Vec3; quat: [number, number, number, number] }): CameraSpec {
  const mats = d.frames[Math.max(0, Math.min(d.steps, k))]
  const m = place ? new Matrix4().compose(new Vector3(...place.pos), new Quaternion(...place.quat), new Vector3(1, 1, 1)) : null
  const pts = d.faces.flatMap((f, i) => f.pts.flatMap(([x, z]) => [0, d.th].map((y) => {
    const v = new Vector3(x, y, z).applyMatrix4(mats[i])
    return m ? v.applyMatrix4(m) : v
  })))
  return fitView(pts, dir)
}

/** 审计用的采样点：每块面的角和边中点（上下两面） */
export function origamiCloud(d: OrigamiData, mats: Matrix4[]) {
  const out: Vector3[] = []
  d.faces.forEach((f, i) => {
    const n = f.pts.length
    for (let j = 0; j < n; j++) {
      const [x0, z0] = f.pts[j]
      const [x1, z1] = f.pts[(j + 1) % n]
      for (const y of [0, d.th]) {
        out.push(new Vector3(x0, y, z0).applyMatrix4(mats[i]), new Vector3((x0 + x1) / 2, y, (z0 + z1) / 2).applyMatrix4(mats[i]))
      }
    }
  })
  return out
}

const cache = new WeakMap<OrigamiShape, OrigamiData>()

/** 按 shape.ops 模拟（同一个 shape 对象只算一次） */
export function origamiOf(shape: OrigamiShape): OrigamiData {
  const hit = cache.get(shape)
  if (hit && hit.steps === (Array.isArray(shape.ops) ? shape.ops.length : 0)) return hit
  const paper = new Paper(shape)
  if (!Array.isArray(shape.ops)) paper.errors.push('ops 要是数组')
  else for (const op of shape.ops) paper.run(op)
  const d = paper.data()
  cache.set(shape, d)
  return d
}
