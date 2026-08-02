# NovaStream / MasMax

Plataforma privada de streaming con React, Vite, TailwindCSS, NestJS, Prisma, PostgreSQL, Nginx y Docker Compose. Incluye catálogo de series/películas, administración, favoritos, progreso, perfiles, listas, comentarios moderados y reproducción local protegida. No incluye pagos ni suscripciones comerciales.

## Inicio rápido

Requisitos: Docker Desktop en Windows o Docker Engine + Compose Plugin en Linux.

```bash
cp .env.example .env
# Completa POSTGRES_PASSWORD, DATABASE_URL, JWT_SECRET,
# JWT_REFRESH_SECRET y MEDIA_SIGNING_SECRET con valores aleatorios fuertes.
docker compose up -d --build
```

Abre `http://localhost:8088`. El backend (`3000`), PostgreSQL (`5432`) y frontend (`8080`) solo están expuestos dentro de la red Docker.

## Primer administrador

El arranque nunca crea ni restablece credenciales. Si no existe un administrador:

1. Define temporalmente `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 12 caracteres) y `ADMIN_NAME` en `.env`.
2. Ejecuta:

```bash
docker compose exec backend npm run prisma:seed:admin
```

3. Vacía `ADMIN_PASSWORD` en `.env` después de crear la cuenta.

Si ya existe un administrador, el seed es idempotente y no cambia su contraseña. El contenido ficticio es opcional:

```bash
# Define SEED_DEMO=true solo mientras ejecutas este comando.
docker compose exec backend npm run prisma:seed:demo
```

## Seguridad y sesiones

- Access token corto (`15m` por defecto) mantenido en memoria del navegador.
- Refresh token rotativo en cookie `HttpOnly`, almacenado solo como hash en PostgreSQL.
- Cierre de sesión real y revocación por dispositivo desde `/profile/security`.
- Bloqueo temporal tras intentos fallidos, rate limiting global, Helmet, CSP y CORS con lista permitida.
- Videos MP4 locales bloqueados en `/uploads/videos/*`; el reproductor solicita una URL HMAC temporal y Nginx sirve el archivo mediante `X-Accel-Redirect` y una ubicación `internal`.
- Las imágenes continúan públicas en `/uploads/images/*`.

Para producción usa HTTPS mediante un proxy externo y configura `FRONTEND_URL`, `APP_PUBLIC_URL` y secretos diferentes por instalación.

## Contenido y video

En administración se aceptan MP4 locales de hasta 1080p y el límite `MAX_VIDEO_UPLOAD_MB`. La subida usa `multipart/form-data` con campo `file`, almacenamiento temporal, firma MP4 real, `ffprobe`, SHA-256 y registro `MediaFile`. Archivos inválidos se eliminan.

También se admiten URL HTTPS MP4, HLS `.m3u8`, Google Drive público y embeds de dominios incluidos en `ALLOWED_EMBED_DOMAINS`. Drive puede bloquear reproducción por permisos o cuota; comparte el archivo como “cualquier persona con el enlace”.

Los archivos locales viven en `uploads/videos`; imágenes en `uploads/images`; temporales en `uploads/tmp`. El frontend guarda progreso cada 15 segundos, al pausar y al terminar, y muestra “Continuar viendo”.

La generación adaptativa HLS con FFmpeg y worker independiente está documentada como limitación actual en `docs/MEDIA_PIPELINE.md`: el reproductor sí consume HLS externo, pero esta versión no transcodifica automáticamente subidas locales.

## Migraciones y actualización

```bash
npm ci
npm run prisma:generate
docker compose up -d --build
```

El backend ejecuta `prisma migrate deploy` al arrancar. Nunca uses `db push` en producción. Para una instalación existente, respalda base y `uploads`, revisa `docs/DEPLOYMENT.md`, despliega y verifica `/api/health/ready`.

## Desarrollo y calidad

```bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --omit=dev
npx prisma format --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma
```

## Respaldo y restauración

```bash
sh scripts/backup.sh
sh scripts/restore.sh backups/database-AAAAMMDD-HHMMSS.dump backups/uploads-AAAAMMDD-HHMMSS.tar.gz
```

Un respaldo no se considera válido hasta probar su restauración. Consulta `docs/BACKUP_AND_RESTORE.md`.

## Diagnóstico

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=200 nginx
docker compose logs --tail=200 frontend
curl http://localhost:8088/api/health/live
curl http://localhost:8088/api/health/ready
```

Documentación: `docs/TECHNICAL_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/MEDIA_PIPELINE.md`, `docs/API.md`, `docs/DEPLOYMENT.md` y `docs/BACKUP_AND_RESTORE.md`.
