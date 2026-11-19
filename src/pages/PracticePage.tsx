import { useState } from 'react'
import { Card, QuestionCard, btnGhost, btnPrimary } from '../components/ui'
import { lessons, questionsFor } from '../lessons'
import type { Question } from '../lessons/types'
import { href } from '../router'
import { useProgress } from '../store/progress'

// Every question from every lesson, looked up by id.
const QUESTIONS = new Map<string, { question: Question; lessonTitle: string }>(
  lessons.flatMap((l) => questionsFor(l).map((q) => [q.id, { question: q, lessonTitle: l.title }] as const)),
)

export function PracticePage() {
  const cards = useProgress((s) => s.cards)
  const reviewCard = useProgress((s) => s.reviewCard)

  // Take a snapshot of what's due when the session starts; answering a card changes its due date.
  const [session, setSession] = useState(() => dueIds(cards))
  const [position, setPosition] = useState(0)
  const [correct, setCorrect] = useState(0)

  const deckSize = Object.keys(cards).length
  const boxes = [1, 2, 3, 4, 5].map((b) => Object.values(cards).filter((c) => c.box === b).length)
  const current = session[position]
  const item = current ? QUESTIONS.get(current) : undefined

  if (deckSize === 0) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 text-center">
        <h1 className="text-2xl font-bold">Practice</h1>
        <p className="text-muted">Your review deck is empty. Start a lesson and its questions are added automatically.</p>
        <a className={btnPrimary} href={href('learn', lessons[0].id)}>
          Start the first lesson
        </a>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Practice</h1>
        <p className="text-muted">
          Spaced repetition: answer right and a card comes back later; miss it and you’ll see it again today.
        </p>
      </div>

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your deck</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {boxes.map((count, i) => (
            <div key={i} className="rounded-lg bg-surface-2 p-2">
              <div className="font-mono text-lg font-semibold">{count}</div>
              <div className="text-[11px] text-muted">{['New / missed', '1 day', '3 days', '1 week', '16 days'][i]}</div>
            </div>
          ))}
        </div>
      </Card>

      {item ? (
        <Card className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {item.lessonTitle} · card {position + 1} of {session.length}
          </p>
          <QuestionCard
            key={current}
            question={item.question}
            onAnswer={(ok) => {
              reviewCard(current, ok)
              if (ok) setCorrect((c) => c + 1)
            }}
            footer={
              <button className={btnPrimary} onClick={() => setPosition(position + 1)}>
                Next card →
              </button>
            }
          />
        </Card>
      ) : (
        <Card className="space-y-3 text-center">
          <h2 className="text-xl font-bold">{session.length > 0 ? `Done: ${correct} / ${session.length} correct` : 'All caught up'}</h2>
          <p className="text-muted">{nextDueText(cards)}</p>
          <div className="flex justify-center gap-2">
            <button
              className={btnGhost}
              onClick={() => {
                setSession(dueIds(useProgress.getState().cards))
                setPosition(0)
                setCorrect(0)
              }}
            >
              Check again
            </button>
            <a className={btnPrimary} href={href('lab')}>
              Try a Lab challenge
            </a>
          </div>
        </Card>
      )}
    </div>
  )
}

function dueIds(cards: Record<string, { due: number }>): string[] {
  const now = Date.now()
  return Object.entries(cards)
    .filter(([id, c]) => c.due <= now && QUESTIONS.has(id))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id)
}

function nextDueText(cards: Record<string, { due: number }>): string {
  const future = Object.values(cards)
    .map((c) => c.due)
    .filter((d) => d > Date.now())
  if (future.length === 0) return 'Nothing scheduled.'
  const next = new Date(Math.min(...future))
  return `Next card is due ${next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}.`
}
