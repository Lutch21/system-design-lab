import { useState } from 'react'
import { Card } from '../components/ui'
import { lessons } from '../lessons'

// Rough, widely quoted orders of magnitude. Good enough for estimates, not benchmarks.
const LATENCY_NUMBERS = [
  { op: 'Read from L1 CPU cache', time: '1 ns' },
  { op: 'Read 1 MB from memory', time: '~10 µs' },
  { op: 'Redis / Memcached GET (same data centre)', time: '~0.5 ms' },
  { op: 'Round trip inside a data centre', time: '~0.5 ms' },
  { op: 'Read 1 MB from SSD', time: '~0.2 ms' },
  { op: 'Simple indexed database query', time: '1–10 ms' },
  { op: 'Read 1 MB from spinning disk', time: '~5 ms' },
  { op: 'Round trip US East ↔ US West', time: '~70 ms' },
  { op: 'Round trip US ↔ Europe', time: '~80–100 ms' },
  { op: 'Round trip US ↔ Australia', time: '~180 ms' },
]

const AVAILABILITY = [
  { nines: '99%', downtime: '3.65 days / year' },
  { nines: '99.9%', downtime: '8.8 hours / year' },
  { nines: '99.99%', downtime: '53 minutes / year' },
  { nines: '99.999%', downtime: '5.3 minutes / year' },
]

export function CheatsheetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cheatsheets</h1>
        <p className="text-muted">Numbers worth memorising, a back-of-envelope calculator, and every lesson on one page.</p>
      </div>

      <Estimator />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Latency numbers</h2>
          <table className="w-full text-sm">
            <tbody>
              {LATENCY_NUMBERS.map((row) => (
                <tr key={row.op} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3">{row.op}</td>
                  <td className="py-1.5 text-right font-mono whitespace-nowrap">{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Availability (“nines”)</h2>
          <table className="w-full text-sm">
            <tbody>
              {AVAILABILITY.map((row) => (
                <tr key={row.nines} className="border-b border-line last:border-0">
                  <td className="py-1.5 font-mono">{row.nines}</td>
                  <td className="py-1.5 text-right">{row.downtime} downtime</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            Components in series multiply: two 99.9% services in a chain give about 99.8%. Redundant copies in parallel
            add nines.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {lessons.map((lesson) => (
          <Card key={lesson.id}>
            <h2 className="mb-3 font-bold">{lesson.title}</h2>
            <dl className="space-y-2 text-sm">
              {lesson.cheatsheet.map((t) => (
                <div key={t.term}>
                  <dt className="font-semibold">{t.term}</dt>
                  <dd className="text-muted">{t.def}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Back-of-envelope estimator: turns users and behaviour into QPS, storage and bandwidth. */
function Estimator() {
  const [dau, setDau] = useState(1_000_000)
  const [requestsPerUser, setRequestsPerUser] = useState(20)
  const [readWrite, setReadWrite] = useState(10)
  const [peakFactor, setPeakFactor] = useState(3)
  const [objectKb, setObjectKb] = useState(2)
  const [years, setYears] = useState(5)

  const avgQps = (dau * requestsPerUser) / 86_400
  const peakQps = avgQps * peakFactor
  const writeQps = avgQps / (readWrite + 1)
  const storagePerYearGb = (writeQps * 86_400 * 365 * objectKb) / 1_000_000
  const bandwidthMbps = (avgQps * objectKb * 8) / 1_000
  const servers = Math.ceil(peakQps / 1_000) + 1 // ~1,000 req/s per server, plus one spare

  return (
    <Card>
      <h2 className="mb-4 font-bold">Back-of-envelope calculator</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-2 content-start gap-3">
          <NumberField label="Daily active users" value={dau} onChange={setDau} />
          <NumberField label="Requests per user / day" value={requestsPerUser} onChange={setRequestsPerUser} />
          <NumberField label="Reads per write" value={readWrite} onChange={setReadWrite} />
          <NumberField label="Peak ÷ average" value={peakFactor} onChange={setPeakFactor} />
          <NumberField label="Size per write (KB)" value={objectKb} onChange={setObjectKb} />
          <NumberField label="Keep data (years)" value={years} onChange={setYears} />
        </div>
        <dl className="grid grid-cols-2 gap-2 self-start">
          <Result label="Average QPS" value={fmt(avgQps)} hint="DAU × requests ÷ 86,400 s" />
          <Result label="Peak QPS" value={fmt(peakQps)} hint="average × peak factor" />
          <Result label="Write QPS" value={fmt(writeQps)} hint="average ÷ (reads per write + 1)" />
          <Result label="App servers at peak" value={servers.toLocaleString()} hint="~1,000 req/s each, + 1 spare" />
          <Result label="New storage / year" value={fmtGb(storagePerYearGb)} hint="writes × size × 365 days" />
          <Result label={`Storage over ${years} years`} value={fmtGb(storagePerYearGb * years)} hint="before replication (×3 is common)" />
          <Result label="Avg bandwidth" value={`${fmt(bandwidthMbps)} Mbps`} hint="QPS × size × 8 bits" />
        </dl>
      </div>
    </Card>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="block text-muted">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono outline-none focus:border-accent"
      />
    </label>
  )
}

function Result({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2" title={hint}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
      <dd className="text-[11px] text-muted">{hint}</dd>
    </div>
  )
}

const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1))
const fmtGb = (gb: number) => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${gb.toFixed(1)} GB`)
