# Almacenamiento

La aplicacion usa `StorageModule` para separar los dominios del medio fisico. El contrato permite escribir desde archivo o memoria, leer, eliminar, comprobar existencia, consultar metadatos, obtener una URL temporal y verificar salud.

## Controlador local

```env
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/uploads
```

Es el valor predeterminado y conserva las URLs `/uploads/*`, la entrega privada de videos mediante Nginx y los volúmenes actuales. `UPLOAD_DIR` sigue siendo la carpeta temporal de Multer y el alias heredado; normalmente debe coincidir con `LOCAL_STORAGE_PATH`.

## Controlador S3

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_BUCKET=novastream-media
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_FORCE_PATH_STYLE=false
```

Es compatible con Amazon S3, MinIO, Cloudflare R2 y APIs equivalentes. Para MinIO suele requerirse `S3_FORCE_PATH_STYLE=true`. El bucket debe ser privado: los videos se entregan mediante URL firmada después de validar usuario y sesión; las imágenes usan una ruta estable de la API que redirige a una URL breve. Los subtítulos continúan pasando por el endpoint autenticado.

El contenedor backend necesita escritura en `/app/uploads/tmp` incluso con S3, porque Multer y FFprobe validan el archivo en disco antes de enviarlo al proveedor. Los archivos completos nunca se cargan en memoria durante una subida de video.

## Migracion segura de local a S3

No cambies `STORAGE_DRIVER` antes de completar y verificar la copia.

1. Detén las escrituras administrativas y crea respaldo de PostgreSQL y `uploads`.
2. Copia `uploads/videos`, `uploads/images` y `uploads/subtitles` conservando exactamente sus claves relativas. Por ejemplo: `aws s3 sync uploads/ s3://novastream-media/ --endpoint-url ...`.
3. Compara cantidad y tamaño de objetos con la tabla `MediaFile`; verifica una muestra mediante checksum SHA-256.
4. En una transacción y con respaldo previo, cambia referencias `/uploads/` por `/api/storage/objects/` en imágenes, videos y subtítulos. No modifiques URLs externas.
5. Configura las variables S3, cambia `STORAGE_DRIVER=s3` y ejecuta `docker compose up -d --build`.
6. Comprueba `/api/health/ready`, una imagen, un MP4, un subtítulo y una eliminación administrativa.
7. Conserva la copia local durante el periodo de validación. Elimina el origen solamente mediante un procedimiento de mantenimiento aprobado.

Para volver a local, invierte la copia y las referencias usando el respaldo. Nunca ejecutes reemplazos globales sin filtrar claves registradas en `MediaFile`.

## Limitaciones

S3 no informa capacidad libre del bucket, por lo que el panel muestra `No disponible`. Las estadisticas de uso se calculan a partir de `MediaFile`. La migracion automatica y la replicacion entre proveedores siguen fuera de alcance; multipart reanudable y resultados HLS usan esta abstraccion.
