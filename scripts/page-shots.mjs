// 网页版说明书 → 一组截图 + 文字：node scripts/page-shots.mjs <网址> <输出目录> [最多几张，默认 12]
// 无头 Chrome 1280 宽打开，等加载完、滚一遍触发懒加载，从上往下每 1280×1800 截一张，存成 p01.jpg…；
// 每张范围里的可见文字存进 text.json（数组，和截图一一对应）。热榜（server/trends.ts）拿官网的网页版说明书时用。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHROME, attach, launchChrome, sleep, waitFor } from './headless.mjs'

const [url, out, maxArg] = process.argv.slice(2)
const max = Math.min(20, Number(maxArg) || 12)
const W = 1280
const H = 1800
if (!url || !out || !/^https?:\/\//.test(url)) {
  console.error('用法：node scripts/page-shots.mjs <网址> <输出目录> [最多几张]')
  process.exit(2)
}
if (!CHROME) {
  console.error('找不到 Chrome，设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'page-shots-'))
const chrome = launchChrome(profile, { width: W, height: 900 })
const timer = setTimeout(() => {
  console.error('超时')
  chrome.kill()
  process.exit(1)
}, 120_000)

try {
  const cdp = await attach(chrome)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url })
  await waitFor(cdp, `document.readyState === 'complete'`, 45_000).catch(() => {})
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
  // 滚到底再回来：懒加载的图片、折叠的段落先加载出来
  await evaluate(`(async () => {
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, ${H * max}); y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    scrollTo(0, 0)
  })()`)
  await sleep(1200)
  const height = Math.min(await evaluate('document.documentElement.scrollHeight'), H * max)
  const count = Math.max(1, Math.ceil(height / H))
  // 每张截图范围里的文字：按文字所在元素的位置分到对应的一张
  const texts = await evaluate(`(() => {
    const out = Array.from({ length: ${count} }, () => [])
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent.replace(/\\s+/g, ' ').trim()
      const el = n.parentElement
      if (!s || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const k = Math.floor((r.top + scrollY) / ${H})
      if (k >= 0 && k < ${count}) out[k].push(s)
    }
    return out.map((a) => a.join(' ').slice(0, 6000))
  })()`)
  for (let i = 0; i < count; i++) {
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 82, captureBeyondViewport: true,
      clip: { x: 0, y: i * H, width: W, height: Math.min(H, height - i * H), scale: 1 },
    })
    writeFileSync(join(out, `p${String(i + 1).padStart(2, '0')}.jpg`), Buffer.from(shot.data, 'base64'))
  }
  writeFileSync(join(out, 'text.json'), JSON.stringify(texts ?? []))
  console.log(`截了 ${count} 张（页面高 ${height}px）`)
  cdp.close()
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
