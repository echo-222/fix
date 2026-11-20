// 广场首页的等轴模型图：npm run plaza [-- <产品 id>...]
// 启动 Vite，用无头 Chrome 打开 #/sprite/<产品>（正交 45° 相机、透明背景、柔光外观），等模型加载、动作做完后
// 按模型包围盒取景再截图，存成 public/plaza/<slug>.webp（带透明通道），取景信息写进 src/community/plaza.json。
// 网页导入的说明书不出图（广场上显示占位）。截完逐张看。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { CHROME, attach, launchChrome, sleep, waitFor } from './headless.mjs'
import { PICK, PLAZA_HIDE, PLAZA_PICK, slugOf } from './picks.mjs'

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('--')).map((a) => (a.includes(':') || ['desk', 'shelf', 'table', 'rack'].includes(a) ? a : `manual:${a}`))
const out = resolve('public/plaza')
const metaFile = resolve('src/community/plaza.json')
const size = { width: 300, height: 300 }
const MODELS_READY = `!(window.__modelsPending > 0)`
mkdirSync(out, { recursive: true })

if (!CHROME) {
  console.error('找不到 Chrome，设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}

const vite = await createServer({ server: { host: '127.0.0.1', port: 5197, hmr: false, watch: null }, logLevel: 'error' })
await vite.listen()
const appUrl = vite.resolvedUrls.local[0]
const profile = mkdtempSync(join(tmpdir(), 'plaza-'))
const chrome = launchChrome(profile, size)
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {}

let failed = false
try {
  const cdp = await attach(chrome)
  const errors = []
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text))
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: false })
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await cdp.send('Page.navigate', { url: `${appUrl}#/sprite/desk` })
  await waitFor(cdp, `!!document.querySelector('.sprite-stage canvas')`, 30000)

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const all = await evaluate(`(async () => {
    const { PRODUCTS } = await import('/src/domain/products.ts')
    const { IMPORTED_CATEGORY } = await import('/src/domain/manual/library/imported.ts')
    return PRODUCTS.filter((p) => p.family !== IMPORTED_CATEGORY).map((p) => p.id)
  })()`)
  const list = only.length ? all.filter((id) => only.includes(id)) : all
  for (const id of only) if (!all.includes(id)) console.warn(`  跳过 ${id}：说明书库里没有`)

  for (const id of list) {
    const pick = (PLAZA_PICK[id] ?? PICK[id])?.split('/').slice(0, 2).join('/')
    const hide = PLAZA_HIDE[id] ? `?hide=${PLAZA_HIDE[id].join(',')}` : ''
    const hash = `#/sprite/${encodeURIComponent(id)}${pick ? `/${pick}` : ''}${hide}`
    await evaluate(`location.hash = ${JSON.stringify(hash)}`)
    await waitFor(cdp, `(document.body.dataset.sprite || '').startsWith(${JSON.stringify(id + ':')})`, 15000)
    await sleep(400)
    await waitFor(cdp, MODELS_READY, 60000)
    // 零件动作最长 2 s 左右，做完再按最终姿态取景
    await sleep(3000)
    const fit = await evaluate(`window.__spriteFit ? window.__spriteFit() : null`)
    if (!fit) throw new Error(`${id}：画面里没有模型`)
    await sleep(300)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 86 })
    const slug = slugOf(id)
    writeFileSync(join(out, `${slug}.webp`), Buffer.from(shot.data, 'base64'))
    meta[slug] = { top: +fit.top.toFixed(3), left: +fit.left.toFixed(3), right: +fit.right.toFixed(3) }
    console.log(`  ✓ ${id} → public/plaza/${slug}.webp`)
  }
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n')
  if (errors.length) {
    console.warn(`页面报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 5)) console.warn('  ' + e)
  }
} catch (e) {
  failed = true
  console.error(e)
} finally {
  chrome.kill('SIGKILL')
  await sleep(500)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
  await vite.close()
}
process.exit(failed ? 1 : 0)
