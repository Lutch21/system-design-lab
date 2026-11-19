# System Design Lab

An interactive way to learn system design. Every idea is an animated diagram you step through,
and the numbers change as the design changes. Then you **break it**, **practise it**, **build
your own design in a live simulator**, and **talk it through with an AI tutor**.

Inspired by [designed-to-scale](https://designed-to-scale.vercel.app), with the parts that site
lists as "coming soon" (Practice, Design Lab, Cheatsheets) built in from day one.

## Quick start

```bash
npm install
cp .env.example .env
npm run vault:start         # start Vault in Docker (needs Docker Desktop running)
npm run vault:put-key       # first time only: paste your Anthropic API key (hidden)
npm run dev                 # web app on http://localhost:5173, tutor API on :8787
```

Everything except the AI tutor works without an API key or Vault.

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Vite web app and the tutor API together |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run server` | Starts only the tutor API |
| `npm run vault:start` | Starts Vault, and sets it up or unseals it as needed. Run it again after Docker restarts. |
| `npm run vault:put-key` | Stores or replaces the Anthropic API key in Vault |
| `npm run vault:status` | Shows whether Vault is unsealed and holding the key |

### Secrets with Vault

The tutor's `ANTHROPIC_API_KEY` lives in [HashiCorp Vault](https://developer.hashicorp.com/vault),
not in `.env`. When `server/tutor.ts` starts, it reads the key once from Vault's HTTP API.

```
npm run vault:start ──► Vault container (docker-compose.yml, data on a Docker volume)
                          └─ secret/system-design-lab/tutor  { ANTHROPIC_API_KEY }
npm run dev ──► tutor.ts ──GET /v1/secret/data/system-design-lab/tutor──► Vault
                (uses VAULT_TOKEN from .env: a read-only token for that one path)
```

- **Real server mode, not dev mode.** Dev mode keeps data in memory, so secrets would disappear on
  every restart. This setup stores data on a Docker volume. Like any real Vault, it starts
  *sealed* after a restart, and `vault:start` unseals it.
- **Least privilege.** The tutor's token can only read `secret/system-design-lab/tutor` (writing
  returns 403). The root token and unseal key are in `.vault/init.json`, which is git-ignored.
  Keep that file safe: without the unseal key, the stored data can't be read.
- **Fallback.** If Vault isn't reachable, the tutor logs why and falls back to `ANTHROPIC_API_KEY`
  in the environment. The rest of the app works either way.
- **Rotating the key.** Run `npm run vault:put-key` with the new key, then restart `npm run dev`.
- **Web UI.** Go to http://localhost:8200 and sign in with the root token from `.vault/init.json`.

Locally this is a learning setup: one unseal key, plain HTTP on 127.0.0.1, and a token in `.env`.
In Kubernetes, External Secrets signs in to Vault with a service account (Vault's Kubernetes auth
method) and hands the key to the tutor as an environment variable, so no Vault token is stored
anywhere. See Deployment architecture below.

## What's inside

| Area | What you do there |
|---|---|
| **Learn** | Step through animated lessons (load balancing, caching, database scaling, queues). Each step updates a panel of numbers. |
| **Predict** | Before some steps you guess what will happen, then the diagram shows you. |
| **Break it** | Kill a server, lose the cache, overload a shard, and watch the system react. |
| **Practice** | Spaced-repetition review cards built from the lessons you've started. |
| **Design Lab** | Drag components onto a canvas, set the traffic, and a simulator shows latency, errors, cost, bottlenecks and single points of failure. Includes challenges with pass/fail goals. |
| **Cheatsheets** | Key terms per topic, latency numbers, and a back-of-envelope calculator (QPS, storage, bandwidth). |
| **AI tutor** | Ask about any lesson step, get your Lab design reviewed, or run a mock interview. |
| **Progress** | Learning paths and progress are saved in your browser. |

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 19 + TypeScript + Vite** | Large ecosystem, fast dev server, and typed lesson data catches mistakes early |
| Lesson content | **Lessons written as typed data** (`src/lessons/*.ts`): each step lists nodes, arrows, numbers and an optional question | Adding a lesson means writing data, not animation code |
| Diagram rendering | **SVG + Motion** with a small isometric projection helper | Sharp at any size, accessible to screen readers, easy to animate |
| Design Lab canvas | **React Flow (`@xyflow/react`)** | Drag-and-drop nodes and edges without building that from scratch |
| Simulation | **A pure TypeScript function** (`src/lab/simulate.ts`) | Easy to read and test. Move it into a Web Worker if it ever gets heavy. |
| Styling | **Tailwind CSS v4** with CSS variables for light and dark themes | Fast to write, consistent design tokens |
| State and progress | **Zustand** with `persist` (localStorage) | Tiny and simple. Swap to Supabase (Postgres + auth) when you want accounts. |
| AI tutor | **Claude API** (`@anthropic-ai/sdk`, model `claude-opus-5-5`) behind a small Node server (`server/tutor.ts`) | The API key stays on the server, and answers stream to the browser |
| Hosting | **Vercel or Cloudflare Pages** for the static site, with the tutor as a serverless function | Static-first and cheap |

## How it improves on designed-to-scale

1. **Design Lab with live simulation.** You build your own design instead of only watching. The
   simulator reports latency, error rate, monthly cost, overloaded components and single points
   of failure.
2. **Break-it mode.** Lessons let you inject failures, so you learn failure modes by causing them.
3. **Practice built in.** "Predict what happens next" questions inside lessons, end-of-lesson
   quizzes, and spaced-repetition review.
4. **AI tutor and interview coach.** Ask "why?" on any step, get feedback on a Lab design, or
   practise a mock interview such as "Design a URL shortener".
5. **Progress and learning paths.** "Fundamentals", "Scaling data" and "Interview prep" paths,
   with completion tracking.
6. **Cheatsheets and calculators.** One-page summaries plus a back-of-envelope estimator.

## Project layout

```
server/tutor.ts            Node server: POST /api/tutor streams an answer from Claude
docker-compose.yml         Local Vault container
vault/config.hcl           Vault server config (file storage, local-only listener)
scripts/vault.sh           Starts, sets up and unseals Vault; stores the API key
scripts/smoke-test.sh      Runs both images together and checks they work (used by CI)
Dockerfile.web, nginx.conf Web image: built app served by Nginx, /api forwarded to the tutor
Dockerfile.tutor           Tutor image
.github/workflows/ci.yaml  CI: test, build, push images, bump tags in the deploy repo
src/
  App.tsx                  Layout, navigation and the small hash router
  lessons/                 Lesson data (one file per lesson) and shared types
  components/Diagram.tsx   Isometric SVG renderer for a lesson step
  pages/                   Home, Lesson, Practice, Lab, Cheatsheets, Tutor
  lab/                     Design Lab: component catalogue, simulator, challenges
  store/progress.ts        Saved progress and review cards (Zustand + localStorage)
  tutor/askTutor.ts        Browser helper that streams the tutor's reply
```

## Adding a lesson

1. Copy `src/lessons/caching.ts` to a new file and edit the steps. Each step is a scene: nodes
   (`kind`, `label`, grid position `x`,`y`), edges (`from`, `to`) and metrics.
2. Register it in `src/lessons/index.ts`.

That's it. The diagram, step player, quiz, cheatsheet and review cards all pick it up.

## How the simulator works (simplified on purpose)

- Traffic starts at the **Client** node and flows along the arrows.
- A **load balancer** splits traffic evenly across its healthy targets. A **cache** or **CDN**
  answers a share of requests itself (its hit rate) and passes only the misses on. A **queue**
  hands work to workers in the background, so the user doesn't wait for them.
- Each component has a capacity. As it gets busier its latency rises (`latency / (1 − load)`).
  Past 100% it drops the extra requests, and those count as errors.
- A component is a **single point of failure** if taking it down makes most requests fail.

It's a teaching model, not a benchmark. The goal is to make trade-offs visible.

## Deployment architecture

**Recommendation: deploy System Design Lab as two services. Don't split it further.**

### What actually runs

Only two pieces run. Everything else is code that runs inside the browser.

| Service | What it is | Runs where | Needs a server? |
|---|---|---|---|
| **web** | The React app: lessons, practice, Design Lab, simulator, cheatsheets, progress | In the user's browser. After `npm run build` it's just static files in `dist/`. | Only something to serve the files, such as Nginx |
| **tutor** | `server/tutor.ts`, a small Node API that calls Claude | On a server | Yes. It holds `ANTHROPIC_API_KEY`, which must never reach the browser. |

In local development, the Vite proxy forwards `/api` to the tutor on port 8787. In the container,
Nginx does the same job ([nginx.conf](nginx.conf)), so the browser only ever talks to one address.

### Why not more microservices

- **Simulator:** a pure function that runs instantly in the browser on every edit. Putting it on a
  server would add a network round trip to every drag on the canvas, plus a service to keep running.
- **Lessons:** fixed content that ships with the app.
- **Progress:** saved in the browser. It needs its own service only once accounts are added
  (see the Roadmap).

The rule of thumb: split a service out when it needs to scale on its own, keep a secret, deploy on
its own schedule, or be owned by a different team. The tutor meets two of those: it holds a
secret, and it's slow and costly per request, so it should be scaled and rate-limited separately.
The rest of the app meets none.

### How it's deployed: CI here, CD in a separate repo

This repo does **CI** only: it builds, tests and publishes images. What runs in the cluster is
defined in **[system-design-lab-deploy](https://github.com/Lutch21/system-design-lab-deploy)**,
which Argo CD watches. The flow is the same as devops-demo (GitHub Actions → GHCR → Argo CD), but
the Kubernetes config lives in its own repo.

```
push to main ─► .github/workflows/ci.yaml
                  check:   lint → type-check + build → build 2 images → smoke test
                  publish: push ghcr.io/lutch21/system-design-lab-{web,tutor}:<sha>
                           commit the new tags to system-design-lab-deploy (deploy key)
                                        │
                           Argo CD sees the commit ─► rolls out web + tutor in kind
```

| File | Purpose |
|---|---|
| [Dockerfile.web](Dockerfile.web) | Multi-stage: Node builds `dist/`, then Nginx serves it (about 93 MB) |
| [Dockerfile.tutor](Dockerfile.tutor) | Node 24 runs `server/tutor.ts` directly, with production dependencies only. Runs as a non-root user. |
| [nginx.conf](nginx.conf) | Serves the app and forwards `/api` to the `tutor` Service |
| [scripts/smoke-test.sh](scripts/smoke-test.sh) | Starts both images together and checks the page, the `/api` proxy and the tutor's error handling. Used by CI; run it locally with `sh scripts/smoke-test.sh <web-image> <tutor-image>`. |
| [.github/workflows/ci.yaml](.github/workflows/ci.yaml) | The pipeline above |

**How CI writes to the other repo.** The built-in `GITHUB_TOKEN` can only write to its own repo.
The `DEPLOY_REPO_KEY` secret is the private half of an SSH **deploy key** that has write access
to system-design-lab-deploy only. If it leaks, the worst outcome is a bad commit to the deploy
repo, which is visible and easy to revert. Nobody gains access to the cluster or to other repos.

**How the API key reaches the pod.** The key lives in Vault, and External Secrets copies it into
a Kubernetes Secret, which the tutor reads as `ANTHROPIC_API_KEY`. The key never passes through
CI or Git. `server/tutor.ts` needs no Kubernetes-specific code: in the pod, `VAULT_ADDR` isn't
set, so it uses the environment variable. The deploy repo's README explains each step.

**Why `react` and the other front-end libraries are `devDependencies`.** Vite bundles them into
`dist/` at build time, so nothing needs them at runtime. That keeps them out of the tutor image,
which installs only `dependencies` (the Anthropic SDK).

## Roadmap

- Accounts and cloud-synced progress (Supabase)
- More lessons: consistent hashing, consensus (Raft), rate limiting, search, video streaming
- Shareable Lab designs (encode the graph in the URL)
- Translations
