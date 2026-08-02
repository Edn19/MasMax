# Respaldo y restauración

Configura `POSTGRES_USER`, `POSTGRES_DB` y opcionalmente `BACKUP_DIR`. `scripts/backup.sh` crea un dump PostgreSQL en formato custom y un tar de `uploads`. Copia también `.env` mediante un gestor seguro de secretos, nunca dentro de un repositorio público.

`scripts/restore.sh dump [uploads.tar.gz]` restaura sobre la base configurada. Haz primero una copia del destino. Tras restaurar, ejecuta migraciones, `scripts/health-check.sh`, inicia sesión y prueba imágenes, MP4 protegido, progreso y administración. Programa retención fuera del script según tu política.
