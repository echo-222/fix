import { useRef } from 'react'
import { useCurrentStep } from '../three/Scene'
import { useApp } from '../store'
import { IconLeft, IconPause, IconPlay, IconRight, IconTag, IconZoom } from './icons'

function Timeline() {
  const { guide, index, design } = useCurrentStep()
  const go = useApp((s) => s.go)
  const track = useRef<HTMLDivElement>(null)
  const n = guide.steps.length
  const pos = design ? 0 : (index + 0.5) / n

  const seek = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    const k = Math.min(0.999, Math.max(0, (clientX - r.left) / r.width))
    go(Math.floor(k * n))
  }

  return (
    <div className="timeline">
      <span className="timeline-label">步骤</span>
      <div
        className="timeline-track"
        ref={track}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e.clientX)
        }}
        onPointerMove={(e) => e.buttons && seek(e.clientX)}
        role="slider"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={index + 1}
      >
        <div className="timeline-fill" style={{ width: `${pos * 100}%` }} />
        {Array.from({ length: n - 1 }, (_, i) => (
          <i key={i} className="timeline-tick" style={{ left: `${((i + 1) / n) * 100}%` }} />
        ))}
        {!design && <b className="timeline-thumb" style={{ left: `${pos * 100}%` }} />}
      </div>
      <span className="timeline-count">{design ? '—' : index + 1} / {n}</span>
    </div>
  )
}

export function Controls() {
  const playing = useApp((s) => s.playing)
  const showDetail = useApp((s) => s.showDetail)
  const showLabels = useApp((s) => s.showLabels)
  const setPlaying = useApp((s) => s.setPlaying)
  const toggle = useApp((s) => s.toggle)
  const next = useApp((s) => s.next)
  const prev = useApp((s) => s.prev)
  const { index, guide, design } = useCurrentStep()
  return (
    <footer className="controls">
      <button className="round" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停' : '自动播放'}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button className={`round ${showDetail ? 'is-on' : ''}`} onClick={() => toggle('showDetail')} aria-label="细节放大" title="细节放大">
        <IconZoom />
      </button>
      <button className={`round ${showLabels ? 'is-on' : ''}`} onClick={() => toggle('showLabels')} aria-label="零件标签" title="零件标签">
        <IconTag />
      </button>
      <Timeline />
      <button className="round" onClick={prev} disabled={!design && index === 0} aria-label="上一步">
        <IconLeft />
      </button>
      <button className="round" onClick={next} disabled={!design && index === guide.steps.length - 1} aria-label="下一步">
        <IconRight />
      </button>
    </footer>
  )
}
