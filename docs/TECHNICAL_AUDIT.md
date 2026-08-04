# Auditoría técnica

## Arquitectura encontrada

Monorepo npm workspaces con `apps/backend` (NestJS/Prisma), `apps/frontend` (React/Vite/Tailwind), PostgreSQL 16, Nginx frontal y almacenamiento bind mount `uploads`. Nginx publica solo `8088`; frontend, backend y base permanecen en red interna.

## Problemas detectados

- Seed ejecutado en cada arranque y contraseña administrativa conocida restablecida.
- Secretos débiles con fallback, access token de siete días y ausencia de refresh real.
- Refresh token persistido en `localStorage`; logout únicamente local.
- Videos locales servidos de forma pública y permanente.
- Validación de carga basada en extensión/MIME, sin inspección del contenido.
- Sin sesiones/dispositivos, bloqueo de login, progreso, perfiles, listas, auditoría o gestión de almacenamiento.
- Comentarios aprobados por defecto; borrado físico de entidades críticas.
- Errores y logs sin contrato/request ID global.
- Sin pruebas automatizadas, scripts de respaldo ni documentación operativa suficiente.

## Cambios realizados

Se añadió validación estricta de entorno, seed idempotente separado, sesiones rotativas, cookies seguras, revocación, rate limiting, Helmet/CSP, bloqueo de intentos, recuperación con token hash, auditoría, perfiles, listas, historial/progreso, soft delete, comentarios moderados, búsqueda global paginada, archivos `MediaFile`, validación MP4+ffprobe+checksum, estadísticas/limpieza de almacenamiento, URL temporal HMAC y entrega interna Nginx. El frontend ahora renueva en silencio, gestiona sesiones, protege medios y muestra progreso/continuación.

## Riesgos y limitaciones restantes

- El worker independiente FFmpeg genera HLS adaptativo y miniaturas; la concurrencia debe dimensionarse y vigilarse segun `docs/VIDEO_PROCESSING.md`.
- No hay subida por partes/resumible; sí hay progreso, streaming a disco, límites y limpieza por fallo.
- SMTP, invitaciones administrativas UI, verificación de correo, subtítulos completos, selector de audio, modo infantil integral y marcado masivo de temporadas siguen pendientes.
- La búsqueda usa `contains` de PostgreSQL; para catálogos grandes conviene `pg_trgm`/full text.
- Las pruebas agregadas cubren configuración, favoritos y firma/expiración de medios; falta ampliar integración y E2E.
- `npm audit --omit=dev` reporta 11 avisos transitivos (8 moderados y 3 altos, ninguno crítico), principalmente en Nest/Express/Multer y React Router. `npm audit fix` no puede resolverlos sin cambios mayores; requieren una migración controlada y nueva certificación funcional.

## Migración

`20260728160542_platform_security` añade modelos, índices, backfill de perfiles y restricciones de destino polimórfico. Se aplica con `prisma migrate deploy`.

## Despliegue

Completar secretos en `.env`, respaldar PostgreSQL/uploads y ejecutar `docker compose up -d --build`. Comprobar `/api/health/ready`, logs y acceso directo denegado a `/uploads/videos/*`.
