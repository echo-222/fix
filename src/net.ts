import { withBase } from './base'

/**
 * 调自己的接口。
 * iOS 上的微信、飞书内置浏览器会把 fetch 的 POST 直接丢掉：页面上只显示 Load failed，
 * 服务器一条日志都没有。XMLHttpRequest 能发出去。
 * 正文用 text/plain 而不是 application/json：后者会先发一次预检，这些浏览器经常把预检也丢掉。
 * 服务端不看 Content-Type，只按 JSON 解析正文。
 */
export function apiFetch(path: string, init?: { method?: 'POST' | 'DELETE'; body?: unknown }): Promise<Response> {
  const url = withBase(path)
  if (!init) return fetch(url, { cache: 'no-store', credentials: 'same-origin' }).catch(network)
  return xhr(url, init.method ?? 'POST', init.body === undefined ? null : JSON.stringify(init.body))
}

const OFFLINE = '网络请求失败了。如果是在微信或飞书里打开的，用右上角菜单在浏览器中打开再试'

function network(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e)
  if (/^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.)$/.test(msg)) throw new Error(OFFLINE)
  throw e instanceof Error ? e : new Error(msg)
}

function xhr(url: string, method: string, body: string | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open(method, url)
    x.withCredentials = true
    x.setRequestHeader('Accept', 'application/json')
    if (body !== null) x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8')
    x.onload = () => {
      const headers = new Headers()
      const type = x.getResponseHeader('Content-Type')
      if (type) headers.set('Content-Type', type)
      resolve(new Response(x.responseText, { status: x.status, statusText: x.statusText, headers }))
    }
    x.onerror = () => reject(new Error(OFFLINE))
    x.ontimeout = () => reject(new Error('网络超时，请再试一次'))
    x.send(body)
  })
}
