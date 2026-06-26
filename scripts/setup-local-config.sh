#!/usr/bin/env bash
# 生成本地开发配置（gitignore）；Docker 部署使用 *.dockeruse
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/config"

if [[ ! -f "$CFG/.env.dockeruse" || ! -f "$CFG/application.yml.dockeruse" ]]; then
  echo "ERROR: missing config/*.dockeruse templates" >&2
  exit 1
fi

if [[ -f "$CFG/.env" ]]; then
  echo "[setup-local-config] config/.env already exists — skip"
else
  cp "$CFG/.env.dockeruse" "$CFG/.env"
  if [[ "$(uname)" == Darwin ]]; then
    sed -i '' 's/^SHELLDER_PROFILE=.*/SHELLDER_PROFILE=local/' "$CFG/.env"
    sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL=mysql://root:Root%401345@localhost:3306/agent_platform|' "$CFG/.env"
    sed -i '' 's/^REDIS_HOST=.*/REDIS_HOST=localhost/' "$CFG/.env"
    sed -i '' 's/^REDIS_PORT=.*/REDIS_PORT=6379/' "$CFG/.env"
  else
    sed -i 's/^SHELLDER_PROFILE=.*/SHELLDER_PROFILE=local/' "$CFG/.env"
    sed -i 's|^DATABASE_URL=.*|DATABASE_URL=mysql://root:Root%401345@localhost:3306/agent_platform|' "$CFG/.env"
    sed -i 's/^REDIS_HOST=.*/REDIS_HOST=localhost/' "$CFG/.env"
    sed -i 's/^REDIS_PORT=.*/REDIS_PORT=6379/' "$CFG/.env"
  fi
  echo "[setup-local-config] created config/.env"
fi

if [[ -f "$CFG/application.yml" ]]; then
  echo "[setup-local-config] config/application.yml already exists — skip"
else
  cp "$CFG/application.yml.dockeruse" "$CFG/application.yml"
  echo "[setup-local-config] created config/application.yml"
fi

if [[ -f "$CFG/application-local.yml" ]]; then
  echo "[setup-local-config] config/application-local.yml already exists — skip"
else
  cat > "$CFG/application-local.yml" <<'EOF'
# 本地开发 Profile（SHELLDER_PROFILE=local 时加载）

infrastructure:
  database:
    url: ${DATABASE_URL:mysql://root:Root%401345@localhost:3306/agent_platform}
  redis:
    host: localhost
    port: 6379
    password: ''

services:
  web-console:
    api-base-url: http://localhost:3001
    api-proxy-target: http://localhost:3001
    default-origin: http://localhost:3000

auth:
  bootstrap:
    enabled: true
    admin-username: admin
    admin-password: admin123

app:
  notification:
    send-mock: true
EOF
  echo "[setup-local-config] created config/application-local.yml"
fi

echo "[setup-local-config] done"
