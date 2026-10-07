# Observabilidad HTTP

Cada request recibe X-Request-Id y el mismo identificador en errores y logs. Se acepta únicamente UUID de 36 caracteres, variantes RFC y versiones 1–5; se normaliza a minúsculas. Ausente, inválido o excesivamente largo genera crypto.randomUUID. No se añade dependencia UUID. Un ID aceptado identifica correlación, no autenticación ni unicidad global garantizada.

Express Request está tipado como ApiRequest con requestId y JwtPayload. AsyncLocalStorage lleva contexto a transacciones y auditoría sin casts any. El middleware cubre rutas Nest, 404, Swagger y preflight, evitando duplicación del log.

Una entrada JSON `http_request` por respuesta/close contiene requestId, method, path sin query, statusCode, durationMs>=0 y userId si fue autenticado (también login exitoso). Nest Logger mantiene su prefijo habitual alrededor del payload JSON. No se registran cuerpos, cabeceras, cookies, password ni JWT. Los abortos usan el estado disponible al cerrar; no existe tracing distribuido.

Los errores 5xx registran `http_error`: tipo, mensaje y stack sanitizados junto a requestId/method/path/userId. `audit_failure` identifica fallos postcommit de auditoría. StructuredLogger excluye claves sensibles y enmascara secretos configurados, URL PostgreSQL, contraseña de conexión, Bearer/JWT, hashes Argon2 y pares sensibles. Elimina controles y limita textos. La sanitización es defensa adicional; nunca pasar body/headers completos al logger.

## Sondas

`GET /api/v1/health` público: 200 `{status:"ok",timestamp,uptime,version}`. Liveness no consulta BD.

`GET /api/v1/health/ready` público: SELECT 1 parametrizado estático mediante el runtime existente. 200 `{status:"ready",database:"up"}`; fallo/timeout 503 `{status:"not_ready",database:"down"}`. No devuelve SQL, URL ni stack. El presupuesto de espera es dos segundos; Promise.race no cancela la query subyacente en esta RC. Investigar timeout/cancelación del driver antes de producción con alta frecuencia de sondas.

Version procede de package.json. No se exponen entorno completo, hostname ni rutas internas en health.

## Operación y deuda

Usar el requestId del cliente para buscar logs; centralizar stdout con la plataforma de despliegue. No se añaden Pino, Winston, Redis, colas ni tracing complejo. Quedan pendientes retención/exportación de logs y auditoría, restricción de documentación según despliegue, auditoría obligatoria de catálogos y alertas de audit_failure. No se implementa eliminación automática.

Evidencia: docs/api-evidencia.json, docs/api-swagger-browser.json y docs/API-VALIDACION.md. Los artefactos guardan resultados sanitizados, nunca JWT ni credenciales reales.
