# Auditoria administrativa

La fase 15 amplia `AuditLog` para conservar actor, accion, entidad, IP anonimizada, agente de usuario, request ID y estados anterior/nuevo. Toda mutacion bajo `/api/admin` se registra mediante un interceptor global; autenticacion conserva eventos explicitos para login, intentos fallidos, cierre de sesion y revocacion.

## Eventos cubiertos

- Login, logout, intentos fallidos y sesiones revocadas.
- Creacion, edicion y eliminacion de contenido administrativo.
- Publicacion y despublicacion de episodios o peliculas.
- Invitacion, activacion, bloqueo, cambio de rol y cambio de contrasena de usuarios.
- Cambios de configuracion del sitio.
- Cargas, eliminaciones y limpieza de archivos.
- Restauraciones ejecutadas mediante `scripts/restore.sh`.
- Limpieza por politica de retencion.

## Seguridad de datos

Antes de escribir JSON, el backend recorre objetos y arreglos y reemplaza con `[REDACTED]` cualquier campo cuyo nombre indique contrasena, hash, token, PIN, cookie, cabecera de autorizacion, secreto SMTP o clave S3. Los valores largos, arreglos y objetos tambien tienen limites para evitar que un evento crezca sin control.

La IP se almacena resumida a `/24` para IPv4 o `/64` para IPv6. El agente de usuario se limita a 500 caracteres. `before`, `after` y `changes` se sanitizan en el servidor; el frontend nunca decide que ocultar.

## Consulta y exportacion

El panel `/admin/audit` permite filtrar por usuario, accion, entidad y rango de fechas, revisar el estado anterior/nuevo, ver IP y agente, navegar por paginas y exportar hasta 10 000 filas a CSV.

Endpoints protegidos para ADMIN:

- `GET /api/admin/audit`
- `GET /api/admin/audit/facets`
- `GET /api/admin/audit/export.csv`
- `GET /api/admin/audit/retention`
- `POST /api/admin/audit/retention/cleanup`

## Retencion

`AUDIT_RETENTION_DAYS` acepta entre 30 y 3650 dias y vale 365 por defecto. La limpieza se ejecuta al iniciar el backend, cada 24 horas y manualmente desde el panel. Antes de reducir el periodo, exporta o respalda la base de datos si existe una obligacion legal de conservacion.
