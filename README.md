# NovaStream Catalogo Streaming

Plataforma web demo tipo catalogo/streaming con diseno original, contenido ficticio y administracion privada en `/admin`.

## Stack

- Frontend: React + Vite + TypeScript + TailwindCSS
- Backend: NestJS + TypeScript
- Base de datos: PostgreSQL + Prisma
- Autenticacion: JWT + bcrypt
- Deploy local/servidor: Docker Compose
- Reverse proxy: Nginx

## Credenciales demo

- Email: `admin@site.local`
- Password: `Admin123456`

## Levantar con Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Abrir:

- Sitio publico: `http://localhost:8088`
- Login: `http://localhost:8088/login`
- Inicio autenticado: `http://localhost:8088/home`
- Panel admin: `http://localhost:8088/admin`
- API mediante Nginx: `http://localhost:8088/api`
- Salud de API y base de datos: `http://localhost:8088/api/health`

El proxy Nginx del proyecto usa el puerto externo `8088`, por lo que no ocupa el puerto `80`. El backend escucha en `3000` solo dentro de la red Docker. PostgreSQL tampoco publica puertos en el host.

El contenedor backend ejecuta `prisma migrate deploy`, crea o actualiza el usuario admin y carga datos demo inventados.

## Instalacion en Windows

1. Instala Docker Desktop.
2. Abre PowerShell en la carpeta del proyecto.
3. Crea variables de entorno:

```powershell
Copy-Item .env.example .env
```

4. Levanta la plataforma:

```powershell
docker compose up -d --build
```

5. Revisa logs si lo necesitas:

```powershell
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f frontend
```

## Instalacion en Ubuntu Server

1. Instala Docker y el plugin Compose.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

2. Entra al proyecto y crea `.env`.

```bash
cp .env.example .env
```

3. Edita secretos para produccion.

```bash
nano .env
```

4. Levanta los servicios.

```bash
sudo docker compose up -d --build
```

5. Comprueba estado.

```bash
sudo docker compose ps
sudo docker compose logs -f backend
```

## Desarrollo local sin Docker

Requisitos: Node.js 22 y PostgreSQL.

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Frontend: `http://localhost:8080`  
Backend: `http://localhost:3001/api`

## Endpoints principales

Auth:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

Series:

- `GET /api/series`
- `GET /api/series/:slug`
- `POST /api/admin/series`
- `PATCH /api/admin/series/:id`
- `DELETE /api/admin/series/:id`

Episodes:

- `GET /api/episodes/latest`
- `GET /api/series/:slug/episodes`
- `GET /api/episodes/:id`
- `POST /api/admin/episodes`
- `PATCH /api/admin/episodes/:id`
- `DELETE /api/admin/episodes/:id`

Movies:

- `GET /api/movies`
- `GET /api/movies/:slug`
- `POST /api/admin/movies`
- `PATCH /api/admin/movies/:id`
- `DELETE /api/admin/movies/:id`

Favorites:

- `GET /api/favorites`
- `POST /api/favorites`
- `DELETE /api/favorites/:id`
- `GET /api/favorites/check?episodeId=ID`
- `GET /api/favorites/check?movieId=ID`

Genres:

- `GET /api/genres`
- `POST /api/admin/genres`
- `PATCH /api/admin/genres/:id`
- `DELETE /api/admin/genres/:id`

Comments:

- `GET /api/comments/:episodeId`
- `POST /api/comments`
- `GET /api/admin/comments`
- `PATCH /api/admin/comments/:id`
- `DELETE /api/admin/comments/:id`

Admin:

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `PATCH /api/admin/users/:id/password`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/uploads/video`
- `POST /api/admin/uploads/image`
- `GET /api/site-settings`
- `PATCH /api/admin/site-settings`

## Gestion de usuarios

En `http://localhost:8088/admin/users` un administrador puede crear, editar, activar, desactivar y eliminar usuarios. Tambien puede cambiar email, rol y contrasena.

- Las contrasenas requieren al menos 8 caracteres.
- La nueva contrasena debe confirmarse.
- Solo se almacena el hash bcrypt; la contrasena real nunca se devuelve.
- Un administrador no puede desactivarse, quitarse su propio rol ni eliminar su propia cuenta.

## Videos y archivos locales

En `Admin > Episodios` puedes seleccionar una fuente:

- `LOCAL`: sube un archivo MP4 local, incluido contenido 1080p.
- `URL`: pega una URL HTTPS que termine en `.mp4`.
- `HLS`: pega una URL HTTPS que termine en `.m3u8`.
- `DRIVE`: pega un enlace publico de Google Drive.
- `EMBED`: pega una URL HTTPS de insercion permitida.

### Subir MP4 1080p

1. Abre `Admin > Episodios`.
2. Selecciona `Subir video local MP4`.
3. Elige un archivo con extension `.mp4` y MIME `video/mp4`.
4. Espera a que la barra llegue al 100%.
5. Revisa el preview y guarda el episodio.

El limite predeterminado es 2048 MB:

```env
MAX_VIDEO_UPLOAD_MB=2048
```

Los MP4 se guardan en `uploads/videos/` y se publican como `/uploads/videos/nombre.mp4`. Nginx admite peticiones `Range` para reproduccion progresiva y avance dentro del video.

### URL MP4 externa

Selecciona `URL externa MP4` y pega una direccion HTTPS directa:

```text
https://media.example.com/episodio-01.mp4
```

La URL debe comenzar con `https://` y terminar en `.mp4`.

### HLS

Selecciona `URL HLS .m3u8` y pega una direccion HTTPS:

```text
https://media.example.com/serie/master.m3u8
```

El reproductor usa `hls.js` en navegadores compatibles.

### Google Drive

Selecciona `URL de Google Drive`. Se aceptan estos formatos:

```text
https://drive.google.com/file/d/FILE_ID/view
https://drive.google.com/open?id=FILE_ID
https://drive.google.com/uc?id=FILE_ID
```

El backend conserva el enlace original y genera:

```text
https://drive.google.com/uc?export=download&id=FILE_ID
https://drive.google.com/file/d/FILE_ID/preview
```

En Drive abre `Compartir > Acceso general` y selecciona `Cualquier persona con el enlace`. El reproductor intenta primero la descarga directa y, si falla, muestra el iframe preview.

Google Drive puede bloquear la reproduccion por permisos, cookies, cuota o limite de ancho de banda. Si ocurre:

- Confirma que el archivo sea publico.
- Abre el enlace en una ventana privada.
- Espera si Drive indica exceso de descargas.
- Para trafico estable usa almacenamiento/CDN diseñado para streaming.

### Embeds

Usa URLs de reproductor, por ejemplo `https://www.youtube-nocookie.com/embed/ID`, no la URL normal de la pagina.

Los proveedores embed permitidos se configuran con:

```env
ALLOWED_EMBED_DOMAINS=youtube.com,player.vimeo.com,drive.google.com
```

Los archivos quedan persistidos en:

```text
uploads/videos/
uploads/images/
```

Nginx monta esta carpeta en modo lectura y la publica en `/uploads/`. No la elimines al recrear contenedores.

## Peliculas

En `http://localhost:8088/admin/movies` un administrador puede crear, editar y eliminar peliculas. El formulario permite subir portada, banner y MP4 local 1080p, o usar URL MP4, HLS, Google Drive y embeds permitidos.

Estados disponibles:

- `DRAFT`: visible solo en administración.
- `PUBLISHED`: visible en `/movies` y Home.
- `HIDDEN`: oculta del catálogo público.

El botón `Volver a Home` del panel conserva la sesión activa.

## Favoritos y reproductor

Usuarios y administradores pueden agregar episodios o películas a favoritos desde el botón de corazón bajo el reproductor. Los favoritos se almacenan por usuario y no se duplican.

La ruta `/favorites` muestra películas y episodios guardados, con opciones para reproducirlos o quitarlos.

Los reproductores de episodios y películas incluyen:

- Video responsive con pantalla completa mediante controles nativos.
- Título, descripción y fecha o año.
- Botón de favoritos.
- Recomendaciones laterales en escritorio y debajo en móvil.
- Episodio anterior y siguiente para series.

## Diseno del sitio

En `http://localhost:8088/admin/settings/design` puedes editar nombre, logo, favicon, colores, modo claro/oscuro, hero, series destacadas, orden y visibilidad de secciones, comentarios y footer.

## Login administrativo

Abre:

```text
http://localhost:8088/login
```

Credenciales:

```text
admin@site.local
Admin123456
```

Al iniciar sesion correctamente, el navegador guarda el token JWT y los datos basicos del usuario, valida la sesion mediante `/api/auth/me` y redirige a `/home`. Las cuentas sin rol `ADMIN` reciben una pantalla de acceso denegado si intentan abrir `/admin`.

La ruta `/` abre el login. Tanto usuarios normales como administradores son redirigidos a `/home` después de autenticarse. El contenido requiere una sesión válida:

- `/home`: inicio y catálogo.
- `/series`: listado de series.
- `/movies`: sección de películas.
- `/favorites`: favoritos.
- `/profile`: datos de la cuenta.
- `/watch/:episodeId`: reproductor.
- `/admin`: exclusivo para cuentas con rol `ADMIN`.

Logs de diagnostico:

```bash
docker compose logs -f nginx
docker compose logs -f backend
docker compose logs -f frontend
```

## Backups

Backup de uploads:

```bash
tar -czf masmax-uploads.tar.gz uploads/
```

En Windows:

```powershell
Compress-Archive -Path uploads -DestinationPath masmax-uploads.zip
```

Backup de PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U masmax masmax > masmax-database.sql
```

Restaurar PostgreSQL:

```bash
docker compose exec -T postgres psql -U masmax masmax < masmax-database.sql
```

En PowerShell puedes copiar `uploads` normalmente y generar el dump así:

```powershell
docker compose exec -T postgres pg_dump -U masmax masmax | Out-File -Encoding utf8 masmax-database.sql
```

## Seguridad incluida

- JWT en rutas privadas.
- Guard para rol `ADMIN` en `/api/admin/*`.
- Validacion con `class-validator`.
- Hash de passwords con `bcrypt`.
- CORS configurable desde `.env`.
- Panel `/admin` bloqueado si no hay token admin.

## Estructura

```text
apps/
  backend/     NestJS, Prisma, JWT, REST API
  frontend/    React, Vite, TailwindCSS
nginx/         Reverse proxy principal
docker-compose.yml
.env.example
```

## Notas de contenido

Los nombres, descripciones e imagenes son demo. No se incluye contenido real con copyright ni marca de terceros.
