# Backup de MasMax

## Crear respaldo

El script carga `.env` de forma explicita, valida PostgreSQL, genera dump, empaqueta uploads, registra la version de migraciones y produce checksums.

```bash
ENV_FILE=.env BACKUP_DIR=./backups sh scripts/backup.sh
```

El resultado es `masmax-FECHA.tar.gz` junto a `masmax-FECHA.tar.gz.sha256`. Ambos archivos son necesarios. El artefacto solo se publica al final; un fallo deja como maximo un directorio temporal que el trap elimina.

No guardes backups en Git. Copialos a almacenamiento cifrado, con control de acceso y retencion definida. Un backup no es valido hasta completar una prueba de restauracion aislada.
