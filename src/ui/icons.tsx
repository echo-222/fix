import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
})

export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
)
export const IconChevron = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m7 10 5 5 5-5" /></svg>
export const IconLeft = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M19 12H5m6-6-6 6 6 6" /></svg>
export const IconRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
export const IconClose = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const IconUpload = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 16V4m-5 5 5-5 5 5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>
export const IconCheck = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
export const IconRuler = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m3.5 15.5 12-12 5 5-12 12z" /><path d="m7.5 11.5 2 2m1-5 2 2m1-5 2 2" /></svg>
)
export const IconList = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>
export const IconWrench = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2zM14.5 6.5l3-3" /></svg>
)
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z" /></svg>
)
export const IconBox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>
)
export const IconHeart = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20z" /></svg>
)
export const IconStar = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}><path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z" /></svg>
)
export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5.5 18.5 4 21l4-1.6c1.2.4 2.6.6 4 .6 4.7 0 8.5-3.4 8.5-7.5S16.7 5 12 5 3.5 8.4 3.5 12.5c0 2.3 1.2 4.4 3 5.8" /></svg>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
export const IconMinus = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14" /></svg>
/** 广场视图：等轴地砖 */
export const IconPlaza = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5 21 10 12 15 3 10z" /><path d="M7.5 7.5 16.5 12.5M16.5 7.5 7.5 12.5" /><path d="M3 14l9 5 9-5" /></svg>
)
/** 卡片视图：瀑布流 */
export const IconCards = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="4" width="7" height="9" rx="1.6" /><rect x="13" y="4" width="7" height="6" rx="1.6" /><rect x="4" y="15" width="7" height="5" rx="1.6" /><rect x="13" y="12" width="7" height="8" rx="1.6" /></svg>
)
export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
)
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
)
export const IconEdit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
)
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4.5 7h15M10 4h4M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M10 11v6M14 11v6" /></svg>
)
export const IconImage = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></svg>
)
export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>
)
export const IconCube3d = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /><path d="M17.5 2.5a8 8 0 0 1 3 3" strokeDasharray="1.5 2" /></svg>
)
