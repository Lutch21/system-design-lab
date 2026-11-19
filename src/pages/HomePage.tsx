import { useState } from 'react'
import { Diagram } from '../components/Diagram'
import { Card, LevelBadge, ProgressBar, btnGhost, btnPrimary } from '../components/ui'
import { lessons, paths } from '../lessons'
import { loadBalancing } from '../lessons/load-balancing'
import { href } from '../router'
import { lessonProgress, useProgress } from '../store/progress'

export function HomePage() {
  const { stepsSeen, quizScores, challengesPassed, cards } = useProgress()
  const [now] = useState(() => Date.now()) // read the clock once, not on every render
  const dueCount = Object.values(cards).filter((c) => c.due <= now).length

  const progressOf = (lessonId: string) => {
    const lesson = lessons.find((l) => l.id === lessonId)!
    return lessonProgress(stepsSeen[lessonId], lesson.steps.length, quizScores[lessonId] !== undefined)
  }
  // Resume the first lesson you haven't finished.
  const resume = lessons.find((l) => progressOf(l.id) < 1) ?? lessons[0]
  const heroStep = loadBalancing.steps[3]

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="grid items-center gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Learn system design
            <br />
            <span className="text-accent">by watching it work.</span>
          </h1>
          <p className="max-w-prose text-lg text-muted">
            Step through animated diagrams, break things on purpose, build your own designs in a live
            simulator, and talk it through with an AI tutor. From one server to millions of users.
          </p>
          <div className="flex flex-wrap gap-2">
            <a className={btnPrimary} href={href('learn', resume.id)}>
              {progressOf(resume.id) > 0 ? `Continue: ${resume.title}` : 'Start learning'} →
            </a>
            <a className={btnGhost} href={href('lab')}>
              Open the Design Lab
            </a>
            {dueCount > 0 && (
              <a className={btnGhost} href={href('practice')}>
                {dueCount} card{dueCount === 1 ? '' : 's'} to review
              </a>
            )}
          </div>
        </div>
        <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-surface">
          <Diagram scene={heroStep} title={heroStep.title} />
        </div>
      </section>

      {/* Learning paths */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Learning paths</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {paths.map((path) => {
            const parts = [
              ...path.lessonIds.map(progressOf),
              ...path.challengeIds.map((id) => (challengesPassed[id] ? 1 : 0)),
            ]
            const value = parts.reduce((a, b) => a + b, 0) / parts.length
            return (
              <Card key={path.id} className="space-y-3">
                <div>
                  <h3 className="font-bold">{path.title}</h3>
                  <p className="text-sm text-muted">{path.description}</p>
                </div>
                <ProgressBar value={value} label={`${path.title} progress`} />
                <ul className="space-y-1 text-sm">
                  {path.lessonIds.map((id) => {
                    const lesson = lessons.find((l) => l.id === id)!
                    return (
                      <li key={id}>
                        <a href={href('learn', id)} className="hover:text-accent">
                          {progressOf(id) >= 1 ? '✓' : '○'} {lesson.title}
                        </a>
                      </li>
                    )
                  })}
                  <li>
                    <a href={href('lab')} className="hover:text-accent">
                      {path.challengeIds.every((id) => challengesPassed[id]) ? '✓' : '○'} {path.challengeIds.length} Lab
                      challenge{path.challengeIds.length === 1 ? '' : 's'}
                    </a>
                  </li>
                  {path.id === 'interview' && (
                    <li>
                      <a href={href('tutor')} className="hover:text-accent">
                        ○ Mock interview with the AI tutor
                      </a>
                    </li>
                  )}
                </ul>
              </Card>
            )
          })}
        </div>
      </section>

      {/* All lessons */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Lessons</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lessons.map((lesson, i) => (
            <a key={lesson.id} href={href('learn', lesson.id)} className="group">
              <Card className="h-full space-y-2 transition-colors group-hover:border-accent">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <LevelBadge level={lesson.level} />
                </div>
                <h3 className="font-bold">{lesson.title}</h3>
                <p className="text-sm text-muted">{lesson.summary}</p>
                <p className="text-xs text-muted">
                  {lesson.steps.length} steps · quiz
                  {lesson.steps.some((s) => s.breakIt) ? ' · break-it' : ''}
                </p>
                <ProgressBar value={progressOf(lesson.id)} label={`${lesson.title} progress`} />
              </Card>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
