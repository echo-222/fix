// 校验并审计所有说明书场景脚本：npm run check:manuals [-- <id>]
// 用 Vite 加载 TS 源码，编译每份 ManualSpec（引用 / 父子 / 字段校验），再跑场景审计（穿地、穿插、插接、镜头、指示灯、标注……）。
// 任何 problem 都会让退出码为 1；warnings 和 notes 要逐条看过。
// 网页导入的说明书（public/imported/<id>/spec.json）一并检查。
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'vite'

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let failed = false
try {
  const { MANUALS: LIBRARY } = await server.ssrLoadModule('/src/domain/manual/library/index.ts')
  const index = 'public/imported/index.json'
  const imported = existsSync(index)
    ? JSON.parse(readFileSync(index, 'utf8')).manuals.map((m) => JSON.parse(readFileSync(`public/imported/${m.id}/spec.json`, 'utf8')))
    : []
  const MANUALS = [...LIBRARY, ...imported]
  const { compileManual } = await server.ssrLoadModule('/src/domain/manual/compile.ts')
  const { auditManual, formatReport } = await server.ssrLoadModule('/src/domain/manual/audit.ts')
  for (const spec of MANUALS) {
    if (only.length && !only.includes(spec.id)) continue
    const { model, guides } = compileManual(spec)
    const issues = [...model.issues]
    for (const g of guides) {
      for (const [i, s] of g.steps.entries()) {
        const where = `${g.id} #${i + 1} ${s.id}`
        if (![...s.focus, s.view.dist, ...s.view.dir].every(Number.isFinite)) issues.push(`${where}：镜头参数不是有效数字`)
        if (!s.desc) issues.push(`${where}：缺少说明文字`)
        const vis = Object.values(s.scene.to).filter((f) => f.visible).length
        if (!vis) issues.push(`${where}：没有可见零件`)
      }
    }
    const steps = guides.reduce((n, g) => n + g.steps.length, 0)
    console.log(`${spec.id}  ${spec.name}  零件 ${spec.parts.length} · 指南 ${guides.length} · 步骤 ${steps}`)
    for (const g of guides) console.log(`  - [${g.kind}] ${g.title}：${g.summary}`)
    if (issues.length) {
      failed = true
      console.log('  脚本校验：')
      for (const m of issues) console.log(`    ✗ ${m}`)
      continue
    }
    console.log('  脚本校验：通过')
    const started = performance.now()
    const report = auditManual(model, guides)
    console.log('  场景审计：')
    for (const line of formatReport(report)) console.log(line)
    console.log(`  （${((performance.now() - started) / 1000).toFixed(1)} s）`)
    if (report.errors) failed = true
  }
} finally {
  await server.close()
}
process.exit(failed ? 1 : 0)
