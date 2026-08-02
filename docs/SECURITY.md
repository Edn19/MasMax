# Seguridad

Secretos obligatorios: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` y `MEDIA_SIGNING_SECRET`, todos diferentes y de alta entropía. No se incluyen valores reales en el repositorio.

El access token expira en 15 minutos; el refresh es rotativo, `HttpOnly`, `SameSite=Lax` y usa `Secure` cuando `COOKIE_SECURE=true`. Déjalo en `false` únicamente para HTTP local y actívalo obligatoriamente al desplegar HTTPS. La reutilización revoca la familia. Las IP se almacenan resumidas. Logs y auditoría no deben incluir contraseñas, tokens ni cookies.

Nginx bloquea archivos ocultos/configuración y videos directos. Los embeds solo admiten HTTPS y dominios permitidos. En VPS, terminar TLS delante de `8088`, limitar firewall y mantener PostgreSQL sin publicación.

Tras migrar una instalación que usó credenciales demo antiguas, cambia la contraseña del administrador y revoca todas las sesiones.
