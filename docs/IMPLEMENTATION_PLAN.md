# Plan de implementacion

## Arquitectura actual

MasMax es un monorepo administrado con npm workspaces. `apps/frontend` contiene React 18, Vite, TailwindCSS y React Router; `apps/backend` contiene NestJS, Prisma y PostgreSQL. Nginx es el unico punto publicado por Docker Compose y entrega el frontend, proxifica `/api` y protege los videos locales mediante una ubicacion interna. Los archivos persistentes viven en `uploads`.

El backend esta organizado por modulos de dominio y aplica JWT, sesiones rotativas, RBAC administrativo, validacion global, rate limiting, auditoria y health checks. Prisma dispone de siete migraciones. GitHub Actions ejecuta instalacion, generacion de Prisma, lint, typecheck, pruebas, build y validacion del esquema.

## Funciones implementadas

- Autenticacion, refresh rotativo, revocacion de sesiones y proteccion administrativa.
- CRUD de peliculas, series, episodios, generos, usuarios, comentarios y configuracion.
- Favoritos, perfiles, listas, historial, progreso y continuar viendo.
- Carga MP4 e imagenes, validacion multimedia, inventario de archivos y URLs de video firmadas.
- Reproduccion MP4, HLS externo, Drive y embeds permitidos.
- Auditoria, errores uniformes, request ID, Docker multi-stage, health checks y respaldos basicos.

## Funciones incompletas

- El panel administrativo esta concentrado en `AdminPages.tsx` y carece de estados uniformes y confirmaciones seguras.
- No existe modelo de temporadas ni operaciones masivas/CSV de episodios.
- `SubtitleTrack` existe, pero faltan carga, conversion SRT, CRUD y conexion con el reproductor.
- Almacenamiento S3, subida reanudable y worker FFmpeg/HLS ya estan implementados; quedan pruebas E2E permanentes en CI y observabilidad historica del pipeline.
- Perfiles infantiles, PIN, SMTP, notificaciones, creditos, recomendaciones y analitica por hitos estan incompletos.
- La cobertura se limita a siete pruebas backend; no hay pruebas frontend ni E2E.

## Errores y riesgos encontrados

- `AdminPages.tsx` tiene 787 lineas y mezcla UI, estado, API, formularios y carga de archivos.
- Las eliminaciones administrativas no solicitan confirmacion y sus promesas pueden fallar sin mostrar el error.
- Varias pantallas no presentan errores de carga ni estados vacios.
- Algunos formularios dependen solo de `placeholder`; se deben reforzar nombres accesibles y foco visible.
- El dashboard actual no cubre temporadas, salud, archivos sin asociar ni contenido incompleto.
- El bundle frontend supera 500 kB y las rutas administrativas se cargan de forma inmediata.
- Existen avisos transitivos de dependencias cuya solucion requiere actualizaciones mayores controladas.

## Archivos de la primera fase

- `apps/frontend/src/admin/AdminPages.tsx`: se convierte en barrel compatible.
- `apps/frontend/src/admin/components/*`: controles, estados, tabla y carga reutilizables.
- `apps/frontend/src/admin/{dashboard,movies,series,episodes,genres,users,comments,settings,storage,audit}/*`: una pantalla por dominio.
- `apps/frontend/src/main.tsx`: solo cambiara si resulta necesario para conservar imports o carga diferida.

## Cambios de base de datos

La primera fase no necesita cambios Prisma ni migraciones. Las fases de temporadas, subtitulos, analitica, creditos, perfiles infantiles y notificaciones requeriran migraciones separadas, reversibles y con backfill compatible.

## Orden de implementacion

1. Modularizar el panel sin modificar rutas ni contratos HTTP.
2. Mejorar dashboard y agregaciones administrativas.
3. Incorporar temporadas y operaciones masivas.
4. Completar subtitulos y reproductor.
5. Agregar analitica, busqueda avanzada, creditos y recomendaciones.
6. Completar perfiles infantiles, correo y notificaciones.
7. Abstraer almacenamiento y agregar cargas reanudables.
8. Implementar cola y worker FFmpeg/HLS.
9. Ampliar auditoria, respaldos, observabilidad, pruebas y CI.

## Riesgos de compatibilidad

- Se conservaran nombres exportados, rutas React, endpoints y formas de payload existentes.
- Los modulos nuevos no deben introducir dependencias circulares ni duplicar tipos de dominio.
- Futuras migraciones deben aceptar filas existentes y evitar campos obligatorios sin valor inicial.
- La proteccion de medios y las rutas publicas actuales no se modifican en esta fase.

## Estrategia de pruebas

- Ejecutar TypeScript estricto en frontend y backend.
- Ejecutar las pruebas Vitest existentes.
- Compilar ambos workspaces con el pipeline de produccion.
- Verificar que cada export administrativo siga resolviendo desde `AdminPages.tsx`.
- Revisar manualmente carga, error, vacio, edicion, confirmacion y acciones por teclado en el panel.

## Criterios de aceptacion de la primera fase

- `AdminPages.tsx` deja de concentrar implementaciones y conserva sus exports publicos.
- Cada dominio administrativo queda en un modulo independiente.
- Los controles y tablas compartidos no se duplican.
- Las tablas muestran estado vacio, las cargas fallidas son visibles y eliminar requiere confirmacion.
- Los formularios conservan el comportamiento y payload actuales.
- No se modifica Prisma ni se pierde funcionalidad.
- Lint, typecheck, pruebas y build finalizan correctamente.

## Decision de implementacion de la fase 2

El dashboard ampliara el contrato existente de `GET /api/admin/stats` sin eliminar los campos escalares actuales. Las metricas se agruparan en bloques `totals`, `users`, `views`, `content`, `comments`, `files`, `storage` y `health`, permitiendo una migracion gradual del frontend.

Las vistas diarias se calcularan en PostgreSQL y se completaran con ceros en el servicio para entregar una serie continua de 14 dias. El contenido mas visto usara los contadores existentes y consultas limitadas por tipo; no se realizaran consultas por cada fila. El almacenamiento reutilizara `StorageService` y agregara bytes por tipo.

No existe un modelo `Season`, por lo que `totals.seasons` sera `null` y la interfaz mostrara que esa metrica estara disponible tras la fase 3. No se inferiran temporadas a partir de numeros de episodio.

Se agregaran indices sobre `ViewLog.createdAt`, `Session.lastUsedAt` y `MediaFile(status, createdAt)` mediante una migracion aditiva. Son compatibles con datos existentes y no alteran filas ni contratos.

### Resultado de la fase 2

- `GET /api/admin/stats` entrega agregaciones protegidas y retrocompatibles.
- El dashboard presenta totales, usuarios recientes, 14 dias de reproducciones, rankings, contenido nuevo, incidencias, almacenamiento, salud y actividad.
- La migracion `20260802170000_admin_dashboard_indexes` se aplico sobre la base existente y sobre una base vacia temporal.
- Las temporadas se muestran como no disponibles hasta que la fase 3 agregue su modelo real.
# Fase 3: temporadas y gestion masiva

## Decision de compatibilidad

`Episode.number` deja de ser unico por serie y pasa a ser unico por temporada. La migracion crea una `Temporada 1` publicada por cada serie existente, enlaza todos sus episodios y conserva su numero como posicion inicial. Se usa eliminacion logica y una temporada con episodios activos no puede eliminarse.

## Alcance implementado

- CRUD administrativo de temporadas con numeracion automatica.
- Creacion, publicacion, orden y copia de configuracion por lote.
- Deteccion de duplicados mediante indice unico y deteccion explicita de huecos.
- Importacion CSV con vista previa, errores por fila, limite de 500 filas y commit transaccional.
- Modulos frontend separados para temporadas, herramientas masivas e importacion.
- Pruebas unitarias para deteccion de huecos e inferencia de datos CSV.

# Fase 4: subtitulos

## Decision de almacenamiento y entrega

`SubtitleTrack` se mantiene como la entidad asociada opcionalmente a un episodio o pelicula. La migracion es aditiva: conserva `language`, `label`, `url` e `isDefault`, y agrega formato de origen, nombre original, estado activo, pista forzada y fecha de actualizacion con valores compatibles para filas existentes.

Los archivos SRT se convierten a WebVTT durante la carga y los VTT se normalizan antes de persistir. El formato almacenado siempre es UTF-8 WebVTT en `uploads/subtitles`; `sourceFormat` conserva el formato recibido. Cada archivo se registra tambien como `MediaFile` de tipo `SUBTITLE`.

Nginx no expone la carpeta de subtitulos. El frontend obtiene el contenido mediante un endpoint autenticado, crea una URL `blob:` temporal y la conecta al reproductor mediante `<track>`. De esta forma el navegador puede cargar las pistas sin hacer publico el archivo ni depender de cabeceras personalizadas en `<track>`.

## Controles de seguridad

- Solo ADMIN puede crear, editar, previsualizar pistas inactivas o eliminarlas.
- El archivo debe ser `.vtt` o `.srt`, UTF-8 valido y menor que `MAX_SUBTITLE_UPLOAD_KB`.
- Los nombres fisicos se generan con UUID; nunca se usa el nombre enviado como ruta.
- Se rechazan archivos sin cues validos, contenido binario y etiquetas activas peligrosas.
- Al eliminar, el archivo se mueve primero a una ubicacion temporal y se restaura si falla la transaccion de base de datos.

# Fase 5: reproductor

## Decision de persistencia

Los marcadores editoriales `introStartSec`, `introEndSec`, `recapStartSec` y `recapEndSec` se agregan de forma opcional a episodios y peliculas. La migracion es aditiva y las filas actuales conservan valores nulos. Backend valida que cada intervalo tenga inicio y fin, sea creciente y no exceda la duracion conocida.

Volumen, velocidad, calidad HLS preferida y reproduccion automatica se guardan por dispositivo en `localStorage`. No se escriben aun en `Profile.preferences` porque el reproductor no dispone de un perfil activo confiable; esa asociacion se realizara en la fase de perfiles.

El progreso se consulta mediante un endpoint puntual por contenido. Se guarda al iniciar, cada 15 segundos, al pausar, al abandonar y al finalizar, evitando envios si la posicion no cambio de forma significativa. El porcentaje de finalizacion usa `PLAYBACK_COMPLETION_PERCENT` y un registro completado no vuelve a estado incompleto por reproducir una posicion anterior.

## Capacidades del reproductor

- Calidades y pistas de audio expuestas por HLS.js, con modo automatico.
- Subtitulos, velocidad, volumen persistente, saltos de 10 segundos, PiP y pantalla completa.
- Botones contextuales para saltar introduccion y resumen.
- Siguiente episodio manual y automatico con cancelacion.
- Atajos de teclado, estados de carga, reintento y recuperacion limitada de errores HLS.
- Los iframes externos mantienen los controles del proveedor y no pueden recibir controles internos.

# Fase 12: almacenamiento abstracto

`StorageModule` define un contrato único para escritura, lectura, borrado, existencia, metadatos, salud, capacidad y URLs temporales. Sus implementaciones son disco local y S3 compatible; la selección se realiza mediante `STORAGE_DRIVER` y la configuración S3 se valida al arrancar.

Los temporales de Multer y FFprobe permanecen en disco para evitar cargar videos completos en memoria. Después de validar, uploads, subtítulos, limpieza administrativa, health checks y autorización multimedia trabajan mediante la abstracción. Local conserva `/uploads` y `X-Accel-Redirect`; S3 usa objetos privados, URLs firmadas para video y redirecciones breves para imágenes.

No se crea migración Prisma porque `MediaFile.relativePath` ya representa una clave portable. Los archivos existentes no se copian ni eliminan automáticamente. `docs/STORAGE.md` define el procedimiento con respaldo, sincronización, checksums, actualización transaccional de referencias y reversión.

# Fase 14: procesamiento FFmpeg

Se eligio BullMQ con Redis porque el procesamiento debe sobrevivir al ciclo HTTP, limitar concurrencia y ejecutarse fuera del proceso API. `VideoProcessingJob` conserva el estado durable y Redis funciona como transporte. El worker genera exclusivamente calidades iguales o inferiores a la fuente, master HLS, segmentos y miniatura; publica el resultado solo tras completar almacenamiento y base de datos.

La cancelacion activa termina FFmpeg, los fallos conservan el original para reintento y los temporales siempre se eliminan. Local y S3 comparten el contrato de almacenamiento; S3 reescribe referencias de playlists para firmar cada recurso mediante la API. Consulta `docs/VIDEO_PROCESSING.md`.

# Fase 15: auditoria ampliada

`AuditLog` incorpora estados anterior/nuevo y metadatos sanitizados. Un interceptor global registra todas las mutaciones administrativas, mientras autenticacion mantiene eventos explicitos para sesiones. El panel ofrece filtros, paginacion, detalle, CSV y retencion configurable. Las restauraciones por script generan `BACKUP_RESTORED` y ninguna ruta persiste contrasenas, tokens, PIN ni secretos operativos. Consulta `docs/AUDIT.md`.

# Fase 20: experiencia de usuario

El frontend divide rutas publicas y administrativas mediante carga diferida, añade skeletons, estados vacios y errores recuperables, y reserva espacios de imagen para reducir saltos visuales. La navegacion incluye foco visible, salto al contenido, anuncios accesibles y movimiento espacial con flechas para televisores y controles remotos.

La PWA usa un manifest y service worker propio sin dependencias nuevas. Su cache excluye API, medios privados, uploads y peticiones Range. Se incorporan paginas 404, error general y mantenimiento por caida real de la API. Consulta `docs/UX_PWA.md`.
