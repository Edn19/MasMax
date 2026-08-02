# Arquitectura

```text
Browser -> Nginx :8088 -> frontend:8080
                       -> backend:3000 -> PostgreSQL:5432
Backend -> /app/uploads (lectura/escritura)
Nginx   -> /app/uploads (solo lectura; imágenes públicas y media interna)
```

NestJS aplica DTOs globales, guards JWT/ADMIN, throttling, filtro de errores y Prisma. El access token identifica `userId` y `sessionId`; el refresh rotativo se mantiene en cookie. Para MP4 local el frontend obtiene autorización, el backend firma claims de usuario/sesión/recurso/expiración y Nginx procesa `X-Accel-Redirect` con soporte Range.

Los límites principales son módulos NestJS por dominio. Prisma es la única vía de migración. Los archivos se registran en `MediaFile`, mientras Episode/Movie conservan URLs por compatibilidad con datos anteriores.
