# Subidas reanudables de videos

MasMax divide los MP4 y MKV locales en fragmentos. El navegador mantiene en memoria solo el fragmento que calcula y envia; el backend lo escribe en disco, comprueba SHA-256 y registra el progreso en PostgreSQL.

## Configuracion

```dotenv
MAX_VIDEO_UPLOAD_MB=2048
RESUMABLE_CHUNK_SIZE_MB=16
RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB=2
RESUMABLE_UPLOAD_MAX_RETRIES=5
RESUMABLE_UPLOAD_EXPIRATION_HOURS=24
```

- `MAX_VIDEO_UPLOAD_MB`: limite del archivo completo, validado al crear la sesion.
- `RESUMABLE_CHUNK_SIZE_MB`: tamano para sesiones nuevas, entre 1 y 64 MiB.
- `RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB`: margen de Multer; debe ser al menos 1 MiB.
- `RESUMABLE_UPLOAD_MAX_RETRIES`: intentos por fragmento para red, 408, 429 y errores 5xx recuperables.
- `RESUMABLE_UPLOAD_EXPIRATION_HOURS`: tiempo de vida de una carga incompleta.

Con la configuracion recomendada, una sesion nueva usa chunks de 16 MiB, Multer admite hasta 18 MiB por archivo de parte y Nginx permite 64 MiB en la ruta reanudable. Las sesiones antiguas conservan el `chunkSize` persistido, por ejemplo 8 MiB.

## Reanudacion, pausa y cancelacion

La sesion guarda nombre, tamano, MIME, ultima modificacion, partes confirmadas y checksum opcional. Tras recargar, selecciona otra vez el mismo archivo; el panel verifica su identidad y omite las partes ya confirmadas. El navegador no puede recuperar automaticamente la referencia al archivo local.

Pausar aborta la peticion o espera pendiente. Cancelar tambien informa al backend y elimina las partes temporales. Una parte repetida se acepta sin duplicarla solo cuando tamano y SHA-256 coinciden; una diferencia devuelve conflicto.

## Despues de completar la subida

Completar una sesion crea o recupera un `VideoProcessingJob` persistente y devuelve su ID junto con `mediaId`. Ese ID, y no el objeto `File`, es la referencia que usa el formulario de episodios. El administrador puede guardar el episodio mientras el job esta en cola o procesando.

Si se abandona un formulario nuevo antes de guardar, el job permanece sin destino y aparece en `Usar archivo cargado`. Al recargar no hace falta volver a seleccionar el archivo para estados `QUEUED`, `PROCESSING` o `COMPLETED`; solo una sesion `INITIATED` o `UPLOADING` necesita el archivo local para continuar sus fragmentos.

Al guardar, el backend comprueba que el job pertenece al usuario autenticado y que no fue asignado a otro contenido. Los estados `FAILED` y `CANCELLED` permanecen disponibles en el panel de procesamiento para diagnostico o reintento, pero no se pueden vincular directamente.

## Integridad y memoria

Cada parte se escribe en `uploads/tmp/resumable/<uploadId>` y se procesa mediante streams. Al finalizar se comprueban todas las partes, sus tamanos, el tamano ensamblado, el checksum final cuando se proporciona y la identidad multimedia con FFprobe. Los temporales solo se limpian tras completar correctamente o cancelar.

## Nginx

`/api/admin/uploads/resumable` tiene `client_max_body_size 64M`; la subida directa `/api/admin/uploads/video` conserva 2048M. El limite global es 32M, por lo que no se abre toda la API a peticiones de varios GB.

## Verificacion

```bash
docker compose exec backend printenv | grep -E \
'MAX_VIDEO_UPLOAD_MB|RESUMABLE_CHUNK_SIZE_MB|RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB'
docker compose logs -f --tail=150 backend nginx
```

Para un archivo real cercano a 915 MB, confirma que supera 1.7 %, completa al 100 %, reanuda sin reenviar partes confirmadas tras una interrupcion, conserva el tamano/checksum final y crea el trabajo de procesamiento. No incorpores el video de prueba al repositorio.
