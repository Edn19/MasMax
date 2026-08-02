#!/bin/sh
set -eu
: "${POSTGRES_USER:?POSTGRES_USER es obligatorio}"
: "${POSTGRES_DB:?POSTGRES_DB es obligatorio}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP_DIR/database-$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" uploads
echo "Respaldo creado en $BACKUP_DIR. Debe probarse mediante una restauracion antes de considerarlo valido."
