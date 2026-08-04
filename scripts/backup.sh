#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env}"
test -f "$ENV_FILE" || { echo "No existe $ENV_FILE. Copia .env.example y configura los secretos." >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER es obligatorio}"
: "${POSTGRES_DB:?POSTGRES_DB es obligatorio}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK_DIR="$BACKUP_DIR/.masmax-$STAMP.tmp"
ARCHIVE="$BACKUP_DIR/masmax-$STAMP.tar.gz"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT INT TERM
mkdir -p "$WORK_DIR" "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$WORK_DIR/database.dump"
test -s "$WORK_DIR/database.dump" || { echo "pg_dump produjo un archivo vacio" >&2; exit 1; }

if test -d uploads; then
  tar -czf "$WORK_DIR/uploads.tar.gz" uploads
else
  mkdir "$WORK_DIR/empty"
  tar -C "$WORK_DIR/empty" -czf "$WORK_DIR/uploads.tar.gz" .
fi

SCHEMA_VERSION="$(docker compose --env-file "$ENV_FILE" exec -T postgres psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COALESCE(MAX(finished_at)::text, 'sin migraciones') FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL;" | tr -d '\r')"
{
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "schema_version=$SCHEMA_VERSION"
  echo "format=masmax-backup-v1"
} > "$WORK_DIR/manifest.txt"

(cd "$WORK_DIR" && sha256sum database.dump uploads.tar.gz manifest.txt > SHA256SUMS)
tar -C "$WORK_DIR" -czf "$ARCHIVE.tmp" database.dump uploads.tar.gz manifest.txt SHA256SUMS
sha256sum "$ARCHIVE.tmp" > "$ARCHIVE.sha256.tmp"
mv "$ARCHIVE.tmp" "$ARCHIVE"
mv "$ARCHIVE.sha256.tmp" "$ARCHIVE.sha256"
echo "Respaldo verificado creado: $ARCHIVE"
