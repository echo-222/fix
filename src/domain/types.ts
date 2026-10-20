import type { ProfileId } from './profiles'
import type { SceneStep } from './manual/compile'

export type V3 = [number, number, number]
export type Q4 = [number, number, number, number]

/** manual:<id>：由说明书场景脚本生成的产品 */
export type ProductId = 'desk' | 'shelf' | 'table' | 'rack' | `manual:${string}`

export type GeoSpec =
  | { kind: 'profile'; profile: ProfileId; length: number; axis: 'x' | 'y' | 'z'; full?: boolean }
  | { kind: 'bracket'; size: number }
  | { kind: 'leveler'; size: number }
  | { kind: 'caster'; size: number }
  | { kind: 'board'; w: number; t: number; d: number; holes?: [number, number][]; hd?: number }
  | { kind: 'tray'; length: number; w: number; h: number }
  | { kind: 'plate'; w: number; h: number; t: number }
  | { kind: 'cap'; w: number; d: number }
  | { kind: 'rod'; d: number; length: number; axis: 'x' | 'y' | 'z' }
  | { kind: 'collar'; d: number }
  | { kind: 'flange'; d: number }
  | { kind: 'tclamp'; d: number }
  | { kind: 'cross'; d: number }
  | { kind: 'rodCap'; d: number }

export type PartGroup = 'leg' | 'beam' | 'brace' | 'bracket' | 'foot' | 'top' | 'accessory'

export interface Part {
  id: string
  name: string
  /** 标签上显示的规格，例如 "4040 · 692mm" */
  spec: string
  group: PartGroup
  geo: GeoSpec
  position: V3
  quaternion?: Q4
  /** 安装动画起点相对最终位置的偏移 */
  enterFrom: V3
  /** 入场动画延迟（秒），缺省按 group 决定 */
  delay?: number
}

export interface Chip {
  label: string
  sub?: string
}

export type DetailKind =
  | 'tnut'
  | 'dropin'
  | 'bracket'
  | 'internal'
  | 'leveler'
  | 'caster'
  | 'topScrew'
  | 'square'
  | 'plate'
  | 'cap'
  | 'tray'
  | 'wobble'
  | 'sag'
  | 'collar'
  | 'shelf'
  | 'shelfRest'
  | 'flange'
  | 'flangeRod'
  | 'tclamp'
  | 'tclampTop'
  | 'cross'
  | 'rodFoot'
  | 'rodCap'
  | 'rodPad'
  | 'level'
  | 'rodWobble'

export type Overlay = 'dims' | 'diagonals' | 'load'

export type Motion = 'enter' | 'explode' | 'wiggle' | 'swap' | 'none'

export interface ToolSpec {
  at: V3
  /** 螺丝轴向（扳手短臂方向，指向螺丝头外侧） */
  axis: V3
  size: number
}

export interface Step {
  id: string
  title: string
  desc: string
  chips: Chip[]
  /** 本步高亮（红色）的零件 */
  active: string[]
  motion: Motion
  focus: V3
  view: { dir: V3; dist: number }
  /** 红圈与细节引线指向的位置，缺省为 tool.at 或 focus */
  marker?: V3
  detail?: DetailKind
  tool?: ToolSpec
  overlays?: Overlay[]
  /** 当前配置中不存在、但建议加装的零件（红色虚影） */
  suggest?: Part[]
  autoRotate?: boolean
  tip?: string
  /** flipped：整件家具倒置（桌面朝下组装），坐标仍按正放填写 */
  pose?: 'flipped'
  /** 说明书场景：本步的起止状态、动作与标注 */
  scene?: SceneStep
}

export interface Guide {
  id: string
  kind: 'assembly' | 'usage' | 'repair'
  title: string
  summary: string
  /** progressive：只显示已安装零件；all：显示整机 */
  visibility: 'progressive' | 'all'
  steps: Step[]
  /** 零件 id → 安装步骤索引（progressive 模式使用） */
  installAt: Record<string, number>
}

export interface CutItem {
  key: string
  name: string
  /** 型材型号或光轴规格 */
  profile: string
  length: number
  qty: number
  note?: string
}

export interface HwItem {
  key: string
  name: string
  spec: string
  qty: number
  unit?: string
  price: number
}

export interface Rating {
  level: 'good' | 'ok' | 'warn'
  label: string
}

export interface Metric {
  label: string
  value: string
  note?: string
  level?: Rating['level']
}

/** 所有家具模型共用的部分：场景、清单、面板只依赖这些字段 */
export interface ModelBase {
  product: ProductId
  name: string
  /** 外形尺寸（尺寸标注用），模型以 x=0、z=0 为中心，地面 y=0 */
  dims: { width: number; depth: number; height: number }
  parts: Part[]
  byId: Record<string, Part>
  cutList: CutItem[]
  /** 清单页的材料名称与下单备注 */
  cutTitle: string
  cutNote: string
  hardware: HwItem[]
  tools: string[]
  stats: { weightKg: number; priceCny: number; minutes: number }
  warnings: string[]
  metrics: Metric[]
  /** 爆炸图中心 */
  center: V3
  designView: { focus: V3; dist: number }
  overlay: {
    diag?: { y: number; x: number; front: number; back: number; zc: number }
    load?: { y: number; w: number; d: number; kg: number }
  }
}
