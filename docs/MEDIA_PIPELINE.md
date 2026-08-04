# Pipeline multimedia

Flujo implementado: Multer escribe en `uploads/tmp` sin cargar el archivo en memoria; se valida extensión/MIME preliminar, firma `ftyp`, metadatos con `ffprobe`, resolución máxima 1080p y SHA-256; luego se registra el original y se envia a BullMQ.

Reproducción local: autorización JWT -> URL HMAC corta -> validación de sesión/firma/expiración -> `X-Accel-Redirect` -> Nginx internal con HTTP Range.

El worker independiente genera HLS adaptativo, segmentos, manifiesto maestro y miniatura; informa progreso y admite cancelacion y reintento. El reproductor soporta el HLS local generado, HLS externo, MP4, Google Drive y embeds permitidos. Consulta `docs/VIDEO_PROCESSING.md`.
