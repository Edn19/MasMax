# Plan de refinamiento de interfaz administrativa

## Alcance y restricciones

Esta fase mejora exclusivamente la presentacion y usabilidad del frontend administrativo. Se conservaran las rutas, endpoints, payloads, enums, autenticacion, permisos, reproduccion y logica de carga existentes. No se modificaran Prisma ni el backend. La implementacion reutilizara React, TypeScript, Tailwind CSS, Lucide y Sonner, sin agregar librerias.

## Estado actual por pantalla

| Pantalla | Problema | Solucion | Prioridad | Archivos |
|---|---|---|---|---|
| Series | Formulario y listado compiten; campos identificados por placeholder; selector multiple nativo; estados internos visibles | Formulario colapsable por secciones, labels, FileUpload, MultiSelect, filtros, traducciones y confirmacion accesible | Alta | `admin/series/SeriesAdminPage.tsx` |
| Temporadas | Selector principal sin label visible; ayuda de numeracion usada como placeholder; formulario siempre abierto | Encabezado contextual, FormField, ayuda persistente, secciones, poster integrado y tabla normalizada | Alta | `admin/seasons/SeasonsAdminPage.tsx` |
| Episodios | Formulario denso; marcadores mezclados con datos basicos; validacion general; tabla propia; `window.confirm` | Secciones semanticas y bloque avanzado colapsable, errores por campo, alerta de huecos, FileUpload y tabla comun | Alta | `admin/episodes/EpisodesAdminPage.tsx` |
| Peliculas | Todos los campos avanzados visibles; generos nativos; labels ausentes; video e imagenes mezclados | Secciones basicas, multimedia, clasificacion y reproduccion avanzada colapsable; MultiSelect y FileUpload | Alta | `admin/movies/MoviesAdminPage.tsx` |
| Generos | Compacta pero depende de placeholders y confirmacion generica | Formulario compacto etiquetado, listado consistente y confirmacion con nombre/consecuencia | Media | `admin/genres/GenresAdminPage.tsx` |
| Subtitulos | Carga nativa, opciones sin ayuda, tabla propia y confirmacion nativa | FileUpload para VTT/SRT, opciones agrupadas, ayudas, tabla comun y dialogo accesible | Alta | `admin/subtitles/SubtitlesAdminPage.tsx` |
| Usuarios | Labels ausentes; roles internos visibles; contrasena y datos generales mezclados | Campos etiquetados, traduccion de roles, seccion de credenciales y validacion anunciada | Media | `admin/users/UsersAdminPage.tsx` |
| Configuracion | Claves tecnicas (`siteName`, `primaryColor`) se muestran como placeholders | Labels en espanol, secciones y controles de URL/color coherentes | Media | `admin/settings/SettingsAdminPage.tsx` |
| Diseno del sitio | Inputs y uploads compiten; checkboxes sin descripcion; seleccion destacada extensa | Secciones, labels, UploadField integrado, controles agrupados y ayudas | Media | `admin/settings/SettingsAdminPage.tsx` |
| Sidebar | Buena base responsive y persistente; grupos no colapsables; scroll incluye contexto inferior | Cabecera y volver fijos, navegacion con grupos colapsables persistentes, scrollbar discreto y tooltips al contraer | Media | `admin/AdminShell.tsx`, `index.css` |
| Tablas generales | Cabeceras derivadas de claves, acciones repetidas, vacio textual y confirmacion nativa | Componente con columnas tipadas, renderizado, loading/error/vacio, acciones y confirmacion comun | Alta | `admin/components/AdminUi.tsx` y paginas consumidoras |

## Componentes reutilizables existentes

- `Panel`, `Input`, `Textarea`, `Select`, `Button`, `ResourceError` y `AdminTable` en `AdminUi.tsx`.
- `UploadField` conserva carga normal y reanudable, progreso, pausa, cancelacion y procesamiento HLS.
- `EmptyState`, `LoadingBlock`, `SkeletonGrid` y `ErrorState` en el layout publico.
- `StatusBadge`, iconos Lucide, notificaciones Sonner y utilidades de formato.
- `AdminShell` ya incluye drawer movil, sidebar contraible, breadcrumbs, ruta activa y version.

## Duplicacion y deuda detectada

- Series, temporadas, episodios, peliculas, generos, usuarios y configuracion repiten grids, botones guardar/cancelar, labels improvisados y manejo de errores solo mediante toast.
- Series y peliculas repiten el selector multiple nativo de generos.
- Episodios, subtitulos y `AdminTable` repiten eliminaciones con `window.confirm`.
- Series, temporadas, peliculas, episodios y diseno repiten pares URL + subida sin un contenedor visual consistente.
- Estados y enums se traducen localmente y de forma desigual (`FINISHED` aparece como `Finalizado`, roles como `USER`/`ADMIN`, formatos y fuentes quedan tecnicos).
- Episodios y subtitulos implementan tablas propias con estilos y estados vacios distintos.

## Labels, placeholders e idioma

- La mayoria de los `Input` administrativos usa `placeholder` como unica identificacion y `AdminUi.Input` genera un `aria-label` a partir de ese texto.
- Selectores de serie, temporada, estado, fuente y contenido tienen `aria-label`, pero no label visible asociado.
- Configuracion muestra nombres tecnicos como `siteName`, `logo`, `primaryColor`, `facebook`, `instagram`, `youtube` y `tiktok`.
- Valores internos que requieren presentacion centralizada: `AIRING`, `FINISHED`, `PAUSED`, `DRAFT`, `PUBLISHED`, `HIDDEN`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`, `USER`, `ADMIN`, `LOCAL`, `URL`, `HLS`, `DRIVE` y `EMBED`.

## Acciones destructivas y cargas

- `AdminTable`, episodios, subtitulos y auditoria utilizan `window.confirm`; no ofrecen nombre del elemento, consecuencia ni gestion de foco.
- `UploadField` expone el input nativo. Mantiene correctamente validacion MP4, limite, carga reanudable, progreso y procesamiento, pero carece de drag and drop, resumen del archivo, preview de imagen, reemplazo y error anunciado.
- Subtitulos implementa otro input de archivo nativo con validacion separada. Se ampliara el componente visual sin cambiar `uploadForm` ni los endpoints.

## Responsive y accesibilidad

- Los grids ya cambian a una columna en movil, pero los formularios largos generan desplazamiento excesivo y las acciones no siempre ocupan el ancho disponible.
- Tablas propias dependen de `min-width` y scroll; no hay scroll global confirmado, pero se normalizara el contenedor regional.
- Faltan asociaciones `htmlFor`/`id`, `aria-describedby`, `aria-invalid` y mensajes de campo anunciados.
- Los dialogos nativos impiden controlar foco, Escape y restauracion. El nuevo dialogo tendra `role=dialog`, `aria-modal`, foco inicial, cierre por Escape, backdrop y retorno de foco.
- El MultiSelect debe permitir buscar, seleccionar con Enter, cerrar con Escape, retirar chips y comunicar estado vacio.
- El sidebar movil ya tiene drawer y Escape; se reforzara la persistencia de grupos y el scroll exclusivo de navegacion.

## Componentes a crear o ampliar

- Formularios: `FormField`, `FormLabel`, `FormHint`, `FormError`, `TextInput`, `TextArea`, `Select`, `Checkbox`, `NumberInput`, `DateInput`, `FormSection` y `FormActions`.
- Seleccion: `MultiSelect` accesible con buscador, chips y teclado.
- Archivos: ampliar `UploadField`/`FileUpload` para drag and drop, metadatos, preview, reemplazo, limpiar y errores visibles; crear una variante reutilizable para archivos que sube el formulario padre.
- Dialogos: `ConfirmDialog` compartido, sin `window.confirm` para eliminaciones de contenido.
- Presentacion: `AdminPageHeader`, `FormDisclosure`, `InlineAlert`, traducciones centralizadas y columnas tipadas de tabla.

## Estrategia de creacion y listado

Para minimizar riesgo no se agregaran rutas ni se movera estado de formularios. Cada vista mantendra su endpoint y estado actual, pero el formulario aparecera en una seccion amplia colapsable activada por `Crear`. Al editar se abrira automaticamente y desplazara el foco al encabezado. Episodios y peliculas conservaran formularios amplios dentro de la pagina, nunca en modales pequenos. Generos usara un bloque compacto.

## Archivos previstos

- Base compartida: `admin/components/AdminUi.tsx`, `admin/components/AdminForms.tsx`, `admin/components/ConfirmDialog.tsx`, `admin/components/MultiSelect.tsx`, `admin/components/UploadField.tsx`, `admin/components/admin-utils.ts`, `index.css`.
- Pantallas: series, temporadas, episodios, peliculas, generos, subtitulos, usuarios y configuracion/diseno.
- Navegacion: `admin/AdminShell.tsx`.
- Pruebas: specs de utilidades y nuevos specs de validacion/etiquetas/traducciones donde las herramientas actuales lo permitan sin incorporar un framework nuevo.

## Orden de implementacion

1. Crear componentes base de formularios y mapa central de traducciones.
2. Crear `ConfirmDialog`, ampliar tabla y eliminar confirmaciones nativas de contenido.
3. Ampliar carga de archivos y crear MultiSelect.
4. Migrar Series y Temporadas.
5. Migrar Episodios con validacion de marcadores y alerta de numeracion.
6. Migrar Peliculas y ocultar reproduccion avanzada.
7. Migrar Generos y Subtitulos.
8. Migrar Usuarios, Configuracion y Diseno.
9. Pulir sidebar, encabezados, vacios, responsive y accesibilidad.
10. Agregar pruebas y ejecutar lint, typecheck, test, build y Docker.

## Riesgos y mitigacion

- Cambiar payloads al reorganizar formularios: se mantendran las funciones `submit`, nombres de estado y conversiones actuales; solo cambia el renderizado y la validacion previa.
- Romper cargas reanudables: la logica de `UploadField` se conserva y solo se envuelve en una interfaz visual nueva.
- Dialogos sin foco correcto: se probara Escape, foco inicial y restauracion al activador.
- MultiSelect incompatible: conservara exactamente `string[]` como valor y callback.
- Formularios demasiado grandes: secciones semanticas y configuracion avanzada colapsable, sin ocultar datos existentes al editar.
- Cobertura limitada por no disponer de React Testing Library: se probaran funciones puras de validacion y traduccion con el runner actual, y los flujos se validaran manualmente en navegador.
- Arbol Git con cambios acumulados: no se revertira ni reescribira trabajo previo ajeno a esta fase.

## Criterios de aceptacion

- Todos los controles administrativos modificados tienen label visible asociado y no dependen del placeholder.
- Altura, foco, estados disabled/readonly y ayudas son consistentes; errores usan `aria-describedby`, `aria-invalid` y `role=alert`.
- Interfaz visible en espanol con enums internos intactos y traducciones centralizadas.
- Creacion/edicion se diferencia del listado y los formularios grandes se dividen en secciones.
- Eliminaciones de contenido usan boton rojo y dialogo accesible con nombre y consecuencia.
- Uploads mantienen endpoints, validacion, progreso y cancelacion, con drag and drop y metadatos visibles.
- Series y peliculas usan MultiSelect de generos con chips y teclado.
- Episodios separa informacion, miniatura, video y configuracion avanzada; marcadores se validan antes de enviar.
- Tablas comparten cabecera, acciones, vacio y region responsive sin overflow global.
- Sidebar conserva drawer, colapso persistente, ruta activa, tooltips y version.
- No se modifica el reproductor, backend, Prisma, endpoints ni contratos API.
- Lint, typecheck, pruebas, build y Docker terminan sin errores.

## Resultado de implementacion

- Se crearon controles de formulario compactos, secciones, acciones, mensajes y asociaciones accesibles reutilizables.
- Series, temporadas, episodios, peliculas, generos, subtitulos, usuarios, configuracion y diseno usan labels visibles y una jerarquia consistente.
- Series y peliculas usan MultiSelect con busqueda, chips, Enter, flechas y Escape sin cambiar el arreglo `genreIds` enviado al backend.
- La carga conserva los endpoints y la subida reanudable, pero ahora ofrece drag and drop, metadatos, progreso, reemplazo, cancelacion, errores y estados completados.
- Episodios valida pares de introduccion/resumen, limites respecto a la duracion y muestra una alerta accionable cuando faltan numeros.
- Todas las confirmaciones nativas del frontend administrativo se reemplazaron por un dialogo con nombre, consecuencia, Escape, foco inicial, trampa y restauracion de foco.
- El sidebar conserva colapso y drawer, y agrega grupos colapsables persistentes y scrollbar discreto.
- No se modificaron backend, Prisma, endpoints, payloads, permisos ni reproductor.

## Validacion final

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm run test`: 73 pruebas aprobadas, 58 backend y 15 frontend.
- `npm run build`: aprobado. Permanece la advertencia no bloqueante del chunk diferido de VideoPlayer/HLS de 538.53 kB.
- `docker-compose build`, `docker-compose up -d` y `docker-compose ps`: aprobados; backend, frontend, worker, PostgreSQL y Redis saludables.
- Navegador: Series, Episodios, Peliculas y Subtitulos comprobados en 360, 390, 768, 1024, 1366 y 1920 px sin overflow global, imagenes rotas ni errores de consola.
- Interacciones verificadas sin ejecutar eliminaciones: apertura de formularios, MultiSelect por teclado, dialogo destructivo, foco inicial, sidebar agrupado, upload visual y secciones avanzadas.

## Riesgos residuales

- La subida de archivos reales depende del archivo y capacidad del entorno del usuario; la interfaz, validacion y contrato existente fueron preservados y compilados, pero no se envio un MP4 de gran tamano durante la comprobacion visual.
- No se ejecutaron eliminaciones ni cambios persistentes sobre el catalogo demo durante la validacion manual. Los endpoints y funciones existentes permanecen cubiertos por la suite y el chequeo de tipos.
- La suite actual no incluye un navegador de pruebas con DOM completo; las funciones puras y el marcado SSR tienen pruebas automatizadas, y los flujos interactivos se comprobaron en el navegador integrado.
