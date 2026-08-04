# Entrada MKV y salida HLS

MasMax acepta `.mp4` y `.mkv` como archivos fuente administrativos. MKV es solamente un contenedor de entrada: nunca se entrega directamente al navegador. Todo archivo local pasa por ffprobe y por el worker FFmpeg antes de quedar disponible como HLS.

Los MIME preliminares de Matroska admitidos son `video/matroska`, `video/x-matroska`, `application/x-matroska` y `application/octet-stream`. Para MP4 se admiten `video/mp4`, `application/mp4` y el mismo fallback binario. Un MIME vacio se conserva por compatibilidad con navegadores que no identifican el archivo. En todos los casos tambien se exige extension `.mp4` o `.mkv`, archivo no vacio, firma correcta y contenedor confirmado por ffprobe.

## Flujo

```text
MP4/MKV -> carga reanudable -> firma + ffprobe -> BullMQ -> worker FFmpeg
        -> variantes HLS -> validacion -> asociacion -> reproduccion protegida
```

La validacion comprueba nombre seguro, extension, MIME, firma MP4/EBML, contenedor detectado, cantidad de streams, video, codec, audio, dimensiones, duracion y limite de tamano. `application/octet-stream` y MIME vacio solo superan la validacion cuando la firma y ffprobe confirman el formato real. Un `.mkv` falso se rechaza por firma; un Matroska truncado o corrupto se rechaza con un mensaje de analisis sin exponer la salida tecnica de ffprobe.

Los chunks reanudables conservan el MIME reportado por el archivo original. El navegador no convierte ni etiqueta los fragmentos MKV como `video/mp4`.

## Politica de codecs

- H.264 con perfil Baseline/Main/High, pixel format `yuv420p` y altura igual al perfil de salida puede copiarse. Si la variante resultante falla la validacion, se recodifica.
- HEVC, VP9, AV1 y perfiles/pixel formats incompatibles se convierten a H.264 `yuv420p`.
- AAC compatible puede copiarse. DTS, TrueHD, AC3, EAC3 y otros codecs se convierten a AAC.
- Se publica la primera pista de audio. Todas las pistas detectadas quedan registradas para futuras ampliaciones.
- Subtitulos SRT/SubRip, ASS/SSA, WebVTT y `mov_text` se convierten a WebVTT. PGS y otros subtitulos de imagen solo se registran.

Las calidades configuradas nunca superan la altura fuente. Una fuente 480p produce como maximo 360p/480p; una 720p produce 360p/480p/720p.

## Asociacion y publicacion

El trabajo persiste aunque se cierre el formulario. En `/admin/processing` se puede asociar un resultado terminado a una pelicula o episodio. La asociacion actualiza la URL y tipo HLS, duracion y miniatura, pero conserva el estado de publicacion anterior del contenido.

El original solo se elimina cuando la salida fue validada y el trabajo quedo asociado. Fallos, cancelaciones y resultados pendientes de asociacion siempre conservan el original.

## Configuracion

```env
VIDEO_MAX_UPLOAD_SIZE_MB=2048
VIDEO_MAX_SOURCE_HEIGHT=1080
VIDEO_WORKER_CONCURRENCY=1
VIDEO_KEEP_ORIGINAL_DEFAULT=true
VIDEO_MAX_RETRIES=3
FFMPEG_PRESET=veryfast
FFMPEG_CRF=21
FFMPEG_AUDIO_BITRATE=192k
FFMPEG_THREADS=2
HLS_SEGMENT_DURATION=6
HLS_PROFILES=360,480,720,1080
```

Usa concurrencia 1 y dos hilos por trabajo como punto de partida. Reserva al menos tres veces el tamano del original mas 512 MB. En almacenamiento S3, MasMax no puede consultar la cuota disponible y el operador debe monitorizarla.

## Cancelacion y reintento

Cancelar marca el trabajo, termina FFmpeg con SIGTERM, limpia temporales y conserva el original. Los trabajos `FAILED` y `CANCELLED` se pueden reintentar hasta `VIDEO_MAX_RETRIES`; el error legible queda en PostgreSQL.

## Limitaciones

- No se publica MKV directo ni se autoriza por `/api/media/stream`.
- Se publica una pista de audio principal; las adicionales se registran.
- PGS y otros subtitulos de imagen no se convierten.
- La copia H.264 depende de keyframes adecuados; ante una salida invalida se usa transcodificacion.
- El tiempo de proceso depende de codec, duracion, perfiles, CPU y almacenamiento.

## Diagnostico

```bash
docker compose logs -f worker
docker compose exec worker ffmpeg -version
docker compose exec worker ffprobe -version
docker compose exec worker ffmpeg -demuxers
docker compose ps
```

Busca el demuxer `matroska,webm`, encoder `libx264` y encoder `aac`. La salud de Redis y el latido del worker se muestran en `/admin/processing` y `/api/health/ready`.
