import { useState } from 'react'
import type { DeskModel } from '../domain/desk'
import type { ManualModel } from '../domain/manual/compile'
import { isManualModel, type AnyModel } from '../domain/products'
import { useApp } from '../store'
import { IconClose } from './icons'

type Tab = 'cut' | 'hw' | 'tools' | 'manual'

function ManualPanel({ model }: { model: ManualModel }) {
  const setPanel = useApp((s) => s.setPanel)
  const [tab, setTab] = useState<'pkg' | 'params' | 'pages'>('pkg')
  const spec = model.spec
  return (
    <aside className="panel">
      <div className="panel-head">
        <h3>包装与参数</h3>
        <button className="round small" onClick={() => setPanel('none')} aria-label="关闭"><IconClose /></button>
      </div>
      <div className="tabs">
        <button className={tab === 'pkg' ? 'is-on' : ''} onClick={() => setTab('pkg')}>包装清单</button>
        <button className={tab === 'params' ? 'is-on' : ''} onClick={() => setTab('params')}>基本参数</button>
        <button className={tab === 'pages' ? 'is-on' : ''} onClick={() => setTab('pages')}>原说明书</button>
      </div>
      <div className="panel-body">
        {tab === 'pkg' && (
          <table className="bom">
            <thead><tr><th>名称</th><th>说明</th><th>数量</th></tr></thead>
            <tbody>
              {spec.package.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td><small className="inline">{p.spec ?? ''}</small></td>
                  <td className="mono">×{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'params' && (
          <table className="bom">
            <tbody>
              {spec.params.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{p.value}{p.note && <small>{p.note}</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'pages' && (
          <div className="manual-pages">
            {spec.source.images.map((img) => (
              <figure key={img.src}>
                <a href={img.src} target="_blank" rel="noreferrer"><img src={img.src} alt={img.pages} /></a>
                <figcaption>{img.pages}</figcaption>
              </figure>
            ))}
            <p className="field-note">每一步的「说明书 第 N 页」标签对应这里的原文页码。</p>
          </div>
        )}
        {model.issues.length > 0 && (
          <div className="field-note is-warn">脚本校验问题：{model.issues.join('；')}</div>
        )}
      </div>
    </aside>
  )
}

export function BomPanel() {
  const model = useApp((s) => s.model)
  if (isManualModel(model)) return <ManualPanel model={model} />
  return <FurnitureBom model={model} />
}

function FurnitureBom({ model }: { model: Exclude<AnyModel, ManualModel> }) {
  const source = useApp((s) => s.source)
  const setPanel = useApp((s) => s.setPanel)
  const [tab, setTab] = useState<Tab>('cut')
  const [copied, setCopied] = useState(false)
  const { width, depth, height } = model.dims
  const isDesk = model.product === 'desk'

  // 商家按「型材 + 长度」下料，同长度的不同用途合并成一行
  const byLength = new Map<string, { profile: string; length: number; qty: number; names: string[]; notes: string[] }>()
  for (const i of model.cutList) {
    const k = `${i.profile}-${i.length}`
    const row = byLength.get(k) ?? { profile: i.profile, length: i.length, qty: 0, names: [], notes: [] }
    row.qty += i.qty
    row.names.push(i.name)
    if (i.note) row.notes.push(i.note)
    byLength.set(k, row)
  }
  const text = [
    `${model.name}  ${Math.round(width)}×${Math.round(depth)}×${Math.round(height)}mm${model.product === 'desk' ? `  ${(model as DeskModel).config.color === 'black' ? '黑色' : '银色'}阳极氧化` : ''}`,
    '',
    `【${model.cutTitle.replace(/（/, '】（')}`,
    ...[...byLength.values()].map((r) => `${r.profile}  ${r.length}mm × ${r.qty}  ${r.names.join(' / ')}${r.notes.length ? `（${r.notes.join('；')}）` : ''}`),
    '',
    '【五金配件】',
    ...model.hardware.map((h) => `${h.name}  ${h.spec} × ${h.qty}${h.unit ?? ''}`),
    '',
    '【工具】',
    ...model.tools,
  ].join('\n')

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const blob = new Blob([JSON.stringify({ product: model.product, config: model.config, cutList: model.cutList, hardware: model.hardware, metrics: model.metrics, warnings: model.warnings }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${model.name}-${Math.round(width)}x${Math.round(depth)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const totalLen = model.cutList.reduce((s, i) => s + i.length * i.qty, 0)
  return (
    <aside className="panel">
      <div className="panel-head">
        <h3>零件清单</h3>
        <button className="round small" onClick={() => setPanel('none')} aria-label="关闭"><IconClose /></button>
      </div>
      <div className="tabs">
        <button className={tab === 'cut' ? 'is-on' : ''} onClick={() => setTab('cut')}>{isDesk ? '型材切割' : '光轴切割'}</button>
        <button className={tab === 'hw' ? 'is-on' : ''} onClick={() => setTab('hw')}>五金配件</button>
        <button className={tab === 'tools' ? 'is-on' : ''} onClick={() => setTab('tools')}>工具</button>
        {source.manualSteps && <button className={tab === 'manual' ? 'is-on' : ''} onClick={() => setTab('manual')}>原说明书</button>}
      </div>
      <div className="panel-body">
        {tab === 'cut' && (
          <>
            <table className="bom">
              <thead><tr><th>名称</th><th>{isDesk ? '型材' : '规格'}</th><th>长度</th><th>数量</th></tr></thead>
              <tbody>
                {model.cutList.map((i) => (
                  <tr key={i.key}>
                    <td>{i.name}{i.note && <small>{i.note}</small>}</td>
                    <td>{i.profile}</td>
                    <td className="mono">{i.length}</td>
                    <td className="mono">×{i.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="field-note">合计 {(totalLen / 1000).toFixed(2)} 米。{model.cutNote}</p>
          </>
        )}
        {tab === 'hw' && (
          <table className="bom">
            <thead><tr><th>名称</th><th>规格</th><th>数量</th></tr></thead>
            <tbody>
              {model.hardware.map((h) => (
                <tr key={h.key}>
                  <td>{h.name}</td>
                  <td><small className="inline">{h.spec}</small></td>
                  <td className="mono">{h.qty}{h.unit ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'tools' && (
          <ul className="tool-list">
            {model.tools.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        {tab === 'manual' && source.manualSteps && (
          <ol className="manual-steps">
            {source.manualSteps.map((s, i) => <li key={i}><b>{s.title}</b>{s.detail && <span>{s.detail}</span>}</li>)}
          </ol>
        )}
      </div>
      <div className="panel-foot">
        <button className="btn ghost" onClick={download}>导出 JSON</button>
        <button className="btn primary" onClick={copy}>{copied ? '已复制 ✓' : '复制清单（可发给商家）'}</button>
      </div>
    </aside>
  )
}
