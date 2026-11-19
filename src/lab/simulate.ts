// The Design Lab simulator: a deliberately simple "steady state" traffic model.
//
// 1. Traffic starts at Client nodes and flows along the arrows.
// 2. Each node serves up to its capacity; anything beyond that is dropped (errors).
// 3. Each node decides how to split what it forwards between its targets (see `routes`).
// 4. Latency rises as a node gets busy: latency / (1 - load), the classic queueing curve.
//
// It is a pure function (same input -> same output), so it is easy to test and reason about.
import { CATALOG, type ComponentKind } from './catalog'

export interface SimNode {
  id: string
  kind: ComponentKind
  label: string
  down?: boolean
}

export interface SimEdge {
  source: string
  target: string
}

export interface NodeResult {
  incoming: number // requests/s arriving
  served: number // requests/s handled
  dropped: number // requests/s rejected because it is down or overloaded
  utilization: number // incoming / capacity (1 = 100%)
  latencyMs: number // average time from this node onwards
  async: boolean // runs in the background (behind a queue)
}

export interface SimResult {
  nodes: Record<string, NodeResult>
  avgLatencyMs: number
  errorRate: number // 0..1
  costPerMonth: number
  overloaded: string[] // node ids
  spofs: string[] // single points of failure (node ids)
  warnings: string[]
}

/** How long a request waits at a node that is past capacity (queues are full). */
const SATURATED_FACTOR = 25

interface Route {
  target: string
  share: number // fraction of this node's served traffic sent to the target
}

/** Kinds whose callers route around failed members (health checks / failover). */
const HEALTH_CHECKED_GROUPS = new Set(['db', 'cache'])

/** Group targets by role: a server talks to "the database tier", not each box separately. */
function groupKey(kind: ComponentKind): string {
  return kind === 'replica' ? 'db' : kind
}

/**
 * Decide how a node splits the traffic it forwards.
 * - Clients and load balancers spread evenly across targets that are up.
 * - Other nodes send traffic to every *tier* they connect to, split evenly within a tier.
 *   The database tier skips members that are down (failover to a replica).
 * - Caches and CDNs only forward misses. A cache sitting beside a database (cache-aside)
 *   also means only misses reach that database.
 */
function routes(node: SimNode, targets: SimNode[]): Route[] {
  if (targets.length === 0) return []
  const spec = CATALOG[node.kind]
  const passOn = spec.hitRate !== undefined ? 1 - spec.hitRate : 1

  if (node.kind === 'client' || node.kind === 'lb') {
    const healthy = targets.filter((t) => !t.down)
    const pool = healthy.length > 0 ? healthy : targets
    return pool.map((t) => ({ target: t.id, share: passOn / pool.length }))
  }

  // Cache-aside: if this node also talks to a healthy cache, other tiers only see the misses.
  const caches = targets.filter((t) => t.kind === 'cache')
  const healthyCacheHit = caches.some((c) => !c.down) ? (CATALOG.cache.hitRate ?? 0) : 0

  const groups = new Map<string, SimNode[]>()
  for (const t of targets) {
    const key = groupKey(t.kind)
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const result: Route[] = []
  for (const [key, members] of groups) {
    // If the cache is down, the app just skips it and reads the database (which is now busier).
    if (key === 'cache' && caches.every((c) => c.down)) continue
    const pool = HEALTH_CHECKED_GROUPS.has(key) && members.some((m) => !m.down) ? members.filter((m) => !m.down) : members
    const tierShare = key === 'cache' ? passOn : passOn * (1 - healthyCacheHit)
    for (const m of pool) result.push({ target: m.id, share: tierShare / pool.length })
  }
  return result
}

/** Order nodes so every node comes after the nodes that send it traffic (Kahn's algorithm). */
function topologicalOrder(nodes: SimNode[], edges: SimEdge[]): { order: string[]; hasCycle: boolean } {
  const indegree = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const e of edges) {
      if (e.source !== id) continue
      const left = (indegree.get(e.target) ?? 0) - 1
      indegree.set(e.target, left)
      if (left === 0) ready.push(e.target)
    }
  }
  return { order, hasCycle: order.length < nodes.length }
}

export function simulate(nodes: SimNode[], edges: SimEdge[], requestsPerSecond: number, findSpofs = true): SimResult {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const validEdges = edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target)
  const targetsOf = (id: string) => validEdges.filter((e) => e.source === id).map((e) => byId.get(e.target)!)

  const warnings: string[] = []
  const clients = nodes.filter((n) => n.kind === 'client')
  if (clients.length === 0) warnings.push('Add a Clients node: that is where traffic starts.')

  const { order, hasCycle } = topologicalOrder(nodes, validEdges)
  if (hasCycle) warnings.push('Your design has a loop. Arrows should point from clients towards data.')

  // Work out routes once; reuse them for traffic and latency.
  const routeMap = new Map(nodes.map((n) => [n.id, routes(n, targetsOf(n.id))]))

  // --- Pass 1: push traffic forward ---------------------------------------------------
  const incoming = new Map(nodes.map((n) => [n.id, 0]))
  const isAsync = new Map(nodes.map((n) => [n.id, false]))
  for (const c of clients) incoming.set(c.id, requestsPerSecond / clients.length)

  const results: Record<string, NodeResult> = {}
  for (const id of order) {
    const node = byId.get(id)!
    const spec = CATALOG[node.kind]
    const inc = incoming.get(id) ?? 0
    const served = node.down ? 0 : Math.min(inc, spec.capacity)
    results[id] = {
      incoming: inc,
      served,
      dropped: inc - served,
      utilization: spec.capacity === Infinity ? 0 : inc / spec.capacity,
      latencyMs: 0,
      async: isAsync.get(id) ?? false,
    }
    for (const r of routeMap.get(id) ?? []) {
      incoming.set(r.target, (incoming.get(r.target) ?? 0) + served * r.share)
      // Anything after a queue happens in the background.
      if (node.kind === 'queue' || isAsync.get(id)) isAsync.set(r.target, true)
    }
  }

  // --- Pass 2: latency, from the back of the system to the front ---------------------
  for (const id of [...order].reverse()) {
    const node = byId.get(id)!
    const spec = CATALOG[node.kind]
    const r = results[id]
    let own = 0
    if (!node.down && spec.latencyMs > 0) {
      own = r.utilization >= 1 ? spec.latencyMs * SATURATED_FACTOR : spec.latencyMs / (1 - r.utilization)
    }
    // Users don't wait for work behind a queue.
    const downstream =
      node.kind === 'queue'
        ? 0
        : (routeMap.get(id) ?? []).reduce((sum, route) => sum + route.share * (results[route.target]?.latencyMs ?? 0), 0)
    r.latencyMs = own + downstream
  }

  // --- Summary ------------------------------------------------------------------------
  const syncDropped = Object.values(results)
    .filter((r) => !r.async)
    .reduce((sum, r) => sum + r.dropped, 0)
  const errorRate = requestsPerSecond > 0 && clients.length > 0 ? Math.min(syncDropped / requestsPerSecond, 1) : 0
  const avgLatencyMs = clients.length
    ? clients.reduce((sum, c) => sum + (results[c.id]?.latencyMs ?? 0), 0) / clients.length
    : 0
  const costPerMonth = nodes.reduce((sum, n) => sum + CATALOG[n.kind].costPerMonth, 0)
  const overloaded = nodes.filter((n) => n.kind !== 'client' && (results[n.id]?.utilization ?? 0) > 1).map((n) => n.id)

  for (const n of nodes) {
    if (n.kind !== 'client' && !n.down && results[n.id] && results[n.id].incoming === 0 && clients.length > 0) {
      warnings.push(`${n.label} receives no traffic. Connect something to it.`)
    }
  }
  for (const q of nodes.filter((n) => n.kind === 'queue')) {
    const workers = targetsOf(q.id).filter((t) => t.kind === 'worker' && !t.down)
    const capacity = workers.length * CATALOG.worker.capacity
    if ((results[q.id]?.served ?? 0) > capacity) {
      warnings.push(`${q.label}: jobs arrive faster than workers can process them, so the backlog keeps growing. Add workers.`)
    }
  }
  for (const id of overloaded) {
    if (results[id].async) warnings.push(`${byId.get(id)!.label} is overloaded (background work is falling behind).`)
  }

  // A single point of failure: taking it down makes most requests fail.
  const spofs: string[] = []
  if (findSpofs && errorRate < 0.5) {
    for (const n of nodes) {
      if (n.kind === 'client' || n.down) continue
      const withoutIt = nodes.map((m) => (m.id === n.id ? { ...m, down: true } : m))
      if (simulate(withoutIt, edges, requestsPerSecond, false).errorRate >= 0.5) spofs.push(n.id)
    }
  }

  return { nodes: results, avgLatencyMs, errorRate, costPerMonth, overloaded, spofs, warnings }
}
