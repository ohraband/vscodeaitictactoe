# Kubernetes manifests

Kustomize manifests for running the app on a local kind cluster. The base is the single
replica application Deployment, Service, ConfigMap, and Prisma migration Job. The `local`
overlay adds the `ttt` namespace, an image override for `ttt:local`, and development-only
Postgres 17 and Redis 7 instances.

This is intentionally not a production overlay. It has no ingress, TLS, autoscaling, pod
disruption budget, network policy, external secrets, or managed data services. Production
hardening and delivery are deferred to a later milestone.

## Prerequisites

- Docker
- [kind](https://kind.sigs.k8s.io/)
- kubectl with built-in Kustomize

## Deploy

From the repository root:

```sh
# 1. Build the application image (SPA, API, and WebSockets in one image).
docker build -f infra/docker/Dockerfile -t ttt:local .

# 2. Create a kind cluster and load the local image into it.
kind create cluster
kind load docker-image ttt:local

# 3. Apply the local overlay.
kubectl apply -k infra/k8s/overlays/local

# 4. Wait for the migration Job. It retries until Postgres accepts connections.
kubectl -n ttt wait --for=condition=complete job/ttt-migrate --timeout=180s

# 5. Expose the Service locally.
kubectl -n ttt port-forward svc/ttt 3000:80
```

In another shell, verify the probes and open the app:

```sh
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health/ready
open http://localhost:3000
```

The readiness check covers Postgres and Redis, so wait for `ttt-migrate` before relying on
it.

The local overlay is reached over plain HTTP through `port-forward`, so the ConfigMap keeps
`CSP_UPGRADE_INSECURE_REQUESTS` and `SESSION_COOKIE_SECURE` at `false` (the default). If you
add a TLS-terminating ingress, set both to `true` there so browsers upgrade insecure
subresource requests and send the Secure session cookie.

## Re-deploy

The migration Job is immutable and is left behind after it completes. Delete it before
applying changes, then rebuild and reload the image if needed:

```sh
kubectl -n ttt delete job ttt-migrate
kubectl apply -k infra/k8s/overlays/local
kubectl -n ttt rollout restart deployment/ttt
kubectl -n ttt wait --for=condition=complete job/ttt-migrate --timeout=180s
```

## Clean up

```sh
kubectl delete -k infra/k8s/overlays/local
kind delete cluster
```

Deleting the overlay deletes the namespace, including the development Postgres PVC.

## Local secret warning

`overlays/local/secret.yaml` contains fixed development credentials for Postgres, Redis,
and the session cookie. They are committed only to make the local flow reproducible. Do not
reuse them in a shared cluster or production, and do not copy this Secret into an overlay
that points at a real database.
