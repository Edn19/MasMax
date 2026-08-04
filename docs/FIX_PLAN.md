# Plan de correccion de auditoria MasMax

Fecha: 2026-08-02

## Alcance

Este plan cubre los hallazgos priorizados MMX-001, MMX-002, MMX-003, MMX-004, MMX-005, MMX-007, MMX-008, MMX-009, MMX-012, MMX-016, MMX-017, MMX-018, MMX-019 y MMX-022. No incluye funciones nuevas ajenas a la remediacion.

## Verificacion

| Hallazgo | Confirmado | Severidad | Archivos | Solucion | Pruebas |
| --- | ---: | --- | --- | --- | --- |
| MMX-001 | Si | Alto | controladores/servicios de series, episodios y peliculas; frontend | Guard JWT y DTO de catalogo sin URL de video | HTTP anonimo 401; USER publicado; ADMIN intacto |
| MMX-002 | Si | Alto | media/storage, Nginx, player | Token corto firmado para cada recurso HLS local; auth antes de URL S3 | manifiesto/segmento anonimo, expirado, manipulado y autorizado |
| MMX-003 | Si | Alto | series/episodes/media | Politica central de contenido publicable | padre eliminado/no publicado, temporada oculta, acceso ID/slug |
| MMX-004 | Si | Alto | package/lock, uploads | Actualizacion minima de Multer y limites multipart | permitidos, tamano, MIME, extension, cantidad y rol |
| MMX-005 | Si | Alto | scripts, README, docs | Config explicita, artefacto con checksums y restore validate-only/maintenance/rollback | shellcheck equivalente y validate-only sin datos reales |
| MMX-007 | Si | Medio | search/politica de publicacion | DTO tipado y filtros centrales | busqueda no devuelve borradores |
| MMX-008 | Si | Medio | movies service | Excluir `deletedAt != null` en admin por defecto | eliminar y recargar lista |
| MMX-009 | Si | Medio | WatchPage/comments | Usar respuesta real y mensaje segun estado | pendiente, aprobado y error |
| MMX-012 | Si | Medio | VideoPlayer/api | `keepalive`, cola local y reconciliacion monotona | pagehide, retry y no retroceso |
| MMX-016 | Si | Medio | health | Comprobar ffprobe una vez y cachear | multiples readiness, una sola deteccion |
| MMX-017 | Si | Medio | Prisma/settings | Clave singleton, consolidacion determinista y `upsert` | base vacia, duplicados y concurrencia |
| MMX-018 | Si | Medio | suites backend/frontend | Integracion prioritaria de auth, guards, catalogo, media y UI | unitarias, HTTP y smoke E2E aislado |
| MMX-019 | Si | Medio | GitHub Actions | PostgreSQL temporal, audit, migraciones, Docker y smoke | workflow sin `continue-on-error` critico |
| MMX-022 | Si | Bajo | env, Compose, scripts/docs | Inventario validable y retirar variables sin efecto | script de inventario en CI |

## Detalle por hallazgo

### MMX-001

- Estado: Confirmado por controladores sin `JwtAuthGuard` y respuestas anonimas HTTP 200.
- Riesgo: exposicion de catalogo privado y URL permanentes.
- Solucion propuesta: guard JWT en catalogo, recomendaciones, detalles y busqueda; serializador de catalogo que omita `videoUrl`, `originalVideoUrl` y `processedVideoUrl`.
- Cambio API: respuestas de catalogo dejan de incluir campos de reproduccion; anonimo pasa de 200 a 401.
- Cambio Prisma: ninguno.
- Pruebas: matriz anonimo/USER/ADMIN y ausencia de claves sensibles.
- Rollback: revertir guard/serializador conjuntamente; no afecta datos.

### MMX-002

- Estado: Confirmado por alias Nginx y rutas storage HLS sin guard.
- Riesgo: acceso directo a playlists y segmentos.
- Solucion propuesta: ampliar las firmas existentes a claves HLS delimitadas por job, validar sesion/expiracion/firma y entregar local con `X-Accel-Redirect`; storage S3 solo emite URL temporal tras validar token. Retirar alias HLS publico.
- Cambio API: HLS autorizado usa `/api/media/hls`; rutas directas dejan de funcionar.
- Cambio Prisma: ninguno; la relacion entre job y contenido se valida a partir del URL persistido.
- Pruebas: anonimo, autorizado, expirado, path manipulado y segmento ajeno.
- Rollback: restaurar rutas previas temporalmente solo en entorno aislado; no migrar URL almacenadas.

### MMX-003 y MMX-007

- Estado: Confirmado por filtros parciales en episodes/search/media.
- Riesgo: borradores y contenido con padre oculto siguen visibles.
- Solucion propuesta: utilidades Prisma `publishedSeriesWhere`, `publishedEpisodeWhere`, `publishedMovieWhere`, aplicadas en catalogo, detalles, busqueda, recomendaciones y media.
- Cambio API: contenido oculto responde 404/no aparece.
- Cambio Prisma: ninguno.
- Pruebas: combinaciones de estado y soft delete.
- Rollback: revertir utilidades y consumidores; sin datos afectados.

### MMX-008 y MMX-009

- Estado: Confirmados.
- Riesgo: panel incoherente y feedback falso de moderacion.
- Solucion propuesta: filtro de eliminadas en `listAdmin`; frontend usa comentario retornado y solo inserta aprobado.
- Cambio API: ninguno.
- Cambio Prisma: ninguno.
- Pruebas: recarga post-delete y estados de comentario.
- Rollback: revertir cambios de servicio/UI.

### MMX-004

- Estado: Confirmado por `npm audit --omit=dev` con Multer 2.0.2.
- Riesgo: denegacion de servicio multipart.
- Solucion propuesta: version parche compatible mas reciente de la linea 2, lockfile reproducible, `files:1`, campos/parts limitados, tamano y filtros por MIME+extension.
- Cambio API: solicitudes multipart abusivas reciben 400/413.
- Cambio Prisma: ninguno.
- Pruebas: filtros y limites; HTTP si el arnes lo permite.
- Rollback: restaurar package/lock manteniendo limites de aplicacion.

### MMX-005

- Estado: Confirmado por scripts que dependen del entorno del shell y restauran en vivo.
- Riesgo: backup parcial o restauracion inconsistente.
- Solucion propuesta: helper de entorno, staging atomico, manifiesto/checksum, confirmacion, validate-only, mantenimiento y rollback de uploads.
- Cambio API: ninguno.
- Cambio Prisma: ninguno.
- Pruebas: validacion de argumentos/artefactos sin restaurar datos reales.
- Rollback: conservar backups previos; restore no elimina el artefacto de rollback.

### MMX-012 y MMX-016

- Estado: Confirmados.
- Riesgo: progreso perdido y healthcheck costoso.
- Solucion propuesta: keepalive con payload pequeno, progreso pendiente local/reconciliacion; cache de disponibilidad ffprobe inicializada una vez.
- Cambio API: ninguno.
- Cambio Prisma: ninguno.
- Pruebas: helpers de progreso y health cacheado.
- Rollback: mantener guardado periodico; volver a readiness previo solo si la deteccion inicial falla.

### MMX-017

- Estado: Confirmado por `findFirst` + `create` sin restriccion.
- Riesgo: multiples configuraciones y lecturas no deterministas.
- Solucion propuesta: campo `key` unico con valor `default`, migracion SQL que elige fila mas reciente como canonica, elimina duplicadas tras documentarlas en auditoria y servicio con `upsert`.
- Cambio API: se agrega `key` a la entidad si no se omite en serializacion; no cambia rutas.
- Cambio Prisma: campo y restriccion unica, migracion segura para base vacia/existente.
- Pruebas: `upsert`, actualizacion y concurrencia simulada.
- Rollback: copia de filas en tabla temporal durante migracion; migracion descendente manual documentada.

### MMX-018, MMX-019 y MMX-022

- Estado: Confirmados por inventario de specs, workflow y variables.
- Riesgo: regresiones no detectadas y configuracion sin efecto.
- Solucion propuesta: pruebas focalizadas, CI con PostgreSQL/migrate/audit/Docker/smoke y validador de inventario env; propagar cookie refresh y retirar variables no implementadas del ejemplo activo.
- Cambio API: solo asserts de seguridad.
- Cambio Prisma: CI ejecuta `migrate deploy` en DB temporal.
- Pruebas: script env, workflow y suite completa.
- Rollback: jobs CI pueden revertirse independientemente; conservar documentacion de excepciones.

## Orden de implementacion

1. Pruebas base que reproducen MMX-001, MMX-002, MMX-003 y MMX-007.
2. Guard JWT y DTO seguro de catalogo.
3. Autorizacion HLS local/S3 y Nginx internal.
4. Politica central de visibilidad y filtros admin.
5. Moderacion de comentarios.
6. Multer y limites multipart.
7. Backup/restore y runbooks.
8. Progreso final y readiness cacheado.
9. Singleton SiteSetting y migracion.
10. Inventario de entorno, pruebas adicionales y CI.
11. Validacion completa host/Docker y documentacion de remediacion.

## Estrategia global de rollback

- Aplicar cambios por grupos pequenos y mantener compatibilidad de lectura.
- Antes de migrar SiteSetting, realizar backup verificado y conservar tabla de respaldo hasta validar.
- No ejecutar restore contra datos reales durante esta tarea.
- Para media, desplegar backend y Nginx de forma coordinada; conservar ventana corta donde player acepte el nuevo URL antes de retirar el alias.
- Si una validacion falla, no marcar el hallazgo como corregido y documentar el bloqueo.

## Resultado de ejecucion

Fecha de cierre tecnico: 2026-08-03.

- Corregidos: MMX-001, MMX-002, MMX-003, MMX-004, MMX-005, MMX-007, MMX-008, MMX-009, MMX-012, MMX-016, MMX-017, MMX-019 y MMX-022.
- Parcial: MMX-018. La suite aumento a 66 pruebas, se agregaron casos de seguridad y se ejecuto smoke HTTP por rol, pero falta automatizar E2E destructivos de restore y uploads grandes.
- Migraciones: las 15 migraciones se aplicaron desde cero y la migracion singleton se probo tambien sobre una copia de la base existente.
- Runtime: seis servicios saludables, PostgreSQL solo interno, catalogo anonimo devuelve 401, USER obtiene catalogo sin URL sensibles y recibe 403 en admin.
- Dependencias: Multer 2.2.0; auditoria de produccion sin vulnerabilidades altas/criticas no exceptuadas. `picomatch` queda en allowlist temporal documentada hasta 2026-10-31.
- Rollback: no se ejecuto restore contra datos reales. Los scripts conservan dump y uploads previos antes de modificar datos y reinician servicios mediante `trap` si falla el proceso.
