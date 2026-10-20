// 校验所有说明书场景脚本：npm run check:manuals
// 用 Vite 加载 TS 源码，编译每份 ManualSpec，输出步骤统计与问题列表；有问题时退出码为 1。
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let failed = false
try {
  const { MANUALS } = await server.ssrLoadModule('/src/domain/manual/library/index.ts')
  const { compileManual } = await server.ssrLoadModule('/src/domain/manual/compile.ts')
  for (const spec of MANUALS) {
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
      for (const m of issues) console.log(`  ✗ ${m}`)
    } else console.log('  ✓ 校验通过')
  }
} finally {
  await server.close()
}
process.exit(failed ? 1 : 0)
