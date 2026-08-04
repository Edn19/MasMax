# Auditoria tecnica integral de MasMax

Fecha: 2026-08-02  
Modalidad: revision estatica y pruebas no destructivas sobre el entorno local  
Resultado: 0 criticos, 5 altos, 15 medios y 9 bajos (29 hallazgos)

## 1. Resumen ejecutivo

MasMax es un monorepo funcional: compila, supera sus pruebas actuales, valida Prisma y Docker Compose, levanta seis servicios saludables y responde correctamente en `/api/health/ready`. La arquitectura general es coherente para una plataforma privada de streaming y separa frontend, API, worker de FFmpeg, PostgreSQL, Redis y Nginx.

No se detectaron bloqueadores criticos ni secretos versionados. Sin embargo, no debe considerarse listo para produccion sin corregir cinco hallazgos altos: el catalogo y las URL de video son consultables sin sesion, HLS local/S3 puede eludir la autorizacion firmada, el borrado logico de series no oculta todos sus episodios, Multer tiene vulnerabilidades de denegacion de servicio conocidas y el procedimiento de restauracion no es seguro ni reproducible tal como esta documentado.

La conclusion se basa en lectura de codigo, cruce de rutas, inspeccion del esquema y migraciones, ejecucion de lint/typecheck/tests/build, auditoria de dependencias, comprobacion de Compose, estado de migraciones y peticiones HTTP al stack activo.

## 2. Alcance de la auditoria

Se revisaron `apps/frontend`, `apps/backend`, Prisma, las 14 migraciones presentes, Nginx, Dockerfiles, `docker-compose.yml`, scripts operativos, CI, documentacion, paquetes y variables de entorno. Se cubrieron autenticacion, roles, sesiones, catalogo, administracion, comentarios, favoritos, historial, perfiles, listas, busqueda, subida reanudable, almacenamiento local/S3, HLS, subtitulos, FFmpeg, auditoria y backups.

La revision fue de solo lectura sobre el producto. Los unicos archivos creados son los cinco informes pedidos en `docs/`.

## 3. Limitaciones del analisis

- No se hizo una prueba destructiva de restauracion ni se alteraron datos.
- No se cargaron archivos MP4 de 2 GB ni se proceso video 1080p completo; se audito el flujo y sus pruebas unitarias.
- No se ejecutaron pruebas de navegador con Safari/iOS, Android ni dispositivos fisicos.
- No se realizo pentest activo, fuzzing, carga sostenida ni escaneo de imagenes Docker.
- La compilacion Docker reutilizo capas validas de cache; los Dockerfiles y artefactos se validaron, pero no se forzo una descarga limpia.
- No habia manifiesto HLS local activo para probarlo anonimamente; la exposicion se confirma por rutas y politica de autorizacion del codigo.

## 4. Arquitectura actual

```text
Usuario
  -> Nginx :8088
     -> React/Vite servido por frontend :8080
     -> /api -> NestJS backend :3000
     -> /uploads -> volumen local compartido
  -> Backend -> Prisma -> PostgreSQL :5432 (red interna)
  -> Backend/Worker -> Redis/BullMQ -> FFmpeg
  -> Storage local o S3 -> reproductor MP4/HLS/embed
```

Fortalezas: modulos Nest por dominio, DTO con validacion global, guards administrativos, refresh token en cookie HttpOnly, access token solo en memoria, worker separado para FFmpeg, adaptador local/S3, migraciones con restricciones adicionales e imagenes multi-stage.

Complejidad destacada:

| Archivo | Tamano aprox. | Responsabilidades mezcladas | Riesgo | Division sugerida |
| --- | ---: | --- | --- | --- |
| `apps/backend/prisma/schema.prisma` | 571 lineas | Todo el modelo de dominio | Medio | Mantener como fuente unica; documentar invariantes SQL no expresables por Prisma |
| `apps/frontend/src/components/VideoPlayer.tsx` | 209 lineas | MP4, HLS, Drive, progreso, subtitulos y teclado | Medio | Adaptadores por fuente y hook de progreso |
| `apps/frontend/src/pages/HomePage.tsx` | 206 lineas | Consultas y muchas secciones visuales | Medio | Contenedor de datos y secciones independientes |
| `apps/backend/src/episodes/episodes.service.ts` | 201 lineas | CRUD, permisos, importacion y video | Medio | Servicio de escritura y consultas publicables |
| `apps/backend/src/auth/auth.service.ts` | 170 lineas | Login, sesiones, reset e invitaciones | Medio | Servicios de sesion y recuperacion separados |

No se encontro una dependencia circular confirmada. Hay varios controladores/servicios compactados en una linea, lo que dificulta revision y cobertura aunque TypeScript los acepte.

## 5. Estructura del proyecto

```text
/
|-- apps/
|   |-- backend/        NestJS, Prisma, API, worker y seed
|   `-- frontend/       React, Vite, Tailwind, PWA y panel admin
|-- nginx/              proxy publico y entrega de uploads
|-- scripts/            backup y restore
|-- docs/               arquitectura y operacion
|-- uploads/            persistencia local montada (ignorada por Git)
|-- docker-compose.yml  orquestacion de seis servicios
|-- package.json        workspaces y scripts comunes
`-- .github/workflows/  CI de validacion Node/Prisma
```

El gestor es npm con workspaces y `package-lock.json`. El stack es React 18/Vite 6/TypeScript, NestJS 10, Prisma 5, PostgreSQL 16, Redis/BullMQ, FFmpeg, HLS.js, Docker Compose y Nginx.

## 6. Comandos ejecutados

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Correcto |
| `npm run typecheck` | Correcto |
| `npm run test` | Correcto: backend 14 archivos/44 pruebas; frontend 4 pruebas |
| `npx prisma validate --schema apps/backend/prisma/schema.prisma` | Correcto |
| `docker-compose config --quiet` | Correcto |
| `docker-compose build` | Correcto, con capas cacheadas |
| `docker-compose ps` | 6 servicios activos y saludables |
| `docker-compose exec -T backend npx prisma migrate status` | 14 migraciones aplicadas; esquema actualizado |
| Peticiones a `/api/health/ready` | HTTP 200, estado healthy |
| Peticiones anonimas a `/api/series`, `/api/episodes/latest`, `/api/movies` | HTTP 200; confirmaron MMX-001 |
| `npm audit --omit=dev` | 11 vulnerabilidades: 8 moderadas, 3 altas |
| `npm audit` | 28 vulnerabilidades: 3 bajas, 17 moderadas, 7 altas, 1 critica de tooling |

No se ejecutaron `prisma db push`, migraciones, seeds, instalaciones ni comandos de escritura porque contradicen el alcance de auditoria.

## 7. Resultados de instalacion

El lockfile es aceptado por las etapas `npm ci` de las imagenes ya construidas y el arbol local permitio ejecutar todos los scripts. No se reinstalaron dependencias para no modificar `node_modules` ni generar ruido en una auditoria de solo lectura. No hay evidencia de lockfile roto; el riesgo existente corresponde a versiones vulnerables, no a reproducibilidad inmediata.

## 8. Resultados de lint

`npm run lint` finalizo sin errores. El script llamado lint ejecuta exclusivamente `tsc --noEmit`; no existe una politica ESLint activa. Por tanto confirma tipado, pero no reglas de promesas, hooks, accesibilidad, imports o complejidad (MMX-021).

## 9. Resultados de typecheck

`npm run typecheck` finalizo correctamente en ambos workspaces. No se encontraron errores TypeScript bloqueantes ni uso significativo de `any`; quedan riesgos de comportamiento que el sistema de tipos no detecta, especialmente sesion, moderacion y flujos asincronos.

## 10. Resultados de pruebas

Todas las pruebas existentes pasaron: 14 archivos y 44 casos en backend; 4 archivos en frontend. Predominan pruebas unitarias de utilidades y servicios con mocks. No hay E2E de autenticacion, base de datos, guards, subida completa, reproduccion en navegador, CRUD administrativo ni restore.

## 11. Resultados de build

`docker-compose build` genero correctamente backend, worker y frontend; el frontend queda servido como estatico y Nest genera su artefacto de produccion. Compose valido y el stack activo presenta `postgres`, `redis`, `backend`, `worker`, `frontend` y `nginx` saludables. Solo Nginx publica `8088:80`; backend, PostgreSQL y Redis permanecen internos.

## 12. Hallazgos criticos

No se confirmaron hallazgos criticos. La vulnerabilidad critica reportada por `npm audit` pertenece a tooling de desarrollo/build y no se demostro explotable en el runtime estatico desplegado; se conserva en MMX-019 como deuda de dependencias.

## 13. Hallazgos altos

### MMX-001 - Catalogo privado y URL de video accesibles sin autenticacion

- Severidad: Alto
- Estado: Confirmado
- Area: Seguridad
- Archivo: `apps/backend/src/series/series.controller.ts`, `apps/backend/src/episodes/episodes.controller.ts`, `apps/backend/src/movies/movies.controller.ts`
- Linea: 7-30 aprox.
- Evidencia: Los controladores publicos no usan guard JWT y serializan `videoUrl`; peticiones sin token devolvieron HTTP 200 con series, 19 episodios y 3 peliculas.
- Impacto: Un tercero puede enumerar contenido y obtener enlaces permanentes, contradiciendo el caracter privado documentado.
- Como reproducir: Ejecutar `curl http://localhost:8088/api/episodes/latest` sin `Authorization`.
- Causa: La proteccion existe en rutas React, no en la frontera API.
- Solucion recomendada: Aplicar guard de sesion a catalogo privado y devolver DTO publicos sin URL; obtener reproduccion solo mediante `/media/authorize`.
- Esfuerzo estimado: Medio
- Prioridad: Inmediata
- Dependencias: MMX-002, MMX-020.

### MMX-002 - HLS elude la autorizacion firmada de medios

- Severidad: Alto
- Estado: Confirmado
- Area: Video
- Archivo: `nginx/default.conf`, `apps/backend/src/storage/storage.controller.ts`, `apps/backend/src/media/media.service.ts`
- Linea: Nginx 24-30; servicios 20-110 aprox.
- Evidencia: `/uploads/hls/` se sirve directamente; los endpoints HLS de storage carecen de guard y `MediaService` solo clasifica `videos/*.mp4` como protegido. En S3 se emite redireccion prefirmada sin autenticar primero al usuario.
- Impacto: Quien conozca el manifiesto puede reproducir contenido HLS sin sesion ni control de expiracion de aplicacion.
- Como reproducir: Crear/procesar un HLS y solicitar su `master.m3u8` desde una sesion anonima.
- Causa: La proteccion esta implementada por patron de ruta y no por politica de contenido.
- Solucion recomendada: Autorizar manifiestos/segmentos mediante token corto o cookies firmadas y retirar la ruta HLS del alias publico.
- Esfuerzo estimado: Alto
- Prioridad: Inmediata
- Dependencias: MMX-001, CDN/storage elegido.

### MMX-003 - El borrado logico de una serie no oculta todos sus episodios

- Severidad: Alto
- Estado: Confirmado
- Area: Backend
- Archivo: `apps/backend/src/series/series.service.ts`, `apps/backend/src/episodes/episodes.service.ts`, `apps/backend/src/search/search.controller.ts`
- Linea: metodos `remove`, `latest`, `byId`, `bySeriesSlug`
- Evidencia: Eliminar una serie solo asigna `Series.deletedAt`; consultas de episodios no filtran consistentemente `series.deletedAt` ni publicacion del padre.
- Impacto: Episodios de contenido retirado siguen apareciendo o son accesibles por ID, slug o busqueda.
- Como reproducir: Marcar una serie eliminada y consultar un episodio conocido o `/episodes/latest`.
- Causa: Invariante de publicacion repetida y aplicada de forma parcial.
- Solucion recomendada: Centralizar el filtro de contenido publicable y cubrir serie, temporada y episodio en todas las consultas.
- Esfuerzo estimado: Medio
- Prioridad: Inmediata
- Dependencias: MMX-007.

### MMX-004 - Multer vulnerable en la ruta de subida

- Severidad: Alto
- Estado: Confirmado
- Area: Seguridad
- Archivo: `apps/backend/package.json`, `package-lock.json`, `apps/backend/src/uploads/uploads.controller.ts`
- Linea: dependencia `multer` 2.0.2 y rutas de upload
- Evidencia: `npm audit --omit=dev` reporta tres avisos altos de denegacion de servicio asociados a Multer; es dependencia directa y de `@nestjs/platform-express`.
- Impacto: Una peticion multipart especialmente construida puede agotar recursos. El guard admin reduce exposicion, pero no elimina el riesgo con cuenta comprometida.
- Como reproducir: Ejecutar `npm audit --omit=dev` y revisar la cadena de Multer.
- Causa: Version afectada fijada en el lockfile.
- Solucion recomendada: Probar una version corregida compatible con Nest, mantener limites en proxy/aplicacion y agregar prueba de multipart adverso.
- Esfuerzo estimado: Medio
- Prioridad: Inmediata
- Dependencias: MMX-019.

### MMX-005 - Backup y restore no son reproducibles ni consistentes

- Severidad: Alto
- Estado: Confirmado
- Area: Docker
- Archivo: `scripts/backup.sh`, `scripts/restore.sh`, `README.md`
- Linea: scripts completos; seccion de backup del README
- Evidencia: Los scripts requieren variables PostgreSQL del shell, pero el comando documentado no carga `.env`. Restore usa `pg_restore --clean` y extrae uploads mientras backend/worker pueden seguir escribiendo.
- Impacto: El backup documentado puede fallar; una restauracion puede dejar base de datos y archivos de momentos distintos o interrumpir trafico activo.
- Como reproducir: Abrir un shell sin variables exportadas y ejecutar el comando documentado; revisar el orden de `restore.sh` con servicios activos.
- Causa: Se asume que Compose exporta `.env` al shell y no existe protocolo de mantenimiento/atomicidad.
- Solucion recomendada: Cargar configuracion de forma explicita, detener escritores, validar archivo, restaurar a staging, verificar y realizar cambio controlado.
- Esfuerzo estimado: Medio
- Prioridad: Inmediata
- Dependencias: Runbook y prueba periodica de restore.

## 14. Hallazgos medios

### MMX-006 - Recuperacion de sesion puede entrar en bucle tras una caida

- Severidad: Medio
- Estado: Confirmado
- Area: Frontend
- Archivo: `apps/frontend/src/lib/auth.tsx`, `auth-storage.ts`, `components/AppExperience.tsx`, `components/ProtectedRoute.tsx`
- Linea: 5-40 aprox.
- Evidencia: El access token solo vive en memoria; si refresh falla por red se restaura solo el usuario cacheado. `ProtectedRoute` exige token, mientras login puede redirigir por usuario cacheado; reintentar disponibilidad no restaura sesion.
- Impacto: Tras recuperar backend, el usuario puede rebotar entre login y home hasta recargar o limpiar estado.
- Como reproducir: Cerrar backend, recargar con cookie valida, abrir ruta protegida y levantar backend.
- Causa: Estado de disponibilidad y estado de autenticacion no se reconcilian.
- Solucion recomendada: Reintentar `restoreSession` al volver API y basar redirecciones en un estado de sesion unico.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: Prueba E2E de recuperacion.

### MMX-007 - Busqueda expone episodios no publicados

- Severidad: Medio
- Estado: Confirmado
- Area: Backend
- Archivo: `apps/backend/src/search/search.controller.ts`
- Linea: controlador completo
- Evidencia: La consulta de episodios filtra `deletedAt`, pero no `published`, temporada publicada ni serie no eliminada; incluye metadatos y URL.
- Impacto: Un USER autenticado puede descubrir borradores o contenido retirado.
- Como reproducir: Crear episodio no publicado y buscar parte de su titulo con `/api/search`.
- Causa: Filtro de visibilidad incompleto.
- Solucion recomendada: Reutilizar una politica de contenido publicable y tipar `type` con enum/DTO.
- Esfuerzo estimado: Bajo
- Prioridad: Proxima version
- Dependencias: MMX-003.

### MMX-008 - Peliculas eliminadas reaparecen en administracion

- Severidad: Medio
- Estado: Confirmado
- Area: Backend
- Archivo: `apps/backend/src/movies/movies.service.ts`
- Linea: `listAdmin` y `remove`
- Evidencia: `remove` asigna `deletedAt` y `HIDDEN`, pero `listAdmin` no filtra `deletedAt: null`.
- Impacto: Tras refrescar, la tabla vuelve a mostrar peliculas eliminadas y permite operaciones ambiguas.
- Como reproducir: Eliminar una pelicula y recargar `/admin/movies`.
- Causa: Diferencia entre criterio publico y administrativo sin opcion explicita de papelera.
- Solucion recomendada: Excluir eliminadas por defecto o crear filtro/papelera intencional.
- Esfuerzo estimado: Bajo
- Prioridad: Proxima version
- Dependencias: Ninguna.

### MMX-009 - La UI afirma que un comentario pendiente fue publicado

- Severidad: Medio
- Estado: Confirmado
- Area: Frontend
- Archivo: `apps/frontend/src/pages/WatchPage.tsx`, `apps/backend/src/comments/comments.service.ts`
- Linea: WatchPage 32-43; servicio `create`
- Evidencia: La UI ignora la respuesta real, inserta un comentario sintetico con `approved: true` y muestra "Comentario publicado"; backend puede dejarlo pendiente segun `COMMENTS_REQUIRE_APPROVAL`.
- Impacto: Mensaje falso, comentario que desaparece al recargar y confusion de moderacion.
- Como reproducir: Activar moderacion, comentar y recargar.
- Causa: Actualizacion optimista con estado inventado.
- Solucion recomendada: Usar respuesta del backend y mostrar "en revision" cuando corresponda.
- Esfuerzo estimado: Bajo
- Prioridad: Proxima version
- Dependencias: Prueba de flujo moderado.

### MMX-010 - Recuperacion y verificacion de cuenta incompletas

- Severidad: Medio
- Estado: Confirmado
- Area: Backend
- Archivo: `apps/backend/src/auth/auth.service.ts`, `.env.example`, `apps/frontend/src/main.tsx`
- Linea: metodos forgot/reset; rutas frontend
- Evidencia: Forgot/reset existe en API, pero no hay paginas frontend ni transporte SMTP. En produccion se crea un token que el usuario no recibe; variables SMTP/verificacion no tienen consumidor y `emailVerifiedAt` no gobierna acceso.
- Impacto: Un usuario no puede recuperar su cuenta de forma operativa; configuracion sugiere una capacidad inexistente.
- Como reproducir: Solicitar recuperacion con logging de desarrollo desactivado y buscar un correo o pantalla asociada.
- Causa: Backend parcial sin integracion de mensajeria/UI.
- Solucion recomendada: Implementar proveedor de correo y vistas completas, o deshabilitar/documentar el endpoint hasta completarlo.
- Esfuerzo estimado: Alto
- Prioridad: Proxima version
- Dependencias: Politica de verificacion y secretos SMTP.

### MMX-011 - PIN e indicador infantil de perfiles no se aplican

- Severidad: Medio
- Estado: Confirmado
- Area: Seguridad
- Archivo: `apps/backend/src/profiles/profiles.service.ts`, `apps/frontend/src/main.tsx`
- Linea: servicio/controlador de perfiles; router
- Evidencia: `select` verifica propiedad pero no PIN; no existe endpoint de validacion. `isKids` no participa en consultas de catalogo y no hay UI de seleccion/gestion.
- Impacto: Las restricciones que sugiere el modelo no protegen perfiles ni filtran contenido.
- Como reproducir: Crear perfil con PIN/kids y seleccionarlo sin proporcionar PIN.
- Causa: Modelo creado antes que la politica y experiencia completa.
- Solucion recomendada: Definir seguridad de perfil, verificacion con rate limit y clasificacion de contenido antes de exponer la funcion.
- Esfuerzo estimado: Alto
- Prioridad: Proxima version
- Dependencias: Modelo de clasificacion etaria.

### MMX-012 - El ultimo progreso puede perderse al cerrar la pagina

- Severidad: Medio
- Estado: Confirmado
- Area: Video
- Archivo: `apps/frontend/src/components/VideoPlayer.tsx`, `apps/frontend/src/lib/api.ts`
- Linea: guardado 55-64; `pagehide` 122-136
- Evidencia: `pagehide` llama `fetch` normal mediante `putJson`, sin `keepalive` ni `sendBeacon`, y silencia errores. El guardado periodico deja una ventana aproximada de 15 segundos.
- Impacto: Continuar viendo retrocede en cierres abruptos o navegacion movil.
- Como reproducir: Avanzar menos de un intervalo y cerrar inmediatamente la pestana; comparar historial.
- Causa: Peticion asincrona no garantizada durante unload.
- Solucion recomendada: Usar `keepalive`, beacon autenticable o persistencia local pendiente con reconciliacion.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: Estrategia CSRF/token para beacon.

### MMX-013 - Un procesamiento HLS puede quedar sin asociar al contenido

- Severidad: Medio
- Estado: Confirmado
- Area: Almacenamiento
- Archivo: `apps/frontend/src/admin/components/UploadField.tsx`, `apps/frontend/src/admin/processing/VideoProcessingAdminPage.tsx`
- Linea: 24-100 y tabla de trabajos
- Evidencia: `onUploaded` se completa tras HLS; si se cierra la pantalla, el trabajo continua. La pagina de trabajos muestra URL/estado, pero no ofrece asociar el resultado a episodio o pelicula.
- Impacto: Manifiestos validos quedan huerfanos y pueden ser eliminados por limpieza.
- Como reproducir: Iniciar procesamiento, cerrar formulario y esperar a que termine desde trabajos.
- Causa: El job no conserva intencion de destino ni flujo de recuperacion.
- Solucion recomendada: Persistir target/draft y permitir aplicar un resultado completado.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: Modelo de borrador de contenido.

### MMX-014 - Listados y estadisticas no escalan por falta de paginacion

- Severidad: Medio
- Estado: Confirmado
- Area: Rendimiento
- Archivo: servicios de `series`, `movies`, `users`, `comments` y `admin/storage.service.ts`
- Linea: metodos `list`, `listAdmin`, `stats`
- Evidencia: Varias rutas cargan colecciones completas; comentarios limita a 200 sin cursor y storage carga todos los MediaFile y URL de contenido para filtrar en memoria.
- Impacto: Latencia y memoria crecen linealmente; panel y home se degradan con catalogos grandes.
- Como reproducir: Poblar decenas de miles de registros y perfilar las rutas indicadas.
- Causa: Contratos de lista sin paginacion uniforme y agregaciones en aplicacion.
- Solucion recomendada: Introducir page/cursor, limites maximos y agregaciones SQL.
- Esfuerzo estimado: Alto
- Prioridad: Proxima version
- Dependencias: Cambios coordinados API/frontend.

### MMX-015 - Rate limiting local no funciona como limite global

- Severidad: Medio
- Estado: Confirmado
- Area: Seguridad
- Archivo: `apps/backend/src/app.module.ts`
- Linea: configuracion `ThrottlerModule` 32-37 aprox.
- Evidencia: Se usa almacenamiento en memoria aunque Redis ya forma parte de la arquitectura.
- Impacto: Cada replica/reinicio tiene contadores propios, debilitando fuerza bruta y limites en despliegue horizontal.
- Como reproducir: Ejecutar dos replicas y alternar peticiones entre ellas.
- Causa: Backend de throttling predeterminado.
- Solucion recomendada: Usar storage Redis compartido y politicas especificas para login/reset/uploads.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: Alta disponibilidad de Redis.

### MMX-016 - Readiness ejecuta un proceso ffprobe por solicitud

- Severidad: Medio
- Estado: Confirmado
- Area: Rendimiento
- Archivo: `apps/backend/src/health.controller.ts`, `docker-compose.yml`
- Linea: `ready`; healthcheck backend
- Evidencia: Readiness lanza `ffprobe -version`; los healthchecks y monitores pueden repetirlo continuamente.
- Impacto: Creacion innecesaria de procesos y falsos negativos bajo carga.
- Como reproducir: Consultar `/api/health/ready` en bucle y observar procesos.
- Causa: Verificacion de binario no cacheada.
- Solucion recomendada: Comprobar al arrancar y cachear resultado; dejar readiness para dependencias vivas.
- Esfuerzo estimado: Bajo
- Prioridad: Proxima version
- Dependencias: Ninguna.

### MMX-017 - SiteSetting no garantiza una unica fila

- Severidad: Medio
- Estado: Riesgo potencial
- Area: Base de datos
- Archivo: `apps/backend/prisma/schema.prisma`, servicio de settings
- Linea: modelo `SiteSetting`; `findFirst` seguido de `create`
- Evidencia: No hay clave singleton unica; dos inicializaciones concurrentes pueden crear filas y `findFirst` volver la configuracion no determinista.
- Impacto: Configuracion visual divergente o actualizacion de una fila distinta.
- Como reproducir: Ejecutar primeras lecturas concurrentes sobre una base vacia.
- Causa: Patron singleton aplicado solo en codigo.
- Solucion recomendada: Clave fija unica y `upsert`; migrar duplicados de forma controlada.
- Esfuerzo estimado: Bajo
- Prioridad: Proxima version
- Dependencias: Migracion de datos.

### MMX-018 - Cobertura de pruebas insuficiente para flujos criticos

- Severidad: Medio
- Estado: Confirmado
- Area: Otro
- Archivo: archivos `*.spec.ts` del repositorio
- Linea: suite completa
- Evidencia: 18 archivos de prueba totales; no hay integracion HTTP/DB ni E2E de login, guards, CRUD, upload, player, backups o Docker.
- Impacto: Regresiones de permisos y contratos pueden pasar con todo verde.
- Como reproducir: Enumerar specs y comparar con modulos/rutas.
- Causa: Enfoque principal en utilidades y servicios mockeados.
- Solucion recomendada: Piramide con integracion Nest+Postgres temporal y E2E de recorridos principales.
- Esfuerzo estimado: Alto
- Prioridad: Proxima version
- Dependencias: Fixtures y entorno CI.

### MMX-019 - CI omite seguridad, Docker y validacion integral

- Severidad: Medio
- Estado: Confirmado
- Area: Docker
- Archivo: `.github/workflows/ci.yml`
- Linea: workflow completo
- Evidencia: Ejecuta install, lint, typecheck, test, build y Prisma validate; no ejecuta audit, Docker build, E2E, health, migraciones contra DB ni escaneo de imagen.
- Impacto: Una rama puede aprobar aunque falle el despliegue o incorpore vulnerabilidades conocidas.
- Como reproducir: Revisar jobs del workflow y compararlos con el pipeline operativo.
- Causa: CI centrado en compilacion Node.
- Solucion recomendada: Agregar jobs graduados, SBOM/scan, Compose smoke test y reglas de severidad revisables.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: MMX-018 y politica de vulnerabilidades.

### MMX-020 - Uploads y FFmpeg carecen de cuotas de recursos

- Severidad: Medio
- Estado: Riesgo potencial
- Area: Docker
- Archivo: `docker-compose.yml`, `nginx/default.conf`, servicios de uploads
- Linea: limites y servicios backend/worker
- Evidencia: Se admiten cargas de hasta 2048 MB, concatenacion/checksum/ffprobe en cierre de upload y FFmpeg en worker, sin limites CPU/memoria/disco del stack.
- Impacto: Disco lleno, presion de memoria o saturacion CPU pueden afectar todo el host.
- Como reproducir: Ejecutar varias cargas/procesamientos grandes y observar recursos/volumen.
- Causa: Limites de archivo sin presupuesto operativo agregado.
- Solucion recomendada: Cuotas, concurrencia de worker, reserva de disco, alertas y limpieza por TTL.
- Esfuerzo estimado: Medio
- Prioridad: Proxima version
- Dependencias: Capacidad real del servidor.

## 15. Hallazgos bajos

### MMX-021 - El lint no aplica reglas de calidad

- Severidad: Bajo
- Estado: Confirmado
- Area: Otro
- Archivo: `package.json`, archivos compactados de search/lists/profiles
- Linea: scripts `lint`
- Evidencia: Lint equivale a `tsc --noEmit`; no hay ESLint. Algunos modulos complejos estan escritos en una sola linea.
- Impacto: Errores de hooks, promesas y mantenibilidad quedan fuera del control automatico.
- Como reproducir: Revisar el script y configuraciones del repositorio.
- Causa: Nombre de script mas amplio que su implementacion.
- Solucion recomendada: Incorporar ESLint incremental sin reformateo masivo.
- Esfuerzo estimado: Medio
- Prioridad: Posterior
- Dependencias: Acordar reglas.

### MMX-022 - Variables documentadas, usadas y propagadas no coinciden

- Severidad: Bajo
- Estado: Confirmado
- Area: Docker
- Archivo: `.env.example`, `docker-compose.yml`, codigo de configuracion
- Linea: archivos completos
- Evidencia: Variables SMTP/verificacion/autoplay no se consumen; `JWT_REFRESH_COOKIE_MAX_AGE_MS` se usa pero Compose no la pasa; scripts requieren variables del shell.
- Impacto: Operadores creen activar funciones o ajustes que no cambian el contenedor.
- Como reproducir: Comparar `process.env`, interpolaciones Compose y `.env.example`.
- Causa: Evolucion asincrona de configuracion.
- Solucion recomendada: Fuente unica y test que compare variables conocidas.
- Esfuerzo estimado: Bajo
- Prioridad: Posterior
- Dependencias: MMX-005 y MMX-010.

### MMX-023 - Las lecturas inflan contadores de vistas

- Severidad: Bajo
- Estado: Confirmado
- Area: Base de datos
- Archivo: servicios de series, episodes y movies
- Linea: consultas de detalle
- Evidencia: Obtener detalle incrementa vistas; recarga, prefetch o bot cuentan como reproduccion. El registro de ViewLog tampoco es uniforme entre peliculas y episodios.
- Impacto: Rankings y analitica pierden precision.
- Como reproducir: Consultar repetidamente un detalle y observar `views`.
- Causa: Metrica asociada a GET, no a evento de reproduccion validado.
- Solucion recomendada: Registrar vista al iniciar playback con deduplicacion temporal.
- Esfuerzo estimado: Medio
- Prioridad: Posterior
- Dependencias: Identidad/sesion y politica analitica.

### MMX-024 - Reintentos HLS y peso del reproductor son mejorables

- Severidad: Bajo
- Estado: Confirmado
- Area: Video
- Archivo: `apps/frontend/src/components/VideoPlayer.tsx`
- Linea: manejador de errores HLS e import de `hls.js`
- Evidencia: El contador de reintentos avanza tambien en ramas que no consumen el mismo tipo de retry; el bundle HLS es grande para usuarios MP4/embed.
- Impacto: Menos intentos utiles y descarga inicial mayor.
- Como reproducir: Simular errores fatal network/media y revisar bundle del build.
- Causa: Estado de retry compartido e import estatico.
- Solucion recomendada: Contadores por error y carga dinamica de HLS.js.
- Esfuerzo estimado: Bajo
- Prioridad: Posterior
- Dependencias: Pruebas de player.

### MMX-025 - La auditoria puede perder eventos administrativos

- Severidad: Bajo
- Estado: Confirmado
- Area: Seguridad
- Archivo: `apps/backend/src/audit/audit.interceptor.ts`, servicios de auth/audit
- Linea: captura de persistencia
- Evidencia: El interceptor permite que la mutacion tenga exito si falla guardar auditoria; en auth algunas escrituras si se esperan, creando politica inconsistente.
- Impacto: Trazabilidad incompleta en incidentes de DB parcial.
- Como reproducir: Provocar fallo de tabla audit y ejecutar una mutacion admin.
- Causa: Auditoria best-effort sin cola durable.
- Solucion recomendada: Definir garantia, alertar fallos y usar outbox/cola para eventos obligatorios.
- Esfuerzo estimado: Medio
- Prioridad: Posterior
- Dependencias: Requisitos de cumplimiento.

### MMX-026 - Manejo de disponibilidad API no es uniforme

- Severidad: Bajo
- Estado: Confirmado
- Area: Frontend
- Archivo: `apps/frontend/src/lib/api.ts`, `site-settings.tsx`, `useAsync.ts`
- Linea: `apiText`, `apiBlob`, uploads y catches
- Evidencia: Solo `api` informa consistentemente eventos gateway; texto/blob/XHR no. Settings silencia error y comentarios no siempre presentan estado de fallo. Las peticiones desmontadas no se cancelan.
- Impacto: Indicador de mantenimiento y feedback pueden divergir; queda trafico innecesario.
- Como reproducir: Cortar backend durante descarga/upload/settings y comparar con una llamada JSON.
- Causa: Cuatro clientes HTTP con logica duplicada.
- Solucion recomendada: Cliente comun, AbortSignal y politica visible de errores.
- Esfuerzo estimado: Medio
- Prioridad: Posterior
- Dependencias: MMX-006.

### MMX-027 - PWA carece de iconos raster estandar

- Severidad: Bajo
- Estado: Riesgo potencial
- Area: Frontend
- Archivo: `apps/frontend/public/manifest.webmanifest`, `pwa-icon.svg`
- Linea: manifest completo
- Evidencia: La instalacion depende de un SVG con `sizes:any`; no hay PNG 192/512 ni apple-touch-icon.
- Impacto: Instalacion o presentacion inconsistente en algunos navegadores/plataformas.
- Como reproducir: Auditar instalabilidad en Safari/iOS y Lighthouse.
- Causa: Set minimo de activos PWA.
- Solucion recomendada: Agregar iconos raster y pruebas de manifest.
- Esfuerzo estimado: Bajo
- Prioridad: Posterior
- Dependencias: Identidad visual final.

### MMX-028 - Superficie backend sin experiencia frontend

- Severidad: Bajo
- Estado: Confirmado
- Area: Otro
- Archivo: controladores de auth, profiles, lists, search, comments e invitations; router frontend
- Linea: rutas correspondientes
- Evidencia: Registro, forgot/reset, perfiles, listas, buscador, reportar/editar comentario e invitaciones no tienen consumidores/pantallas completas, aunque varias aparecen en el modelo del producto.
- Impacto: Funciones parcialmente mantenidas y expectativas incumplidas; aumenta superficie API.
- Como reproducir: Cruzar decoradores de controladores con cadenas API del frontend.
- Causa: Desarrollo backend adelantado respecto de UI.
- Solucion recomendada: Completar por prioridad o declarar endpoints internos/experimentales y probarlos.
- Esfuerzo estimado: Alto
- Prioridad: Posterior
- Dependencias: MMX-010 y MMX-011.

### MMX-029 - Procesos web conservan privilegios root parciales

- Severidad: Bajo
- Estado: Riesgo potencial
- Area: Docker
- Archivo: Dockerfiles, entrypoint backend, imagen Nginx
- Linea: usuario/entrypoint
- Evidencia: Backend arranca como root para ajustar permisos recursivos antes de bajar a `node`; Nginx usa su master predeterminado. No se observo escalada explotable.
- Impacto: Amplia el impacto de una vulnerabilidad de contenedor y hace costoso el arranque con muchos uploads.
- Como reproducir: Inspeccionar usuarios/procesos dentro de contenedores.
- Causa: Preparacion de volumen en tiempo de inicio y defaults de imagen.
- Solucion recomendada: Aprovisionar UID/GID y permisos fuera del proceso web; evaluar imagen Nginx no-root.
- Esfuerzo estimado: Medio
- Prioridad: Posterior
- Dependencias: Estrategia de despliegue/volumen.

## 16. Seguridad

Puntos positivos: bcrypt, secretos obligatorios con longitud minima, JWT de acceso corto, refresh token rotado y hasheado en DB, cookie HttpOnly con SameSite, guards de rol en `/admin`, DTO global con whitelist, validacion de URL/embed, nombres de upload generados y Nginx sin directory listing. `.env` esta ignorado y no se encontro un secreto versionado.

Prioridades: cerrar MMX-001/MMX-002/MMX-003, actualizar Multer, compartir throttling y completar PIN/recuperacion. El uso de cookie refresh con SameSite reduce CSRF, pero cualquier futura configuracion cross-site debe incorporar defensa CSRF explicita. No se encontro SQL manual vulnerable ni path traversal confirmado.

## 17. Rendimiento

Los riesgos principales son colecciones sin paginar, estadisticas en memoria, proceso ffprobe por readiness, falta de cancelacion HTTP y cuotas ausentes para cargas/FFmpeg. Los indices actuales son amplios (87 indices inspeccionados). Como optimizacion condicionada por volumen, `Comment(episodeId,status,createdAt)` serviria la consulta publica; `Series(featured,updatedAt)` serviria destacados. Las busquedas `ILIKE '%texto%'` no aprovechan B-tree y requeriran `pg_trgm` solo si las metricas justifican el cambio.

## 18. Base de datos

Prisma valida y las 14 migraciones estan aplicadas. Las migraciones agregan correctamente checks para exactamente un target en Favorite, WatchHistory, ContentListItem y SubtitleTrack, indices unicos parciales para perfiles nulos y subtitulos predeterminados. No se debe duplicar esas restricciones en una migracion sin revisar SQL existente.

Riesgos: singleton de SiteSetting, politica inconsistente de soft delete y analitica. No se confirmaron relaciones huerfanas actuales ni drift. Cascadas deben probarse con datos reales antes de cambiarse.

## 19. Frontend

El router protege sesion y rol admin, usa lazy loading, estados de carga y errores reutilizables. El access token no persiste en localStorage, una mejora de seguridad respecto de la especificacion inicial. Persisten MMX-006, MMX-009, MMX-012, MMX-013 y MMX-026. Las areas registro, perfiles, listas y busqueda no cuentan con experiencia completa.

## 20. Backend

Nest esta modularizado, aplica ValidationPipe, filtro de excepciones, request ID, CORS configurable, guards y auditoria. Los defectos de mayor impacto son visibilidad publica, filtros de publicacion y listas sin paginar. Los DTO administrativos reducen asignacion masiva y los errores Prisma de episodios se traducen a mensajes de dominio.

## 21. Reproductor y video

Hay soporte MP4, HLS.js con fallback Safari, Google Drive preview, embed con allowlist, subtitulos, progreso, siguiente/anterior y pantalla completa. Nginx conserva Range para MP4 y el service worker excluye Range, API y media. Deben corregirse autorizacion HLS, guardado final de progreso y retry. No se detecto carga completa del MP4 en RAM en la entrega normal.

## 22. Almacenamiento

El adaptador local/S3, checksum, validacion ffprobe, upload reanudable, temporales, inventario y limpieza de huerfanos son una base solida. El volumen `./uploads:/app/uploads` persiste y se comparte donde corresponde. Quedan el flujo de jobs sin asociar, cuotas operativas, validacion de espacio libre y consistencia backup/restore.

## 23. Docker y despliegue

Compose evita conflictos: solo `8088` es publico; backend 3000, frontend 8080, PostgreSQL 5432 y Redis 6379 son internos. Hay healthchecks y dependencias por condicion, restart policy, volumen DB/uploads y builds multi-stage. Faltan limites de recursos, prueba limpia CI, hardening no-root y un procedimiento de migracion/rollback de produccion.

## 24. Dependencias

Auditoria de runtime: 11 avisos (8 moderados, 3 altos). Multer es explotable en una ruta real y se trata en MMX-004. Nest/body-parser/qs/file-type y React Router requieren evaluacion de versiones y rutas afectadas. Auditoria total: 28 avisos; la mayoria de los altos/critico adicionales pertenecen a webpack/tmp/glob/ajv/esbuild y tooling de build, no al Nginx estatico en ejecucion. `@vitejs/plugin-react` esta en `dependencies` del frontend aunque solo se usa al construir.

No se recomienda ejecutar una actualizacion automatica mayor: crear rama, actualizar por grupos, leer changelogs y repetir tests, Docker y E2E.

## 25. Pruebas faltantes

| Modulo | Tiene pruebas | Tipo actual | Cobertura estimada | Prioridad |
| --- | ---: | --- | ---: | --- |
| Autenticacion/roles/sesiones | No | - | Muy baja | Inmediata |
| Usuarios/perfiles | No | - | Muy baja | Alta |
| Peliculas/series/temporadas | No | - | Muy baja | Alta |
| Episodios/importacion | Si | Unidad con mocks | Media | Alta |
| Reproductor | Parcial | Preferencias puras | Baja | Alta |
| Progreso/historial | Si | Servicio/utilidad | Baja-media | Alta |
| Favoritos | Si | Servicio con mocks | Media | Media |
| Comentarios/listas/busqueda | No | - | Muy baja | Alta |
| Uploads/storage/media | Si | Utilidad/servicio | Media | Alta |
| Subtitulos | Si | Parser/utilidad | Baja | Media |
| Auditoria | Si | Sanitizador/admin | Media | Media |
| Backups/Docker | No | - | Nula | Inmediata |

Faltan cobertura cuantitativa, pruebas de contrato HTTP, Postgres real temporal, browsers y recorrido `login -> catalogo -> playback -> progreso -> admin`.

## 26. Documentacion

README, API y documentos de storage/video son extensos y mayormente coinciden con puertos y arquitectura. Las instrucciones de backup omiten exportar/cargar variables; SMTP/verificacion aparentan estar disponibles sin implementacion; falta runbook de restore probado, capacidad minima de disco y matriz de compatibilidad del player. No hay especificacion OpenAPI generada que permita detectar drift automaticamente.

## 27. Funciones incompletas

- Recuperacion y verificacion de correo: API parcial, sin entrega ni UI.
- Perfiles: CRUD backend sin selector UI, PIN ni filtro kids efectivos.
- Listas personalizadas: backend sin pagina frontend.
- Buscador: endpoint sin interfaz de busqueda.
- Invitaciones: endpoints admin sin gestion completa en panel.
- Comentarios propios: editar/reportar no se expone en UI.
- Recuperacion de trabajos HLS: no se puede asociar un resultado abandonado.

## 28. Codigo aparentemente no utilizado

No se confirmo un modelo Prisma totalmente muerto: los modelos tienen servicios, migraciones o tareas operativas asociadas. Si aparecen como no usados en frontend, `Profile`, `ContentList`, `Invitation` y tokens de recuperacion siguen teniendo API/backend. Variables SMTP/verificacion/autoplay carecen de lectura confirmada. Antes de eliminar cualquier superficie se debe revisar consumidores externos, pues la busqueda estatica solo cubre este monorepo.

## 29. Endpoints sin uso

No tienen consumidor frontend confirmado: `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, varias revocaciones de sesion, CRUD/seleccion de `/profiles`, `/me/lists`, `/search`, editar/reportar comentarios, invitaciones administrativas y encolado manual de procesamiento. El detalle completo esta en `docs/API_INCONSISTENCIES.md`.

## 30. Componentes con endpoints inexistentes

No se encontro una llamada frontend confirmada hacia un endpoint inexistente. Las cadenas consumidas de favoritos, historial, media, subtitulos, auditoria y CRUD admin tienen controlador correspondiente. El problema es principalmente superficie backend no consumida y semantica divergente, no rutas 404 por contrato.

## 31. Variables de entorno

Los secretos criticos se validan por presencia y longitud y `.env` no esta versionado. No se publican valores reales en este informe. Hay drift entre ejemplo, Compose, codigo y scripts: cookie refresh no propagada, variables SMTP/verificacion sin implementacion y variables operativas de backup dependientes del shell. La matriz completa esta en `docs/ENVIRONMENT_AUDIT.md`.

## 32. Deuda tecnica

- Politica de visibilidad repetida entre servicios.
- Multiples clientes HTTP frontend con tratamiento distinto.
- Servicios/componentes con varias responsabilidades.
- Lint nominal sin analisis estatico real.
- Sin contrato OpenAPI ni tests de contrato.
- Invariantes SQL avanzadas presentes solo en migraciones, no documentadas junto al schema.
- Operacion de backup/restore sin prueba automatizada ni objetivo RPO/RTO.

## 33. Mejoras rapidas

1. Proteger catalogo/API y omitir URL de video en DTO de listado.
2. Filtrar `deletedAt` y publicacion de padres en episodios/busqueda/peliculas admin.
3. Mostrar estado real de moderacion de comentarios.
4. Cachear la comprobacion de ffprobe.
5. Corregir propagacion/documentacion de variables y backup.

Estas mejoras requieren pruebas; no deben aplicarse directamente sobre produccion.

## 34. Mejoras de mediano plazo

Completar recuperacion de cuenta y perfiles, unificar cliente HTTP, paginar APIs, recuperar jobs HLS, introducir throttling Redis, actualizar dependencias por lotes, integrar pruebas HTTP/DB y agregar smoke test Compose a CI.

## 35. Mejoras de largo plazo

Autorizacion de media apta para CDN/HLS, politica central de entitlement, almacenamiento de objetos administrado, observabilidad de colas/disco/player, despliegue con rollback, restauraciones ensayadas y analitica de reproduccion basada en eventos deduplicados.

## 36. Plan recomendado de correccion

### Fase 0 - Bloqueadores

- Objetivo: confirmar que no existen secretos o perdida activa.
- Problemas incluidos: ninguno critico confirmado; congelar cambios de seguridad hasta tener tests.
- Orden: respaldar entorno de prueba, capturar baseline y crear casos de acceso anonimo.
- Riesgos: clasificar como critico un aviso de tooling sin explotabilidad.
- Pruebas necesarias: secret scan, smoke actual y snapshot de contratos.
- Resultado esperado: base reproducible para cambios.

### Fase 1 - Seguridad y datos

- Objetivo: cerrar acceso no autorizado y proteger restauracion.
- Problemas incluidos: MMX-001 a MMX-005, MMX-007, MMX-011, MMX-015, MMX-017.
- Orden: DTO/guards de catalogo, autorizacion HLS, soft delete, Multer, restore, PIN/throttling/singleton.
- Riesgos: romper reproduccion, cookies o enlaces existentes; bloqueo durante migracion singleton.
- Pruebas necesarias: matriz anonimo/USER/ADMIN, MP4/HLS, migracion con duplicados y restore aislado.
- Resultado esperado: contenido privado y datos recuperables con controles verificables.

### Fase 2 - Errores funcionales

- Objetivo: eliminar flujos enganosos o incompletos.
- Problemas incluidos: MMX-006, MMX-008 a MMX-013 y MMX-026/MMX-028 segun alcance.
- Orden: sesion, peliculas borradas, comentarios, progreso, jobs; despues recuperar cuenta/perfiles/UI.
- Riesgos: cambios de estado y compatibilidad API.
- Pruebas necesarias: E2E de recuperacion, moderacion, unload, procesamiento y CRUD.
- Resultado esperado: recorridos coherentes y errores visibles.

### Fase 3 - Calidad

- Objetivo: hacer cambios futuros mas seguros.
- Problemas incluidos: MMX-018, MMX-021, MMX-025 y deuda de modulos grandes.
- Orden: integracion auth/guards, DB, player; ESLint incremental; refactor con cobertura.
- Riesgos: refactor amplio o reglas que generan ruido.
- Pruebas necesarias: cobertura por comportamiento y no solo snapshots.
- Resultado esperado: CI detecta regresiones de dominio.

### Fase 4 - Rendimiento y escalabilidad

- Objetivo: controlar crecimiento de datos y media.
- Problemas incluidos: MMX-014, MMX-016, MMX-020, MMX-023, MMX-024.
- Orden: metricas/baseline, paginacion/agregaciones, health, cuotas, player/bundle.
- Riesgos: contratos paginados incompatibles e indices innecesarios.
- Pruebas necesarias: carga con volumen representativo, EXPLAIN ANALYZE y procesamiento concurrente.
- Resultado esperado: limites operativos conocidos y latencia estable.

### Fase 5 - Produccion

- Objetivo: despliegue, rollback y recuperacion repetibles.
- Problemas incluidos: MMX-005, MMX-019, MMX-022, MMX-027, MMX-029 y documentacion.
- Orden: CI Docker/security, runbooks, restore ensayado, hardening, PWA/documentos.
- Riesgos: cambios de UID/volumen y ventanas de mantenimiento.
- Pruebas necesarias: despliegue limpio, rollback, restore completo, health y navegador.
- Resultado esperado: candidato auditable para produccion.

## 37. Riesgos de aplicar los cambios

Proteger endpoints puede romper clientes que dependen de acceso anonimo; cambiar HLS puede invalidar URL guardadas; una migracion singleton requiere resolver duplicados; paginar cambia contratos; actualizar Multer/Nest puede modificar manejo multipart; cambiar UID puede dejar uploads sin permisos; restaurar requiere ventana y copia verificada. Cada cambio debe tener rollback, datos de prueba inventados y despliegue gradual.

## 38. Conclusion

MasMax esta tecnicamente operativo y tiene una base superior a un prototipo: build reproducible, servicios saludables, migraciones actuales, roles admin, sesiones rotadas, almacenamiento adaptable y pipeline de video separado. Aun no es apto para produccion privada porque las fronteras de acceso al contenido y HLS no cumplen esa promesa y la recuperacion operativa no esta probada.

Estado recomendado: **Apto con correcciones antes de produccion**. El orden correcto es seguridad/datos, errores funcionales, cobertura, escalabilidad y finalmente hardening/despliegue. No se recomienda reescribir el stack.

### Remediacion ejecutada - 2026-08-03

La conclusion anterior conserva el estado observado al iniciar la auditoria. Tras aplicar `docs/FIX_PLAN.md`, el candidato queda **apto para validacion preproductiva**, con MMX-018 aun parcial por ausencia de E2E destructivos automatizados.

| Hallazgo | Estado | Evidencia principal | Migracion | Riesgo residual |
| --- | --- | --- | --- | --- |
| MMX-001 | Corregido | Catalogo anonimo 401; USER sin campos de URL; admin 200 | N/A | Clientes anonimos antiguos deben autenticarse |
| MMX-002 | Corregido | Token HLS firmado, sesion/expiracion/path; alias publico 404 | N/A | Probar HLS real con cada CDN antes de produccion |
| MMX-003/007 | Corregido | Politica Prisma comun y pruebas de padres/temporadas/borradores | N/A | Estados futuros deben incorporarse a la politica central |
| MMX-004 | Corregido | Multer 2.2.0, limite de partes/archivos/MIME; audit runtime | N/A | `picomatch` transitivo de tooling en allowlist temporal |
| MMX-005 | Corregido | Checksum interno/externo, validate-only, mantenimiento y rollback | N/A | Restore completo debe ensayarse periodicamente en entorno aislado |
| MMX-008/009 | Corregido | Soft delete admin y feedback real de moderacion con tests | N/A | Ninguno conocido |
| MMX-012/016 | Corregido | Cola local monotona/keepalive y deteccion ffprobe cacheada | N/A | `pagehide` depende de limites del navegador; la cola reconcilia |
| MMX-017 | Corregido | `key` unico, consolidacion auditada y `upsert` | Si | Rollback manual requiere restaurar backup previo |
| MMX-018 | Parcial | 66 pruebas y smoke HTTP USER/ADMIN/anonimo | N/A | Faltan E2E de upload grande y restore destructivo |
| MMX-019/022 | Corregido | CI con PostgreSQL/Docker/audit/secret scan; inventario de 59 variables | N/A | Primera ejecucion del workflow remoto aun pendiente |

Validacion ejecutada: `npm ci`, Prisma generate/validate/migrate, lint, typecheck, 66 pruebas, builds host y Docker, `docker compose up -d`, health/readiness, matriz HTTP por rol, `sh -n` de operacion y auditoria de dependencias. Los procedimientos y rollback estan en `docs/BACKUP.md`, `docs/RESTORE.md`, `docs/DISASTER_RECOVERY.md` y `docs/HLS_AUTHORIZATION.md`.
