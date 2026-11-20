#!/usr/bin/env node
// 外观模型参考图：把要做成几何体的按键、屏幕、指示灯按四周外壳的颜色抹平（manual-to-3d skill「一物一画」）。
//   node scripts/ref-cover.mjs <in.jpg> <out.jpg> x0,y0,x1,y1 [x0,y0,x1,y1 …]
// 坐标是像素，或全部 ≤ 1 时按图宽高的比例。只读 JPEG：PNG 先转（macOS：sips -s format jpeg in.png --out in.jpg）。
import { readFileSync, writeFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { coverBox } from '../server/refImage.ts'

const [input, output, ...specs] = process.argv.slice(2)
if (!input || !output || !specs.length) {
  console.error('用法：node scripts/ref-cover.mjs <in.jpg> <out.jpg> x0,y0,x1,y1 [x0,y0,x1,y1 …]')
  process.exit(1)
}
const buf = readFileSync(input)
if (buf[0] !== 0xff || buf[1] !== 0xd8) {
  console.error(`${input} 不是 JPEG：先转一下，比如 sips -s format jpeg ${input} --out ${input.replace(/\.\w+$/, '')}.jpg`)
  process.exit(1)
}
const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
for (const spec of specs) {
  const b = spec.split(',').map(Number)
  if (b.length !== 4 || b.some((v) => !Number.isFinite(v)) || b[2] <= b[0] || b[3] <= b[1]) {
    console.error(`框写错了：${spec}（要 x0,y0,x1,y1，x1 > x0、y1 > y0）`)
    process.exit(1)
  }
  const ratio = b.every((v) => v <= 1)
  coverBox(img, ratio ? [b[0] * img.width, b[1] * img.height, b[2] * img.width, b[3] * img.height] : b)
}
writeFileSync(output, jpeg.encode(img, 92).data)
console.log(`${output}：${img.width}×${img.height}，抹平 ${specs.length} 个框`)
