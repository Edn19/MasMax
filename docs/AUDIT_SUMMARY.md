# Resumen de auditoria MasMax

Fecha: 2026-08-02

## Conteo

| Severidad | Cantidad |
| --- | ---: |
| Criticos | 0 |
| Altos | 5 |
| Medios | 15 |
| Bajos | 9 |
| **Total** | **29** |

## Cinco problemas principales

1. **MMX-001:** catalogo y URL de video accesibles sin autenticacion.
2. **MMX-002:** manifiestos/segmentos HLS eluden la autorizacion firmada.
3. **MMX-003:** el borrado logico de series no oculta todos sus episodios.
4. **MMX-004:** Multer 2.0.2 tiene avisos altos de denegacion de servicio en una ruta real.
5. **MMX-005:** backup/restore no carga su entorno de forma reproducible ni aisla escritores.

## Cinco mejoras rapidas

1. Aplicar guard de sesion al catalogo privado y retirar `videoUrl` de DTO de listados.
2. Centralizar filtros de publicacion/soft delete para serie, temporada, episodio y pelicula.
3. Mostrar el estado real de moderacion del comentario devuelto por la API.
4. Cachear la comprobacion de `ffprobe` usada por readiness.
5. Alinear `.env.example`, Compose, scripts y README, empezando por backup y cookie refresh.

## Estado general

El proyecto compila, pasa sus pruebas actuales, valida Prisma y Compose, construye sus imagenes y levanta seis servicios saludables. La estructura tecnica es coherente y no se encontraron secretos versionados ni drift de migraciones.

La cobertura automatizada es insuficiente para permisos y recorridos reales. Los controles de acceso al catalogo/HLS y el procedimiento de recuperacion de datos impiden declarar segura la operacion privada en produccion.

## Recomendacion

**Estado recomendado: Apto con correcciones antes de produccion.**

No requiere reescritura. Debe completarse primero la Fase 1 del plan: control de acceso, autorizacion HLS, consistencia de borrado, dependencia multipart y restore ensayado. Despues deben agregarse E2E de autenticacion, reproduccion y recuperacion.
