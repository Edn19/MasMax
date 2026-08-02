#!/bin/sh
set -eu
: "${POSTGRES_USER:?POSTGRES_USER es obligatorio}"
: "${POSTGRES_DB:?POSTGRES_DB es obligatorio}"
DB_BACKUP="${1:?Uso: scripts/restore.sh database.dump [uploads.tar.gz]}"
test -f "$DB_BACKUP" || { echo "No existe $DB_BACKUP" >&2; exit 1; }
cat "$DB_BACKUP" | docker compose exec -T postgres pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"
if [ "${2:-}" != "" ]; then test -f "$2" || { echo "No existe $2" >&2; exit 1; }; tar -xzf "$2"; fi
echo "Restauracion completada. Ejecuta scripts/health-check.sh y valida contenido y reproduccion."
