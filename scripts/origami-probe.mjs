// 折纸模拟自检：node scripts/origami-probe.mjs <id>
// 每一步的包围盒、翻动面数、过渡抬起高度、程序错误，以及成品左右是否对称（镜像误差）
import { createServer } from 'vite'

const id = process.argv[2] ?? 'origami-dart'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule(`/src/domain/manual/library/${id}.ts`)
  const { origamiBounds, origamiOf } = await server.ssrLoadModule('/src/domain/manual/origami.ts')
  const { Vector3 } = await server.ssrLoadModule('three')
  const spec = Object.values(mod).find((m) => m?.id === id)
  if (!spec) throw new Error(`没有 ${id}`)
  for (const part of spec.parts.filter((p) => p.shape.type === 'origami')) {
    const d = origamiOf(part.shape)
    console.log(`${part.id}: ${d.faces.length} 块面 · ${d.links.length} 段折痕 · ${d.marks.length} 个点 · ${d.steps} 步`)
    for (const e of d.errors) console.log('  错误', e)
    const f = (v) => `[${v.toArray().map((x) => x.toFixed(1)).join(', ')}]`
    for (let k = 0; k <= d.steps; k++) {
      const b = origamiBounds(d, k)
      console.log(`  #${k} ${part.shape.ops[k - 1]?.op ?? 'flat'} 动 ${d.moving[k].length} 抬 ${d.lifts[k]} min ${f(b.min)} max ${f(b.max)}`)
    }
    const last = d.frames[d.steps]
    const pts = []
    d.faces.forEach((face, i) => face.pts.forEach(([x, z]) => pts.push(new Vector3(x, 0.2, z).applyMatrix4(last[i]))))
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2
    let worst = 0
    for (const p of pts) {
      const m = new Vector3(2 * cx - p.x, p.y, p.z)
      worst = Math.max(worst, Math.min(...pts.map((q) => q.distanceTo(m))))
    }
    console.log(`  成品镜像误差（绕 x = ${cx.toFixed(1)}）：${worst.toFixed(2)} mm`)
  }
} finally {
  await server.close()
}
