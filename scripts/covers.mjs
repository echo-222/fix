// 社区首页的笔记封面：npm run covers [-- <产品 id>...]
// 启动 Vite，用无头 Chrome 打开 #/cover/<产品>（只有 3D 画面、真实外观打开），等模型加载、镜头飞完后截图，
// 存成 public/covers/<slug>.webp（4:5）。默认取第一个指南：安装类取最后一步，其他取第一步；不好看的在 PICK 里指定。
// 网页导入的说明书不出封面（首页显示线稿占位）。截完逐张看。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { CHROME, attach, launchChrome, sleep, waitFor } from './headless.mjs'
import { PICK } from './picks.mjs'

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('--')).map((a) => (a.includes(':') || ['desk', 'shelf', 'table', 'rack'].includes(a) ? a : `manual:${a}`))
const out = resolve('public/covers')
const size = { width: 480, height: 600 }
const MODELS_READY = `!(window.__modelsPending > 0)`
mkdirSync(out, { recursive: true })

if (!CHROME) {
  console.error('找不到 Chrome，设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}

const vite = await createServer({ server: { host: '127.0.0.1', port: 5198, hmr: false, watch: null }, logLevel: 'error' })
await vite.listen()
const appUrl = vite.resolvedUrls.local[0]
const profile = mkdtempSync(join(tmpdir(), 'covers-'))
const chrome = launchChrome(profile, size)

let failed = false
try {
  const cdp = await attach(chrome)
  const errors = []
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text))
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: false })
  await cdp.send('Page.navigate', { url: `${appUrl}#/cover/desk` })
  await waitFor(cdp, `!!document.querySelector('.cover-stage canvas')`, 30000)

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
    const hash = `#/cover/${encodeURIComponent(id)}${PICK[id] ? `/${PICK[id]}` : ''}`
    await evaluate(`location.hash = ${JSON.stringify(hash)}`)
    await waitFor(cdp, `(document.body.dataset.cover || '').startsWith(${JSON.stringify(id + ':')})`, 15000)
    await sleep(400)
    await waitFor(cdp, MODELS_READY, 60000)
    // 镜头飞 1.1 s，零件动作最长 2 s 左右
    await sleep(3000)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 84 })
    const file = join(out, `${id.replace(/^manual:/, '')}.webp`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log(`  ✓ ${id} → ${file.replace(process.cwd() + '/', '')}`)
  }
  if (errors.length) {
    console.warn(`页面报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 5)) console.warn('  ' + e)
  }
} catch (e) {
  failed = true
  console.error(e)
} finally {
  chrome.kill('SIGKILL')
  rmSync(profile, { recursive: true, force: true })
  await vite.close()
}
process.exit(failed ? 1 : 0)
