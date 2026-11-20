// 无头 Chrome + CDP 的共用部分：shoot-manuals.mjs（逐步截图）和 model-views.mjs（模型六向图）都用
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p))

export function launchChrome(profile, size) {
  return spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', `--window-size=${size.width},${size.height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
}

/** 等 Chrome 打出 DevTools 端口，连上第一个页面 */
export async function attach(chrome) {
  const port = await new Promise((done, fail) => {
    let text = ''
    const timer = setTimeout(() => fail(new Error('Chrome 没有启动')), 20000)
    chrome.stderr.on('data', (chunk) => {
      text += chunk
      const m = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//)
      if (m) {
        clearTimeout(timer)
        done(Number(m[1]))
      }
    })
    chrome.on('exit', (code) => fail(new Error(`Chrome 退出：${code}`)))
  })
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  return connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
}

export async function waitFor(cdp, expression, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.result?.value) return
    await sleep(100)
  }
  throw new Error(`等待超时：${expression}`)
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function connect(url) {
  return new Promise((done, fail) => {
    const ws = new WebSocket(url)
    let seq = 0
    const pending = new Map()
    const listeners = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { ok, ko } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) ko(new Error(`${msg.error.message}`))
        else ok(msg.result)
      } else if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params)
    }
    ws.onerror = fail
    ws.onopen = () => done({
      send: (method, params = {}) => new Promise((ok, ko) => {
        const id = ++seq
        pending.set(id, { ok, ko })
        ws.send(JSON.stringify({ id, method, params }))
      }),
      on: (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]),
      close: () => ws.close(),
    })
  })
}
