# Unicidad y actualizacion de temporadas

## Causa raiz

El esquema y PostgreSQL ya aplican la regla correcta de unicidad compuesta, pero el formulario administrativo reutilizaba originalmente el mismo body para crear y actualizar. Ese body incluia `seriesId` en el `PATCH`, aunque `UpdateSeasonDto` no permite mover una temporada entre series. La validacion global estricta lo rechazaba con `property seriesId should not exist`.

La correccion del payload se implementa junto con pruebas adicionales de la regla de negocio para evitar una regresion tanto en frontend como en backend.

## Restriccion actual

`Season.number` no tiene `@unique` global. El modelo contiene:

```prisma
@@unique([seriesId, number])
```

La migracion `20260802190000_seasons_and_bulk_episodes` creo el indice PostgreSQL `Season_seriesId_number_key` sobre `("seriesId", "number")`.

## Regla correcta de unicidad

- `Serie A + Temporada 1` y `Serie B + Temporada 1` son combinaciones validas.
- Dos temporadas con el mismo numero dentro de `Serie A` no son validas.
- El listado siempre filtra por `seriesId` y ordena por `number` ascendente.

## Diferencia entre crear y editar

- `POST /api/admin/seasons` recibe `seriesId` en `CreateSeasonDto` porque debe crear la relacion.
- `PATCH /api/admin/seasons/:id` recibe `UpdateSeasonDto`, que excluye `seriesId` y conserva la relacion existente.
- El frontend usa `CreateSeasonPayload` y `UpdateSeasonPayload` separados; no construye el body con un spread del formulario completo.

## Datos existentes

Comprobacion de solo lectura ejecutada el 4 de agosto de 2026:

- 9 temporadas.
- 5 series con temporadas.
- 0 combinaciones duplicadas de `seriesId + number`.
- 0 temporadas con `seriesId` huerfano.

Consultas de diagnostico equivalentes:

```sql
SELECT "seriesId", "number", COUNT(*)
FROM "Season"
GROUP BY "seriesId", "number"
HAVING COUNT(*) > 1;

SELECT s.id, s."seriesId"
FROM "Season" s
LEFT JOIN "Series" sr ON sr.id = s."seriesId"
WHERE sr.id IS NULL;
```

Si la consulta de duplicados devuelve filas, no se deben borrar ni renumerar registros automaticamente. La migracion debe detenerse y cada conflicto debe resolverse manualmente con el responsable del contenido.

## Migracion necesaria

No se necesita una migracion nueva. La restriccion compuesta ya existe en schema, historial de migraciones y base desplegada. Crear una segunda restriccion seria redundante y aumentaria el riesgo operativo sin cambiar el comportamiento.

## Archivos a modificar

- `apps/backend/src/seasons/seasons.service.ts`: mensaje claro y validacion explicita de duplicados al crear o renumerar.
- `apps/backend/src/seasons/seasons.service.spec.ts`: casos entre series, duplicados y cambio de numero.
- `apps/frontend/src/admin/seasons/season-payload.spec.ts`: contratos de create/update y numeracion por serie.
- `README.md`: documentar la regla y los comandos de diagnostico.

Los DTO y constructores de payload ya estan correctamente separados por la correccion precedente; se conservaran y se ampliara su cobertura.

## Riesgos

- Una validacion previa sin respaldo del indice tendria una condicion de carrera; el indice compuesto sigue siendo la autoridad final.
- Un cambio de numero debe usar el `seriesId` persistido, nunca uno recibido en el body.
- Las temporadas eliminadas logicamente siguen ocupando su combinacion en el indice actual. Este comportamiento se conserva para no reutilizar numeros de forma silenciosa ni modificar datos existentes.
- No se debe aplicar `db push` ni recrear tablas para esta correccion.

## Pruebas

- Temporada 1 en dos series distintas: permitida.
- Segunda temporada 1 en la misma serie: rechazada con mensaje claro.
- Renumeracion libre dentro de la serie: permitida.
- Renumeracion a un numero ocupado: rechazada.
- Edicion de titulo, descripcion, poster y publicacion sin `seriesId`.
- Relacion original conservada.
- Serie y temporada inexistentes devuelven 404.
- DTO de update rechaza `seriesId` y los endpoints mantienen guards ADMIN.
- Frontend crea con `seriesId` y actualiza sin el campo.

## Criterios de aceptacion

- Cada serie puede tener su propia Temporada 1.
- La misma serie no puede repetir un numero.
- Crear y editar funcionan con contratos distintos.
- Editar no permite cambiar la serie.
- Los conflictos devuelven `La serie ya tiene una temporada con ese numero.` sin exponer P2002.
- No se desactiva la validacion global ni se modifican datos existentes.
- Lint, typecheck, tests, build, Prisma y Docker finalizan correctamente.

## Estrategia de rollback

No hay migracion ni cambio destructivo que revertir. El rollback de aplicacion consiste en revertir los cambios del servicio, pruebas y documentacion y reconstruir backend/frontend. La restriccion compuesta existente debe permanecer: eliminarla degradaria la integridad de datos. Si una futura migracion relacionada falla, no se debe usar `db push`; se restaura la version anterior del contenedor y se investiga con las consultas de diagnostico antes de aplicar otra migracion.
