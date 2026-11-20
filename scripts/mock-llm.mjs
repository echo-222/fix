// 假的 OpenAI 兼容服务，用来在没有模型额度时端到端测试「网页导入 → 3D」流水线的每个环节
// （上传、分流、转写、写脚本、审计 + 多轮修复、保存、截图复核、打开）。不看图，按请求类型回放库里一份现成的说明书 / 教程：
//   分流 → 按 MOCK_ROUTE 或 id 前缀回链路（origami- / popup- / physics- / mech- / 其余 manual），把握 MOCK_CONFIDENCE（默认 0.9）；
//   转写 → 由这份说明书反推的转写稿；写脚本 → 这份说明书，但故意埋两个错（一步没写镜头、主体陷进地面 30 mm）；
//   修复 → 针对报上来的问题回补丁（先补镜头，再抬起主体），借此验证「审计 → 补丁 → 再审计」的循环；复核 → 不改。
// 每个请求顺便检查系统提示词拼进了这条链路的 skill，日志里打「提示词检查 ✓ / ✗」（import-selftest 会看）。
// 用法：node scripts/mock-llm.mjs [manual-id]（默认 xiaomi-router-ax3000t，端口 5190，MOCK_LLM_PORT 可换）
//   AI_BASE_URL=http://127.0.0.1:5190/v1 AI_API_KEY=mock AI_MANUAL_MODEL=mock-skill npx vite --port 5181
// scripts/import-selftest.mjs 用它测整条流水线
import { readFileSync } from 'node:fs'
import { createServer as http } from 'node:http'
import { createServer } from 'vite'

const id = process.argv[2] ?? 'xiaomi-router-ax3000t'
const port = Number(process.env.MOCK_LLM_PORT) || 5190
const PREFIX = { 'origami-': 'origami', 'popup-': 'popup', 'physics-': 'physics', 'mech-': 'mechanism' }
const route = process.env.MOCK_ROUTE || Object.entries(PREFIX).find(([p]) => id.startsWith(p))?.[1] || 'manual'
const confidence = Number(process.env.MOCK_CONFIDENCE ?? 0.9)
const SKILL = { manual: 'manual-to-3d', origami: 'origami-3d', popup: 'popup-3d', physics: 'physics-3d', mechanism: 'mechanism-3d', free: 'freeform-3d' }
// 把握太低时服务器改走自由生成，提示词也应该换成 freeform-3d
const effective = route !== 'manual' && route !== 'free' && confidence < 0.4 ? 'free' : route
const skill = SKILL[effective]
const vite = await createServer({ configLoader: 'native', server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
const { MANUALS } = await vite.ssrLoadModule('/src/domain/manual/library/index.ts')
await vite.close()
const spec = JSON.parse(JSON.stringify(MANUALS.find((m) => m.id === id)))
if (!spec) throw new Error(`库里没有 ${id}`)

// 埋错：第一个指南的第 2 步去掉镜头；第一个落地的主体零件（没有就第一个根零件）往下沉 30 mm
// 折纸（origami-*）：镜头全部只留 dir（测服务器自动取景），第 2 步折到不存在的第 99 步（测修复）
const origami = id.startsWith('origami-')
const guide = spec.guides[0]
const brokenStep = guide.steps[Math.min(1, guide.steps.length - 1)]
const body = spec.parts.find((p) => !p.parent && Array.isArray(p.at) && p.at[1] === 0 && p.shape?.type !== 'slab') ?? spec.parts.find((p) => !p.parent) ?? spec.parts[0]
body.at ??= [0, 0, 0]
delete spec.source
for (const p of spec.parts) delete p.model

function draft() {
  const d = structuredClone(spec)
  d.name = `${spec.name} · 导入测试`
  const s = d.guides[0].steps.find((x) => x.id === brokenStep.id)
  if (origami) {
    for (const g of d.guides) for (const st of g.steps) st.camera = { dir: st.camera.dir }
    s.set = { [body.id]: { fold: 99 } }
    d.notes = '（模拟）菱形摆放，上角 [0, a]'
    return d
  }
  delete s.camera
  const p = d.parts.find((x) => x.id === body.id)
  p.at = [p.at[0], -30, p.at[2]]
  d.notes = '（模拟）坐标：桌面 y=0，观众在 +Z'
  return d
}

function classify() {
  return {
    route, confidence,
    subject: `（模拟）${spec.name}`,
    reason: `（模拟）按 ${process.env.MOCK_ROUTE ? 'MOCK_ROUTE' : 'id 前缀'} 判断为 ${route}`,
    second: null,
  }
}

function transcript() {
  return {
    product: { name: `${spec.name} · 导入测试`, brand: '', model: '', category: spec.category, desc: spec.desc, idHint: spec.id },
    dims: { ...spec.dims, evidence: '（模拟）' },
    pages: [],
    rows: spec.guides.flatMap((g) => g.steps.map((s) => ({ page: s.page ?? 1, text: s.title, verb: '' }))),
    entities: spec.parts.map((p) => ({ id: p.id, name: p.name })),
    package: spec.package ?? [],
    params: spec.params ?? [],
    guides: spec.guides.map((g) => ({ id: g.id, title: g.title, kind: g.kind })),
    inferred: ['（模拟）机身尺寸按官方规格', '（模拟）指示灯颜色按产品图'],
    confidence: 0.8,
  }
}

function repair(text) {
  const out = { notes: '', parts: [], steps: [] }
  // 只认问题清单里的条目（修复任务的说明文字里也会出现这些词）
  if (/camera 要写/.test(text)) {
    out.steps.push({ guide: guide.id, step: brokenStep })
    out.notes += `给 ${brokenStep.id} 补上镜头。`
  }
  if (/fold 要是 0–\d+ 的整数/.test(text)) {
    out.steps.push({ guide: guide.id, step: { id: brokenStep.id, set: brokenStep.set } })
    out.notes += `${brokenStep.id} 的 fold 改回正确的步号。`
  }
  if (/\[穿地\]/.test(text)) {
    out.parts.push(body)
    out.notes += `把 ${body.id} 放回地面。`
  }
  return out
}

const textOf = (content) => (typeof content === 'string' ? content : content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'))

// 每类请求的系统提示词 / 任务里应该有的标记：证明服务器按链路拼进了对应 skill 的哪几节
const generic = effective !== 'manual' && effective !== 'origami'
const EXPECT = {
  分流: ['分流', '- popup（立体书 → popup-3d）', '- free（其他（自由生成） → freeform-3d）'],
  转写: effective === 'manual' ? ['manual-to-3d skill', '## 动词 → 脚本'] : [`按 ${skill} skill`, '# 转写要点', ...(effective === 'origami' ? ['"paper"'] : [])],
  写脚本: generic ? [`# Skill：${skill}`, `# ${skill} / reference.md`, '# 场景脚本参考', '# types.ts', `按 ${skill} skill 的工作流`] : [skill],
  修复: generic ? [`# Skill：${skill}`] : [skill],
  复核: generic ? [`# 复核清单（${skill}）`] : [],
}
function promptCheck(kind, messages) {
  const all = messages.map((m) => textOf(m.content)).join('\n')
  const missing = (EXPECT[kind] ?? []).filter((s) => !all.includes(s))
  // 自由生成和教程类不该让模型写 source / 外观模型
  if (kind === '写脚本' && generic && !all.includes('不要写 source')) missing.push('不要写 source')
  console.log(`提示词检查 ${missing.length ? '✗' : '✓'} ${kind}（${skill}）${missing.length ? ' 缺：' + missing.join(' | ') : ''}`)
}

function answer(messages) {
  const user = messages.filter((m) => m.role === 'user').at(-1)
  const text = textOf(user.content)
  if (text.startsWith('请判断这份资料该走哪条生成链路')) return ['分流', classify()]
  if (text.startsWith('资料共')) return ['转写', transcript()]
  if (text.startsWith('逐页转写')) return ['写脚本', draft()]
  if (typeof user.content !== 'string' && user.content.some((c) => c.type === 'image_url') && text.startsWith('当前脚本')) {
    const sheets = user.content.filter((c) => c.type === 'text' && c.text.startsWith('联系表')).length
    return ['复核', { notes: `（模拟）看了 ${sheets} 张联系表，和原页一致，不改` }]
  }
  if (text.startsWith('当前脚本')) return ['修复', repair(text)]
  return ['未知', { notes: '（模拟）不认识的请求' }]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 联网搜索（热榜，server/trends.ts）----------
// POST /v1/responses 带 web_search 工具：按提示词回热度扫描（电商·新闻 / 小红书 / B 站三个渠道各一份）/ 找官方说明书 / 联网检测；流式事件和 OpenAI 一样。
// GET /bili/x/...：假的 B 站公开接口（排行、热门、热搜、游客 buvid），线上服务器用 TREND_BILI_BASE 指过来。
// 模型名 no-search：/responses 404、chat 的 web_search_options 400（测「不支持联网搜索」）；chat-search：只有 chat 方式能用。
// GET /files/manual.pdf（两页英文 PDF）、/files/manual.jpg（鼠标说明书的一页）、/files/manual.html（网页版）：假的「品牌官网说明书」；
//   /files/blocked.html（WAF 拦截页）、/files/product.html（产品介绍页）：不该当说明书用的
const self = `http://127.0.0.1:${port}`
const TREND = {
  summary: '（模拟）本期扫地机器人和净化器在涨，掌机热度不减。',
  items: [
    { name: 'Nintendo Switch OLED', brand: '任天堂', model: 'HEG-001', category: '游戏主机', aliases: ['Switch OLED'], heat: 92, heatWhy: '（模拟）双十一游戏机榜第一', demo: 80, demoWhy: '（模拟）拆装手柄、接底座', signals: [{ title: '（模拟）热卖榜', url: `${self}/news/1` }], officialSite: 'nintendo.com', manualUrl: '', existing: 'nintendo-switch-oled' },
    { name: '测试净化器 X1', brand: '测试牌', model: 'X1', category: '空气净化器', aliases: ['X1 净化器'], heat: 88, heatWhy: '（模拟）首销 1 小时破万台', demo: 86, demoWhy: '（模拟）拆滤网、换滤芯、复位', signals: [{ title: '（模拟）首销战报', url: `${self}/news/2` }], officialSite: '127.0.0.1', manualUrl: `${self}/files/manual.pdf`, existing: '' },
    { name: '内网测试机', brand: '测试牌', model: 'LAN-1', category: '路由器', aliases: [], heat: 76, heatWhy: '（模拟）', demo: 72, demoWhy: '（模拟）', signals: [], officialSite: '10.0.0.1', manualUrl: 'http://10.0.0.1/manual.pdf', existing: '' },
    { name: '某款蓝牙耳机', brand: '测试牌', model: 'B2', category: '耳机', aliases: [], heat: 81, heatWhy: '（模拟）', demo: 20, demoWhy: '（模拟）只有配对', signals: [], officialSite: '', manualUrl: '', existing: '' },
  ],
  brands: [
    { name: '任天堂', aliases: ['Nintendo'], heat: 90, categories: ['游戏主机'], why: '（模拟）掌机榜第一', products: ['Nintendo Switch OLED'], signals: [{ title: '（模拟）品牌榜', url: `${self}/news/4` }], officialSite: 'nintendo.com' },
    { name: '小米', aliases: ['米家', 'Redmi'], heat: 80, categories: ['智能家居'], why: '（模拟）双十一品牌榜前三', products: [], signals: [{ title: '（模拟）品牌战报', url: `${self}/news/5` }], officialSite: 'mi.com' },
    { name: '测试牌', aliases: ['TestBrand'], heat: 70, categories: ['空气净化器'], why: '（模拟）新品首销', products: ['测试净化器 X1'], signals: [], officialSite: '127.0.0.1' },
  ],
}
// 小红书渠道：X1 在这里也热（并成一条、多渠道加分），「米家」并进小米
const TREND_XHS = {
  summary: '（模拟）小红书上净化器和加湿器的合作笔记多。',
  items: [
    { name: '测试净化器 X1', brand: '测试牌', model: 'X1', category: '空气净化器', aliases: [], heat: 80, heatWhy: '（模拟）千瓜种草榜第二', demo: 84, demoWhy: '（模拟）换滤芯', signals: [{ title: '（模拟）千瓜：净化器种草榜', url: `${self}/xhs/1` }], officialSite: '', manualUrl: '', existing: '' },
    { name: '米家测试加湿器', brand: '米家', model: 'H1', category: '加湿器', aliases: [], heat: 70, heatWhy: '（模拟）合作笔记 300 篇', demo: 50, demoWhy: '（模拟）加水', signals: [{ title: '（模拟）小红书笔记', url: `${self}/xhs/2` }], officialSite: 'mi.com', manualUrl: '', existing: '' },
  ],
  brands: [
    { name: '米家', aliases: ['Xiaomi'], heat: 85, categories: ['加湿器'], why: '（模拟）蒲公英合作笔记最多', products: ['米家测试加湿器'], signals: [{ title: '（模拟）新红品牌投放榜', url: `${self}/xhs/3` }], officialSite: 'mi.com' },
    { name: '测试牌', aliases: [], heat: 60, categories: ['空气净化器'], why: '（模拟）', products: [], signals: [], officialSite: '' },
  ],
}
/** B 站渠道：提示词里有假 B 站接口给的那条视频，才回从它认出来的产品 */
function trendBili(text) {
  const seen = text.includes('BV1mock0001')
  return {
    summary: `（模拟）B 站恰饭视频里显示器多${text.includes('（模拟）热搜词一') ? '，热搜也看到了' : ''}。`,
    items: seen ? [{ name: '弈威 27M4N5 显示器', brand: '弈威', model: '27M4N5', category: '显示器', aliases: [], heat: 75, heatWhy: '（模拟）科技区排行第 1', demo: 40, demoWhy: '（模拟）装支架', signals: [{ title: '（模拟）弈威 27M4N5 开箱', url: 'https://www.bilibili.com/video/BV1mock0001' }], officialSite: '', manualUrl: '', existing: '' }] : [],
    brands: [
      { name: '小米', aliases: [], heat: 70, categories: ['手机'], why: '（模拟）', products: [], signals: [], officialSite: '' },
      ...(seen ? [{ name: '弈威', aliases: ['EVNIA'], heat: 65, categories: ['显示器'], why: '（模拟）恰饭视频 3 条', products: ['弈威 27M4N5 显示器'], signals: [{ title: '（模拟）开箱', url: 'https://www.bilibili.com/video/BV1mock0001' }], officialSite: '' }] : []),
    ],
  }
}

/** 假的 B 站公开接口（/bili/x/...）：汽车区排行不带游客 buvid 时报风控 -352，测「先领 buvid 再试一次」 */
function bili(req, res) {
  const u = new URL(req.url, self)
  const day = (d) => Math.floor(Date.now() / 1000) - d * 86400
  const v = (bvid, title, pid, zone, d, desc = '') => ({ bvid, title, desc, pubdate: day(d), pid_v2: pid, pid_name_v2: zone, tnamev2: '测试子区', owner: { name: '测试UP' }, stat: { view: 123456, like: 2345 } })
  const ok = (data) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: 0, message: '0', data }))
  const path = u.pathname.replace(/^\/bili/, '')
  console.log(`${new Date().toLocaleTimeString()} B 站接口 · ${path}${u.search}${req.headers.cookie ? '（带 buvid）' : ''}`)
  if (path === '/x/frontend/finger/spi') return ok({ b_3: 'MOCK-B3', b_4: 'MOCK-B4' })
  if (path === '/x/web-interface/ranking/v2') {
    if (u.searchParams.get('rid') === '1013') {
      if (!req.headers.cookie?.includes('buvid3=MOCK-B3')) return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: -352, message: '风控校验失败' }))
      return ok({ list: [v('BV1mockcar', '（模拟）某电车的电池拆解', 1013, '汽车', 2)] })
    }
    return ok({ list: [v('BV1mock0001', '（模拟）弈威 27M4N5 显示器开箱', 1012, '科技数码', 1, '本期视频由弈威赞助'), v('BV1mockgame', '（模拟）游戏实况', 1008, '游戏', 1), v('BV1mockold', '（模拟）旧视频', 1012, '科技数码', 60)] })
  }
  if (path === '/x/web-interface/popular') return ok({ list: u.searchParams.get('pn') === '1' ? [v('BV1mockhome', '（模拟）智能门锁安装', 1015, '家装房产', 3), v('BV1mockfun', '（模拟）鬼畜', 1007, '鬼畜', 1)] : [] })
  if (path === '/x/web-interface/search/square') return ok({ trending: { list: [{ keyword: '（模拟）热搜词一', heat_score: 1000 }, { keyword: '（模拟）热搜词二', heat_score: 800 }] } })
  return res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: -404, message: '啥都木有' }))
}

function searchAnswer(text) {
  if (text.startsWith('热度扫描 · 小红书')) return ['热度扫描 · 小红书', TREND_XHS]
  if (text.startsWith('热度扫描 · B 站')) return ['热度扫描 · B 站', trendBili(text)]
  if (text.startsWith('热度扫描')) {
    const hint = text.match(/上期品牌榜靠前的：([^。]+)/)
    return ['热度扫描', hint ? { ...TREND, summary: `${TREND.summary}（收到品牌线索：${hint[1]}）` } : TREND]
  }
  if (text.startsWith('找官方说明书')) {
    const lan = text.includes('内网测试机')
    return ['找说明书', { officialDomains: lan ? ['169.254.169.254'] : ['127.0.0.1'], links: [{ url: lan ? 'http://169.254.169.254/latest/meta-data' : `${self}/files/manual.jpg`, kind: lan ? 'html' : 'pdf' }] }]
  }
  if (text.startsWith('联网搜索检测')) return ['联网检测', { date: '（模拟）今天', headline: '（模拟）一条科技新闻', url: `${self}/news/3` }]
  return ['未知搜索', { error: '（模拟）不认识的搜索' }]
}

/** 两页的最小 PDF（Helvetica 英文），xref 偏移现算 */
function tinyPdf() {
  const page = (n, text) => `BT /F1 28 Tf 72 700 Td (${text}) Tj ET`
  const streams = [page(1, 'Quick Start - Step 1: open the cover'), page(2, 'Step 2: replace the filter')]
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    ...streams.map((s) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** 测联网搜索的重试：第一次电商·新闻扫描卡住不发数据，第一次小红书扫描在流中间断网，第一次 B 站扫描在流里回一个 error 事件 */
const faults = new Set()

async function responses(req, res, body) {
  const { model, input, tools } = body
  if (model === 'no-search' || model === 'chat-search') {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'Not found: /v1/responses' } }))
    return
  }
  const text = typeof input === 'string' ? input : input.map((m) => textOf(m.content)).join('\n')
  const searchTool = tools?.some((t) => t.type === 'web_search' || t.type === 'web_search_preview')
  const [kind, data] = searchAnswer(text)
  const out = JSON.stringify(data)
  console.log(`${new Date().toLocaleTimeString()} 联网 · ${kind}${searchTool ? '' : '（没带搜索工具！）'} · 输出 ${out.length} 字`)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (j) => res.write(`event: ${j.type}\ndata: ${JSON.stringify(j)}\n\n`)
  send({ type: 'response.created', response: { status: 'in_progress' } })
  send({ type: 'response.web_search_call.searching', item_id: 'ws_1' })
  send({ type: 'response.output_item.done', item: { type: 'web_search_call', id: 'ws_1', status: 'completed' } })
  if (kind === '热度扫描 · 小红书' && !faults.has(kind)) {
    faults.add(kind)
    send({ type: 'response.output_text.delta', delta: out.slice(0, 40) })
    await sleep(40)
    console.log(`${new Date().toLocaleTimeString()} 联网 · ${kind} · 故意在流中间断开连接（测重试）`)
    return res.socket.destroy()
  }
  if (kind === '热度扫描' && !faults.has(kind)) {
    faults.add(kind)
    console.log(`${new Date().toLocaleTimeString()} 联网 · ${kind} · 故意卡住不发数据（测重连）`)
    await sleep(4000)
    return res.destroy()
  }
  if (kind === '热度扫描 · B 站' && !faults.has(kind)) {
    faults.add(kind)
    send({ type: 'error', error: { type: 'server_error', message: '（模拟）上游一时出错' } })
    console.log(`${new Date().toLocaleTimeString()} 联网 · ${kind} · 故意在流里回 error 事件（测重试）`)
    return res.end()
  }
  const n = 6
  for (let i = 0; i < n; i++) {
    send({ type: 'response.output_text.delta', delta: out.slice((out.length * i) / n, (out.length * (i + 1)) / n) })
    await sleep(40)
  }
  send({
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [
        { type: 'web_search_call', id: 'ws_1', status: 'completed' },
        { type: 'message', content: [{ type: 'output_text', text: out, annotations: [{ type: 'url_citation', url: `${self}/news/1`, title: '（模拟）引用的网页' }] }] },
      ],
      usage: { input_tokens: Math.round(text.length / 2), output_tokens: Math.round(out.length / 2), input_tokens_details: { cached_tokens: 0 } },
    },
  })
  res.end()
}

http(async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/bili/')) return bili(req, res)
  if (req.method === 'GET' && req.url.startsWith('/files/')) {
    if (req.url === '/files/manual.pdf') return res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(tinyPdf())
    if (req.url === '/files/manual.jpg') return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(readFileSync('public/manuals/mouse-bt54/p0-2.jpg'))
    if (req.url === '/files/manual.html') {
      const steps = Array.from({ length: 8 }, (_, i) => `<section style="height:320px;border-bottom:1px solid #ddd"><h2>第 ${i + 1} 步</h2><p>（模拟）网页版说明书第 ${i + 1} 步：按住卡扣取下滤网。</p></section>`).join('')
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>测试说明书</title><body style="font:20px sans-serif;margin:40px"><h1>测试净化器 X1 使用说明</h1>${steps}</body>`)
    }
    // 官网的 WAF 拦截页（下载时是正常网页，浏览器里只剩一句提示）
    if (req.url === '/files/blocked.html') {
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>测试官网</title><body style="font:20px sans-serif;margin:40px"><h1>抱歉，您的请求被阻断了</h1><p>您无法继续访问 ${self}/files/blocked.html</p><p>请求ID：mock-1</p></body>`)
    }
    if (req.url === '/files/product.html') {
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>测试净化器 X1 介绍价格参考-测试官网</title><body><h1>测试净化器 X1</h1><p>立即购买</p></body>`)
    }
    return res.writeHead(404).end()
  }
  if (req.method === 'POST' && req.url.endsWith('/responses')) {
    let raw = ''
    for await (const c of req) raw += c
    return responses(req, res, JSON.parse(raw))
  }
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end(JSON.stringify({ error: { message: 'model not found' } }))
    return
  }
  let raw = ''
  for await (const c of req) raw += c
  const { messages, model, web_search_options } = JSON.parse(raw)
  if (web_search_options) {
    if (model !== 'chat-search') {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'web_search_options is not supported with this model' } }))
      return
    }
    const [kind, data] = searchAnswer(textOf(messages.filter((m) => m.role === 'user').at(-1).content))
    console.log(`${new Date().toLocaleTimeString()} 联网（chat）· ${kind}`)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(data) } }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  const [kind, data] = answer(messages)
  promptCheck(kind, messages)
  const out = JSON.stringify(data)
  const prompt = Math.round(JSON.stringify(messages).replace(/data:image\/[^"]+/g, 'IMG').length / 3)
  console.log(`${new Date().toLocaleTimeString()} ${kind} · 输入约 ${prompt} tokens · 输出 ${out.length} 字`)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (j) => res.write(`data: ${JSON.stringify(j)}\n\n`)
  const n = 24
  for (let i = 0; i < n; i++) {
    send({ choices: [{ delta: { content: out.slice((out.length * i) / n, (out.length * (i + 1)) / n) } }] })
    await sleep(120)
  }
  send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
  send({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.round(out.length / 2), prompt_tokens_details: { cached_tokens: 0 } } })
  res.end('data: [DONE]\n\n')
}).listen(port, '127.0.0.1', () => console.log(`mock LLM：http://127.0.0.1:${port}/v1 · 回放 ${id} · 分流 ${route}（把握 ${confidence}，用 ${skill}）（埋错：${origami ? `镜头只留 dir，${brokenStep.id} 折到第 99 步` : `${brokenStep.id} 无镜头，${body.id} 沉入地面`}）`))
