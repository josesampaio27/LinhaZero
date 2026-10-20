#!/usr/bin/env bash
# Deploys one commit's images to the cluster: renders infra/ with every linhazero-* image at the commit sha, applies
# it and waits for the rollout. Run by the deploy job of .github/workflows/images.yml on the homelab runner, after the
# images of that commit are pushed; by hand (from the repo root, with kubectl pointed at the cluster):
#   infra/k8s/deploy.sh                          # the sha of origin/main
#   infra/k8s/deploy.sh <sha>                    # a given commit (a rollback): its images must exist in GHCR
# The files are not changed: the sha is swapped in the rendered output only.
set -euo pipefail
cd "$(dirname "$0")/../.."

SHA=${1:-$(git rev-parse origin/main)}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "deploy.sh: expected a full 40-character commit sha, got '$SHA'" >&2; exit 1; }
NS=linha-zero

echo "== a aplicar $SHA"
kubectl kustomize infra \
  | sed -E "s#(image: ghcr\.io/[^/]+/linhazero-[a-z-]+):main\$#\1:$SHA#" \
  | kubectl apply -f -

echo "== à espera do rollout"
for workload in statefulset/postgres statefulset/nats deployment/keycloak deployment/api deployment/ingest \
  deployment/engine-worker deployment/web deployment/landing deployment/cloudflared; do
  kubectl -n "$NS" rollout status "$workload" --timeout=10m
done
kubectl -n "$NS" get pods -o wide
