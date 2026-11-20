// 热榜自动生成用的说明书来源：校验网址（第一跳必须是品牌官方域名，每一跳都不碰内网、不碰聚合站）、
// 限大小下载，转成流水线要的逐页 JPEG + 文字：PDF 用 pdfjs 在服务器上渲染，网页用无头 Chrome 分段截图，图片直接用。
import { spawn } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join, resolve } from 'node:path'

export const MAX_PAGES = 20
const MAX_BYTES = 80 * 1024 * 1024
/** 渲染后页面的长边（像素） */
const LONG_SIDE = 1800
/** 只在前这么多页里挑中文最多的一段（多语言合订本的中文常在后面） */
const SCAN_PAGES = 600
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 DongleBot/1.0'

/** 说明书聚合站、文库、网盘、电商、社交平台：不算官方来源 */
const BLOCKED = [
  'manualslib.com', 'manua.ls', 'manualzz.com', 'usermanual.wiki', 'manualsdir.com', 'manualowl.com', 'manualsonline.com', 'safemanuals.com',
  'scribd.com', 'issuu.com', 'yumpu.com', 'docin.com', 'doc88.com', 'wenku.baidu.com', 'pan.baidu.com', 'baike.baidu.com', '360doc.com',
  'book118.com', 'renrendoc.com', 'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'yangkeduo.com', 'zhihu.com', 'weibo.com', 'xiaohongshu.com',
  'bilibili.com', 'douyin.com', 'smzdm.com', 'amazon.com', 'amazon.cn', 'ebay.com', 'aliexpress.com', 'youtube.com',
]
/** 这些不能当「官方域名」（太宽） */
const TOO_BROAD = /^(com|net|org|cn|com\.cn|net\.cn|org\.cn|co\.uk|com\.hk|com\.tw|co\.jp|github\.io|cloudfront\.net|amazonaws\.com|aliyuncs\.com|myqcloud\.com)$/

const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)
export const blocked = (host: string) => BLOCKED.some((d) => under(host, d))

/** 模型给的官方域名：去掉协议、路径和 www，太宽的、聚合站的不要 */
export function officialDomains(list: unknown[]): string[] {
  const out = new Set<string>()
  for (const v of list) {
    const d = String(v ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '')
    if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d) && !isIP(d)) continue
    if (TOO_BROAD.test(d) || blocked(d)) continue
    out.add(d)
  }
  return [...out]
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7))
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || v.startsWith('fe80')
}

export interface FetchOpts {
  /** 第一跳网址必须属于这些域名之一 */
  domains: string[]
  /** 允许访问的内网主机（只给自测用：TREND_ALLOW_HOSTS） */
  allow: string[]
  /** 这一条的工作目录（下载的原文件、网页截图放这里） */
  work: string
  signal?: AbortSignal
}

async function checkHost(u: URL, allow: string[]) {
  if (!/^https?:$/.test(u.protocol)) throw new Error(`只下载 http(s)：${u.protocol}`)
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (blocked(host)) throw new Error(`${host} 是聚合站 / 电商 / 社交平台，不算官方来源`)
  if (allow.includes(host)) return
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new Error(`域名解析失败：${host}`)
  })
  if (addrs.some((a) => privateIp(a.address))) throw new Error(`${host} 指向内网地址，不下载`)
}

/** 手动跟跳转（最多 5 跳），每一跳都查一遍主机 */
async function download(url: string, opts: FetchOpts) {
  let u = new URL(url)
  const host = u.hostname.toLowerCase()
  if (!opts.domains.some((d) => under(host, d)) && !opts.allow.includes(host)) throw new Error(`${host} 不是品牌官方域名（${opts.domains.join(' / ') || '没给官方域名'}）`)
  for (let hop = 0; hop < 6; hop++) {
    await checkHost(u, opts.allow)
    const res = await fetch(u, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'application/pdf,text/html,image/*;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6' },
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u)
      continue
    }
    if (!res.ok) throw new Error(`${u.hostname} 返回 HTTP ${res.status}`)
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error(`文件超过 ${MAX_BYTES / 1024 / 1024} MB`)
    const chunks: Buffer[] = []
    let size = 0
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += c.length
      if (size > MAX_BYTES) throw new Error(`文件超过 ${MAX_BYTES / 1024 / 1024} MB`)
      chunks.push(Buffer.from(c))
    }
    return { buf: Buffer.concat(chunks), type: (res.headers.get('content-type') ?? '').toLowerCase(), url: u.href }
  }
  throw new Error('跳转太多次')
}

export interface Source {
  kind: 'pdf' | 'html' | 'image'
  /** 最后实际下载的地址 */
  url: string
  pages: string[]
  texts: string[]
  /** PDF 里的原页码 */
  pageNumbers?: number[]
  /** 原文件总页数 */
  total: number
}

const jpegUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`
const cjk = (s: string) => (s.match(/[\u4e00-\u9fff]/g) ?? []).length

async function pdfSource(buf: Buffer, url: string): Promise<Source> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const root = resolve('node_modules/pdfjs-dist')
  const doc = await getDocument({
    data: new Uint8Array(buf), verbosity: 0,
    cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`,
  }).promise
  try {
    const total = doc.numPages
    const texts: string[] = []
    for (let n = 1; n <= Math.min(total, SCAN_PAGES); n++) {
      const t = await (await doc.getPage(n)).getTextContent()
      texts.push(t.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim())
    }
    // 页数多时挑中文最多的连续 MAX_PAGES 页（没有中文文字层就从头取）
    let start = 0
    if (texts.length > MAX_PAGES) {
      const score = texts.map(cjk)
      let best = -1
      let sum = score.slice(0, MAX_PAGES).reduce((a, b) => a + b, 0)
      for (let s = 0; s + MAX_PAGES <= score.length; s++) {
        if (s > 0) sum += score[s + MAX_PAGES - 1] - score[s - 1]
        if (sum > best) [best, start] = [sum, s]
      }
      if (best <= 0) start = 0
    }
    const pages: string[] = []
    const pageNumbers: number[] = []
    for (let n = start + 1; n <= Math.min(total, start + MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const v = page.getViewport({ scale: Math.min(3, LONG_SIDE / Math.max(vp.width, vp.height)) })
      const canvas = createCanvas(Math.ceil(v.width), Math.ceil(v.height))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: v }).promise
      pages.push(jpegUrl(await canvas.encode('jpeg', 85)))
      pageNumbers.push(n)
      page.cleanup()
    }
    return { kind: 'pdf', url, pages, texts: pageNumbers.map((n) => texts[n - 1] ?? ''), pageNumbers, total }
  } finally {
    await doc.destroy()
  }
}

async function imageSource(buf: Buffer, url: string): Promise<Source> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const img = await loadImage(buf)
  const k = Math.min(1, 2400 / Math.max(img.width, img.height))
  const canvas = createCanvas(Math.round(img.width * k), Math.round(img.height * k))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { kind: 'image', url, pages: [jpegUrl(await canvas.encode('jpeg', 88))], texts: [''], total: 1 }
}

/** 官网的拦截 / 验证页（无头浏览器、海外 IP 常被拦）：截出来只有一句提示，不能拿去生成 */
const GATE = /请求被阻断|访问被(拒绝|阻断|拦截|限制)|访问受限|拒绝访问|您无法继续访问|安全验证|人机验证|滑动验证|请完成验证|输入验证码|access denied|request blocked|403 forbidden|attention required|just a moment|verify you are human|captcha/i
/** 网页说明书至少要有这么多字 */
const MIN_TEXT = 150

/** 标题像产品介绍 / 购买页、又没提说明书和教程：官网的说明书一般在服务 / 支持页 */
export function productPage(html: string) {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
  return /价格|报价|购买|商城|旗舰店|参数配置|立即抢购/.test(title) && !/说明书|手册|使用|指南|教程|帮助|服务|支持|安装|FAQ|guide|manual/i.test(title) ? title.slice(0, 80) : ''
}

/** 截出来的网页是拦截页 / 几乎没字：说明原因，换下一个地址 */
export function pageProblem(texts: string[]) {
  const all = texts.join(' ').replace(/\s+/g, ' ').trim()
  const gate = all.length < 2000 && all.match(GATE)
  if (gate) return `官网拦下了截图（「${all.slice(0, 40)}」）`
  if (all.length < MIN_TEXT) return `页面上几乎没有文字（${all.length} 字），不像说明书`
  return ''
}

/** 网页版说明书：scripts/page-shots.mjs 用无头 Chrome 打开、分段截图 */
function htmlSource(url: string, work: string, signal?: AbortSignal): Promise<Source> {
  const out = join(work, 'page')
  rmSync(out, { recursive: true, force: true })
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [resolve('scripts/page-shots.mjs'), url, out, '12'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (b: Buffer) => (err += b.toString()))
    const kill = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', kill)
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', kill)
      const files = existsSync(out) ? readdirSync(out).filter((f) => /^p\d+\.jpg$/.test(f)).sort() : []
      if (code !== 0 || !files.length) return fail(new Error(`网页截图失败：${err.trim().split('\n').at(-1)?.slice(0, 200) || `退出码 ${code}`}`))
      const texts = existsSync(join(out, 'text.json')) ? (JSON.parse(readFileSync(join(out, 'text.json'), 'utf8')) as string[]) : []
      const problem = pageProblem(texts)
      if (problem) return fail(new Error(problem))
      done({ kind: 'html', url, pages: files.map((f) => jpegUrl(readFileSync(join(out, f)))), texts: files.map((_, i) => texts[i] ?? ''), total: files.length })
    })
  })
}

/** 下载一个说明书地址并转成页面；原文件留在 work 目录里给管理员看 */
export async function fetchSource(url: string, opts: FetchOpts): Promise<Source> {
  mkdirSync(opts.work, { recursive: true })
  const got = await download(url, opts)
  const head = got.buf.subarray(0, 8)
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') {
    writeFileSync(join(opts.work, 'source.pdf'), got.buf)
    return pdfSource(got.buf, got.url)
  }
  if ((head[0] === 0xff && head[1] === 0xd8) || head.subarray(1, 4).toString('latin1') === 'PNG' || got.type.startsWith('image/')) {
    writeFileSync(join(opts.work, 'source-image'), got.buf)
    return imageSource(got.buf, got.url)
  }
  if (got.type.includes('html') || /^\s*</.test(got.buf.subarray(0, 200).toString('utf8'))) {
    writeFileSync(join(opts.work, 'source.html'), got.buf)
    const product = productPage(got.buf.toString('utf8'))
    if (product) throw new Error(`这是产品介绍 / 购买页，不是说明书（「${product}」）`)
    return htmlSource(got.url, opts.work, opts.signal)
  }
  throw new Error(`不认识的文件类型（${got.type || '没有 Content-Type'}）`)
}
