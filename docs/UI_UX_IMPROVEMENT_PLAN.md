# Plan de mejora UI/UX de MasMax

Fecha: 2026-08-03

## Arquitectura visual actual

El frontend es React 18 + TypeScript + Vite. Usa Tailwind CSS 3 con tokens CSS en `src/index.css`, rutas diferidas desde `src/main.tsx`, iconos Lucide y notificaciones Sonner. No existe una libreria de componentes externa: la capa compartida se reparte entre `components/Layout.tsx`, `admin/components/AdminUi.tsx`, tarjetas, rail horizontal y reproductor.

La aplicacion tiene dos layouts principales: `PublicLayout`, con header sticky y navegacion horizontal, y `AdminShell`, con sidebar. Las paginas publicas consumen `SiteSettingsProvider`, que aplica nombre, logo, favicon, colores y tema. La reproduccion esta encapsulada en `VideoPlayer`; no se modificara su contrato ni la autorizacion multimedia.

## Sistema visual actual

- Paleta: fondo azul casi negro, panel azul pizarra, borde gris azulado, celeste como acento principal y coral como secundario/error visual.
- Tipografia: Inter con fallback al sistema, pero con uso excesivo de `font-black` en navegacion, titulos secundarios, tablas y botones.
- Radios: mezcla de `rounded-lg`, `rounded-xl`, `rounded-2xl` y `rounded-3xl` sin criterio central.
- Espaciado: contenedores mayormente `max-w-7xl px-4`, aunque reproductor y perfil usan anchos distintos y varias paginas repiten encabezados.
- Estados: existen `LoadingBlock`, `SkeletonGrid`, `EmptyState`, `ErrorState` y `StatusBadge`, pero `EmptyState` solo admite un icono fijo y una accion.
- Responsive: grillas Tailwind y rail horizontal; el header movil es una fila desplazable. El admin no tiene drawer ni modo contraido.

## Componentes reutilizables

- Layout y estados: `PublicLayout`, `LoadingBlock`, `SkeletonGrid`, `EmptyState`, `ErrorState`.
- Contenido: `SeriesCard`, `MovieCard`, `SmartImage`, `HorizontalRail`.
- Reproduccion: `VideoPlayer`, preferencias y acciones de favoritos.
- Administracion: `Panel`, `Input`, `Textarea`, `Select`, `Button`, `AdminTable`, `StatusBadge`, `UploadField`.
- Experiencia transversal: error boundary, backend gate, skip link y navegacion espacial con flechas.

## Diagnostico por pantalla

| Pantalla | Problema | Impacto | Solucion propuesta | Prioridad |
|---|---|---|---|---|
| Global | Tokens incompletos y estilos de controles repetidos | Inconsistencia y mantenimiento costoso | Normalizar tokens, clases base y superficies en la capa CSS actual | Alta |
| Header | Logout aislado, sin menu de perfil; movil ocupa dos filas con rail | Acciones ambiguas y navegacion movil debil | Menu de perfil accesible, estado activo, menu movil desplegable y header compacto | Alta |
| Login | Buena composicion, pero pesos altos y controles no compartidos | Jerarquia agresiva y menor consistencia | Ajustar pesos, dimensiones, validacion visible y orden movil | Media |
| Home | Hero solo ofrece detalle; grillas dejan huecos con pocos elementos | Baja densidad y accion principal poco clara | Metadatos, reproducir/detalle, rail adaptativo y encabezados compartidos | Alta |
| Tarjetas | Anchos distintos y foco/metadata variables | Exploracion inconsistente | Superficie, proporcion, truncado, foco y overlay comunes | Alta |
| Carga/vacio | Skeleton generico y EmptyState rigido | Saltos visuales y acciones poco contextuales | EmptyState configurable y skeletons por estructura | Media |
| Reproductor | Tipografia pesada y sidebar sin altura independiente clara | Menor legibilidad y exploracion de episodios | Layout 16:9, sidebar 320-400 px con scroll, episodio activo y estados internos | Alta |
| Perfil | Una tarjeta central con espacio desaprovechado | Poca jerarquia y escaneabilidad | Grid de informacion, seguridad, preferencias existentes y actividad | Media |
| Admin | Sidebar plano, fijo y sin drawer/colapso | Navegacion lenta en escritorio y bloqueante en movil | Grupos, persistencia, tooltips, drawer y cabecera contextual | Alta |
| Tablas | Estilos y vacios repetidos; ancho minimo rigido | Scroll movil poco claro | Cabecera/filas/acciones normalizadas y contenedor accesible | Media |
| Procesamiento | Estado operativo y vacio poco jerarquizados | Diagnostico mas lento | Badges de salud, progreso y EmptyState compartido | Media |
| PWA | Solo SVG `any`; nombre estatico en manifest | Instalacion incompleta | Mantener SVG propio y agregar PNG 192/512/maskable/apple-touch-icon | Media |

## Problemas de consistencia y jerarquia

- `font-black` aparece en encabezados secundarios, menu, botones y tablas; se reservara para hero o marca y se usara 600/700 en el resto.
- Controles publicos y administrativos no comparten una misma semantica visual.
- Falta una abstraccion ligera para contenedor, encabezado y botones; no se creara un framework paralelo.
- El nombre configurado se usa en runtime, pero `index.html`, manifest y valores iniciales aun dicen NovaStream.
- La version no tiene una ubicacion unica y discreta.

## Problemas responsive y accesibilidad

- Admin carece de drawer movil y sidebar contraible.
- Algunas tablas dependen solo de scroll horizontal sin descripcion.
- Hay botones de icono con `title`, pero falta un menu de perfil con `aria-expanded` y cierre por Escape/exterior.
- Algunos inputs dependen de placeholder o `aria-label`; se conservaran labels visibles donde el formulario lo permita.
- Los focos globales son visibles y ya existe skip link, reduced motion y navegacion espacial; se reforzaran areas tactiles, `aria-current`, tooltips y scroll al foco.
- Debe impedirse overflow global y respetarse 360, 390, 768, 1024, 1366 y 1920 px.

## Componentes grandes

`HomePage`, `VideoPlayer`, `EpisodesAdminPage`, `SettingsAdminPage`, `MoviesAdminPage` y `AccountPages` concentran varias responsabilidades. Solo se extraeran piezas visuales cuando reduzcan duplicacion real; no se reescribira su logica.

## Archivos previstos

- Base: `src/index.css`, `tailwind.config.ts`, `components/Layout.tsx`, nuevos componentes visuales pequenos.
- Navegacion: `components/Layout.tsx`, `admin/AdminShell.tsx`.
- Pantallas: `admin/AdminLogin.tsx`, `pages/HomePage.tsx`, `AccountPages.tsx`, `WatchPage.tsx`, `MovieWatchPage.tsx`, `SeriesDetailPage.tsx`.
- Contenido: `SeriesCard.tsx`, `MovieCard.tsx`, `HorizontalRail.tsx`, `VideoPlayer.tsx`.
- Admin: `admin/components/AdminUi.tsx`, procesamiento y paginas que necesiten adoptar estados comunes.
- Identidad/PWA: `lib/site-settings.tsx`, `index.html`, `public/manifest.webmanifest`, iconos propios.
- Pruebas y documentacion: specs frontend existentes, README o documento de cierre.

## Orden de implementacion

1. Tokens, tipografia, superficies, controles y estados compartidos.
2. Header publico, perfil desplegable y menu movil.
3. Login, hero, rails y tarjetas.
4. Reproductor, episodios y detalles.
5. Perfil y seguridad.
6. Sidebar admin, tablas, procesamiento y vacios.
7. Responsive, accesibilidad, PWA y pruebas.
8. Lint, typecheck, tests, build, Docker y validacion visual.

## Riesgos y mitigacion

- Regresion funcional del player: mantener props, eventos, URL y autorizacion sin cambios; validar reproduccion tras CSS/layout.
- Menus inaccesibles: implementar Escape, click exterior, `aria-expanded`, foco visible y restauracion de foco.
- Clases globales invasivas: limitar tokens y clases a `@layer components`, sin sobrescribir controles funcionales de terceros.
- Sidebar persistido inconsistente: usar una unica clave localStorage con fallback seguro.
- Manifest con nombre dinamico: el manifest es estatico; se usara MasMax como fallback de producto y `SiteSettingsProvider` seguira mandando dentro de la aplicacion.
- Aumento de bundle: no agregar librerias; conservar lazy loading y el import diferido de rutas/HLS existente.

## Criterios de aceptacion

- Identidad tomada de SiteSetting y version solo en lugares secundarios.
- Tokens y componentes base coherentes, contraste AA y foco visible.
- Header usable con teclado, menu movil y menu de perfil.
- Hero con acciones claras y contenido legible en todos los breakpoints.
- Rails/tarjetas sin huecos grandes y navegables con raton, touch, teclado y flechas.
- Player 16:9 no cubierto; sidebar independiente y episodio activo evidente.
- Perfil aprovecha el ancho sin mostrar acciones sin backend.
- Admin agrupado, contraible, persistente y drawer en movil.
- Estados vacios/carga/error reutilizables y tablas legibles.
- Sin overflow horizontal global ni errores nuevos de consola/React/recursos.
- Lint, typecheck, pruebas, build host y Docker aprobados sin cambios de endpoint.

## Resultado de implementacion

- Se completo el sistema visual, el header publico, los menus de perfil y movil, el hero, los rails, las tarjetas, el perfil, el reproductor y el shell administrativo responsive.
- La identidad visible usa SiteSetting y elimina sufijos de version de la marca sin alterar el valor almacenado. La version queda limitada al footer y al panel administrativo.
- El sidebar administrativo queda agrupado, contraible y persistente en escritorio, con drawer y backdrop en movil.
- Se conservaron rutas, contratos de API, autenticacion, permisos, carga multimedia, player y procesamiento de video.
- El icono PWA SVG propio se mantiene como `any maskable`; tambien se usa como `apple-touch-icon`. No se agregaron recursos externos.

## Evidencias de validacion

- `npm run lint`: aprobado en backend y frontend.
- `npm run typecheck`: aprobado.
- `npm run test`: 69 pruebas aprobadas (58 backend y 11 frontend).
- `npm run build`: aprobado; permanece una advertencia no bloqueante por el chunk diferido del reproductor/HLS de 538.53 kB.
- `docker-compose build` y `docker-compose up -d`: aprobados.
- Backend, frontend, worker, PostgreSQL y Redis reportan estado saludable; Nginx sirve el proyecto en el puerto 8088.
- Validacion visual real en 390 x 844 y 1366 x 900: login, home, perfil, reproductor, admin y drawer movil sin overflow global, imagenes rotas ni errores de consola.
- Login admin verificado con redireccion a `/home`; episodio actual verificado con `aria-current` y panel de procesamiento verificado con Redis y worker disponibles.
