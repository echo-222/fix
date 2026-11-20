import { useEffect } from 'react'
import type { FeedPost } from '../community/seed'
import { useCommunity } from '../community/store'
import { currentGuide, useApp } from '../store'
import { MainCanvas, useCurrentStep } from '../three/Scene'
import { BomPanel } from './BomPanel'
import { CalloutLayer } from './CalloutLayer'
import { NoteSheet } from './community/NotePanel'
import { PublishModal } from './community/PublishModal'
import { Controls } from './Controls'
import { DesignPanel } from './DesignPanel'
import { DetailInset } from './DetailInset'
import { ImportModal } from './ImportModal'
import { StepInfo } from './StepInfo'
import { TopBar } from './TopBar'

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
      const c = useCommunity.getState()
      if (e.key === 'ArrowRight') s.next()
      else if (e.key === 'ArrowLeft') s.prev()
      else if (e.key === ' ') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'Escape') {
        if (c.publishOpen) c.openPublish(false)
        else if (s.importOpen) s.toggle('importOpen')
        else if (s.panel !== 'none') s.setPanel(s.panel)
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

/** 说明书页面（点开一篇笔记看到的）：3D 演示、步骤、控制条（点赞 / 收藏 / 笔记 + 步骤条），笔记 / 评论从底部升起 */
export function ManualView({ post }: { post: FeedPost }) {
  useKeyboard()
  const panel = useApp((s) => s.panel)
  const importOpen = useApp((s) => s.importOpen)
  const publishOpen = useCommunity((s) => !!s.publishOpen)
  useEffect(() => () => useApp.getState().setPlaying(false), [])
  return (
    <div className="page">
      <div className="card">
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
        <Controls post={post} />
        <NoteSheet post={post} />
        {importOpen && <ImportModal />}
        {publishOpen && <PublishModal />}
      </div>
      <Autoplay />
    </div>
  )
}
