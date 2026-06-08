#!/usr/bin/env bash
# Jenkins / 生产部署：只启动应用容器，MySQL/Redis 由 .env 指定外置地址。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
fi

if [[ ! -f .env ]]; then
  echo "ERROR: missing .env — copy .env.example and set DATABASE_URL / REDIS_*" >&2
  exit 1
fi

echo "[deploy] ${COMPOSE[*]} up (external MySQL/Redis via .env)"
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --force-recreate

echo "[deploy] waiting for shellder-agent-server health (max 300s)..."
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' shellder-agent-server 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then
    echo "[deploy] shellder-agent-server is healthy"
    exit 0
  fi
  if [[ "$status" == "unhealthy" ]]; then
    break
  fi
  sleep 5
done

echo "[deploy] ERROR: shellder-agent-server not healthy (status=$status)" >&2
echo "========== docker logs shellder-agent-server (last 120 lines) =========="
docker logs --tail 120 shellder-agent-server 2>&1 || true
exit 1
