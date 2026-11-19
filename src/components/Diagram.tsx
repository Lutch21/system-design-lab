import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { NodeKind, Scene, SceneEdge, SceneNode } from '../lessons/types'

// ---------------------------------------------------------------------------
// Isometric projection
// Grid x runs down-right and grid y runs down-left, like a classic isometric map.
// ---------------------------------------------------------------------------
const TILE_W = 58 // horizontal distance for one grid step
const TILE_H = 33 // vertical distance for one grid step
const BLOCK_W = 32 // half-width of a block's top face
const BLOCK_D = 18 // half-height of a block's top face

function project(x: number, y: number) {
  return { sx: (x - y) * TILE_W, sy: (x + y) * TILE_H }
}

/** Colours for each kind of component: top face, left face, right face. */
const PALETTE: Record<NodeKind, { top: string; left: string; right: string; height: number }> = {
  user: { top: '#f4a259', left: '#d9822b', right: '#b86a1f', height: 14 },
  dns: { top: '#a5d8ff', left: '#74c0fc', right: '#4dabf7', height: 18 },
  cdn: { top: '#99e9f2', left: '#3bc9db', right: '#15aabf', height: 18 },
  lb: { top: '#b197fc', left: '#9775fa', right: '#7950f2', height: 16 },
  server: { top: '#91a7ff', left: '#5c7cfa', right: '#4263eb', height: 30 },
  service: { top: '#91a7ff', left: '#748ffc', right: '#5c7cfa', height: 24 },
  cache: { top: '#ff8787', left: '#fa5252', right: '#e03131', height: 18 },
  db: { top: '#8ce99a', left: '#51cf66', right: '#37b24d', height: 36 },
  replica: { top: '#c0eb75', left: '#94d82d', right: '#74b816', height: 30 },
  queue: { top: '#ffd43b', left: '#fcc419', right: '#f59f00', height: 14 },
  worker: { top: '#e599f7', left: '#cc5de8', right: '#ae3ec9', height: 24 },
}
const DOWN = { top: '#ced4da', left: '#adb5bd', right: '#868e96' }

/** Where arrows attach: the middle of the block. */
function anchor(node: SceneNode) {
  const { sx, sy } = project(node.x, node.y)
  return { x: sx, y: sy + PALETTE[node.kind].height / 2 }
}

// ---------------------------------------------------------------------------

export function Diagram({ scene, title }: { scene: Scene; title: string }) {
  const reduceMotion = useReducedMotion()
  const byId = new Map(scene.nodes.map((n) => [n.id, n]))

  // Fit the view box around all nodes, with room for labels.
  // A minimum size keeps small scenes from being zoomed in too far.
  const points = scene.nodes.map((n) => project(n.x, n.y))
  const MIN_W = 720
  const MIN_H = 450
  let minX = Math.min(...points.map((p) => p.sx)) - 90
  let maxX = Math.max(...points.map((p) => p.sx)) + 90
  let minY = Math.min(...points.map((p) => p.sy)) - 50
  let maxY = Math.max(...points.map((p) => p.sy)) + 80
  if (maxX - minX < MIN_W) {
    const grow = (MIN_W - (maxX - minX)) / 2
    minX -= grow
    maxX += grow
  }
  if (maxY - minY < MIN_H) {
    const grow = (MIN_H - (maxY - minY)) / 2
    minY -= grow
    maxY += grow
  }

  // Draw back-to-front so nearer blocks overlap farther ones.
  const sorted = [...scene.nodes].sort((a, b) => a.x + a.y - (b.x + b.y))
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 20 }

  const description = `${title}. Components: ${scene.nodes
    .map((n) => `${n.label}${n.status === 'down' ? ' (down)' : n.status === 'hot' ? ' (overloaded)' : ''}`)
    .join(', ')}.`

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="h-full w-full"
      role="img"
      aria-label={description}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--edge)" />
        </marker>
        <marker id="arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--bad)" />
        </marker>
      </defs>

      {/* Floor grid gives the isometric feel. */}
      <FloorGrid minX={minX} maxX={maxX} minY={minY} maxY={maxY} />

      <AnimatePresence>
        {scene.edges.map((edge) => {
          const from = byId.get(edge.from)
          const to = byId.get(edge.to)
          if (!from || !to) return null
          return <Edge key={`${edge.from}->${edge.to}`} edge={edge} from={from} to={to} transition={transition} />
        })}
      </AnimatePresence>

      <AnimatePresence>
        {sorted.map((node) => (
          <Block key={node.id} node={node} transition={transition} />
        ))}
      </AnimatePresence>
    </svg>
  )
}

function FloorGrid({ minX, maxX, minY, maxY }: { minX: number; maxX: number; minY: number; maxY: number }) {
  const lines = []
  for (let i = -12; i <= 14; i++) {
    const a = project(i, -8)
    const b = project(i, 8)
    const c = project(-8, i)
    const d = project(14, i)
    lines.push(<line key={`a${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />)
    lines.push(<line key={`b${i}`} x1={c.sx} y1={c.sy} x2={d.sx} y2={d.sy} />)
  }
  return (
    <g stroke="var(--line)" strokeWidth={0.6} opacity={0.5} clipPath="none">
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="none" />
      {lines}
    </g>
  )
}

type Transition = { duration: number } | { type: 'spring'; stiffness: number; damping: number }

function Block({ node, transition }: { node: SceneNode; transition: Transition }) {
  const { sx, sy } = project(node.x, node.y)
  const base = PALETTE[node.kind]
  const colors = node.status === 'down' ? DOWN : base
  const h = base.height
  const W = BLOCK_W
  const D = BLOCK_D

  return (
    <motion.g
      initial={{ opacity: 0, x: sx, y: sy - 20 }}
      animate={{ opacity: node.status === 'dim' ? 0.35 : 1, x: sx, y: sy }}
      exit={{ opacity: 0, y: sy - 20 }}
      transition={transition}
    >
      {/* Overload glow under the block */}
      {node.status === 'hot' && (
        <ellipse className="hot-glow" cx={0} cy={h + 2} rx={W + 14} ry={D + 8} fill="var(--bad)" />
      )}
      {/* Block body: the top face sits at y = 0, the block extends down by h. */}
      <polygon points={`${-W},0 0,${D} 0,${D + h} ${-W},${h}`} fill={colors.left} />
      <polygon points={`${W},0 0,${D} 0,${D + h} ${W},${h}`} fill={colors.right} />
      <polygon points={`0,${-D} ${W},0 0,${D} ${-W},0`} fill={colors.top} stroke="rgba(0,0,0,0.08)" />

      {node.status === 'down' && (
        <g stroke="var(--bad)" strokeWidth={4} strokeLinecap="round">
          <line x1={-9} y1={-6} x2={9} y2={6} />
          <line x1={9} y1={-6} x2={-9} y2={6} />
        </g>
      )}

      <text
        x={0}
        y={D + h + 18}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="var(--ink)"
        style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}
      >
        {node.label}
      </text>
    </motion.g>
  )
}

function Edge({
  edge,
  from,
  to,
  transition,
}: {
  edge: SceneEdge
  from: SceneNode
  to: SceneNode
  transition: Transition
}) {
  const a = anchor(from)
  const b = anchor(to)
  // Stop the line short of the target block so the arrowhead is visible.
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const trim = 38
  const end = { x: b.x - ((b.x - a.x) / len) * trim, y: b.y - ((b.y - a.y) / len) * trim }
  const start = { x: a.x + ((b.x - a.x) / len) * 26, y: a.y + ((b.y - a.y) / len) * 26 }
  const d = `M${start.x},${start.y} L${end.x},${end.y}`

  const broken = edge.status === 'broken'
  const slow = edge.status === 'slow'
  const color = broken ? 'var(--bad)' : slow ? 'var(--warn)' : 'var(--edge)'
  const flowing = edge.flow !== false && !broken
  const duration = slow ? 3.6 : 1.5
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
      <motion.path
        initial={{ d }}
        animate={{ d }}
        transition={transition}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={broken ? '6 6' : undefined}
        markerEnd={broken ? 'url(#arrow-bad)' : 'url(#arrow)'}
      />
      {flowing &&
        [0, 1, 2].map((i) => (
          <circle key={i} className="flow-dot" r={3.5} fill={slow ? 'var(--warn)' : 'var(--accent)'}>
            <animateMotion dur={`${duration}s`} begin={`${(i * duration) / 3}s`} repeatCount="indefinite" path={d} />
          </circle>
        ))}
      {edge.label && (
        <text
          x={mid.x}
          y={mid.y - 8}
          textAnchor="middle"
          fontSize={11}
          fill={broken ? 'var(--bad)' : 'var(--muted)'}
          style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}
        >
          {edge.label}
        </text>
      )}
    </motion.g>
  )
}
