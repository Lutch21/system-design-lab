import { caching } from './caching'
import { databaseScaling } from './database-scaling'
import { loadBalancing } from './load-balancing'
import { queues } from './queues'
import type { Lesson, Question } from './types'

/** Every lesson, in suggested order. Add new lessons here. */
export const lessons: Lesson[] = [loadBalancing, caching, databaseScaling, queues]

export function findLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id)
}

/** Learning paths group lessons (and Lab challenges) toward a goal. */
export interface LearningPath {
  id: string
  title: string
  description: string
  lessonIds: string[]
  challengeIds: string[]
}

export const paths: LearningPath[] = [
  {
    id: 'fundamentals',
    title: 'Fundamentals',
    description: 'Scale a web app from one server to many.',
    lessonIds: ['load-balancing', 'caching'],
    challengeIds: ['first-scale'],
  },
  {
    id: 'scaling-data',
    title: 'Scaling data',
    description: 'Replicas, shards and asynchronous work.',
    lessonIds: ['database-scaling', 'queues'],
    challengeIds: ['read-heavy'],
  },
  {
    id: 'interview',
    title: 'Interview prep',
    description: 'Every lesson, every Lab challenge, then a mock interview.',
    lessonIds: lessons.map((l) => l.id),
    challengeIds: ['first-scale', 'read-heavy', 'no-spof'],
  },
]

/** Every question in a lesson: the predict questions inside steps plus the end-of-lesson quiz. */
export function questionsFor(lesson: Lesson): Question[] {
  const predicts = lesson.steps.flatMap((s) => (s.predict ? [s.predict] : []))
  return [...predicts, ...lesson.quiz]
}
