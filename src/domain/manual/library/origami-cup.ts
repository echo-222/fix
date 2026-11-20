import { Paper } from '../origami'
import type { FoldSelect, ManualSpec, SpecStep, Vec3 } from '../types'

/**
 * 传统折纸杯：15 cm 正方形折纸，白面朝上、摆成菱形开始折，折完彩色面在杯子外面，前片露出白面。
 * 折法、顺序参考 Origami Diagrams「Paper Cup」（5 折）：先右角、后左角，第一片折过去的上沿要和杯底平行。
 * 坐标：图解坐标 [x, y]（俯视，y 朝远离观众的方向），a 为半条对角线（106 mm）。
 * 上沿水平 ⇒ 角尖落在对边上离底边 t = (√2 − 1) × 边长 ≈ 62 mm 处；杯口宽 2(a − t) ≈ 88 mm，杯底宽 ≈ 36 mm。
 * 撑开：前后两壁各绕杯底往外仰 12°，两侧折边弯成圆角，杯口张开约 2.6 cm。
 */
const S = 150
const a = S / Math.SQRT2
const t = (Math.SQRT2 - 1) * S

const paper = new Paper({ size: S, name: 'cup', color: '#2a9d8f' })

const diamond = paper.turn(45)
const half = paper.fold([-a, 0], [a, 0], [0, -a + 5])
const right = paper.bring([a, 0], [-(a - t), t])
const left = paper.bring([-a, 0], [a - t, t])
const front = paper.fold([-a, t], [a, t], [0, a - 5], { only: { moved: half } })
const back = paper.fold([-a, t], [a, t], [0, a - 5], { under: true })
// 立起来：绕杯底（第一道对折的折痕）转 90°，杯口朝上、前片朝着观众
const stand = paper.stand(half)
// 撑开：后壁（原来垫在下面的那半张纸和翻到后面的上角）往后仰，其余往前；转轴都是杯底那条折痕
const rear: FoldSelect = { every: [{ not: { moved: half } }, { not: { moved: right } }, { not: { moved: left } }] }
const OPEN = 12
const open = paper.rotate([
  { only: { not: rear }, crease: half, angle: -OPEN },
  { only: rear, crease: half, angle: OPEN },
])

/** 平铺时从正前上方看，三角形底边是水平的 */
const FLAT: Vec3 = [0.06, 1, 0.6]
const all = paper.all()
const fold = (id: string, k: number, title: string, desc: string, extra: Partial<SpecStep> = {}): SpecStep => ({
  id, title, desc, camera: paper.view(k, FLAT), set: paper.set(k), highlight: paper.movedIds(k), ...extra,
})
const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`

export const origamiCup: ManualSpec = {
  id: 'origami-cup',
  name: '折纸杯',
  desc: '一张正方形纸、5 次折叠，折出能装零食、还能临时装水的传统纸杯。',
  category: '折纸',
  genre: 'tutorial',
  dims: { width: 88, depth: 26, height: 62 },
  source: { title: 'Origami Diagrams · How to Fold an Origami Paper Cup', url: 'https://origamidiagrams.com/diagrams/paper-cup/', images: [] },
  package: [
    { name: '正方形折纸', qty: 1, spec: '15 × 15 cm，单面彩色；A4 纸裁成正方形也行，还更挺' },
    { name: '蜡纸或锡箔纸', qty: 1, spec: '可选：想让杯子多装一会儿水时换用' },
  ],
  params: [
    { label: '难度', value: '入门 · 约 1 分钟', note: '很多人学会的第一个实用折纸' },
    { label: '折数', value: '5 次', note: '对折 1 次、两角各 1 次、上角前后各 1 次' },
    { label: '关键落点', value: `离底边 ${cm(t)}`, note: '角尖碰到对边的这个高度，折过去的上沿正好水平（= (√2 − 1) × 边长）' },
    { label: '成品', value: `杯口 ${cm(2 * (a - t))} · 高 ${cm(t)} · 杯底约 3.6 cm`, note: '15 cm 纸；纸越大杯子越大，25 cm 纸能装一杯水' },
    { label: '装水', value: '约 1–2 分钟', note: '普通纸泡软前；装坚果、回形针可以一直用' },
  ],
  parts: paper.parts(),
  stageSize: 450,
  guides: [
    {
      id: 'fold',
      title: '折一个纸杯',
      kind: 'assembly',
      steps: [
        {
          id: 'sheet', title: '白面朝上，摆成菱形', desc: '准备一张正方形折纸，白色那面朝上，转 45° 让一个角对着自己。',
          camera: paper.view(diamond, FLAT), set: paper.set(diamond), highlight: all,
          chips: [{ label: '纸张', sub: `${S / 10} × ${S / 10} cm` }],
        },
        fold('half', half, '下角对折到上角', '把靠近自己的下角往上翻，和上角对齐压平，得到一个三角形，彩色面翻到了外面。', {
          chips: [{ label: '三角形底边', sub: cm(2 * a) }],
        }),
        fold('right', right, '右角折到左斜边', '右角往左翻，角尖碰到左边的斜边。翻过去那片的上沿要和底边平行。', {
          chips: [{ label: '落点', sub: `离底边约 ${cm(t)}` }],
          tip: '先别压死：让角尖沿左斜边上下挪，看到上沿水平了再压平。',
        }),
        fold('left', left, '左角折到右边', '左角也往右翻，角尖正好落在第一片的右上角上，两片的上沿连成一条直线。'),
        fold('front', front, '前片上角往下折', '只掀起最上面一层的上角，往前折下来，折边贴着杯口。', {
          tip: '想更结实：把这片三角塞进前面那片的口袋里。',
        }),
        fold('back', back, '后片往后折', '剩下的一层上角往后折到杯子背面（山折），和前面那片对称。', {
          camera: paper.view(back, [0.12, 0.45, 1]),
          tip: '往后折：翻过来看，这片三角贴在杯子背面。',
        }),
        fold('stand', stand, '立起来', '杯底朝下把纸杯立起来，前片朝着自己。', {
          camera: paper.view(stand, [0.3, 0.4, 1]),
        }),
        fold('open', open, '捏开杯口', '两手捏住左右两个角往中间轻轻一推，前后两片分开，杯口就张开了。', {
          camera: paper.view(open, [0.3, 0.8, 1]), orbit: true,
          tip: '杯底往下按一按，杯子能站得更稳。',
        }),
      ],
    },
    {
      id: 'use',
      title: '用起来',
      kind: 'usage',
      start: paper.state(open),
      steps: [
        {
          id: 'snack', title: '装一把小零食', desc: '杯口朝上放在桌上，坚果、爆米花、回形针、小珠子都能装，前片的口袋还能插一张小纸条。',
          camera: paper.view(open, [0.2, 1, 0.55]), highlight: all,
        },
        {
          id: 'water', title: '临时装点水', desc: '普通折纸能装水一两分钟，纸泡软前喝完；换成蜡纸、锡箔纸，或者用 25 cm 以上的大纸，能撑更久。',
          camera: paper.view(open, [-0.6, 0.6, 1]), highlight: all,
          chips: [{ label: '装水', sub: '约 1–2 分钟' }],
        },
      ],
    },
  ],
}
