// 审计自检：npm run audit:selftest
// 在鼠标案例的副本里每次埋一个已知问题，确认对应的检查项会报出来。某项没报 = 审计本身坏了。
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let broken = 0
try {
  const { mouseBt54 } = await server.ssrLoadModule('/src/domain/manual/library/mouse-bt54.ts')
  const { compileManual } = await server.ssrLoadModule('/src/domain/manual/compile.ts')
  const { auditManual } = await server.ssrLoadModule('/src/domain/manual/audit.ts')

  const clone = () => structuredClone(mouseBt54)
  const part = (spec, id) => spec.parts.find((p) => p.id === id)
  const step = (spec, guide, id) => spec.guides.find((g) => g.id === guide).steps.find((s) => s.id === id)

  const controls = [
    ['floor', '拨钮凸出底面 1.6 mm', (s) => { s.initial['mode-knob'].at = [7.5, -0.8, -31] }],
    ['through', '鼠标放进笔记本机身里', (s) => { step(s, 'usb-a', 'top').set = { ...step(s, 'usb-a', 'top').set, mouse: { parent: null, at: [100, 0, -40] } } }],
    ['flight', '鼠标贴着桌面横穿笔记本', (s) => { step(s, 'usb-a', 'a-near').set.mouse = { parent: null, at: [-265, 0, -40], rot: [0, -60, 0], dur: 1.8 } }],
    ['plug', '两个接收器插进同一个口', (s) => { step(s, 'usb-a', 'plug-a').set['recv-c'] = { plug: 'port-la2' } }],
    ['view', '高亮的零件在镜头背后', (s) => { step(s, 'usb-a', 'take-a').camera = { target: [0, 60, -400], dir: [0, 0.2, -1], dist: 300 } }],
    ['zoom', '细节窗对准隐藏的零件', (s) => { step(s, 'usb-a', 'plug-a').zoom.target = 'booklet' }],
    ['led', '底部灯亮起但只从上方看、没有细节窗', (s) => { const x = step(s, 'usb-a', 'a-near'); x.zoom = undefined; x.camera = { target: 'mouse', dir: 'top', dist: 500 } }],
    ['callout', '标注标签飞出画面', (s) => { step(s, 'usb-a', 'bottom').callouts[0].offset = [900, 0, 0] }],
    ['mirror', '说明书封面文字 rot 写反（朝下），从上方看是反字', (s) => { part(s, 'booklet-title').rot = [90, 0, 0]; step(s, 'usb-a', 'unbox').zoom = { target: 'booklet-title', dir: 'top', dist: 150, caption: '' } }],
    ['step', '没有页码', (s) => { delete step(s, 'usb-a', 'take-a').page }],
  ]

  for (const [check, what, plant] of controls) {
    const spec = clone()
    plant(spec)
    const { model, guides } = compileManual(spec)
    const report = auditManual(model, guides)
    const hit = report.findings.filter((f) => f.check === check && f.severity !== 'note')
    if (hit.length) console.log(`  ✓ ${check.padEnd(8)} ${what} → ${hit[0].message}`)
    else {
      broken++
      console.log(`  ✗ ${check.padEnd(8)} ${what} → 没有报出来（审计失效）`)
    }
  }
} finally {
  await server.close()
}
console.log(broken ? `selftest failed: ${broken} checks did not fire` : 'selftest passed')
process.exit(broken ? 1 : 0)
