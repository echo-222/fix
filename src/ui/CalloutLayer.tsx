import { useEffect, useRef } from 'react'
import { calloutScreen } from '../three/focus'
import { useCurrentStep } from '../three/Scene'

/** 说明书标注：引线 + 标签，位置由 ManualStage 每帧投影到 calloutScreen */
export function CalloutLayer() {
  const { step, design } = useCurrentStep()
  const scene = design ? undefined : step.scene
  const callouts = scene?.callouts ?? []
  const lines = useRef<(SVGLineElement | null)[]>([])
  const dots = useRef<(SVGCircleElement | null)[]>([])
  const boxes = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!callouts.length) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const fresh = calloutScreen.scene === scene
      callouts.forEach((_, i) => {
        const s = calloutScreen.items[i]
        const show = fresh && !!s?.visible
        const l = lines.current[i]
        const d = dots.current[i]
        const b = boxes.current[i]
        if (!l || !d || !b) return
        l.style.opacity = d.style.opacity = b.style.opacity = show ? '1' : '0'
        if (!show) return
        l.setAttribute('x1', String(s.x1))
        l.setAttribute('y1', String(s.y1))
        l.setAttribute('x2', String(s.x2))
        l.setAttribute('y2', String(s.y2))
        d.setAttribute('cx', String(s.x1))
        d.setAttribute('cy', String(s.y1))
        b.style.transform = `translate(${s.x2}px, ${s.y2}px) translate(-50%, -50%)`
      })
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [scene, callouts])

  if (!callouts.length) return null
  return (
    <div className="callout-layer">
      <svg className="leader" aria-hidden>
        {callouts.map((_, i) => (
          <g key={`${step.id}-${i}`}>
            <line ref={(el) => { lines.current[i] = el }} style={{ opacity: 0 }} />
            <circle ref={(el) => { dots.current[i] = el }} r={2.4} style={{ opacity: 0 }} />
          </g>
        ))}
      </svg>
      {callouts.map((c, i) => (
        <div key={`${step.id}-${i}`} ref={(el) => { boxes.current[i] = el }} className="callout" style={{ opacity: 0 }}>
          <b>{c.text}</b>
          {c.sub && <span>{c.sub}</span>}
        </div>
      ))}
    </div>
  )
}
