# Auditoria integral del CRUD de episodios

Fecha de inicio: 2026-08-09

## Alcance y reglas de datos

- Modulo: `Panel administrativo -> Contenido -> Episodios`.
- Se auditan frontend, API NestJS, Prisma, PostgreSQL, Redis/BullMQ, uploads, FFmpeg, HLS y subtitulos.
- No se eliminan videos, HLS, uploads ni datos existentes durante la auditoria.
- Las pruebas destructivas se realizan solamente sobre fixtures creados para la auditoria y se limpian por las rutas normales del producto.
- No se usa `prisma db push`, migraciones destructivas ni `docker compose down -v`.

## Matriz funcional inicial

`PENDIENTE` significa que el contrato existe pero falta la comprobacion manual o de integracion. La matriz se actualizara con evidencia al finalizar.

| Funcion | Estado inicial | Evidencia o problema inicial |
|---|---|---|
| Listar episodios | OK | `GET /api/admin/episodes` devuelve items y total. |
| Buscar episodios | ERROR | No existe control de busqueda en `EpisodesAdminPage`. |
| Filtrar episodios | PARCIAL | Serie y temporada funcionan; falta filtro visible por publicacion/video. |
| Paginar episodios | ERROR | API acepta pagina/limite, pero la UI fija `limit=100` y no pagina. |
| Ver episodio | OK | El editor obtiene detalle con `GET /api/admin/episodes/:id`. |
| Crear episodio | PENDIENTE | Existe `POST /api/admin/episodes`; requiere prueba completa. |
| Crear borrador sin video | PENDIENTE | El formulario ofrece modo `NONE`. |
| Crear con URL de video | PENDIENTE | DTO y formulario aceptan URL externa. |
| Crear con processing job | PENDIENTE | Existe `processingJobId` persistente y reserva transaccional. |
| Editar episodio | OK | Editor responsivo validado previamente; se repetira la prueba integral. |
| Cambiar temporada | PENDIENTE | DTO acepta `seasonId`; falta prueba cruzada entre series. |
| Cambiar numero | OK | Estado string y actualizacion funcional. |
| Cambiar posicion | OK | Estado string y actualizacion funcional. |
| Editar titulo | OK | Input controlado por `form.title`. |
| Editar descripcion | OK | Textarea controlado por `form.description`. |
| Editar duracion | OK | Estado string; conversion al construir payload. |
| Editar fecha | OK | Formato `YYYY-MM-DD`, null seguro y serializacion ISO probada. |
| Publicar episodio | PARCIAL | Accion masiva y checkbox existen; falta accion individual en listado. |
| Despublicar episodio | PARCIAL | Accion masiva y checkbox existen; falta accion individual en listado. |
| Cambiar miniatura por URL | PENDIENTE | Campo existe; falta preview y prueba manual. |
| Subir miniatura | PENDIENTE | Upload JPG/PNG/WebP conectado; falta prueba de integracion. |
| Subir video MP4 | PENDIENTE | Upload reanudable y validacion existen; falta fixture E2E. |
| Subir video MKV | PENDIENTE | MIME Matroska y ffprobe existen; falta fixture E2E. |
| Relacionar video existente | PENDIENTE | Selector de jobs disponibles conectado. |
| Procesar HLS | PENDIENTE | BullMQ/worker/FFmpeg implementados; falta fixture E2E. |
| Recuperar procesamiento | PENDIENTE | Provider global y consulta de jobs implementados. |
| Cancelar procesamiento | PENDIENTE | Endpoint y accion de UploadField implementados. |
| Reintentar procesamiento | PENDIENTE | Endpoint y accion de UploadField implementados. |
| Navegar sin perder job | PENDIENTE | Provider global persiste fuera de la pagina. |
| Recargar y recuperar job | PENDIENTE | Job vive en PostgreSQL/Redis; falta prueba manual. |
| Relacionar subtitulos | PENDIENTE | CRUD separado por `episodeId`; no hay acceso contextual desde Episodios. |
| Configuracion avanzada | PENDIENTE | Marcadores existen y tienen validacion parcial. |
| Eliminar episodio | PARCIAL | Confirmacion y soft delete existen; falta contexto serie/temporada en dialogo. |
| Preservar multimedia al eliminar | PENDIENTE | Debe verificarse que jobs/archivos queden administrables. |

## Endpoints reales

| Metodo | Ruta | Funcion |
|---|---|---|
| GET | `/api/admin/episodes` | Listado paginado administrativo |
| GET | `/api/admin/episodes/:id` | Detalle para editar |
| GET | `/api/admin/seasons/:seasonId/episode-gaps` | Huecos de numeracion |
| POST | `/api/admin/episodes` | Crear episodio |
| POST | `/api/admin/episodes/bulk` | Crear lote |
| PATCH | `/api/admin/episodes/reorder` | Reordenar |
| PATCH | `/api/admin/episodes/publish` | Publicar/despublicar lote |
| POST | `/api/admin/episodes/copy-settings` | Copiar video/miniatura/duracion |
| POST | `/api/admin/episodes/import/preview` | Validar CSV |
| POST | `/api/admin/episodes/import/commit` | Importar CSV |
| PATCH | `/api/admin/episodes/:id` | Actualizar episodio |
| DELETE | `/api/admin/episodes/:id` | Soft delete del episodio |
| GET | `/api/admin/video-processing/jobs/available` | Jobs vinculables |
| POST | `/api/admin/video-processing/jobs/:id/cancel` | Cancelar job |
| POST | `/api/admin/video-processing/jobs/:id/retry` | Reintentar job |
| POST | `/api/admin/uploads/resumable` | Crear sesion reanudable |
| POST | `/api/admin/uploads/resumable/:id/parts` | Subir fragmento |
| POST | `/api/admin/uploads/resumable/:id/complete` | Ensamblar y procesar |
| DELETE | `/api/admin/uploads/resumable/:id` | Cancelar upload |
| GET/POST/PATCH/DELETE | `/api/admin/subtitles` | CRUD de subtitulos por episodio o pelicula |

## Mapa inicial de botones

| Boton | Handler | Endpoint | Estado inicial |
|---|---|---|---|
| Crear episodio | `createEpisode` / `submit` | `POST /admin/episodes` | Conectado |
| Editar | `edit` / `submit` | `GET/PATCH /admin/episodes/:id` | Conectado |
| Guardar cambios | `submit` | `PATCH /admin/episodes/:id` | Conectado |
| Cancelar | `reset` | Local, sin request | Conectado |
| Publicar seleccionados | `BulkEpisodeTools.run` | `PATCH /admin/episodes/publish` | Conectado |
| Despublicar seleccionados | `BulkEpisodeTools.run` | `PATCH /admin/episodes/publish` | Conectado |
| Eliminar | `removeEpisode` | `DELETE /admin/episodes/:id` | Conectado |
| Subir video | `UploadField` | Upload reanudable y processing | Conectado |
| Cancelar procesamiento | `cancelProcessing` | `POST /admin/video-processing/jobs/:id/cancel` | Conectado |
| Reintentar procesamiento | `retryProcessing` | `POST /admin/video-processing/jobs/:id/retry` | Conectado |

## Hallazgos preliminares

1. La UI no implementa busqueda ni paginacion aunque el endpoint devuelve `total`, `page` y `limit`.
2. El listado no presenta columnas de serie y temporada, ni una accion individual publicar/despublicar.
3. El dialogo de eliminacion no informa serie y temporada.
4. El formulario no tiene estado `saving`; Guardar puede pulsarse mas de una vez mientras el request esta activo.
5. La eliminacion tiene estado `deleting`, pero el boton de fila puede volver a abrir dialogos mientras otra accion esta pendiente.
6. El acceso a subtitulos existe en un modulo separado, pero el listado de episodios no ofrece acceso contextual al episodio seleccionado.
7. Se debe confirmar si el backend impide publicar jobs no completados desde el endpoint masivo.

## Prisma inicial

- `Episode` tiene FK a `Series` y `Season`.
- La unicidad correcta ya existe: `@@unique([seasonId, number])`.
- Hay indices por temporada/posicion, serie/publicacion y fecha.
- `deletedAt` implementa borrado logico.
- `SubtitleTrack.episodeId` usa `onDelete: Cascade`; como el episodio se elimina logicamente, los subtitulos no se borran en el flujo normal.
- `VideoProcessingJob.targetId` mantiene la asociacion persistente al contenido.

## Resultado final

Estado: **APROBADO**. El CRUD administrativo de episodios quedo operativo de extremo a extremo, con autorizacion ADMIN, validacion global, procesamiento persistente y eliminacion logica que conserva el material multimedia.

| Funcion | Antes | Despues | Comprobacion |
|---|---|---|---|
| Listar, buscar, filtrar y paginar | Parcial | OK | UI y API con busqueda, publicacion, video, pagina y limite. |
| Crear borrador sin video | Pendiente | OK | Creado, reabierto y eliminado desde la UI. |
| Crear y editar metadatos | Parcial | OK | Serie, temporada, numero, posicion, titulo, descripcion, duracion, fecha y marcadores persistieron. |
| Reutilizar numero eliminado | Error | OK | Un episodio eliminado logicamente ya no bloquea el numero visible. |
| Guardar/cancelar sin doble envio | Parcial | OK | Estados ocupados bloquean acciones duplicadas; Cancelar no envia PATCH. |
| Publicar/despublicar | Parcial | OK | Accion individual y masiva conectadas. |
| Miniatura URL/upload | Parcial | OK | Preview y flujo de upload conectados; validaciones existentes conservadas. |
| MP4/MKV, job y HLS | Pendiente | OK | Ambos formatos procesados; jobs COMPLETED y HLS READY. |
| Cancelar/reintentar job | Pendiente | OK | CANCELLED -> QUEUED -> COMPLETED, con `attempts=2`. |
| Navegar/recargar durante job | Pendiente | OK | La asociacion persistio y el estado final se recupero. |
| Subtitulos | Parcial | OK | Acceso contextual, alta, edicion, preview, default/forced y baja. |
| Reproduccion protegida | Pendiente | OK | Autorizacion JWT, manifiestos firmados y segmento con Range `206`. |
| Eliminar y conservar multimedia | Pendiente | OK | Job liberado; original, HLS y subtitulo permanecieron en disco. |
| Permisos | Pendiente | OK | Sin token: `401`; usuario USER: `403`; ADMIN: acceso completo. |

## Errores encontrados y correcciones

1. **Conflicto al recrear un numero eliminado.** `Episode` aplica `@@unique([seasonId, number])`, pero el soft delete dejaba el numero ocupado. Antes de crear, mover o eliminar se libera el numero archivado asignandole un numero negativo unico dentro de una transaccion.
2. **Eliminacion dejaba el job ligado a contenido invisible.** La baja ahora despublica, archiva el numero y pone en `null` las referencias `VideoProcessingJob.targetId/targetType`; no borra originales, HLS ni subtitulos.
3. **Listado incompleto.** Se agregaron busqueda, filtros por publicacion/video, paginacion real, contexto serie/temporada, estado de procesamiento y acciones individuales.
4. **Riesgo de doble envio.** Crear, guardar, publicar y eliminar exponen estado ocupado y deshabilitan acciones incompatibles.
5. **Fecha editada no llegaba al estado React en la prueba real.** El campo de fecha usa `onInput`; una prueba de regresion confirma el valor enviado.
6. **Reordenamiento por pagina podia sobrescribir posiciones globales.** La accion ahora intercambia las posiciones persistidas de los episodios implicados.
7. **Subtitulos perdian el episodio contextual.** La pagina respeta `episodeId` de la URL hasta terminar de cargar los destinos.
8. **Errores de validacion de filtros.** El DTO administrativo valida y transforma busqueda, paginacion, publicacion y estado de video.

No quedaron botones visibles sin handler ni endpoints muertos dentro del alcance. La reproduccion publica no expone `/uploads/hls` directamente: usa `/api/media/authorize` y URLs HLS firmadas de forma intencional.

## Archivos modificados por esta auditoria

- `apps/backend/src/episodes/dto.ts`
- `apps/backend/src/episodes/episodes.service.ts`
- `apps/backend/src/episodes/dto.spec.ts`
- `apps/backend/src/episodes/episode-editing.service.spec.ts`
- `apps/backend/src/episodes/episode-video-linking.service.spec.ts`
- `apps/frontend/package.json`
- `apps/frontend/src/admin/episodes/EpisodesAdminPage.tsx`
- `apps/frontend/src/admin/episodes/BulkEpisodeTools.tsx`
- `apps/frontend/src/admin/episodes/episode-editor.spec.ts`
- `apps/frontend/src/admin/episodes/episode-list.ts`
- `apps/frontend/src/admin/episodes/episode-list.spec.ts`
- `apps/frontend/src/admin/subtitles/SubtitlesAdminPage.tsx`
- `docs/EPISODES_CRUD_AUDIT.md`

## Prisma y seguridad

- El esquema ya tenia la relacion `Episode -> Series/Season`, indices y unicidad correctos; no fue necesaria una migracion ni `db push` destructivo.
- `prisma format`, `prisma validate`, `prisma generate` y `prisma migrate status` finalizaron correctamente; las 18 migraciones estan aplicadas.
- El `ValidationPipe` global mantiene `whitelist`, `forbidNonWhitelisted` y `transform` activos.
- Los endpoints administrativos permanecen protegidos por JWT y rol ADMIN.
- Busqueda, filtros y paginacion se ejecutan en PostgreSQL; no se carga el catalogo completo en memoria.

## Pruebas automaticas

- Backend: lint, typecheck y build correctos; **31 suites y 152 pruebas aprobadas**.
- Frontend: lint y build correctos; **62 pruebas aprobadas**.
- Docker: configuracion valida y builds de backend/frontend correctos.
- Prisma: cliente generado, esquema valido y base al dia.

## Pruebas manuales E2E

1. Login ADMIN, listado, busqueda, filtros y paginacion.
2. Alta de borrador sin video, edicion completa, reapertura y Cancelar sin persistir cambios.
3. Publicacion y despublicacion individual.
4. Upload multipart real de MP4 y MKV sinteticos; procesamiento FFmpeg y variantes HLS 360p/480p/720p.
5. Cancelacion y reintento real de un job; navegacion y recarga durante otro procesamiento.
6. Alta, edicion, preview y eliminacion de un VTT desde el acceso contextual.
7. Reproduccion en `/watch/:id`, selector de calidad, subtitulo y episodios relacionados.
8. Entrega firmada: autorizacion `200`, manifiesto `200` y Range de segmento `206`.
9. Eliminacion desde la UI y recreacion del mismo numero; archivos originales, HLS y subtitulos preservados.
10. Comprobacion de acceso `401` sin JWT y `403` con un usuario USER temporal.

Los fixtures de base de datos se limpiaron mediante el producto. Los archivos fuente sinteticos de diagnostico tambien se retiraron; los artefactos multimedia asociados a episodios eliminados se conservaron para validar la politica requerida.

## Riesgos residuales no bloqueantes

- Vite informa que el chunk del reproductor ronda 538 kB; conviene dividirlo en una optimizacion futura, pero no afecta el CRUD ni la ejecucion.
- La prueba E2E uso videos sinteticos pequenos para mantenerla reproducible. El limite de 2 GB y el perfil 1080p quedan cubiertos por configuracion y pruebas de contrato, no por una carga manual de 2 GB.
- Prisma muestra una advertencia de deteccion OpenSSL en la imagen Alpine usada para pruebas; la imagen productiva instala OpenSSL y funciona correctamente.

## Comandos principales ejecutados

```text
docker compose config --quiet
docker compose build
docker compose up -d --build
docker compose exec backend npx prisma format
docker compose exec backend npx prisma validate
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma migrate status
docker compose exec backend pnpm lint
docker compose exec backend pnpm typecheck
docker compose exec backend pnpm test
docker compose exec backend pnpm build
docker compose exec frontend pnpm lint
docker compose exec frontend pnpm test
docker compose exec frontend pnpm build
docker compose logs backend frontend worker nginx
```
