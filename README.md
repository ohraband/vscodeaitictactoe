# Tic-Tac-Toe

An intentionally well-built tic-tac-toe platform: guest sessions, solo AI, realtime
multiplayer, persisted games, replay, leaderboard, Docker, Kubernetes, and CI/CD.

The full design lives in [docs/plan.md](docs/plan.md).

## Status

Milestones 0–6: workspace scaffold, shared contracts, pure game engine/AI, the
Fastify/Prisma guest-session foundation, the REST game domain (create/join/quick match,
versioned moves, timers, history, rematches, leaderboard), authenticated Socket.IO
realtime with presence and optional Redis fan-out, the React web UI with onboarding,
lobby, keyboard-accessible gameplay, replay, leaderboard, theming, reconnect handling,
and Playwright coverage, plus hardening (security headers, origin checks, Redis-backed
identity rate limits, socket action limits, Prometheus metrics, graceful shutdown, and
Swagger UI/OpenAPI). Milestone 7's Docker image and default Compose stack are in place.
Milestone 8 adds the Kustomize base and local overlay (in-cluster Postgres and Redis, a
migration Job, and a CI render check); a real kind deploy is still pending because this
environment has no Docker or Kubernetes tooling. Milestone 9 adds GitHub Actions container
publication to GHCR from `main` and `v*` tags; it does not include a deploy workflow.
Milestone 10 adds the optional Redpanda/Kafka analytics pipeline and the local
Prometheus/Grafana observability profile. An optional Kafka cursor stream shares live pointer
positions between multiplayer participants; it is disabled by default and never affects
gameplay.

## Commands

```sh
pnpm install
pnpm check        # format, lint, typecheck, tests
pnpm test:coverage
pnpm build
```

When cursor streaming is enabled locally, run the separate consumer with `pnpm dev:cursor`.

## Run with Docker Compose

The image builds the server and web UI, then serves both from one container. Compose starts
Postgres 17, Redis 7, the app, and a small Caddy gateway on port 3000:

```sh
export SESSION_SECRET="$(openssl rand -hex 32)"
docker compose -f infra/compose/compose.yaml up --build
```

The gateway serves the app at `http://localhost:3000`; migrations are applied before the
server starts.

### Optional observability profile

Prometheus scrapes `/api/metrics` from the app and Grafana is provisioned with a dashboard:

```sh
docker compose -f infra/compose/compose.yaml --profile observability up --build
```

Prometheus is at `http://localhost:9090`; Grafana is at `http://localhost:3001` (default
login `admin`/`admin`, override with `GRAFANA_ADMIN_PASSWORD`).

### Optional analytics profile

The analytics profile starts Redpanda, creates the completion topic, runs the worker, and
enables best-effort publishing from the app. Set `KAFKA_BROKERS` so the app knows where to
publish:

```sh
KAFKA_BROKERS=redpanda:9092 \
  docker compose -f infra/compose/compose.yaml --profile analytics up --build
```

The worker consumes `ttt.game.completed` and idempotently inserts rows into
`AnalyticsGameCompleted`. Leaving `KAFKA_BROKERS` unset disables analytics without affecting
gameplay.

### Optional cursor profile

The cursor profile starts Redpanda, creates `ttt.cursor.moved`, runs a separate cursor
consumer, and enables publishing from the app. The consumer serves a second Socket.IO
endpoint at `/cursor.io`; the Compose Caddy gateway proxies that path to it, so the browser
still uses one origin:

```sh
docker compose -f infra/compose/compose.yaml \
  -f infra/compose/compose.cursor.yaml \
  --profile cursor up --build
```

Open a multiplayer game and select **Cursors**. Position updates travel over the existing game
socket, through Kafka, and back to participants through the cursor consumer. Dots expire after
5 seconds without movement. With the profile off, `/api/config` reports cursor sharing as
disabled and the rest of the app behaves exactly as before.

The cursor consumer is internal-only; Caddy reaches it at `cursor-consumer:3001`. Use
`CURSOR_ENABLED=true` and `KAFKA_BROKERS=<brokers>` when running the app outside Compose.
The cursor worker has its own `/health/live`, `/health/ready`, and `/metrics` endpoints on
`CURSOR_PORT` (default `3001`).

## Deploy on a VPS

The non-Kubernetes deployment path uses Compose with a bundled Caddy container. The
production overlay reconfigures Caddy for ports 80/443, requires the public hostname plus
database and Grafana passwords, and keeps the app and cursor consumer off host ports. See
[infra/vps/README.md](infra/vps/README.md) for the full scp deployment, DNS, TLS, firewall,
verification, update, and password-rotation runbook.

## Container images

CI builds the image on every pull request without pushing it. Pushes to `main` publish
`ghcr.io/<owner>/<repo>:main` and a `sha-<short>` tag; tags matching `v*` publish the version,
its major/minor tag, and `latest`:

```sh
docker pull ghcr.io/<owner>/<repo>:main
```

The container still needs Postgres, and Redis if you want shared realtime state. Use the
Compose or Kubernetes sections below to run it with those dependencies. There is no automatic
cluster deployment.

## Run on Kubernetes with kind

The local overlay deploys the app, Postgres 17, and Redis 7 into the `ttt` namespace. It is
single-replica, uses a development-only Secret, and loads the image directly into kind, so
no registry is needed. See [infra/k8s/README.md](infra/k8s/README.md) for the manifest
layout and cleanup.

Prerequisites: Docker, kind, and kubectl.

```sh
# 1. Build the image locally.
docker build -f infra/docker/Dockerfile -t ttt:local .

# 2. Create a kind cluster and load the image.
kind create cluster
kind load docker-image ttt:local

# 3. Apply the local overlay.
kubectl apply -k infra/k8s/overlays/local

# 4. Wait for migrations (the Job retries until Postgres is ready).
kubectl -n ttt wait --for=condition=complete job/ttt-migrate --timeout=180s

# 5. Port-forward the Service.
kubectl -n ttt port-forward svc/ttt 3000:80
```

Then check both health endpoints and open the app:

```sh
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health/ready
```

Open `http://localhost:3000`. To re-deploy, delete the completed migration Job first, then
apply again:

```sh
kubectl -n ttt delete job ttt-migrate
kubectl apply -k infra/k8s/overlays/local
```

Clean up with `kubectl delete -k infra/k8s/overlays/local` and `kind delete cluster`. The
credentials in `infra/k8s/overlays/local/secret.yaml` are for local development only.

## Run the server locally

You need PostgreSQL 17. Copy the example environment file and set a real 32+ character
session secret and your database URL:

```sh
cp apps/server/.env.example apps/server/.env
pnpm prisma:generate
pnpm build
pnpm prisma:deploy
pnpm --filter @ttt/server dev
```

The API listens on `http://localhost:3000` by default. Interactive API docs are at
`http://localhost:3000/api/docs/` outside production.

```sh
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health/ready
curl http://localhost:3000/api/metrics

curl -i -c cookies.txt -X POST http://localhost:3000/api/session \
  -H 'content-type: application/json' \
  -d '{"displayName":"Ada Lovelace"}'
```

The session response sets an httpOnly guest cookie usable with `GET /api/me` and
`PATCH /api/me`.

With the cookie, the game API is available:

```sh
curl -b cookies.txt -X POST http://localhost:3000/api/games \
  -H 'content-type: application/json' \
  -d '{"mode":"single","difficulty":"hard"}'

curl -b cookies.txt -X POST http://localhost:3000/api/games/quick-match
curl -b cookies.txt http://localhost:3000/api/games?status=finished
curl -b cookies.txt http://localhost:3000/api/games/<game-id>
curl -b cookies.txt http://localhost:3000/api/leaderboard

curl -b cookies.txt -X POST http://localhost:3000/api/games/<game-id>/moves \
  -H 'content-type: application/json' \
  -d '{"cell":4,"expectedVersion":0}'
```

`POST /api/games/join` takes a room code; `POST /api/games/:id/leave` forfeits an active
multiplayer game; `POST /api/games/:id/rematch` records a rematch vote. Multiplayer turn
deadlines default to 60 seconds and can be disabled with `TURN_SECONDS=0`. A background
sweeper records timeout forfeits, abandons stale waiting rooms, and broadcasts the result.

Socket.IO uses the same guest cookie at `/socket.io`. It prefers WebSocket and falls back to
HTTP long-polling when the network cannot carry an upgrade. On loopback hosts (`localhost`,
`127.0.0.1`) it uses polling directly, because WSL's localhost forwarding can establish a
WebSocket and then drop its frames. Subscribe with
`game:subscribe`, then send `game:move`, `game:leave`, or `game:rematch`; the server emits
`game:snapshot`, `game:update`, `game:presence`, and `game:rematch-started`. Set
`REDIS_URL=redis://localhost:6379` to enable the Redis adapter, shared REST rate limits,
and Redis readiness checks across replicas. Without it, realtime runs in-process and rate
limits are per replica. Set `RATE_LIMIT_ENABLED=false` only for controlled test runs. Set
`CSP_UPGRADE_INSECURE_REQUESTS=true` and `SESSION_COOKIE_SECURE=true` only when the app is
served over HTTPS; the Docker Compose stack leaves both off for plain-HTTP
`http://localhost:3000`, and the VPS overlay turns them on for Caddy.

For local cursor development, start Redpanda and the topic, then run the app/web and the
consumer in separate shells:

```sh
docker compose -f infra/compose/compose.yaml --profile cursor up -d redpanda redpanda-init

# Shell 1: app + Vite, with cursor publishing enabled.
CURSOR_ENABLED=true KAFKA_BROKERS=localhost:9092 pnpm dev

# Shell 2: Kafka -> /cursor.io consumer. Vite proxies /cursor.io to port 3001.
CURSOR_ENABLED=true KAFKA_BROKERS=localhost:9092 pnpm dev:cursor
```

Every metrics scrape includes a `replica` label (`METRICS_REPLICA_ID`, defaulting to the
hostname). In multi-replica deployments, scrape every pod with Prometheus and aggregate
across that label; the app does not need a separate metrics collector.

## Tests

Unit tests run without dependencies. Database integration tests run when
`TEST_DATABASE_URL` is set and the migrations have been applied to that database:

```sh
TEST_DATABASE_URL=postgresql://ttt:ttt@localhost:5432/ttt_test pnpm test
```

CI provisions PostgreSQL, generates the Prisma client, applies migrations, and runs the
full suite.

The Playwright suite starts the API and Vite dev server itself. It needs PostgreSQL with
migrations applied and a Chromium install:

```sh
pnpm exec playwright install chromium
DATABASE_URL=postgresql://ttt:ttt@localhost:5432/ttt pnpm test:e2e
```

It covers onboarding and rename, solo play, private rooms, quick match, rematch, reconnect,
history filters and replay, leaderboard, access control, and axe accessibility checks. CI runs
the unit and integration suites; E2E remains local for now. Cursor publisher, ingest, realtime
authorization, and cursor socket tests run in the unit/integration suite; the broker-backed
end-to-end cursor flow is manual.

## Workspace

- `packages/game-engine` — pure rules, win detection, and minimax AI.
- `packages/contracts` — shared Zod schemas and API/socket types.
- `apps/server` — Fastify API, guest sessions, game domain, Socket.IO, cursor publisher/consumer, Prisma schema, health checks.
- `apps/web` — React SPA for onboarding, gameplay, cursor rooms, history replay, and leaderboard.
- `e2e` — Playwright flows across solo, multiplayer, rematch, reconnect, and history.
