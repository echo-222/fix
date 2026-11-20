import { useEffect } from 'react'
import { isManualProduct } from '../../domain/manual/library'
import type { ProductId } from '../../domain/types'
import { useApp } from '../../store'
import { lookFlags } from '../../three/LineArt'
import { spriteFlags } from '../../three/Scene'
import { SpriteCanvas } from '../../three/SpriteCanvas'

/**
 * 广场模型图渲染页（#/sprite/<产品>[/<指南>/<步>]），透明背景，给 scripts/plaza.mjs 截图。
 * 和封面页一样默认取第一个指南：安装类取最后一步，其他取第一步；真实外观打开，线稿换成柔光。
 */
export function SpriteView({ product, guide, step }: { product: string; guide?: string; step?: number }) {
  const ok = ['desk', 'shelf', 'table', 'rack'].includes(product) || isManualProduct(product)
  lookFlags.soft = true
  spriteFlags.hide = new URLSearchParams(location.hash.split('?')[1] ?? '').get('hide')?.split(',') ?? []
  useEffect(() => {
    if (!ok) return
    const app = useApp.getState()
    app.setProduct(product as ProductId)
    useApp.setState({ realLook: true, showGhost: false, showLabels: false, panel: 'none', playing: false })
    const s = useApp.getState()
    const g = s.guides.find((x) => x.id === guide) ?? s.guides[0]
    s.setGuide(g.id)
    useApp.getState().go(step ?? (g.kind === 'assembly' ? g.steps.length - 1 : 0))
    document.body.dataset.sprite = `${product}:${g.id}`
  }, [product, guide, step, ok])
  if (!ok) return <div className="sprite-stage">没有这份说明书：{product}</div>
  return (
    <div className="sprite-stage">
      <SpriteCanvas />
    </div>
  )
}
