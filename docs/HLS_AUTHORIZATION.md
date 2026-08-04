# Autorizacion HLS

## Modelo

El catalogo autenticado no entrega `videoUrl`. El player solicita `/api/media/authorize` con `episodeId` o `movieId`. El backend verifica que el contenido y todos sus padres sean visibles y emite un token corto ligado a usuario, sesion, contenido, job HLS y expiracion.

La URL inicial tiene esta forma conceptual:

```text
/api/media/hls?token=TOKEN_CORTO&path=master.m3u8
```

Cada playlist se lee en backend y sus referencias se reescriben a la misma ruta firmada. El parametro `path` admite solo el master, playlists de calidad y segmentos previstos dentro del mismo job. No puede ampliar el prefijo, usar `..`, una ruta absoluta ni una URL externa.

## Entrega local

Nginx responde 404 para `/uploads/hls/`. Tras validar token, sesion y objeto, Nest usa `X-Accel-Redirect` hacia `/protected-media/hls/...`, una ubicacion `internal`. Esto conserva streaming eficiente sin exponer la ruta fisica.

## Entrega S3

Nest valida primero el token y la sesion. Los manifiestos se reescriben en backend; cada segmento obtiene una URL S3 prefirmada cuya duracion nunca supera la expiracion restante del token de aplicacion. La clave interna no se devuelve en el catalogo.

## Compatibilidad

HLS.js y Safari reciben manifiestos HLS estandar. Las referencias absolutas reescritas permiten que playlists anidadas y segmentos conserven el token. Renovar la pagina obtiene una autorizacion nueva; al vencer, el player debe solicitar otra autorizacion.

## Casos de seguridad

- Sin JWT, `/media/authorize` responde 401.
- Sin token o con firma alterada, `/media/hls` responde 403.
- Token expirado o sesion revocada responde 403.
- Ruta fuera del job responde 403.
- `/uploads/hls/...` responde 404.
- Un ADMIN no evita estas reglas al reproducir; usa el mismo flujo firmado.
