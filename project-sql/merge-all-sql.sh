#!/usr/bin/env bash
# 将 project-sql 各模块 schema / seed 合并为 00-all-schema.sql、00-all-seed.sql
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
source ./db-name.cnf 2>/dev/null || true
AGENT_DB="${AGENT_DB:-agent_platform}"

SCHEMA_OUT="00-all-schema.sql"
SEED_OUT="00-all-seed.sql"

{
  cat <<HDR
-- =============================================================================
-- shellder-agent 全量建表脚本（由 project-sql 各模块自动合并）
-- 生成：./merge-all-sql.sh
-- 目标库：${AGENT_DB}（见 db-name.cnf）
-- 顺序：模块 01 → 20；12 含 schema.sql + schema-pathy-binding.sql
-- 用法：mysql -h HOST -u USER -p < 00-all-schema.sql
--       或 mysql -h HOST -u USER -p ${AGENT_DB} < 00-all-schema.sql
-- 注意：若已用 Prisma migrate，请勿重复执行与本库冲突的 DDL
-- =============================================================================
-- 目标库: ${AGENT_DB}
USE \`${AGENT_DB}\`;

HDR
  for d in $(ls -d [0-9][0-9]-*/ 2>/dev/null | sort -V); do
    d="${d%/}"
    f="$d/schema.sql"
    if [[ -f "$f" ]]; then
      echo "-- -----------------------------------------------------------------------------"
      echo "-- 来源: $f"
      echo "-- -----------------------------------------------------------------------------"
      cat "$f"
      echo
      echo
    fi
    shopt -s nullglob
    for f in "$d"/schema-*.sql; do
      [[ "$(basename "$f")" == "schema.sql" ]] && continue
      echo "-- -----------------------------------------------------------------------------"
      echo "-- 来源: $f"
      echo "-- -----------------------------------------------------------------------------"
      cat "$f"
      echo
      echo
    done
    shopt -u nullglob
  done
} > "$SCHEMA_OUT"

{
  cat <<HDR
-- =============================================================================
-- shellder-agent 全量预制数据脚本（由 project-sql 各模块 seed.sql 自动合并）
-- 生成：./merge-all-sql.sh
-- 目标库：${AGENT_DB}（见 db-name.cnf）
-- 顺序：模块 01 → 20
-- 用法：先 00-all-schema.sql（或 prisma migrate），再本文件
--       mysql -h HOST -u USER -p < 00-all-seed.sql
-- =============================================================================
-- 目标库: ${AGENT_DB}
USE \`${AGENT_DB}\`;

HDR
  for d in $(ls -d [0-9][0-9]-*/ 2>/dev/null | sort -V); do
    d="${d%/}"
    f="$d/seed.sql"
    [[ -f "$f" ]] || continue
    echo "-- -----------------------------------------------------------------------------"
    echo "-- 来源: $f"
    echo "-- -----------------------------------------------------------------------------"
    cat "$f"
    echo
    echo
  done
} > "$SEED_OUT"

echo "Wrote $SCHEMA_OUT ($(wc -l < "$SCHEMA_OUT") lines)"
echo "Wrote $SEED_OUT ($(wc -l < "$SEED_OUT") lines)"
