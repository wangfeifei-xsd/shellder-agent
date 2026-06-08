#!/usr/bin/env bash
# 内网 Jenkins / 手动部署：外置 MySQL/Redis，不启动 Compose 内置 mysql/redis。
# 在目标机 /data/shellder-agent 执行；需事先 cp .env.example .env 并按内网段填写。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
fi

if [[ ! -f .env ]]; then
  echo "ERROR: missing .env — copy .env.example and configure intranet DATABASE_URL / REDIS_*" >&2
  exit 1
fi

echo "[deploy] compose: ${COMPOSE[*]} -f docker-compose.yml -f docker-compose.intranet.yml"
"${COMPOSE[@]}" -f docker-compose.yml -f docker-compose.intranet.yml build
"${COMPOSE[@]}" -f docker-compose.yml -f docker-compose.intranet.yml up -d --force-recreate

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
