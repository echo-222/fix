import type { DeskModel } from './desk'
import type { ManualModel } from './manual/compile'
import { MANUALS } from './manual/library'
import type { FieldGroup } from './shaft/common'
import { RACK_DEFAULT, RACK_FIELDS, generateRack, rackGuides, type RackConfig, type RackModel } from './shaft/rack'
import { SHELF_DEFAULT, SHELF_FIELDS, generateShelf, shelfGuides, type ShelfConfig, type ShelfModel } from './shaft/shelf'
import { TABLE_DEFAULT, TABLE_FIELDS, generateTable, tableGuides, type TableConfig, type TableModel } from './shaft/sideTable'
import type { Guide, ProductId } from './types'

export type ShaftKind = 'shelf' | 'table' | 'rack'
export type ShaftConfig = ShelfConfig | TableConfig | RackConfig
export type ShaftConfigs = { shelf: ShelfConfig; table: TableConfig; rack: RackConfig }
export type ShaftModelAny = ShelfModel | TableModel | RackModel
export type AnyModel = DeskModel | ShaftModelAny | ManualModel

export const SHAFT_DEFAULTS: ShaftConfigs = { shelf: SHELF_DEFAULT, table: TABLE_DEFAULT, rack: RACK_DEFAULT }

export const PRODUCTS: { id: ProductId; family: string; name: string; desc: string }[] = [
  { id: 'desk', family: '铝型材', name: '铝型材书桌', desc: '4040 框架 · 角码连接 · 可选线槽 / 挂架' },
  { id: 'shelf', family: '光轴', name: '光轴落地置物架', desc: 'Ø12 光轴穿板 · 限位环承托 · 4 层' },
  { id: 'table', family: '光轴', name: '光轴边几', desc: 'SHF 法兰支座 · 倒置组装 · 双层' },
  { id: 'rack', family: '光轴', name: '光轴挂衣架', desc: 'Ø16 光轴 · T 型夹 + 十字夹 · 鞋架' },
  ...MANUALS.map((m) => ({ id: `manual:${m.id}` as const, family: '说明书', name: m.name, desc: m.desc })),
]

export const isManualModel = (m: AnyModel): m is ManualModel => 'scene' in m

export function shaftFields(kind: ShaftKind): FieldGroup<ShaftConfig>[] {
  const map = { shelf: SHELF_FIELDS, table: TABLE_FIELDS, rack: RACK_FIELDS }
  return map[kind] as unknown as FieldGroup<ShaftConfig>[]
}

export function buildShaft(c: ShaftConfig): { model: ShaftModelAny; guides: Guide[] } {
  switch (c.kind) {
    case 'shelf': {
      const model = generateShelf(c)
      return { model, guides: shelfGuides(model) }
    }
    case 'table': {
      const model = generateTable(c)
      return { model, guides: tableGuides(model) }
    }
    case 'rack': {
      const model = generateRack(c)
      return { model, guides: rackGuides(model) }
    }
  }
}
