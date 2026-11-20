// 品牌图标：npm run icons。图形参数都在 scripts/brand-icon.mjs，这里把它写成：
//   public/logo.svg（透明底，首页左上角、README、主屏图标用）
//   public/favicon.svg（白底圆角、线条加粗，16px 的浏览器标签也看得清）
//   index.html 等待页里 icons:start / icons:end 之间的 SVG 和灯丝 keyframes
//   public/apple-touch-icon.png（180×180，iOS 添加到主屏幕）
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { faviconSvg, logoSvg, splash } from './brand-icon.mjs'
import { CHROME, attach, launchChrome, sleep } from './headless.mjs'

const SIZE = 180
const MARK = 132

writeFileSync('public/logo.svg', logoSvg())
writeFileSync('public/favicon.svg', faviconSvg())
console.log('  public/logo.svg、public/favicon.svg')

/** 替换 start 和 end 标记之间的内容，缩进跟着 start 标记所在的行 */
function splice(text, start, end, body) {
  const a = text.indexOf(start)
  const b = text.indexOf(end, a)
  if (a < 0 || b < 0) throw new Error(`index.html 里找不到 ${start} … ${end}`)
  const indent = text.slice(text.lastIndexOf('\n', a) + 1, a)
  return text.slice(0, a + start.length) + '\n' + body.split('\n').map((l) => indent + l).join('\n') + '\n' + indent + text.slice(b)
}
const sp = splash()
let html = readFileSync('index.html', 'utf8')
html = splice(html, '/* icons:start */', '/* icons:end */', sp.keyframes)
html = splice(html, '<!-- icons:start -->', '<!-- icons:end -->', sp.svg)
writeFileSync('index.html', html)
console.log('  index.html 等待页')

if (!CHROME) {
  console.error('找不到 Chrome，跳过 apple-touch-icon.png；设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}
const logo = readFileSync('public/logo.svg', 'utf8').replace('<svg ', `<svg width="${MARK}" height="${MARK}" `)
const profile = mkdtempSync(join(tmpdir(), 'icons-'))
const page = join(profile, 'icon.html')
writeFileSync(page, `<!doctype html><body style="margin:0;width:${SIZE}px;height:${SIZE}px;display:grid;place-items:center;background:#fff">${logo}</body>`)
const chrome = launchChrome(profile, { width: SIZE, height: SIZE })
try {
  const cdp = await attach(chrome)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: SIZE, height: SIZE, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `file://${page}` })
  await sleep(300)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE, scale: 1 } })
  writeFileSync('public/apple-touch-icon.png', Buffer.from(shot.data, 'base64'))
  console.log('  public/apple-touch-icon.png')
} finally {
  const exited = new Promise((r) => chrome.once('exit', r))
  chrome.kill()
  await exited
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}
