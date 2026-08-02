# Despliegue

1. Ejecuta y verifica un respaldo.
2. Completa `.env` desde `.env.example`; genera secretos aleatorios y configura URLs HTTPS finales.
3. Ejecuta `docker compose config` y revisa que no haya puertos de PostgreSQL publicados.
4. Ejecuta `docker compose up -d --build`.
5. Comprueba `docker compose ps`, `/api/health/ready` y `docker compose logs --tail=200`.
6. Crea el primer administrador con el seed explícito y elimina `ADMIN_PASSWORD` del entorno.
7. Coloca un proxy TLS delante de `8088`; reenvía `X-Forwarded-Proto` y limita acceso por firewall.

Para migrar datos existentes no uses `db push`: el contenedor aplica `prisma migrate deploy`. La migración conserva URLs y contenido anteriores, crea un perfil por usuario y no cambia contraseñas.
