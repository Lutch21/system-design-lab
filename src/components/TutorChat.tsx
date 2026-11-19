import { useEffect, useRef, useState } from 'react'
import { askTutor, type ChatMessage, type TutorMode } from '../tutor/askTutor'
import { Card, btnPrimary } from './ui'

interface Props {
  title: string
  mode: TutorMode
  /** What the tutor should know: the lesson step, the Lab design, or the interview question. */
  context: string
  suggestions?: string[]
  /** Collapsed until opened; used beside lessons. */
  compact?: boolean
  placeholder?: string
}

export function TutorChat({ title, mode, context, suggestions = [], compact = false, placeholder }: Props) {
  const [open, setOpen] = useState(!compact)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Cancel an in-flight answer if this chat goes away.
  useEffect(() => () => abortRef.current?.abort(), [])
  // Braces matter: an effect may only return a cleanup function, and newer browsers make
  // scrollIntoView() return a Promise, which React would try to call and crash on.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError(null)
    setBusy(true)
    abortRef.current = new AbortController()

    try {
      await askTutor(
        { mode, context, messages: history },
        (chunk) =>
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
          }),
        abortRef.current.signal,
      )
    } catch (err) {
      setError((err as Error).message)
      setMessages(history.slice(0, -1)) // drop the unanswered question
      setInput(question) // ...but keep it in the box so it can be re-sent
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-line p-4 text-left text-sm text-muted hover:border-accent hover:text-ink"
      >
        <span className="font-semibold text-ink">✦ {title}</span>
        <br />
        Ask the AI tutor why, what if, or how it scales.
      </button>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">✦ {title}</h3>
        {compact && (
          <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink" aria-label="Close tutor">
            ✕
          </button>
        )}
      </div>

      <div className={`space-y-3 overflow-y-auto ${compact ? 'max-h-80' : 'max-h-[55vh] min-h-40'}`} aria-live="polite">
        {messages.length === 0 && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
              m.role === 'user' ? 'ml-8 bg-accent/10' : 'mr-4 bg-surface-2'
            }`}
          >
            {m.content || (busy && i === messages.length - 1 ? <span className="text-muted">Thinking…</span> : '')}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="rounded-lg bg-bad/10 p-2 text-sm text-bad">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? 'Ask a question…'}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Message to the tutor"
        />
        <button className={btnPrimary} disabled={busy || !input.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </Card>
  )
}
