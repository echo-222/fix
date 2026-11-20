// 查看 GLB：npm run model:info -- public/models/<id>/<name>.glb [...]
// 列出每个网格节点的名字、面数、包围盒尺寸（GLB 单位是米，这里换成 mm），用来定 model.rot / 选分割节点 / 核对比例。
// 包围盒取 POSITION 访问器的 min / max；另对顶点做主成分分析：生成结果常是斜着摆的展示角度，主轴偏离坐标轴时提示用 align。
import { readFileSync, statSync } from 'node:fs'

/** 3×3 对称矩阵的特征分解（Jacobi），返回按特征值从大到小的 { value, dir } */
function eigen(a) {
  a = a.map((r) => r.slice())
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 32; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue
      const t = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p])
      const c = Math.cos(t)
      const s = Math.sin(t)
      for (let k = 0; k < 3; k++) [a[k][p], a[k][q]] = [c * a[k][p] - s * a[k][q], s * a[k][p] + c * a[k][q]]
      for (let k = 0; k < 3; k++) [a[p][k], a[q][k]] = [c * a[p][k] - s * a[q][k], s * a[p][k] + c * a[q][k]]
      for (let k = 0; k < 3; k++) [v[k][p], v[k][q]] = [c * v[k][p] - s * v[k][q], s * v[k][p] + c * v[k][q]]
    }
  }
  return [0, 1, 2].map((i) => ({ value: a[i][i], dir: [v[0][i], v[1][i], v[2][i]] })).sort((x, y) => y.value - x.value)
}

function principal(points) {
  const n = points.length
  const m = [0, 0, 0]
  for (const p of points) for (let k = 0; k < 3; k++) m[k] += p[k] / n
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of points) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) c[r][k] += (p[r] - m[r]) * (p[k] - m[k])
  return eigen(c).map(({ dir }) => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      const d = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    const off = Math.acos(Math.min(1, Math.max(...dir.map(Math.abs)))) * 180 / Math.PI
    return { dir, extent: (hi - lo) * 1000, off }
  })
}

// --slice <x|y|z>：沿该轴切 25 片，列出每片另外两轴的截面范围。生成时多出来的线缆 / 底座截面明显变小，
// 照着这张表定 model.crop（注意 crop 的比例按 rot 之后的零件轴算，要换算一下方向）
const args = process.argv.slice(2)
const sliceAt = args.indexOf('--slice')
const sliceAxis = sliceAt >= 0 ? 'xyz'.indexOf(args[sliceAt + 1]) : -1
const files = args.filter((a, i) => !a.startsWith('--') && (sliceAt < 0 || i !== sliceAt + 1))
if (!files.length || (sliceAt >= 0 && sliceAxis < 0)) {
  console.log('用法：npm run model:info -- <file.glb> [...] [--slice x|y|z]')
  process.exit(1)
}

const mul = (a, b) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
const trs = (n) => {
  if (n.matrix) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const mm = (v) => Math.round(v * 1000)

for (const file of files) {
  const buf = readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'glTF') {
    console.log(`${file}：不是 GLB`)
    continue
  }
  const len = buf.readUInt32LE(12)
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + len))
  const bin = buf.subarray(20 + len + 8)
  const points = []
  const sample = (acc, m) => {
    const view = gltf.bufferViews[acc.bufferView]
    if (acc.componentType !== 5126 || !view || view.buffer !== 0) return
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    const stride = view.byteStride ?? 12
    const step = Math.max(1, Math.ceil(acc.count / 50000))
    for (let i = 0; i < acc.count; i += step) {
      const o = start + i * stride
      points.push(apply(m, [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]))
    }
  }
  const rows = []
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: 0 }
  const visit = (idx, parent, path) => {
    const n = gltf.nodes[idx]
    const m = mul(parent, trs(n))
    const name = n.name ?? `node${idx}`
    if (n.mesh !== undefined) {
      const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
      let faces = 0
      for (const p of gltf.meshes[n.mesh].primitives) {
        const acc = gltf.accessors[p.attributes.POSITION]
        faces += p.indices !== undefined ? gltf.accessors[p.indices].count / 3 : acc.count / 3
        sample(acc, m)
        const [a, b] = [acc.min, acc.max]
        for (let k = 0; k < 8; k++) {
          const w = apply(m, [k & 1 ? b[0] : a[0], k & 2 ? b[1] : a[1], k & 4 ? b[2] : a[2]])
          for (let j = 0; j < 3; j++) {
            box.min[j] = Math.min(box.min[j], w[j])
            box.max[j] = Math.max(box.max[j], w[j])
            all.min[j] = Math.min(all.min[j], w[j])
            all.max[j] = Math.max(all.max[j], w[j])
          }
        }
      }
      all.faces += faces
      rows.push({ name: [...path, name].join(' / '), faces, box })
    }
    for (const c of n.children ?? []) visit(c, m, [...path, name])
  }
  for (const r of gltf.scenes[gltf.scene ?? 0].nodes) visit(r, I, [])
  const size = (b) => b.min.map((v, j) => mm(b.max[j] - v))
  const center = (b) => b.min.map((v, j) => mm((b.max[j] + v) / 2))
  console.log(`${file}  ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB · ${rows.length} 个网格 · ${all.faces} 面 · 贴图 ${gltf.images?.length ?? 0} 张`)
  console.log(`  整体 x×y×z = ${size(all).join(' × ')} mm（GLB 原始单位按米换算）`)
  if (points.length > 10) {
    // 两根主轴差不多长（方形截面）时主轴方向不确定，所以按体积判断：转到主轴后包围盒明显变小才算斜放
    const axes = principal(points)
    const obb = axes.reduce((v, a) => v * a.extent, 1)
    const aabb = size(all).reduce((v, s) => v * s, 1)
    if (aabb > obb * 1.18) {
      console.log(`  ⚠ 模型是斜着摆的（偏离坐标轴约 ${Math.max(...axes.map((a) => a.off)).toFixed(0)}°）：零件上写 model.align: true 先转正`)
      console.log(`    转正后尺寸（长 → 短）${axes.map((a) => Math.round(a.extent)).join(' × ')} mm，主轴 ${axes.map((a) => `[${a.dir.map((v) => v.toFixed(2)).join(', ')}]`).join(' ')}`)
    }
  }
  for (const r of rows) console.log(`  - ${r.name}  ${r.faces} 面  尺寸 ${size(r.box).join(' × ')}  中心 [${center(r.box).join(', ')}]`)
  if (sliceAxis >= 0 && points.length) slices(points, sliceAxis, all)
}

function slices(points, k, all) {
  const N = 25
  const [a, b] = [0, 1, 2].filter((j) => j !== k)
  const lo = all.min[k]
  const span = all.max[k] - lo
  const full = [all.max[a] - all.min[a], all.max[b] - all.min[b]]
  console.log(`  沿 ${'xyz'[k]} 切片（位置 = 占包围盒的比例；截面 = ${'xyz'[a]} / ${'xyz'[b]} 范围占整体的比例）：`)
  for (let s = 0; s < N; s++) {
    const q = points.filter((p) => Math.min(N - 1, Math.floor(((p[k] - lo) / span) * N)) === s)
    const pct = (v) => `${Math.round(v * 100)}%`.padStart(4)
    if (!q.length) {
      console.log(`    ${pct(s / N)}–${pct((s + 1) / N)}  （空）`)
      continue
    }
    const ext = [a, b].map((j, i) => (Math.max(...q.map((p) => p[j])) - Math.min(...q.map((p) => p[j]))) / full[i])
    const bar = '█'.repeat(Math.round(ext[0] * ext[1] * 20))
    console.log(`    ${pct(s / N)}–${pct((s + 1) / N)}  ${pct(ext[0])} × ${pct(ext[1])}  ${bar}`)
  }
}
