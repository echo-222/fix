/** 当前步骤焦点在主画布上的屏幕坐标（每帧更新，供引线使用） */
export const focusScreen = { x: 0, y: 0, visible: false }

/** 说明书标注：锚点 (x1, y1) → 标签 (x2, y2) 的屏幕坐标，scene 标识属于哪一步 */
export const calloutScreen: {
  scene: unknown
  items: { x1: number; y1: number; x2: number; y2: number; visible: boolean }[]
} = { scene: null, items: [] }
