import { PRESETS } from '../domain/desk'
import { isManualProduct } from '../domain/manual/library'
import { PRODUCTS } from '../domain/products'
import { useApp } from '../store'
import { IconBox, IconCamera, IconClose, IconList, IconRuler, IconWrench } from './icons'

export function MenuDrawer() {
  const guides = useApp((s) => s.guides)
  const guideId = useApp((s) => s.guideId)
  const source = useApp((s) => s.source)
  const showGhost = useApp((s) => s.showGhost)
  const toggle = useApp((s) => s.toggle)
  const setGuide = useApp((s) => s.setGuide)
  const setPanel = useApp((s) => s.setPanel)
  const applyPreset = useApp((s) => s.applyPreset)
  const product = useApp((s) => s.product)
  const setProduct = useApp((s) => s.setProduct)
  const manual = isManualProduct(product)
  const assembly = guides.filter((g) => g.kind !== 'repair')
  const repairs = guides.filter((g) => g.kind === 'repair')

  return (
    <div className="drawer-backdrop" onPointerDown={(e) => e.target === e.currentTarget && toggle('menuOpen')}>
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="brand">修理工</div>
            <small>3D 说明书 · 家具安装 / 电子产品使用 v0.3</small>
          </div>
          <button className="round small" onClick={() => toggle('menuOpen')} aria-label="关闭"><IconClose /></button>
        </div>

        <button className="cta" onClick={() => { toggle('menuOpen'); toggle('importOpen') }}>
          <IconCamera />
          <span>
            <b>拍照 / 上传说明书</b>
            <small>AI 解析后生成 3D 安装指导</small>
          </span>
        </button>

        <div className="drawer-section">
          <h4>当前：{source.title}</h4>
          {assembly.map((g) => (
            <button key={g.id} className={`menu-item ${g.id === guideId ? 'is-active' : ''}`} onClick={() => setGuide(g.id)}>
              <IconBox /> <span><b>{g.title}</b><small>{g.summary}</small></span>
            </button>
          ))}
          {repairs.map((g) => (
            <button key={g.id} className={`menu-item ${g.id === guideId ? 'is-active' : ''}`} onClick={() => setGuide(g.id)}>
              <IconWrench /> <span><b>{g.title}</b><small>{g.summary}</small></span>
            </button>
          ))}
          {!manual && (
            <button className="menu-item" onClick={() => setPanel('design')}>
              <IconRuler /> <span><b>自定义设计</b><small>尺寸 · 材料 · 配件 · 结构评估</small></span>
            </button>
          )}
          <button className="menu-item" onClick={() => setPanel('bom')}>
            {manual
              ? <><IconList /> <span><b>包装与参数</b><small>包装清单 · 基本参数 · 原说明书</small></span></>
              : <><IconList /> <span><b>零件清单</b><small>切割清单 · 五金 · 工具 · 导出</small></span></>}
          </button>
        </div>

        <div className="drawer-section">
          <h4>选择家具 / 说明书</h4>
          <div className="preset-grid">
            {PRODUCTS.map((p) => (
              <button key={p.id} className={`preset ${p.id === product ? 'is-active' : ''}`} onClick={() => setProduct(p.id)}>
                <em className="family">{p.family}</em>
                <b>{p.name}</b>
                <small>{p.desc}</small>
              </button>
            ))}
          </div>
        </div>

        {product === 'desk' && (
          <div className="drawer-section">
            <h4>书桌模板</h4>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button key={p.id} className="preset" onClick={() => { applyPreset(p.id); setGuide('assembly') }}>
                  <b>{p.name}</b>
                  <small>{p.desc}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-section">
          <h4>显示</h4>
          <label className="switch-row">
            <span>预览未安装的零件（浅灰线）</span>
            <input type="checkbox" checked={showGhost} onChange={() => toggle('showGhost')} />
          </label>
        </div>
        <p className="drawer-foot">快捷键：← → 切换步骤 · 空格 播放 / 暂停</p>
      </aside>
    </div>
  )
}
