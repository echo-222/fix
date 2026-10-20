import { DEFAULT_CONFIG, normalizeConfig, type DeskConfig } from '../domain/desk'

export type Category = 'aluminum_desk' | 'aluminum_other' | 'other_furniture' | 'not_manual'

export interface ManualSpec {
  category: Category
  productName: string
  confidence: number
  parts: { name: string; spec: string; qty: number }[]
  steps: { title: string; detail: string }[]
  evidence: Record<string, string>
  warnings: string[]
  [field: string]: unknown
}

/** 模型可以填写、并映射到 DeskConfig 的字段 */
export const IMPORT_FIELDS = [
  ['width', '桌面宽', 'mm'],
  ['depth', '桌面进深', 'mm'],
  ['height', '桌面高', 'mm'],
  ['overhang', '桌面外伸', 'mm'],
  ['legProfile', '桌腿型材', ''],
  ['beamProfile', '横梁型材', ''],
  ['connector', '连接方式', ''],
  ['feet', '脚', ''],
  ['lowerBrace', '下横撑', ''],
  ['braceHeight', '下横撑离地', 'mm'],
  ['centerBeam', '中间加强梁', ''],
  ['cableTray', '理线槽', ''],
  ['backFrame', '后挂架', ''],
  ['backFrameHeight', '挂架高度', 'mm'],
  ['topThickness', '桌面板厚', 'mm'],
] as const

type ImportField = (typeof IMPORT_FIELDS)[number][0]

const ENUMS: Partial<Record<ImportField, readonly string[]>> = {
  legProfile: ['3030', '4040', '4080'],
  beamProfile: ['2020', '3030', '4040', '4080'],
  connector: ['bracket', 'internal'],
  feet: ['leveler', 'caster'],
  lowerBrace: ['none', 'u', 'full'],
}

export const VALUE_LABELS: Record<string, string> = {
  bracket: '角码', internal: '内置连接件', leveler: '调节脚杯', caster: '脚轮',
  none: '无', u: 'U 型（两侧 + 后）', full: '四周', on: '有', off: '无', auto: '自动',
  true: '有', false: '无',
}

export interface ImportResult {
  spec: ManualSpec
  config: DeskConfig
  sources: Partial<Record<ImportField, 'manual' | 'default'>>
  mode: 'ai' | 'demo'
  model?: string
  note?: string
}

export function specToConfig(spec: ManualSpec): Pick<ImportResult, 'config' | 'sources'> {
  const cfg: DeskConfig = { ...DEFAULT_CONFIG, name: spec.productName || DEFAULT_CONFIG.name }
  const sources: ImportResult['sources'] = {}
  const target = cfg as unknown as Record<string, unknown>
  for (const [key] of IMPORT_FIELDS) {
    const v = spec[key]
    let ok = false
    if (ENUMS[key]) ok = typeof v === 'string' && ENUMS[key]!.includes(v)
    else if (key === 'centerBeam') ok = typeof v === 'boolean'
    else if (key === 'cableTray' || key === 'backFrame') ok = typeof v === 'boolean'
    else ok = typeof v === 'number' && Number.isFinite(v) && v > 0
    if (ok) {
      target[key] = key === 'centerBeam' ? (v ? 'on' : 'off') : v
      sources[key] = 'manual'
    } else sources[key] = 'default'
  }
  return { config: normalizeConfig(cfg), sources }
}

export async function getAiStatus(): Promise<{ configured: boolean; model: string | null }> {
  try {
    const r = await fetch('/api/status')
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return { configured: false, model: null }
  }
}

export async function analyzeManual(images: string[], hint?: string): Promise<ImportResult> {
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, hint }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `解析失败（${r.status}）`)
  const raw = data.result as Partial<ManualSpec>
  const spec: ManualSpec = {
    ...raw,
    category: (raw.category as Category) ?? 'aluminum_desk',
    productName: raw.productName || '导入的铝型材桌',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    evidence: raw.evidence ?? {},
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  }
  return { spec, ...specToConfig(spec), mode: 'ai', model: data.model }
}

export function demoResult(note?: string): ImportResult {
  const spec: ManualSpec = {
    category: 'aluminum_desk',
    productName: '4040 铝型材电脑桌（示例）',
    confidence: 0.86,
    width: 1400,
    depth: 700,
    height: 750,
    overhang: 30,
    legProfile: '4040',
    beamProfile: '4040',
    connector: 'bracket',
    feet: 'leveler',
    lowerBrace: 'u',
    braceHeight: 150,
    centerBeam: true,
    cableTray: true,
    backFrame: null,
    backFrameHeight: null,
    topThickness: 25,
    parts: [
      { name: '4040 铝型材', spec: '695mm（桌腿）', qty: 4 },
      { name: '4040 铝型材', spec: '1260mm（前后横梁）', qty: 2 },
      { name: '4040 铝型材', spec: '560mm（侧横梁 / 下横撑）', qty: 4 },
      { name: '4040 角码', spec: '带定位筋', qty: 36 },
      { name: 'M8×16 内六角螺丝 + T 型螺母', spec: '', qty: 72 },
      { name: 'M8 调节脚杯', spec: 'Ø40', qty: 4 },
    ],
    steps: [
      { title: '组装两侧框架', detail: '桌腿与侧横梁用角码连接' },
      { title: '连接前后横梁', detail: '' },
      { title: '安装下横撑', detail: '离地 150mm' },
      { title: '安装桌面', detail: '固定片从下方固定' },
    ],
    evidence: {
      width: '零件表：前后横梁 1260 + 2×40 桌腿 + 2×30 外伸 = 1400',
      height: '桌腿 695 + 桌面 25 + 脚杯 ≈ 750',
      legProfile: '零件表标注「4040 铝型材」',
      lowerBrace: '第 3 步图示：两侧 + 后方各一根下横撑',
      centerBeam: '第 2 步图示中间有一根纵向梁',
      cableTray: '配件清单含「理线槽 ×1」',
    },
    warnings: ['未在说明书中找到挂架信息，已按「无」处理。'],
  }
  return { spec, ...specToConfig(spec), mode: 'demo', note }
}

/** 压缩到长边 1600px 的 JPEG，减小上传体积 */
export function compressImage(file: File, maxSide = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * s)
      canvas.height = Math.round(img.height * s)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`无法读取图片：${file.name}`))
    }
    img.src = url
  })
}
