import { useEffect, useState } from 'react'
import { Diagram } from '../components/Diagram'
import { TutorChat } from '../components/TutorChat'
import { Card, LevelBadge, MetricsPanel, QuestionCard, btnGhost, btnPrimary } from '../components/ui'
import { findLesson, lessons, questionsFor } from '../lessons'
import type { Lesson } from '../lessons/types'
import { href } from '../router'
import { useProgress } from '../store/progress'

export function LessonPage({ lessonId }: { lessonId: string }) {
  const lesson = findLesson(lessonId)
  if (!lesson) {
    return (
      <Card>
        Lesson not found. <a className="text-accent underline" href={href()}>Back to lessons</a>
      </Card>
    )
  }
  // `key` resets all lesson state when you move to another lesson.
  return <LessonPlayer key={lesson.id} lesson={lesson} />
}

function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState(false) // "Break it" toggle
  const [revealed, setRevealed] = useState<Set<number>>(new Set()) // steps whose predict question was answered
  const markStep = useProgress((s) => s.markStep)
  const addCards = useProgress((s) => s.addCards)
  const reviewCard = useProgress((s) => s.reviewCard)

  const quizIndex = lesson.steps.length // the step after the last one is the quiz
  const onQuiz = index === quizIndex
  const step = lesson.steps[Math.min(index, lesson.steps.length - 1)]

  // A step with a predict question first shows the previous scene and asks what will happen.
  const waitingForPrediction = !onQuiz && !!step.predict && !revealed.has(index)
  const sceneStep = waitingForPrediction && index > 0 ? lesson.steps[index - 1] : step
  const scene = broken && step.breakIt && !waitingForPrediction ? step.breakIt : sceneStep

  // Starting a lesson adds its questions to your review deck.
  useEffect(() => {
    addCards(questionsFor(lesson).map((q) => q.id))
  }, [lesson, addCards])

  useEffect(() => {
    if (!onQuiz && !waitingForPrediction) markStep(lesson.id, index)
  }, [lesson.id, index, onQuiz, waitingForPrediction, markStep])

  function go(to: number) {
    setIndex(Math.max(0, Math.min(to, quizIndex)))
    setBroken(false)
  }

  // Arrow keys step through the lesson (unless you're typing in a box).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement).closest('input, textarea')
      if (typing) return
      if (e.key === 'ArrowRight' && !waitingForPrediction) go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const nextLesson = lessons[lessons.findIndex((l) => l.id === lesson.id) + 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={href()} className="text-sm text-muted hover:text-ink">
          ← All lessons
        </a>
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        <LevelBadge level={lesson.level} />
        <StepDots count={lesson.steps.length} index={index} onPick={go} />
      </div>

      {onQuiz ? (
        <QuizView lesson={lesson} nextLessonId={nextLesson?.id} onBack={() => go(quizIndex - 1)} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-surface">
              <Diagram scene={scene} title={step.title} />
            </div>
            <MetricsPanel metrics={scene.metrics} />
          </div>

          <div className="space-y-4">
            <Card className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Step {index + 1} of {lesson.steps.length}
              </p>

              {waitingForPrediction && step.predict ? (
                <>
                  <h2 className="text-lg font-bold">Predict first</h2>
                  <QuestionCard
                    key={step.predict.id}
                    question={step.predict}
                    onAnswer={(ok) => reviewCard(step.predict!.id, ok)}
                    footer={
                      <button
                        className={btnPrimary}
                        onClick={() => setRevealed(new Set(revealed).add(index))}
                      >
                        Show me →
                      </button>
                    }
                  />
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold">{step.title}</h2>
                  <p className="leading-relaxed text-ink/90">{step.body}</p>

                  {step.breakIt && (
                    <div className="rounded-xl border border-dashed border-bad/50 p-3">
                      <button
                        className={`${btnGhost} w-full ${broken ? 'border-bad text-bad' : ''}`}
                        onClick={() => setBroken(!broken)}
                        aria-pressed={broken}
                      >
                        {broken ? '↺ Fix it' : `💥 Break it: ${step.breakIt.label}`}
                      </button>
                      {broken && <p className="mt-3 text-sm leading-relaxed">{step.breakIt.explain}</p>}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button className={btnGhost} onClick={() => go(index - 1)} disabled={index === 0}>
                  ← Back
                </button>
                <button
                  className={`${btnPrimary} flex-1`}
                  onClick={() => go(index + 1)}
                  disabled={waitingForPrediction}
                >
                  {index === lesson.steps.length - 1 ? 'Take the quiz →' : 'Next →'}
                </button>
              </div>
            </Card>

            <TutorChat
              key={`${index}-${broken}`}
              title="Ask about this step"
              mode="ask"
              compact
              context={`Lesson: ${lesson.title}\nStep ${index + 1}: ${step.title}\n${step.body}${
                broken && step.breakIt ? `\nThe learner is looking at a failure: ${step.breakIt.label}. ${step.breakIt.explain}` : ''
              }\nNumbers shown: ${scene.metrics.map((m) => `${m.label} = ${m.value}`).join('; ')}`}
              suggestions={['Why does this work?', 'What are the trade-offs?', 'How would this look at 100× the traffic?']}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StepDots({ count, index, onPick }: { count: number; index: number; onPick: (i: number) => void }) {
  return (
    <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Steps">
      {Array.from({ length: count + 1 }, (_, i) => (
        <button
          key={i}
          onClick={() => onPick(i)}
          aria-label={i === count ? 'Quiz' : `Step ${i + 1}`}
          aria-current={i === index ? 'step' : undefined}
          className={`h-2.5 rounded-full transition-all ${
            i === index ? 'w-6 bg-accent' : i < index ? 'w-2.5 bg-accent/50' : 'w-2.5 bg-line'
          }`}
        />
      ))}
    </div>
  )
}

function QuizView({ lesson, nextLessonId, onBack }: { lesson: Lesson; nextLessonId?: string; onBack: () => void }) {
  const [current, setCurrent] = useState(0)
  const [correct, setCorrect] = useState(0)
  const saveQuiz = useProgress((s) => s.saveQuiz)
  const reviewCard = useProgress((s) => s.reviewCard)
  const done = current >= lesson.quiz.length

  useEffect(() => {
    if (done) saveQuiz(lesson.id, correct / lesson.quiz.length)
  }, [done, correct, lesson, saveQuiz])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="space-y-4">
        {!done ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Quiz · question {current + 1} of {lesson.quiz.length}
            </p>
            <QuestionCard
              key={lesson.quiz[current].id}
              question={lesson.quiz[current]}
              onAnswer={(ok) => {
                if (ok) setCorrect((c) => c + 1)
                reviewCard(lesson.quiz[current].id, ok)
              }}
              footer={
                <button className={btnPrimary} onClick={() => setCurrent(current + 1)}>
                  {current === lesson.quiz.length - 1 ? 'See my score' : 'Next question →'}
                </button>
              }
            />
          </>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">
              {correct} / {lesson.quiz.length} correct
            </h2>
            <p className="text-muted">
              These questions are now in your review deck. You’ll see the ones you missed again soon.
            </p>
            <div className="flex flex-wrap gap-2">
              {nextLessonId && (
                <a className={btnPrimary} href={href('learn', nextLessonId)}>
                  Next lesson →
                </a>
              )}
              <a className={btnGhost} href={href('lab')}>
                Try it in the Design Lab
              </a>
              <button className={btnGhost} onClick={onBack}>
                Review the last step
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-bold">Cheatsheet</h3>
        <dl className="space-y-2 text-sm">
          {lesson.cheatsheet.map((t) => (
            <div key={t.term}>
              <dt className="font-semibold">{t.term}</dt>
              <dd className="text-muted">{t.def}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
