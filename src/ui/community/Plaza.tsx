import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { withBase } from '../../base'
import { SPRITE_ANCHOR, spiral, type Tone } from '../../community/plaza'
import meta from '../../community/plaza.json'
import { slugOf, type FeedPost } from '../../community/seed'
import { useTrends } from '../../community/trends'
import { hrefOf } from '../../router'
import { IconCube3d, IconMinus, IconPlus, IconTarget } from '../icons'
import { stepsOf } from './bits'

/** 模型图边长（缩放为 1 时的 px） */
const S = 228
/**
 * 一格地砖的宽，菱形高是一半。模型图里最高的占边长 0.9、最宽的占 0.84（scripts/plaza.mjs 渲染时留了边），
 * 前后相邻两格差 TW/2、斜邻差 (TW/2, TW/4)：TW ≥ 1.8·S 时任意两格的模型都不重叠
 */
const TW = 2 * S
/** 搜索高亮的地块：比地砖小一圈 */
const LOT = TW - 28
const ZOOM = { min: 0.3, max: 1.6 }

const SPRITES = meta as Record<string, { top: number; left: number; right: number }>

export interface PlazaView { x: number; y: number; z: number }

/** 画面中心偏下一点：上面压着顶栏和品类 */
const CENTER_Y = 0.56

const clampZ = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const diamond = (w: number) => `M${w / 2} 0L${w} ${w / 4}L${w / 2} ${w / 2}L0 ${w / 4}Z`

/**
 * 地面：白底上灰色虚线的等轴菱形网格，每格摆一个模型。背景图跟着缩放一起缩，
 * 所以线宽按缩放倒数给，屏幕上始终一像素左右；每条边正好 17 段虚线，交点处都是实线头
 */
function floor(z: number) {
  const dash = Math.hypot(TW / 2, TW / 4) / 34
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TW / 2}" viewBox="0 0 ${TW} ${TW / 2}">`
    + `<path d="${diamond(TW)}" fill="none" stroke="#cdcdcd" stroke-width="${(1.1 / z).toFixed(2)}" stroke-dasharray="${dash.toFixed(3)} ${dash.toFixed(3)}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function Tile({ post, slot, tone, notes, order }: { post: FeedPost; slot: { x: number; y: number; i: number; j: number }; tone: Tone; notes: number; order: number }) {
  const slug = slugOf(post.product)
  const note = post.kind === 'note'
  // 「我的」里的笔记也上广场：有配图用自己的图，没有就借关联说明书的模型图
  const m = note && post.images[0] ? undefined : SPRITES[slug]
  const steps = note ? 0 : stepsOf(post)
  const hot = useTrends((s) => (note ? undefined : s.hot.get(post.product)))
  // 格子本身不建层叠上下文（不用 transform / z-index）：模型按前后排 --z 叠，名牌整体浮在所有模型上面
  const style: CSSProperties & Record<'--i' | '--z', number> = {
    left: slot.x * TW,
    top: slot.y * TW,
    '--z': slot.i + slot.j + 40,
    '--i': order,
  }
  const hit = m
    ? { left: (m.left - SPRITE_ANCHOR.x) * S, width: (m.right - m.left) * S, top: (m.top - SPRITE_ANCHOR.y) * S, height: (SPRITE_ANCHOR.y - m.top) * S }
    : { left: -S * 0.3, width: S * 0.6, top: -S * 0.55, height: S * 0.55 }
  // 接触阴影：地面上一块 2:1 的软椭圆，悬停时模型抬起、阴影留在地上
  const sw = Math.min(hit.width, S * 0.8) * 0.92
  return (
    <a className={`ptile is-${tone}`} data-id={post.id} href={hrefOf({ name: 'note', id: post.id })} style={style} draggable={false} aria-label={post.title}>
      <svg className="ptile-lot" width={LOT} height={LOT / 2} style={{ left: -LOT / 2, top: -LOT / 4 }} aria-hidden>
        <path d={diamond(LOT)} />
      </svg>
      <span className="ptile-shadow" style={{ left: -sw / 2, width: sw, top: -sw * 0.21 + 6, height: sw * 0.42 }} />
      <span className="ptile-lift">
        {m ? (
          <img
            className="ptile-model"
            src={`${import.meta.env.BASE_URL}plaza/${slug}.webp`}
            alt=""
            draggable={false}
            decoding="async"
            style={{ width: S, height: S, left: -S * SPRITE_ANCHOR.x, top: -S * SPRITE_ANCHOR.y }}
          />
        ) : post.images[0] ? (
          <span className="ptile-photo"><img src={withBase(post.images[0])} alt="" draggable={false} /></span>
        ) : (
          <span className="ptile-blank"><IconCube3d width={40} height={40} strokeWidth={1.3} /></span>
        )}
        <span className="ptile-hit" style={hit} />
      </span>
      <span className="ptile-label" style={{ top: hit.top - 8 }}>
        {tone === 'best' && <em>最匹配</em>}
        {hot && <em className="is-hot">热门 No.{hot.rank}</em>}
        {post.draft && <em className="is-draft">未发布</em>}
        <b>{post.title}</b>
        <small>{note ? `使用笔记 · ${post.category}` : <>{post.category}{steps > 0 && ` · ${steps} 步`}{notes > 0 && ` · ${notes} 篇笔记`}</>}</small>
      </span>
    </a>
  )
}

/**
 * 首页的 3D 广场：所有说明书的等轴模型图摆在一块无限延伸的地砖上，按住拖动、滚轮 / 触控板平移，
 * 捏合或 ⌘ / Ctrl + 滚轮缩放。order 的第 k 份放在螺旋的第 k 格；focusKey 变了（换搜索词、品类）就滑回中心。
 * 平移是直接改 DOM 的 transform，不经过 React 渲染。
 */
export function Plaza({ order, tone, notes, focusKey, initial, onLeave }: {
  order: FeedPost[]
  tone: Map<string, Tone>
  notes: Map<string, number>
  focusKey: string
  initial: PlazaView | null
  onLeave: (v: PlazaView) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const view = useRef<PlazaView>(initial ?? { x: 0, y: 0, z: 1 })
  const anim = useRef(0)
  const slots = useMemo(() => spiral(order.length), [order.length])
  const place = useMemo(() => new Map(order.map((p, k) => [p.id, { slot: slots[k], k }])), [order, slots])
  // DOM 里的顺序固定，换位置只改 transform，才有移动动画
  const tiles = useMemo(() => [...order].sort((a, b) => (a.id < b.id ? -1 : 1)), [order])
  const bounds = useMemo(() => {
    const xs = slots.map((s) => s.x * TW)
    const ys = slots.map((s) => s.y * TW)
    return { x0: Math.min(0, ...xs), x1: Math.max(0, ...xs), y0: Math.min(0, ...ys), y1: Math.max(0, ...ys) }
  }, [slots])
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  const placeRef = useRef(place)
  placeRef.current = place
  const focused = useRef<string | null>(null)
  const floorZ = useRef(0)

  /** 离画面中心最近的一格亮出名牌：拖到哪儿就知道正对着的是什么 */
  const markFocus = useCallback(() => {
    const w = world.current
    if (!w) return
    const v = view.current
    const cx = -v.x / v.z
    const cy = -v.y / v.z
    let best: string | null = null
    let d = Infinity
    for (const [id, { slot }] of placeRef.current) {
      const dd = Math.hypot(slot.x * TW - cx, (slot.y * TW - cy) * 1.4)
      if (dd < d) { d = dd; best = id }
    }
    if (d > TW * 0.6) best = null
    if (best === focused.current) return
    if (focused.current) w.querySelector(`[data-id="${CSS.escape(focused.current)}"]`)?.classList.remove('is-focus')
    if (best) w.querySelector(`[data-id="${CSS.escape(best)}"]`)?.classList.add('is-focus')
    focused.current = best
  }, [])

  const apply = useCallback(() => {
    const el = box.current
    const w = world.current
    if (!el || !w) return
    const v = view.current
    const b = boundsRef.current
    // 画面中心看到的世界坐标不出摆放范围外半屏
    const mx = el.clientWidth * 0.4
    const my = el.clientHeight * 0.4
    v.x = Math.min(-(b.x0 * v.z) + mx, Math.max(-(b.x1 * v.z) - mx, v.x))
    v.y = Math.min(-(b.y0 * v.z) + my, Math.max(-(b.y1 * v.z) - my, v.y))
    const cx = el.clientWidth / 2 + v.x
    const cy = el.clientHeight * CENTER_Y + v.y
    w.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${v.z})`
    w.style.setProperty('--zoom', String(v.z))
    const tw = TW * v.z
    el.style.backgroundSize = `${tw}px ${tw / 2}px`
    el.style.backgroundPosition = `${cx - tw / 2}px ${cy - tw / 4}px`
    // 线宽随缩放换一张图；缩放差不到 6% 就沿用，捏合时不至于每帧重画
    if (Math.abs(floorZ.current / v.z - 1) > 0.06) {
      floorZ.current = v.z
      el.style.backgroundImage = floor(v.z)
    }
    el.classList.toggle('is-far', v.z < 0.5)
    markFocus()
  }, [markFocus])

  const stop = () => cancelAnimationFrame(anim.current)

  const glide = useCallback((to: PlazaView, ms = 650) => {
    stop()
    const from = { ...view.current }
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const k = ease(t)
      view.current = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k }
      apply()
      if (t < 1) anim.current = requestAnimationFrame(tick)
    }
    anim.current = requestAnimationFrame(tick)
  }, [apply])

  /** 以画面上的点 (px, py) 为中心缩放 */
  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const el = box.current!
    const v = view.current
    const z = clampZ(v.z * factor)
    const bx = el.clientWidth / 2
    const by = el.clientHeight * CENTER_Y
    const wx = (px - bx - v.x) / v.z
    const wy = (py - by - v.y) / v.z
    view.current = { x: px - bx - wx * z, y: py - by - wy * z, z }
    apply()
  }, [apply])

  useLayoutEffect(() => {
    if (!initial) view.current.z = window.innerWidth <= 760 ? 0.52 : window.innerWidth < 1200 ? 0.66 : 0.8
    apply()
    const el = box.current!
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => {
      ro.disconnect()
      stop()
      onLeave({ ...view.current })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 换了排布：格子挪了位置，正对中心的那格要重新算
  useLayoutEffect(() => {
    focused.current = null
    world.current?.querySelectorAll('.is-focus').forEach((n) => n.classList.remove('is-focus'))
    apply()
  }, [bounds, place, apply])

  const lastKey = useRef(focusKey)
  useEffect(() => {
    if (lastKey.current === focusKey) return
    lastKey.current = focusKey
    glide({ x: 0, y: 0, z: view.current.z })
  }, [focusKey, glide])

  // 拖动、惯性、捏合
  useEffect(() => {
    const el = box.current!
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0
    let dragging = false
    let last = { x: 0, y: 0, t: 0 }
    let vel = { x: 0, y: 0 }
    let pinch = 0
    let suppress = false
    /** 这次点按来自触屏（手机、平板）：鼠标点一下直接打开，触屏要先挪到中心 */
    let touch = false

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if ((e.target as Element).closest('.plaza-zoom')) return
      stop()
      touch = e.pointerType !== 'mouse'
      pts.set(e.pointerId, local(e))
      if (pts.size === 1) {
        moved = 0
        dragging = false
        suppress = false
        last = { ...local(e), t: performance.now() }
        vel = { x: 0, y: 0 }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      const p = local(e)
      if (pts.size >= 2) {
        pts.set(e.pointerId, p)
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch)
        pinch = d
        dragging = true
        suppress = true
        return
      }
      const prev = pts.get(e.pointerId)!
      pts.set(e.pointerId, p)
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      moved += Math.abs(dx) + Math.abs(dy)
      if (!dragging && moved > 6) {
        dragging = true
        suppress = true
        el.setPointerCapture(e.pointerId)
        el.classList.add('is-dragging')
      }
      if (!dragging) return
      view.current.x += dx
      view.current.y += dy
      apply()
      const now = performance.now()
      const dt = Math.max(1, now - last.t)
      vel = { x: 0.8 * ((p.x - last.x) / dt) + 0.2 * vel.x, y: 0.8 * ((p.y - last.y) / dt) + 0.2 * vel.y }
      last = { ...p, t: now }
    }
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      if (pts.size === 1) {
        const [p] = [...pts.values()]
        last = { ...p, t: performance.now() }
        vel = { x: 0, y: 0 }
        return
      }
      if (pts.size > 0) return
      pinch = 0
      el.classList.remove('is-dragging')
      // 触屏拖完不会再来 click，标记留着会吞掉下一次点按
      if (suppress) setTimeout(() => { suppress = false })
      if (!dragging || performance.now() - last.t > 90) return
      // 松手后的惯性
      let v = { x: vel.x * 16, y: vel.y * 16 }
      const tick = () => {
        v = { x: v.x * 0.92, y: v.y * 0.92 }
        view.current.x += v.x
        view.current.y += v.y
        apply()
        if (Math.hypot(v.x, v.y) > 0.4) anim.current = requestAnimationFrame(tick)
      }
      if (Math.hypot(v.x, v.y) > 1) anim.current = requestAnimationFrame(tick)
    }
    const click = (e: MouseEvent) => {
      if ((e.target as Element).closest('.plaza-zoom')) return
      const tap = touch
      touch = false
      if (suppress) {
        e.preventDefault()
        e.stopPropagation()
        suppress = false
        return
      }
      // 触屏上模型小、挨得近：点到的不是正对中心的那格，先把它挪到中心（亮出名牌），再点一次才打开
      const id = tap ? (e.target as Element).closest<HTMLElement>('.ptile')?.dataset.id : undefined
      const at = id && id !== focused.current ? placeRef.current.get(id) : undefined
      if (!at) return
      e.preventDefault()
      e.stopPropagation()
      const z = view.current.z
      glide({ x: -at.slot.x * TW * z, y: -at.slot.y * TW * z, z })
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      stop()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025) * (e.ctrlKey ? 4 : 1)))
      else {
        const k = e.deltaMode === 1 ? 32 : 1
        view.current.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k
        view.current.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k
        apply()
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('wheel', wheel)
    }
  }, [apply, zoomAt, glide])

  /** 以画面中心缩放 */
  const zoomBy = (f: number) => {
    const v = view.current
    const z = clampZ(v.z * f)
    glide({ x: (v.x * z) / v.z, y: (v.y * z) / v.z, z }, 260)
  }

  return (
    <div className="plaza" ref={box}>
      <div className="plaza-world" ref={world}>
        {tiles.map((p) => {
          const at = place.get(p.id)!
          return <Tile key={p.id} post={p} slot={at.slot} order={at.k} tone={tone.get(p.id) ?? 'plain'} notes={notes.get(p.product) ?? 0} />
        })}
      </div>
      <div className="plaza-zoom" role="group" aria-label="广场视图">
        <button className="neu-btn" onClick={() => glide({ x: 0, y: 0, z: view.current.z })} aria-label="回到中心" title="回到中心"><IconTarget /></button>
        <button className="neu-btn" onClick={() => zoomBy(1.25)} aria-label="放大"><IconPlus /></button>
        <button className="neu-btn" onClick={() => zoomBy(0.8)} aria-label="缩小"><IconMinus /></button>
      </div>
    </div>
  )
}
