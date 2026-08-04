# Restauracion de MasMax

## Validacion segura

Este modo no toca contenedores, base de datos ni uploads:

```bash
sh scripts/restore.sh --validate-only backups/masmax-FECHA.tar.gz
```

Comprueba checksum externo, rutas del tar, checksums internos y archivos obligatorios.

## Restauracion autorizada

```bash
ENV_FILE=.env sh scripts/restore.sh --yes backups/masmax-FECHA.tar.gz
```

El script verifica espacio, detiene backend/worker, crea un rollback local, restaura PostgreSQL y uploads, revisa migraciones, reinicia y consulta readiness. No lo ejecutes sobre produccion sin ventana aprobada, copia externa verificada y operador preparado para rollback.

Los archivos de rollback quedan en `BACKUP_DIR/rollback-FECHA`. No los borres hasta validar login, catalogo, reproduccion, jobs y conteos de datos.
