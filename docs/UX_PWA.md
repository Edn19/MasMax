# Experiencia de usuario y PWA

La fase 20 concentra las mejoras transversales en componentes compartidos para evitar comportamientos distintos entre paginas.

## Carga y errores

- Las rutas publicas y administrativas usan `React.lazy` y `Suspense`.
- Los catalogos usan skeletons con dimensiones estables para reducir saltos visuales.
- Las imagenes no criticas usan `loading=lazy`, decodificacion asincrona y fallback local.
- Existe una pagina 404, un limite global de errores y errores recuperables por seccion.
- Una perdida real de conectividad con la API muestra una pantalla de mantenimiento con reintento. Los errores HTTP normales siguen mostrandose en su formulario o seccion.

## Accesibilidad y televisores

- El sitio incluye enlace para saltar al contenido, regiones vivas, etiquetas en controles iconicos y foco visible.
- Las flechas del teclado o control remoto mueven el foco al elemento util mas cercano.
- El reproductor conserva sus propios atajos y queda excluido de la navegacion espacial global.
- Los carruseles usan scroll-snap, botones anterior/siguiente y desplazamiento suave.
- `prefers-reduced-motion` reduce animaciones y transiciones.

## PWA

`manifest.webmanifest`, el icono adaptable y `sw.js` permiten instalar la aplicacion desde navegadores compatibles. El boton de instalacion aparece solo cuando el navegador emite `beforeinstallprompt`.

El service worker aplica una politica conservadora:

- guarda el shell y recursos estaticos versionados;
- usa red primero para navegaciones;
- no intercepta `/api`, `/uploads`, `/protected-media`, videos ni solicitudes HTTP Range;
- no almacena respuestas autenticadas ni contenido multimedia privado.

Para validar una nueva version, construye el frontend, abre DevTools > Application y comprueba manifest, service worker y modo offline. Los service workers no se registran durante `vite dev`.
