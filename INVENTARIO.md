# Inventario

Devoluciones de venta registra ENTRADAS compensatorias mediante `entradaEnTransaccion`; devoluciones de compra registra SALIDAS compensatorias mediante `salidaEnTransaccion`. Ambas comparten una sola transacción con su documento y conservan movimientos históricos. Kardex mantiene ENTRADA/SALIDA/AJUSTE y muestra el origen en observación. El flujo real Compra+20, Venta-8, devolución cliente+3, devolución proveedor-4 termina en stock11. InventarioService sigue siendo la única autoridad de existencias. Véase [DEVOLUCIONES.md](DEVOLUCIONES.md) para disponibilidad histórica, locks, concurrencia y rollback.

Ventas utiliza `salidaEnTransaccion` como wrapper del mismo núcleo transaccional para confirmar todos sus detalles atómicamente. Véase [VENTAS.md](VENTAS.md). Los endpoints manuales mantienen su comportamiento. DELETE de productos con detalles de venta también devuelve 409.

Compras se integra mediante `InventarioService.entradaEnTransaccion`, reutilizando las reglas y bloqueos existentes dentro de una única transacción de recepción. Los endpoints manuales conservan su propia transacción. Véase [COMPRAS.md](COMPRAS.md) para el dominio comercial, auditoría, rollback y doble recepción. DELETE de productos con detalles de compra también devuelve 409 para conservar las referencias normalizadas.

Backend existente NestJS, ESM, PostgreSQL y Prisma ORM 8 RC con Contracts. No se cambiaron dependencias ni se introdujo PrismaClient. La lógica de escritura, FOR UPDATE, transacciones, auditoría, rollback, FK RESTRICT y CHECK permanece intacta.

## Endpoints y autorización

Todos requieren `Authorization: Bearer {{token}}`. Las consultas conservan JwtAuthGuard y RolesGuard; como antes, cualquier usuario autenticado puede consultar. Solo ADMINISTRADOR puede registrar movimientos.

| Método | Ruta bajo /api/v1 | Respuesta |
|---|---|---|
| GET | /inventario/movimientos | Colección paginada |
| GET | /inventario/movimientos/producto/:productoId | Colección paginada del producto |
| GET | /inventario/kardex/:productoId | Producto, colección paginada y metadata |
| GET | /inventario/existencias | Colección paginada |
| GET | /inventario/existencias/:productoId | Resumen individual |
| POST | /inventario/movimientos/entrada | Movimiento creado, 201 |
| POST | /inventario/movimientos/salida | Movimiento creado, 201 |
| POST | /inventario/movimientos/ajuste | Movimiento creado, 201 |

Cambio de contrato deliberado: las tres listas existentes pasan de array a `{data,pagination}`. Los consumidores deben leer `response.data`. Ninguna lista devuelve todo por omisión.

## Paginación y filtros

`page`: entero 1..2147483647, default 1. `limit`: entero 1..100, default 20. Páginas sin resultados devuelven data vacío conservando el total; una colección vacía tiene totalPages=0. hasPreviousPage significa page>1.

Movimientos admite productoId y usuarioId enteros positivos hasta 2147483647; tipo ENTRADA/SALIDA/AJUSTE; fechaInicio y fechaFin; sortBy y sortOrder. Los filtros se combinan con AND. Las rutas por producto y Kardex admiten page, limit, tipo, fechas y orden; rechazan productoId y usuarioId por query.

sortBy: createdAt (default), tipo, cantidad, stockAnterior, stockNuevo. sortOrder: desc (default), asc. Se usa whitelist explícita con operadores ORM tipados. id en la misma dirección desempata para garantizar un orden determinista. Nunca se interpolan nombres de columna del usuario en SQL.

Fechas: `YYYY-MM-DD` representa un **día UTC**, inicio 00:00:00.000Z y fin 23:59:59.999Z inclusivo. Un timestamp debe incluir Z u offset explícito (ejemplo 2026-09-30T00:00:00-06:00). Se normaliza a UTC, independiente del timezone del proceso. Para días civiles de México, enviar timestamps con el offset deseado. fechaInicio posterior a fechaFin devuelve 400. PostgreSQL conserva timestamptz.

Existencias admite search (string hasta 200 caracteres, recortado) y stockBajo (`true` o `false`). Busca fragmentos en SKU, nombre y código de barras mediante ILIKE parametrizado; `%`, `_` y barra inversa se escapan como caracteres literales. stockBajo=true filtra cantidad <= stockMinimo; false filtra cantidad > stockMinimo. El booleano se calcula siempre, sin almacenarlo.

Producto inexistente: 404. Producto sin Existencia: 409 explícito, tanto individual como al aparecer en una página de existencias; no se inventa stock cero. Las operaciones existentes mantienen su recuperación bajo bloqueo de productos anteriores sin existencia. Una consulta de historial por producto puede funcionar aunque falte Existencia; Kardex requiere existencia real para stockActual.

## Contratos de respuesta

Todas las colecciones comparten exactamente esta metadata:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 125,
    "totalPages": 7,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

totalPages = ceil(totalItems / limit). Todos los valores numéricos son números JSON.

Movimiento paginado (también en Kardex):

```json
{
  "id": 5,
  "productoId": 1,
  "producto": {"id": 1, "sku": "LAP-DELL-001", "nombre": "LAPTOP DELL LATITUDE"},
  "tipo": "AJUSTE",
  "cantidad": -7,
  "stockAnterior": 52,
  "stockNuevo": 45,
  "observacion": "Conteo físico",
  "usuarioId": 1,
  "usuario": {"id": 1, "nombre": "Administrador", "apellido": null, "email": "admin@inventario.local"},
  "createdAt": "2026-09-30T12:00:00.000Z"
}
```

Kardex agrega `producto` al mismo contrato paginado:

```json
{
  "producto": {"id": 1, "sku": "LAP-DELL-001", "nombre": "LAPTOP DELL LATITUDE", "unidadMedida": "PIEZA", "stockActual": 45, "stockMinimo": 5},
  "data": [],
  "pagination": {"page": 1, "limit": 20, "totalItems": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false}
}
```

Existencia individual y cada elemento de data en existencias:

```json
{
  "productoId": 1,
  "sku": "LAP-DELL-001",
  "nombre": "LAPTOP DELL LATITUDE",
  "categoria": {"id": 1, "nombre": "TECNOLOGÍA"},
  "cantidad": 45,
  "stockMinimo": 5,
  "stockBajo": false,
  "unidadMedida": "PIEZA",
  "activo": true
}
```

## Persistencia, rendimiento y Prisma RC

Se inspeccionó pg_indexes y EXPLAIN en PostgreSQL real. MovimientoInventario tiene PK(id), índice productoId e índice usuarioId; Existencia tiene PK y UNIQUE(productoId). El plan del Kardex usa Seq Scan + Sort con solo cuatro movimientos existentes (coste 1.09). No se añadieron índices ni se modificó el contract: ese volumen no justifica medir una mejora aún. Con crecimiento, evaluar EXPLAIN ANALYZE para (productoId,createdAt,id) y (createdAt,id), correspondientes al Kardex y listado global; no añadir índice de tipo de baja cardinalidad sin evidencia.

Movimientos usa include con proyecciones explícitas de producto y usuario; no contiene consultas por elemento. Existencias usa dos planes raw parametrizados (IDs de página y count) para comparar cantidad con stockMinimo de otra tabla, y una consulta ORM acotada a esos IDs con include de categoría/existencia. Máximo tres consultas lógicas independientemente del tamaño de la página. No materializa todo el catálogo ni filtra en memoria.

La API de esta RC ofrece aggregate(count), no count() como terminal de colección; include puede inferir null incluso en relaciones requeridas. El raw lane exige codecs de respuesta y no acepta null como interpolación directa: se usan flags booleanos y valores tipados. No se usa any ni SQL concatenado. Las escrituras siguen usando db.transaction y FOR UPDATE existentes.

Deuda técnica: conteo y página son lecturas separadas bajo el aislamiento normal; movimientos simultáneos pueden cambiar totalItems o stockActual entre lecturas. No constituyen un snapshot contable consistente. OFFSET pierde eficiencia en páginas muy profundas; considerar cursores en una futura versión. ILIKE con fragmentos puede requerir pg_trgm al crecer el catálogo, sujeto a medición. count de existencias usa int4, límite 2147483647 productos. No se agregaron índices especulativos.

## Garantías de escritura y errores

ENTRADA/SALIDA usan cantidades positivas. AJUSTE registra stockNuevo-stockAnterior con signo: 52→45=-7, 45→60=15. Se conserva usuario autenticado desde CurrentUser, nunca desde body/query de seguridad. usuarioId como filtro de lectura no cambia la autoría.

Producto se bloquea FOR UPDATE antes de leer stock; operaciones concurrentes del mismo producto se serializan. Fallo al insertar movimiento revierte el saldo. DELETE físico toma el mismo bloqueo y devuelve 409 si hay historial; las FK RESTRICT impiden cascadas.

400: query desconocida/inválida, fechas sin zona explícita si tienen hora, rango invertido, sortBy no permitido, limit>100. 401: JWT ausente/inválido. 403: escritura sin rol administrador. 404: producto inexistente. 409: existencia faltante, producto inactivo, stock insuficiente, saldo fuera de int4 o DELETE con historial. No se expone password, hash o JWT del usuario.

## Postman

Variables: `base_url=http://localhost:3000/api/v1`, `token` del login existente. Header en todas las solicitudes: `Authorization: Bearer {{token}}`. GET sin body.

```text
GET {{base_url}}/inventario/movimientos?page=1&limit=20
GET {{base_url}}/inventario/movimientos?tipo=SALIDA&page=1&limit=10
GET {{base_url}}/inventario/movimientos?productoId=1&usuarioId=1&tipo=ENTRADA&fechaInicio=2026-09-01&fechaFin=2026-09-30&page=1&limit=20
GET {{base_url}}/inventario/movimientos?sortBy=cantidad&sortOrder=asc&page=1&limit=20
GET {{base_url}}/inventario/movimientos/producto/1?page=1&limit=20&tipo=AJUSTE
GET {{base_url}}/inventario/kardex/1?page=1&limit=20
GET {{base_url}}/inventario/existencias?page=1&limit=20
GET {{base_url}}/inventario/existencias?search=dell
GET {{base_url}}/inventario/existencias?stockBajo=true
GET {{base_url}}/inventario/existencias?stockBajo=false
GET {{base_url}}/inventario/existencias/1
```

POST con Content-Type application/json:

```text
POST {{base_url}}/inventario/movimientos/entrada
{"productoId":1,"cantidad":50,"observacion":"Compra inicial"}

POST {{base_url}}/inventario/movimientos/salida
{"productoId":1,"cantidad":8,"observacion":"Salida de almacén"}

POST {{base_url}}/inventario/movimientos/ajuste
{"productoId":1,"nuevaCantidad":45,"observacion":"Conteo físico"}
```

## Verificación

Ejecutar `npx tsc --noEmit --incremental false -p tsconfig.json`, `npm run build`, `npm test` y `TEST_INVENTARIO_DB=1 npm run test:e2e`. E2E requiere PostgreSQL local y permisos de socket. Los fixtures usan UUID y limpieza limitada a sus IDs, sin truncar ni borrar datos ajenos. Las pruebas originales se conservan adaptando asserts al nuevo contrato y al error explícito de existencia faltante.

Validación final ejecutada: TypeScript sin errores, build correcto, 135 pruebas unitarias y 20 E2E pasan. Incluye ENTRADA/SALIDA/AJUSTE (diferencias negativas y positivas), rollback, concurrencia, recuperación bajo bloqueo y DELETE HTTP con historial=409, además de paginación, filtros, fechas UTC, autorización, datos públicos de usuario y existencia faltante.

Revalidación del 2026-10-02: la funcionalidad ya estaba presente al retomar el repositorio. Se ejecutaron nuevamente TypeScript (`--noEmit --incremental false`), build, las 135 pruebas unitarias y los 20 E2E con PostgreSQL real, todos correctos. Se confirmaron los índices reales de productoId y usuarioId y UNIQUE de Existencia.productoId. EXPLAIN ANALYZE del historial de producto ordenado por createdAt e id mostró cuatro filas, Seq Scan + Sort y 0.029 ms de ejecución. No se añadieron índices ni se modificaron código, dependencias, contracts o migraciones en esta revalidación.

Archivos nuevos de esta ampliación: `dto/consulta-inventario.dto.ts`, `dto/consulta-inventario.dto.spec.ts`, `paginacion.ts` dentro de `src/modules/inventario`. DTOs: PaginacionQueryDto, MovimientoQueryDto, MovimientoProductoQueryDto y ExistenciaQueryDto. Archivos modificados: inventario.service.ts, inventario.controller.ts, test/inventario.e2e-spec.ts e INVENTARIO.md. No hubo modificaciones de schema ni migraciones.
