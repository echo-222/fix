// 欧标工业铝型材（6063-T5 阳极氧化）常用规格。
// 数据来源：嘉立创 TXCJ 欧标20、怡合达 欧标30、HA01 欧标40 系列选型手册（理论值，不同厂家略有差异）。

export type ProfileId = '2020' | '3030' | '4040' | '4080'
export type BoltSize = 'M5' | 'M6' | 'M8'

export interface ProfileSpec {
  id: ProfileId
  /** 单个模数边长 mm */
  module: number
  /** 截面：cols × rows 个模数。横放时 cols 为宽、rows 为高；立放时 rows 沿进深方向 */
  cols: number
  rows: number
  /** 槽口宽 mm */
  slot: number
  /** 中心孔直径 mm */
  centerHole: number
  /** 中心孔可攻丝规格 */
  endTap: string
  /** 角码 / T 型螺母配套螺丝 */
  bolt: BoltSize
  /** 理论米重 kg/m */
  kgPerM: number
  /** 截面惯性矩 mm^4：Ix 为水平放置时竖直方向抗弯（高度方向） */
  Ix: number
  Iy: number
  /** 参考价 元/米（2026 电商均价，仅供估算） */
  pricePerM: number
  note: string
}

export const PROFILES: Record<ProfileId, ProfileSpec> = {
  '2020': {
    id: '2020', module: 20, cols: 1, rows: 1, slot: 6.2, centerHole: 5, endTap: 'M6',
    bolt: 'M5', kgPerM: 0.49, Ix: 0.73e4, Iy: 0.73e4, pricePerM: 12,
    note: '轻型，适合小边桌、显示器架、置物架；不建议做 1.2m 以上桌子主梁',
  },
  '3030': {
    id: '3030', module: 30, cols: 1, rows: 1, slot: 8.2, centerHole: 6.8, endTap: 'M8',
    bolt: 'M6', kgPerM: 0.85, Ix: 2.74e4, Iy: 2.74e4, pricePerM: 20,
    note: '性价比最高，1.2–1.4m 书桌框架常用',
  },
  '4040': {
    id: '4040', module: 40, cols: 1, rows: 1, slot: 8.2, centerHole: 6.8, endTap: 'M8',
    bolt: 'M8', kgPerM: 1.6, Ix: 8.4e4, Iy: 8.4e4, pricePerM: 32,
    note: '桌腿首选，稳定性好；欧标 4040 有 8 槽与 10 槽两种，购买配件前需确认',
  },
  '4080': {
    id: '4080', module: 40, cols: 1, rows: 2, slot: 8.2, centerHole: 6.8, endTap: 'M8',
    bolt: 'M8', kgPerM: 2.87, Ix: 62.9e4, Iy: 15.6e4, pricePerM: 58,
    note: '竖放做主梁可显著减少下挠；做桌腿更稳，适合重载工作台',
  },
}

/** 内六角螺丝（DIN912）对应扳手规格 */
export const HEX_KEY: Record<BoltSize, number> = { M5: 4, M6: 5, M8: 6 }

export const BOLT_LEN: Record<BoltSize, number> = { M5: 10, M6: 12, M8: 16 }

export const BRACKET_PRICE: Record<number, number> = { 20: 1.2, 30: 2, 40: 3 }

export function sectionSize(p: ProfileSpec) {
  return { w: p.cols * p.module, h: p.rows * p.module }
}

/** 6063-T5 弹性模量 */
export const E_ALU = 69000 // N/mm^2
