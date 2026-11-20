// 联网搜索：用现有的 AI 服务（OpenAI 兼容）带上搜索工具问一次，要求回 JSON。各家开联网的方式不一样，依次试：
//   responses：POST /responses，tools [{ type: 'web_search' }]（OpenAI 和兼容 Responses API 的服务；老版本叫 web_search_preview）
//   chat：Chat Completions + web_search_options（OpenAI 的搜索模型）
//   dashscope：Chat Completions + enable_search（通义千问，只在 DashScope 地址上试）
// 试通的方式记在 kv 表里（换了模型或服务地址会重试）。AI_SEARCH_MODEL / AI_SEARCH_BASE_URL / AI_SEARCH_API_KEY
// 可以单独给搜索指定模型和服务，不设就用 AI_* 那一套。
import { chatJson, explain, LlmError, NET_TRIES, netError, netMessage, netWait, parseJson, type LlmConfig, type Usage } from './llm.ts'
import { getKv, now, setKv } from './sql.ts'

type Env = Record<string, string>
export type SearchMode = 'responses' | 'responses-preview' | 'chat' | 'dashscope'
export const MODE_LABEL: Record<SearchMode, string> = {
  responses: 'Responses API · web_search',
  'responses-preview': 'Responses API · web_search_preview',
  chat: 'Chat Completions · web_search_options',
  dashscope: 'Chat Completions · enable_search（通义）',
}

export interface Citation {
  url: string
  title: string
}

export interface SearchResult<T> {
  data: T
  text: string
  usage: Usage
  /** 模型回复里引用的网页（Responses API 才有） */
  citations: Citation[]
  mode: SearchMode
  /** 确实调用了搜索（Responses API 能看到搜索记录）；null = 这种方式看不出来 */
  searched: boolean | null
  model: string
}

interface SavedMode {
  mode: SearchMode
  model: string
  base: string
  at: string
}

const KV = 'web_search_mode'
const TIMEOUT_MS = 10 * 60 * 1000
/** 流这么久一个字节都没来：当作连接悄悄断了，重连（不然要干等到 TIMEOUT_MS） */
const IDLE_MS = Number(process.env.SEARCH_IDLE_MS) || 180_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function searchConfig(env: Env): LlmConfig | null {
  const key = env.AI_SEARCH_API_KEY || env.AI_API_KEY
  if (!key) return null
  return {
    base: (env.AI_SEARCH_BASE_URL || env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    key,
    model: env.AI_SEARCH_MODEL || env.AI_MANUAL_MODEL || env.AI_MODEL || 'gpt-4o',
    reasoning: env.AI_REASONING_EFFORT || undefined,
  }
}

const isDashscope = (base: string) => /dashscope|aliyuncs/i.test(base)

/** 上次试通的方式（同一个模型、同一个服务地址才算） */
export function knownMode(cfg: LlmConfig): SearchMode | undefined {
  const s = getKv<SavedMode>(KV)
  return s && s.model === cfg.model && s.base === cfg.base ? s.mode : undefined
}

function order(cfg: LlmConfig): SearchMode[] {
  const all: SearchMode[] = isDashscope(cfg.base) ? ['dashscope', 'responses', 'chat'] : ['responses', 'responses-preview', 'chat']
  const known = knownMode(cfg)
  return known ? [known, ...all.filter((m) => m !== known)] : all
}

/** 这种方式这家服务不支持（换下一种）；别的错误照常抛 */
class Unsupported extends Error {}

/** 流里收到的 error / response.failed：多半是服务那头一时出错，跟断网一样重试 */
class StreamError extends LlmError {}

type StreamErr = { message?: string; code?: string; error?: { message?: string; code?: string; type?: string } | null }
const errText = (e: StreamErr) => e.message || e.error?.message || e.code || e.error?.code || e.error?.type || JSON.stringify(e).slice(0, 200)

/** 400 / 404 / 405 / 422 且说的是接口、工具或参数不认识：当作不支持 */
function unsupported(status: number, body: string) {
  if (status === 404 || status === 405 || status === 501) return !/model_not_found|does not exist|no such model/i.test(body) || /responses/i.test(body)
  return (status === 400 || status === 422) && /tool|web_search|search|unsupported|not support|unknown|unrecognized|invalid|extra|not allowed|not permitted/i.test(body)
}

type ResponsesOutput = {
  type?: string
  content?: { type?: string; text?: string; annotations?: { type?: string; url?: string; title?: string }[] }[]
}
interface ResponsesBody {
  output?: ResponsesOutput[]
  output_text?: string
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
  error?: { message?: string } | null
  status?: string
  incomplete_details?: { reason?: string } | null
}

async function readResponses(res: Response, onChunk: () => void): Promise<{ body: ResponsesBody; streamed: string; searched: boolean }> {
  if (!(res.headers.get('content-type') ?? '').includes('event-stream')) {
    const body = (await res.json()) as ResponsesBody
    return { body, streamed: '', searched: !!body.output?.some((o) => o.type === 'web_search_call') }
  }
  const decoder = new TextDecoder()
  let buf = ''
  let streamed = ''
  let searched = false
  let body: ResponsesBody | undefined
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    onChunk()
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      let e: StreamErr & { type?: string; delta?: string; response?: ResponsesBody; item?: { type?: string } }
      try {
        e = JSON.parse(line.slice(5).trim())
      } catch {
        continue
      }
      if (e.type === 'response.output_text.delta' && e.delta) streamed += e.delta
      else if (e.type?.startsWith('response.web_search_call') || e.item?.type === 'web_search_call') searched = true
      else if ((e.type === 'response.completed' || e.type === 'response.incomplete' || e.type === 'response.failed') && e.response) body = e.response
      else if (e.type === 'error') throw new StreamError(`联网搜索出错：${errText(e)}`)
    }
  }
  // 流没等到结束事件就断了：跟网络断开一样处理
  if (!body) throw new Error('terminated')
  if (body.output?.some((o) => o.type === 'web_search_call')) searched = true
  return { body, streamed, searched }
}

async function viaResponses<T>(cfg: LlmConfig, system: string, prompt: string, tool: string, signal: AbortSignal): Promise<Omit<SearchResult<T>, 'mode' | 'model'>> {
  let reasoning = cfg.reasoning
  let unparsed = 0
  let net = 0
  for (let attempt = 0; ; attempt++) {
    let res: Response
    let read: Awaited<ReturnType<typeof readResponses>> | undefined
    const idle = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poke = () => {
      clearTimeout(timer)
      timer = setTimeout(() => idle.abort(), IDLE_MS)
    }
    poke()
    try {
      res = await fetch(`${cfg.base}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model,
          instructions: system,
          input: prompt,
          tools: [{ type: tool }],
          stream: true,
          ...(reasoning ? { reasoning: { effort: reasoning } } : {}),
        }),
        signal: AbortSignal.any([signal, idle.signal]),
      })
      if (res.ok) read = await readResponses(res, poke)
      if (read?.body.error) throw new StreamError(`联网搜索出错：${errText(read.body)}`)
    } catch (e) {
      const err = idle.signal.aborted && !signal.aborted ? new StreamError(`联网搜索 ${IDLE_MS / 1000} 秒没收到数据`) : e
      const stream = err instanceof StreamError && !signal.aborted
      if (!stream && !netError(err, signal)) throw err
      if (net >= NET_TRIES) throw stream ? new LlmError(`${(err as Error).message}（重试 ${net} 次还是这样）`) : netMessage(err, net)
      await netWait(net++, signal)
      continue
    } finally {
      clearTimeout(timer)
    }
    if (!read) {
      const text = await res.text()
      if (res.status === 400 && reasoning && /reasoning/i.test(text)) {
        reasoning = undefined
        continue
      }
      if (unsupported(res.status, text)) throw new Unsupported(`HTTP ${res.status} ${text.slice(0, 120)}`)
      const err = explain(res.status, text)
      if (err.fatal || attempt >= 2 || !(res.status === 429 || res.status >= 500)) throw err
      await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt * 5) * 1000)
      continue
    }
    const { body, streamed, searched } = read
    const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text')
    const text = parts.map((c) => c.text ?? '').join('') || body.output_text || streamed
    const seen = new Set<string>()
    const citations: Citation[] = []
    for (const a of parts.flatMap((c) => c.annotations ?? [])) {
      if (a.type !== 'url_citation' || !a.url || seen.has(a.url)) continue
      seen.add(a.url)
      citations.push({ url: a.url, title: a.title ?? a.url })
    }
    const usage: Usage = { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0, cached: body.usage?.input_tokens_details?.cached_tokens ?? 0 }
    try {
      return { data: parseJson<T>(text), text, usage, citations, searched }
    } catch (e) {
      if (!(e instanceof LlmError)) throw e
      if (body.incomplete_details?.reason) throw new LlmError(`联网搜索的回复没写完（${body.incomplete_details.reason}）`)
      e.raw = text
      if (unparsed++ < 1 && !signal.aborted) continue
      throw e
    }
  }
}

async function viaChat<T>(cfg: LlmConfig, system: string, prompt: string, extra: Record<string, unknown>, signal: AbortSignal) {
  try {
    const r = await chatJson<T>({ ...cfg, reasoning: undefined }, [{ role: 'system', content: system }, { role: 'user', content: prompt }], { signal, extra })
    return { ...r, citations: [] as Citation[], searched: null }
  } catch (e) {
    const m = e instanceof LlmError && e.message.match(/^AI 服务返回 (\d+)：([\s\S]*)$/)
    if (m && unsupported(Number(m[1]), m[2])) throw new Unsupported(`HTTP ${m[1]} ${m[2].slice(0, 120)}`)
    throw e
  }
}

/**
 * 带联网搜索问一次模型，回 JSON。哪种方式都不支持时抛出说明（fatal），后台据此提示换模型 / 服务。
 * only：只试这一种（检测时用）
 */
export async function searchJson<T>(env: Env, system: string, prompt: string, opts: { signal?: AbortSignal; only?: SearchMode } = {}): Promise<SearchResult<T>> {
  const cfg = searchConfig(env)
  if (!cfg) throw new LlmError('服务器还没配置 AI_API_KEY', true)
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS)
  const tried: string[] = []
  for (const mode of opts.only ? [opts.only] : order(cfg)) {
    try {
      const r =
        mode === 'responses' ? await viaResponses<T>(cfg, system, prompt, 'web_search', signal)
        : mode === 'responses-preview' ? await viaResponses<T>(cfg, system, prompt, 'web_search_preview', signal)
        : mode === 'chat' ? await viaChat<T>(cfg, system, prompt, { web_search_options: {} }, signal)
        : await viaChat<T>(cfg, system, prompt, { enable_search: true, search_options: { forced_search: true } }, signal)
      if (knownMode(cfg) !== mode) setKv(KV, { mode, model: cfg.model, base: cfg.base, at: now() } satisfies SavedMode)
      return { ...r, mode, model: cfg.model }
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e
      tried.push(`${MODE_LABEL[mode]}（${e.message}）`)
    }
  }
  throw new LlmError(
    `当前 AI 服务的模型 ${cfg.model} 不支持联网搜索。试过：${tried.join('；')}。` +
      '换一个能联网搜索的模型或服务：在 .env.local 设 AI_SEARCH_MODEL，需要时再设 AI_SEARCH_BASE_URL / AI_SEARCH_API_KEY，然后重启服务。',
    true,
  )
}
