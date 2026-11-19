import type { Lesson, SceneNode } from './types'

const users: SceneNode = { id: 'users', kind: 'user', label: 'Shoppers', x: 0, y: 0 }
const checkout: SceneNode = { id: 'checkout', kind: 'server', label: 'Checkout', x: 2.5, y: 0 }
const payments: SceneNode = { id: 'payments', kind: 'service', label: 'Payments', x: 5, y: -1.5 }
const email: SceneNode = { id: 'email', kind: 'service', label: 'Email service', x: 5, y: 1.5 }
const queue: SceneNode = { id: 'queue', kind: 'queue', label: 'Order queue', x: 5, y: 1.5 }
const worker = (n: number, y: number, status?: SceneNode['status']): SceneNode => ({
  id: `w${n}`,
  kind: 'worker',
  label: `Email worker ${n}`,
  x: 7.5,
  y,
  status,
})

export const queues: Lesson = {
  id: 'queues',
  title: 'Message queues',
  level: 'Intermediate',
  summary: 'Decouple slow or flaky work from the request path so one outage doesn’t take down checkout.',
  steps: [
    {
      title: 'Checkout calls everything directly',
      body: 'When a shopper pays, checkout calls Payments and then waits for the Email service to send a receipt before responding. The user waits for both.',
      nodes: [users, checkout, payments, email],
      edges: [
        { from: 'users', to: 'checkout' },
        { from: 'checkout', to: 'payments' },
        { from: 'checkout', to: 'email', label: 'waits' },
      ],
      metrics: [
        { label: 'Checkout time', value: '1,200 ms' },
        { label: 'Checkouts OK', value: '99.9%', tone: 'good' },
        { label: 'Depends on', value: '2 services' },
      ],
    },
    {
      title: 'The email service goes down',
      body: 'The email provider has an outage. Checkout waits for it, times out, and reports failure, even though the payment succeeded. A non-essential feature just broke the most important one.',
      predict: {
        id: 'queue-predict-outage',
        prompt: 'Email is down. Checkout calls it synchronously. What happens to checkouts?',
        options: ['Nothing, email is optional', 'They fail or hang until email times out', 'They get faster'],
        answer: 1,
        explain: 'A synchronous call couples the two services. If the callee fails, the caller fails too, unless you decouple them.',
      },
      nodes: [users, checkout, payments, { ...email, status: 'down' }],
      edges: [
        { from: 'users', to: 'checkout', status: 'slow' },
        { from: 'checkout', to: 'payments' },
        { from: 'checkout', to: 'email', status: 'broken', label: 'timeout' },
      ],
      metrics: [
        { label: 'Checkouts OK', value: '0%', tone: 'bad' },
        { label: 'Checkout time', value: '30 s (timeout)', tone: 'bad' },
        { label: 'Email outage breaks checkout', value: 'yes', tone: 'bad' },
      ],
    },
    {
      title: 'Put a queue in between',
      body: 'Checkout now drops an “order placed” message on a queue and responds immediately. Email workers read from the queue in the background. If email is down, messages simply wait.',
      nodes: [users, checkout, payments, queue, worker(1, 0.5), worker(2, 2.5)],
      edges: [
        { from: 'users', to: 'checkout' },
        { from: 'checkout', to: 'payments' },
        { from: 'checkout', to: 'queue', label: 'publish' },
        { from: 'queue', to: 'w1' },
        { from: 'queue', to: 'w2' },
      ],
      metrics: [
        { label: 'Checkout time', value: '300 ms', tone: 'good' },
        { label: 'Checkouts OK', value: '99.9%', tone: 'good' },
        { label: 'Email outage breaks checkout', value: 'no', tone: 'good' },
      ],
      breakIt: {
        label: 'Take the workers down',
        explain: 'Checkout keeps working. Messages pile up in the queue (the backlog) and are delivered when workers recover. Nothing is lost as long as the queue is durable.',
        nodes: [users, checkout, payments, { ...queue, status: 'hot' }, worker(1, 0.5, 'down'), worker(2, 2.5, 'down')],
        edges: [
          { from: 'users', to: 'checkout' },
          { from: 'checkout', to: 'payments' },
          { from: 'checkout', to: 'queue', label: 'publish' },
          { from: 'queue', to: 'w1', status: 'broken', flow: false },
          { from: 'queue', to: 'w2', status: 'broken', flow: false },
        ],
        metrics: [
          { label: 'Checkouts OK', value: '99.9%', tone: 'good' },
          { label: 'Backlog', value: '42,000 msgs', tone: 'bad' },
          { label: 'Lost messages', value: '0', tone: 'good' },
        ],
      },
    },
    {
      title: 'Retries, duplicates and dead letters',
      body: 'A worker may crash after sending an email but before acknowledging the message, so the queue redelivers it. Make handlers idempotent (sending twice has the same effect as once). Messages that fail again and again go to a dead-letter queue for a human to inspect.',
      nodes: [
        users,
        checkout,
        payments,
        queue,
        worker(1, 0.5),
        worker(2, 2.5),
        { id: 'dlq', kind: 'queue', label: 'Dead-letter queue', x: 7.5, y: 4.5, status: 'dim' },
      ],
      edges: [
        { from: 'users', to: 'checkout' },
        { from: 'checkout', to: 'payments' },
        { from: 'checkout', to: 'queue' },
        { from: 'queue', to: 'w1', label: 'at-least-once' },
        { from: 'queue', to: 'w2' },
        { from: 'queue', to: 'dlq', label: 'after 5 tries', flow: false },
      ],
      metrics: [
        { label: 'Delivery', value: 'at-least-once' },
        { label: 'Duplicate emails', value: '0 (idempotent)', tone: 'good' },
        { label: 'Poison messages', value: 'parked in DLQ', tone: 'good' },
      ],
    },
  ],
  quiz: [
    {
      id: 'queue-q1',
      prompt: 'Main benefit of putting a queue between checkout and email?',
      options: ['Emails get faster', 'Checkout no longer depends on email being up', 'It removes the need for a database'],
      answer: 1,
      explain: 'Asynchronous messaging decouples the producer from the consumer, so failures and slowness don’t propagate back.',
    },
    {
      id: 'queue-q2',
      prompt: 'Most queues deliver “at least once”. What must consumers be?',
      options: ['Idempotent', 'Synchronous', 'Stateless and ordered'],
      answer: 0,
      explain: 'A message can be delivered twice, so processing it twice must be harmless (e.g. dedupe by order ID).',
    },
    {
      id: 'queue-q3',
      prompt: 'What is a dead-letter queue for?',
      options: ['Deleted users', 'Messages that keep failing, set aside for inspection', 'Low-priority messages'],
      answer: 1,
      explain: 'After N failed attempts a message is moved aside so it stops blocking or wasting workers.',
    },
  ],
  cheatsheet: [
    { term: 'Producer / consumer', def: 'Producer publishes messages; consumers process them later.' },
    { term: 'Asynchronous', def: 'The caller doesn’t wait for the work to finish.' },
    { term: 'Backlog', def: 'Messages waiting in the queue; grows when consumers are slower than producers.' },
    { term: 'At-least-once', def: 'Messages may be redelivered; consumers must be idempotent.' },
    { term: 'Idempotent', def: 'Doing it twice has the same effect as doing it once.' },
    { term: 'Dead-letter queue', def: 'Where repeatedly failing messages are parked.' },
    { term: 'Backpressure', def: 'Slowing producers down when consumers can’t keep up.' },
  ],
}
