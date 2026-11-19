import { useState } from 'react'
import { TutorChat } from '../components/TutorChat'
import { Card } from '../components/ui'

const INTERVIEW_QUESTIONS = [
  { id: 'url-shortener', title: 'Design a URL shortener', hint: 'Like bit.ly: 100M new links a month, read-heavy.' },
  { id: 'news-feed', title: 'Design a news feed', hint: 'Fan-out on write vs read, celebrities, ranking.' },
  { id: 'chat', title: 'Design a chat app', hint: 'WebSockets, message ordering, offline delivery.' },
  { id: 'rate-limiter', title: 'Design a rate limiter', hint: 'Token bucket, distributed counters, 429s.' },
  { id: 'ride-sharing', title: 'Design ride sharing', hint: 'Location updates, matching, geo-indexing.' },
]

export function TutorPage() {
  const [tab, setTab] = useState<'ask' | 'interview'>('ask')
  const [questionId, setQuestionId] = useState(INTERVIEW_QUESTIONS[0].id)
  const question = INTERVIEW_QUESTIONS.find((q) => q.id === questionId)!

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">AI tutor</h1>
        <p className="text-muted">Ask anything about system design, or practise a mock interview.</p>
      </div>

      <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist">
        {(['ask', 'interview'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-accent text-accent-ink' : 'text-muted'}`}
          >
            {t === 'ask' ? 'Ask anything' : 'Mock interview'}
          </button>
        ))}
      </div>

      {tab === 'ask' ? (
        <TutorChat
          title="Ask the tutor"
          mode="ask"
          context="General system design question; no specific lesson step."
          suggestions={[
            'When should I use SQL vs NoSQL?',
            'Explain the CAP theorem with an example',
            'How do I estimate QPS for an interview?',
            'What is the difference between a queue and a stream?',
          ]}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="space-y-2">
            <h2 className="mb-1 font-bold">Pick a question</h2>
            {INTERVIEW_QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => setQuestionId(q.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  q.id === questionId ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'
                }`}
              >
                <div className="text-sm font-semibold">{q.title}</div>
                <div className="text-xs text-muted">{q.hint}</div>
              </button>
            ))}
            <p className="pt-2 text-xs text-muted">
              Tip: sketch your answer in the Design Lab, then paste the simulator results here.
            </p>
          </Card>
          <TutorChat
            key={question.id}
            title={question.title}
            mode="interview"
            context={`Interview question: ${question.title}. ${question.hint}`}
            suggestions={['I’m ready, let’s start.']}
            placeholder="Your answer…"
          />
        </div>
      )}
    </div>
  )
}
