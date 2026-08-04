# Pipeline multimedia

Flujo implementado: Multer escribe en `uploads/tmp` sin cargar el archivo en memoria; se valida extension/MIME preliminar, firma MP4 `ftyp` o Matroska EBML, contenedor y streams con `ffprobe`, resolucion maxima configurada y SHA-256; luego se registra el original y se envia a BullMQ.

Reproducción local: autorización JWT -> URL HMAC corta -> validación de sesión/firma/expiración -> `X-Accel-Redirect` -> Nginx internal con HTTP Range.

El worker independiente convierte MKV/MP4 a HLS adaptativo, segmentos, manifiesto maestro, subtitulos de texto y miniatura; informa etapa/progreso y admite cancelacion, reintento y asociacion recuperable. El reproductor soporta el HLS local generado, HLS externo, MP4, Google Drive y embeds permitidos. Consulta `docs/VIDEO_PROCESSING.md` y `docs/MKV_HLS.md`.
