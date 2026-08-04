# Checklist de correccion MasMax

Cada hallazgo se considera cerrado solo cuando el cambio, su prueba y la validacion aplicable estan completados. Marcar "Migracion creada" como N/A documentado cuando no corresponda; no crear migraciones vacias.

## Criticos

No se detectaron hallazgos criticos.

## Altos - Seguridad y video

### MMX-001 - Catalogo privado sin autenticacion
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-002 - HLS sin autorizacion efectiva
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-003 - Soft delete incompleto
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-004 - Multer vulnerable
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

## Altos - Operacion

### MMX-005 - Backup/restore inconsistente
- [x] Problema corregido
- [x] Prueba agregada; no se restauro la base real
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker con `sh -n`

## Medios - Frontend y funciones

### MMX-006 - Recuperacion de sesion
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-009 - Moderacion de comentarios
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-010 - Recuperacion/verificacion de cuenta
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-011 - PIN y perfiles kids
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-012 - Progreso al cerrar
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-013 - Jobs HLS sin asociar
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

## Medios - Backend y datos

### MMX-007 - Busqueda de borradores
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-008 - Peliculas eliminadas en admin
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-014 - Listados sin paginacion
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-015 - Throttling no distribuido
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-016 - Readiness costoso
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-017 - Singleton SiteSetting
- [x] Problema corregido
- [x] Prueba agregada
- [x] Documentacion actualizada
- [x] Migracion creada y probada sobre base vacia y copia existente
- [x] Validado en Docker

## Medios - Calidad y operacion

### MMX-018 - Pruebas insuficientes
- [ ] Problema corregido parcialmente; faltan E2E de uploads y restore
- [x] Pruebas agregadas: 66 pruebas y smoke HTTP por rol
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-019 - CI incompleto
- [x] Problema corregido
- [x] Jobs y comandos validados localmente
- [x] Documentacion actualizada
- [x] Migracion marcada N/A; CI ejecuta `migrate deploy`
- [x] Smoke Docker local; pendiente primera ejecucion remota

### MMX-020 - Recursos sin cuotas
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

## Bajos - Calidad y frontend

### MMX-021 - Lint sin ESLint
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-024 - Retry/bundle HLS
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-026 - Disponibilidad API inconsistente
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-027 - Iconos PWA
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-028 - APIs sin experiencia frontend
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

## Bajos - Datos, seguridad y Docker

### MMX-022 - Drift de entorno
- [x] Problema corregido
- [x] Validador de inventario agregado
- [x] Documentacion actualizada
- [x] Migracion marcada N/A
- [x] Validado en Docker

### MMX-023 - Vistas infladas
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-025 - Auditoria best-effort
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker

### MMX-029 - Privilegios de contenedor
- [ ] Problema corregido
- [ ] Prueba agregada
- [ ] Documentacion actualizada
- [ ] Migracion creada o marcada N/A
- [ ] Validado en Docker
