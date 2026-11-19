// How one component looks on the Design Lab canvas: name, kind, and a live load bar.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CATALOG, type ComponentKind } from './catalog'
import type { NodeResult } from './simulate'

export type LabNodeData = {
  kind: ComponentKind
  label: string
  down?: boolean
  /** Filled in from the simulator just before rendering; not saved. */
  result?: NodeResult
  spof?: boolean
}

export type LabNodeType = Node<LabNodeData, 'component'>

export function LabNode({ data, selected }: NodeProps<LabNodeType>) {
  const spec = CATALOG[data.kind]
  const util = data.result?.utilization ?? 0
  const overloaded = util > 1
  const border = data.down
    ? 'border-line opacity-60'
    : overloaded
      ? 'border-bad'
      : data.spof
        ? 'border-warn border-dashed'
        : 'border-line'

  return (
    <div
      className={`w-44 rounded-xl border-2 bg-surface px-3 py-2 text-ink shadow-sm ${border} ${
        selected ? 'ring-2 ring-accent' : ''
      }`}
    >
      {data.kind !== 'client' && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: data.down ? '#adb5bd' : spec.color }} />
        <span className="truncate text-sm font-semibold">{data.label}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">
        {data.down ? 'DOWN' : data.label === spec.label || data.label.startsWith(spec.label) ? '' : spec.label}
        {data.spof && !data.down ? ' · single point of failure' : ''}
      </div>
      {data.kind !== 'client' && !data.down && (
        <div className="mt-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(util, 1) * 100}%`,
                background: overloaded ? 'var(--bad)' : util > 0.8 ? 'var(--warn)' : 'var(--good)',
              }}
            />
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[10px] text-muted">
            <span>{Math.round(data.result?.incoming ?? 0).toLocaleString()} req/s</span>
            <span className={overloaded ? 'font-bold text-bad' : ''}>{Math.round(util * 100)}%</span>
          </div>
        </div>
      )}
      {data.kind === 'client' && (
        <div className="mt-1 font-mono text-[10px] text-muted">
          {Math.round(data.result?.incoming ?? 0).toLocaleString()} req/s
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
