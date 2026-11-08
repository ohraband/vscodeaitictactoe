# Docker Compose

The default Compose stack runs Postgres 17, Redis 7, the app, and a Caddy gateway. The app
image contains both the API and the built SPA; Caddy serves it at `http://localhost:3000`
and proxies `/cursor.io` to the optional cursor consumer. Migrations are applied before the
server starts.

The production/VPS path layers `compose.prod.yaml` on top. That overlay reconfigures the
Caddy service to own ports 80/443, proxy to `app:3000` and `/cursor.io`, keeps the app and
cursor consumer off host ports, and requires `TTT_DOMAIN`, `POSTGRES_PASSWORD`, and
`GRAFANA_ADMIN_PASSWORD`. See
[../vps/README.md](../vps/README.md) for the deployment runbook.

## Run locally

From the repository root:

```sh
export SESSION_SECRET="$(openssl rand -hex 32)"
docker compose -f infra/compose/compose.yaml up --build
```

Open `http://localhost:3000`. In another shell, check the health endpoints:

```sh
curl -fsS http://localhost:3000/api/health/live
curl -fsS http://localhost:3000/api/health/ready
```

Run detached and follow logs:

```sh
docker compose -f infra/compose/compose.yaml up -d --build
docker compose -f infra/compose/compose.yaml ps
docker compose -f infra/compose/compose.yaml logs -f app
```

Stop the stack, or stop it and delete the database volume:

```sh
docker compose -f infra/compose/compose.yaml down
docker compose -f infra/compose/compose.yaml down -v
```

## HTTPS, CSP, and cookies

The local stack is plain HTTP, so it leaves `CSP_UPGRADE_INSECURE_REQUESTS` and
`SESSION_COOKIE_SECURE` at their defaults of `false`. With the CSP flag enabled, browsers
rewrite asset requests to HTTPS and the page never loads from a plain-HTTP server. With a
Secure cookie, the browser will not send the session over plain HTTP, so the Socket.IO
handshake fails and the game page loses its live connection.

Only enable these when the app is reached over HTTPS, for example behind a TLS-terminating
proxy. The production overlay sets both to `true` by default because Caddy terminates TLS.
Override any of the defaults from the shell:

```sh
CSP_UPGRADE_INSECURE_REQUESTS=true docker compose \
  -f infra/compose/compose.yaml up -d
```

## Optional profiles

Observability and analytics profiles are described in the repository
[README](../../README.md):

```sh
docker compose -f infra/compose/compose.yaml --profile observability up --build
KAFKA_BROKERS=redpanda:9092 \
  docker compose -f infra/compose/compose.yaml --profile analytics up --build
```

To enable the optional Kafka cursor stream, add the cursor overlay so the app also publishes
to `ttt.cursor.moved`:

```sh
docker compose -f infra/compose/compose.yaml \
  -f infra/compose/compose.cursor.yaml \
  --profile cursor up --build
```

The gateway proxies `/cursor.io` to `cursor-consumer:3001`; the consumer is not published on
a host port. Grafana keeps host port 3001.

## Windows + WSL2: localhost does not reach the container

If the app is healthy inside WSL but the Windows browser cannot connect, separate Docker
from WSL port forwarding:

```sh
# In WSL: both should work.
curl -v --max-time 5 http://127.0.0.1:3000/
curl -v --max-time 5 "http://$(hostname -I | awk '{print $1}'):3000/"
docker compose -f infra/compose/compose.yaml port caddy 3000
```

`port caddy 3000` must report a listener, usually `0.0.0.0:3000` and/or `[::]:3000`. If WSL
curl works but Windows does not, the app and Docker are fine; WSL localhost forwarding is the
problem. In PowerShell:

```powershell
wsl hostname -I
curl.exe -v --max-time 5 http://localhost:3000/
curl.exe -v --max-time 5 http://<WSL_IP>:3000/
```

If the WSL IP works, either reset forwarding (`wsl --shutdown`, restart Docker, rerun
Compose) or forward the Windows loopback port to the WSL IP without restarting WSL. Run
PowerShell as Administrator:

```powershell
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=127.0.0.1 2>$null
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=127.0.0.1 connectport=3000 connectaddress=$wslIp
```

Then use `http://127.0.0.1:3000` from Windows. The WSL IP changes after a WSL restart, so
rerun the command then, or remove the rule with:

```powershell
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=127.0.0.1
```

### Windows has reserved port 3000

If only this app fails on `localhost` while the WSL IP works, check whether Windows has
reserved 3000 for Hyper-V/WSL. In that case Docker binds the port inside WSL, but Windows
cannot create the loopback listener. Run PowerShell:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
netsh interface ipv6 show excludedportrange protocol=tcp
```

If `3000` falls inside one of the ranges, move the published host port:

```sh
APP_HOST_PORT=3300 docker compose -f infra/compose/compose.yaml up -d
```

Then open `http://localhost:3300`. To keep `localhost:3000`, stop Docker/WSL and reserve the
port for Docker before restarting them, in an Administrator PowerShell:

```powershell
net stop winnat
netsh int ipv4 add excludedportrange protocol=tcp startport=3000 numberofports=1
net start winnat
```

If Docker Engine runs inside WSL and some published ports are not visible to Windows,
enabling the Docker userland proxy in `/etc/docker/daemon.json` gives WSL a listening socket
to forward:

```json
{
  "userland-proxy": true
}
```

Restart Docker and recreate the containers after changing it:

```sh
sudo systemctl restart docker
docker compose -f infra/compose/compose.yaml up -d --force-recreate
```

The local stack publishes the Caddy gateway on every interface, over both IPv4 and IPv6,
using the unqualified `${APP_HOST_PORT:-3000}:3000` mapping; that is what makes `localhost`
work when it resolves to `::1`. The app and cursor consumer stay on the Compose network and
are reached only through Caddy.
