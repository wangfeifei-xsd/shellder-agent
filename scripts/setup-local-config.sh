#!/usr/bin/env bash
# 生成本地开发配置（gitignore）；Docker 部署使用 *.dockeruse
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/config"

if [[ ! -f "$CFG/.env.example" || ! -f "$CFG/application.yml.dockeruse" ]]; then
  echo "ERROR: missing config/.env.example or config/application.yml.dockeruse" >&2
  exit 1
fi

if [[ -f "$CFG/.env" ]]; then
  echo "[setup-local-config] config/.env already exists — skip"
else
  cp "$CFG/.env.example" "$CFG/.env"
  echo "[setup-local-config] created config/.env from .env.example"
fi

if [[ -f "$CFG/application.yml" ]]; then
  echo "[setup-local-config] config/application.yml already exists — skip"
else
  cp "$CFG/application.yml.dockeruse" "$CFG/application.yml"
  echo "[setup-local-config] created config/application.yml from application.yml.dockeruse"
fi

echo "[setup-local-config] done (optional: create config/application-local.yml for personal overrides)"
