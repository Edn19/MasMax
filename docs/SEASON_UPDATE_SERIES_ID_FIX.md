# Correccion de `seriesId` al actualizar temporadas

## Causa raiz

`SeasonsAdminPage` construye un unico payload para crear y actualizar temporadas. Ese objeto siempre incluye `seriesId`, aunque `PATCH /api/admin/seasons/:id` recibe `UpdateSeasonDto`, que deliberadamente no admite esa propiedad. La `ValidationPipe` global usa `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`, por lo que el backend rechaza el body con `property seriesId should not exist`.

## Payload actual

Tanto `POST /api/admin/seasons` como `PATCH /api/admin/seasons/:id` reciben desde el frontend:

```ts
{
  seriesId,
  number,
  title,
  description,
  posterUrl,
  published,
}
```

## DTO actual

- `CreateSeasonDto` acepta y exige `seriesId`; la serie se identifica en el body de `POST /api/admin/seasons`.
- `UpdateSeasonDto` acepta solamente `number`, `title`, `description`, `posterUrl` y `published` como campos opcionales.
- El endpoint de listado usa `GET /api/admin/series/:seriesId/seasons`; la ruta de creacion no contiene el identificador de serie.

## Diferencia entre crear y editar

La creacion necesita `seriesId` para establecer la relacion. La edicion normal no debe aceptar ese campo porque mover una temporada a otra serie podria invalidar sus episodios asociados y no forma parte del flujo funcional. El frontend debe construir dos objetos explicitos y separados.

## Archivos a modificar

- `apps/frontend/src/admin/seasons/SeasonsAdminPage.tsx`: usar payloads separados.
- `apps/frontend/src/admin/seasons/season-payload.ts`: contratos y constructores puros para create/update.
- `apps/frontend/src/admin/seasons/season-payload.spec.ts`: regresiones del body y rutas.
- `apps/frontend/package.json`: incluir la prueba nueva.
- `apps/backend/src/seasons/dto.spec.ts`: validar el contrato estricto de ambos DTO.
- `apps/backend/src/seasons/seasons.service.spec.ts`: verificar actualizacion, 404 y conservacion de la serie.
- `apps/backend/src/seasons/seasons.controller.spec.ts`: verificar rutas y guards ADMIN.

## Riesgos

- Omitir `seriesId` tambien en creacion impediria crear temporadas.
- Permitirlo en `UpdateSeasonDto` habilitaria cambios de relacion no contemplados.
- Construir el body con spread del formulario podria reintroducir campos no permitidos.
- Cambiar normalizacion de cadenas o valores vacios podria alterar el comportamiento actual.

## Pruebas

- Creacion: incluye `seriesId`, usa el endpoint POST real y conserva poster/publicacion.
- Actualizacion: excluye `seriesId`, usa el endpoint PATCH real y conserva poster/publicacion.
- DTO: create rechaza ausencia de `seriesId`; update rechaza `seriesId` bajo la misma configuracion estricta de produccion.
- Servicio: actualiza campos permitidos, no escribe `seriesId` y devuelve 404 para una temporada inexistente.
- Controlador: las rutas siguen protegidas por `JwtAuthGuard` y `AdminGuard`.
- Flujo manual: editar descripcion, poster y publicacion; comprobar relacion original; crear una temporada nueva.

## Criterios de aceptacion

- Editar una temporada no produce `property seriesId should not exist`.
- Crear una temporada sigue enviando el identificador de serie requerido.
- Un PATCH normal no puede mover una temporada entre series.
- La validacion global estricta permanece activa.
- No se usan `any` ni `@ts-ignore`.
- Lint, typecheck, tests, build, Prisma y Docker finalizan correctamente.

## Revision de CRUD relacionados

- Episodios: el frontend envia `seriesId` y `seasonId` al editar, pero `UpdateEpisodeDto` los declara opcionales y el servicio valida que la temporada pertenezca a la serie. Es una operacion admitida por su contrato, no el mismo defecto.
- Peliculas: create y update comparten campos escalares y listas aceptados por sus DTO; no se envia un identificador de relacion prohibido.
- Series: create y update comparten el formulario y el DTO de update admite esos campos; no aparece un ID de relacion adicional.
- Generos: el contrato de create/update es simetrico y no contiene relaciones movibles.
- Subtitulos: la creacion multipart incluye `episodeId` o `movieId`; la edicion envia solo metadatos de pista. Ya separa ambos flujos.

No se requieren cambios fuera de temporadas.
