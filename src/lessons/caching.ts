import type { Lesson, SceneNode } from './types'

const users: SceneNode = { id: 'users', kind: 'user', label: 'Users', x: 0, y: 0 }
const app: SceneNode = { id: 'app', kind: 'server', label: 'App server', x: 2.5, y: 0 }
const db: SceneNode = { id: 'db', kind: 'db', label: 'Database', x: 5, y: 1.5 }
const cache: SceneNode = { id: 'cache', kind: 'cache', label: 'Cache (Redis)', x: 5, y: -1.5 }

export const caching: Lesson = {
  id: 'caching',
  title: 'Caching',
  level: 'Beginner',
  summary: 'Keep hot data in memory so most reads never touch the database.',
  steps: [
    {
      title: 'Every read hits the database',
      body: 'Each page view runs the same queries against the database. Reading from disk and running the query takes about 20 ms, and the database is the busiest part of the system.',
      nodes: [users, app, { ...db, y: 0 }],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'db' },
      ],
      metrics: [
        { label: 'Reads / s', value: '5,000' },
        { label: 'Database CPU', value: '85%', tone: 'bad' },
        { label: 'Avg read time', value: '20 ms' },
        { label: 'Cache hit rate', value: '—' },
      ],
    },
    {
      title: 'Add a cache (cache-aside)',
      body: 'The app checks an in-memory cache first. On a hit it returns in about 1 ms. On a miss it reads the database and writes the answer into the cache for next time.',
      predict: {
        id: 'cache-predict-hit',
        prompt: 'If 90% of reads are served by the cache, roughly what happens to database load?',
        options: ['It drops by about 10%', 'It drops by about 90%', 'It stays the same: the cache still asks the DB'],
        answer: 1,
        explain: 'Only misses reach the database. A 90% hit rate means only 1 in 10 reads gets through, so DB load drops ~90%.',
      },
      nodes: [users, app, cache, db],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'cache', label: '90% hit' },
        { from: 'app', to: 'db', label: '10% miss' },
      ],
      metrics: [
        { label: 'Cache hit rate', value: '90%', tone: 'good' },
        { label: 'Database CPU', value: '12%', tone: 'good' },
        { label: 'Avg read time', value: '2.9 ms', tone: 'good' },
        { label: 'Cost / month', value: '+$50' },
      ],
      breakIt: {
        label: 'Restart the cache (cold cache)',
        explain: 'An empty cache misses on everything, so the full 5,000 reads/s slam the database at once: a "thundering herd". Warm caches gradually, or protect the DB with request coalescing.',
        nodes: [users, app, { ...cache, status: 'dim' }, { ...db, status: 'hot' }],
        edges: [
          { from: 'users', to: 'app' },
          { from: 'app', to: 'cache', label: '0% hit', flow: false },
          { from: 'app', to: 'db', label: '100% miss', status: 'slow' },
        ],
        metrics: [
          { label: 'Cache hit rate', value: '0%', tone: 'bad' },
          { label: 'Database CPU', value: '100%', tone: 'bad' },
          { label: 'Avg read time', value: '900 ms', tone: 'bad' },
        ],
      },
    },
    {
      title: 'Stale data and TTLs',
      body: 'When a price changes in the database, the cache still holds the old one. Give each entry a time-to-live (TTL) so it expires, or delete the key whenever you write. Short TTL = fresher data but more misses.',
      nodes: [users, app, { ...cache, label: 'Cache: $10 (old)' }, { ...db, label: 'DB: $12 (new)' }],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'cache', label: 'returns $10' },
        { from: 'app', to: 'db', flow: false },
      ],
      metrics: [
        { label: 'TTL', value: '60 s' },
        { label: 'Max staleness', value: '60 s', tone: 'bad' },
        { label: 'Cache hit rate', value: '90%', tone: 'good' },
      ],
    },
    {
      title: 'Push static files to a CDN',
      body: 'Images, scripts and videos are the same for everyone. A CDN keeps copies in data centres near users, so a user in London downloads from London, not from your server in Virginia.',
      nodes: [
        users,
        { id: 'cdn', kind: 'cdn', label: 'CDN edge', x: 2, y: -2.5 },
        app,
        cache,
        db,
      ],
      edges: [
        { from: 'users', to: 'cdn', label: 'images, JS' },
        { from: 'users', to: 'app', label: 'API' },
        { from: 'app', to: 'cache' },
        { from: 'app', to: 'db' },
      ],
      metrics: [
        { label: 'Photo load (London)', value: '35 ms', tone: 'good' },
        { label: 'Origin bandwidth', value: '−80%', tone: 'good' },
        { label: 'Cache hit rate', value: '90%' },
      ],
    },
  ],
  quiz: [
    {
      id: 'cache-q1',
      prompt: 'In the cache-aside pattern, who writes to the cache?',
      options: ['The database, automatically', 'The application, after a cache miss', 'The user’s browser'],
      answer: 1,
      explain: 'Cache-aside (lazy loading): the app checks the cache, and on a miss reads the DB and fills the cache itself.',
    },
    {
      id: 'cache-q2',
      prompt: 'What does a TTL trade off?',
      options: ['Freshness vs hit rate', 'Security vs speed', 'Disk vs memory'],
      answer: 0,
      explain: 'A shorter TTL keeps data fresher but expires entries more often, so more requests miss and reach the database.',
    },
    {
      id: 'cache-q3',
      prompt: 'What is a thundering herd?',
      options: [
        'Too many CDNs',
        'Many requests missing the cache at once and overwhelming the database',
        'A DDoS attack on DNS',
      ],
      answer: 1,
      explain: 'When a hot key expires or the cache restarts, every request misses together and they all hit the database.',
    },
  ],
  cheatsheet: [
    { term: 'Cache hit / miss', def: 'Found in cache / had to go to the source.' },
    { term: 'Cache-aside', def: 'App reads cache, falls back to DB on miss, then fills the cache.' },
    { term: 'Write-through', def: 'Every write goes to cache and DB together; reads are always fresh.' },
    { term: 'TTL', def: 'How long an entry lives before it expires.' },
    { term: 'Eviction (LRU)', def: 'When memory is full, drop the least recently used entries.' },
    { term: 'CDN', def: 'Network of edge servers that cache static content near users.' },
    { term: 'Thundering herd', def: 'Mass cache misses at once; fix with coalescing, jittered TTLs, warming.' },
  ],
}
