import { useEffect } from 'react'
import { MainCanvas, useCurrentStep } from './three/Scene'
import { currentGuide, useApp } from './store'
import { BomPanel } from './ui/BomPanel'
import { CalloutLayer } from './ui/CalloutLayer'
import { Controls } from './ui/Controls'
import { DesignPanel } from './ui/DesignPanel'
import { DetailInset } from './ui/DetailInset'
import { ImportModal } from './ui/ImportModal'
import { MenuDrawer } from './ui/MenuDrawer'
import { StepInfo } from './ui/StepInfo'
import { TopBar } from './ui/TopBar'

const STEP_HOLD_MS = 4600

function Autoplay() {
  const playing = useApp((s) => s.playing)
  const stepIndex = useApp((s) => s.stepIndex)
  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => {
      const s = useApp.getState()
      const g = currentGuide(s)
      if (s.stepIndex >= g.steps.length - 1) s.setPlaying(false)
      else s.next()
    }, STEP_HOLD_MS)
    return () => clearTimeout(id)
  }, [playing, stepIndex])
  return null
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const s = useApp.getState()
      if (e.key === 'ArrowRight') s.next()
      else if (e.key === 'ArrowLeft') s.prev()
      else if (e.key === ' ') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'Escape') {
        if (s.importOpen) s.toggle('importOpen')
        else if (s.menuOpen) s.toggle('menuOpen')
        else if (s.panel !== 'none') s.setPanel('none')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function StepNumber() {
  const { guide, design, index } = useCurrentStep()
  if (design) return <div className="step-number is-design">设计<span>实时预览</span></div>
  return (
    <div className="step-number">
      {index + 1}
      <span>/ {guide.steps.length}</span>
    </div>
  )
}

export default function App() {
  useKeyboard()
  const panel = useApp((s) => s.panel)
  const importOpen = useApp((s) => s.importOpen)
  const menuOpen = useApp((s) => s.menuOpen)
  return (
    <div className="page">
      <div className="card">
        <div className="card-dash" aria-hidden />
        <TopBar />
        <main className="viewport">
          <MainCanvas />
          <CalloutLayer />
          <StepNumber />
          <DetailInset />
          <div className="hint">拖动旋转 · 滚轮或双指缩放</div>
          {panel === 'design' && <DesignPanel />}
          {panel === 'bom' && <BomPanel />}
        </main>
        <StepInfo />
        <Controls />
        {menuOpen && <MenuDrawer />}
        {importOpen && <ImportModal />}
      </div>
      <Autoplay />
    </div>
  )
}
