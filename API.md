# Inventario API para Angular

Versión 0.0.1. Se conserva el prefijo manual `api/v1`; no se cambia el versionado ni las respuestas exitosas comerciales.

Swagger: `GET /api/docs`. OpenAPI JSON: `GET /api/docs-json`. Ambos son públicos; contienen ejemplos ficticios y esquemas explícitos de DTOs, respuestas, paginación, enums y errores. OpenAPI 3.0 usa `nullable: true`. La UI permite Authorize con el JWT, sin prefijo adicional en el campo y sin persistirlo entre recargas. Se documentan Auth, Roles, Usuarios, Categorias, Productos, Inventario, Proveedores, Compras, Clientes, Ventas, Devoluciones, Dashboard, Reportes, Auditoria, Health y UnidadesMedida. Se utilizan decorators reutilizables `ApiModulo` y `ApiResultado`, no un plugin de compilación que dependa del runner de tests.

Los endpoints protegidos conservan JWT y RolesGuard. Roles, anteriormente público, ahora exige ADMINISTRADOR tanto para lectura como creación. Login, Health y documentación son públicos. La ruta raíz heredada `/api/v1` conserva su respuesta y acceso. Ningún endpoint comercial se hace público.

## Errores

Todas las excepciones tienen esta estructura estable:

```json
{"statusCode":400,"code":"VALIDATION_ERROR","message":"Error de validación","errors":[{"field":"email","messages":["email must be an email"]}],"path":"/api/v1/usuarios","method":"POST","requestId":"6b30bbed-2289-4f18-a5d5-9473248b4a46","timestamp":"2026-10-05T18:00:00.000Z"}
```

`ApiErrorResponse` siempre incluye `errors` (array vacío fuera de validación). `ValidationErrorResponse` comparte ese contrato y usa `VALIDATION_ERROR`. Los errores de campos anidados usan rutas como `detalles.0.productoId`. No se devuelve el valor rechazado. Los mensajes de class-validator siguen su idioma original; Angular puede mapearlos por `field`.

Códigos iniciales: BAD_REQUEST, VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, STOCK_INSUFICIENTE, PRODUCTO_INACTIVO, INTERNAL_ERROR, SERVICE_UNAVAILABLE y HTTP_ERROR para otros estados. Se conservan los estados y mensajes de conflictos existentes. Las excepciones pueden especificar un `code` mayúsculo estable sin refactorizar todo el dominio. Los 500 devuelven únicamente `Error interno del servidor`; stack/SQL nunca llegan al cliente. El filtro también cubre rutas inexistentes y omite query strings del `path`.

El ValidationPipe es global mediante APP_PIPE: whitelist, forbidNonWhitelisted, transform y errores por campo. Los tests utilizan esa misma configuración, sin un segundo pipe.

## Configuración y seguridad

Copiar `.env.example` y proporcionar valores reales fuera de Git:

| Variable | Uso |
|---|---|
| DATABASE_URL | Conexión PostgreSQL obligatoria, protocolo PostgreSQL y base definida |
| JWT_SECRET | Obligatorio; producción exige al menos 32 caracteres |
| JWT_EXPIRES_IN | Duración `8h` por defecto; unidades s/m/h/d, máximo un año |
| PORT | 3000 por defecto; 1–65535 |
| NODE_ENV | development/test/production |
| CORS_ORIGINS | Orígenes http(s) exactos separados por coma; localhost:4200 en desarrollo; obligatorio en producción |

La configuración se valida al arranque sin imprimir secretos. Auth usa la misma configuración para firmar, verificar y responder expires_in. Helmet activa sus headers predeterminados, incluido CSP; Swagger carga con esa política, sin desactivarla. CORS no habilita credenciales; permite Authorization, Content-Type y X-Request-Id, y expone X-Request-Id a Angular. Un origen no permitido no recibe autorización CORS. No es un mecanismo de autorización del servidor.

## Integración Angular

El interceptor del futuro frontend deberá adjuntar Authorization Bearer, leer X-Request-Id, procesar el contrato de error, asociar errors por field, manejar 401/403 y mostrar mensajes 409. Los importes comerciales continúan como strings. El requestId sirve para localizar el diagnóstico del servidor y se puede mostrar al usuario. No almacenar JWT en ejemplos ni repositorios.

Las consultas de Auditoría usan fechas UTC: días completos desde 00:00:00.000Z hasta 23:59:59.999Z inclusive; timestamps requieren zona explícita. Se reutilizan las reglas existentes sin configurar una zona nueva. Dashboard/Reportes mantienen sus fórmulas y política temporal descritas en DASHBOARD.md y REPORTES.md.

Ver AUDITORIA.md, OBSERVABILIDAD.md y docs/API-VALIDACION.md. Colección: docs/api-infraestructura.postman_collection.json. Health y readiness son sondas públicas; readiness tiene un contrato operacional propio también en 503.

## Backend 5A — catálogo COMESI

Cliente conserva su contrato legacy y agrega nombreComercial, regimenFiscal, usoCfdi, numeroRegistroTributario, residenciaFiscal, celular, emailAlterno y domicilioFiscal opcionales. Producto añade claveProductoServicioSat, objetoImpuestoSat y unidadMedidaId; conserva SKU, costo, precio y unidadMedida. Lecturas de clientes incluyen domicilio fiscal.

Nuevas rutas `/api/v1/unidades-medida`: GET lista/por id; POST; PATCH por id, activar y desactivar; DELETE. Lecturas autenticadas y mutaciones ADMINISTRADOR; duplicados/referencias devuelven 409. Swagger incorpora DTOs y schemas de respuesta.

Documentación: [Clientes](docs/CLIENTES.md), [Productos](docs/PRODUCTOS.md), [Unidades](docs/UNIDADES-MEDIDA.md), [modelo COMESI](docs/MODELO-COMESI.md), [validación](docs/VALIDACION-BACKEND-5A.md).

## Backend 5B — Listas de precios

Endpoints /api/v1/listas-precios y /api/v1/productos/:productoId/precio; listaPrecioId opcional en Venta. Lecturas JWT, mutaciones ADMINISTRADOR.

Ver [docs/LISTAS-PRECIOS.md](docs/LISTAS-PRECIOS.md) para contrato, fallback, concurrencia e instalación del SQL complementario.

## Backend 5C — Importador COMESI

Importación CLIENTES/PRODUCTOS CSV y PRECIOS CSV/XLSX en dos fases: preview persistido sin escrituras comerciales, confirmación explícita con revalidación y transacción global. Todos los endpoints /api/v1/importaciones requieren ADMINISTRADOR. Productos crean existencia en cero; precios conservan snapshots y garantías 5B.

Ver [docs/IMPORTACIONES.md](docs/IMPORTACIONES.md) para multipart, mapping, límites, idempotencia, privacidad, errores y autorización de updates/cierres. Evidencia y reporte: [docs/VALIDACION-BACKEND-5C.md](docs/VALIDACION-BACKEND-5C.md).
