import { compileManual, type ManualModel } from '../compile'
import type { ManualSpec } from '../types'
import type { Guide } from '../../types'
import { IMPORTED, IMPORTED_CATEGORY } from './imported'

/** 新增说明书：在本目录写一个导出 ManualSpec 的 .ts 文件即可，自动注册；网页导入的见 imported.ts */
const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./index.ts', '!./imported.ts'], { eager: true })

/** 菜单（以及社区首页分类）里的品类顺序；没列出的品类排在最后 */
export const CATEGORY_ORDER = [
  IMPORTED_CATEGORY, '电子产品', '游戏机', '智能摄像头', '扫地机器人', '清洁电器', '小厨电', '净水器', '空调', '卫浴',
  '路由器', '智能门锁', '打印机', '电脑装机', '平板家具', '婴儿推车', '电动出行', '安全应急',
  '折纸', '立体书', '物理原理', '机械结构',
]

const isSpec = (v: unknown): v is ManualSpec =>
  !!v && typeof v === 'object' && 'id' in v && 'parts' in v && 'guides' in v && Array.isArray((v as ManualSpec).guides)

const rank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c)
  return i < 0 ? CATEGORY_ORDER.length : i
}

export const MANUALS: ManualSpec[] = [...Object.values(modules).flatMap((m) => Object.values(m).filter(isSpec)), ...IMPORTED]
  .sort((a, b) => rank(a.category) - rank(b.category) || a.id.localeCompare(b.id))

const compiled = new Map<string, { model: ManualModel; guides: Guide[] }>()

export function getManual(id: string) {
  let c = compiled.get(id)
  if (!c) {
    const spec = MANUALS.find((m) => m.id === id)
    if (!spec) return null
    c = compileManual(spec)
    compiled.set(id, c)
  }
  return c
}

export const isManualProduct = (p: string): p is `manual:${string}` => p.startsWith('manual:') && MANUALS.some((m) => `manual:${m.id}` === p)
