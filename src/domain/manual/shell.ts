import type { Shape } from './types'

export type ShellShape = Extract<Shape, { type: 'shell' }>

export function shellParams(s: ShellShape) {
  return {
    a: s.w / 2,
    b: s.l / 2,
    h: s.h,
    base: s.base ?? Math.min(6, s.h * 0.3),
    n: s.n ?? 2.4,
    taper: s.taper ?? 0,
    peak: s.peak ?? 0.2,
  }
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)

/** 俯视轮廓上 θ 方向、归一化半径 u 处的点 [x, z]；θ = -90° 为前端（-z） */
export function shellPoint(s: ShellShape, theta: number, u: number): [number, number] {
  const p = shellParams(s)
  const z = p.b * sgnPow(Math.sin(theta), 2 / p.n) * u
  const ax = p.a * (1 - p.taper * (1 - z / p.b) / 2)
  return [ax * sgnPow(Math.cos(theta), 2 / p.n) * u, z]
}

/** 归一化半径 u（0 中心，1 轮廓）与前后位置 zn 处的顶面高度 */
export function shellHeightAt(s: ShellShape, u: number, zn: number) {
  const p = shellParams(s)
  const crown = 1 - 0.22 * Math.pow(zn - p.peak, 2)
  return p.base + (p.h - p.base) * (1 - Math.pow(Math.min(1, u), 2.2)) * crown
}

/** 局部坐标 (x, z) 处的顶面高度，超出轮廓返回 base */
export function shellTopY(s: ShellShape, x: number, z: number) {
  const p = shellParams(s)
  const ax = p.a * (1 - p.taper * (1 - z / p.b) / 2)
  const u = Math.pow(Math.pow(Math.abs(x / ax), p.n) + Math.pow(Math.abs(z / p.b), p.n), 1 / p.n)
  return shellHeightAt(s, u, z / p.b)
}
