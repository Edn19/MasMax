#!/bin/sh
set -eu

usage() { echo "Uso: scripts/restore.sh --validate-only backup.tar.gz | --yes backup.tar.gz" >&2; exit 2; }
MODE="${1:-}"
ARCHIVE="${2:-}"
test "$MODE" = "--validate-only" || test "$MODE" = "--yes" || usage
test -n "$ARCHIVE" || usage
test -f "$ARCHIVE" || { echo "No existe $ARCHIVE" >&2; exit 1; }
test -f "$ARCHIVE.sha256" || { echo "Falta $ARCHIVE.sha256" >&2; exit 1; }

EXPECTED="$(cut -d ' ' -f 1 "$ARCHIVE.sha256")"
ACTUAL="$(sha256sum "$ARCHIVE" | cut -d ' ' -f 1)"
test "$EXPECTED" = "$ACTUAL" || { echo "Checksum del archivo invalido" >&2; exit 1; }
if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo "El archivo contiene rutas no seguras" >&2; exit 1; fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/masmax-restore.XXXXXX")"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT INT TERM
tar -C "$WORK_DIR" -xzf "$ARCHIVE"
(cd "$WORK_DIR" && sha256sum -c SHA256SUMS)
test -s "$WORK_DIR/database.dump" || { echo "database.dump no es valido" >&2; exit 1; }
test -s "$WORK_DIR/uploads.tar.gz" || { echo "uploads.tar.gz no es valido" >&2; exit 1; }
if tar -tzf "$WORK_DIR/uploads.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo "Uploads contiene rutas no seguras" >&2; exit 1; fi

echo "Backup valido: $(cat "$WORK_DIR/manifest.txt")"
test "$MODE" = "--validate-only" && exit 0

ENV_FILE="${ENV_FILE:-.env}"
test -f "$ENV_FILE" || { echo "No existe $ENV_FILE" >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a
: "${POSTGRES_USER:?POSTGRES_USER es obligatorio}"
: "${POSTGRES_DB:?POSTGRES_DB es obligatorio}"

AVAILABLE_KB="$(df -Pk . | awk 'NR==2 {print $4}')"
REQUIRED_KB="$(du -Pk "$WORK_DIR/uploads.tar.gz" "$WORK_DIR/database.dump" | awk '{sum += $1} END {print sum * 3}')"
test "$AVAILABLE_KB" -gt "$REQUIRED_KB" || { echo "Espacio insuficiente para restaurar con rollback" >&2; exit 1; }

ROLLBACK_DIR="${BACKUP_DIR:-./backups}/rollback-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$ROLLBACK_DIR"
docker compose --env-file "$ENV_FILE" stop backend worker
restart_services() { docker compose --env-file "$ENV_FILE" up -d backend worker >/dev/null 2>&1 || true; }
trap 'restart_services; cleanup' EXIT INT TERM

docker compose --env-file "$ENV_FILE" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$ROLLBACK_DIR/database.dump"
test -s "$ROLLBACK_DIR/database.dump" || { echo "No se pudo crear rollback de base de datos" >&2; exit 1; }
test ! -d uploads || tar -czf "$ROLLBACK_DIR/uploads.tar.gz" uploads

if ! docker compose --env-file "$ENV_FILE" exec -T postgres pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$WORK_DIR/database.dump"; then
  docker compose --env-file "$ENV_FILE" exec -T postgres pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$ROLLBACK_DIR/database.dump" || true
  echo "Restore de base fallo; se intento rollback" >&2
  exit 1
fi

test ! -d uploads || mv uploads "$ROLLBACK_DIR/uploads-before-restore"
tar -xzf "$WORK_DIR/uploads.tar.gz"
docker compose --env-file "$ENV_FILE" run --rm backend npx prisma migrate status
docker compose --env-file "$ENV_FILE" up -d backend worker
trap cleanup EXIT INT TERM
docker compose --env-file "$ENV_FILE" exec -T backend node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)})"
echo "Restauracion completada. Rollback conservado en $ROLLBACK_DIR"
