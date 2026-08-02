# Pipeline multimedia

Flujo implementado: Multer escribe en `uploads/tmp` sin cargar el archivo en memoria; se valida extensión/MIME preliminar, firma `ftyp`, metadatos con `ffprobe`, resolución máxima 1080p y SHA-256; luego se mueve a `uploads/videos` y se registra `MediaFile READY`. Un fallo elimina el temporal.

Reproducción local: autorización JWT -> URL HMAC corta -> validación de sesión/firma/expiración -> `X-Accel-Redirect` -> Nginx internal con HTTP Range.

El reproductor soporta MP4, HLS externo con hls.js, Google Drive y embeds permitidos. Pendiente: worker BullMQ/Redis, transcodificación HLS adaptativa 360/480/720/1080, miniaturas, preview, reintentos y progreso de procesamiento. Las variables HLS reservadas documentan la configuración futura, pero no activan un worker inexistente.
