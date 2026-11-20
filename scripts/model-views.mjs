// 外观模型六向图（无头）：npm run model:views -- public/models/<id>/<name>.glb [...] [--parts] [--explode <k>] [--focus x0,y0,z0,x1,y1,z1] [--out <dir>]
// 和开发服务器上的 /scripts/model-views.html 是同一页，截成 PNG（缺省 shots/model-views/<id>-<name>.png）再用 Read 看，
// 不用开浏览器；几个人同时跑也不冲突（Vite 端口被占会顺延）。
// --focus 只拍包围盒里的一块（按比例，GLB 自己的坐标轴，不是 model.crop 那样 rot 之后的），放大两倍拍，看局部的扳手、支架、裁切处。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { createServer } from 'vite'
import { CHROME, attach, launchChrome, sleep, waitFor } from './headless.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const files = args.filter((a, i) => !a.startsWith('--') && !['--explode', '--out', '--focus'].includes(args[i - 1]))
if (!files.length) {
  console.log('用法：npm run model:views -- public/models/<id>/<name>.glb [...] [--parts] [--explode <k>] [--focus x0,y0,z0,x1,y1,z1] [--out <dir>]')
  process.exit(1)
}
if (!CHROME) {
  console.error('找不到 Chrome，设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}
const out = resolve(flag('--out') ?? join('shots', 'model-views'))
const extra = (args.includes('--parts') ? '&parts=1' : '') + (flag('--explode') ? `&explode=${flag('--explode')}` : '') + (flag('--focus') ? `&focus=${flag('--focus')}` : '')
mkdirSync(out, { recursive: true })

/**
 * 网页导入的说明书目录（IMPORT_DIR，线上不在项目里）走 /imported/（server/imports.ts），public/ 下的按站点路径，
 * 其余按 Vite 的 /@fs/ 访问（例如 models/<id>/raw/ 里的中间结果）
 */
const IMPORTED = resolve(process.env.IMPORT_DIR || join('public', 'imported'))
const urlOf = (file) => {
  const abs = resolve(file)
  const imported = relative(IMPORTED, abs)
  if (!imported.startsWith('..')) return `/imported/${imported}`
  const rel = relative(resolve('public'), abs)
  return rel.startsWith('..') ? `/@fs${abs}` : `/${rel}`
}

/** 文件名前缀用说明书 id（public/models/<id>/、models/<id>/raw/、public/imported/<id>/models/ 都取 <id>），几份说明书同时跑不会互相覆盖 */
const ownerOf = (file) => {
  const segs = resolve(file).split('/')
  const i = segs.lastIndexOf('models')
  if (i >= 0 && i + 2 < segs.length) return segs[i + 1]
  if (i > 0 && i === segs.length - 2) return segs[i - 1]
  return basename(dirname(resolve(file)))
}

// /imported/* 要登录才能取：这个只给无头 Chrome 用的服务器免登录（server/api.ts，只能看，不能写）
process.env.DONGLE_AUTH_BYPASS = '1'
// configLoader native：不往 node_modules 里写临时文件（线上服务器的 node_modules 是只读的）
const vite = await createServer({ configLoader: 'native', server: { host: '127.0.0.1', port: 5198, hmr: false, watch: null }, logLevel: 'error' })
await vite.listen()
const appUrl = vite.resolvedUrls.local[0]
const profile = mkdtempSync(join(tmpdir(), 'views-'))
const chrome = launchChrome(profile, { width: 1200, height: 800 })
let failed = false
try {
  const cdp = await attach(chrome)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1140, height: 800, deviceScaleFactor: flag('--focus') ? 2 : 1, mobile: false })
  for (const file of files) {
    await cdp.send('Page.navigate', { url: `${appUrl}scripts/model-views.html?src=${encodeURIComponent(urlOf(file))}${extra}&v=${Date.now()}` })
    await waitFor(cdp, 'window.__ready === true', 60000)
    const { contentSize } = await cdp.send('Page.getLayoutMetrics')
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 } })
    const name = `${ownerOf(file)}-${basename(file, '.glb')}${args.includes('--parts') ? '-parts' : ''}${flag('--focus') ? '-focus' : ''}.png`
    writeFileSync(join(out, name), Buffer.from(shot.data, 'base64'))
    console.log(`  ${file} → ${join(out, name)}`)
  }
  cdp.close()
} catch (e) {
  failed = true
  console.error(e)
} finally {
  try { chrome.kill('SIGKILL') } catch {}
  await sleep(200)
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
  await vite.close()
}
process.exit(failed ? 1 : 0)
