#!/usr/bin/env bash
# Jenkins / 生产部署：只启动应用容器，MySQL/Redis 由 .env.example 指定外置地址。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE=.env.example

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

if [[ -f .env ]]; then
  echo "WARN: found .env — deploy uses $ENV_FILE only; remove or rename .env to avoid docker compose reading stale localhost settings." >&2
fi

# shellcheck disable=SC1091
set -a && source "$ENV_FILE" && set +a

if [[ "${DATABASE_URL:-}" =~ @localhost[:/] ]] || [[ "${DATABASE_URL:-}" =~ @127\.0\.0\.1[:/] ]]; then
  echo "ERROR: DATABASE_URL points to localhost — Docker containers cannot reach host MySQL via localhost." >&2
  echo "Edit $ENV_FILE and use the real MySQL IP (e.g. 192.168.109.211:3306)." >&2
  exit 1
fi

if [[ "${REDIS_HOST:-}" == "localhost" || "${REDIS_HOST:-}" == "127.0.0.1" ]]; then
  echo "ERROR: REDIS_HOST is localhost — use the real Redis IP in $ENV_FILE." >&2
  exit 1
fi

echo "[deploy] ${COMPOSE[*]} --env-file $ENV_FILE up (external MySQL/Redis)"
"${COMPOSE[@]}" --env-file "$ENV_FILE" build
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d --force-recreate

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
