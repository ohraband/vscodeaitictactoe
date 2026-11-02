# VPS deployment

Run the local commands from `/workspace`. Replace `user@VPS_IP` and `game.website.com` with your values.

## 1. One-time VPS checks

You need ports 22/80/443 open, the DNS A record `game.website.com` pointing at the VPS IPv4, and outbound internet on the VPS for the first build.

Caddy now runs inside this project’s Compose stack, so stop anything else using ports 80/443:

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

If an old Caddy container is listed, stop it:

```sh
docker stop <old-caddy-container>
```

If Caddy is instead a host service:

```sh
sudo systemctl disable --now caddy
```

Also make sure port 3000 is free on loopback:

```sh
sudo ss -ltnp | grep ':3000' || true
```

## 2. Package the project locally

From `/workspace`:

```sh
cd /workspace

tar \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.devcontainer \
  --exclude=dist \
  --exclude='*/dist' \
  --exclude=coverage \
  --exclude=playwright-report \
  --exclude=test-results \
  --exclude=.env \
  -czf /tmp/ttt.tar.gz .

ls -lh /tmp/ttt.tar.gz
```

This keeps `infra/compose/.env.prod.example` but excludes any real `.env`.

## 3. Upload and extract

```sh
scp /tmp/ttt.tar.gz user@VPS_IP:/tmp/
```

On the VPS:

```sh
ssh user@VPS_IP

sudo mkdir -p /opt/ttt
sudo chown "$USER":"$USER" /opt/ttt
tar -xzf /tmp/ttt.tar.gz -C /opt/ttt
cd /opt/ttt
```

If your user is not in the Docker group, use `sudo` for the Docker commands below.

## 4. Create the production environment

```sh
cd /opt/ttt
cp infra/compose/.env.prod.example .env
chmod 600 .env
nano .env
```

Set these values:

```dotenv
TTT_DOMAIN=game.website.com

POSTGRES_PASSWORD=<openssl rand -hex 16>
SESSION_SECRET=<openssl rand -hex 32>
GRAFANA_ADMIN_PASSWORD=<openssl rand -hex 16>

APP_BIND_ADDRESS=127.0.0.1
CSP_UPGRADE_INSECURE_REQUESTS=true
SESSION_COOKIE_SECURE=true

KAFKA_BROKERS=redpanda:9092
```

Generate the secrets if needed:

```sh
openssl rand -hex 16   # POSTGRES_PASSWORD and GRAFANA_ADMIN_PASSWORD
openssl rand -hex 32   # SESSION_SECRET
```

Keep `KAFKA_BROKERS` because you want the analytics profile. If you later disable analytics, comment it out.

## 5. Validate Compose

```sh
cd /opt/ttt

docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml \
  --profile observability --profile analytics \
  config >/dev/null
```

If this fails, it will name the missing or invalid variable.

## 6. First deploy — clean database

If this project has never run on the VPS, skip this. If there is an old disposable `ttt_postgres-data` volume from a previous attempt, remove it once:

```sh
docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml \
  down -v
```

This deletes the database and Caddy certificates. Never run it after you have production data/certs you want to keep.

## 7. Start everything

```sh
cd /opt/ttt

docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml \
  --profile observability --profile analytics \
  up -d --build
```

This single command starts:

- `app`
- `postgres`
- `redis`
- `caddy` on ports 80/443, proxying to `app:3000`
- `prometheus`
- `grafana`
- `redpanda`, `redpanda-init`, `analytics-worker`

Caddy obtains the TLS certificate automatically once DNS points at the VPS.

## 8. Verify

```sh
cd /opt/ttt

docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml ps
```

App health inside the VPS:

```sh
curl -fsS http://127.0.0.1:3000/api/health/live
curl -fsS http://127.0.0.1:3000/api/health/ready
```

Public HTTPS:

```sh
curl -fsS https://game.website.com/api/health/ready
curl -fsS https://game.website.com/api/metrics | head
```

Cookie check:

```sh
curl -i -c /tmp/ttt-cookies.txt \
  -X POST https://game.website.com/api/session \
  -H 'content-type: application/json' \
  -d '{"displayName":"Deploy Check"}'
```

The cookie should show `Secure`, `HttpOnly`, and `SameSite=Lax`.

Caddy logs if TLS fails:

```sh
docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml logs --tail=100 caddy
```

## 9. Optional services

Grafana is only on loopback. Reach it with an SSH tunnel from your machine:

```sh
ssh -L 3001:127.0.0.1:3001 user@VPS_IP
```

Then open `http://localhost:3001` and log in as `admin` with `GRAFANA_ADMIN_PASSWORD`.

Prometheus is at `127.0.0.1:9090` and Redpanda at `127.0.0.1:9092`; neither is public.

Check the analytics worker:

```sh
docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml logs --tail=100 analytics-worker
```

## 10. Future updates

From `/workspace`, rebuild the archive excluding `.env`:

```sh
cd /workspace

tar \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.devcontainer \
  --exclude=dist \
  --exclude='*/dist' \
  --exclude=coverage \
  --exclude=playwright-report \
  --exclude=test-results \
  --exclude=.env \
  -czf /tmp/ttt.tar.gz .

scp /tmp/ttt.tar.gz user@VPS_IP:/tmp/
```

(same folder 
tar   --exclude=node_modules   --exclude=.git   --exclude=.devcontainer   --exclude=dist   --exclude='*/dist'   --exclude=coverage   --exclude=playwright-report   --exclude=test-results   --exclude=.env   -czf ./ttt.tar.gz .

scp ttt.tar.gz user@VPS_IP:/tmp/

)




On the VPS:

```sh
cd /opt/ttt
tar -xzf /tmp/ttt.tar.gz

docker compose -p ttt --env-file .env \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.prod.yaml \
  --profile observability --profile analytics \
  up -d --build
```

Migrations run automatically before the app starts. Keep `.env` on the VPS; the update archive intentionally excludes it.

## Important
- Do not use `down -v` later, because it also deletes Caddy’s certificates and the database.
- `POSTGRES_PASSWORD` only applies when Postgres creates a new empty volume.
- No git is needed anywhere in this flow.
- If Caddy returns 502, check the `app` container health and its logs.
- If Caddy cannot get a certificate, check DNS, ports 80/443, and `caddy` logs.
