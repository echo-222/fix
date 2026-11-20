import { DoubleSide, MeshStandardMaterial } from 'three'
import type { Finish } from '../../domain/manual/types'

type Params = { color: string; roughness: number; metalness?: number }

/** 颜色按真实产品取（MALM 白色贴面、榉木木榫、镀锌偏心件……），环境光是 RoomEnvironment */
const LIBRARY: Record<Exclude<Finish, object>, Params> = {
  'plastic-white': { color: '#f2f2ef', roughness: 0.42 },
  'plastic-grey': { color: '#b9bcbf', roughness: 0.5 },
  'plastic-black': { color: '#2b2c2e', roughness: 0.45 },
  rubber: { color: '#232325', roughness: 0.9 },
  'board-white': { color: '#f1efe9', roughness: 0.62 },
  fiberboard: { color: '#e6e0d4', roughness: 0.85 },
  wood: { color: '#d8b98b', roughness: 0.7 },
  cardboard: { color: '#c7a476', roughness: 0.95 },
  paper: { color: '#f4f2ec', roughness: 0.9 },
  wall: { color: '#e9e8e4', roughness: 0.95 },
  steel: { color: '#b4b8bd', roughness: 0.32, metalness: 1 },
  zinc: { color: '#c2c5c7', roughness: 0.45, metalness: 0.85 },
  hole: { color: '#3a3733', roughness: 0.95 },
}

const cache = new Map<string, MeshStandardMaterial>()

export function finishMaterial(f: Finish): MeshStandardMaterial {
  const key = typeof f === 'string' ? f : JSON.stringify(f)
  let m = cache.get(key)
  if (!m) {
    const p = typeof f === 'string' ? LIBRARY[f] : { roughness: 0.5, ...f }
    // 和线稿填充一样往后推一点深度，描边压在面上不闪
    m = new MeshStandardMaterial({ ...p, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    cache.set(key, m)
  }
  return m
}
