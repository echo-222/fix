import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CONFIG, PRESETS, generateDesk, type DeskConfig } from './domain/desk'
import { buildGuides } from './domain/guides'
import { SHAFT_DEFAULTS, buildShaft, type AnyModel, type ShaftConfigs, type ShaftKind } from './domain/products'
import { hasRealLook, type ManualModel } from './domain/manual/compile'
import { getManual, isManualProduct } from './domain/manual/library'
import type { Guide, ProductId } from './domain/types'

/** 动画时钟放在 store 外，避免每帧触发 React 渲染 */
export const anim = { start: performance.now() }
export const restartAnim = () => {
  anim.start = performance.now()
}

export type Panel = 'none' | 'design' | 'bom' | 'note'

export interface Source {
  kind: 'custom' | 'ai' | 'demo'
  title: string
  notes?: string[]
  manualSteps?: { title: string; detail: string }[]
}

interface State {
  product: ProductId
  config: DeskConfig
  shaft: ShaftConfigs
  model: AnyModel
  guides: Guide[]
  guideId: string
  stepIndex: number
  playing: boolean
  showDetail: boolean
  showLabels: boolean
  showGhost: boolean
  /** 写实（外观模型 + 材质）还是线稿；每次打开产品按 defaultLook 重置，看的时候可以在「设置」里切 */
  realLook: boolean
  panel: Panel
  importOpen: boolean
  source: Source
  /** 切换模板 / 导入时递增，触发相机重新取景 */
  viewNonce: number

  setProduct: (id: ProductId) => void
  setConfig: (patch: Partial<DeskConfig>) => void
  setShaftConfig: (patch: Record<string, unknown>) => void
  applyPreset: (id: string) => void
  applyImported: (config: DeskConfig, source: Source) => void
  setGuide: (id: string) => void
  go: (i: number) => void
  next: () => void
  prev: () => void
  setPlaying: (v: boolean) => void
  toggle: (k: 'showDetail' | 'showLabels' | 'showGhost' | 'realLook' | 'importOpen') => void
  setPanel: (p: Panel) => void
}

function derive(product: ProductId, config: DeskConfig, shaft: ShaftConfigs) {
  if (product === 'desk') {
    const model = generateDesk(config)
    return { product, config: model.config, shaft, model: model as AnyModel, guides: buildGuides(model) }
  }
  if (isManualProduct(product)) {
    const { model, guides } = getManual(product.slice('manual:'.length))!
    return { product, config, shaft, model: model as AnyModel, guides }
  }
  const kind = product as ShaftKind
  const { model, guides } = buildShaft(shaft[kind])
  return { product, config, shaft: { ...shaft, [kind]: model.config }, model: model as AnyModel, guides }
}

/** 有写实外观（外观模型或材质）的默认看写实，只有线稿的看线稿 */
export const defaultLook = (d: { product: ProductId; model: AnyModel }) => isManualProduct(d.product) && hasRealLook(d.model as ManualModel)

const validProduct = (p: unknown): p is ProductId =>
  typeof p === 'string' && (['desk', 'shelf', 'table', 'rack'].includes(p) || isManualProduct(p))

/** 参数变化后保留当前指南与步骤（步骤数可能变化） */
function keepPosition(d: { guides: Guide[] }, guideId: string, stepIndex: number) {
  const guide = d.guides.find((g) => g.id === guideId) ?? d.guides[0]
  return { guideId: guide.id, stepIndex: Math.min(stepIndex, guide.steps.length - 1) }
}

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      ...derive('desk', DEFAULT_CONFIG, SHAFT_DEFAULTS),
      guideId: 'assembly',
      stepIndex: 0,
      playing: false,
      showDetail: true,
      showLabels: false,
      showGhost: true,
      realLook: false,
      panel: 'none',
      importOpen: false,
      source: { kind: 'custom', title: DEFAULT_CONFIG.name },
      viewNonce: 0,

      setProduct: (id) => {
        const s = get()
        const d = derive(id, s.config, s.shaft)
        set({
          ...d, guideId: d.guides[0].id, stepIndex: 0, playing: false, realLook: defaultLook(d),
          panel: s.panel === 'bom' ? 'bom' : 'none',
          source: id === 'desk' && s.product === 'desk' ? s.source : { kind: 'custom', title: d.model.name },
          viewNonce: s.viewNonce + 1,
        })
        restartAnim()
      },
      setConfig: (patch) => {
        const s = get()
        const d = derive('desk', { ...s.config, ...patch }, s.shaft)
        set({ ...d, ...keepPosition(d, s.guideId, s.stepIndex), source: { ...s.source, title: d.model.name } })
      },
      setShaftConfig: (patch) => {
        const s = get()
        if (s.product === 'desk' || isManualProduct(s.product)) return
        const kind = s.product as ShaftKind
        const shaft = { ...s.shaft, [kind]: { ...s.shaft[kind], ...patch } } as ShaftConfigs
        const d = derive(kind, s.config, shaft)
        set({ ...d, ...keepPosition(d, s.guideId, s.stepIndex) })
      },
      applyPreset: (id) => {
        const p = PRESETS.find((x) => x.id === id)
        if (!p) return
        const d = derive('desk', { ...DEFAULT_CONFIG, ...p.config }, get().shaft)
        set({ ...d, source: { kind: 'custom', title: d.model.name }, viewNonce: get().viewNonce + 1 })
        restartAnim()
      },
      applyImported: (config, source) => {
        const d = derive('desk', config, get().shaft)
        set({ ...d, source, guideId: 'assembly', stepIndex: 0, panel: 'none', importOpen: false, playing: false, viewNonce: get().viewNonce + 1 })
        restartAnim()
      },
      setGuide: (id) => {
        set({ guideId: id, stepIndex: 0, playing: false, panel: get().panel === 'note' ? 'note' : 'none' })
        restartAnim()
      },
      go: (i) => {
        const g = currentGuide(get())
        const n = Math.max(0, Math.min(g.steps.length - 1, i))
        if (n !== get().stepIndex || get().panel === 'design') {
          set({ stepIndex: n, panel: get().panel === 'design' ? 'none' : get().panel })
          restartAnim()
        }
      },
      // 指南最后一步再按「下一步」接着进下一个指南的第一步；第一步按「上一步」回到上一个指南的最后一步
      next: () => {
        const s = get()
        const g = currentGuide(s)
        const after = s.guides[s.guides.indexOf(g) + 1]
        if (s.panel !== 'design' && s.stepIndex >= g.steps.length - 1 && after) s.setGuide(after.id)
        else s.go(s.stepIndex + 1)
      },
      prev: () => {
        const s = get()
        const g = currentGuide(s)
        const before = s.guides[s.guides.indexOf(g) - 1]
        if (s.panel !== 'design' && s.stepIndex <= 0 && before) {
          set({ guideId: before.id, stepIndex: before.steps.length - 1, playing: false, panel: s.panel === 'note' ? 'note' : 'none' })
          restartAnim()
        } else s.go(s.stepIndex - 1)
      },
      setPlaying: (v) => {
        const g = currentGuide(get())
        if (v && get().stepIndex >= g.steps.length - 1) {
          set({ stepIndex: 0 })
          restartAnim()
        }
        set({ playing: v, panel: v && get().panel !== 'note' ? 'none' : get().panel })
      },
      toggle: (k) => set({ [k]: !get()[k] } as Partial<State>),
      setPanel: (p) => {
        const before = get().panel
        // 笔记 / 评论面板只是旁边多一栏，不打断正在看的这一步；设计、清单会改场景，重播本步
        const quiet = p === 'note' || before === 'note'
        set({ panel: before === p ? 'none' : p, ...(quiet ? {} : { playing: false }) })
        if (!quiet) restartAnim()
      },
    }),
    {
      name: 'xiuligong-v1',
      partialize: (s) => ({
        product: s.product, config: s.config, shaft: s.shaft,
        showDetail: s.showDetail, showLabels: s.showLabels, showGhost: s.showGhost, source: s.source,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const shaft = {
          shelf: { ...SHAFT_DEFAULTS.shelf, ...(p.shaft?.shelf ?? {}) },
          table: { ...SHAFT_DEFAULTS.table, ...(p.shaft?.table ?? {}) },
          rack: { ...SHAFT_DEFAULTS.rack, ...(p.shaft?.rack ?? {}) },
        }
        // 上次看的说明书可能已经不在了（导入的被删掉）：退回书桌，标题也跟着换
        const valid = validProduct(p.product)
        const product = valid ? p.product! : 'desk'
        const d = derive(product, { ...DEFAULT_CONFIG, ...(p.config ?? {}) }, shaft)
        const source = valid ? p.source : { kind: 'custom' as const, title: d.model.name }
        // 旧版本把 realLook 存在本机，不再沿用
        const { realLook: _old, ...rest } = p
        return { ...current, ...rest, ...d, product, source: source ?? current.source, guideId: d.guides[0].id, realLook: defaultLook(d) }
      },
    },
  ),
)

export function currentGuide(s: Pick<State, 'guides' | 'guideId'>): Guide {
  return s.guides.find((g) => g.id === s.guideId) ?? s.guides[0]
}

export const useGuide = () => useApp((s) => currentGuide(s))
