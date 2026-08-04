# Procesamiento de video con FFmpeg

## Arquitectura

```text
API NestJS -> BullMQ -> Redis -> worker FFmpeg -> ObjectStorage -> PostgreSQL
```

La API valida y registra el MP4 o MKV antes de crear `VideoProcessingJob`. El worker es un contenedor independiente y procesa como maximo `VIDEO_WORKER_CONCURRENCY` trabajos simultaneos. PostgreSQL conserva estado, etapa, progreso, metadatos, destino, perfiles, errores y rutas resultantes; Redis solo transporta trabajos y latidos.

El contenido no recibe una URL utilizable mientras el trabajo esta `QUEUED` o `PROCESSING`. El formulario administrativo espera `COMPLETED` y entonces usa el `master.m3u8` y la miniatura generada. El backend tambien exige que el `MediaFile` local este `READY`, incluso si se intenta omitir el panel.

## Pipeline

1. Valida firma MP4/EBML, contenedor, resolucion, duracion y streams con ffprobe.
2. Registra el original y crea el job.
3. Selecciona solo perfiles configurados que no superen la altura de origen.
4. Copia H.264/AAC compatibles solo cuando es seguro; convierte el resto a H.264 `yuv420p` y AAC. Todos los argumentos usan arrays y `shell: false`.
5. Genera playlists VOD y segmentos MPEG-TS.
6. Extrae subtitulos de texto a WebVTT, crea `master.m3u8` y una miniatura JPEG.
7. Transfiere resultados mediante `ObjectStorageService`.
8. Registra el manifiesto y miniatura como `MediaFile READY`.
9. Asocia el resultado a pelicula/episodio sin cambiar su publicacion y conserva o elimina el original segun la politica administrativa.
10. Limpia siempre el directorio temporal.

La entrada acepta `.mp4` y `.mkv`. Matroska puede llegar como `video/matroska`, `video/x-matroska`, `application/x-matroska` o `application/octet-stream`; estas etiquetas son preliminares y nunca reemplazan la firma EBML ni la deteccion `matroska,webm` de ffprobe. Video incompatible se convierte a H.264 y audio incompatible a AAC. Los subtitulos de texto compatibles se extraen; los subtitulos graficos se registran pero no se convierten automaticamente.

Los perfiles estandar son 360p, 480p, 720p y 1080p. Una fuente 720p nunca genera 1080p. Para fuentes menores a 360p se conserva su altura par sin reescalarla hacia arriba.

## Configuracion

```env
ENABLE_HLS=true
REDIS_URL=redis://redis:6379
HLS_SEGMENT_SECONDS=6
HLS_PROFILES=360,480,720,1080
FFMPEG_CONCURRENCY=1
KEEP_ORIGINAL_VIDEO=true
VIDEO_MAX_UPLOAD_SIZE_MB=2048
VIDEO_WORKER_CONCURRENCY=1
VIDEO_KEEP_ORIGINAL_DEFAULT=true
VIDEO_MAX_RETRIES=3
FFMPEG_PRESET=veryfast
FFMPEG_CRF=21
FFMPEG_AUDIO_BITRATE=192k
FFMPEG_THREADS=2
HLS_SEGMENT_DURATION=6
```

Los nombres antiguos se conservan como fallback. `VIDEO_WORKER_CONCURRENCY` admite de 1 a 4. Aumentarlo sin medir CPU, memoria y E/S puede degradar toda la plataforma. El contenedor backend/worker instala FFmpeg y ffprobe mediante Alpine; para desarrollo sin Docker ambos binarios deben estar disponibles en `PATH`.

## Recursos recomendados

- Minimo por job 1080p: 2 vCPU, 2 GB de RAM y espacio temporal equivalente al MP4 mas las variantes.
- Recomendado para un job 1080p: 4 vCPU y 4 GB de RAM.
- Reserva al menos 3 veces el tamano del original mas 512 MB mientras se procesa.
- Usa `VIDEO_WORKER_CONCURRENCY=1` en servidores pequenos.
- Redis usa AOF y un volumen persistente, pero PostgreSQL es la fuente definitiva del estado visible.

## Cancelacion y reintentos

Una cancelacion en cola elimina el job de BullMQ. Durante FFmpeg se registra `cancelRequested`; el worker detecta la marca, envia `SIGTERM`, elimina temporales y devuelve el original a `READY`. Los jobs `FAILED` y `CANCELLED` pueden reintentarse mientras exista el original y no superen `VIDEO_MAX_RETRIES`.

El panel `/admin/processing` muestra estado, porcentaje, perfiles, intentos y salud. Endpoints:

- `GET /api/admin/video-processing`
- `GET /api/admin/video-processing/worker-health`
- `GET /api/admin/video-processing/:id`
- `POST /api/admin/video-processing/media/:mediaFileId`
- `POST /api/admin/video-processing/:id/retry`
- `POST /api/admin/video-processing/:id/associate`
- `PATCH /api/admin/video-processing/:id/settings`
- `DELETE /api/admin/video-processing/:id`

## Almacenamiento

Local guarda `hls/<jobId>/master.m3u8`, playlists y segmentos en el volumen `uploads`; Nginx asigna tipos MIME y cache privada. En S3, playlists y segmentos se solicitan por rutas estables de la API que redirigen a URLs temporales. El bucket S3 debe permitir CORS `GET` y `HEAD` desde el dominio de la plataforma.

La limpieza administrativa reconoce un manifiesto como un conjunto y borra todo el prefijo `hls/<jobId>` en disco o S3. Los originales MKV permanecen privados. Los temporales viven en `uploads/tmp/processing` y no forman parte del respaldo. Consulta `docs/MKV_HLS.md` para codecs, asociacion y limitaciones.

## Diagnostico

```bash
docker compose ps
docker compose logs -f worker
docker compose logs -f redis
docker compose restart nginx
docker compose exec worker ffmpeg -version
curl http://localhost:8088/api/health/ready
```

Readiness solo responde correctamente con HLS habilitado cuando PostgreSQL, almacenamiento, Redis y el latido del worker estan disponibles.
