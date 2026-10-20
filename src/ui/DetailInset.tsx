import { useEffect, useRef } from 'react'
import { isManualModel } from '../domain/products'
import { DetailCanvas } from '../three/DetailScene'
import { ManualDetailCanvas } from '../three/manual/ManualStage'
import { focusScreen } from '../three/focus'
import { useCurrentStep } from '../three/Scene'
import { useApp } from '../store'

const DETAIL_CAPTION: Record<string, string> = {
  tnut: '滑入 T 型螺母', dropin: '弹片螺母 · 旋转 90°', bracket: '角码 + 内六角', internal: '内置连接件',
  leveler: '旋入调节脚杯', caster: '旋入脚轮', topScrew: '固定片 + 木螺丝', square: '量对角线',
  plate: '连接板固定', cap: '压入端盖', tray: '挂装线槽', wobble: '判断晃动方向', sag: '横梁下挠',
  collar: '限位环 · 拧紧顶丝', shelf: '限位环上下夹紧层板', shelfRest: '层板落在限位环上', flange: '法兰支座 + 木螺丝', flangeRod: '插入光轴 · 拧紧夹紧螺丝',
  tclamp: 'T 型夹 · 立柱插入盲孔', tclampTop: 'T 型夹盲孔朝下 · 套上立柱', cross: '十字夹 · 两杆交叉', rodFoot: '旋入调节脚', rodCap: '压入端盖', rodPad: '套上脚套',
  level: '水平仪找平', rodWobble: '判断晃动方向',
}

export function DetailInset() {
  const { step, design } = useCurrentStep()
  const showDetail = useApp((s) => s.showDetail)
  const panel = useApp((s) => s.panel)
  const model = useApp((s) => s.model)
  const circle = useRef<HTMLDivElement>(null)
  const line = useRef<SVGLineElement>(null)
  const zoom = step.scene?.zoom
  const manual = isManualModel(model) && step.scene && zoom ? model : null
  const visible = !design && panel === 'none' && showDetail && (!!step.detail || !!manual)

  useEffect(() => {
    if (!visible) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const c = circle.current
      const l = line.current
      if (!c || !l) return
      const parent = c.parentElement!.getBoundingClientRect()
      const r = c.getBoundingClientRect()
      const cx = r.left - parent.left + r.width / 2
      const cy = r.top - parent.top + r.height / 2
      const dx = focusScreen.x - cx
      const dy = focusScreen.y - cy
      const d = Math.hypot(dx, dy)
      const R = r.width / 2
      const show = focusScreen.visible && d > R + 30
      l.style.opacity = show ? '1' : '0'
      if (!show) return
      l.setAttribute('x1', String(focusScreen.x))
      l.setAttribute('y1', String(focusScreen.y))
      l.setAttribute('x2', String(cx + (dx / d) * R))
      l.setAttribute('y2', String(cy + (dy / d) * R))
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [visible])

  if (!visible) return null
  return (
    <>
      <svg className="leader" aria-hidden>
        <line ref={line} strokeDasharray="3 4" />
      </svg>
      <div className="detail" ref={circle}>
        <span className="detail-pill">细节</span>
        <div className="detail-canvas">
          {manual
            ? <ManualDetailCanvas model={manual} scene={step.scene!} />
            : <DetailCanvas kind={step.detail!} flipped={step.pose === 'flipped'} />}
        </div>
        <span className="detail-caption">{manual ? zoom!.caption : DETAIL_CAPTION[step.detail!]}</span>
      </div>
    </>
  )
}
