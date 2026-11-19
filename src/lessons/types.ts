// Shared shapes for lesson content.
// A lesson is just data: a list of steps, and each step is a "scene" the diagram draws.

export type NodeKind =
  | 'user'
  | 'dns'
  | 'cdn'
  | 'lb'
  | 'server'
  | 'cache'
  | 'db'
  | 'replica'
  | 'queue'
  | 'worker'
  | 'service'

/** How a node looks right now: healthy, broken, overloaded, or faded into the background. */
export type NodeStatus = 'ok' | 'down' | 'hot' | 'dim'

export interface SceneNode {
  id: string
  kind: NodeKind
  label: string
  /** Position on the isometric grid. x goes down-right, y goes down-left. */
  x: number
  y: number
  status?: NodeStatus
}

export interface SceneEdge {
  from: string
  to: string
  label?: string
  /** Draw moving "request" dots along this arrow. Defaults to true. */
  flow?: boolean
  status?: 'ok' | 'broken' | 'slow'
}

export interface Metric {
  label: string
  value: string
  /** Colours the value: good = green, bad = red. */
  tone?: 'good' | 'bad' | 'neutral'
}

export interface Question {
  id: string
  prompt: string
  options: string[]
  /** Index into options. */
  answer: number
  explain: string
}

export interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  metrics: Metric[]
}

/** "Break it": an alternative scene that shows what happens when something fails. */
export interface Failure extends Scene {
  label: string
  explain: string
}

export interface Step extends Scene {
  title: string
  body: string
  /** Asked before the step is revealed: "what do you think happens?" */
  predict?: Question
  breakIt?: Failure
}

export interface Term {
  term: string
  def: string
}

export type Level = 'Beginner' | 'Intermediate' | 'Advanced'

export interface Lesson {
  id: string
  title: string
  level: Level
  summary: string
  steps: Step[]
  quiz: Question[]
  cheatsheet: Term[]
}
