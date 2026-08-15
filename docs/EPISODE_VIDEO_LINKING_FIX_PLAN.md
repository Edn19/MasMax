# Plan de correccion: vinculacion de video al episodio

## Causa raiz confirmada

El flujo persistente termina la subida creando `ResumableUpload`, `MediaFile` y un
`VideoProcessingJob`, pero el formulario de episodios no conserva ni envia el
`VideoProcessingJob.id`. Para episodios nuevos `UploadField` no dispone de
`target.id`, por lo que el job queda con `targetType` y `targetId` nulos.

Al mismo tiempo, `CreateEpisodeDto`, `Episode.videoUrl` y la validacion del
frontend exigen una URL final. `EpisodesService.assertLocalReady` tambien rechaza
el original mientras su `MediaFile` esta procesandose. Por ello no se puede crear
el episodio con un job `QUEUED` o `PROCESSING`; la unica referencia del navegador
queda en estado React y se pierde al desmontar el formulario.

La auditoria de desarrollo encontro 9 cargas completadas, 10 jobs sin destino
(4 `COMPLETED` y 6 `FAILED`) y ningun job asociado. No se eliminaran ni alteraran
automaticamente esos registros.

## Flujo actual

1. La carga reanudable ensambla y valida MP4/MKV, crea un `MediaFile` y encola un
   `VideoProcessingJob` con `requestedById`.
2. En creacion, `UploadField` configura el job sin destino porque el episodio aun
   no tiene ID.
3. El formulario solo recibe `videoUrl` cuando HLS termina y exige esa URL para
   habilitar el guardado.
4. El worker solo actualiza contenido si encuentra `targetType` y `targetId`.
5. PostgreSQL conserva el job, pero la UI no ofrece seleccionarlo ni enlazarlo.

## Modelos y relaciones existentes

- `Episode`: pertenece a `Series` y `Season`; hoy `videoUrl` es obligatorio.
- `ResumableUpload`: pertenece a `User` y conserva estado y resultado JSON.
- `MediaFile`: representa original y salida HLS.
- `VideoProcessingJob`: pertenece a `User` mediante `requestedById`, referencia
  `inputMediaFileId`/`outputMediaFileId` y usa `targetType`/`targetId` como relacion
  polimorfica con `EPISODE` o `MOVIE`.
- La unicidad de episodio ya es correcta: `@@unique([seasonId, number])`.

No se creara otro modelo. `VideoProcessingJob.id` sera la referencia persistente
minima enviada como `processingJobId`; la relacion definitiva seguira almacenada
en `VideoProcessingJob.targetType = EPISODE` y `targetId = Episode.id`.

## Flujo propuesto

1. El administrador puede usar URL, subir un video, seleccionar un job propio no
   asignado o crear un borrador sin video.
2. La subida informa inmediatamente el `processingJobId`, sin esperar a FFmpeg.
3. `POST /api/admin/episodes` recibe opcionalmente `processingJobId` y al usuario
   autenticado.
4. Una transaccion serializable valida serie/temporada, numero, propietario,
   estado y disponibilidad del job; crea el episodio como borrador y asigna el
   job mediante `targetType/targetId`.
5. Un job `COMPLETED` aplica HLS, miniatura, duracion y subtitulos al crear.
6. Un job `QUEUED` o `PROCESSING` queda relacionado y el worker aplica HLS al
   finalizar, incluso si el navegador cambio de pagina.
7. La lista administrativa agrega el job relacionado al episodio. Un endpoint
   `GET /api/admin/video-processing/jobs/available` lista solo jobs elegibles del
   usuario autenticado y sin destino.
8. Los jobs `FAILED` o `CANCELLED` no se pueden vincular hasta un reintento
   explicito.

## Contrato minimo

- `processingJobId?: string` en crear/actualizar episodio.
- `videoUrl`, `videoSource` y `videoType` son opcionales cuando existe un job o el
  episodio se guarda como borrador.
- Solo se admite una fuente primaria: job o URL. Un borrador puede no tener ambas.
- Un episodio sin HLS listo siempre se guarda con `published = false`.

## Migracion

Se necesita una migracion aditiva que quite `NOT NULL` de `Episode.videoUrl`.
Esto permite representar correctamente un borrador sin video y un episodio cuyo
job aun procesa. No transforma ni elimina datos existentes. No se usara
`prisma db push` como sustituto.

## Archivos previstos

- `apps/backend/prisma/schema.prisma` y una migracion nueva.
- DTO, controller, service y pruebas de `apps/backend/src/episodes`.
- service/controller/processor y pruebas de `apps/backend/src/video-processing`.
- `UploadField`, formulario de episodios, estado/tipos y pruebas frontend.
- `docs/VIDEO_PROCESSING.md`, `docs/RESUMABLE_UPLOADS.md` y `README.md`.

## Integridad y seguridad

- Solo ADMIN autenticado puede acceder a los endpoints.
- El job debe tener `requestedById` igual al usuario que crea o modifica.
- Se aceptan `QUEUED`, `PROCESSING` y `COMPLETED`.
- Se rechazan `FAILED` y `CANCELLED` con mensajes claros.
- Un job con destino distinto nunca se reasigna.
- La asignacion usa `updateMany` condicionado a destino nulo para cerrar carreras.
- Serie, temporada, episodio y job se validan dentro de la transaccion.
- El worker vuelve a leer el destino despues de persistir la salida para cerrar la
  carrera entre finalizacion FFmpeg y vinculacion.

## Riesgos

- Carrera entre worker y creacion: se mitiga serializando la escritura del job y
  releyendo su destino despues de completar la salida.
- Publicacion sin video: backend fuerza borrador hasta que exista HLS listo.
- Reemplazo de video: el video actual se conserva mientras el nuevo job procesa;
  el worker lo sustituye solo al finalizar correctamente.
- Jobs historicos fallidos: seguiran visibles para diagnostico y reintento; nunca
  se borran automaticamente.

## Pruebas

- Creacion con job `QUEUED`, `PROCESSING` y `COMPLETED` propio.
- Borrador sin video y rechazo de publicacion sin salida lista.
- Rechazo de job inexistente, ajeno, fallido, cancelado o ya asignado.
- Rollback si no se puede reservar el job y unicidad por temporada.
- Finalizacion idempotente del worker y recuperacion del job por episodio.
- Selector de jobs disponibles, payload persistente y validacion del boton.
- Lint, typecheck, tests, build, Prisma, Docker y prueba funcional.

## Rollback

1. Revertir frontend y servicios; los jobs ya vinculados siguen siendo datos
   validos para el worker actual.
2. Mantener `Episode.videoUrl` nullable durante el rollback para no perder
   borradores. Restaurar `NOT NULL` solo despues de asignar URL o retirar de forma
   controlada todos los borradores sin video.
3. No borrar HLS, originales, jobs ni cargas durante el rollback.

## Criterios de aceptacion

- Se crea un episodio con job activo sin esperar a FFmpeg.
- La relacion sobrevive navegacion y recarga porque vive en PostgreSQL.
- Un job completado puede seleccionarse y aplica HLS inmediatamente.
- FFmpeg aplica HLS al episodio vinculado de forma idempotente.
- No hay doble asignacion ni acceso a jobs de otro usuario.
- Un borrador puede existir sin video; un episodio sin video listo no se publica.
- Los jobs no asignados se detectan administrativamente sin eliminarlos.
- Los errores son comprensibles y todas las validaciones finales pasan.
