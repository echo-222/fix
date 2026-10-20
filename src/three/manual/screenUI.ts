import type { ScreenUI } from '../../domain/manual/types'

const INK = '#161616'
const ACCENT = '#e8462f'
const MUTED = '#8a857c'
const LINE = '#d9d4ca'
const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 线稿风格的系统界面。ui 为空时画桌面 */
export function drawScreen(ctx: CanvasRenderingContext2D, ui: ScreenUI | null, W: number, H: number) {
  const s = W / 1024
  ctx.save()
  ctx.scale(s, s)
  const w = 1024
  const h = H / s
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'middle'

  // 任务栏
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, h - 46)
  ctx.lineTo(w, h - 46)
  ctx.stroke()
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, w / 2 - 110 + i * 46, h - 36, 28, 26, 6)
    ctx.stroke()
  }

  if (!ui || (!ui.app && !ui.title && !ui.items?.length && !ui.button)) {
    if (ui?.toast) drawToast(ctx, ui.toast, w, h)
    ctx.strokeStyle = LINE
    for (let i = 0; i < 4; i++) {
      roundRect(ctx, 40, 40 + i * 96, 56, 56, 10)
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  const x0 = 70
  const x1 = w - 70
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  roundRect(ctx, 40, 30, w - 80, h - 100, 14)
  ctx.stroke()
  // 窗口标题栏
  ctx.fillStyle = INK
  ctx.font = `500 26px ${FONT}`
  ctx.fillText(ui.app ?? '设置', x0, 64)
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(x1 - 10 - i * 30, 64, 8, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(40, 96)
  ctx.lineTo(w - 40, 96)
  ctx.stroke()

  let y = 140
  if (ui.title) {
    ctx.fillStyle = INK
    ctx.font = `600 40px ${FONT}`
    ctx.fillText(ui.title, x0, y)
    y += 58
  }
  for (const it of ui.items ?? []) {
    const sel = it.state === 'selected'
    ctx.strokeStyle = sel ? ACCENT : INK
    ctx.lineWidth = sel ? 4 : 2
    roundRect(ctx, x0, y, x1 - x0, 66, 10)
    ctx.stroke()
    ctx.fillStyle = sel ? ACCENT : it.state === 'muted' ? MUTED : INK
    ctx.font = `${sel ? 600 : 500} 30px ${FONT}`
    ctx.fillText(it.text, x0 + 24, y + 33)
    if (it.sub) {
      ctx.font = `400 24px ${FONT}`
      ctx.fillStyle = it.state === 'done' ? INK : MUTED
      const tw = ctx.measureText(it.sub).width
      ctx.fillText(it.sub, x1 - 24 - tw, y + 33)
    }
    if (it.state === 'done') {
      ctx.strokeStyle = INK
      ctx.lineWidth = 3.5
      const tw = it.sub ? ctx.measureText(it.sub).width : 0
      const cx = x1 - 50 - tw
      ctx.beginPath()
      ctx.moveTo(cx - 12, y + 33)
      ctx.lineTo(cx - 3, y + 42)
      ctx.lineTo(cx + 13, y + 24)
      ctx.stroke()
    }
    y += 80
  }
  if (ui.button) {
    ctx.font = `600 28px ${FONT}`
    const bw = ctx.measureText(ui.button).width + 56
    roundRect(ctx, x0, y + 6, bw, 58, 29)
    if (ui.buttonActive) {
      ctx.fillStyle = ACCENT
      ctx.fill()
      ctx.fillStyle = '#ffffff'
    } else {
      ctx.strokeStyle = INK
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = INK
    }
    ctx.fillText(ui.button, x0 + 28, y + 35)
  }
  if (ui.toast) drawToast(ctx, ui.toast, w, h)
  ctx.restore()
}

function drawToast(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.font = `500 28px ${FONT}`
  const tw = Math.max(300, ctx.measureText(text).width + 70)
  const tx = w - 60 - tw
  const ty = h - 170
  roundRect(ctx, tx, ty, tw, 92, 14)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.fillStyle = ACCENT
  ctx.beginPath()
  ctx.arc(tx + 30, ty + 46, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(text, tx + 52, ty + 46)
}
