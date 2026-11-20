import { useEffect } from 'react'
import { isManualProduct } from '../../domain/manual/library'
import type { ProductId } from '../../domain/types'
import { useApp } from '../../store'
import { MainCanvas, sceneFlags } from '../../three/Scene'

/**
 * 封面渲染页（#/cover/<产品>[/<指南>/<步>[/<镜头距离倍数>]]），只有 3D 画面，给 scripts/covers.mjs 截图。
 * 默认取第一个指南：安装类取最后一步（装好的样子），其他取第一步；真实外观打开。
 */
export function CoverView({ product, guide, step, zoom }: { product: string; guide?: string; step?: number; zoom?: number }) {
  const ok = ['desk', 'shelf', 'table', 'rack'].includes(product) || isManualProduct(product)
  // 画布一直挂着，换产品不能放在 layout effect 里（drei 的 Html 会在提交阶段被同步卸载）
  useEffect(() => {
    if (!ok) return
    sceneFlags.cover = true
    sceneFlags.coverZoom = zoom ?? 1.2
    const app = useApp.getState()
    app.setProduct(product as ProductId)
    if (!useApp.getState().realLook) useApp.getState().toggle('realLook')
    const s = useApp.getState()
    const g = s.guides.find((x) => x.id === guide) ?? s.guides[0]
    s.setGuide(g.id)
    useApp.getState().go(step ?? (g.kind === 'assembly' ? g.steps.length - 1 : 0))
    useApp.setState({ panel: 'none', playing: false })
    document.body.dataset.cover = `${product}:${g.id}`
  }, [product, guide, step, zoom, ok])
  if (!ok) return <div className="cover-stage">没有这份说明书：{product}</div>
  return (
    <div className="cover-stage">
      <MainCanvas plain />
    </div>
  )
}
