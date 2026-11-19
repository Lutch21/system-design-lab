// Design Lab challenges: a starting design, a traffic level, and goals the simulator checks.
import type { ComponentKind } from './catalog'
import type { SimResult } from './simulate'

export interface StartNode {
  id: string
  kind: ComponentKind
  label: string
  x: number
  y: number
}

export interface Goal {
  label: string
  passed: (r: SimResult) => boolean
}

export interface Challenge {
  id: string
  title: string
  brief: string
  requestsPerSecond: number
  start: { nodes: StartNode[]; edges: [string, string][] }
  goals: Goal[]
}

const simpleStart = {
  nodes: [
    { id: 'clients', kind: 'client' as const, label: 'Clients', x: 0, y: 160 },
    { id: 'server-1', kind: 'server' as const, label: 'App server 1', x: 260, y: 160 },
    { id: 'db-1', kind: 'db' as const, label: 'Database', x: 520, y: 160 },
  ],
  edges: [
    ['clients', 'server-1'],
    ['server-1', 'db-1'],
  ] as [string, string][],
}

const errorsBelow = (pct: number): Goal => ({
  label: `Errors below ${pct}%`,
  passed: (r) => r.errorRate * 100 < pct,
})
const latencyBelow = (ms: number): Goal => ({
  label: `Avg latency below ${ms} ms`,
  passed: (r) => r.errorRate < 0.5 && r.avgLatencyMs < ms,
})
const costBelow = (usd: number): Goal => ({
  label: `Cost below $${usd.toLocaleString()} / month`,
  passed: (r) => r.costPerMonth < usd,
})

export const challenges: Challenge[] = [
  {
    id: 'first-scale',
    title: 'Survive the launch',
    brief: 'Your app is on the front page: 3,000 requests/s. One server and one database won’t cope. Scale it without overspending.',
    requestsPerSecond: 3_000,
    start: simpleStart,
    goals: [errorsBelow(1), latencyBelow(200), costBelow(1_000)],
  },
  {
    id: 'read-heavy',
    title: 'Read-heavy at 10k',
    brief: 'A catalogue site serves 10,000 requests/s, almost all reads. Keep it fast and keep the database from melting.',
    requestsPerSecond: 10_000,
    start: simpleStart,
    goals: [errorsBelow(1), latencyBelow(150), costBelow(2_500)],
  },
  {
    id: 'no-spof',
    title: 'No single point of failure',
    brief: 'At 2,000 requests/s, any one component may die at any moment. Design it so no single failure takes the site down.',
    requestsPerSecond: 2_000,
    start: simpleStart,
    goals: [
      errorsBelow(1),
      { label: 'No single points of failure', passed: (r) => r.spofs.length === 0 && r.errorRate < 0.5 },
      costBelow(2_000),
    ],
  },
]
