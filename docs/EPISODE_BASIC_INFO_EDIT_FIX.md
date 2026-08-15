# Estabilizacion de Informacion basica del episodio

## Reproduccion previa

- Ruta: `/admin/episodes`, episodio existente `2444f`.
- Se editaron numero, posicion, titulo, duracion, fecha, descripcion y publicacion en una misma interaccion.
- La fecha cambio de `2026-08-05` a `2026-08-08`, pero volvio a `2026-08-05` despues de editar los controles siguientes.
- Numero, posicion, titulo, duracion y descripcion permanecieron editables en esa ejecucion.
- El formulario mantuvo una sola instancia de `#episode-title` y la consola no mostro errores, loops, cambios controlled/uncontrolled ni remounts.

## Causa raiz

El componente es `EpisodesAdminPage`, en `apps/frontend/src/admin/episodes/EpisodesAdminPage.tsx`. Los handlers de Informacion basica usaban el patron `setForm({ ...form, campo: valor })`. Varios eventos cercanos podian construir actualizaciones desde la misma captura obsoleta de `form`; la ultima actualizacion reemplazaba el objeto completo y restauraba campos modificados por una actualizacion anterior.

La prueba de guardado encontro una segunda causa en `EpisodesService.update`: `durationSec` se calculaba como `jobVideo.durationSec ?? dto.durationSec`. En episodios vinculados a un trabajo HLS, la duracion detectada por FFmpeg reemplazaba siempre la duracion editada por el administrador. La precedencia correcta es `dto.durationSec ?? jobVideo.durationSec`.

No hay un `useEffect` que copie `editingEpisode` sobre el formulario. Los dos effects del componente solo seleccionan serie y temporada. Tampoco existe una `key` basada en campos editables. La carga del API ya ocurre una sola vez dentro de `edit()` y el estado editable ya es independiente del episodio recibido.

## Solucion

- Reemplazar todos los cambios parciales del formulario por actualizaciones funcionales.
- Mantener numero, posicion y duracion como strings durante la edicion.
- Mantener la fecha en formato `YYYY-MM-DD` y serializarla al construir el payload.
- Conservar campos de video y trabajo de procesamiento en cada cambio basico.
- Centralizar la actualizacion inmutable de campos para poder probar interacciones combinadas.
- Mantener Cancelar como cierre sin PATCH y construir un payload explicito al guardar.
- Dar prioridad a la duracion enviada por el formulario y usar la duracion de FFmpeg solo como fallback.

## Pruebas

- Normalizacion completa de campos nulos, numeros, fecha y booleano.
- Edicion independiente de numero, posicion, titulo, duracion, fecha y descripcion.
- Secuencia combinada que modifica varios campos y comprueba que ninguno vuelve al valor inicial.
- Activacion y desactivacion de `published` sin perder otros cambios.
- Payload numerico, fecha ISO y conservacion del enlace al video.
- Servicio con job HLS que conserva duracion y fecha explicitas junto con el video procesado.
- Cancelacion sin llamada PATCH y reapertura desde datos persistidos mediante prueba manual.

## Riesgo y rollback

El cambio afecta solo a actualizaciones locales de formulario y no cambia el contrato HTTP ni Prisma. El rollback consiste en revertir los handlers y helpers de formulario; no requiere migracion ni modifica archivos multimedia.
