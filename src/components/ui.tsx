// Small shared building blocks, so pages stay readable.
import { useState, type ReactNode } from 'react'
import type { Level, Metric, Question } from '../lessons/types'

export const btn =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
export const btnPrimary = `${btn} bg-accent text-accent-ink hover:opacity-90`
export const btnGhost = `${btn} border border-line bg-surface text-ink hover:bg-surface-2`

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <div className="flex items-center gap-2" aria-label={`${label}: ${pct}%`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted">{pct}%</span>
    </div>
  )
}

export function LevelBadge({ level }: { level: Level }) {
  const tone = level === 'Beginner' ? 'text-good' : level === 'Intermediate' ? 'text-warn' : 'text-bad'
  return <span className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{level}</span>
}

export function MetricsPanel({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-xl border border-line bg-surface px-3 py-2">
          <dt className="truncate text-xs text-muted">{m.label}</dt>
          <dd
            className={`font-mono text-lg font-semibold tabular-nums ${
              m.tone === 'good' ? 'text-good' : m.tone === 'bad' ? 'text-bad' : 'text-ink'
            }`}
          >
            {m.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A multiple-choice question. Calls onAnswer once, then shows the explanation. */
export function QuestionCard({
  question,
  onAnswer,
  footer,
}: {
  question: Question
  onAnswer?: (correct: boolean) => void
  footer?: ReactNode
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const answered = picked !== null

  function choose(i: number) {
    if (answered) return
    setPicked(i)
    onAnswer?.(i === question.answer)
  }

  return (
    <div className="space-y-3">
      <p className="font-semibold">{question.prompt}</p>
      <div className="grid gap-2">
        {question.options.map((option, i) => {
          const isRight = i === question.answer
          const state = !answered
            ? 'border-line hover:border-accent'
            : isRight
              ? 'border-good bg-good/10'
              : i === picked
                ? 'border-bad bg-bad/10'
                : 'border-line opacity-60'
          return (
            <button
              key={option}
              onClick={() => choose(i)}
              disabled={answered}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${state}`}
            >
              {option}
              {answered && isRight && <span className="ml-2 text-good">✓</span>}
              {answered && i === picked && !isRight && <span className="ml-2 text-bad">✗</span>}
            </button>
          )
        })}
      </div>
      {answered && (
        <p className="rounded-lg bg-surface-2 p-3 text-sm">
          <strong>{picked === question.answer ? 'Correct. ' : 'Not quite. '}</strong>
          {question.explain}
        </p>
      )}
      {answered && footer}
    </div>
  )
}
