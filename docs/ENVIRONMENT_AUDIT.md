# Auditoria de variables de entorno MasMax

Fecha: 2026-08-02

La tabla compara `.env.example`, codigo, Docker Compose, Dockerfiles y scripts. No contiene valores reales. `.env` esta ignorado por Git y no se encontro un secreto versionado en los archivos revisados.

Leyenda de documentacion: **Si** aparece en `.env.example`; **Parcial** requiere aclaracion operativa; **No** es una variable implicita de script/runtime. "Obligatoria" se refiere al despliegue correspondiente, no a todo modo de desarrollo.

| Variable | Se usa en | Documentada | Obligatoria | Riesgo |
| --- | --- | ---: | ---: | --- |
| `POSTGRES_USER` | PostgreSQL, Compose, scripts backup/restore | Si | Si en Docker | Medio: scripts esperan que este exportada en shell |
| `POSTGRES_PASSWORD` | PostgreSQL y Compose | Si | Si en Docker | Alto si se conserva un valor predecible; no exponer |
| `POSTGRES_DB` | PostgreSQL, Compose, scripts backup/restore | Si | Si en Docker | Medio: mismo problema de shell que user |
| `DATABASE_URL` | Prisma/backend/seed/migraciones | Si | Si | Alto: secreto de conexion; validacion obligatoria correcta |
| `JWT_SECRET` | Firma access JWT | Si | Si | Alto: secreto; longitud minima validada |
| `JWT_REFRESH_SECRET` | Firma refresh JWT | Si | Si | Alto: debe ser distinto del access secret |
| `JWT_ACCESS_EXPIRES_IN` | Auth/config/Compose | Si | No | Bajo: default razonable; documentar formato |
| `JWT_REFRESH_EXPIRES_IN` | Auth/config/Compose | Si | No | Medio: debe coincidir con cookie/retencion de sesion |
| `JWT_REFRESH_COOKIE_MAX_AGE_MS` | AuthController | Si | No | Medio: Compose no la propaga al backend |
| `MEDIA_SIGNING_SECRET` | Firma de URL/token de medios | Si | Si | Alto: secreto; HLS no usa la politica de forma uniforme |
| `MEDIA_URL_EXPIRES_SECONDS` | MediaService/Compose | Si | No | Medio: controla ventana de exposicion MP4 |
| `FRONTEND_URL` | CORS backend/Compose | Si | Si en produccion | Alto si se configura origen amplio/incorrecto |
| `APP_PUBLIC_URL` | URL absoluta de archivos/media | Si | Si fuera de localhost | Medio: URL erronea rompe enlaces o firma |
| `PORT` | main Nest | Si | No | Bajo: Compose fija 3000 interno |
| `NODE_ENV` | Nest/cookies/logging/Compose | Si | Si en produccion | Medio: condiciona seguridad de cookie y diagnostico |
| `COOKIE_SECURE` | Cookie refresh/Compose | Si | Si con HTTPS | Alto si queda false bajo HTTPS/produccion |
| `REGISTRATION_MODE` | Auth/config/Compose | Si | No | Medio: define alta abierta/invitacion/cerrada |
| `LOGIN_MAX_ATTEMPTS` | Auth/config/Compose | Si | No | Medio: limite por instancia si throttling/mecanismo no compartido |
| `LOGIN_LOCK_MINUTES` | Auth/config/Compose | Si | No | Medio: politica anti fuerza bruta |
| `RATE_LIMIT_TTL_SECONDS` | Throttler/Compose | Si | No | Medio: almacenamiento actual no distribuido |
| `RATE_LIMIT_MAX` | Throttler/Compose | Si | No | Medio: revisar por ruta y capacidad |
| `COMMENTS_REQUIRE_APPROVAL` | CommentsService/Compose | Si | No | Bajo: frontend no refleja correctamente el valor efectivo |
| `CONTINUE_WATCHING_MAX_PERCENT` | HistoryService/Compose | Si | No | Bajo: debe ser menor/coherente con completion |
| `MAX_PROFILES_PER_USER` | Profiles/config/Compose | Si | No | Bajo: capacidad de perfil incompleta |
| `AUTOPLAY_NEXT_EPISODE_SECONDS` | No se encontro consumidor | Si | No | Bajo: variable sin uso confirmada |
| `EMAIL_VERIFICATION_REQUIRED` | No se encontro politica efectiva | Si | No | Medio: aparenta activar una funcion inexistente |
| `EMAIL_VERIFICATION_EXPIRES_HOURS` | No se encontro consumidor | Si | No | Bajo: variable sin uso confirmada |
| `DEV_LOG_PASSWORD_RESET` | AuthService | Si | No | Alto si se habilita en produccion: token en logs |
| `SMTP_HOST` | No se encontro cliente SMTP | Si | No actualmente | Bajo: configuracion sin implementacion |
| `SMTP_PORT` | No se encontro cliente SMTP | Si | No actualmente | Bajo: configuracion sin implementacion |
| `SMTP_USER` | No se encontro cliente SMTP | Si | No actualmente | Medio: identificador sensible sin consumidor |
| `SMTP_PASSWORD` | No se encontro cliente SMTP | Si | No actualmente | Alto: secreto inutil hasta implementar correo |
| `SMTP_FROM` | No se encontro cliente SMTP | Si | No actualmente | Bajo: configuracion sin implementacion |
| `ADMIN_EMAIL` | Seeds de administrador | Si | Si al sembrar | Medio: dato operacional; no es secreto por si solo |
| `ADMIN_PASSWORD` | Seeds de administrador | Si | Si al sembrar | Alto: secreto; nunca registrar ni usar default en produccion |
| `ADMIN_NAME` | Seeds de administrador | Si | No | Bajo |
| `SEED_DEMO` | `prisma/seed.ts` | Si | No | Medio: evitar datos demo en produccion |
| `SITE_NAME` | Seed/config/Compose | Si | No | Bajo |
| `UPLOAD_DIR` | Uploads/subtitulos | Si | No | Medio: debe coincidir con volumen y ruta del contenedor |
| `STORAGE_DRIVER` | StorageModule/Compose | Si | Si | Medio: `local` o `s3`; validar valor |
| `LOCAL_STORAGE_PATH` | Adaptador local/Compose | Si | Si si local | Alto: debe apuntar al volumen persistente |
| `S3_ENDPOINT` | Adaptador S3/Compose | Si | Si si S3 custom | Medio: validar TLS/SSRF y red |
| `S3_REGION` | Adaptador S3/Compose | Si | Si si S3 | Bajo |
| `S3_BUCKET` | Adaptador S3/Compose | Si | Si si S3 | Medio: permisos y politica de bucket |
| `S3_ACCESS_KEY` | Adaptador S3/Compose | Si | Si si S3 | Alto: secreto, no exponer al frontend |
| `S3_SECRET_KEY` | Adaptador S3/Compose | Si | Si si S3 | Alto: secreto, rotacion/secret manager |
| `S3_FORCE_PATH_STYLE` | Adaptador S3/Compose | Si | No | Bajo: compatibilidad MinIO/S3 |
| `UPLOAD_MAX_MB` | Imagen/archivo generico y Compose | Si | No | Medio: coordinar con Nginx |
| `MAX_SUBTITLE_UPLOAD_KB` | SubtitlesController/Compose/frontend build | Si | No | Bajo: backend es autoridad; frontend solo UX |
| `PLAYBACK_COMPLETION_PERCENT` | HistoryService/Compose | Si | No | Bajo: coherencia con continue watching |
| `MAX_VIDEO_UPLOAD_MB` | Upload controller/filter/Compose/frontend build | Si | No | Alto operacional: 2048 MB exige disco/cuotas/proxy |
| `RESUMABLE_CHUNK_SIZE_MB` | Resumable controller/Compose/frontend | Si | No | Medio: memoria/latencia y compatibilidad cliente |
| `RESUMABLE_UPLOAD_EXPIRES_HOURS` | Resumable service/Compose | Si | No | Medio: temporales y limpieza |
| `ALLOWED_EMBED_DOMAINS` | Validacion backend/Compose/frontend build | Si | Si si embed | Alto: backend debe ser autoridad y lista restrictiva |
| `ENABLE_HLS` | Storage/video processing/Compose | Si | No | Medio: HLS requiere autorizacion corregida |
| `REDIS_URL` | BullMQ, worker health, Compose | Si | Si para worker | Alto operacional: cola y throttling futuro |
| `HLS_SEGMENT_SECONDS` | FFmpeg/video processing/Compose | Si | No | Bajo: afecta latencia/cantidad de archivos |
| `HLS_PROFILES` | FFmpeg/video processing/Compose | Si | No | Medio: afecta CPU, disco y compatibilidad |
| `FFMPEG_CONCURRENCY` | Worker/Compose | Si | No | Alto operacional: debe seguir capacidad del host |
| `KEEP_ORIGINAL_VIDEO` | Worker/storage/Compose | Si | No | Medio: afecta espacio y recuperacion |
| `ORPHAN_RETENTION_DAYS` | Storage cleanup/Compose | Si | No | Alto si es demasiado bajo o referencias fallan |
| `AUDIT_RETENTION_DAYS` | AuditService/Compose | Si | No | Medio: requisitos legales/forenses |
| `VITE_API_URL` | Cliente API frontend y Docker build | Si | Si al compilar | Bajo si `/api`; nunca incluir secretos VITE |
| `VITE_MAX_VIDEO_UPLOAD_MB` | UploadField | Si | No | Bajo: solo validacion UX; Compose la deriva del backend |
| `VITE_MAX_SUBTITLE_UPLOAD_KB` | SubtitlesAdminPage | Si | No | Bajo: solo validacion UX |
| `VITE_ALLOWED_EMBED_DOMAINS` | VideoPlayer | Si | No | Medio: es visible y no sustituye validacion backend |
| `BACKUP_DIR` | `scripts/backup.sh` | No | No | Bajo: default operativo; documentar |
| `ADMIN_ACCESS_TOKEN` | scripts/herramientas operativas si se usan | No | Solo para operacion asociada | Alto: secreto temporal; no persistir ni imprimir |

## Hallazgos de entorno

1. **Confirmado:** `JWT_REFRESH_COOKIE_MAX_AGE_MS` se consume en backend, pero no se incluye en el bloque environment del servicio Compose.
2. **Confirmado:** SMTP y verificacion de correo estan documentados sin una implementacion de entrega/politica activa.
3. **Confirmado:** `AUTOPLAY_NEXT_EPISODE_SECONDS` no tiene consumidor; el comportamiento esta en frontend sin esta configuracion central.
4. **Confirmado:** backup/restore esperan `POSTGRES_USER` y `POSTGRES_DB` en el shell; leer `.env` por Compose no las exporta al script invocado desde host.
5. **Confirmado:** variables `VITE_*` se incrustan en build y son publicas. Actualmente solo contienen configuracion no secreta; debe mantenerse esa regla.
6. **Positivo:** `DATABASE_URL`, secretos JWT y firma de media se validan como obligatorios/con longitud minima.
7. **Positivo:** no se encontraron valores secretos versionados; cualquier secreto local observado se omitio deliberadamente.

## Recomendaciones

- Definir un esquema unico de configuracion con tipo, obligatoriedad por modo, default y secreto/no secreto.
- Hacer que Compose propague todas las variables realmente configurables, o retirar del ejemplo las que no tienen efecto.
- Separar `.env.example` por secciones de core, local storage, S3, correo, worker, seed y frontend.
- Ejecutar en CI una prueba que compare variables conocidas del esquema con `.env.example` y Compose.
- Mover secretos de produccion a Docker secrets o al gestor de secretos de la plataforma.
- No permitir `DEV_LOG_PASSWORD_RESET=true` cuando `NODE_ENV=production`.
