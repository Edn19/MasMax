# Plan de implementacion MKV a HLS

## Alcance

Extender el pipeline existente para aceptar MP4 y Matroska como entradas administrativas, validarlos con ffprobe y convertirlos en el worker BullMQ a HLS reproducible. Los originales no se exponen por Nginx y el reproductor sigue consumiendo HLS mediante la autorizacion existente.

## Flujo actual

1. `UploadField` acepta solo MP4 y usa la subida reanudable por bloques.
2. `UploadsController` protege todos los endpoints con JWT y rol ADMIN. La subida directa usa Multer en disco; la reanudable ensambla los bloques sin cargar el archivo completo en memoria.
3. `MediaValidationService` comprueba la firma `ftyp`, ejecuta ffprobe, exige video y un maximo de 1080p, calcula SHA-256 y guarda el original en `videos/` mediante `ObjectStorageService`.
4. `VideoProcessingService` crea un `VideoProcessingJob`, cambia el `MediaFile` a `QUEUED` y publica el identificador en BullMQ/Redis.
5. El worker separado descarga el original cuando se usa S3, genera variantes HLS por altura con FFmpeg, crea miniatura y `master.m3u8`, sube los resultados y marca el trabajo `COMPLETED`.
6. La pantalla administrativa consulta trabajos y salud cada tres segundos; permite cancelar y reintentar.
7. Los formularios de episodio y pelicula reciben la URL resultante mientras permanecen abiertos. El trabajo no conserva actualmente un destino persistente ni realiza la asociacion por si mismo.
8. `VideoPlayer` ya reproduce HLS con HLS.js y Safari nativo. `MediaService` firma el acceso a playlists y segmentos.

## Formatos y validaciones actuales

- Entrada: `.mp4` con MIME `video/mp4`, `application/mp4`, `application/octet-stream` o vacio.
- Validacion inicial: extension y MIME; validacion definitiva: firma MP4, ffprobe, stream de video, duracion implicita y altura maxima.
- Metadatos guardados: dimensiones, duracion, bitrate, codec principal de video y audio.
- Limitaciones: no acepta MKV, no registra FPS, pixel format, perfil, pistas/idiomas ni subtitulos; no valida explicitamente duracion finita, cantidad de streams o contenedor reportado.

## Worker y salida actuales

- Cola `video-processing` en BullMQ con payload `{ processingJobId }`.
- Concurrencia limitada entre 1 y 4 y heartbeat en Redis.
- Siempre usa `libx264`, `yuv420p`, AAC estereo y perfiles no superiores a la fuente.
- Genera `hls/{jobId}/{height}/index.m3u8`, segmentos TS, `master.m3u8` y una miniatura.
- La cancelacion solicita SIGTERM y limpia el directorio temporal.
- El original solo se elimina despues de crear y registrar la salida HLS, aunque falta condicionar la eliminacion a una asociacion persistente.

## Almacenamiento y seguridad

- Local y S3 comparten la abstraccion `ObjectStorageService`.
- Nginx solo publica imagenes. `/uploads/videos/` y `/uploads/hls/` devuelven 404; el contenido se entrega por rutas protegidas internas o endpoints firmados.
- Las claves de almacenamiento se normalizan y las rutas locales se resuelven dentro de la raiz configurada.
- Backend, worker y Redis no exponen puertos publicos; los endpoints de subida y procesamiento requieren ADMIN.

## Cambios previstos

### Backend y worker

- Generalizar la validacion a MP4/MKV, comprobar extension, MIME, firma EBML/MP4, contenedor ffprobe, duracion finita, streams y limites.
- Introducir tipos estrictos para los metadatos ffprobe y una politica testeable de copia/transcodificacion.
- Guardar codecs, pistas de audio y subtitulos detectados en el trabajo.
- Usar extension real y nombres internos seguros al almacenar originales.
- Permitir encolar MP4 o MKV, limitar reintentos y aceptar destino, conservacion del original y publicacion controlada.
- Generar perfiles hasta la resolucion fuente. Copiar H.264 compatible solo para el perfil fuente sin escalado; transcodificar variantes escaladas o video incompatible a H.264/yuv420p. Copiar AAC cuando sea seguro y convertir el resto a AAC.
- Validar playlists, segmentos, duracion y lectura de `master.m3u8` antes de completar.
- Extraer subtitulos de texto compatibles a WebVTT; registrar pistas de imagen sin publicarlas.
- Asociar atomicamente el master HLS a episodio o pelicula cuando el trabajo tenga destino. Mantener el estado de publicacion previo.
- Verificar espacio libre antes de procesar y conservar el original ante fallo, cancelacion o asociacion fallida.

### Frontend

- Aceptar `.mp4,.mkv,video/mp4,video/x-matroska` y MIME Matroska equivalentes.
- Mantener la subida reanudable y etiquetar bloques sin forzar MIME MP4.
- Mostrar contenedor, codecs, etapa, audio, subtitulos, calidades, conservacion, destino, cancelacion y reintento.
- Enviar destino y politica al iniciar la carga cuando el formulario conozca pelicula o episodio; los trabajos siguen siendo recuperables desde la pantalla de procesamiento.
- No modificar la reproduccion HLS existente salvo tipos o mensajes necesarios.

### Prisma

- Ampliar `VideoProcessingJob` con destino opcional, etapa, formato/codecs fuente, metadatos JSON tipados en los limites de aplicacion, calidades generadas y asociacion final.
- Conservar los estados existentes para evitar una migracion destructiva.
- Crear una migracion SQL incremental; no usar `prisma db push`.

### Configuracion y Docker

- Mantener FFmpeg/ffprobe del paquete Alpine ya instalado en backend/worker.
- Incorporar variables `VIDEO_MAX_UPLOAD_SIZE_MB`, `VIDEO_WORKER_CONCURRENCY`, `VIDEO_KEEP_ORIGINAL_DEFAULT`, `FFMPEG_PRESET`, `FFMPEG_CRF`, `FFMPEG_AUDIO_BITRATE`, `FFMPEG_THREADS` y `HLS_SEGMENT_DURATION`, con compatibilidad para nombres anteriores.
- Verificar codecs H.264, AAC y demuxer Matroska durante las pruebas Docker.

## Archivos previstos

- `apps/backend/src/uploads/*`
- `apps/backend/src/video-processing/*`
- `apps/backend/prisma/schema.prisma` y una migracion nueva
- `apps/frontend/src/lib/resumable-upload.ts`
- `apps/frontend/src/admin/components/UploadField.tsx`
- `apps/frontend/src/admin/processing/VideoProcessingAdminPage.tsx`
- Formularios de episodios/peliculas solo para transmitir destino y politica
- `.env.example`, `docker-compose.yml`, `README.md`, `docs/VIDEO_PROCESSING.md`, `docs/MKV_HLS.md`

## Riesgos

- `-c:v copy` no sirve para variantes escaladas y puede producir segmentos con keyframes inadecuados; se limita al perfil fuente y la salida se valida.
- Matroska puede contener codecs, attachments o streams hostiles; ffprobe usa argumentos separados, limites y timeout.
- Varias pistas de audio elevan complejidad y espacio. La primera pista se publica inicialmente y todas se registran.
- PGS y otros subtitulos de imagen no se convierten automaticamente.
- Transcodificar HEVC/DTS consume CPU y disco; concurrencia e hilos quedan limitados y se valida espacio.
- S3 no informa espacio libre; se documenta la responsabilidad de cuotas del proveedor.

## Rollback

1. Desplegar el codigo anterior manteniendo la migracion: los campos nuevos son opcionales o tienen valores por defecto.
2. Desactivar nuevas cargas con `ENABLE_HLS=false` si la cola necesita detenerse.
3. Cancelar trabajos activos desde el panel; los originales se conservan.
4. Eliminar manualmente salidas `hls/{jobId}` fallidas despues de confirmar que no estan asociadas.
5. No revertir el enum ni borrar columnas durante una emergencia; una migracion posterior puede retirarlas tras verificar datos.

## Pruebas necesarias

- Unitarias: deteccion de formato, politica de codecs, perfiles, master playlist, validacion de nombres y MIME.
- Integracion con ffprobe/FFmpeg: MP4 H.264/AAC; MKV H.264/AAC; MKV H.264/DTS; MKV HEVC/AAC; MKV HEVC/DTS; falso, corrupto, sin video y sin audio.
- Worker: progreso con throttling, salida valida, cancelacion, limpieza, fallo, reintento y limite de intentos.
- Asociacion: pelicula, episodio y trabajo recuperado tras cerrar la pantalla.
- Seguridad: anonimo/USER rechazados, originales MKV no expuestos, rutas HLS protegidas.
- Regresion: reproduccion MP4 existente y HLS.js/Safari.
- Calidad: lint, typecheck, tests, build, Prisma validate, Docker config/build/up/health.

## Criterios de aceptacion

- MP4 y MKV reales se aceptan; falsos, corruptos, vacios o sin video se rechazan.
- ffprobe determina contenedor, streams y duracion; MIME y extension no son la unica confianza.
- HEVC/VP9/AV1 se convierten a H.264; DTS/AC3/EAC3/TrueHD se convierten a AAC.
- H.264/AAC compatibles pueden copiarse solo cuando la variante y segmentacion son seguras.
- No se crean calidades superiores a la fuente y el master referencia playlists no vacias y reproducibles.
- Progreso, etapa, error, pistas y calidades son recuperables desde base de datos.
- El resultado puede asociarse a pelicula o episodio sin publicar borradores.
- El original se elimina unicamente despues de salida valida y asociacion confirmada cuando existe destino.
- MKV nunca se sirve directamente y la proteccion HLS no se debilita.
- Todos los comandos de validacion solicitados terminan correctamente.
