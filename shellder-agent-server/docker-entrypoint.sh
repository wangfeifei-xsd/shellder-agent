#!/bin/sh
set -e

echo "[entrypoint] DATABASE_URL host: $(node -e "try{console.log(new URL(process.env.DATABASE_URL.replace(/^mysql:/,'http:')).host)}catch(e){console.log('invalid')}")"

echo "[entrypoint] Prisma migrate deploy..."
if ! npx prisma migrate deploy; then
  echo "[entrypoint] ERROR: prisma migrate deploy failed. Check DATABASE_URL and DB connectivity." >&2
  exit 1
fi

if [ "${SEED_ON_STARTUP:-true}" != "false" ]; then
  echo "[entrypoint] Running project-sql seed (00-all-seed.sql)..."
  eval "$(node <<'NODE'
const url = new URL(process.env.DATABASE_URL.replace(/^mysql:/, 'http:'));
const cfg = {
  host: url.hostname,
  port: url.port || '3306',
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
};
for (const [key, value] of Object.entries(cfg)) {
  process.stdout.write(`export MYSQL_${key.toUpperCase()}=${JSON.stringify(value)}\n`);
}
NODE
)"
  if ! mariadb -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /app/seed/00-all-seed.sql; then
    echo "[entrypoint] ERROR: seed failed. Set SEED_ON_STARTUP=false to skip, or fix DB permissions." >&2
    exit 1
  fi
  echo "[entrypoint] Seed completed."
else
  echo "[entrypoint] Skipping seed (SEED_ON_STARTUP=false)."
fi

exec node dist/main.js
