# Arquitectura de subidas reanudables

## Decision

MasMax usa multipart propio sobre HTTP en lugar de TUS. TUS es una opcion madura, pero introducirlo aqui exigiria otro servidor o middleware, otro protocolo de metadatos y una integracion paralela con la validacion MP4, Prisma y `MediaFile`. El protocolo propio reutiliza NestJS, Multer, JWT, los limites actuales y `MediaValidationService` sin cargar el video completo en RAM.

La decision no impide migrar a TUS mas adelante: la sesion persistente y el almacenamiento final estan aislados del formulario de episodios y peliculas.

## Flujo

Todas las rutas requieren JWT y rol `ADMIN`.

1. `POST /api/admin/uploads/resumable` crea una sesion con nombre, MIME y tamano total.
2. El backend responde `id`, `chunkSize`, `totalChunks`, partes confirmadas y vencimiento.
3. `POST /api/admin/uploads/resumable/:id/parts` recibe una parte en el campo multipart `file`, mas `index` y checksum SHA-256.
4. Cada parte se escribe primero en disco temporal, se valida por tamano y checksum y se mueve a `uploads/tmp/resumable/:id`.
5. `POST /api/admin/uploads/resumable/:id/complete` ensambla por streaming, verifica tamano y checksum final y ejecuta la misma validacion MP4/FFprobe de una subida normal.
6. `DELETE /api/admin/uploads/resumable/:id` cancela y elimina temporales.

`GET /api/admin/uploads/resumable` lista sesiones activas del administrador y `GET /api/admin/uploads/resumable/:id` recupera su estado. Los reintentos de una parte son idempotentes: su indice reemplaza la copia temporal y no duplica progreso.

## Cliente

El navegador corta el `File` con `Blob.slice`, calcula SHA-256 de una sola parte y la envia. Nunca mantiene el video entero en memoria. Muestra porcentaje, velocidad y tiempo restante; permite pausar, continuar y cancelar. Reintenta solo errores recuperables hasta el limite configurado, con espera exponencial y jitter.

Tras recargar la pagina, el navegador no permite recuperar automaticamente un archivo local por seguridad. El panel muestra la sesion pendiente; el administrador vuelve a seleccionar el mismo archivo (nombre, tamano, MIME y ultima modificacion) y solo se envian las partes faltantes.

## Persistencia y almacenamiento

La sesion vive en PostgreSQL (`ResumableUpload`) y las partes temporales en el volumen persistente `./uploads:/app/uploads`. El objeto final pasa por `MediaValidationService`, que usa la abstraccion configurada con `STORAGE_DRIVER=local|s3`. En S3 no se guardan partes incompletas: solo el MP4 ya ensamblado y validado se transfiere al bucket.

Las sesiones inactivas vencen y se limpian al iniciar el backend o al operar sobre subidas. La cancelacion tambien elimina inmediatamente todas las partes. Respaldar videos finales no requiere respaldar `uploads/tmp`.

## Configuracion

- `MAX_VIDEO_UPLOAD_MB=2048`: limite total del MP4.
- `RESUMABLE_CHUNK_SIZE_MB=16`: parte para sesiones nuevas, entre 1 y 64 MiB.
- `RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB=2`: margen de Multer sobre el chunk.
- `RESUMABLE_UPLOAD_MAX_RETRIES=5`: intentos maximos por parte recuperable.
- `RESUMABLE_UPLOAD_EXPIRATION_HOURS=24`: vida de una sesion inacabada.
- `UPLOAD_DIR=/app/uploads`: raiz local y temporal.

Dimensiona el disco temporal para alojar al menos el archivo incompleto y una segunda copia durante el ensamblado. Nginx permite 64 MiB en la ruta reanudable y reserva 2048M exclusivamente para la ruta de video directo.

## Seguridad e integridad

- Solo se aceptan nombres `.mp4`, MIME compatibles y el limite configurado.
- Los identificadores de sesion se validan antes de construir rutas.
- Cada sesion pertenece al usuario autenticado y no puede consultarse ni modificarse desde otra cuenta.
- Cada parte y el archivo final se verifican con SHA-256.
- La validacion final inspecciona firma MP4, codecs y resolucion mediante FFprobe antes de publicar el objeto.
