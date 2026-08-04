# NovaStream / MasMax

Plataforma privada de streaming con React, Vite, TailwindCSS, NestJS, Prisma, PostgreSQL, Nginx y Docker Compose. Incluye catálogo de series/películas, administración, favoritos, progreso, perfiles, listas, comentarios moderados y reproducción local protegida. No incluye pagos ni suscripciones comerciales.

El almacenamiento puede usar disco local o un proveedor compatible con S3. La configuración, seguridad del bucket y migración sin pérdida de archivos se documentan en [`docs/STORAGE.md`](docs/STORAGE.md).

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
- Originales MP4 y MKV bloqueados en `/uploads/videos/*`; el reproductor solo recibe MP4 autorizado o HLS validado mediante rutas protegidas.
- Las imágenes continúan públicas en `/uploads/images/*`.

Para producción usa HTTPS mediante un proxy externo y configura `FRONTEND_URL`, `APP_PUBLIC_URL` y secretos diferentes por instalación.

## Contenido y video

En administracion se aceptan MP4 y MKV locales de hasta 1080p y el limite `MAX_VIDEO_UPLOAD_MB`. Para Matroska se reconocen `video/matroska`, `video/x-matroska`, `application/x-matroska` y el fallback `application/octet-stream`. La subida reanudable usa almacenamiento temporal en disco, firma MP4/EBML, `ffprobe`, SHA-256 y registro `MediaFile`. Archivos falsos, corruptos, sin video o con duracion invalida se eliminan. MKV nunca se reproduce directamente: el worker lo convierte a HLS.

También se admiten URL HTTPS MP4, HLS `.m3u8`, Google Drive público y embeds de dominios incluidos en `ALLOWED_EMBED_DOMAINS`. Drive puede bloquear reproducción por permisos o cuota; comparte el archivo como “cualquier persona con el enlace”.

Los archivos locales viven en `uploads/videos`; imágenes en `uploads/images`; temporales en `uploads/tmp`. El frontend restaura el punto exacto y guarda progreso al iniciar, cada 15 segundos durante la reproducción, al pausar, abandonar y terminar. `PLAYBACK_COMPLETION_PERCENT` define el umbral de finalización (90% por defecto) y una reproducción posterior no desmarca contenido ya completado.

La generacion adaptativa HLS usa Redis, BullMQ y un worker FFmpeg independiente. Consulta `docs/VIDEO_PROCESSING.md` para operacion y dimensionamiento.

## Migraciones y actualización

```bash
npm ci
npm run prisma:generate
docker compose up -d --build
```

El backend ejecuta `prisma migrate deploy` al arrancar. Nunca uses `db push` en producción. Para una instalación existente, respalda base y `uploads`, revisa `docs/DEPLOYMENT.md`, despliega y verifica `/api/health/ready`.

## Temporadas y carga masiva

El panel incluye `Administracion > Temporadas` para crear, editar, publicar y eliminar temporadas vacias. Una temporada con episodios activos no se elimina; primero deben revisarse o retirar sus episodios.

En `Administracion > Episodios` selecciona una serie y temporada para crear episodios en lote, reordenarlos, publicar o despublicar una seleccion, copiar configuracion y detectar huecos de numeracion. La importacion CSV valida primero todas las filas y solo habilita el commit cuando no existen errores.

Columnas obligatorias: `season,episode,title,videoUrl`. Columnas opcionales: `description,videoSource,videoType,thumbnailUrl,duration,published,publishedAt`. La operacion admite hasta 500 filas y se confirma dentro de una transaccion, por lo que un error evita datos parciales. Consulta ejemplos y contratos en `docs/API.md`.

## Subtitulos

Desde `Administracion > Subtitulos` se pueden asociar pistas `.vtt` o `.srt` a episodios y peliculas. Define idioma, etiqueta visible, estado activo, pista predeterminada y pista forzada. El panel permite editar, previsualizar y eliminar cada pista.

Los archivos deben usar UTF-8 y no superar `MAX_SUBTITLE_UPLOAD_KB` (1024 KB por defecto). Los SRT se convierten automaticamente a WebVTT y los archivos finales se guardan en `uploads/subtitles`. No se sirven directamente por Nginx: el reproductor los obtiene mediante la API autenticada.

MP4 y HLS presentan un selector de subtítulos propio. HLS también ofrece calidad y pistas de audio cuando el manifiesto incluye variantes. El reproductor recuerda por dispositivo volumen, velocidad, calidad y reproducción automática; permite saltos de 10 segundos, PiP, pantalla completa, siguiente episodio y botones de omitir intro/resumen configurados desde el panel. Los reproductores `EMBED` y el fallback iframe de Google Drive dependen de los controles del proveedor y no permiten inyectar pistas locales.

Atajos del reproductor: `Espacio` o `K` reproduce/pausa, flechas izquierda/derecha retroceden o avanzan 10 segundos, `M` silencia, `F` abre pantalla completa y `C` activa/desactiva subtítulos.

## Subidas reanudables

Los videos locales se envian por partes. El panel permite pausar, continuar y cancelar, muestra velocidad y tiempo restante y reintenta fallos transitorios. Tras recargar el navegador, selecciona nuevamente el mismo archivo para continuar solo con las partes faltantes.

Configura `MAX_VIDEO_UPLOAD_MB`, `RESUMABLE_CHUNK_SIZE_MB`, `RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB`, `RESUMABLE_UPLOAD_MAX_RETRIES` y `RESUMABLE_UPLOAD_EXPIRATION_HOURS`. La configuracion inicial usa partes de 16 MiB, margen Multer de 2 MiB y cinco intentos recuperables. El protocolo, checksums, reanudacion y limites Nginx se detallan en `docs/RESUMABLE_UPLOADS.md` y `docs/UPLOAD_ARCHITECTURE.md`.

## Procesamiento HLS

Con `ENABLE_HLS=true`, cada MP4 o MKV local validado pasa a Redis/BullMQ y un worker FFmpeg independiente genera calidades adaptativas, `master.m3u8`, segmentos, subtitulos de texto y miniatura. El panel `/admin/processing` muestra etapa, progreso, codecs y calidades; permite cancelar, reintentar y asociar un resultado recuperado a pelicula o episodio. Los borradores no se publican automaticamente.

El valor recomendado inicial es `VIDEO_WORKER_CONCURRENCY=1`. El original solo se elimina despues de validar y asociar la salida. Configuracion, recursos, retencion, codecs y diagnostico: `docs/VIDEO_PROCESSING.md` y `docs/MKV_HLS.md`.

## Auditoria

El panel `/admin/audit` permite filtrar eventos, revisar valores anteriores/nuevos, exportar CSV y aplicar la retencion configurada con `AUDIT_RETENTION_DAYS`. Consulta `docs/AUDIT.md` para eventos cubiertos y reglas de ocultamiento de secretos.

## PWA y accesibilidad

La aplicacion puede instalarse desde navegadores compatibles. Incluye rutas con carga diferida, modo offline del shell, pantalla de mantenimiento, navegacion por teclado/control remoto y foco visible. La cache nunca incluye API ni videos privados. Consulta `docs/UX_PWA.md`.

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
ENV_FILE=.env sh scripts/backup.sh
sh scripts/restore.sh --validate-only backups/masmax-AAAAMMDD-HHMMSS.tar.gz
ENV_FILE=.env sh scripts/restore.sh --yes backups/masmax-AAAAMMDD-HHMMSS.tar.gz
```

Un respaldo no se considera válido hasta probar su restauración en un entorno aislado. Conserva también el archivo `.sha256`. Consulta `docs/BACKUP.md`, `docs/RESTORE.md` y `docs/DISASTER_RECOVERY.md`.

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
