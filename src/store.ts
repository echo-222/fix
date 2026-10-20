import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CONFIG, PRESETS, generateDesk, type DeskConfig } from './domain/desk'
import { buildGuides } from './domain/guides'
import { SHAFT_DEFAULTS, buildShaft, type AnyModel, type ShaftConfigs, type ShaftKind } from './domain/products'
import { getManual, isManualProduct } from './domain/manual/library'
import type { Guide, ProductId } from './domain/types'

/** 动画时钟放在 store 外，避免每帧触发 React 渲染 */
export const anim = { start: performance.now() }
export const restartAnim = () => {
  anim.start = performance.now()
}

export type Panel = 'none' | 'design' | 'bom'

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
  panel: Panel
  menuOpen: boolean
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
  toggle: (k: 'showDetail' | 'showLabels' | 'showGhost' | 'menuOpen' | 'importOpen') => void
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
      panel: 'none',
      menuOpen: false,
      importOpen: false,
      source: { kind: 'custom', title: DEFAULT_CONFIG.name },
      viewNonce: 0,

      setProduct: (id) => {
        const s = get()
        const d = derive(id, s.config, s.shaft)
        set({
          ...d, guideId: d.guides[0].id, stepIndex: 0, playing: false, menuOpen: false,
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
        set({ ...d, source, guideId: 'assembly', stepIndex: 0, panel: 'none', importOpen: false, menuOpen: false, playing: false, viewNonce: get().viewNonce + 1 })
        restartAnim()
      },
      setGuide: (id) => {
        set({ guideId: id, stepIndex: 0, playing: false, panel: 'none', menuOpen: false })
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
      next: () => get().go(get().stepIndex + 1),
      prev: () => get().go(get().stepIndex - 1),
      setPlaying: (v) => {
        const g = currentGuide(get())
        if (v && get().stepIndex >= g.steps.length - 1) {
          set({ stepIndex: 0 })
          restartAnim()
        }
        set({ playing: v, panel: v ? 'none' : get().panel })
      },
      toggle: (k) => set({ [k]: !get()[k] } as Partial<State>),
      setPanel: (p) => {
        set({ panel: get().panel === p ? 'none' : p, menuOpen: false, playing: false })
        restartAnim()
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
        const product = validProduct(p.product) ? p.product : 'desk'
        const d = derive(product, { ...DEFAULT_CONFIG, ...(p.config ?? {}) }, shaft)
        return { ...current, ...p, ...d, guideId: d.guides[0].id }
      },
    },
  ),
)

export function currentGuide(s: Pick<State, 'guides' | 'guideId'>): Guide {
  return s.guides.find((g) => g.id === s.guideId) ?? s.guides[0]
}

export const useGuide = () => useApp((s) => currentGuide(s))
