// OpenAI 兼容的 Chat Completions 客户端：流式读取（长输出不会撞上首包超时）、JSON 模式、限流重试。
// 只在开发服务器（Node）里用，Key 不出服务器。

type Env = Record<string, string>

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string | Part[]
}

export interface LlmConfig {
  base: string
  key: string
  model: string
  /** 推理模型的 reasoning_effort（low / medium / high），不支持的服务会自动去掉 */
  reasoning?: string
  maxTokens?: number
}

export interface Usage {
  input: number
  output: number
  cached: number
}

export function llmConfig(env: Env): LlmConfig | null {
  if (!env.AI_API_KEY) return null
  return {
    base: (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    key: env.AI_API_KEY,
    model: env.AI_MANUAL_MODEL || env.AI_MODEL || 'gpt-4o',
    reasoning: env.AI_REASONING_EFFORT || undefined,
    maxTokens: Number(env.AI_MAX_TOKENS) || undefined,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const NET_CODES = /^(ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_\w+)$/

/** 网络层断开（握手被重置、流读到一半断了、连不上），跟 AI 服务本身的报错无关，等一会儿重来通常就好 */
export function netError(e: unknown, signal?: AbortSignal) {
  if (signal?.aborted || !(e instanceof Error) || e instanceof LlmError) return false
  const code = String((e.cause as { code?: string } | undefined)?.code ?? (e as { code?: string }).code ?? '')
  return NET_CODES.test(code) || /^(fetch failed|terminated|other side closed)$/i.test(e.message) || e.name === 'TimeoutError'
}

export function netMessage(e: unknown, tries: number) {
  const err = e as Error & { cause?: { code?: string; message?: string } }
  const why = err.cause?.code || err.cause?.message || err.message
  return new LlmError(`连 AI 服务的网络断了（${why}），重试 ${tries} 次都没连上。检查本机网络 / 代理，过一会儿再试`)
}

/** 网络断开后的等待：3s、9s、27s */
export const netWait = (attempt: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 3000 * 3 ** attempt)
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

export const NET_TRIES = 3

export class LlmError extends Error {
  readonly fatal: boolean
  /** 解析失败时模型的原始回复 */
  raw?: string
  constructor(message: string, fatal = false) {
    super(message)
    this.fatal = fatal
  }
}

export function explain(status: number, body: string) {
  if (/credit_balance_exhausted|insufficient_quota/.test(body)) return new LlmError('AI 服务余额不足（账号没有可用额度）。去服务商后台充值，或在 .env.local 换一家 OpenAI 兼容服务（AI_BASE_URL / AI_API_KEY / AI_MANUAL_MODEL）。', true)
  if (status === 401 || status === 403) return new LlmError(`AI 服务拒绝了 Key（HTTP ${status}），检查 .env.local 的 AI_API_KEY`, true)
  if (status === 404 && /model/i.test(body)) return new LlmError(`模型不存在或无权使用：${body.slice(0, 200)}`, true)
  return new LlmError(`AI 服务返回 ${status}：${body.slice(0, 300)}`)
}

/**
 * 调一次模型，要求返回 JSON。onProgress 收到已生成的字符数（用来显示进度）。
 * 400 时依次去掉 response_format / reasoning_effort 重试（部分兼容服务不支持）。
 */
export async function chatJson<T = unknown>(
  cfg: LlmConfig,
  messages: Message[],
  opts: { onProgress?: (chars: number) => void; signal?: AbortSignal; extra?: Record<string, unknown> } = {},
): Promise<{ data: T; text: string; usage: Usage }> {
  let json = true
  let reasoning = cfg.reasoning
  let unparsed = 0
  let net = 0
  for (let attempt = 0; ; attempt++) {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...(reasoning ? { reasoning_effort: reasoning } : {}),
      ...(cfg.maxTokens ? { max_tokens: cfg.maxTokens } : {}),
      ...opts.extra,
    }
    let res: Response
    try {
      res = await fetch(`${cfg.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
    } catch (e) {
      if (!netError(e, opts.signal)) throw e
      if (net >= NET_TRIES) throw netMessage(e, net)
      await netWait(net++, opts.signal)
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 400 && json && /response_format|json_object/i.test(text)) {
        json = false
        continue
      }
      if (res.status === 400 && reasoning && /reasoning/i.test(text)) {
        reasoning = undefined
        continue
      }
      const err = explain(res.status, text)
      if (err.fatal || attempt >= 3 || !(res.status === 429 || res.status >= 500)) throw err
      await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt * 3) * 1000)
      continue
    }
    let read: Awaited<ReturnType<typeof readStream>>
    try {
      read = await readStream(res, opts.onProgress)
    } catch (e) {
      if (!netError(e, opts.signal)) throw e
      if (net >= NET_TRIES) throw netMessage(e, net)
      await netWait(net++, opts.signal)
      continue
    }
    const { text, usage, finish, refusal } = read
    if (finish === 'length') throw new LlmError('模型输出被截断（超过最大输出长度）。换一个输出上限更大的模型，或在 .env.local 设 AI_MAX_TOKENS。')
    try {
      if (refusal && !text.trim()) throw new LlmError(`模型拒绝回答：${refusal.slice(0, 200)}`)
      return { data: parseJson<T>(text), text, usage }
    } catch (e) {
      if (!(e instanceof LlmError)) throw e
      e.raw = text || refusal
      // 偶尔会回一段话、空回复或拒绝：同样的请求再问一次通常就好
      if (unparsed++ < 1 && !opts.signal?.aborted) continue
      throw e
    }
  }
}

async function readStream(res: Response, onProgress?: (chars: number) => void) {
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let refusal = ''
  let finish = ''
  const usage: Usage = { input: 0, output: 0, cached: 0 }
  let lastReport = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      let j: {
        choices?: { delta?: { content?: string; refusal?: string }; finish_reason?: string }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
      }
      try {
        j = JSON.parse(payload)
      } catch {
        continue
      }
      const c = j.choices?.[0]
      if (c?.delta?.content) text += c.delta.content
      if (c?.delta?.refusal) refusal += c.delta.refusal
      if (c?.finish_reason) finish = c.finish_reason
      if (j.usage) {
        usage.input = j.usage.prompt_tokens ?? 0
        usage.output = j.usage.completion_tokens ?? 0
        usage.cached = j.usage.prompt_tokens_details?.cached_tokens ?? 0
      }
      if (onProgress && text.length - lastReport > 400) {
        lastReport = text.length
        onProgress(text.length)
      }
    }
  }
  return { text, usage, finish, refusal }
}

/** 取出回复里的 JSON：去掉 ``` 围栏、截到最外层大括号，容忍尾逗号 */
export function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new LlmError('模型没有返回 JSON')
  const body = raw.slice(start, end + 1)
  try {
    return JSON.parse(body) as T
  } catch {
    try {
      return JSON.parse(body.replace(/,\s*([}\]])/g, '$1')) as T
    } catch (e) {
      throw new LlmError(`模型返回的 JSON 无法解析：${(e as Error).message}`)
    }
  }
}
