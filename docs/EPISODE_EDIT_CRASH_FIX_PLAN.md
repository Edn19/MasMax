# Episode edit crash fix plan

## Reproduccion y evidencia

La aplicacion desplegada se abrio en `http://localhost:8088/admin/episodes` con una sesion ADMIN existente. El episodio real `cmsfixc8g000313u6sxu1nx0t` (`3a`) con video HLS y un trabajo `COMPLETED` abre correctamente y no produjo errores de consola. La consulta de solo lectura a PostgreSQL confirmo que los episodios presentes tienen `publishedAt` valido.

El crash se reproduce con la forma historica que el frontend declara posible pero no valida: un episodio cuyo `publishedAt` llega `null` o ausente. El manejador actual ejecuta directamente:

```ts
item.publishedAt.slice(0, 10)
```

Error exacto:

```text
TypeError: Cannot read properties of null (reading 'slice')
    at editEpisode ([eval]:1:52)
    at [eval]:1:66
```

En la aplicacion, la expresion corresponde a `apps/frontend/src/admin/episodes/EpisodesAdminPage.tsx:43`, dentro de `edit(item)`. Al ejecutarse desde el evento `onClick`, el error ocurre fuera del render y un Error Boundary no puede interceptar ese evento. La prueba de regresion usara la misma forma legacy y debe fallar con la implementacion actual.

La verificacion integrada encontro ademas un segundo error al guardar el episodio HLS historico `cmsfixc8g000313u6sxu1nx0t` sin cambiar su video:

```text
PATCH /api/admin/episodes/cmsfixc8g000313u6sxu1nx0t 400
La URL del video no es valida
```

El registro conserva un manifiesto local `/uploads/hls/.../master.m3u8` y un original MKV local. El servicio llamaba `normalizeVideo` con esas referencias aunque `videoUrl` no estuviera presente en el DTO de actualizacion. La correccion normaliza solo un video enviado explicitamente y, en otro caso, conserva los campos actuales.

## Causa raiz

- El tipo `Episode` marca varios campos como siempre presentes, aunque respuestas historicas pueden contener valores nulos o relaciones omitidas.
- `edit(item)` construye el formulario directamente y llama `slice` sobre `publishedAt` sin normalizacion.
- El editor depende del objeto resumido del listado; no existe un endpoint ADMIN de detalle con una respuesta estable para editar.
- La seleccion de temporada se corrige automaticamente en un `useEffect`. Durante un cambio de serie puede observar temporalmente las temporadas anteriores y borrar el `seasonId` que se esta inicializando.
- El payload se construye inline y envia `seriesId` tambien en actualizacion, mezclando campos de creacion, relaciones y estado de UI.
- El service revalida el video historico durante cualquier `PATCH`; esto impide guardar metadatos de episodios HLS procesados cuyo original local es MKV.
- Los campos HTML `type="url"` rechazan rutas locales validas como `/uploads/images/...`; el navegador cancela el submit antes de ejecutar `submit`, sin error de API visible.
- Existe un Error Boundary global, pero su fallback sustituye toda la aplicacion. El panel no conserva sidebar ni una accion directa para volver al listado.

## Flujo propuesto

1. El boton Editar conserva solo el identificador y solicita `GET /api/admin/episodes/:id`.
2. El backend devuelve episodio, serie, temporada, subtitulos y el trabajo de procesamiento mas reciente, o un 404 claro.
3. Una funcion pura `episodeToFormState` normaliza strings, numeros, fecha, referencias de video y relaciones opcionales sin inventar IDs.
4. Una funcion pura `resolveEpisodeVideoState` representa: sin video, URL, job activo, job completado, fallido o cancelado.
5. La inicializacion protege la temporada deseada mientras se cargan las temporadas de la serie.
6. El guardado usa payloads explicitos distintos para crear y actualizar. La actualizacion envia `seasonId`, y el backend deriva `seriesId` desde esa temporada.
7. Abrir el editor nunca crea, reintenta ni reasigna un job. El job asociado se recupera desde PostgreSQL.
8. Los errores 400, 403, 404, 500 y de red se traducen a estados visibles sin promesas sin manejar.
9. Un Error Boundary administrativo conserva la navegacion y permite volver al listado.

## Archivos previstos

- `apps/frontend/src/admin/episodes/EpisodesAdminPage.tsx`
- `apps/frontend/src/admin/episodes/episode-editor.ts`
- `apps/frontend/src/admin/episodes/episode-editor.spec.ts`
- `apps/frontend/src/admin/components/AdminErrorBoundary.tsx`
- `apps/frontend/src/admin/components/AdminErrorBoundary.spec.tsx`
- `apps/frontend/src/admin/AdminShell.tsx`
- `apps/frontend/src/types/models.ts`
- `apps/frontend/package.json`
- `apps/backend/src/episodes/episodes.controller.ts`
- `apps/backend/src/episodes/episodes.service.ts`
- `apps/backend/src/episodes/dto.ts`
- pruebas de controller, DTO y service de episodios
- `README.md` o documentacion tecnica si cambia el contrato publico administrativo

No se preve una migracion Prisma: el problema esta en el contrato de lectura y la normalizacion. No se modificaran ni eliminaran episodios, videos o trabajos existentes.

## Pruebas

- Normalizacion de episodio completo y variantes sin descripcion, thumbnail, video, fecha o relaciones anidadas.
- Video con URL MP4, HLS, job activo, completado, inexistente y sin referencia.
- Seleccion derivada de serie y temporada sin inventar IDs.
- Payload de actualizacion sin `seriesId`, objetos, archivos ni campos de UI.
- Endpoint de detalle con video, job y ausencia de episodio.
- Actualizacion que conserva el video cuando no se modifica, cambia temporada y rechaza duplicados.
- Error Boundary administrativo y mensajes por estado HTTP.
- Verificacion de que abrir el editor no crea ni reasigna trabajos.

## Riesgos

- Cambiar el contrato de actualizacion puede afectar formularios que todavia envien `seriesId`.
- Una temporada historica inconsistente podria no pertenecer a una serie activa; se mostrara error en lugar de seleccionar otra temporada.
- La carga de detalle agrega una solicitud al abrir el editor.
- Un job antiguo sin `inputMediaFile` debe presentarse sin acceder a relaciones nulas.

## Rollback

La correccion se puede revertir por archivos sin tocar base de datos. El endpoint de detalle es aditivo. La eliminacion de `seriesId` de `UpdateEpisodeDto` debe revertirse junto con el constructor de payload frontend y la derivacion de serie en el service. No hay migraciones ni transformaciones de datos que deshacer.

## Criterios de aceptacion

- Todos los episodios actuales y formas legacy cubiertas abren sin excepcion.
- Serie, temporada y referencias de video se conservan.
- Guardar no duplica jobs ni pierde el video cuando no se modifica.
- Los errores se muestran dentro del panel.
- Lint, typecheck, tests, build, Prisma y Docker pasan.
