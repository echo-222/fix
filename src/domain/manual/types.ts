/**
 * 说明书场景脚本（Manual Scene Script）
 *
 * 任何「非参数化」的说明书（电子产品、小家电、工具……）都描述成：
 *   零件（基本形体拼出来的线稿模型） + 每一步的状态变化（移动 / 换父级 / 开关 / 灯 / 屏幕）。
 * compile.ts 校验并编译成 App 通用的 Guide / Step，ManualStage 负责渲染。
 *
 * 坐标约定：毫米，Y 向上，桌面 / 地面 y = 0，观众默认站在 +Z 一侧。
 * 平面类形体（hole / led / screen / text）默认朝 +Z，用 rot 转到需要的朝向。
 */

export type Vec3 = [number, number, number]

export type Shape =
  /** 方块，chamfer > 0 时为倒角方块 */
  | { type: 'box'; size: Vec3; chamfer?: number }
  /** 俯视圆角矩形向上挤出：x ∈ ±w/2，z ∈ ±d/2，y ∈ [0, h] */
  | { type: 'slab'; w: number; d: number; h: number; r?: number }
  /** 圆柱，中心在原点 */
  | { type: 'cylinder'; r: number; h: number; axis?: 'x' | 'y' | 'z'; r2?: number }
  /**
   * 圆润外壳（鼠标、遥控器、剃须刀……）：俯视为超椭圆，底面平、顶面拱起。
   * w：宽（x），l：长（z），h：总高，base：竖直侧边高度，n：超椭圆指数（2 = 椭圆，越大越方），
   * taper：前端（-z）收窄比例，peak：最高点位置（-1 前端 … 1 尾端），seams：顶面分模线 [x, z] 折线。
   */
  | { type: 'shell'; w: number; l: number; h: number; base?: number; n?: number; taper?: number; peak?: number; seams?: [number, number][][] }
  /** 开孔 / 凹槽 / 接口：深色圆角矩形面片，朝 +Z */
  | { type: 'hole'; w: number; h: number; r?: number }
  /** 指示灯：圆形面片，朝 +Z。颜色、亮灭由状态控制 */
  | { type: 'led'; r: number; color?: string }
  /** 屏幕：朝 +Z 的矩形，内容由状态里的 ui 绘制 */
  | { type: 'screen'; w: number; h: number }
  /** 印字 / 丝印：朝 +Z，size 为字高 */
  | { type: 'text'; text: string; size: number }
  /** 多个形体合并成一个零件（例如接收器 = 插头 + 外壳） */
  | { type: 'compound'; items: (Shape & { at?: Vec3; rot?: Vec3; fill?: Fill; finish?: Finish })[] }
  /** 线缆：两端挂在零件上（零件局部坐标 at + 出线方向 dir），随零件移动实时弯曲 */
  | { type: 'cable'; from: CableEnd; to: CableEnd; r?: number; slack?: number }
  /** 俯视多边形向上挤出：points 为 [x, z] 顶点（不自交，顺逆时针都行），y ∈ [0, h]。杠杆、凸轮、连杆这类不规则平板 */
  | { type: 'poly'; points: [number, number][]; h: number }
  /**
   * 纸片（折纸、立体书）：薄多边形，y ∈ [0, th]（缺省 0.3）。正面（+y）用零件的 fill / finish，背面用 back / backFinish。
   * 边线只画一圈，每条边怎么画由状态 edges 决定（折痕还没折出来时不画）
   */
  | { type: 'sheet'; points: [number, number][]; th?: number; back?: Fill; backFinish?: Finish }
  /**
   * 直齿轮，中心在原点：r 为分度圆半径，齿顶 r + m、齿根 r - 1.25m（模数 m = 2r / teeth），h 为齿宽，沿 axis（缺省 y）。
   * 两个齿轮啮合：模数相同、中心距 = r1 + r2；一个齿正对另一个的齿槽（转半个齿距 180 / teeth 度）。
   */
  | { type: 'gear'; teeth: number; r: number; h: number; axis?: 'x' | 'y' | 'z'; bore?: number }
  /**
   * 一整张折纸：平铺在桌面（y = 0）、中心在原点，按 ops 顺序一步步折（见 FoldOp）。
   * 编译时模拟出每一步的样子，画成一张连续的纸：折边是弯过去的，两面不同色，有厚度和明暗。
   * 第 k 步之后的样子用状态 fold: k 切换（0 = 平铺），过渡动画就是这一折的翻折过程
   */
  | OrigamiShape

/**
 * 折纸图解坐标 [x, y]（mm）：从正上方看桌面，x 向右，y 朝远离观众的方向（= 图解上的「上」，世界 -z）。
 * 永远是纸「当前」摆在桌上的位置，不是展开图上的位置
 */
export type FoldPoint = [number, number]

/**
 * 选面：哪些面参与这一折。
 * all：全部；moved：第 k 步翻动过的面（「第 3 步折下来的那片」）；flap：这个点上最上面那层所在的一片
 * （和它一起被翻动过的面）；not / any / every 组合
 */
export type FoldSelect =
  | 'all'
  | { moved: number }
  | { flap: FoldPoint }
  | { not: FoldSelect }
  | { any: FoldSelect[] }
  | { every: FoldSelect[] }

/**
 * 折纸的一步（第 k 个 op 折完 = 第 k 步，从 1 开始）。
 * fold：沿直线折，line 给两点、move 给要翻过去那一侧的任意一点；或者 bring 某个点 onto 另一个点（折线是两点连线的中垂线）。
 *   缺省谷折（往上翻、压平 180°）；under 山折（往下翻到纸底下）；angle 只转这么多度（90 = 立起来）；only 只折选中的面。
 * unfold：把第 step 步折过去的面翻回来（留下折痕）；flip：整张翻面；turn：在桌上转（度，俯视逆时针为正）；
 * rotate：立体造型，每组面绕第 crease 步的折痕转 angle 度（正数 = 顺着那一步的方向继续折，负数 = 往回打开），
 *   或者绕世界坐标 at + axis 按右手定则转；各组同时转；
 * stand：把整张纸绕第 crease 步的折痕立起来 angle 度（缺省 90），自动往纸抬离桌面的方向转；
 * draw：在纸上画点（眼睛、鼻子），画在这个点最上面那层朝上的那面
 */
export type FoldOp =
  | { op: 'fold'; line?: [FoldPoint, FoldPoint]; move?: FoldPoint; bring?: FoldPoint; onto?: FoldPoint; under?: boolean; angle?: number; only?: FoldSelect }
  | { op: 'unfold'; step: number }
  | { op: 'flip'; way?: 'left-right' | 'top-bottom' }
  | { op: 'turn'; angle: number }
  | { op: 'rotate'; groups: { only?: FoldSelect; crease?: number; at?: Vec3; axis?: Vec3; angle: number }[] }
  | { op: 'stand'; crease: number; angle?: number }
  | { op: 'draw'; marks: { at: FoldPoint; r: number; color?: string }[] }

export interface OrigamiShape {
  type: 'origami'
  /** 正方形边长，或 [宽 x, 长 y]（mm） */
  size: number | [number, number]
  /** 彩色面颜色，缺省 #e4573d；双面同色的纸把 white 也写成同一个颜色 */
  color?: string
  /** 另一面（白面）的颜色，缺省 #f7f4ec */
  white?: string
  /** 开始时哪面朝上，缺省白面（大多数折纸从白面开始折） */
  up?: 'white' | 'color'
  /** 纸厚（mm），缺省 0.3：画面上要看得出层次，比真纸厚 */
  th?: number
  ops: FoldOp[]
}

export interface CableEnd {
  part: string
  at: Vec3
  dir: Vec3
}

/** 贴在父零件 shell 顶面上：[x, z] 为父零件局部坐标，dy 为离开表面的高度 */
export interface OnSurface {
  on: [number, number]
  dy?: number
}

export type Fill = 'white' | 'warm' | 'shade' | 'dark'

/** 真实材质模式下几何体的材质名（见 three/manual/finishes.ts） */
export const FINISHES = [
  'plastic-white', 'plastic-grey', 'plastic-black', 'rubber',
  'board-white', 'fiberboard', 'wood', 'cardboard', 'paper', 'wall',
  'steel', 'zinc', 'hole',
] as const
/** 材质名，或自定义颜色（工具手柄、品牌色） */
export type Finish = (typeof FINISHES)[number] | { color: string; roughness?: number; metalness?: number }

export interface SpecPart {
  id: string
  name: string
  /** 规格说明（标签 / 清单用） */
  spec?: string
  shape: Shape
  /** 父零件 id：父零件移动 / 翻转时子零件跟着走 */
  parent?: string
  /** 相对父零件（或世界）的位置 */
  at?: Vec3 | OnSurface
  /** 欧拉角（度，XYZ 顺序） */
  rot?: Vec3
  /** 几何体整体平移，用来把旋转轴放到合适位置（例如屏幕盖板的转轴在后沿） */
  pivot?: Vec3
  fill?: Fill
  /**
   * 真实材质模式下几何体用的材质，覆盖 ManualSpec.finishes 里按 fill 给的缺省；compound 子项可以再单独写 finish。
   * 线稿模式不受影响。适合板材家具、五金、工具这类形状本来就规整、真实感主要靠材质的零件。
   */
  finish?: Finish
  /** 外观网格（Tripo 等生成的 GLB）：显示时替换 shape；shape 仍是审计用的碰撞代理，也是模型加载前的占位 */
  model?: PartModel
  /**
   * 父零件的外观模型里已经带着这个零件（上盖、按键、盖板、清洗盘……）：它待在原位的步骤里不单独画，免得叠两层；
   * 某一步它被打开 / 取出时，模型里那份就不对了，这一步父零件改画代理形状（真实外观模式下套 finish 材质），
   * baked 零件全部单独画。父零件必须有 model；指示灯、屏幕、线缆不能写。
   */
  baked?: boolean
  /** 初始是否可见，缺省 true */
  visible?: boolean
}

export interface PartModel {
  /** public 下的路径，如 /models/pc-build-b650m/gpu.glb */
  src: string
  /** 只取 GLB 里的一个节点（分割结果 tripo_part_N），缺省整个模型 */
  node?: string
  /** 生成结果歪着摆（展示角度）时：先按主轴把模型转正到最近的坐标轴，再套 rot */
  align?: boolean
  /** 先按欧拉角（度，XYZ）把模型转到零件的局部朝向，再对齐包围盒 */
  rot?: Vec3
  /** contain：等比缩放塞进代理包围盒（缺省）；stretch：三轴分别拉伸到代理包围盒 */
  fit?: 'contain' | 'stretch'
  /**
   * 裁掉生成时多出来的东西（线缆、底座、另一件产品）：按 rot 之后、零件局部轴向的包围盒比例（0–1）给保留范围，
   * 例如 { max: [0.84, 1, 1] } = 丢掉 +x 方向最后 16%。沿裁切框精确切开三角形，切口补平面封口，再对齐包围盒。
   * cut：再挖掉几块（同样按比例），挖出来的部分通常另挂到要单独动的零件上（扳手、支架），见 frame。
   */
  crop?: { min?: Vec3; max?: Vec3; cut?: { min: Vec3; max: Vec3 }[] }
  /**
   * 一个 GLB 切成几块挂在几个零件上时用：整个模型（rot 之后）的包围盒落在本零件局部坐标里的哪里（mm），三轴分别拉伸。
   * 写了 frame 就不按代理包围盒对齐（fit 不起作用），每块的换算相同，原位时拼回去严丝合缝；crop 只决定这块留哪部分。
   */
  frame?: { min: Vec3; max: Vec3 }
}

export type Light = 'off' | 'on' | 'blink' | 'blinkThenOff'

export interface ScreenItem {
  text: string
  sub?: string
  state?: 'normal' | 'selected' | 'done' | 'muted'
}

/** 屏幕内容：线稿风格的系统界面（设置页、弹窗、通知） */
export interface ScreenUI {
  app?: string
  title?: string
  items?: ScreenItem[]
  button?: string
  /** 按钮是否是这一步要点的 */
  buttonActive?: boolean
  toast?: string
  /** 显示随鼠标移动的光标 */
  cursor?: boolean
}

/**
 * 插进接口：hole 为接口零件 id。插头约定原点在插头与外壳交界、插头朝局部 +x，
 * 插好后插头 +x 指向接口内部，+y 对齐接口的高度方向（hole 的 h），+z 对齐接口的宽度方向（hole 的 w）。
 */
export interface PlugSpec {
  hole: string
  /** 绕插入方向转（度），例如 USB-A 正反插 180 */
  roll?: number
  /** 沿插入方向再推进（mm），负数 = 没插到底 */
  depth?: number
  /** 自动途经点离接口的距离（mm），缺省 30；0 = 不绕外侧，直接推进（插紧、半插 → 插到底） */
  back?: number
}

/** 某一步开始后零件的状态。只写变化的字段，未写的沿用上一步 */
export interface PartState {
  parent?: string | null
  at?: Vec3 | OnSurface
  rot?: Vec3
  /** 插进某个接口：自动换父级、对准接口中心与朝向；没给 via 时从接口外沿法线插入。不能与 parent / at / rot 同时写 */
  plug?: string | PlugSpec
  visible?: boolean
  light?: Light
  color?: string
  ui?: ScreenUI | null
  /**
   * sheet 的每条边怎么画：第 i 个字符对应 points[i] → points[i + 1]。h 黑线（纸边、折着的边），
   * s 浅灰线（压过又摊平的折痕），- 不画（还没折出来的折痕）。缺省全部黑线；和灯一样在过渡开始时切换
   */
  edges?: string
  /** origami 折到第几步（0 = 平铺，k = 第 k 个 op 折完）；过渡动画演示中间每一折 */
  fold?: number
  /** ↓ 只作用于进入这一步的过渡动画 */
  /** 抛物线抬起高度（mm） */
  lift?: number
  /** 途经点（世界坐标），例如「拔出再插回」 */
  via?: Vec3
  /**
   * 绕这个点转过去（父零件局部坐标，没有父级时为世界坐标），不走直线：折纸翻折、翻盖、开门。
   * 点要在转轴上；只给点时走最短的转法，正好转 180° 时要写 axis（按右手定则从这个方向转，免得从桌面底下绕）。
   * 父级不变时才生效，不能和 via 同时写
   */
  arc?: Vec3 | { at: Vec3; axis: Vec3 }
  /** 动画开始延迟（秒） */
  delay?: number
  /** 动画时长（秒），缺省 1.1 */
  dur?: number
}

/** 这一步循环播放的动作（不改变状态） */
export type Action =
  /** 按键按下回弹 */
  | { type: 'press'; part: string; depth?: number; delay?: number }
  /**
   * 绕局部轴持续转动（滚轮、旋钮、齿轮、曲轴）。speed 为圈 / 秒，缺省约 0.64，负数反转；
   * 正转 = 从轴的正方向看顺时针。啮合的齿轮转速与齿数成反比、方向相反
   */
  | { type: 'spin'; part: string; axis?: 'x' | 'y' | 'z'; speed?: number; delay?: number }
  /** 沿局部轴来回轻推（检查是否插紧） */
  | { type: 'shake'; part: string; axis?: 'x' | 'y' | 'z'; amp?: number; delay?: number }
  /** 在桌面上画「8」字移动；同场景有 cursor 的屏幕光标会同步移动 */
  | { type: 'glide'; part: string; delay?: number }
  /**
   * 绕局部轴来回摆（摆锤、跷跷板、连杆）：角度 = amp × sin(2π(t / period + phase))（度）。
   * clip 只留正半波 / 负半波（牛顿摆两端的球轮流摆出去）；crank 为 true 时按连杆算：角度 = asin(sin(amp) × sin(…))
   */
  | { type: 'swing'; part: string; axis?: 'x' | 'y' | 'z'; amp: number; period?: number; phase?: number; clip?: 'pos' | 'neg'; crank?: boolean; delay?: number }
  /**
   * 沿局部轴往复（活塞、气门、凸轮从动件、齿条）：位移 = amp × sin(2π(t / period + phase))（mm）。
   * rod 为连杆长度时按曲柄滑块精确计算（amp = 曲柄半径）；clip 同 swing
   */
  | { type: 'slide'; part: string; axis?: 'x' | 'y' | 'z'; amp: number; period?: number; phase?: number; clip?: 'pos' | 'neg'; rod?: number; delay?: number }

export interface Callout {
  part: string
  text: string
  sub?: string
  /** 零件局部坐标中的锚点，缺省原点 */
  at?: Vec3
  /** 标签相对锚点的世界坐标偏移，缺省向上 40mm */
  offset?: Vec3
}

export type ViewName = 'front' | 'iso' | 'top' | 'left' | 'right' | 'back' | 'low' | 'under'

export interface CameraSpec {
  /** 看向某个零件（取其世界坐标 + offset），或直接给世界坐标 */
  target: string | Vec3
  offset?: Vec3
  dir: ViewName | Vec3
  dist: number
}

export interface Chip {
  label: string
  sub?: string
}

export interface SpecStep {
  id: string
  title: string
  desc: string
  tip?: string
  chips?: Chip[]
  /** 说明书原文所在页（从 1 开始），用于溯源 */
  page?: number
  camera: CameraSpec
  set?: Record<string, PartState>
  /** 本步高亮（红色线稿）的零件 */
  highlight?: string[]
  actions?: Action[]
  callouts?: Callout[]
  /** 右上角细节圆窗：同一场景的近景 */
  zoom?: CameraSpec & { caption: string }
  /** 红圈位置，缺省为 zoom 的目标 */
  marker?: string | Vec3
  /** 镜头缓慢环绕 */
  orbit?: boolean
}

export interface SpecGuide {
  id: string
  title: string
  /** usage：使用 / 连接；assembly：安装；repair：故障排查 */
  kind: 'usage' | 'assembly' | 'repair'
  /** 本指南开始前的状态（在 initial 基础上覆盖） */
  start?: Record<string, PartState>
  steps: SpecStep[]
}

export interface ManualSpec {
  /** 小写字母 + 连字符，例如 mouse-bt54 */
  id: string
  name: string
  /** 菜单里的一句话介绍 */
  desc: string
  category: string
  /**
   * tutorial：折纸、立体书、原理演示这类没有官方说明书的教程。面板写「材料与要点 · 参考资料」，
   * package 当材料清单、params 当要点，步骤不要求页码；source 写参考资料（url 为参考页面）
   */
  genre?: 'manual' | 'tutorial'
  /** 产品外形尺寸（mm），显示在顶栏 */
  dims: { width: number; depth: number; height: number }
  source: {
    title: string
    /** 官方原文地址。未获品牌授权的说明书只给链接、不放原图（images 留空） */
    url?: string
    /** 说明书照片（public/ 下的路径），页码从 1 开始按顺序对应 */
    images: { src: string; pages: string }[]
  }
  /** 包装清单 */
  package: { name: string; qty: number; spec?: string }[]
  /** 基本参数 */
  params: { label: string; value: string; note?: string }[]
  parts: SpecPart[]
  /** 所有指南共用的初始状态 */
  initial?: Record<string, PartState>
  guides: SpecGuide[]
  /** 场景大致范围（mm），决定地面网格淡出距离 */
  stageSize?: number
  /** 真实材质模式：没写 finish 的几何体按 fill 取材质；不写则这些零件在真实材质模式下仍是线稿 */
  finishes?: Partial<Record<Fill, Finish>>
}
