Start info: if you need a program to be installed always ask, running npm or simillar to install something is generally permitted but needs to be asked for.

# Tic-Tac-Toe: production-grade but sane

One deployable app, a shared pure-TypeScript game engine, real infrastructure around it,
and explicit boundaries so the system stays understandable.

Status: Milestones 0–6 are complete (workspace scaffold, shared contracts, game engine/AI,
the Fastify/Prisma guest-session foundation, the REST game domain with versioned moves,
timers, history, rematches, and the leaderboard, authenticated Socket.IO realtime with
presence, reconnect, rematch notifications, and optional Redis fan-out, the polished React
web UI with onboarding, lobby, keyboard-accessible gameplay, history replay, leaderboard,
theming, reconnect handling, and Playwright coverage, plus hardening: security headers,
origin checks, Redis-backed REST rate limits, socket action limits, Prometheus metrics,
graceful shutdown, and Swagger UI/OpenAPI). Milestone 7's Docker image and default Compose
stack, Milestone 8's Kustomize base/overlays, Milestone 9's CI/GHCR pipeline, and
Milestone 10's optional analytics and observability profiles are in place.

## Locked decisions

- TypeScript monorepo with pnpm workspaces, Node 24.
- React + Vite + Tailwind + Radix primitives + Motion; TanStack Query + Zustand.
- Fastify + Socket.IO, Postgres + Prisma, Redis for realtime fan-out.
- Guest-only identity via signed httpOnly cookie; no passwords or OAuth.
- One Docker image serving the SPA, REST API, and WebSockets.
- Kustomize + GitHub Actions + GHCR. No Helm, Argo CD, Terraform, or service mesh.
- Kafka/Redpanda is an optional analytics pipe only; never in the gameplay path.

## Scope

### Included

- Guest onboarding, rename, persistent identity for 30 days.
- Single-player: easy/medium/hard AI, persisted results, replay.
- Multiplayer: private room codes, quick match, rematch, reconnect, turn timer/forfeit.
- Match history with replay, multiplayer leaderboard.
- Polished responsive UI, keyboard support, reduced-motion support.
- Structured logs, metrics, health checks.
- Docker Compose, Kubernetes manifests, CI/CD, optional Kafka analytics.

### Explicitly out

- Accounts, passwords, OAuth, account recovery.
- Chat, spectators, tournaments, ELO, achievements, native apps.
- SSR/Next.js, microservices, a separate AI service.
- Event sourcing, Kafka for moves, Redis as game-state storage.
- ELK/Loki/OpenTelemetry/Sentry in v1.
- Helm/Argo CD/Terraform or cluster provisioning.

## Architecture

```text
Browser (React SPA)
  |  REST: session, lobby, history, leaderboard
  |  WS:   subscribe, moves, rematch, presence
  v
Fastify + Socket.IO
  |-- Postgres: players, games, moves (source of truth)
  |-- Redis: Socket.IO adapter + ephemeral presence + shared rate limits
  |-- shared game engine: rules + minimax (server authoritative)
  |-- Pino / Prometheus
  |-- optional Kafka publisher
          |
          v
   Redpanda/Kafka -> analytics worker -> analytics table
```

Why this shape:

- Postgres is authoritative, so any replica can serve reconnect/resync.
- Redis handles cross-pod Socket.IO fan-out and shared rate limits. It does not hold game state.
- The game engine is a pure shared package; the server never trusts client boards.
- Kafka is outside core gameplay; losing an analytics event is acceptable.
- One image means the SPA, API, and WebSockets share an origin; no CORS and one deployment.

## Repo layout

```text
apps/
  web/                  React SPA
  server/               Fastify API, sockets, Prisma, analytics worker entrypoint
packages/
  game-engine/          pure rules, win detection, minimax
  contracts/            Zod schemas + shared API/socket types
infra/
  docker/               multi-stage Dockerfile
  compose/              compose + profiles
  k8s/base, overlays/{local,prod}, components/analytics
  observability/        Prometheus/Grafana local profile
e2e/                    Playwright
docs/                   architecture, ADRs, runbook
.github/workflows/
```

No Turborepo/Nx: pnpm recursive scripts are enough at this size.

## Data model

| Model                    | Key fields                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Player`                 | `id`, `displayName`, `displayNameNormalized` unique, `createdAt`, `lastSeenAt`                                                                                                                                                                                                                                         |
| `Game`                   | `id`, `code` unique, `mode` SINGLE/MULTI, `visibility` PRIVATE/PUBLIC, `status` WAITING/ACTIVE/FINISHED/ABANDONED, `difficulty`, `board` 9 chars, `turn`, `winner`, `finishReason` LINE/DRAW/TIMEOUT/FORFEIT/ABANDONED, `winningLine`, `playerXId`, `playerOId`, `version`, `turnDeadline`, rematch fields, timestamps |
| `Move`                   | `id`, `gameId`, `playerId?` (null for AI), `moveNumber`, `cell`, `symbol`, `createdAt`; unique `(gameId, moveNumber)`                                                                                                                                                                                                  |
| `AnalyticsGameCompleted` | optional; `gameId` PK, mode, winner, finishedAt                                                                                                                                                                                                                                                                        |

Indexes on active/public games, player participation, and finished games. Leaderboard
is a SQL aggregate over finished multiplayer games; no materialized-stats service until
measurements justify it.

## Game domain

- State machine: `WAITING -> ACTIVE -> FINISHED/ABANDONED`.
- Move transaction: lock/compare `version`, validate turn/cell/player, apply engine move,
  insert move row, update board/version/turn/deadline/result. Stale double-submits get
  `STALE_STATE`.
- Quick match uses Postgres `FOR UPDATE SKIP LOCKED`, not a Redis queue: join the oldest
  public waiting game or create one. Private rooms require a code.
- Multiplayer turn deadline defaults to 60s (`TURN_SECONDS`). A 10s sweeper claims expired
  games with `SKIP LOCKED` and records a timeout forfeit. Waiting rooms expire after 15
  minutes.
- Leave during an active multiplayer game counts as a forfeit; disconnect alone does not,
  so reconnect is possible.
- Rematch requires both votes, swaps symbols, creates a new game idempotently, and notifies
  both players.
- Single-player moves are server-side. Hard uses perfect minimax with alpha-beta; medium is
  depth-limited/imperfect; easy is mostly random with basic win/block awareness. AI moves
  are computed immediately; the UI adds a short thinking animation.
- Solo stats appear in profile/history but not the leaderboard; easy AI games would be
  farmable.
- Leaderboard counts multiplayer only, minimum 5 games, ranked by wins then win rate.

## API and realtime protocol

### REST

- `POST /api/session` `{ displayName }` — create guest, set signed cookie; `409` if name taken.
- `GET /api/me`, `PATCH /api/me` — profile and rename.
- `POST /api/games` — create private room or single-player game.
- `POST /api/games/join` `{ code }` — join by room code.
- `POST /api/games/quick-match` — match with a public waiting game or create one.
- `POST /api/games/:id/moves` `{ cell, expectedVersion }` — HTTP move path; sockets reuse the
  same locked transaction.
- `POST /api/games/:id/leave`, `POST /api/games/:id/rematch` — HTTP counterparts that the
  sockets will also call.
- `GET /api/games` — paginated history for the current player.
- `GET /api/games/:id` — participant-only snapshot including moves for replay/resync.
- `GET /api/leaderboard` — multiplayer aggregate.
- `GET /api/health/live`, `/api/health/ready`, `/api/metrics`, `/api/docs` (non-prod).
- Optional when analytics is enabled: `GET /api/config`, `GET /api/analytics/summary`.

### Socket.IO

- Handshake authenticates the signed cookie and validates origin.
- Client: `game:subscribe`, `game:move`, `game:leave`, `game:rematch`.
- Server: `game:snapshot`, `game:update`, `game:presence`, `game:rematch-started`.
- Redis is optional via `REDIS_URL`; without it a single replica uses the in-memory adapter
  and per-replica rate limits. Presence is derived from live room sockets, so it scales with
  the adapter.
- Every mutation broadcasts a full game snapshot. Payloads are tiny; full snapshots eliminate
  delta-sync bugs.
- Moves carry `expectedVersion`; the transaction rejects stale clients.
- Acknowledgements return typed errors: `NOT_PARTICIPANT`, `NOT_YOUR_TURN`, `CELL_TAKEN`,
  `STALE_STATE`, `GAME_FINISHED`, `RATE_LIMITED`.
- Client prefers WebSocket and falls back to HTTP long-polling when the upgrade is blocked;
  loopback hosts use polling directly because WSL localhost forwarding can break WebSocket
  frames. The optional Redis adapter keeps realtime state shared. A proxy that serves polling
  for multiple replicas must use sticky sessions; normal WebSocket traffic avoids that need.
  Proxies must allow WebSocket upgrades.
- Refresh flow: fetch REST snapshot, then subscribe.
- The sweeper emits timeout/forfeit updates through the same Socket.IO path.

## UI and UX

- Routes: `/` lobby, `/play/:gameId`, `/history`, `/leaderboard`, optional `/analytics`, 404.
- Lobby: guest name onboarding, solo difficulty or multiplayer, create/join room, quick match,
  recent games.
- Game: responsive 3x3 board, SVG marks and animated win line, turn/status indicator, timers,
  copy room code, waiting state, reconnect banner, result dialog with reduced-motion-safe
  confetti, rematch/leave.
- Board is keyboard accessible with roving tabindex and `aria-live` turn/result announcements;
  color is never the only signal.
- History: filters and step-through replay using the shared engine.
- Leaderboard: top 50, current player highlighted, minimum-games note, clear "casual guest
  leaderboard" disclaimer.
- Dark-first design with light toggle, self-hosted font, CSS gradients instead of image
  assets, tasteful motion.
- TanStack Query for REST; Zustand for socket/game state. No optimistic moves: server
  acknowledgement is fast and optimistic state invites divergence.
- Skeleton loading, toasts, empty states, error boundary, offline/reconnect handling.

## Guest identity and security

- HMAC-signed httpOnly cookie containing the player id; `SameSite=Lax`, `Secure` by default
  in production (override with `SESSION_COOKIE_SECURE` for plain-HTTP local runs), 30-day
  expiry.
- Rotating `SESSION_SECRET` invalidates guest sessions; documented.
- Display names normalized and unique case-insensitively; rename is rate-limited.
- No passwords, OAuth, email, or recovery. Clearing cookies loses history. The leaderboard is
  for fun, not anti-cheat.
- Origin checks on REST mutations and socket handshakes; no CORS needed because the SPA and
  API share an origin.
- Helmet/CSP, payload limits, Zod validation at every boundary, rate limits for session
  creation, rename, and socket actions, participant authorization on every game read/subscribe.
- Six-character room codes from an unambiguous alphabet; collision retries behind a unique
  constraint.
- No secrets in the repo; `.env.example` only.

## Logging and observability

- Pino JSON logs in production, pretty logs in development.
- Request IDs, plus `playerId`, `gameId`, `socketId`, event name, outcome, and duration.
- Lifecycle and rejection reasons logged: game created/joined, move accepted/rejected, game
  finished/forfeited, rematch, reconnect, AI timing, analytics publish failure.
- Redact cookies, authorization headers, and session material. Never log full request payloads.
- Metrics: HTTP duration histogram, active WebSocket connections, games started/finished by
  mode, moves, stale-version conflicts, AI duration. Every scrape carries a `replica` label;
  Prometheus scrapes each pod and aggregates across replicas.
- `/health/live` is dependency-free; `/health/ready` checks Postgres and Redis and flips false
  during graceful shutdown.
- Compose profile with Prometheus + Grafana for local metrics. In Kubernetes, expose `/metrics`
  and use cluster monitoring; no Loki/ELK stack shipped.
- Expected game rejections log at `warn` without stack traces; unexpected errors log once with
  stack and return a safe error.

## Docker and local development

- Multi-stage Debian-slim image: pnpm install, Prisma generate, web build, server build,
  pruned production deps.
- Built SPA is copied into the server image; Fastify serves static assets and SPA fallback
  alongside `/api` and `/socket.io`.
- Non-root user, tini, healthcheck, pinned base images, `.dockerignore`.
- Compose default profile: Postgres 17, Redis 7, app. Compose entrypoint runs
  `prisma migrate deploy` before starting; Kubernetes uses a Job instead.
- Optional compose profiles: `analytics` (Redpanda + worker) and `observability`
  (Prometheus + Grafana).
- Local dev: Compose only for dependencies; `pnpm dev` runs Vite and Fastify with a proxy,
  keeping same-origin requests and no CORS.
- No secrets baked into images.

## Kubernetes

- Kustomize base: Deployment, Service, Ingress, ConfigMap, HPA, PDB, ServiceAccount,
  NetworkPolicy, migration Job.
- `overlays/local`: kind/k3d, one replica, in-cluster Postgres/Redis StatefulSets with PVCs
  strictly for development, local images, port-forward.
- `overlays/prod`: managed Postgres/Redis, external secrets, 2+ replicas, ingress host/TLS,
  HPA 2–6, PDB, topology spread.
- Probes: startup and liveness check the process; readiness checks DB and Redis. `preStop`
  plus `terminationGracePeriodSeconds` allow connection draining.
- Security context: non-root, read-only root filesystem with tmp `emptyDir`, dropped
  capabilities, `RuntimeDefault` seccomp.
- Ingress annotations for WebSocket upgrade and long read timeouts.
- Database migrations run as a CD-driven Job, not on app startup, to avoid races across
  replicas. Migrations must be backward-compatible for rolling deploys.
- Scale note: two replicas are for availability, not load. Redis is justified by cross-pod
  Socket.IO fan-out. CPU-based HPA is acceptable at this scale, with the WebSocket caveat
  documented.
- Optional analytics component: worker Deployment and managed Kafka in prod; in-cluster
  Redpanda for local only.
- No Helm, Argo CD, service mesh, or in-cluster production databases.

## CI/CD

### CI on PR and main

- Lint, format check, typecheck, unit tests, build.
- Integration tests with Postgres and Redis service containers.
- Playwright E2E against the built app, including two browser contexts for multiplayer.
- Docker build, Trivy scan, and SBOM generation.
- `kustomize build` + kubeconform manifest validation.
- Optional nightly/manual k3d deploy smoke test.

### Delivery

- `main` builds and pushes `sha` and `main` tags to GHCR; deploys to staging if staging
  credentials exist.
- Semver tag deploys to production behind a protected GitHub Environment with manual approval.
- Deploy promotes the same image digest, runs the migration Job, applies Kustomize, waits for
  rollout, and smoke-tests `/api/health/ready`.
- Rollback is redeploying the previous digest; database migrations are backward-compatible.
- Secrets: `KUBE_CONFIG_STAGING`, `KUBE_CONFIG_PROD`, `GITHUB_TOKEN` for GHCR. Database
  credentials stay in the cluster; CI never receives them.
- No deployments from pull requests. Dependabot enabled for npm and Actions.

## Testing

- Unit: engine win/draw logic, exhaustive legal states, minimax optimality, hard AI never
  loses, validation schemas.
- Integration: move version conflicts, quick-match races, timeout sweeper, leaderboard SQL,
  guest session lifecycle.
- Socket: subscribe authorization, two-client moves, reconnect/resync, rematch.
- E2E: onboarding and rename, theme persistence, solo game, private room with two contexts,
  quick match, rematch, history filters and replay, leaderboard, reconnect, access control,
  404s; axe accessibility checks on every major flow.
- Turn timeout and forfeit are covered by domain and socket integration tests rather than a
  real-time E2E clock test; the UI sees the same finished snapshot either way.
- Coverage thresholds focused on engine and domain correctness, not blanket vanity
  percentages.
- Docker/Postgres/Redis-dependent suites run in CI or on a machine with Docker. E2E CI
  wiring lands with the delivery pipeline in Milestone 9; until then the suite runs locally.

## Optional Kafka analytics

- Disabled by default. Compose profile starts Redpanda and a worker; the same app image runs a
  second entrypoint.
- Server publishes `game.completed` after commit, best-effort. Publisher failure is logged and
  never blocks gameplay.
- Worker consumes with a consumer group and inserts into `AnalyticsGameCompleted` keyed by
  `gameId` with conflict-ignore, so at-least-once delivery is idempotent.
- Optional `/analytics` page shows daily counts and win splits when enabled; the API hides it
  otherwise.
- JSON + Zod contracts, no schema registry.
- No transactional outbox in v1; delivery is explicitly best-effort. Add an outbox only if
  guaranteed analytics delivery becomes a requirement.
- Kafka is not used for moves, matchmaking, or the leaderboard.

## Milestones

| Phase | Deliverable                                                                     | Done when                                             |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0     | Workspace scaffold, TypeScript, lint, test runner, CI quality job               | `lint`, `typecheck`, `test`, `build` pass             |
| 1     | Shared contracts + game engine + AI                                             | Exhaustive engine tests; hard AI never loses          |
| 2     | Fastify foundation, Prisma schema, guest sessions, health, logging              | Session/rename tests pass; migrations apply           |
| 3     | Game domain + REST: create/join/quick match, moves, timer, history, leaderboard | Integration tests cover conflicts and races           |
| 4     | Socket.IO realtime, Redis adapter, reconnect, rematch, presence                 | Two-client socket tests pass                          |
| 5     | Polished web UI and replay                                                      | E2E solo + multiplayer flows pass                     |
| 6     | Hardening: rate limits, security headers, metrics, graceful shutdown, OpenAPI   | Security/observability checklist passes               |
| 7     | Docker + Compose + optional profiles                                            | Full stack starts and health passes                   |
| 8     | Kubernetes base + overlays                                                      | `kustomize build` clean; kind/k3d deploy works        |
| 9     | Full CI/CD, GHCR, deploy workflow, docs/ADRs/runbook                            | Green pipeline; deployment runbook complete           |
| 10    | Optional Kafka analytics profile                                                | Idempotent consumer test; core works with it disabled |

## Definition of done

- Solo (three difficulties) and multiplayer (private room, quick match, rematch, reconnect,
  timeout) work end to end.
- Games, moves, history, replay, and leaderboard are correct and persistent.
- Invalid, stale, duplicate, and unauthorized moves are rejected server-side.
- Logs and metrics provide enough context to debug a failed game.
- Compose stack passes health checks; Kustomize renders; CI is green; deployment is
  documented.
- Kafka-disabled startup is identical to v1; enabling analytics does not change gameplay.

## Assumptions and risks

- Target is a GitHub repo with GHCR and a Kubernetes cluster using nginx ingress; manifests use
  placeholders for hostnames and cluster-specific settings.
- Production uses managed Postgres/Redis; the in-cluster databases are local-development
  conveniences.
- Guest identity is deliberately convenience-grade. Leaderboard names are not verified and can
  be recreated after clearing cookies.
- Docker and kubectl are unavailable in the development sandbox, so container/Kubernetes
  validation must happen in CI or locally on a machine with Docker.
- Turn timer defaults to 60 seconds and is configurable/disable-able.
- Kafka remains optional and last; core must be complete and independently testable before it
  is added.
