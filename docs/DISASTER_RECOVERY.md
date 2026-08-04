# Recuperacion ante desastres

## Objetivos

- Definir RPO/RTO antes de produccion; el repositorio no puede decidirlos por el negocio.
- Mantener al menos una copia cifrada fuera del host y probar restore periodicamente.
- Tratar PostgreSQL y uploads como una unidad temporal coherente.

## Procedimiento

1. Declarar mantenimiento y bloquear escritores.
2. Seleccionar el ultimo backup cuya suma y prueba `--validate-only` sean correctas.
3. Provisionar preferentemente un entorno temporal con la misma version de Compose.
4. Restaurar, ejecutar `prisma migrate status` y validar health.
5. Probar login USER/ADMIN, catalogo, MP4/HLS, progreso y uploads.
6. Cambiar trafico solo despues de aprobar los checks.
7. Conservar el entorno anterior y el rollback hasta cerrar el incidente.

## Rollback

Si DB, uploads o health fallan, detener escritores, restaurar `rollback-FECHA/database.dump`, devolver `uploads-before-restore`, reiniciar y verificar. Registrar tiempos, artefactos y resultado sin incluir secretos.
