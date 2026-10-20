/**
 * 光轴与配套标准件规格。
 * 来源：NB / HengLi SHF 法兰支座样本、Stafford 固定环样本、淘宝光轴 DIY 配件常见规格（十字夹 / T 型夹 / 限位环）。
 * 价格为 2026 年电商零售参考价。
 */

export type ShaftD = 10 | 12 | 16 | 20
export const SHAFT_DS: ShaftD[] = [10, 12, 16, 20]

export type ShaftMaterial = 'chrome' | 'stainless'
export const MATERIAL: Record<ShaftMaterial, { name: string; short: string; priceK: number; note: string }> = {
  chrome: { name: '镀铬光轴（45# 钢 / GCr15）', short: '镀铬', priceK: 1, note: '最常见，亮面；镀层怕水，厨卫阳台慎用' },
  stainless: { name: '304 不锈钢光轴', short: '304 不锈钢', priceK: 1.9, note: '耐潮湿，价格约为镀铬的 2 倍' },
}

export interface ShaftSpec {
  d: ShaftD
  kgPerM: number
  pricePerM: number
  /** 轴端攻丝规格（装脚垫 / 调节脚） */
  endTap: 'M5' | 'M6' | 'M8' | 'M10'
  /** 截面惯性矩 mm⁴ */
  I: number
}

const steelKgPerM = (d: number) => (7.85e-3 * Math.PI * d * d) / 4

export const SHAFT: Record<ShaftD, ShaftSpec> = {
  10: { d: 10, kgPerM: steelKgPerM(10), pricePerM: 12, endTap: 'M5', I: (Math.PI * 10 ** 4) / 64 },
  12: { d: 12, kgPerM: steelKgPerM(12), pricePerM: 16, endTap: 'M6', I: (Math.PI * 12 ** 4) / 64 },
  16: { d: 16, kgPerM: steelKgPerM(16), pricePerM: 26, endTap: 'M8', I: (Math.PI * 16 ** 4) / 64 },
  20: { d: 20, kgPerM: steelKgPerM(20), pricePerM: 38, endTap: 'M10', I: (Math.PI * 20 ** 4) / 64 },
}

export const E_STEEL = 206000

/** 顶丝式限位环（固定环）。holdKg 为擦净防锈油后单个环的经验防滑承载 */
export const COLLAR: Record<ShaftD, { od: number; w: number; screw: 'M5' | 'M6'; key: number; holdKg: number; price: number }> = {
  10: { od: 20, w: 10, screw: 'M5', key: 2.5, holdKg: 20, price: 1.5 },
  12: { od: 22, w: 12, screw: 'M5', key: 2.5, holdKg: 30, price: 1.8 },
  16: { od: 28, w: 12, screw: 'M6', key: 3, holdKg: 45, price: 2.5 },
  20: { od: 32, w: 14, screw: 'M6', key: 3, holdKg: 60, price: 3.5 },
}

/** SHF 法兰型光轴支座：W 长、L 总高、T 法兰厚、F 法兰宽、G 轴套外径、B 孔距、S 孔径 */
export const SHF: Record<ShaftD, { W: number; L: number; T: number; F: number; G: number; B: number; S: number; clamp: 'M4' | 'M5'; key: number; price: number }> = {
  10: { W: 43, L: 10, T: 5, F: 24, G: 20, B: 32, S: 5.5, clamp: 'M4', key: 3, price: 3 },
  12: { W: 47, L: 13, T: 7, F: 28, G: 25, B: 36, S: 5.5, clamp: 'M4', key: 3, price: 3.5 },
  16: { W: 50, L: 16, T: 8, F: 31, G: 28, B: 40, S: 5.5, clamp: 'M4', key: 3, price: 4.5 },
  20: { W: 60, L: 20, T: 8, F: 37, G: 34, B: 48, S: 7, clamp: 'M5', key: 4, price: 6 },
}

/** 铝制十字夹 / T 型夹：a 为单个夹块边长 */
export const CLAMP: Record<ShaftD, { a: number; screw: 'M4' | 'M5' | 'M6'; key: number; cross: number; tee: number }> = {
  10: { a: 20, screw: 'M4', key: 3, cross: 4, tee: 4 },
  12: { a: 24, screw: 'M5', key: 4, cross: 5, tee: 5 },
  16: { a: 30, screw: 'M5', key: 4, cross: 7, tee: 7 },
  20: { a: 36, screw: 'M6', key: 5, cross: 10, tee: 10 },
}

export type Wood = 'pine' | 'rubber' | 'walnut'
export const WOOD: Record<Wood, { name: string; density: number; pricePerM2: number }> = {
  pine: { name: '松木直拼板', density: 450, pricePerM2: 120 },
  rubber: { name: '橡胶木指接板', density: 650, pricePerM2: 180 },
  walnut: { name: '北美黑胡桃', density: 650, pricePerM2: 900 },
}

export const WOOD_OPTIONS = (Object.keys(WOOD) as Wood[]).map((k) => ({ value: k, label: WOOD[k].name.replace(/直拼板|指接板/, '') }))
export const D_OPTIONS = SHAFT_DS.map((d) => ({ value: d, label: `Ø${d}` }))
