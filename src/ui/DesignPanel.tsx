import type { ReactNode } from 'react'
import { LIMITS, PRESETS, TOP_MATERIAL_NAMES, beamOptionsFor, type DeskConfig, type DeskModel } from '../domain/desk'
import { shaftFields, type AnyModel, type ShaftKind } from '../domain/products'
import { PROFILES, type ProfileId } from '../domain/profiles'
import type { FieldValue } from '../domain/shaft/common'
import { useApp } from '../store'
import { IconClose } from './icons'

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)} title={o.hint}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Num({ label, k, unit = 'mm', step = 10 }: { label: string; k: keyof typeof LIMITS; unit?: string; step?: number }) {
  const value = useApp((s) => s.config[k] as number)
  const setConfig = useApp((s) => s.setConfig)
  const [lo, hi] = LIMITS[k]
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        <span className="num-input">
          <input
            type="number"
            value={value}
            min={lo}
            max={hi}
            step={step}
            onChange={(e) => e.target.value && setConfig({ [k]: Number(e.target.value) } as Partial<DeskConfig>)}
          />
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={step}
        value={value}
        onChange={(e) => setConfig({ [k]: Number(e.target.value) } as Partial<DeskConfig>)}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel-section">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

function Toggle({ label, k, hint }: { label: string; k: 'cableTray' | 'backFrame' | 'slotCover'; hint?: string }) {
  const v = useApp((s) => s.config[k])
  const setConfig = useApp((s) => s.setConfig)
  return (
    <label className="switch-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={v} onChange={() => setConfig({ [k]: !v })} />
    </label>
  )
}

function Metrics({ model }: { model: AnyModel }) {
  return (
    <>
      <div className="metric-grid">
        {model.metrics.map((x) => (
          <div key={x.label} className={`metric ${x.level ? `is-${x.level}` : ''}`}>
            <small>{x.label}</small>
            <b>{x.value}</b>
            <span>{x.note}</span>
          </div>
        ))}
        <div className="metric">
          <small>总重</small>
          <b>{model.stats.weightKg.toFixed(1)}kg</b>
          <span>{model.product === 'desk' ? '含桌面' : model.product === 'rack' ? '光轴 + 夹具' : '含板材'}</span>
        </div>
        <div className="metric">
          <small>参考价</small>
          <b>¥{model.stats.priceCny}</b>
          <span>约 {model.stats.minutes} 分钟装完</span>
        </div>
      </div>
      {model.warnings.length > 0 && (
        <ul className="warnings">
          {model.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </>
  )
}

function PanelShell({ children }: { children: ReactNode }) {
  const setPanel = useApp((s) => s.setPanel)
  const setGuide = useApp((s) => s.setGuide)
  return (
    <aside className="panel">
      <div className="panel-head">
        <h3>自定义设计</h3>
        <button className="round small" onClick={() => setPanel('none')} aria-label="关闭"><IconClose /></button>
      </div>
      <div className="panel-body">{children}</div>
      <div className="panel-foot">
        <button className="btn ghost" onClick={() => setPanel('bom')}>零件清单</button>
        <button className="btn primary" onClick={() => setGuide('assembly')}>生成安装步骤 →</button>
      </div>
    </aside>
  )
}

function ShaftDesignPanel({ kind }: { kind: ShaftKind }) {
  const c = useApp((s) => s.shaft[kind]) as unknown as Record<string, FieldValue>
  const model = useApp((s) => s.model)
  const set = useApp((s) => s.setShaftConfig)
  const groups = shaftFields(kind)
  return (
    <PanelShell>
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.fields.filter((f) => !f.show || f.show(c as never)).map((f) => {
            const v = c[f.key]
            if (f.type === 'num') {
              return (
                <div className="field" key={f.key}>
                  <div className="field-head">
                    <label>{f.label}</label>
                    <span className="num-input">
                      <input type="number" value={Number(v)} min={f.min} max={f.max} step={f.step}
                        onChange={(e) => e.target.value && set({ [f.key]: Number(e.target.value) })} />
                      {f.unit ?? 'mm'}
                    </span>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={Number(v)} onChange={(e) => set({ [f.key]: Number(e.target.value) })} />
                </div>
              )
            }
            if (f.type === 'seg') {
              return (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <Segmented
                    value={String(v)}
                    options={f.options.map((o) => ({ value: String(o.value), label: o.label, hint: o.hint }))}
                    onChange={(s) => set({ [f.key]: typeof f.options[0].value === 'number' ? Number(s) : s })}
                  />
                </div>
              )
            }
            return (
              <label className="switch-row" key={f.key}>
                <span>{f.label}{f.hint && <small>{f.hint}</small>}</span>
                <input type="checkbox" checked={!!v} onChange={() => set({ [f.key]: !v })} />
              </label>
            )
          })}
        </Section>
      ))}
      <Section title="结构评估（经验估算）">
        <Metrics model={model} />
      </Section>
    </PanelShell>
  )
}

export function DesignPanel() {
  const product = useApp((s) => s.product)
  if (product === 'desk') return <DeskDesignPanel />
  if (product === 'shelf' || product === 'table' || product === 'rack') return <ShaftDesignPanel kind={product} />
  return null
}

function DeskDesignPanel() {
  const c = useApp((s) => s.config)
  const model = useApp((s) => s.model) as DeskModel
  const setConfig = useApp((s) => s.setConfig)
  const applyPreset = useApp((s) => s.applyPreset)
  const legOpts = (['3030', '4040', '4080'] as ProfileId[]).map((p) => ({ value: p, label: p, hint: PROFILES[p].note }))
  const beamOpts = beamOptionsFor(c.legProfile).map((p) => ({ value: p, label: p === '4080' ? '4080 竖放' : p, hint: PROFILES[p].note }))

  return (
    <PanelShell>
        <Section title="模板">
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button key={p.id} className="tag-btn" onClick={() => applyPreset(p.id)} title={p.desc}>{p.name}</button>
            ))}
          </div>
        </Section>

        <Section title="尺寸">
          <Num label="桌面宽" k="width" />
          <Num label="桌面进深" k="depth" />
          <Num label="桌面高度" k="height" step={5} />
          <Num label="桌面外伸" k="overhang" step={5} />
        </Section>

        <Section title="型材">
          <div className="field">
            <label>桌腿</label>
            <Segmented value={c.legProfile} options={legOpts} onChange={(v) => setConfig({ legProfile: v })} />
          </div>
          <div className="field">
            <label>横梁</label>
            <Segmented value={c.beamProfile} options={beamOpts} onChange={(v) => setConfig({ beamProfile: v })} />
          </div>
          <p className="field-note">{PROFILES[c.beamProfile].note}</p>
          <div className="field">
            <label>连接方式</label>
            <Segmented
              value={c.connector}
              options={[{ value: 'bracket', label: '角码', hint: '外露，免加工，新手首选' }, { value: 'internal', label: '内置连接件', hint: '隐藏式更美观，需要加工工艺孔' }]}
              onChange={(v) => setConfig({ connector: v })}
            />
          </div>
          <div className="field">
            <label>颜色</label>
            <Segmented value={c.color} options={[{ value: 'silver', label: '银色阳极' }, { value: 'black', label: '黑色阳极' }]} onChange={(v) => setConfig({ color: v })} />
          </div>
        </Section>

        <Section title="结构">
          <div className="field">
            <label>下横撑</label>
            <Segmented
              value={c.lowerBrace}
              options={[{ value: 'none', label: '无' }, { value: 'u', label: 'U 型', hint: '两侧 + 后方，不挡腿' }, { value: 'full', label: '四周', hint: '最稳，适合高桌' }]}
              onChange={(v) => setConfig({ lowerBrace: v })}
            />
          </div>
          {c.lowerBrace !== 'none' && <Num label="下横撑离地" k="braceHeight" />}
          <div className="field">
            <label>中间加强梁</label>
            <Segmented
              value={c.centerBeam}
              options={[{ value: 'auto', label: '自动', hint: '框架宽 > 1300mm 时自动添加' }, { value: 'on', label: '有' }, { value: 'off', label: '无' }]}
              onChange={(v) => setConfig({ centerBeam: v })}
            />
          </div>
          <div className="field">
            <label>脚</label>
            <Segmented
              value={c.feet}
              options={[{ value: 'leveler', label: '调节脚杯' }, { value: 'caster', label: '刹车脚轮' }]}
              onChange={(v) => setConfig({ feet: v })}
            />
          </div>
        </Section>

        <Section title="配件">
          <Toggle label="理线槽" k="cableTray" hint="挂在后横梁下方" />
          <Toggle label="后挂架" k="backFrame" hint="显示器 / 灯条 / 洞洞板" />
          {c.backFrame && <Num label="挂架高出桌面" k="backFrameHeight" />}
          <Toggle label="槽封条" k="slotCover" hint={`约 ${model.slotCoverM} 米`} />
        </Section>

        <Section title="桌面">
          <div className="field">
            <label>材质</label>
            <Segmented
              value={c.topMaterial}
              options={(Object.keys(TOP_MATERIAL_NAMES) as (keyof typeof TOP_MATERIAL_NAMES)[]).map((k) => ({ value: k, label: TOP_MATERIAL_NAMES[k] }))}
              onChange={(v) => setConfig({ topMaterial: v })}
            />
          </div>
          <Num label="板厚" k="topThickness" step={1} />
          <Num label="设计承重" k="loadKg" unit="kg" step={5} />
        </Section>

        <Section title="结构评估（经验估算）">
          <Metrics model={model} />
        </Section>
    </PanelShell>
  )
}
