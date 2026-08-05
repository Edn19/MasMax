# Plan de trabajos de video persistentes

## Auditoria actual

- `VideoProcessingJob` ya persiste en PostgreSQL el solicitante, archivo de entrada, estado, etapa, progreso, salida HLS, destino, errores, intentos y fechas. No se requieren campos duplicados ni una migracion nueva.
- BullMQ solo transporta `processingJobId`; el worker vuelve a consultar PostgreSQL y FFmpeg no depende del componente React.
- El worker limita actualizaciones derivadas de FFmpeg a una por segundo y persiste cambios de etapa.
- `ResumableUpload` representa exclusivamente fragmentos que el navegador todavia debe enviar. Sus sesiones completadas no aparecen en la consulta de uploads activos.
- `UploadField` conserva el job en `useState` y realiza polling local. Al desmontarse pierde la referencia visual, aunque el worker continua.
- `VideoProcessingAdminPage` mantiene un segundo polling independiente. Esto duplica consultas cuando coincide con `UploadField`.
- No existe un store global de jobs. El proyecto tampoco usa Zustand, por lo que se incorporara un unico Context provider en la raiz autenticada.
- Cambiar de ruta no llama a cancelar. La cancelacion existente solo se solicita desde botones explicitos y el worker termina FFmpeg mediante `cancelRequested`.
- Los jobs pueden asociarse al terminar. Si el contenido ya existe, el formulario puede configurar `targetType` y `targetId` inmediatamente despues de subir.

## Cambios previstos

1. Mantener `VideoProcessingJob` como fuente de verdad y agregar consultas protegidas para jobs activos y por target, conservando las rutas actuales por compatibilidad.
2. Permitir configurar el target de un job existente. Si ya termino, asociar la salida HLS inmediatamente; si sigue activo, el worker la asociara al completar.
3. Crear un provider global de procesamiento, montado junto a autenticacion, con una sola cadena de polling y proteccion contra solicitudes simultaneas.
4. Cargar jobs desde PostgreSQL al iniciar o recuperar una sesion ADMIN, mantenerlos al navegar y detener polling cuando no haya activos.
5. Sustituir los pollings de `UploadField` y `VideoProcessingAdminPage` por el store global.
6. Mostrar el aviso de volver a seleccionar un archivo solo para sesiones `INITIATED` o `UPLOADING` que necesitan continuar desde el navegador.
7. Mostrar un indicador persistente en el panel con cantidad, archivo, etapa y porcentaje, enlazado a `/admin/processing`.
8. Recuperar el job por target al editar peliculas o episodios existentes; conservar asociacion manual para contenido que aun no existia al iniciar la subida.
9. Mantener cancelacion exclusivamente explicita, con confirmacion, y reintento para estados fallidos o cancelados.

## Riesgos y decisiones

- Una recarga no puede reconstruir un `File` del navegador. Solo uploads realmente incompletos pediran seleccionar el mismo archivo.
- Un job sin target seguira visible globalmente y podra asociarse desde Procesamiento. No se crearan contenidos incompletos automaticamente.
- El provider solo consulta endpoints administrativos cuando la sesion restaurada pertenece a un ADMIN.
- El polling se ejecutara cada 2.5 segundos mientras haya jobs activos y no iniciara una segunda solicitud si la anterior sigue pendiente.
- Se mantendran las rutas antiguas para no romper clientes o auditoria existentes.

## Pruebas

- Clasificacion separada de upload incompleto y job activo.
- Recuperacion y mezcla de jobs tras recarga o polling.
- Un job activo suprime el mensaje de volver a seleccionar archivo.
- Un upload pausado conserva el mensaje de reanudacion.
- Consultas backend de jobs activos y por target.
- Configuracion de target durante procesamiento y asociacion de jobs completados.
- Cancelacion y reintento siguen protegidos y persistidos.
- Lint, typecheck, tests, build, Prisma, Docker Compose y healthchecks.

## Criterios de salida

- Navegar o recargar no detiene el worker ni pierde el progreso visible al volver.
- Existe una sola fuente de polling de jobs en frontend.
- El mensaje de seleccion local nunca aparece como sustituto de un job FFmpeg activo.
- Los jobs completados y fallidos permanecen consultables.
- Solo ADMIN puede listar, cancelar, reintentar, configurar o asociar trabajos.
