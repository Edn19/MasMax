# Plan de estabilizacion de subidas reanudables

## Flujo actual auditado

1. `UploadField` crea o recupera una sesion autenticada y entrega el `File` a `resumable-upload.ts`.
2. El backend persiste en PostgreSQL el tamano total, `chunkSize`, cantidad de partes, partes confirmadas, checksum y vencimiento.
3. El cliente usa el `chunkSize` devuelto por la sesion para cortar una sola parte, calcula SHA-256 y envia `file`, `index` y `checksum` como multipart.
4. Multer escribe la parte en `uploads/tmp`; el servicio comprueba indice, tamano exacto y checksum antes de moverla a `uploads/tmp/resumable/:id`.
5. Al completar, el backend verifica todas las partes, ensambla mediante streams, comprueba tamano/checksum final, valida con FFprobe y registra el archivo.

## Limites encontrados

- Chunk frontend: el valor `session.chunkSize` devuelto por el backend; para sesiones actuales, normalmente 8 MiB.
- Chunk guardado en sesion: `RESUMABLE_CHUNK_SIZE_MB * 1024 * 1024`; no cambia durante la vida de la sesion.
- Multer por fragmento: exactamente `RESUMABLE_CHUNK_SIZE_MB * 1024 * 1024`.
- Video completo: `VIDEO_MAX_UPLOAD_SIZE_MB` o `MAX_VIDEO_UPLOAD_MB`, con valor recomendado 2048 MiB.
- Nginx: `client_max_body_size 2048M` global para todas las rutas.

## Causa confirmada

Multer usa como `fileSize` exactamente el tamano nominal del fragmento. La envoltura multipart y las diferencias de frontera hacen que una parte completa pueda disparar `LIMIT_FILE_SIZE` antes de que `ResumableUploadService` valide su tamano real. En un archivo de 915 MB, el primer chunk de 8 MB representa aproximadamente 0.9 % y uno de 16 MB aproximadamente 1.7 %, por eso el fallo aparece en esos porcentajes.

La autoridad sobre el tamano exacto debe seguir siendo `expectedPartSize`. Multer solo debe limitar abuso con un margen configurado, y Nginx debe permitir una peticion algo mayor que ese limite sin aceptar varios GB en todas las rutas.

## Cambios previstos

- Crear configuracion centralizada para limite total, chunk, margen de peticion, reintentos y vencimiento.
- Validar al arrancar enteros, rangos, finitud y relacion entre limites.
- Usar la misma configuracion en controlador y servicio.
- Configurar Multer con `chunk + overhead`, una sola parte y limites multipart explicitos.
- Traducir `LIMIT_FILE_SIZE` a un error util para subidas reanudables.
- Mantener el tamano persistido para sesiones antiguas de 8 MiB aunque la configuracion pase a 16 MiB.
- Hacer idempotente una parte repetida solo cuando tamano y checksum coincidan; responder conflicto si difiere.
- Restringir reintentos a errores transitorios, aplicar backoff exponencial con jitter y exponer el intento a la UI.
- Validar reanudacion con nombre, tamano, fecha de modificacion y MIME; conservar checksum cuando exista.
- Evitar anunciar 100 % antes de completar ensamblado y validacion.
- Dividir limites Nginx entre subida reanudable, video directo y resto de API.
- Normalizar variables en `.env.example`, Docker Compose, README y documentacion.

## Archivos a modificar

- `apps/backend/src/uploads/uploads.config.ts` y sus pruebas.
- `apps/backend/src/uploads/uploads.controller.ts`.
- `apps/backend/src/uploads/resumable-upload.service.ts` y utilidades/pruebas.
- `apps/backend/src/uploads/resumable-upload.dto.ts` y, si hace falta, Prisma/migracion para identidad persistente.
- `apps/backend/src/common/http-exception.filter.ts`.
- `apps/frontend/src/lib/resumable-upload.ts` y pruebas.
- `apps/frontend/src/admin/components/UploadField.tsx`.
- `nginx/default.conf`, `docker-compose.yml`, `.env.example`, `README.md` y `docs/RESUMABLE_UPLOADS.md`.

## Pruebas necesarias

- Configuracion para chunks de 8/16 MiB, margen y valores invalidos.
- Tamano esperado de parte normal, ultima parte, multiplo exacto y archivo menor que un chunk.
- Limite Multer mayor que un chunk completo y rechazo sobre el limite de peticion.
- Indices, tamanos, duplicados iguales/diferentes, sesiones vencidas/canceladas y propiedad por usuario.
- Politica de reintentos para red, 408/429/5xx y rechazo de 4xx no recuperables.
- Integracion con archivos temporales de 20 y 40 MiB, interrupcion, reanudacion, cancelacion, checksum y limite total.
- Lint, typecheck, tests, build, Prisma, Docker y prueba HTTP real por fragmentos.

## Riesgos

- Sesiones antiguas deben conservar su `chunkSize` persistido.
- El ensamblado necesita espacio temporal cercano al doble del archivo.
- Un proxy externo puede imponer un limite menor que Nginx.
- La seleccion del archivo tras recargar requiere accion del usuario por seguridad del navegador.
- Una prueba real de 915 MB consume tiempo y disco; los tests automatizados deben generar archivos temporales pequenos y dispersos cuando sea viable.

## Rollback

Los cambios de limites son compatibles con sesiones existentes. El rollback consiste en restaurar controlador, configuracion, cliente y Nginx; no requiere borrar sesiones, archivos, volumenes ni migraciones destructivas. Las partes persistidas conservan el `chunkSize` original y pueden reanudarse con la version previa si sigue aceptando ese valor.
