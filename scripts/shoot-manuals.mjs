// 逐步截图 + 联系表：npm run shoot -- <manual-id> [--guide <id>] [--phone] [--real] [--out <dir>] [--scale <n>]
// 启动 Vite，用无头 Chrome 打开这份说明书的笔记页（收起笔记面板），切到每个指南的每一步，等镜头飞完、本步过渡结束（闪烁灯取亮的半周期）后截图。
// 挂了外观模型的零件等 GLB 加载完再拍；--real 打开「真实外观」显示。
// 输出 <out>/<guide>-<nn>-<step>.png，以及每个指南一张联系表 <out>/<guide>-sheet.png。截完逐张看。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { CHROME, attach, launchChrome, sleep, waitFor } from './headless.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const id = args.find((a, i) => !a.startsWith('--') && !['--guide', '--out', '--scale'].includes(args[i - 1]))
if (!id) {
  console.log('用法：npm run shoot -- <manual-id> [--guide <id>] [--phone] [--real] [--out <dir>] [--scale <n>]')
  process.exit(1)
}
const phone = args.includes('--phone')
const real = args.includes('--real')
const size = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
const scale = Number(flag('--scale', phone ? 2 : 1))
const onlyGuide = flag('--guide')
const out = resolve(flag('--out', join('shots', id + (phone ? '-phone' : '') + (real ? '-real' : ''))))
const MODELS_READY = `!(window.__modelsPending > 0)`
/** 拨好动画时钟到真正截图之间的秒数（等待 + 截屏耗时），闪烁灯按截图那一刻取相位 */
const CAPTURE_LAG = 0.3
mkdirSync(out, { recursive: true })

if (!CHROME) {
  console.error('找不到 Chrome，设置 CHROME_PATH 指向浏览器可执行文件')
  process.exit(1)
}

// 笔记页要登录：截图用的这个开发服务器免登录（server/api.ts，只能看，不能写）
process.env.DONGLE_AUTH_BYPASS = '1'
// 关掉 HMR 和文件监听：截图途中有人改源码时，页面不会被重载成另一个 store 实例（否则后面每张都停在第 1 步）
// configLoader native：Node 直接读 vite.config.ts，不往 node_modules 里写临时文件（线上服务器的 node_modules 是只读的）
// 同时拍几份时用 SHOOT_PORT 错开端口；端口被占时 Vite 会自动顺延
const vite = await createServer({ configLoader: 'native', server: { host: '127.0.0.1', port: Number(process.env.SHOOT_PORT) || 5199, hmr: false, watch: null }, logLevel: 'error' })
await vite.listen()
const appUrl = `${vite.resolvedUrls.local[0]}#/note/m-${encodeURIComponent(id)}`
const profile = mkdtempSync(join(tmpdir(), 'shoot-'))
const chrome = launchChrome(profile, size)
// 被上层（网页导入流水线的「取消」）终止时，带走 Chrome 和 5199 端口上的 Vite
process.once('SIGTERM', async () => {
  try { chrome.kill('SIGKILL') } catch {}
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
  await vite.close().catch(() => {})
  process.exit(143)
})

let failed = false
try {
  const cdp = await attach(chrome)
  const errors = []
  /** 报错处最近的一帧项目代码（不在 node_modules 里） */
  const where = (trace) => {
    const f = trace?.callFrames?.find((c) => c.url.includes('/src/'))
    return f ? ` @ ${f.functionName || '(匿名)'} ${f.url.replace(/^.*?\/src\//, 'src/').replace(/\?.*$/, '')}:${f.lineNumber + 1}` : ''
  }
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(String(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text).split('\n')[0] + where(e.exceptionDetails?.stackTrace)))
  cdp.on('Runtime.consoleAPICalled', (e) => {
    if (e.type === 'error') errors.push(e.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0] + where(e.stackTrace))
  })
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: scale, mobile: phone })
  await cdp.send('Page.navigate', { url: appUrl })
  await waitFor(cdp, `!!document.querySelector('.main-canvas canvas')`, 30000)

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const plan = await evaluate(`(async () => {
    const { useApp } = await import('/src/store.ts')
    useApp.getState().setProduct('manual:${id}')
    useApp.setState({ panel: 'none' })
    if (useApp.getState().realLook !== ${real}) useApp.getState().toggle('realLook')
    const s = useApp.getState()
    if (s.product !== 'manual:${id}') return null
    return s.guides.map((g) => ({ id: g.id, title: g.title, steps: g.steps.map((st) => ({ id: st.id, title: st.title })) }))
  })()`)
  if (!plan) throw new Error(`没有找到说明书 ${id}（检查 library/index.ts 的 MANUALS）`)
  await sleep(1500)
  await waitFor(cdp, MODELS_READY, 60000)

  for (const guide of plan) {
    if (onlyGuide && guide.id !== onlyGuide) continue
    const shots = []
    for (const [i, step] of guide.steps.entries()) {
      await evaluate(`(async () => {
        const { useApp } = await import('/src/store.ts')
        const s = useApp.getState()
        if (s.guideId !== '${guide.id}') s.setGuide('${guide.id}')
        useApp.getState().go(${i})
      })()`)
      await sleep(1300)
      await waitFor(cdp, MODELS_READY, 60000)
      // 跳到本步过渡结束；有闪烁灯时挪到它亮的半周期
      await evaluate(`(async () => {
        const { useApp, anim } = await import('/src/store.ts')
        const s = useApp.getState()
        const scene = s.guides.find((g) => g.id === s.guideId).steps[s.stepIndex].scene
        let settle = 0
        for (const [k, g] of Object.entries(scene.to)) {
          const f = scene.from[k]
          const moved = JSON.stringify([f.parent, f.pos, f.quat, f.visible, f.fold]) !== JSON.stringify([g.parent, g.pos, g.quat, g.visible, g.fold]) || g.via || g.lift
          if (moved || f.light !== g.light || f.ui !== g.ui) settle = Math.max(settle, g.delay + (moved ? g.dur : 0))
        }
        let t = settle + 0.2
        const blinking = Object.values(scene.to).filter((g) => g.light === 'blink' || g.light === 'blinkThenOff')
        if (blinking.length) {
          // 亮的半周期是相位 0–0.55；截图发生在 ${CAPTURE_LAG} 秒后，按那一刻对准相位 0.15–0.35
          const d = Math.max(...blinking.map((g) => g.delay))
          const phase = () => ((t + ${CAPTURE_LAG} - d) * 2.4) % 1
          while (phase() < 0.15 || phase() > 0.35) t += 0.01
        }
        anim.start = performance.now() - t * 1000
      })()`)
      await sleep(CAPTURE_LAG * 1000 - 50)
      const file = join(out, `${guide.id}-${String(i + 1).padStart(2, '0')}-${step.id}.png`)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      shots.push({ file, n: i + 1, title: step.title })
      console.log(`  ${guide.id} #${i + 1} ${step.title} → ${file}`)
    }
    const sheet = join(out, `${guide.id}-sheet.png`)
    await contactSheet(cdp, guide, shots, sheet, phone)
    console.log(`  联系表 → ${sheet}`)
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: scale, mobile: phone })
    await cdp.send('Page.navigate', { url: appUrl })
    await waitFor(cdp, `!!document.querySelector('.main-canvas canvas')`, 30000)
    await evaluate(`(async () => { const { useApp } = await import('/src/store.ts'); useApp.getState().setProduct('manual:${id}'); useApp.setState({ panel: 'none' }) })()`)
    await sleep(1500)
    await waitFor(cdp, MODELS_READY, 60000)
  }
  if (errors.length) {
    failed = true
    console.log(`  页面报错 ${errors.length} 条：`)
    for (const e of [...new Set(errors)]) console.log(`    ✗ ${e}`)
  } else console.log('  页面无报错')
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

async function contactSheet(cdp, guide, shots, file, phone) {
  const cols = phone ? 6 : 3
  const cell = phone ? 240 : 470
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 20px; background: #f4f2ee; font: 13px -apple-system, "PingFang SC", sans-serif; color: #222; width: ${cols * (cell + 12) + 28}px; }
    h1 { font-size: 16px; margin: 0 0 14px; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, ${cell}px); gap: 12px; }
    figure { margin: 0; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    img { display: block; width: 100%; }
    figcaption { padding: 6px 10px; font-weight: 600; }
    figcaption b { color: #e5482d; margin-right: 6px; }
  </style><h1>${guide.title} · ${shots.length} 步</h1><div class="grid">${shots.map((s) => `<figure><img src="${pathToFileURL(s.file).href}"><figcaption><b>#${s.n}</b>${s.title}</figcaption></figure>`).join('')}</div>`
  const htmlFile = join(profile, `sheet-${guide.id}.html`)
  writeFileSync(htmlFile, html)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: cols * (cell + 12) + 68, height: 800, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: pathToFileURL(htmlFile).href })
  await waitFor(cdp, `document.readyState === 'complete' && [...document.images].every((i) => i.complete)`, 20000)
  const { contentSize } = await cdp.send('Page.getLayoutMetrics')
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 } })
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  rmSync(htmlFile)
}
