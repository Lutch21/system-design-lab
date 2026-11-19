import type { Lesson, SceneNode } from './types'

const app: SceneNode = { id: 'app', kind: 'server', label: 'App servers', x: 0, y: 0 }
const primary: SceneNode = { id: 'primary', kind: 'db', label: 'Primary', x: 3, y: 0 }
const replica = (n: number, y: number): SceneNode => ({
  id: `r${n}`,
  kind: 'replica',
  label: `Read replica ${n}`,
  x: 5.5,
  y,
})
const shard = (n: number, y: number, label: string, status?: SceneNode['status']): SceneNode => ({
  id: `sh${n}`,
  kind: 'db',
  label,
  x: 4,
  y,
  status,
})

export const databaseScaling: Lesson = {
  id: 'database-scaling',
  title: 'Replication & sharding',
  level: 'Intermediate',
  summary: 'Scale reads with replicas, scale writes and storage with shards, and learn what each costs.',
  steps: [
    {
      title: 'One database, read-heavy traffic',
      body: 'Most apps read far more than they write (often 10:1 or more). A single database handles both, and reads are using most of its capacity.',
      nodes: [app, { ...primary, status: 'hot' }],
      edges: [{ from: 'app', to: 'primary', label: 'reads + writes' }],
      metrics: [
        { label: 'Reads / s', value: '9,000' },
        { label: 'Writes / s', value: '900' },
        { label: 'Database CPU', value: '95%', tone: 'bad' },
      ],
    },
    {
      title: 'Read replicas',
      body: 'The primary takes all writes and streams them to read replicas. The app sends reads to the replicas, so read capacity grows with each replica you add.',
      nodes: [app, primary, replica(1, -1.5), replica(2, 1.5)],
      edges: [
        { from: 'app', to: 'primary', label: 'writes' },
        { from: 'primary', to: 'r1', label: 'replicate', flow: true },
        { from: 'primary', to: 'r2', label: 'replicate' },
        { from: 'app', to: 'r1', label: 'reads' },
        { from: 'app', to: 'r2', label: 'reads' },
      ],
      metrics: [
        { label: 'Read capacity', value: '3×', tone: 'good' },
        { label: 'Primary CPU', value: '35%', tone: 'good' },
        { label: 'Replica lag', value: '~50 ms' },
      ],
      breakIt: {
        label: 'Slow down replication',
        explain: 'Under heavy writes a replica can fall seconds behind. A user who just posted a comment reads from that replica and the comment is missing. Fix: read your own writes from the primary for a few seconds.',
        nodes: [app, primary, { ...replica(1, -1.5), status: 'hot' }, replica(2, 1.5)],
        edges: [
          { from: 'app', to: 'primary', label: 'writes' },
          { from: 'primary', to: 'r1', status: 'slow', label: 'lagging' },
          { from: 'primary', to: 'r2' },
          { from: 'app', to: 'r1', label: 'stale read' },
          { from: 'app', to: 'r2' },
        ],
        metrics: [
          { label: 'Replica lag', value: '8 s', tone: 'bad' },
          { label: 'Stale reads', value: '12%', tone: 'bad' },
        ],
      },
    },
    {
      title: 'Writes and data outgrow one machine',
      body: 'Replicas copy everything, so they do not help when writes or total data are too big for one machine. Sharding splits the data: each shard owns a slice of the users.',
      predict: {
        id: 'db-predict-shard',
        prompt: 'You split 3 TB of data evenly across 3 shards by user ID. What does each shard hold?',
        options: ['All 3 TB (full copy)', 'About 1 TB: only its own users', 'Only the most recent data'],
        answer: 1,
        explain: 'Unlike replicas, shards hold different data. Each owns a range or hash of keys, so storage and write load are divided.',
      },
      nodes: [
        app,
        { id: 'router', kind: 'service', label: 'Shard router', x: 2, y: 0 },
        shard(1, -2, 'Shard A–H'),
        shard(2, 0, 'Shard I–P'),
        shard(3, 2, 'Shard Q–Z'),
      ],
      edges: [
        { from: 'app', to: 'router' },
        { from: 'router', to: 'sh1' },
        { from: 'router', to: 'sh2' },
        { from: 'router', to: 'sh3' },
      ],
      metrics: [
        { label: 'Data per shard', value: '1 TB' },
        { label: 'Writes per shard', value: '300 / s', tone: 'good' },
        { label: 'Cross-shard joins', value: 'hard', tone: 'bad' },
      ],
    },
    {
      title: 'The hot shard',
      body: 'A celebrity whose name starts with “T” goes viral. Everything about them lives on one shard, which melts while the others idle. Hashing keys spreads load more evenly than alphabetical ranges.',
      nodes: [
        app,
        { id: 'router', kind: 'service', label: 'Shard router', x: 2, y: 0 },
        shard(1, -2, 'Shard A–H', 'dim'),
        shard(2, 0, 'Shard I–P', 'dim'),
        shard(3, 2, 'Shard Q–Z', 'hot'),
      ],
      edges: [
        { from: 'app', to: 'router' },
        { from: 'router', to: 'sh1', flow: false },
        { from: 'router', to: 'sh2', flow: false },
        { from: 'router', to: 'sh3', status: 'slow' },
      ],
      metrics: [
        { label: 'Busiest shard', value: '80% of traffic', tone: 'bad' },
        { label: 'Shard Q–Z CPU', value: '100%', tone: 'bad' },
        { label: 'Fix', value: 'hash(key) % N' },
      ],
    },
    {
      title: 'Consistent hashing',
      body: 'With hash(key) % N, adding a fourth shard moves almost every key. Consistent hashing places shards on a ring, so adding one only moves the keys next to it (about 1/N of the data).',
      nodes: [
        app,
        { id: 'router', kind: 'service', label: 'Hash ring', x: 2, y: 0 },
        shard(1, -3, 'Shard 1'),
        shard(2, -1, 'Shard 2'),
        shard(3, 1, 'Shard 3'),
        { ...shard(4, 3, 'Shard 4 (new)'), status: 'ok' },
      ],
      edges: [
        { from: 'app', to: 'router' },
        { from: 'router', to: 'sh1' },
        { from: 'router', to: 'sh2' },
        { from: 'router', to: 'sh3' },
        { from: 'router', to: 'sh4' },
      ],
      metrics: [
        { label: 'Keys moved (mod N)', value: '75%', tone: 'bad' },
        { label: 'Keys moved (ring)', value: '25%', tone: 'good' },
      ],
    },
  ],
  quiz: [
    {
      id: 'db-q1',
      prompt: 'Read replicas mainly help with…',
      options: ['Write throughput', 'Read throughput', 'Storage size'],
      answer: 1,
      explain: 'Every replica holds a full copy and still applies every write, so replicas scale reads only.',
    },
    {
      id: 'db-q2',
      prompt: 'What is replication lag?',
      options: ['Time for a query to run', 'Delay before a write on the primary appears on a replica', 'Network latency to the user'],
      answer: 1,
      explain: 'Replicas apply changes asynchronously, so they can briefly serve stale data.',
    },
    {
      id: 'db-q3',
      prompt: 'Why use consistent hashing?',
      options: ['To encrypt keys', 'So adding or removing a shard moves only a small fraction of keys', 'To make joins faster'],
      answer: 1,
      explain: 'With modulo hashing, changing N remaps most keys. On a ring, only neighbours of the new node are affected.',
    },
  ],
  cheatsheet: [
    { term: 'Primary / replica', def: 'Primary takes writes and streams them to read-only replicas.' },
    { term: 'Replication lag', def: 'How far replicas trail the primary; causes stale reads.' },
    { term: 'Read-your-writes', def: 'Route a user’s reads to the primary briefly after they write.' },
    { term: 'Sharding', def: 'Split data across machines by a shard key.' },
    { term: 'Shard key', def: 'Field that decides which shard owns a row (e.g. user_id).' },
    { term: 'Hot shard', def: 'One shard gets far more traffic than others.' },
    { term: 'Consistent hashing', def: 'Keys and nodes on a ring; adding a node moves ~1/N keys.' },
  ],
}
