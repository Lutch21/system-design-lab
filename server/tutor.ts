// The AI tutor API. One endpoint: POST /api/tutor
//
// The browser sends { mode, context, messages } and gets the tutor's reply back as a plain-text
// stream, so words appear as Claude writes them. The API key stays here on the server and is
// never sent to the browser.
//
// Run with `npm run server` (or `npm run dev`, which also starts the web app).
import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'

// Load settings (VAULT_ADDR, VAULT_TOKEN, TUTOR_PORT…) from .env if the file exists (Node 21+).
try {
  process.loadEnvFile()
} catch {
  /* no .env file: rely on the real environment */
}

const PORT = Number(process.env.TUTOR_PORT ?? 8787)
const MODEL = 'claude-opus-5-5'

// Where the key lives in Vault. KV v2 puts "data/" after the mount name in its HTTP API paths.
const VAULT_SECRET_PATH = 'secret/data/system-design-lab/tutor'

/**
 * Fetch ANTHROPIC_API_KEY from Vault once, at startup. Returns undefined (and says why) if
 * Vault isn't configured or can't be reached, so the server can fall back and still start.
 */
async function loadApiKeyFromVault(): Promise<string | undefined> {
  const addr = process.env.VAULT_ADDR
  const token = process.env.VAULT_TOKEN
  if (!addr || !token) return undefined

  try {
    const res = await fetch(`${addr}/v1/${VAULT_SECRET_PATH}`, {
      headers: { 'X-Vault-Token': token },
      signal: AbortSignal.timeout(3000),
    })
    if (res.status === 403) throw new Error('token rejected (expired? run `npm run vault:start`)')
    if (res.status === 404) throw new Error('no key stored yet (run `npm run vault:put-key`)')
    if (res.status === 503) throw new Error('Vault is sealed (run `npm run vault:start`)')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { data: { data: { ANTHROPIC_API_KEY?: string } } }
    return body.data.data.ANTHROPIC_API_KEY
  } catch (err) {
    const reason = err instanceof TypeError ? 'Vault is not running (run `npm run vault:start`)' : (err as Error).message
    console.warn(`[tutor] could not load the API key from Vault: ${reason}`)
    return undefined
  }
}

// Vault first; then a plain ANTHROPIC_API_KEY env var; then the SDK's own defaults
// (an `ant auth login` profile). Log where it came from, never the key itself.
const vaultKey = await loadApiKeyFromVault()
const apiKey = vaultKey ?? process.env.ANTHROPIC_API_KEY
console.log(`[tutor] API key source: ${vaultKey ? 'Vault' : apiKey ? 'environment' : 'none (SDK defaults)'}`)
const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic()

type Mode = 'ask' | 'review' | 'interview'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TutorRequest {
  mode: Mode
  context?: string
  messages: ChatMessage[]
}

const BASE_PROMPT = `You are the tutor inside System Design Lab, an interactive course where learners step through animated architecture diagrams and build designs in a simulator.

How to answer:
- Be clear, concrete and brief: usually 2–5 short paragraphs or a short "-" bullet list. Plain text only: no headings, tables, bold or code blocks.
- Use real numbers when they help (requests per second, latency in ms, storage in GB) and show quick back-of-envelope maths.
- Always name the trade-off: what a choice costs as well as what it buys.
- Ground your answer in the context you're given (the lesson step or the learner's design). If the question goes beyond it, answer anyway, briefly.
- If you're not sure about something, say so rather than guessing.`

const MODE_PROMPTS: Record<Mode, string> = {
  ask: 'The learner is asking about the lesson step described in the context. Explain the idea and connect it to what the diagram shows.',
  review: `The learner built the design described in the context in the Design Lab, and the context includes the simulator's results. Review it like a senior engineer: start with what works, then the 2–3 most important problems (bottlenecks, single points of failure, cost), each with a specific fix. Refer to components by their names in the design.`,
  interview: `You are running a mock system design interview for the question in the context. Act as the interviewer:
- Ask one question at a time and wait for the answer. Don't design the system for them.
- Follow a realistic flow: requirements and scale estimates, API, high-level design, data model, deep dive on one or two components, bottlenecks and trade-offs.
- Give brief feedback on each answer and push on weak spots, the way a fair interviewer would.
- When the learner says they're done (or after the deep dive), give a short scorecard: strengths, gaps, and a hire / lean hire / no hire signal with reasons.`,
}

const MAX_MESSAGES = 40
const MAX_CHARS = 8000

/** Check the request body has the shape we expect, so bad input fails early with a clear message. */
function parseRequest(raw: string): TutorRequest {
  const body = JSON.parse(raw) as Partial<TutorRequest>
  if (!body.mode || !(body.mode in MODE_PROMPTS)) throw new Error('mode must be ask, review or interview')
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error('messages is required')
  if (body.messages.length > MAX_MESSAGES) throw new Error(`at most ${MAX_MESSAGES} messages`)
  for (const m of body.messages) {
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) {
      throw new Error('each message needs a role (user/assistant) and non-empty content')
    }
    if (m.content.length > MAX_CHARS) throw new Error(`messages are limited to ${MAX_CHARS} characters`)
  }
  if (body.messages.at(-1)?.role !== 'user') throw new Error('the last message must be from the user')
  if (body.context && body.context.length > MAX_CHARS) throw new Error('context is too long')
  return { mode: body.mode, context: body.context, messages: body.messages }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > 200_000) throw new Error('request too large')
  }
  return data
}

async function handleTutor(req: http.IncomingMessage, res: http.ServerResponse) {
  let request: TutorRequest
  try {
    request = parseRequest(await readBody(req))
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`Bad request: ${(err as Error).message}`)
    return
  }

  const system = `${BASE_PROMPT}\n\n${MODE_PROMPTS[request.mode]}\n\n<context>\n${request.context ?? '(none)'}\n</context>`

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // If a safety classifier declines a request, the API retries it on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: request.messages,
  })

  // Stop paying for tokens if the learner closes the page mid-answer.
  res.on('close', () => {
    if (!res.writableFinished) stream.abort()
  })

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
        }
        res.write(event.delta.text)
      }
    }
    const final = await stream.finalMessage()
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    if (final.stop_reason === 'refusal') res.write('\n\n(The tutor can’t help with that one. Try rephrasing the question.)')
    if (final.stop_reason === 'max_tokens') res.write('\n\n(The answer was cut off. Ask me to continue.)')
    res.end()
  } catch (err) {
    if (stream.aborted) return // the browser went away; nothing to report
    console.error('[tutor]', err)
    const message = describeError(err)
    if (!res.headersSent) {
      res.writeHead(isAuthProblem(err) ? 401 : 502, {
        'Content-Type': 'text/plain; charset=utf-8',
      })
      res.end(message)
    } else {
      res.end(`\n\n(${message})`)
    }
  }
}

/** No key at all (SDK error before any request) or a key the API rejected. */
function isAuthProblem(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError) return true
  return err instanceof Error && /authentication method/i.test(err.message)
}

function describeError(err: unknown): string {
  if (isAuthProblem(err)) {
    return 'The tutor has no valid API key. Store one with `npm run vault:put-key`, then restart `npm run dev`.'
  }
  if (err instanceof Anthropic.RateLimitError) return 'The tutor is rate-limited right now. Wait a moment and try again.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection.'
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? 'unknown'}). Try again.`
  return 'Something went wrong in the tutor server.'
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/tutor') {
    void handleTutor(req, res)
    return
  }
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, model: MODEL }))
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, () => console.log(`[tutor] listening on http://localhost:${PORT} (model ${MODEL})`))
