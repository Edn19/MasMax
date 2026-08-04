# Plan de correccion para subidas MKV

## Causa raiz

El navegador del archivo reportado envia `video/matroska`. MasMax ya admite `.mkv`, `video/x-matroska`, `application/x-matroska`, `application/octet-stream` y MIME vacio, pero omite `video/matroska` en el selector frontend, el DTO reanudable, la validacion compartida y el filtro Multer directo. Por ello la carga se rechaza antes de escribir o analizar el archivo.

## Validacion actual

- Extensiones permitidas: `.mp4` y `.mkv`.
- MIME actuales: `video/mp4`, `application/mp4`, `video/x-matroska`, `application/x-matroska`, `application/octet-stream` y vacio.
- La subida directa combina extension y MIME en Multer.
- La subida reanudable valida identidad al crear la sesion y guarda el MIME original.
- El frontend corta cada parte con `file.slice(start, end, file.type || 'application/octet-stream')`; no fuerza `video/mp4`.
- Al terminar, `MediaValidationService` exige firma `ftyp` para MP4 o EBML para MKV y ejecuta `ffprobe`.
- `ffprobe` debe confirmar contenedor MP4/Matroska, stream de video, duracion, codec y resolucion antes de registrar y encolar.

## Cambios

- Centralizar en backend las extensiones y MIME permitidos, incluyendo `video/matroska`.
- Reutilizar esa politica en Multer, DTO y `validateUploadIdentity`.
- Centralizar la politica equivalente del navegador y ampliar `accept`.
- Mantener `application/octet-stream` y MIME vacio solo como validacion preliminar: firma y `ffprobe` siguen siendo obligatorios.
- Normalizar errores de MIME, archivo falso y fallo de analisis sin exponer salida de procesos.
- Conservar el MIME del archivo en todos los chunks.
- Mantener MKV privado y convertirlo mediante el worker existente a HLS H.264/AAC cuando sea necesario.

## Archivos a modificar

- `apps/backend/src/video-processing/media-probe.ts` y pruebas.
- `apps/backend/src/uploads/uploads.controller.ts`.
- `apps/backend/src/uploads/resumable-upload.dto.ts` y pruebas del flujo.
- `apps/frontend/src/lib/video-upload-policy.ts` y pruebas.
- `apps/frontend/src/lib/resumable-upload.ts` y pruebas.
- `docs/MKV_HLS.md`, `docs/VIDEO_PROCESSING.md`, `README.md` y `.env.example` si requiere aclaracion operativa.

## Riesgos

- MIME y extension pueden falsificarse; nunca sustituyen firma ni `ffprobe`.
- En volumenes bind de Docker Desktop, el worker puede recibir el job antes de observar el archivo movido por el backend; debe esperar su disponibilidad local de forma acotada.
- El almacenamiento local copia al destino final antes de eliminar el temporal para que backend y worker observen el mismo archivo en bind mounts de Docker Desktop.
- Matroska puede contener codecs, adjuntos o subtitulos no convertibles; el worker conserva su politica de transcodificacion segura.
- Algunos navegadores envian MIME vacio u `application/octet-stream`; se mantienen por compatibilidad, sujetos a validacion definitiva.
- FFmpeg puede requerir transcodificacion costosa para HEVC, DTS u otros codecs incompatibles con HLS web.

## Pruebas necesarias

- Aceptar `.mkv` con `video/matroska`, `video/x-matroska`, `application/x-matroska` y `application/octet-stream`.
- Mantener MP4 con `video/mp4` y `application/mp4`.
- Rechazar extension distinta aunque use MIME permitido.
- Rechazar MIME distinto aunque use `.mkv`.
- Rechazar MKV falso, corrupto, sin video o con contenedor diferente tras firma/`ffprobe`.
- Confirmar que el chunk conserva `video/matroska` y no fuerza MP4.
- Subir un MKV real por el endpoint reanudable y verificar que se encola y genera HLS.
- Verificar FFmpeg/ffprobe Matroska, lint, typecheck, tests, build y Docker.

## Criterios de aceptacion

- `video/matroska` atraviesa selector, DTO y validacion inicial.
- Solo `.mp4` y `.mkv` con MIME conocidos pueden iniciar.
- `application/octet-stream` no evita firma ni `ffprobe`.
- MP4 y cargas grandes reanudables siguen funcionando.
- MKV nunca se sirve directamente y se procesa en el worker HLS existente.
- Errores para tipo incompatible, archivo falso y archivo corrupto son claros.
- Autenticacion, permisos, limites, checksums y streaming a disco permanecen activos.
- Lint, typecheck, pruebas, build, Prisma y Docker pasan.
