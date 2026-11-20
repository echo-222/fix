import { useEffect, useRef, useState, type RefObject } from 'react'
import { hasRealLook, type ManualModel } from '../domain/manual/compile'
import { isManualProduct } from '../domain/manual/library'
import { goHome } from '../router'
import { currentGuide, useApp } from '../store'
import { IconChevron, IconLeft, IconSliders } from './icons'

/** 点在弹层外面就收起 */
function useDismiss(ref: RefObject<HTMLDivElement | null>, open: boolean, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open, ref, setOpen])
}

function DisplaySettings() {
  const realLook = useApp((s) => s.realLook)
  const showGhost = useApp((s) => s.showGhost)
  const showDetail = useApp((s) => s.showDetail)
  const showLabels = useApp((s) => s.showLabels)
  const toggle = useApp((s) => s.toggle)
  const manual = useApp((s) => isManualProduct(s.product))
  const hasLook = useApp((s) => isManualProduct(s.product) && hasRealLook(s.model as ManualModel))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, setOpen)
  const real = hasLook && realLook
  const setReal = (v: boolean) => v !== realLook && toggle('realLook')

  return (
    <div className="dropdown" ref={ref}>
      <button className={`pill ${open ? 'is-dark' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <IconSliders width={15} height={15} />
        <span className="pill-label">设置</span>
      </button>
      {open && (
        <div className="dropdown-menu settings-menu">
          <div className="settings-label">展示方式</div>
          <div className="seg" role="radiogroup" aria-label="展示方式">
            <button role="radio" aria-checked={!real} className={!real ? 'is-on' : ''} onClick={() => setReal(false)}>线稿</button>
            <button role="radio" aria-checked={real} className={real ? 'is-on' : ''} disabled={!hasLook} onClick={() => setReal(true)}>写实</button>
          </div>
          {!hasLook && <p className="settings-note">这一份暂时只有线稿</p>}
          <div className="dropdown-sep" />
          <label className="switch-row">
            <span>浅灰线<small>提前显示还没装上的零件</small></span>
            <input type="checkbox" checked={showGhost} onChange={() => toggle('showGhost')} />
          </label>
          <label className="switch-row">
            <span>细节放大窗<small>右上角圆窗放大接口和卡扣</small></span>
            <input type="checkbox" checked={showDetail} onChange={() => toggle('showDetail')} />
          </label>
          {!manual && (
            <label className="switch-row">
              <span>零件标签<small>在 3D 里标出零件名称和规格</small></span>
              <input type="checkbox" checked={showLabels} onChange={() => toggle('showLabels')} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const source = useApp((s) => s.source)
  const guides = useApp((s) => s.guides)
  const guideId = useApp((s) => s.guideId)
  const panel = useApp((s) => s.panel)
  const setGuide = useApp((s) => s.setGuide)
  const setPanel = useApp((s) => s.setPanel)
  const dims = useApp((s) => s.model.dims)
  const manual = useApp((s) => isManualProduct(s.product))
  const tutorial = useApp((s) => isManualProduct(s.product) && (s.model as ManualModel).spec.genre === 'tutorial')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, setOpen)
  const guide = currentGuide({ guides, guideId })
  const bomTitle = tutorial ? '材料与要点' : manual ? '包装与参数' : '零件清单'
  const pick = (p: 'design' | 'bom') => {
    if (panel !== p) setPanel(p)
    setOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="round small back" onClick={goHome} aria-label="返回社区" title="返回社区">
          <IconLeft />
        </button>
        <DisplaySettings />
        <div className="product-title">
          <b>{source.title}</b>
          <span>{Math.round(dims.width)}×{Math.round(dims.depth)}×{Math.round(dims.height)}</span>
          {source.kind !== 'custom' && <em className={`badge ${source.kind}`}>{source.kind === 'ai' ? 'AI 导入' : '示例导入'}</em>}
        </div>
      </div>
      <div className="topbar-right">
        <div className="dropdown" ref={ref}>
          <button className="pill guide-pill" onClick={() => setOpen(!open)}>
            <span className="pill-text">{panel === 'design' ? '自定义设计' : panel === 'bom' ? bomTitle : guide.title}</span>
            <IconChevron width={15} height={15} />
          </button>
          {open && (
            <div className="dropdown-menu">
              {guides.map((g) => (
                <button
                  key={g.id}
                  className={`dropdown-item ${g.id === guideId && panel !== 'design' && panel !== 'bom' ? 'is-active' : ''}`}
                  onClick={() => {
                    setGuide(g.id)
                    setOpen(false)
                  }}
                >
                  <b>{g.title}</b>
                  <span>{g.summary}</span>
                </button>
              ))}
              <div className="dropdown-sep" />
              {!manual && (
                <button className={`dropdown-item ${panel === 'design' ? 'is-active' : ''}`} onClick={() => pick('design')}>
                  <b>自定义设计</b>
                  <span>尺寸 · 材料 · 配件</span>
                </button>
              )}
              <button className={`dropdown-item ${panel === 'bom' ? 'is-active' : ''}`} onClick={() => pick('bom')}>
                <b>{bomTitle}</b>
                <span>{tutorial ? '材料 · 要点 · 参考资料' : manual ? '包装清单 · 基本参数 · 原说明书' : '切割清单 · 五金 · 工具 · 导出'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
