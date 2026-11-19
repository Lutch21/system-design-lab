// The components you can place in the Design Lab, with simple, round-number specs.
// Real systems vary hugely; these are chosen so trade-offs are easy to see.

export type ComponentKind = 'client' | 'cdn' | 'lb' | 'server' | 'cache' | 'db' | 'replica' | 'queue' | 'worker'

export interface ComponentSpec {
  kind: ComponentKind
  label: string
  /** Requests per second it can handle before it saturates. */
  capacity: number
  /** Time to handle one request when idle. */
  latencyMs: number
  costPerMonth: number
  /** For caches and CDNs: share of requests answered without going further. */
  hitRate?: number
  color: string
  description: string
}

export const CATALOG: Record<ComponentKind, ComponentSpec> = {
  client: {
    kind: 'client',
    label: 'Clients',
    capacity: Infinity,
    latencyMs: 0,
    costPerMonth: 0,
    color: '#f4a259',
    description: 'Where traffic starts. Uses DNS failover: skips targets that are down.',
  },
  cdn: {
    kind: 'cdn',
    label: 'CDN',
    capacity: 100_000,
    latencyMs: 5,
    costPerMonth: 40,
    hitRate: 0.6,
    color: '#3bc9db',
    description: 'Edge cache for static files. Answers 60% of requests near the user.',
  },
  lb: {
    kind: 'lb',
    label: 'Load balancer',
    capacity: 50_000,
    latencyMs: 1,
    costPerMonth: 25,
    color: '#9775fa',
    description: 'Splits traffic evenly across healthy targets (health checks).',
  },
  server: {
    kind: 'server',
    label: 'App server',
    capacity: 1_000,
    latencyMs: 20,
    costPerMonth: 70,
    color: '#5c7cfa',
    description: 'Runs your application code. ~1,000 req/s each.',
  },
  cache: {
    kind: 'cache',
    label: 'Cache',
    capacity: 50_000,
    latencyMs: 1,
    costPerMonth: 60,
    hitRate: 0.85,
    color: '#fa5252',
    description: 'In-memory cache. Connect it next to a database (cache-aside): 85% of reads never reach the DB.',
  },
  db: {
    kind: 'db',
    label: 'Database',
    capacity: 2_000,
    latencyMs: 10,
    costPerMonth: 250,
    color: '#40c057',
    description: 'Primary database. ~2,000 queries/s.',
  },
  replica: {
    kind: 'replica',
    label: 'Read replica',
    capacity: 2_000,
    latencyMs: 10,
    costPerMonth: 200,
    color: '#94d82d',
    description: 'Copy of the database. Shares reads with the primary and takes over if it fails.',
  },
  queue: {
    kind: 'queue',
    label: 'Queue',
    capacity: 20_000,
    latencyMs: 3,
    costPerMonth: 30,
    color: '#fcc419',
    description: 'Accepts work and hands it to workers in the background. Users don’t wait for workers.',
  },
  worker: {
    kind: 'worker',
    label: 'Worker',
    capacity: 500,
    latencyMs: 50,
    costPerMonth: 50,
    color: '#cc5de8',
    description: 'Processes jobs from a queue. ~500 jobs/s each.',
  },
}

export const PALETTE_ORDER: ComponentKind[] = ['client', 'cdn', 'lb', 'server', 'cache', 'db', 'replica', 'queue', 'worker']
