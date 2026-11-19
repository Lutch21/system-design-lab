// Saved progress: which lesson steps you've seen, quiz scores, Lab challenges passed,
// and spaced-repetition review cards. Stored in the browser with Zustand's `persist`.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

/** localStorage can throw (private windows, blocked storage). Fail quietly instead. */
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* progress just won't be saved */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

// Leitner boxes: a correct answer moves a card up a box, so you see it less often.
// Box 1 = review today, box 5 = review in 16 days.
const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 16]
const DAY = 24 * 60 * 60 * 1000

export interface Card {
  box: number // 1..5
  due: number // timestamp (ms)
}

interface ProgressState {
  /** Highest step index reached per lesson. */
  stepsSeen: Record<string, number>
  /** Best quiz score per lesson, as a fraction 0..1. */
  quizScores: Record<string, number>
  challengesPassed: Record<string, boolean>
  cards: Record<string, Card>

  markStep: (lessonId: string, stepIndex: number) => void
  saveQuiz: (lessonId: string, score: number) => void
  passChallenge: (id: string) => void
  /** Add cards for these question ids if they aren't in the deck yet. */
  addCards: (questionIds: string[]) => void
  reviewCard: (questionId: string, correct: boolean) => void
  reset: () => void
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      stepsSeen: {},
      quizScores: {},
      challengesPassed: {},
      cards: {},

      markStep: (lessonId, stepIndex) =>
        set((s) => ({
          stepsSeen: { ...s.stepsSeen, [lessonId]: Math.max(s.stepsSeen[lessonId] ?? -1, stepIndex) },
        })),

      saveQuiz: (lessonId, score) =>
        set((s) => ({ quizScores: { ...s.quizScores, [lessonId]: Math.max(s.quizScores[lessonId] ?? 0, score) } })),

      passChallenge: (id) => set((s) => ({ challengesPassed: { ...s.challengesPassed, [id]: true } })),

      addCards: (questionIds) =>
        set((s) => {
          const cards = { ...s.cards }
          for (const id of questionIds) cards[id] ??= { box: 1, due: Date.now() }
          return { cards }
        }),

      reviewCard: (questionId, correct) =>
        set((s) => {
          const current = s.cards[questionId] ?? { box: 1, due: Date.now() }
          const box = correct ? Math.min(current.box + 1, 5) : 1
          return { cards: { ...s.cards, [questionId]: { box, due: Date.now() + BOX_INTERVAL_DAYS[box] * DAY } } }
        }),

      reset: () => set({ stepsSeen: {}, quizScores: {}, challengesPassed: {}, cards: {} }),
    }),
    { name: 'sdl-progress', storage: createJSONStorage(() => safeStorage) },
  ),
)

/** Fraction of a lesson completed: steps seen plus whether the quiz was taken. */
export function lessonProgress(stepsSeen: number | undefined, stepCount: number, quizTaken: boolean): number {
  const steps = stepsSeen === undefined ? 0 : stepsSeen + 1
  return (steps + (quizTaken ? 1 : 0)) / (stepCount + 1)
}
