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
  | { type: 'compound'; items: (Shape & { at?: Vec3; rot?: Vec3; fill?: Fill })[] }
  /** 线缆：两端挂在零件上（零件局部坐标 at + 出线方向 dir），随零件移动实时弯曲 */
  | { type: 'cable'; from: CableEnd; to: CableEnd; r?: number; slack?: number }

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
  /** 初始是否可见，缺省 true */
  visible?: boolean
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

/** 某一步开始后零件的状态。只写变化的字段，未写的沿用上一步 */
export interface PartState {
  parent?: string | null
  at?: Vec3 | OnSurface
  rot?: Vec3
  visible?: boolean
  light?: Light
  color?: string
  ui?: ScreenUI | null
  /** ↓ 只作用于进入这一步的过渡动画 */
  /** 抛物线抬起高度（mm） */
  lift?: number
  /** 途经点（世界坐标），例如「拔出再插回」 */
  via?: Vec3
  /** 动画开始延迟（秒） */
  delay?: number
  /** 动画时长（秒），缺省 1.1 */
  dur?: number
}

/** 这一步循环播放的动作（不改变状态） */
export type Action =
  /** 按键按下回弹 */
  | { type: 'press'; part: string; depth?: number; delay?: number }
  /** 绕局部轴持续转动（滚轮、旋钮） */
  | { type: 'spin'; part: string; axis?: 'x' | 'y' | 'z'; delay?: number }
  /** 沿局部轴来回轻推（检查是否插紧） */
  | { type: 'shake'; part: string; axis?: 'x' | 'y' | 'z'; amp?: number; delay?: number }
  /** 在桌面上画「8」字移动；同场景有 cursor 的屏幕光标会同步移动 */
  | { type: 'glide'; part: string; delay?: number }

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
  /** 产品外形尺寸（mm），显示在顶栏 */
  dims: { width: number; depth: number; height: number }
  source: {
    title: string
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
}
