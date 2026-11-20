import { useState } from 'react'
import { useCommunity } from '../../community/store'
import { openNote } from '../../router'
import { useApp } from '../../store'
import { IconCamera, IconClose, IconEdit } from '../icons'
import { PostForm } from './PostForm'

/** 发布入口：上传说明书生成 3D（走导入流程），或者写一篇关联某份说明书的使用笔记 */
export function PublishModal() {
  const open = useCommunity((s) => s.publishOpen)
  const openPublish = useCommunity((s) => s.openPublish)
  const preset = open ? open.product : undefined
  // 预选了说明书、或者从首页「+」菜单直接点了「发布笔记」：不再问一次二选一，取消就是关掉
  const direct = !!preset || (!!open && !!open.note)
  const [step, setStep] = useState<'choose' | 'note'>(direct ? 'note' : 'choose')
  const close = () => openPublish(false)

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>{step === 'choose' ? '发布' : '写一篇笔记'}</h3>
            <small>{step === 'choose' ? '分享一份 3D 说明书，或者你的使用经验' : '点开笔记的人会同时看到关联说明书的 3D 演示'}</small>
          </div>
          <button className="round small" onClick={close} aria-label="关闭"><IconClose /></button>
        </div>
        {step === 'choose' ? (
          <div className="modal-body publish-choices">
            <button
              className="choice"
              onClick={() => {
                close()
                if (!useApp.getState().importOpen) useApp.getState().toggle('importOpen')
              }}
            >
              <span className="choice-icon is-dark"><IconCamera /></span>
              <b>上传说明书，生成 3D 互动指导</b>
              <small>PDF 或拍照都行。AI 逐页读说明书、搭 3D 场景、写好每一步，再自动审计修正。生成后可以发布到社区。</small>
            </button>
            <button className="choice" onClick={() => setStep('note')}>
              <span className="choice-icon"><IconEdit /></span>
              <b>写一篇使用笔记</b>
              <small>技巧、避坑、故障是怎么修好的……关联一份已有的 3D 说明书，大家能对照着看。</small>
            </button>
          </div>
        ) : (
          <div className="modal-body">
            <PostForm
              product={preset}
              onCancel={direct ? close : () => setStep('choose')}
              onDone={(id) => {
                close()
                openNote(id)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
