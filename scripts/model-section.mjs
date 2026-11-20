// 外观模型截面图：npm run model:section -- <glb> --rot 0,-90,0 --axes xy --window h0,h1,v0,v1 --slab d0,d1 [--width 900] [--step 0.005] [--out <png>]
// 和 model.crop / crop.cut 同一套比例：先按 rot（度，XYZ）转，再按整个模型的包围盒归一化到 0–1。
// --axes 是屏幕右、上对应的轴（xy / xz / zy …），剩下那根是深度轴，看的人在深度轴正方向；只画深度在 --slab 里的那一层，越近越黑。
// 用来量 crop 框：切口要横穿细杆（截面是闭合的一圈），框边别落在实体壁上。align: true 的模型这里不转正。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const args = process.argv.slice(2)
const flag = (name, d) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : d
}
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
const nums = (s) => s.split(',').map(Number)
if (!file || !flag('--window') || !flag('--slab')) {
  console.log('用法：npm run model:section -- <glb> --rot 0,-90,0 --axes xy --window h0,h1,v0,v1 --slab d0,d1 [--width 900] [--step 0.005] [--out <png>]')
  process.exit(1)
}
const rot = nums(flag('--rot', '0,0,0')).map((d) => (d * Math.PI) / 180)
const axes = flag('--axes', 'xy')
const [h0, h1, v0, v1] = nums(flag('--window'))
const [d0, d1] = nums(flag('--slab'))
const W = Number(flag('--width', '900'))
const step = Number(flag('--step', '0.01'))

// ---------- 读 GLB（含节点变换） ----------
const buf = readFileSync(file)
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
const bin = buf.subarray(20 + jsonLen + 8)
const SIZE = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }
const GET = { 5126: (o) => bin.readFloatLE(o), 5125: (o) => bin.readUInt32LE(o), 5123: (o) => bin.readUInt16LE(o), 5121: (o) => bin[o] }
function read(index, comps) {
  const acc = gltf.accessors[index]
  const view = gltf.bufferViews[acc.bufferView]
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const stride = view.byteStride ?? SIZE[acc.componentType] * comps
  const rows = []
  for (let i = 0; i < acc.count; i++) {
    const row = []
    for (let k = 0; k < comps; k++) row.push(GET[acc.componentType](start + i * stride + k * SIZE[acc.componentType]))
    rows.push(row)
  }
  return rows
}
/** 列主序 4×4 */
const mul = (a, b) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function local(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const [ax, ay, az] = rot
const rx = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)]
const ry = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]
const rz = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]]
const pts = []
const tris = []
function visit(index, parent) {
  const node = gltf.nodes[index]
  const m = mul(parent, local(node))
  if (node.mesh != null) {
    for (const p of gltf.meshes[node.mesh].primitives) {
      const base = pts.length
      for (const [x, y, z] of read(p.attributes.POSITION, 3)) {
        const w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
        pts.push(rx(ry(rz(w, az), ay), ax))
      }
      const idx = p.indices != null ? read(p.indices, 1).map((r) => r[0]) : [...Array(pts.length - base).keys()]
      for (let i = 0; i + 2 < idx.length; i += 3) tris.push([base + idx[i], base + idx[i + 1], base + idx[i + 2]])
    }
  }
  for (const c of node.children ?? []) visit(c, m)
}
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
for (const n of gltf.scenes[gltf.scene ?? 0].nodes) visit(n, I)

// ---------- 撒点投影 ----------
const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])))
const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])))
const span = max.map((v, k) => v - min[k])
const norm = pts.map((p) => p.map((c, k) => (c - min[k]) / span[k]))
const h = 'xyz'.indexOf(axes[0])
const v = 'xyz'.indexOf(axes[1])
const d = 3 - h - v
const H = Math.round((W * (v1 - v0) * span[v]) / ((h1 - h0) * span[h]))
const depth = new Float32Array(W * H).fill(-1)
const cell = (h1 - h0) / W
let seed = 1
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
for (const [a, b, c] of tris) {
  const A = norm[a], B = norm[b], C = norm[c]
  const ext = Math.max(Math.abs(A[h] - B[h]), Math.abs(A[h] - C[h]), Math.abs(A[v] - B[v]), Math.abs(A[v] - C[v]))
  const n = Math.min(4000, Math.max(3, Math.ceil((ext / cell) ** 2 * 2)))
  for (let s = 0; s < n; s++) {
    let u = rand(), w = rand()
    if (u + w > 1) [u, w] = [1 - u, 1 - w]
    const P = [0, 1, 2].map((k) => A[k] + u * (B[k] - A[k]) + w * (C[k] - A[k]))
    if (P[d] < d0 || P[d] > d1 || P[h] < h0 || P[h] > h1 || P[v] < v0 || P[v] > v1) continue
    const x = Math.min(W - 1, Math.floor(((P[h] - h0) / (h1 - h0)) * W))
    const y = Math.min(H - 1, Math.floor((1 - (P[v] - v0) / (v1 - v0)) * H))
    const t = (P[d] - d0) / (d1 - d0)
    if (t > depth[y * W + x]) depth[y * W + x] = t
  }
}

// ---------- 画网格、刻度，写 PNG ----------
const PAD = 44
const OW = PAD + W + 24
const OH = H + 20
const rgb = new Uint8Array(OW * OH * 3).fill(255)
const dot = (x, y, c) => {
  if (x < 0 || y < 0 || x >= OW || y >= OH) return
  rgb.set(c, (y * OW + x) * 3)
}
/** 3×5 点阵数字 */
const GLYPH = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  '.': '000000000000010', '-': '000000111000000',
}
const text = (s, x, y, c) => {
  for (const ch of s) {
    const g = GLYPH[ch]
    if (g) for (let k = 0; k < 15; k++) if (g[k] === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) dot(x + (k % 3) * 2 + dx, y + Math.floor(k / 3) * 2 + dy, c)
    x += 8
  }
}
const ticks = (a, b) => {
  const out = []
  for (let k = Math.ceil(a / step - 1e-9); k * step <= b + 1e-9; k++) out.push([k * step, k % 5 === 0])
  return out
}
const label = (t) => t.toFixed(step < 0.01 ? 3 : 2)
for (const [t, major] of ticks(h0, h1)) {
  const x = PAD + Math.round(((t - h0) / (h1 - h0)) * (W - 1))
  for (let y = 0; y < H; y++) dot(x, y, major ? [255, 120, 120] : [255, 210, 210])
  if (major) text(label(t), x - 14, H + 6, [190, 0, 0])
}
for (const [t, major] of ticks(v0, v1)) {
  const y = Math.round((1 - (t - v0) / (v1 - v0)) * (H - 1))
  for (let x = PAD; x < PAD + W; x++) dot(x, y, major ? [120, 120, 255] : [210, 210, 255])
  if (major) text(label(t), 1, y - 5, [0, 0, 190])
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = depth[y * W + x]
    if (t < 0) continue
    const g = Math.round(20 + 190 * (1 - t))
    dot(PAD + x, y, [g, g, g])
  }
}
const raw = Buffer.alloc(OH * (OW * 3 + 1))
for (let y = 0; y < OH; y++) Buffer.from(rgb.buffer, y * OW * 3, OW * 3).copy(raw, y * (OW * 3 + 1) + 1)
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(OW, 0)
ihdr.writeUInt32BE(OH, 4)
ihdr.set([8, 2, 0, 0, 0], 8)
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])

const segs = resolve(file).split('/')
const owner = segs[segs.lastIndexOf('models') + 1] ?? basename(dirname(resolve(file)))
const out = resolve(flag('--out', join('shots', 'model-section', `${owner}-${basename(file, '.glb')}-${axes}.png`)))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`  ${out}  ${OW}×${OH}`)
console.log(`  右 = ${axes[0]} ${h0}–${h1}，上 = ${axes[1]} ${v0}–${v1}，深度 ${'xyz'[d]} ${d0}–${d1}（看的人在 +${'xyz'[d]}，越近越黑）· 红 / 蓝粗线每 ${+(step * 5).toFixed(4)} · 包围盒 ${span.map((s) => (s * 1000).toFixed(0)).join(' × ')} mm`)
