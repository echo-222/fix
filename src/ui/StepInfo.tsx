import { useCurrentStep } from '../three/Scene'
import { useApp } from '../store'

export function StepInfo() {
  const { step, index, design, guide } = useCurrentStep()
  const model = useApp((s) => s.model)
  if (design) {
    const rods = model.cutList.reduce((s, c) => s + c.qty, 0)
    return (
      <section className="info">
        <div className="chips">
          <span className="chip"><i />{model.product === 'desk' ? '型材' : '光轴'} {rods} 根</span>
          <span className="chip"><i />总重 约 {model.stats.weightKg.toFixed(1)}kg</span>
          <span className="chip"><i />参考价 ¥{model.stats.priceCny}</span>
          {model.metrics.map((x) => (
            <span key={x.label} className={`chip is-${x.level ?? 'good'}`}><i />{x.label.replace(/（.*）/, '')} {x.note}</span>
          ))}
        </div>
        <h2>自定义设计</h2>
        <p>调整右侧参数，3D 模型、切割清单和安装步骤会实时重新生成。{model.warnings[0] ?? '当前配置没有发现结构问题。'}</p>
      </section>
    )
  }
  return (
    <section className="info" key={`${guide.id}-${index}`}>
      <div className="chips">
        {step.chips.map((c, i) => (
          <span className="chip" key={i}>
            <i />
            {c.label}
            {c.sub && <small>{c.sub}</small>}
          </span>
        ))}
      </div>
      <h2>
        {index + 1}. {step.title}
      </h2>
      <p>{step.desc}</p>
      {step.tip && <p className="tip">提示：{step.tip}</p>}
    </section>
  )
}
