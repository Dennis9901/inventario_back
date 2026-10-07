# Seguridad

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Controles implementados](#controles-implementados)
- [JWT y límites comprobados](#jwt-y-límites-comprobados)
- [Secretos y separación de ambientes](#secretos-y-separación-de-ambientes)
- [Importaciones y privacidad](#importaciones-y-privacidad)
- [Observabilidad y exposición](#observabilidad-y-exposición)
- [Producción propuesta](#producción-propuesta)
- [Fuentes](#fuentes)

## Controles implementados

| Capa | Control/evidencia |
| --- | --- |
| Configuración | URL, secreto, puerto y CORS validados; JWT ≥32 producción |
| Contraseñas | Argon2 hash/verify; respuestas excluyen password |
| Identidad | JWT firmado y expiración; login exige usuario/rol activos |
| Autorización | Guards explícitos y ADMINISTRADOR; matriz en backend |
| Entrada | DTO/whitelist estricta/anidados/IDs/cuerpo vacío de acciones |
| HTTP | Helmet, CORS exacto credentials false, requestId seguro |
| SQL | Planes parametrizados, transacciones/locks/constraints |
| Auditoría | Acción/entidad, evidencia transaccional y redacción de logs |
| Upload | Formato/MIME/contenido, memoria, límites ZIP/XML, sin fórmulas ejecutadas/macros/rutas cliente |
| Browser | Bearer sólo base API, returnUrl local, expiración/limpieza 401 |
| Docker | No root, backend read-only/tmpfs, cap_drop, no-new-privileges, DB red interna |
| CI/Git | Env ignorados, contents read, actions SHA, persist-credentials false |

## JWT y límites comprobados

JwtAuthGuard verifica firma/expiración pero no reconsulta DB; auth/me devuelve payload, no refresca rol. Baja de usuario/cambio de rol no revoca JWT emitido hasta expiración o rotación de secreto. No se identificó refresh token, blacklist/revocación, logout server-side, MFA ni throttling login.

Token en sessionStorage/localStorage puede ser accedido por JS ante XSS. No equivale a cookie HttpOnly. Guards UI no autorizan servidor. Decidir TTL/revocación/protección login según amenaza productiva, sin atribuir explotación comprobada.

## Secretos y separación de ambientes

No versionar .env, archivos _FILE, state E2E ni valores CI_REPO_READ_TOKEN. Entrypoint soporta DB_PASSWORD_FILE y JWT_SECRET_FILE, excluyentes con variable directa. Compose local usa env directa; no existe secrets manager productivo configurado.

CI unit usa valores sintéticos y E2E genera credenciales cortas en DB identificada. No se reproducen valores aunque sean ejemplos. Compose development contiene credenciales de ejemplo versionadas; no reutilizar externamente.

## Importaciones y privacidad

Archivo crudo en memoria descartado; normalizados/plan/issues quedan en tablas administrativas. ZIP/XML acotados, DTD/ENTITY rechazados, externos sin red; fórmulas no se evalúan. Confirmación revalida hash/plan y autorización para updates/cierres/catálogos. Retención/purga requiere política operativa: datos normalizados pueden contener información personal.

## Observabilidad y exposición

Redacción de bearer/JWT/Argon2/URL PostgreSQL y claves sensibles; 500 sin stack al cliente; requestId correlaciona soporte. No imprimir .env/docker inspect completo con env ni publicar artifacts sin revisión. Auditoría no transaccional puede fallar tras negocio y necesita alerta/reconciliación. Swagger está configurado sin guard específico; definir exposición pública antes de producción.

## Producción propuesta

TLS/ingress, roles DB mínimos y DDL separado, secrets manager, backups cifrados/restore, retención, alertas auth/5xx/audit_failure, evaluación RC y escaneo dependencias/imágenes. Propuestas, no controles ya desplegados.

## Fuentes

- [backend/src/configuracion/configuracion.ts](../../src/configuracion/configuracion.ts)
- [backend/src/modules/auth/auth.service.ts](../../src/modules/auth/auth.service.ts)
- [backend/src/modules/auth/guards/jwt-auth.guard.ts](../../src/modules/auth/guards/jwt-auth.guard.ts)
- [backend/src/modules/auth/guards/roles.guard.ts](../../src/modules/auth/guards/roles.guard.ts)
- [backend/src/modules/usuarios/usuarios.service.ts](../../src/modules/usuarios/usuarios.service.ts)
- [backend/src/common/http/structured-logger.ts](../../src/common/http/structured-logger.ts)
- [backend/src/modules/importaciones/parsers/xlsx.ts](../../src/modules/importaciones/parsers/xlsx.ts)
- [backend/docker/entrypoint.mjs](../../docker/entrypoint.mjs)
- [backend/.github/workflows/ci.yml](../../.github/workflows/ci.yml)

[frontend/src/app/core/auth/token-storage.service.ts](../../../inventario_front/src/app/core/auth/token-storage.service.ts)
