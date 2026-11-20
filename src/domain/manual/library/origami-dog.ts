import { Paper } from '../origami'
import type { ManualSpec, SpecStep, Vec3 } from '../types'

/**
 * 传统小狗脸：15 cm 正方形折纸，白面朝上、摆成菱形开始折，脸和耳朵是彩色面，嘴巴翻出白面。
 * 折法、顺序参考 Origami Diagrams「Dog Face」（6 步）：对折成倒三角 → 压中线 → 两只耳朵斜着往下折 →
 * 只把前层下角往上折成嘴 → 后层下角往后折 → 头顶往后折一条窄边。比例按参考成品图量：
 * 耳朵折线从顶边离中线 24 mm 处斜到斜边上离角约 1/3 处，耳尖垂到脸外面；下巴离尖角 25 mm，头顶窄边 10 mm。
 * 坐标：图解坐标 [x, y]（俯视，y 朝远离观众的方向），a 为半条对角线（106 mm）。
 * 眼睛、鼻子用 draw 画在纸上（跟着那块纸面走），最后绕下巴那条边立起来 80°。
 */
const S = 150
const a = S / Math.SQRT2

const paper = new Paper({ size: S, name: 'dog', color: '#b0773f' })

const diamond = paper.turn(45)
const half = paper.fold([-a, 0], [a, 0], [0, a - 5])
const mid = paper.fold([0, 0], [0, -a], [-50, -10])
const midOpen = paper.unfold(mid)
const earTop = 24
const earDrop = 33
const earL = paper.fold([-earTop, 0], [-a + earDrop, -earDrop], [-a + 4, -1])
const earR = paper.fold([earTop, 0], [a - earDrop, -earDrop], [a - 4, -1])
const chin = 25
const jawY = -a + chin
const mouth = paper.fold([-a, jawY], [a, jawY], [0, -a + 3], { only: { moved: half } })
const jaw = paper.fold([-a, jawY], [a, jawY], [0, -a + 3], { under: true })
const strip = 10
const crown = paper.fold([-a, -strip], [a, -strip], [0, -2], { under: true })
const eyeY = -32
const noseY = -61
const eyes = paper.draw([{ at: [-16, eyeY], r: 4.5 }, { at: [16, eyeY], r: 4.5 }])
const nose = paper.draw([{ at: [0, noseY], r: 6 }])
// 拿起来摆着：绕下巴那条边立起来，脸朝着观众
const stand = paper.stand(jaw, 80)

/** 平铺时从正前上方看，顶边是水平的 */
const FLAT: Vec3 = [0.06, 1, 0.6]
/** 往后折（山折）的几步压低一点看，翻到底下的那片看得见 */
const LOW: Vec3 = [0.1, 0.75, 1]
const all = paper.all()
const fold = (id: string, k: number, title: string, desc: string, extra: Partial<SpecStep> = {}): SpecStep => ({
  id, title, desc, camera: paper.view(k, FLAT), set: paper.set(k), highlight: paper.movedIds(k), ...extra,
})
const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`

export const origamiDog: ManualSpec = {
  id: 'origami-dog',
  name: '小狗脸',
  desc: '一张正方形纸折出耷拉着耳朵的小狗脸，再画上眼睛和鼻子，适合第一次学折纸的小朋友。',
  category: '折纸',
  genre: 'tutorial',
  dims: { width: 146, depth: 71, height: 2 },
  source: { title: 'Origami Diagrams · How to Fold an Origami Dog Face', url: 'https://origamidiagrams.com/diagrams/dog-face/', images: [] },
  package: [
    { name: '正方形折纸', qty: 1, spec: '15 × 15 cm，单面彩色；棕色、橙色、黑色最像小狗' },
    { name: '黑色记号笔', qty: 1, spec: '画眼睛和鼻子' },
  ],
  params: [
    { label: '难度', value: '入门 · 约 3 分钟', note: '4–5 岁小朋友在大人帮忙下就能折' },
    { label: '折数', value: '6 次', note: '对折、压中线、两只耳朵、嘴、下巴、头顶' },
    { label: '耳朵', value: `顶边离中线 ${cm(earTop)} → 斜边约 1/3 处`, note: '折线越陡耳朵越长（像猎犬），越平耳朵越短（像梗犬）' },
    { label: '嘴 / 头顶', value: `下巴离尖角 ${cm(chin)} · 头顶窄边 ${cm(strip)}`, note: '嘴只折前面一层，翻出白面' },
    { label: '成品', value: '约 14.6 × 7.1 cm', note: '15 cm 纸，耳尖到耳尖' },
  ],
  parts: paper.parts(),
  stageSize: 450,
  guides: [
    {
      id: 'fold',
      title: '折一张小狗脸',
      kind: 'assembly',
      steps: [
        {
          id: 'sheet', title: '白面朝上，摆成菱形', desc: '准备一张正方形折纸，白色那面朝上，转 45° 让一个角朝上、一个角对着自己。',
          camera: paper.view(diamond, FLAT), set: paper.set(diamond), highlight: all,
          chips: [{ label: '纸张', sub: `${S / 10} × ${S / 10} cm` }],
        },
        fold('half', half, '上角对折到下角', '把上角往下翻，和下角对齐压平，得到尖角朝下的三角形：长边是头顶，尖角是下巴。'),
        fold('mid', mid, '左右对折', '左角翻到右角上对齐，只为压出一条竖直的中线。', { camera: paper.view(half, FLAT) }),
        fold('mid-open', midOpen, '打开，留下中线', '把左角翻回去，中间留下一条竖直折痕，后面两只耳朵照着它左右对称。'),
        fold('ear-l', earL, '折下左耳', '左角沿一条斜线往下折：折线从顶边离中线约 2.4 cm 处，斜到左斜边上离角约 1/3 处，耳尖垂到脸外面。', {
          chips: [{ label: '折线', sub: `顶边离中线 ${cm(earTop)}` }],
          tip: '折线越陡耳朵越长、越平耳朵越短，可以按喜欢的样子调。',
        }),
        fold('ear-r', earR, '折下右耳', '右角照同样的斜线往下折，两只耳尖要一样高。', {
          tip: '先量一下左耳尖离下巴多远，右耳照着这个距离折。',
        }),
        fold('mouth', mouth, '只把前层下角往上折', '用指甲挑起最上面一层的下角，往上折，翻出白色的嘴巴。', {
          chips: [{ label: '折线', sub: `离下角 ${cm(chin)}` }],
          tip: '只折一层：两层一起折就没有嘴了。',
        }),
        fold('jaw', jaw, '后层下角往后折', '剩下那层下角沿同一条线往后折到脸的背面（山折），下巴变平。', {
          camera: paper.view(jaw, LOW, 0.85),
        }),
        fold('crown', crown, '头顶往后折一条窄边', '沿顶边往后折约 1 cm 宽的一条（山折），头顶和两只耳根一起折过去，头顶变圆润。', {
          camera: paper.view(crown, LOW, 0.85),
          chips: [{ label: '窄边', sub: `约 ${cm(strip)}` }],
        }),
        {
          id: 'done', title: '小狗脸折好了', desc: '翻回正面看看：彩色的脸、两只耷拉的耳朵，下面一块白色的嘴巴。',
          camera: paper.view(crown, [0.2, 1, 0.75]), highlight: all, orbit: true,
        },
      ],
    },
    {
      id: 'draw',
      title: '画上表情',
      kind: 'usage',
      start: paper.state(crown),
      steps: [
        {
          id: 'eyes', title: '画两只眼睛', desc: '在两只耳根之间、中线左右各画一个小圆点当眼睛，离头顶大约 2 cm。',
          camera: paper.view(crown, FLAT, 0.75), set: paper.set(eyes), highlight: all,
          zoom: { target: paper.where([0, eyeY], eyes), dir: FLAT, dist: 110, caption: '两眼相距约 3 cm' },
          tip: '用记号笔，不要用铅笔：彩色纸上铅笔印看不清。',
        },
        {
          id: 'nose', title: '画鼻子', desc: '在白色嘴巴的尖上涂一个圆圆的黑鼻子，也可以在下面加一张嘴、一条小舌头。',
          camera: paper.view(crown, FLAT, 0.75), set: paper.set(nose), highlight: all,
          zoom: { target: paper.where([0, noseY], nose), dir: FLAT, dist: 90, caption: '鼻子画在嘴巴尖上' },
        },
        {
          id: 'show', title: '立起来摆着', desc: '捏住下巴把小狗脸立起来，背面贴一根冰棍棒就是手偶，贴在卡片上就是贺卡。',
          camera: paper.view(stand, [0.35, 0.35, 1]), set: paper.set(stand), highlight: all, orbit: true,
          tip: '换不同颜色的纸、不同的耳朵角度，就能折出一窝不同品种的小狗。',
        },
      ],
    },
  ],
}
