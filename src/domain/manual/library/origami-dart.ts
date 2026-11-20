import { Paper } from '../origami'
import type { FoldPoint, ManualSpec, SpecStep } from '../types'

/**
 * 经典飞镖纸飞机（Basic Dart）：A4 纸竖放，机头朝远离观众的方向（图解 +y），白面朝上开始折。
 * 折法、数字参考 Fold 'N Fly #1；机翼折到「和机身底边对齐」，所以机身高度 = 机翼宽度 = 半张纸宽的一半（52.5 mm）。
 * 最后机翼打开到比水平再高 10°（上反角），从后面看是浅浅的「Y」，飞起来更稳。
 */
const W = 210
const L = 297
const nose: FoldPoint = [0, L / 2]
const paper = new Paper({ size: [W, L], name: 'sheet', color: '#3d7fd6' })

const half = paper.fold([0, L / 2], [0, -L / 2], [-50, 0])
const crease = paper.unfold(half)
const cornerL = paper.bring([-W / 2, L / 2], [0, L / 2 - W / 2])
const cornerR = paper.bring([W / 2, L / 2], [0, L / 2 - W / 2])
// 斜边再折到中线：折线是斜边和中线的角平分线（和中线夹 22.5°）
const reach = (W / 2) / Math.tan((22.5 * Math.PI) / 180)
const edgeL = paper.fold(nose, [-W / 2, L / 2 - reach], [-W / 2 + 2, 0])
const edgeR = paper.fold(nose, [W / 2, L / 2 - reach], [W / 2 - 2, 0])
// 沿中线往后对折：左半边翻到右半边底下，折好的三角都在外面
const body = paper.fold([0, L / 2], [0, -L / 2], [-50, 0], { under: true })
const depth = W / 4
const wing: FoldPoint = [depth, -L / 2]
const wingTop = paper.fold(nose, wing, [W / 2 - 5, -L / 2 + 5], { only: { not: { moved: body } } })
const wingBottom = paper.fold(nose, wing, [W / 2 - 5, -L / 2 + 5], { only: { moved: body }, under: true })
// 拿起来：绕机身底边（中线折痕）立起来，再把两边机翼往回掰开 100°（比水平高 10°）
const stand = paper.stand(body)
const open = paper.rotate([
  { only: { moved: wingTop }, crease: wingTop, angle: -100 },
  { only: { moved: wingBottom }, crease: wingBottom, angle: -100 },
])

const all = paper.all()
const fold = (id: string, k: number, title: string, desc: string, extra: Partial<SpecStep> = {}): SpecStep => ({
  id, title, desc, camera: paper.view(k), set: paper.set(k), highlight: paper.movedIds(k), ...extra,
})

export const origamiDart: ManualSpec = {
  id: 'origami-dart',
  name: '经典飞镖纸飞机',
  desc: '一张 A4 纸、5 种折法，折出飞得又快又直的经典纸飞机，并学会试飞调整。',
  category: '折纸',
  genre: 'tutorial',
  dims: { width: 105, depth: 297, height: 53 },
  source: { title: "Fold 'N Fly · Basic Dart Paper Airplane", url: 'https://www.foldnfly.com/1.html', images: [] },
  package: [
    { name: 'A4 纸', qty: 1, spec: '210 × 297 mm，普通 70–80 g 打印纸' },
    { name: '回形针', qty: 1, spec: '可选：机头太飘时夹在机头下面配重' },
  ],
  params: [
    { label: '难度', value: '入门', note: '折歪了也能飞，适合第一次折纸飞机' },
    { label: '折数', value: '5 种折法 · 9 次' },
    { label: '机长 / 翼展', value: '约 29.5 cm / 11 cm', note: 'Fold \'N Fly 用 Letter 纸实测' },
    { label: '重心', value: '离机头约 15.7 cm', note: '捏在这里平衡；太靠后会失速，太靠前会扎地' },
    { label: '飞行', value: '约 12.5 m · 1.4 s', note: '10 岁小朋友平均投掷距离与滞空时间' },
  ],
  parts: paper.parts(),
  stageSize: 700,
  guides: [
    {
      id: 'fold',
      title: '折一架飞镖',
      kind: 'assembly',
      steps: [
        {
          id: 'sheet', title: '准备一张 A4 纸', desc: 'A4 纸竖着放，白面朝上，短边对着自己。下面每一步都沿红色的边折。',
          camera: paper.view(0, [0.3, 1, 0.9]), highlight: all,
          chips: [{ label: '纸张', sub: 'A4 · 210 × 297 mm' }],
        },
        fold('half', half, '左右对折', '沿长边对折：左半边翻到右半边上，边角对齐后压出中线。', { tip: '对折时先对齐两个角，再从中间往两头压，折痕才直。' }),
        fold('crease', crease, '打开，留下中线', '把纸重新摊开，中间留下一条竖直的折痕，后面都以它为基准。'),
        fold('corner-l', cornerL, '左上角折到中线', '左上角往中线折，折边从机头尖端斜向左边。', { chips: [{ label: '角度', sub: '45°' }] }),
        fold('corner-r', cornerR, '右上角折到中线', '右上角同样折到中线，顶部成为一个尖角。'),
        fold('edge-l', edgeL, '左斜边再折到中线', '把刚才折出的左斜边整条对齐中线再折一次，机头变得更尖。', { chips: [{ label: '角度', sub: '与中线 22.5°' }] }),
        fold('edge-r', edgeR, '右斜边再折到中线', '右边也一样，两边的折边在中线处碰齐，不要重叠。'),
        fold('body', body, '沿中线往后对折', '沿中线往后对折，让折好的三角都留在外面，得到窄长的机身。', { tip: '往后折（山折）：折好的部分朝外，机身底边就是中线折痕。' }),
        fold('wing-top', wingTop, '折下第一边机翼', '从机头尖端起，把上层沿斜线往下折，让机翼的边和机身底边对齐。', {
          chips: [{ label: '机身高度', sub: `机尾处约 ${depth.toFixed(1)} mm` }],
        }),
        fold('wing-bottom', wingBottom, '另一边机翼也折下来', '翻到另一面，用同一条线把另一边机翼折下来，两边要一样宽。'),
        fold('stand', stand, '拿起来', '捏住机身，让机身底边朝下立起来。'),
        fold('open', open, '展开机翼', '两边机翼往外掰开，比水平稍微翘起一点，从后面看像一个浅浅的「Y」字。', {
          camera: paper.view(open, [-0.55, 0.5, 1.1]), tip: '两边机翼要翘得一样高，歪的那边会让飞机往一侧偏。', orbit: true,
        }),
      ],
    },
    {
      id: 'fly',
      title: '试飞与调整',
      kind: 'usage',
      start: paper.state(open),
      steps: [
        {
          id: 'grip', title: '捏住重心附近', desc: '拇指和食指捏住机身下方、离机头约一半的位置，机翼保持水平。',
          camera: paper.view(open, [0.9, 0.45, 0.6]), highlight: all,
          chips: [{ label: '重心', sub: '离机头约 15.7 cm' }],
        },
        {
          id: 'throw', title: '平着用力推出去', desc: '对准正前方、稍微朝下一点，手臂平推出去。这架飞机机翼硬，可以用力扔。',
          camera: paper.view(open, [0.9, 0.45, 0.6], 1.6), highlight: all,
          actions: [{ type: 'slide', part: paper.carrier, axis: 'z', amp: -160, period: 2.4, clip: 'pos' }],
          tip: '不要往上扔：机头抬太高会失速，打个转就掉下来。',
        },
        {
          id: 'dive', title: '一扔就扎地', desc: '说明机头太重或者扔得太往下：投掷时手再平一点，或者把两边机翼后缘往上折起一点点。',
          camera: paper.view(open, [-0.6, 0.6, 1]), highlight: all,
        },
        {
          id: 'stall', title: '飞起来就打转掉下', desc: '机头太轻、重心偏后：在机头下方夹一个回形针配重，或者扔得更平一些。',
          camera: paper.view(open, [-0.6, 0.6, 1]), highlight: all,
          chips: [{ label: '配重', sub: '回形针 · 机头下方' }],
        },
        {
          id: 'veer', title: '总往一边偏', desc: '多半是两边机翼不一样平：从后面看，把偏向那一侧的机翼往上调平，直到两边对称。',
          camera: paper.view(open, [0, 0.35, 1.2]), highlight: all,
        },
      ],
    },
  ],
}
