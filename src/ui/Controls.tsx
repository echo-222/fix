import { useRef } from 'react'
import type { FeedPost } from '../community/seed'
import { useCurrentStep } from '../three/Scene'
import { useApp } from '../store'
import { NoteActions } from './community/NotePanel'
import { IconLeft, IconRight } from './icons'

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

export function Controls({ post }: { post: FeedPost }) {
  const next = useApp((s) => s.next)
  const prev = useApp((s) => s.prev)
  const guides = useApp((s) => s.guides)
  const { index, guide, design } = useCurrentStep()
  const at = guides.indexOf(guide)
  const before = index === 0 ? guides[at - 1] : undefined
  const after = index === guide.steps.length - 1 ? guides[at + 1] : undefined
  const prevLabel = before ? `上一个：${before.title}` : '上一步'
  const nextLabel = after ? `下一个：${after.title}` : '下一步'
  return (
    <footer className="controls">
      <NoteActions post={post} />
      <Timeline />
      <button className="round" onClick={prev} disabled={!design && index === 0 && !before} aria-label={prevLabel} title={prevLabel}>
        <IconLeft />
      </button>
      <button className="round" onClick={next} disabled={!design && index === guide.steps.length - 1 && !after} aria-label={nextLabel} title={nextLabel}>
        <IconRight />
      </button>
    </footer>
  )
}
