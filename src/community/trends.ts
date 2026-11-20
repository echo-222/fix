import { create } from 'zustand'
import { apiFetch } from '../net'

/**
 * 广场的热度（server/trends.ts 的 GET /api/trends）：后台联网监控到正火的产品，
 * 只含广场上看得到的说明书（库里已有的、热榜自动发布的）。首页排序时加权、卡片和名牌上标「热门 No.N」。
 */
export interface Hot {
  product: string
  heat: number
  rank: number
  name: string
  why: string
}

export const HOT_CAT = '热门'
/** 热度（0–100）折进首页推荐分的系数：满分热度约等于一份新发布说明书的新鲜度加成 */
export const HEAT_WEIGHT = 0.5

export const useTrends = create<{ hot: Map<string, Hot>; load: () => Promise<void> }>()((set) => ({
  hot: new Map(),
  load: async () => {
    try {
      const r = await apiFetch('/api/trends')
      if (!r.ok || !r.headers.get('content-type')?.includes('json')) return
      const { items } = (await r.json()) as { items: Hot[] }
      set({ hot: new Map(items.map((h) => [h.product, h])) })
    } catch {
      // 断网、静态预览：没有热度就按原来的排
    }
  },
}))
