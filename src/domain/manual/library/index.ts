import { compileManual, type ManualModel } from '../compile'
import type { ManualSpec } from '../types'
import type { Guide } from '../../types'
import { mouseBt54 } from './mouse-bt54'

/** 新增说明书：写好 ManualSpec 后加到这里 */
export const MANUALS: ManualSpec[] = [mouseBt54]

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
