#!/usr/bin/env bash
# Jenkins / 生产部署：只启动应用容器，连接信息来自 config/.env.example
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE=config/.env.example

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

# 宿主机根目录 .env 会被 docker compose 用于 ${VAR} 插值，覆盖 env_file；生产只用 config/.env.example
if [[ -f .env ]]; then
  backup=".env.bak.$(date +%s)"
  echo "WARN: moving stale root .env -> $backup (config is $ENV_FILE only)" >&2
  mv .env "$backup"
fi

# shellcheck disable=SC1091
set -a && source "$ENV_FILE" && set +a

if [[ "${DATABASE_URL:-}" =~ @localhost[:/] ]] || [[ "${DATABASE_URL:-}" =~ @127\.0\.0\.1[:/] ]]; then
  echo "ERROR: $ENV_FILE has DATABASE_URL=localhost — use real MySQL IP (e.g. 192.168.109.211)." >&2
  exit 1
fi

if [[ "${REDIS_HOST:-}" == "localhost" || "${REDIS_HOST:-}" == "127.0.0.1" ]]; then
  echo "ERROR: $ENV_FILE has REDIS_HOST=localhost — use real Redis IP." >&2
  exit 1
fi

echo "[deploy] ${COMPOSE[*]} up — $(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1)"
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
