/**
 * 演示页 3D 舞台的底色和地面虚线网格的线色。底色画在透明画布后面（CSS，可以是渐变）。
 * 默认 white 和首页地面一样：白底、#cdcdcd 灰色虚线格。封面渲染页固定用 white。
 * 预览别的配色：在地址的 # 前面加 ?stage=<名字>，例如 /?stage=stone#/note/m-dyson-v12
 */
export interface StageTone { label: string; bg: string; line: string }

export const STAGE_TONES = {
  white: { label: '纯白', bg: '#ffffff', line: '#cdcdcd' },
  mist: { label: '雾灰', bg: '#f2f2f0', line: '#c4c4c0' },
  stone: { label: '石灰', bg: '#e6e5e1', line: '#b8b6b0' },
  cream: { label: '奶黄', bg: '#fbf5e3', line: '#dccb98' },
  spot: {
    label: '聚光',
    bg: 'radial-gradient(115% 85% at 50% 44%, #ffffff 0%, #f5f4f1 42%, #e2e0db 100%)',
    line: '#c8c7c2',
  },
  studio: {
    label: '影棚',
    bg: 'linear-gradient(180deg, #fbfbfa 0%, #f1f0ec 50%, #e1dfd9 100%)',
    line: '#c6c4bd',
  },
  gallery: {
    label: '展厅',
    bg: 'linear-gradient(180deg, #f4f3f0 0%, #e9e8e4 48%, #dfddd7 100%)',
    line: '#bdbbb4',
  },
} satisfies Record<string, StageTone>

export type StageName = keyof typeof STAGE_TONES

const DEFAULT_STAGE: StageName = 'white'

function asked(): StageName {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('stage')
  return q && q in STAGE_TONES ? (q as StageName) : DEFAULT_STAGE
}

export const STAGE: StageTone = STAGE_TONES[asked()]
