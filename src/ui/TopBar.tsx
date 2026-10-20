import { useEffect, useRef, useState } from 'react'
import { isManualProduct } from '../domain/manual/library'
import { currentGuide, useApp } from '../store'
import { IconChevron, IconGrid } from './icons'

export function TopBar() {
  const source = useApp((s) => s.source)
  const guides = useApp((s) => s.guides)
  const guideId = useApp((s) => s.guideId)
  const panel = useApp((s) => s.panel)
  const toggle = useApp((s) => s.toggle)
  const setGuide = useApp((s) => s.setGuide)
  const setPanel = useApp((s) => s.setPanel)
  const dims = useApp((s) => s.model.dims)
  const manual = useApp((s) => isManualProduct(s.product))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const guide = currentGuide({ guides, guideId })

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="pill" onClick={() => toggle('menuOpen')}>
          <IconGrid width={15} height={15} />
          菜单
        </button>
        <div className="product-title">
          <b>{source.title}</b>
          <span>{Math.round(dims.width)}×{Math.round(dims.depth)}×{Math.round(dims.height)}</span>
          {source.kind !== 'custom' && <em className={`badge ${source.kind}`}>{source.kind === 'ai' ? 'AI 导入' : '示例导入'}</em>}
        </div>
      </div>
      <div className="dropdown" ref={ref}>
        <button className="pill" onClick={() => setOpen(!open)}>
          {panel === 'design' ? '自定义设计' : guide.title}
          <IconChevron width={15} height={15} />
        </button>
        {open && (
          <div className="dropdown-menu">
            {guides.map((g) => (
              <button
                key={g.id}
                className={`dropdown-item ${g.id === guideId && panel !== 'design' ? 'is-active' : ''}`}
                onClick={() => {
                  setGuide(g.id)
                  setOpen(false)
                }}
              >
                <b>{g.title}</b>
                <span>{g.summary}</span>
              </button>
            ))}
            {!manual && (
              <>
                <div className="dropdown-sep" />
                <button className={`dropdown-item ${panel === 'design' ? 'is-active' : ''}`} onClick={() => { setPanel('design'); setOpen(false) }}>
                  <b>自定义设计</b>
                  <span>尺寸 · 材料 · 配件</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
