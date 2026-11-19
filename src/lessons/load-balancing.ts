import type { Lesson, SceneEdge, SceneNode } from './types'

// Reusable pieces so each step only spells out what changes.
const users: SceneNode = { id: 'users', kind: 'user', label: 'Users', x: 0, y: 0 }
const lb: SceneNode = { id: 'lb', kind: 'lb', label: 'Load balancer', x: 2.5, y: 0 }
const server = (n: number, y: number, status?: SceneNode['status']): SceneNode => ({
  id: `s${n}`,
  kind: 'server',
  label: `Server ${n}`,
  x: 5,
  y,
  status,
})
const toServers = (ids: string[]): SceneEdge[] => ids.map((id) => ({ from: 'lb', to: id }))

export const loadBalancing: Lesson = {
  id: 'load-balancing',
  title: 'Load balancing',
  level: 'Beginner',
  summary: 'Go from one server to many, and keep serving users when one of them dies.',
  steps: [
    {
      title: 'One server does everything',
      body: 'Every user talks to a single server. It is simple and cheap, and it works fine while traffic is small.',
      nodes: [users, { ...server(1, 0), x: 3 }],
      edges: [{ from: 'users', to: 's1' }],
      metrics: [
        { label: 'Requests / s', value: '200' },
        { label: 'Server CPU', value: '20%', tone: 'good' },
        { label: 'Avg latency', value: '40 ms', tone: 'good' },
        { label: 'Cost / month', value: '$70' },
      ],
    },
    {
      title: 'Traffic grows 10×',
      body: 'A launch brings 2,000 requests per second. The server can only handle about 1,000, so requests queue up, time out, and users see errors.',
      predict: {
        id: 'lb-predict-overload',
        prompt: 'Traffic jumps from 200 to 2,000 requests/s on a server that handles ~1,000. What happens?',
        options: [
          'Latency rises a little, nothing breaks',
          'Latency explodes and about half the requests fail',
          'The server automatically splits itself in two',
        ],
        answer: 1,
        explain: 'Past its capacity a server cannot keep up: queues grow without limit, so latency explodes and the extra requests time out.',
      },
      nodes: [users, { ...server(1, 0, 'hot'), x: 3 }],
      edges: [{ from: 'users', to: 's1', status: 'slow' }],
      metrics: [
        { label: 'Requests / s', value: '2,000' },
        { label: 'Server CPU', value: '100%', tone: 'bad' },
        { label: 'Avg latency', value: '4,800 ms', tone: 'bad' },
        { label: 'Errors', value: '50%', tone: 'bad' },
      ],
    },
    {
      title: 'Add a load balancer and more servers',
      body: 'A load balancer sits in front and spreads requests across three identical servers (round robin). This is horizontal scaling: add machines instead of buying a bigger one.',
      nodes: [users, lb, server(1, -2), server(2, 0), server(3, 2)],
      edges: [{ from: 'users', to: 'lb' }, ...toServers(['s1', 's2', 's3'])],
      metrics: [
        { label: 'Requests / s', value: '2,000' },
        { label: 'CPU per server', value: '67%', tone: 'good' },
        { label: 'Avg latency', value: '60 ms', tone: 'good' },
        { label: 'Cost / month', value: '$230' },
      ],
      breakIt: {
        label: 'Kill server 2',
        explain: 'Without health checks the load balancer keeps sending a third of the traffic to the dead server, so a third of requests fail.',
        nodes: [users, lb, server(1, -2), server(2, 0, 'down'), server(3, 2)],
        edges: [
          { from: 'users', to: 'lb' },
          { from: 'lb', to: 's1' },
          { from: 'lb', to: 's2', status: 'broken' },
          { from: 'lb', to: 's3' },
        ],
        metrics: [
          { label: 'Healthy servers', value: '2 / 3', tone: 'bad' },
          { label: 'Errors', value: '33%', tone: 'bad' },
          { label: 'Calls to dead server', value: '667 / s', tone: 'bad' },
        ],
      },
    },
    {
      title: 'Health checks route around failures',
      body: 'The load balancer pings each server every few seconds. When server 2 stops answering it is taken out of rotation, and the other two absorb its traffic.',
      nodes: [users, lb, server(1, -2, 'hot'), server(2, 0, 'down'), server(3, 2, 'hot')],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 's1' },
        { from: 'lb', to: 's2', flow: false, status: 'broken', label: 'removed' },
        { from: 'lb', to: 's3' },
      ],
      metrics: [
        { label: 'Healthy servers', value: '2 / 3' },
        { label: 'CPU per server', value: '100%', tone: 'bad' },
        { label: 'Errors', value: '0.5%', tone: 'good' },
        { label: 'Avg latency', value: '180 ms' },
      ],
    },
    {
      title: 'Keep headroom: N + 1',
      body: 'Run one more server than you need (N + 1). When one fails, the rest stay below full load. Autoscaling adds servers when CPU stays high and removes them when traffic drops.',
      nodes: [users, lb, server(1, -3), server(2, -1, 'down'), server(3, 1), server(4, 3)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 's1' },
        { from: 'lb', to: 's2', flow: false, status: 'broken' },
        { from: 'lb', to: 's3' },
        { from: 'lb', to: 's4' },
      ],
      metrics: [
        { label: 'Healthy servers', value: '3 / 4' },
        { label: 'CPU per server', value: '67%', tone: 'good' },
        { label: 'Errors', value: '0%', tone: 'good' },
        { label: 'Cost / month', value: '$300' },
      ],
    },
  ],
  quiz: [
    {
      id: 'lb-q1',
      prompt: 'What is horizontal scaling?',
      options: ['Buying a bigger server', 'Adding more servers behind a load balancer', 'Adding more RAM to the database'],
      answer: 1,
      explain: 'Horizontal = more machines. Vertical = a bigger machine. Horizontal scaling has no hard ceiling and survives single-machine failures.',
    },
    {
      id: 'lb-q2',
      prompt: 'Why does a load balancer need health checks?',
      options: ['To encrypt traffic', 'To stop sending requests to servers that have failed', 'To cache responses'],
      answer: 1,
      explain: 'Without health checks, the load balancer keeps sending its share of traffic to a dead server and those requests fail.',
    },
    {
      id: 'lb-q3',
      prompt: 'You need 3 servers at peak. How many should you run for N + 1 redundancy?',
      options: ['3', '4', '6'],
      answer: 1,
      explain: 'N + 1 = one spare, so losing any single server still leaves enough capacity.',
    },
  ],
  cheatsheet: [
    { term: 'Load balancer', def: 'Spreads incoming requests across a pool of servers.' },
    { term: 'Round robin', def: 'Send each new request to the next server in turn.' },
    { term: 'Least connections', def: 'Send to the server with the fewest open requests; better when requests vary in cost.' },
    { term: 'Health check', def: 'Periodic ping; failing servers are removed from rotation.' },
    { term: 'Horizontal vs vertical', def: 'More machines vs a bigger machine.' },
    { term: 'Stateless server', def: 'Keeps no user session in memory, so any server can handle any request.' },
    { term: 'N + 1', def: 'Run one more instance than peak needs, so one failure is harmless.' },
  ],
}
