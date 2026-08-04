# Cruce de API MasMax

Fecha: 2026-08-02  
Metodo: cruce estatico entre decoradores Nest y llamadas de `apps/frontend/src`, complementado con peticiones anonimas al stack local.

Estados:

- **Conectado:** existe controlador, servicio y consumidor coherente.
- **Inconsistente:** existe en ambos lados, pero seguridad o semantica difieren.
- **Sin consumidor:** existe backend y no se encontro llamada frontend.
- **No encontrado:** llamada frontend sin controlador; no se confirmo ningun caso.

## API publica y de usuario

| Endpoint | Metodo | Controlador backend | Servicio backend | Consumidor frontend | Estado | Problema detectado |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/health/live` | GET | `HealthController` | Prisma/Redis/storage indirectos | `api.probeApi`, BackendGate | Conectado | `ready` ejecuta ffprobe por llamada; live es ligero |
| `/api/health/ready` | GET | `HealthController` | Prisma, Redis, storage, ffprobe | Docker/operacion | Inconsistente | Proceso ffprobe repetido (MMX-016) |
| `/api/site-settings` | GET | `SettingsController` | `SettingsService` | `SiteSettingsProvider`, diseno admin | Conectado | Error publico se silencia; singleton no garantizado |
| `/api/series` | GET | `SeriesController` | `SeriesService` | Home, SeriesPage, varios admin | Inconsistente | Sin auth y sin paginacion; misma ruta publica alimenta selectores admin |
| `/api/series/featured` | GET | `SeriesController` | `SeriesService` | HomePage | Inconsistente | Sin auth; revisar indice `(featured, updatedAt)` a escala |
| `/api/series/:slug` | GET | `SeriesController` | `SeriesService` | SeriesDetailPage | Inconsistente | Sin auth; lectura incrementa vistas |
| `/api/episodes/latest` | GET | `EpisodesController` | `EpisodesService` | HomePage | Inconsistente | Sin auth; expone URL y puede incluir padre eliminado |
| `/api/episodes/:id` | GET | `EpisodesController` | `EpisodesService` | WatchPage | Inconsistente | Sin auth; filtro de padre incompleto; incrementa vistas |
| `/api/episodes/series/:slug` | GET | `EpisodesController` | `EpisodesService` | WatchPage/relacionados | Inconsistente | Serie eliminada no se filtra consistentemente |
| `/api/movies` | GET | `MoviesController` | `MoviesService` | HomePage, MoviesPage | Inconsistente | Sin auth y sin paginacion; expone URL |
| `/api/movies/:slug` | GET | `MoviesController` | `MoviesService` | MovieWatchPage | Inconsistente | Sin auth; GET incrementa vistas |
| `/api/movies/:id/recommendations` | GET | `MoviesController` | `MoviesService` | MovieWatchPage | Inconsistente | Sin auth; estrategia simple y sin limite contractual visible |
| `/api/genres` | GET | `GenresController` | `GenresService` | Home y formularios admin | Conectado | Catalogo privado deberia definir si requiere sesion |
| `/api/comments/:episodeId` | GET | `CommentsController` | `CommentsService` | WatchPage | Conectado | Consulta necesita indice compuesto si crece |
| `/api/comments` | POST | `CommentsController` | `CommentsService` | WatchPage | Inconsistente | UI inventa aprobacion y no usa respuesta real |
| `/api/comments/:id` | PATCH | `CommentsController` | `CommentsService` | Ninguno | Sin consumidor | Edicion propia no expuesta |
| `/api/comments/:id/report` | POST | `CommentsController` | `CommentsService` | Ninguno | Sin consumidor | Reporte no expuesto |
| `/api/favorites` | GET/POST | `FavoritesController` | `FavoritesService` | Home, FavoritesPage, watch pages | Conectado | Prueba solo de servicio mockeado |
| `/api/favorites/:id` | DELETE | `FavoritesController` | `FavoritesService` | FavoritesPage/watch | Conectado | Sin inconsistencia confirmada |
| `/api/favorites/check` | GET | `FavoritesController` | `FavoritesService` | Watch pages | Conectado | Validacion de target respaldada por DB |
| `/api/me/continue-watching` | GET | `HistoryController` | `HistoryService` | HomePage | Conectado | Requiere paginacion/cursor a escala |
| `/api/me/history` | GET | `HistoryController` | `HistoryService` | HistoryPage | Conectado | Sin E2E |
| `/api/me/progress` | PUT | `HistoryController` | `HistoryService` | VideoPlayer | Inconsistente | Guardado final sin keepalive/beacon |
| `/api/me/progress/:type/:id` | GET | `HistoryController` | `HistoryService` | VideoPlayer | Conectado | Sin inconsistencia confirmada |
| `/api/media/authorize` | POST | `MediaController` | `MediaService` | VideoPlayer | Inconsistente | MP4 protegido; HLS queda fuera de la politica |
| `/api/subtitles/:type/:id` | GET | `SubtitlesController` | `SubtitlesService` | VideoPlayer | Conectado | Sin E2E de navegador |
| `/api/subtitles/tracks/:id/file` | GET | `SubtitlesController` | `SubtitlesService` | VideoPlayer | Conectado | Cliente `apiText` no informa disponibilidad global |
| `/api/search` | GET | `SearchController` | Prisma directo en controlador | Ninguno | Sin consumidor | Filtros de publicacion incompletos y logica DB en controlador |
| `/api/profiles` | GET/POST | `ProfilesController` | `ProfilesService` | Ninguno | Sin consumidor | No hay selector/gestor frontend |
| `/api/profiles/:id` | PATCH/DELETE | `ProfilesController` | `ProfilesService` | Ninguno | Sin consumidor | PIN/kids incompletos |
| `/api/profiles/:id/select` | POST | `ProfilesController` | `ProfilesService` | Ninguno | Inconsistente | No valida PIN |
| `/api/me/lists` y items | GET/POST/PATCH/DELETE | `ListsController` | `ListsService` | Ninguno | Sin consumidor | Modulo de listas sin experiencia UI |

## Autenticacion

| Endpoint | Metodo | Controlador backend | Servicio backend | Consumidor frontend | Estado | Problema detectado |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | `AuthController` | `AuthService` | AdminLogin | Conectado | Falta E2E/fuerza bruta distribuida |
| `/api/auth/refresh` | POST | `AuthController` | `AuthService` | `api.refreshAccess` | Conectado | Cookie max no se propaga por Compose |
| `/api/auth/me` | GET | `AuthController` | `AuthService` | AuthProvider | Conectado | Recuperacion tras outage puede quedar incoherente |
| `/api/auth/logout` | POST | `AuthController` | `AuthService` | AuthProvider | Conectado | Limpieza local correcta aun si API falla |
| `/api/auth/sessions` | GET | `AuthController` | `AuthService` | Profile/Account page | Conectado | Sin prueba de integracion |
| `/api/auth/sessions/:id` | DELETE | `AuthController` | `AuthService` | Account page | Conectado | Sin prueba de integracion |
| `/api/auth/register` | POST | `AuthController` | `AuthService` | Solo metodo no visible en AuthContext | Sin consumidor | Sin ruta/formulario de registro |
| `/api/auth/forgot-password` | POST | `AuthController` | `AuthService` | Ninguno | Sin consumidor | No hay entrega de correo ni UI |
| `/api/auth/reset-password` | POST | `AuthController` | `AuthService` | Ninguno | Sin consumidor | Token no llega al usuario en produccion |
| `/api/auth/change-password` | POST/PATCH | `AuthController` | `AuthService` | Ninguno confirmado | Sin consumidor | Cambio propio no expuesto |
| Rutas de revocacion global/otras sesiones | POST | `AuthController` | `AuthService` | Parcial o ninguno | Sin consumidor | Capacidad backend no visible |

## Administracion

| Endpoint | Metodo | Controlador backend | Servicio backend | Consumidor frontend | Estado | Problema detectado |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/stats` | GET | `AdminController` | `AdminService` | DashboardPage | Conectado | Sin E2E/DB real |
| `/api/admin/users` | GET/POST | `UsersController` | `UsersService` | UsersAdminPage | Inconsistente | GET sin paginacion |
| `/api/admin/users/:id` | PATCH/DELETE | `UsersController` | `UsersService` | UsersAdminPage | Conectado | Probar auto-desactivacion/ultimo admin |
| `/api/admin/users/:id/password` | PATCH | `UsersController` | `UsersService` | UsersAdminPage | Conectado | bcrypt aplicado; falta integracion |
| `/api/admin/series` | POST | `AdminController` | `AdminService` | SeriesAdminPage | Conectado | Selectores leen ruta publica sin auth |
| `/api/admin/series/:id` | PATCH/DELETE | `AdminController` | `AdminService` | SeriesAdminPage | Inconsistente | Borrado no oculta episodios en todas las consultas |
| `/api/admin/series/:id/seasons` | GET/POST | `SeasonsController` | `SeasonsService` | Seasons/Episodes admin | Conectado | Restriccion unica DB correcta |
| `/api/admin/seasons/:id` | PATCH/DELETE | `SeasonsController` | `SeasonsService` | SeasonsAdminPage | Conectado | Falta E2E de cascada/soft delete |
| `/api/admin/seasons/:id/episode-gaps` | GET | `EpisodesController` | `EpisodesService` | EpisodesAdminPage | Conectado | Sin inconsistencia confirmada |
| `/api/admin/episodes` | GET/POST | `EpisodesController` | `EpisodesService` | EpisodesAdminPage | Conectado | GET paginado; DTO convierte numeros |
| `/api/admin/episodes/:id` | PATCH/DELETE | `EpisodesController` | `EpisodesService` | EpisodesAdminPage | Conectado | Errores Prisma traducidos |
| Rutas bulk/import de episodios | POST/PATCH | `EpisodesController` | `EpisodeImportService`/`EpisodesService` | EpisodesAdminPage | Conectado | Pruebas unitarias, no integracion |
| `/api/admin/movies` | GET/POST | `MoviesController` | `MoviesService` | MoviesAdminPage | Inconsistente | GET devuelve soft-deleted |
| `/api/admin/movies/:id` | PATCH/DELETE | `MoviesController` | `MoviesService` | MoviesAdminPage | Conectado | Semantica de papelera no definida |
| `/api/admin/genres` | POST | `AdminController` | `AdminService` | GenresAdminPage | Conectado | Sin E2E |
| `/api/admin/genres/:id` | PATCH/DELETE | `AdminController` | `AdminService` | GenresAdminPage | Conectado | Probar genero en uso |
| `/api/admin/comments` | GET | `CommentsAdminController` | `CommentsService` | CommentsAdminPage | Inconsistente | Limite fijo 200, sin paginacion |
| Moderacion admin de comentarios | PATCH/DELETE | `CommentsAdminController` | `CommentsService` | CommentsAdminPage | Conectado | Sin E2E |
| `/api/admin/settings` y `/api/admin/site-settings` | GET/PATCH | `SettingsController` | `SettingsService` | SettingsAdminPage | Inconsistente | Singleton DB no garantizado |
| `/api/admin/uploads/video` | POST | `UploadsController` | validacion/storage | UploadField | Inconsistente | Multer vulnerable; flujo normal usa campo `file` correcto |
| `/api/admin/uploads/image` | POST | `UploadsController` | storage/validacion | UploadField | Conectado | Falta prueba HTTP multipart |
| Rutas resumable upload | POST/PUT/GET/DELETE | `UploadsController` | `ResumableUploadService` | cliente resumable | Conectado | Finalizacion costosa; cuotas pendientes |
| `/api/admin/storage` | GET | `StorageController` | `StorageService` | StorageAdminPage | Inconsistente | Carga inventario/URL completos en memoria |
| Limpieza/inventario storage | POST | `StorageController` | `StorageService` | StorageAdminPage | Conectado | Probar referencias compartidas y disco lleno |
| `/api/admin/video-processing/jobs` | GET | `VideoProcessingController` | `VideoProcessingService` | ProcessingAdminPage | Inconsistente | No permite asociar job terminado a contenido |
| Retry/cancel processing | POST | `VideoProcessingController` | `VideoProcessingService` | ProcessingAdminPage/UploadField | Conectado | Sin E2E worker |
| Encolado manual por media | POST | `VideoProcessingController` | `VideoProcessingService` | Ninguno confirmado | Sin consumidor | Superficie operativa no visible |
| `/api/admin/subtitles` | GET/POST | `SubtitlesAdminController` | `SubtitlesService` | SubtitlesAdminPage | Conectado | Sin prueba HTTP/archivo real |
| `/api/admin/audit` | GET | `AuditController` | `AuditService` | AuditAdminPage | Conectado | Persistencia best-effort puede dejar huecos |
| `/api/admin/audit/export.csv` | GET | `AuditController` | `AuditService` | AuditAdminPage | Conectado | `apiBlob` no actualiza BackendGate |
| Facets/retention audit | GET/POST | `AuditController` | `AuditService` | AuditAdminPage | Conectado | Sin prueba de integracion/retencion real |
| Invitaciones admin | POST/GET/DELETE | controlador auth/admin | `AuthService` | Ninguno | Sin consumidor | Flujo incompleto en panel |

## Conclusiones del cruce

- No se confirmaron componentes frontend llamando rutas inexistentes.
- Las inconsistencias mas graves son de autorizacion y visibilidad, no de nombre de endpoint.
- Varias rutas backend no consumidas pueden ser API intencional; no deben eliminarse sin comprobar clientes externos.
- Conviene generar OpenAPI y ejecutar pruebas de contrato para automatizar este cruce.
