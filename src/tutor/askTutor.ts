// Browser side of the tutor: POST to /api/tutor and read the reply as it streams in.

export type TutorMode = 'ask' | 'review' | 'interview'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askTutor(
  request: { mode: TutorMode; context: string; messages: ChatMessage[] },
  onText: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    throw new Error('Could not reach the tutor server. Start it with `npm run dev`.')
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    // Vite's proxy answers 500/502 with an empty body when the tutor server isn't running.
    throw new Error(text || 'The tutor server isn’t running. Start it with `npm run dev`.')
  }

  // The body is a stream of text chunks; decode and hand each one to the caller.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onText(value)
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err
  }
}
