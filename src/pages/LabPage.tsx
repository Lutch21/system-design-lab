import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { TutorChat } from '../components/TutorChat'
import { Card, btnGhost } from '../components/ui'
import { CATALOG, PALETTE_ORDER, type ComponentKind } from '../lab/catalog'
import { challenges, type Challenge } from '../lab/challenges'
import { LabNode, type LabNodeType } from '../lab/LabNode'
import { simulate, type SimResult } from '../lab/simulate'
import { useProgress } from '../store/progress'

const nodeTypes = { component: LabNode }
const SANDBOX = 'sandbox'

function startNodes(c: Challenge): LabNodeType[] {
  return c.start.nodes.map((n) => ({
    id: n.id,
    type: 'component',
    position: { x: n.x, y: n.y },
    data: { kind: n.kind, label: n.label },
  }))
}
function startEdges(c: Challenge): Edge[] {
  return c.start.edges.map(([source, target]) => ({ id: `${source}->${target}`, source, target }))
}

export function LabPage() {
  // useReactFlow() (used for drag-and-drop positions) needs this provider above it.
  return (
    <ReactFlowProvider>
      <Lab />
    </ReactFlowProvider>
  )
}

function Lab() {
  const [mode, setMode] = useState<string>(challenges[0].id)
  const challenge = challenges.find((c) => c.id === mode)
  const [nodes, setNodes, onNodesChange] = useNodesState<LabNodeType>(startNodes(challenges[0]))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(startEdges(challenges[0]))
  const [sandboxRps, setSandboxRps] = useState(1_000)
  const rps = challenge ? challenge.requestsPerSecond : sandboxRps
  const { screenToFlowPosition } = useReactFlow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const passChallenge = useProgress((s) => s.passChallenge)
  const challengesPassed = useProgress((s) => s.challengesPassed)

  // Only re-simulate when the design changes, not every time a node is dragged.
  const structure = JSON.stringify([
    nodes.map((n) => [n.id, n.data.kind, n.data.label, !!n.data.down]),
    edges.map((e) => [e.source, e.target]),
    rps,
  ])
  const result = useMemo<SimResult>(
    () =>
      simulate(
        nodes.map((n) => ({ id: n.id, kind: n.data.kind, label: n.data.label, down: n.data.down })),
        edges.map((e) => ({ source: e.source, target: e.target })),
        rps,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure],
  )

  const goals = challenge?.goals.map((g) => ({ label: g.label, passed: g.passed(result) })) ?? []
  const anyDown = nodes.some((n) => n.data.down)
  const allPassed = goals.length > 0 && goals.every((g) => g.passed) && !anyDown

  useEffect(() => {
    if (challenge && allPassed) passChallenge(challenge.id)
  }, [challenge, allPassed, passChallenge])

  // Add live simulator results to what React Flow draws (not to the saved design).
  const displayNodes = nodes.map((n) => ({
    ...n,
    data: { ...n.data, result: result.nodes[n.id], spof: result.spofs.includes(n.id) },
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const displayEdges = edges.map((e) => {
    const targetDown = byId.get(e.target)?.data.down
    const flowing = (result.nodes[e.source]?.served ?? 0) > 0 && (result.nodes[e.target]?.incoming ?? 0) > 0
    return {
      ...e,
      animated: flowing && !targetDown,
      style: targetDown ? { stroke: 'var(--bad)', strokeDasharray: '6 6' } : undefined,
    }
  })

  function loadMode(id: string) {
    setMode(id)
    const c = challenges.find((x) => x.id === id) ?? challenges[0]
    setNodes(startNodes(c))
    setEdges(startEdges(c))
  }

  function addComponent(kind: ComponentKind, position?: { x: number; y: number }) {
    const spec = CATALOG[kind]
    const count = nodes.filter((n) => n.data.kind === kind).length + 1
    const label = kind === 'client' ? 'Clients' : kind === 'db' && count === 1 ? 'Database' : `${spec.label} ${count}`
    let pos = position
    if (!pos) {
      // No drop position (clicked instead of dragged): place it near the middle of the canvas.
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 400, y: 300 }
      pos = screenToFlowPosition(center)
      pos = { x: pos.x - 88 + (Math.random() - 0.5) * 80, y: pos.y - 30 + (Math.random() - 0.5) * 80 }
    }
    const id = `${kind}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
    setNodes((ns) => [...ns, { id, type: 'component', position: pos, data: { kind, label } }])
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/sdl-kind') as ComponentKind
    if (!CATALOG[kind]) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addComponent(kind, { x: p.x - 88, y: p.y - 30 })
  }

  const selected = nodes.find((n) => n.selected)

  function toggleDown(id: string) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, down: !n.data.down } } : n)))
  }
  function remove(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
  }

  const label = (id: string) => byId.get(id)?.data.label ?? id

  const tutorContext = [
    challenge ? `Challenge: ${challenge.title}. ${challenge.brief}` : 'Free sandbox (no challenge).',
    `Traffic: ${rps.toLocaleString()} requests/s.`,
    'Components:',
    ...nodes.map((n) => {
      const r = result.nodes[n.id]
      return `- ${n.data.label} (${CATALOG[n.data.kind].label})${n.data.down ? ' [DOWN]' : ''}: ${Math.round(r?.incoming ?? 0)} req/s, load ${Math.round((r?.utilization ?? 0) * 100)}%`
    }),
    'Connections:',
    ...edges.map((e) => `- ${label(e.source)} → ${label(e.target)}`),
    `Simulator: avg latency ${Math.round(result.avgLatencyMs)} ms, errors ${(result.errorRate * 100).toFixed(1)}%, cost $${result.costPerMonth}/month.`,
    `Overloaded: ${result.overloaded.map(label).join(', ') || 'none'}. Single points of failure: ${result.spofs.map(label).join(', ') || 'none'}.`,
    ...result.warnings.map((w) => `Warning: ${w}`),
    ...goals.map((g) => `Goal "${g.label}": ${g.passed ? 'passed' : 'not yet'}`),
    'Simulator model: client and load balancer skip down targets; app servers send traffic to every tier they connect to; a cache beside a database removes 85% of DB reads; latency = base / (1 - load).',
  ].join('\n')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Design Lab</h1>
          <p className="text-muted">Drag components in, connect them left → right, and watch the numbers.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Mode</span>
          <select
            value={mode}
            onChange={(e) => loadMode(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2"
          >
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {challengesPassed[c.id] ? '✓ ' : ''}Challenge: {c.title}
              </option>
            ))}
            <option value={SANDBOX}>Free sandbox</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
        {/* Palette */}
        <Card className="h-fit p-3">
          <h2 className="mb-2 text-sm font-bold">Components</h2>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {PALETTE_ORDER.map((kind) => {
              const spec = CATALOG[kind]
              return (
                <button
                  key={kind}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/sdl-kind', kind)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => addComponent(kind)}
                  title={spec.description}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left text-sm hover:border-accent"
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: spec.color }} />
                  <span className="flex-1 truncate">{spec.label}</span>
                  {spec.costPerMonth > 0 && <span className="font-mono text-[10px] text-muted">${spec.costPerMonth}</span>}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            Click or drag to add. Drag from a node’s right dot to another node to connect. Select + Backspace to delete.
          </p>
        </Card>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-line"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(c: Connection) => setEdges((es) => addEdge(c, es))}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
            fitView
            fitViewOptions={{ padding: 0.5, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <Card className="space-y-3">
            {challenge ? (
              <>
                <div>
                  <h2 className="font-bold">{challenge.title}</h2>
                  <p className="text-sm text-muted">{challenge.brief}</p>
                </div>
                <ul className="space-y-1 text-sm">
                  {goals.map((g) => (
                    <li key={g.label} className={g.passed ? 'text-good' : 'text-muted'}>
                      {g.passed ? '✓' : '○'} {g.label}
                    </li>
                  ))}
                </ul>
                {allPassed && (
                  <p className="rounded-lg bg-good/15 p-2 text-sm font-semibold text-good">Challenge passed! 🎉</p>
                )}
                {anyDown && <p className="text-xs text-muted">Bring every component back up to complete the challenge.</p>}
              </>
            ) : (
              <label className="block space-y-1">
                <span className="flex justify-between text-sm">
                  <span className="font-bold">Traffic</span>
                  <span className="font-mono">{sandboxRps.toLocaleString()} req/s</span>
                </span>
                {/* Logarithmic slider: 100 to 100,000 req/s */}
                <input
                  type="range"
                  min={2}
                  max={5}
                  step={0.01}
                  value={Math.log10(sandboxRps)}
                  onChange={(e) => setSandboxRps(Math.round(10 ** Number(e.target.value) / 50) * 50 || 100)}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            )}

            <dl className="grid grid-cols-2 gap-2">
              <Stat label="Avg latency" value={`${Math.round(result.avgLatencyMs)} ms`} bad={result.avgLatencyMs > 300} />
              <Stat label="Errors" value={`${(result.errorRate * 100).toFixed(1)}%`} bad={result.errorRate >= 0.01} />
              <Stat label="Cost / month" value={`$${result.costPerMonth.toLocaleString()}`} />
              <Stat label="Traffic" value={`${rps.toLocaleString()}/s`} />
            </dl>

            {(result.overloaded.length > 0 || result.spofs.length > 0 || result.warnings.length > 0) && (
              <ul className="space-y-1.5 text-sm">
                {result.overloaded
                  .filter((id) => !result.nodes[id].async)
                  .map((id) => (
                    <li key={`o-${id}`} className="text-bad">
                      ▲ {label(id)} is overloaded ({Math.round(result.nodes[id].utilization * 100)}%)
                    </li>
                  ))}
                {result.spofs.map((id) => (
                  <li key={`s-${id}`} className="text-warn">
                    ◆ {label(id)} is a single point of failure
                  </li>
                ))}
                {result.warnings.map((w) => (
                  <li key={w} className="text-muted">
                    • {w}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {selected && (
            <Card className="space-y-2">
              <h3 className="font-bold">{selected.data.label}</h3>
              <p className="text-sm text-muted">{CATALOG[selected.data.kind].description}</p>
              <div className="flex gap-2">
                {selected.data.kind !== 'client' && (
                  <button className={btnGhost} onClick={() => toggleDown(selected.id)}>
                    {selected.data.down ? '↺ Bring back up' : '💥 Take down'}
                  </button>
                )}
                <button className={btnGhost} onClick={() => remove(selected.id)}>
                  Delete
                </button>
              </div>
            </Card>
          )}

          <TutorChat
            title="Review my design"
            mode="review"
            compact
            context={tutorContext}
            suggestions={['Review my design', 'Where is the bottleneck?', 'How do I remove single points of failure?']}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-line px-2.5 py-1.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`font-mono font-semibold tabular-nums ${bad ? 'text-bad' : ''}`}>{value}</dd>
    </div>
  )
}
