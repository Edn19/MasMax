# API

Base: `/api`. Respuestas de error: `statusCode`, `code`, `message`, `details`, `requestId`.

## Auditoria administrativa

Todos los endpoints requieren JWT con rol `ADMIN`.

- `GET /api/admin/audit?page=1&limit=50&actorId=&action=&entity=&from=&to=` devuelve `{ items, total, page, limit, pages }`.
- `GET /api/admin/audit/facets` devuelve usuarios, acciones y entidades disponibles para filtros.
- `GET /api/admin/audit/export.csv` acepta los mismos filtros y exporta hasta 10 000 eventos.
- `GET /api/admin/audit/retention` consulta la politica activa.
- `POST /api/admin/audit/retention/cleanup` elimina eventos vencidos.

## Subidas reanudables

Requieren JWT con rol `ADMIN`:

- `POST /api/admin/uploads/resumable`: inicia una sesion con `originalName`, `mimeType`, `size` y `checksum` SHA-256 opcional.
- `GET /api/admin/uploads/resumable`: lista las sesiones activas del administrador.
- `GET /api/admin/uploads/resumable/:id`: devuelve partes confirmadas y progreso persistido.
- `POST /api/admin/uploads/resumable/:id/parts`: multipart con `file`, `index` y checksum SHA-256 de la parte.
- `POST /api/admin/uploads/resumable/:id/complete`: ensambla y valida el MP4; acepta `checksum` final opcional.
- `DELETE /api/admin/uploads/resumable/:id`: cancela y elimina partes temporales.

Consulta `docs/UPLOAD_ARCHITECTURE.md` para el protocolo, recuperacion tras recarga y dimensionamiento.

## Procesamiento FFmpeg

Todas requieren JWT con rol `ADMIN`:

- `GET /api/admin/video-processing`: lista los ultimos trabajos y su progreso.
- `GET /api/admin/video-processing/worker-health`: salud de Redis y latido del worker.
- `GET /api/admin/video-processing/:id`: estado puntual para polling.
- `POST /api/admin/video-processing/media/:mediaFileId`: procesa manualmente un MP4 registrado.
- `POST /api/admin/video-processing/:id/retry`: reintenta un job fallido o cancelado.
- `DELETE /api/admin/video-processing/:id`: cancela un job pendiente o activo.

Las cargas de video devuelven `processingJob` cuando `ENABLE_HLS=true`. La URL HLS final aparece como `masterUrl` solo en estado `COMPLETED`.

- Auth: `POST auth/login|refresh|logout|register|forgot-password|reset-password|change-password`, `GET auth/me|sessions|sessions/current`, `DELETE auth/sessions/:id`.
- Media: `GET media/authorize?episodeId=...|movieId=...`; `media/stream` es una URL MP4 firmada interna y `media/hls` entrega manifiestos y segmentos con token corto ligado a usuario y sesion.
- Progreso: `GET me/watch-history|continue-watching`, `GET me/progress?episodeId=:id|movieId=:id`, `PUT me/progress`, `DELETE me/watch-history/:id`.
- Perfiles: CRUD `/profiles` y `POST /profiles/:id/select`.
- Listas: CRUD `/me/lists`, alta/baja de `/me/lists/:id/items`.
- Catalogo: `/series`, `/episodes`, `/movies`, `/genres`, `/search`. Requiere JWT y no devuelve campos de URL o ruta multimedia; la reproduccion siempre se autoriza por `/media/authorize`.
- Usuario: `/favorites`, `/comments`; reporte con `POST /comments/:id/report`.
- Admin: `/admin/users|series|episodes|movies|comments|site-settings|uploads|storage|audit`; invitaciones en `/admin/users/invitations`.
- Dashboard: `GET /admin/stats` conserva los contadores historicos y agrega `totals`, usuarios recientes, vistas diarias, contenido mas visto/reciente, incidencias, almacenamiento, salud y actividad administrativa.
- Salud: `/health`, `/health/live`, `/health/ready`.

Rutas privadas usan `Authorization: Bearer ACCESS_TOKEN`; refresh usa cookie y `credentials: include`.
# Administracion de temporadas y episodios masivos

Todas las rutas de esta seccion requieren un token JWT con rol `ADMIN`.

- `GET /api/admin/series/:seriesId/seasons`: lista temporadas activas.
- `POST /api/admin/seasons`: crea una temporada; `number` es opcional y se asigna de forma correlativa.
- `PATCH /api/admin/seasons/:id`: edita metadatos y publicacion.
- `DELETE /api/admin/seasons/:id`: eliminacion logica; se rechaza si contiene episodios activos.
- `GET /api/admin/episodes`: listado paginado con filtros `seriesId`, `seasonId` y `published`.
- `POST /api/admin/episodes/bulk`: crea hasta 100 episodios en una transaccion.
- `PATCH /api/admin/episodes/reorder`: actualiza posiciones dentro de una temporada.
- `PATCH /api/admin/episodes/publish`: publica o despublica una seleccion.
- `POST /api/admin/episodes/copy-settings`: copia video, miniatura, descripcion o duracion.
- `GET /api/admin/seasons/:seasonId/episode-gaps`: devuelve numeros ausentes.
- `POST /api/admin/episodes/import/preview`: valida CSV y devuelve errores por fila sin escribir datos.
- `POST /api/admin/episodes/import/commit`: vuelve a validar e importa todas las filas en una transaccion.

El CSV admite `season,episode,title,description,videoUrl,videoSource,videoType,thumbnailUrl,duration,published,publishedAt`. Son obligatorias `season`, `episode`, `title` y `videoUrl`.

# Subtitulos

Las rutas administrativas requieren JWT con rol `ADMIN`:

- `GET /api/admin/subtitles?episodeId=:id` o `?movieId=:id`: lista todas las pistas del contenido.
- `POST /api/admin/subtitles`: multipart con campo `file` y metadatos `episodeId` o `movieId`, `language`, `label`, `isDefault`, `isForced` e `isActive`.
- `PATCH /api/admin/subtitles/:id`: actualiza idioma, etiqueta y opciones.
- `GET /api/admin/subtitles/:id/preview`: devuelve WebVTT, incluso para pistas inactivas.
- `DELETE /api/admin/subtitles/:id`: elimina el registro y el archivo administrado.

`GET /api/subtitles/:id/content` requiere una sesion JWT y solo entrega pistas activas. El resultado usa `Content-Type: text/vtt` y cache privada.

La carga acepta `.vtt` y `.srt` UTF-8 hasta `MAX_SUBTITLE_UPLOAD_KB`. Los SRT se convierten a WebVTT. Debe indicarse exactamente un episodio o pelicula; una pista predeterminada siempre debe estar activa y solo puede existir una predeterminada por contenido.
