import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
})

export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>
)
export const IconChevron = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m7 10 5 5 5-5" /></svg>
export const IconPlay = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M8 5.5v13l10.5-6.5z" /></svg>
export const IconPause = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 5.5v13M15 5.5v13" /></svg>
export const IconZoom = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.2v5.6M8.2 11h5.6" /></svg>
)
export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0z" /><circle cx="8" cy="8" r="1.4" /></svg>
)
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
