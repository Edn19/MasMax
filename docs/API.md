# API

Base: `/api`. Respuestas de error: `statusCode`, `code`, `message`, `details`, `requestId`.

- Auth: `POST auth/login|refresh|logout|register|forgot-password|reset-password|change-password`, `GET auth/me|sessions|sessions/current`, `DELETE auth/sessions/:id`.
- Media: `GET media/authorize?episodeId=...|movieId=...`; `media/stream` es una URL firmada interna.
- Progreso: `GET me/watch-history|continue-watching`, `PUT me/progress`, `DELETE me/watch-history/:id`.
- Perfiles: CRUD `/profiles` y `POST /profiles/:id/select`.
- Listas: CRUD `/me/lists`, alta/baja de `/me/lists/:id/items`.
- Catálogo: `/series`, `/episodes`, `/movies`, `/genres`, `/search`.
- Usuario: `/favorites`, `/comments`; reporte con `POST /comments/:id/report`.
- Admin: `/admin/users|series|episodes|movies|comments|site-settings|uploads|storage|audit`; invitaciones en `/admin/users/invitations`.
- Salud: `/health`, `/health/live`, `/health/ready`.

Rutas privadas usan `Authorization: Bearer ACCESS_TOKEN`; refresh usa cookie y `credentials: include`.
