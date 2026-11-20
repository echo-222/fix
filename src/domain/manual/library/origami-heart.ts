import { Paper } from '../origami'
import type { ManualSpec, SpecStep, Vec3 } from '../types'

/**
 * 传统简易爱心：15 cm 正方形折纸，白面朝上、摆成菱形开始折，正面全是彩色，中间一条竖缝。
 * 折法、顺序参考 PlayOwl「Folded Heart」（8 步，只有谷折和山折）：压十字折痕 → 上角折到中心 → 下角折到上边 →
 * 左右两边沿中线往上折 → 两个心尖、两个侧角往后折。
 * 坐标：图解坐标 [x, y]（俯视，y 朝远离观众的方向），a 为半条对角线（106 mm）。
 * 两边往上折之后：底尖 y = -a/4，心尖 (±a/4, 3a/4)，侧角 (±5a/8, 3a/8)，中间凹口 y = a/2。
 * 心尖、侧角各往后折 12 mm（参考成品图量得约 11–12 mm；wikiHow 写约 1.3 cm）。
 */
const S = 150
const a = S / Math.SQRT2

const paper = new Paper({ size: S, name: 'heart', color: '#d8404b' })

const diamond = paper.turn(45)
const v = paper.fold([0, -a], [0, a], [-a + 5, 0])
const vOpen = paper.unfold(v)
const h = paper.fold([-a, 0], [a, 0], [0, a - 5])
const hOpen = paper.unfold(h)
const top = paper.fold([-a, a / 2], [a, a / 2], [0, a - 3])
const bottom = paper.fold([-a, -a / 4], [a, -a / 4], [0, -a + 3])
const sideR = paper.fold([0, -a / 4], [a, (3 * a) / 4], [0.7 * a, -a / 4 + 2])
const sideL = paper.fold([0, -a / 4], [-a, (3 * a) / 4], [-0.7 * a, -a / 4 + 2])
const tip = 12
const tipY = (3 * a) / 4 - tip
const tips = paper.fold([-a, tipY], [a, tipY], [a / 4, (3 * a) / 4 - 2], { under: true })
const side = 12
const sideX = (5 * a) / 8 - side
const cornerR = paper.fold([sideX, -a], [sideX, a], [(5 * a) / 8 - 2, (3 * a) / 8], { under: true })
const cornerL = paper.fold([-sideX, -a], [-sideX, a], [-(5 * a) / 8 + 2, (3 * a) / 8], { under: true })
// 左右翻到背面：心尖还朝上
const turnOver = paper.flip('left-right')
// 再翻回正面，绕底尖那条横线往后立起 70°，斜靠着摆在桌上
paper.flip('left-right')
const stand = paper.rotate([{ at: [0, 0, a / 4], axis: [1, 0, 0], angle: 70 }])

/** 平铺时从正前上方看，横向的边是水平的 */
const FLAT: Vec3 = [0.06, 1, 0.6]
/** 往后折（山折）的几步压低一点看，翻到底下的那片看得见 */
const LOW: Vec3 = [0.1, 0.75, 1]
/** 压十字折痕那几步都按整张纸取景，镜头不跟着半张纸跳 */
const sheetView = paper.view(diamond, FLAT)
const all = paper.all()
const fold = (id: string, k: number, title: string, desc: string, extra: Partial<SpecStep> = {}): SpecStep => ({
  id, title, desc, camera: paper.view(k, FLAT), set: paper.set(k), highlight: paper.movedIds(k), ...extra,
})
const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`
const width = 2 * sideX
const height = a - tip

export const origamiHeart: ManualSpec = {
  id: 'origami-heart',
  name: '折纸爱心',
  desc: '一张正方形纸、8 步谷折山折，折出中间一条竖缝的平面爱心，夹进贺卡正合适。',
  category: '折纸',
  genre: 'tutorial',
  dims: { width: Math.round(width), depth: Math.round(height), height: 2 },
  source: { title: 'PlayOwl · Easy Origami Heart: Step-by-Step Paper Folding for Kids', url: 'https://www.playowl.com/paper-crafts/origami-heart', images: [] },
  package: [
    { name: '正方形折纸', qty: 1, spec: '15 × 15 cm，单面红色或粉色；10–20 cm 都能折' },
  ],
  params: [
    { label: '难度', value: '简单 · 约 5–8 分钟', note: '会折小狗脸之后的下一个好选择' },
    { label: '折数', value: '8 步', note: '2 道参考折痕 + 4 次谷折 + 2 组山折' },
    { label: '关键对齐', value: '底边对齐中线', note: '左右两边往上折时，下边要整条贴着竖直中线，爱心才对称' },
    { label: '往后折', value: `心尖 ${cm(tip)} · 侧角 ${cm(side)}`, note: '没有固定刻度，两边折得一样多就好' },
    { label: '成品', value: `约 ${cm(width)} × ${cm(height)}`, note: '15 cm 纸，宽 × 高' },
  ],
  parts: paper.parts(),
  stageSize: 450,
  guides: [
    {
      id: 'fold',
      title: '折一颗爱心',
      kind: 'assembly',
      steps: [
        {
          id: 'sheet', title: '白面朝上，摆成菱形', desc: '准备一张正方形折纸，白色那面朝上，转 45° 让一个角朝上。白面朝上开始，折完正面全是彩色。',
          camera: paper.view(diamond, FLAT), set: paper.set(diamond), highlight: all,
          chips: [{ label: '纸张', sub: `${S / 10} × ${S / 10} cm` }],
        },
        fold('v', v, '左角对折到右角', '左角翻到右角上对齐，压出竖直的中线。', { camera: sheetView }),
        fold('v-open', vOpen, '打开', '翻回来，留下一条竖直折痕。', { camera: sheetView }),
        fold('h', h, '上角对折到下角', '上角翻到下角上对齐，压出水平的中线。', { camera: sheetView }),
        fold('h-open', hOpen, '再打开', '翻回来，两条折痕在纸中心交叉，后面每一步都照着它们对齐。', { camera: sheetView }),
        fold('top', top, '上角折到中心', '上角往下折，角尖正好落在两条折痕交叉的中心点上。', {
          camera: sheetView, chips: [{ label: '折线', sub: `离上角 ${cm(a / 2)}` }],
        }),
        fold('bottom', bottom, '下角折到上边', '下角往上折，角尖碰到刚才折出的上边中点。', {
          chips: [{ label: '折线', sub: `离下角 ${cm((3 * a) / 4)}` }],
        }),
        fold('side-r', sideR, '右半边往上折', '从下边中点起，把右半边往上折，让右半段下边整条贴着竖直中线。', {
          tip: '先对齐中线再压：折歪了爱心就一边大一边小。',
        }),
        fold('side-l', sideL, '左半边往上折', '左半边照同样的方法往上折，两边在中线碰齐，现在已经能看出爱心了。'),
        fold('tips', tips, '两个心尖往后折', '把两个心尖往后折一点（山折），心顶变平。', {
          camera: paper.view(tips, LOW, 0.85),
          chips: [{ label: '往后折', sub: `约 ${cm(tip)}` }],
        }),
        fold('corner-r', cornerR, '右侧角往后折', '右边的尖角也往后折一点（山折），轮廓更圆。', {
          camera: paper.view(cornerR, LOW, 0.85),
          chips: [{ label: '往后折', sub: `约 ${cm(side)}` }],
        }),
        fold('corner-l', cornerL, '左侧角往后折', '左边照样折，和右边一样多。爱心完成，背面可以写一句话。', {
          camera: paper.view(cornerL, [0.2, 1, 0.75]), orbit: true,
          tip: '小角容易弹开：用指甲把折痕压实，或者在背面点一点胶。',
        }),
      ],
    },
    {
      id: 'gift',
      title: '送出去',
      kind: 'usage',
      start: paper.state(cornerL),
      steps: [
        {
          id: 'back', title: '翻到背面写一句话', desc: '左右翻过来，背面中间是一整块平的纸，正好写一句祝福或者名字；往后折的小角也都压在这一面。',
          camera: paper.view(turnOver, FLAT), set: paper.set(turnOver), highlight: all,
          tip: '小角下面点一点胶，爱心就不会散开。',
        },
        {
          id: 'card', title: '夹进贺卡或串成挂饰', desc: '在这一面点胶，正面朝外贴在贺卡上；或者折几颗不同颜色的，用线从心顶穿起来做成一串挂饰。',
          camera: paper.view(turnOver, [-0.5, 0.8, 1]), highlight: all,
          chips: [{ label: '挂饰', sub: '7.5 cm 小纸折出来更轻巧' }],
        },
        {
          id: 'display', title: '立起来当摆件', desc: '翻回正面，让底尖着地、往后斜靠在相框或笔筒上，就是一个桌面小摆件。',
          camera: paper.view(stand, [0.45, 0.4, 1]), set: paper.set(stand), highlight: all, orbit: true,
          tip: '想让它自己站住：背面贴一条折成三角的小纸条当支架。',
        },
      ],
    },
  ],
}
