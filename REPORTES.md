# Reportes de consulta

ReportesModule importa InventarioModule y DashboardModule. ReportesService contiene las consultas reutilizables; los Controllers solo validan query y delegan. GET exclusivamente; no Excel/PDF/CSV ni escrituras sobre fuentes de verdad. No cambios de dependencias o contrato. JWT y ADMINISTRADOR obligatorios con guards existentes.

## Endpoints y filtros bajo /api/v1

| GET | DTO | Filtros |
|---|---|---|
| /reportes/ventas | ReporteVentasQueryDto | page, limit, fechaInicio, fechaFin, clienteId, estado, search, sortBy, sortOrder |
| /reportes/compras | ReporteComprasQueryDto | page, limit, fechaInicio, fechaFin, proveedorId, estado, search, sortBy, sortOrder |
| /reportes/utilidad | ReporteUtilidadQueryDto | fechaInicio, fechaFin, agrupacion |
| /reportes/inventario | ReporteInventarioQueryDto | page, limit, search, categoriaId, stockBajo, sinExistencia, activo |
| /reportes/kardex | ReporteKardexQueryDto | productoId, tipo, usuarioId, fechaInicio, fechaFin, page, limit, sortBy, sortOrder |

page default1, entero1..2147483647. limit default20,1..100. IDs positivos int4. search string hasta200, recortado. `%`, `_` y barra inversa se escapan literalmente en ILIKE; parámetros no se concatenan. Booleanos query aceptan únicamente true/false.

Fechas/agrupación: política UTC, rango predeterminado mes actual completo, ambas fechas o ninguna, general máximo3660 días, series máximo366/260/120 buckets de día/semana/mes. Véase DASHBOARD.md para límites inclusivos, offsets, relleno, fórmulas y tipos monetarios.

Ventas default CONFIRMADA; admite BORRADOR/CANCELADA explícitos. Compras default RECIBIDA; admite BORRADOR/CANCELADA. Los estados operativos se filtran por fechaConfirmacion/fechaRecepcion; borradores/cancelados por createdAt porque no tienen fecha operativa. No se modifica la semántica de los listados CRUD originales.

sortBy ventas: createdAt(default), folio, estado, total, utilidad. Compras: createdAt(default), folio, estado, total. Kardex: createdAt(default), tipo, cantidad, stockAnterior, stockNuevo. sortOrder desc(default)/asc; id desempata en la misma dirección. No se ordena por campos arbitrarios; utilidad como orden corresponde a utilidad histórica original, no ajustada. Inventario ordena producto.id ASC.

## Contratos para Angular

Ventas, compras, inventario y Kardex global comparten:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Página fuera de rango: data vacía, conserva totalItems/totalPages; hasPreviousPage=page>1. totalPages=ceil(totalItems/limit). Monetarios son strings de dos decimales; conteos/cantidades números. Campos opcionales históricos (fechas, RFC, apellido, códigoBarras) pueden conservar null de la fuente.

| Reporte | Columnas de cada fila |
|---|---|
| Ventas | id, folio, estado, createdAt, fechaConfirmacion, fecha, cliente{id,nombre,apellido,rfc}, subtotal, impuestos, total, costoTotal, utilidadOriginal, devoluciones, costoDevuelto, ventasNetas, costoNeto, utilidadAjustada |
| Compras | id, folio, estado, createdAt, fechaRecepcion, fecha, proveedor{id,nombre,rfc}, subtotal, impuestos, total, devoluciones, compraNeta |
| Inventario | productoId, sku, codigoBarras, nombre, categoria{id,nombre}, cantidad, stockMinimo, unidadMedida, costoActual, precioActual, valorCosto, valorVenta, stockBajo, activo |
| Kardex global | mismas columnas públicas de MovimientoInventario que inventario/movimientos; producto y usuario sin secretos |

`fecha` es fecha operativa o createdAt en estados no operativos. Los importes de Ventas usan el snapshot del encabezado; ranking por producto usa snapshots de detalles. No usa Producto.costo/precio actual para utilidad histórica.

### Diferencia temporal: detalle por documento frente a utilidad del período

Reporte ventas/compras selecciona **documentos** por fecha y aplica todas las devoluciones PROCESADAS vinculadas al documento, sin limitarlas al período, para mostrar su ajuste acumulado actual. Devoluciones posteriores al período también ajustan la fila. Es intencional: detalle de documento y flujo de operaciones son criterios diferentes.

Dashboard y Reporte Utilidad son métricas de **operaciones del período**, descontando exclusivamente devoluciones cuya fechaProcesamiento está dentro de los límites. Solo estos dos resúmenes deben coincidir para el mismo rango. No sumar filas de reporte ventas para intentar reconstruir un flujo temporal con devoluciones de períodos distintos. Nombres de clientes/productos/proveedores son actuales; no existen snapshots descriptivos.

### Utilidad

```json
{
  "resumen": {
    "ventasBrutas": "2000.00", "devoluciones": "450.00", "ventasNetas": "1550.00",
    "costoVentas": "1300.00", "costoDevuelto": "300.00", "costoNeto": "1000.00",
    "utilidadOriginal": "700.00", "impactoDevoluciones": "150.00",
    "utilidadBruta": "550.00", "margenPorcentaje": "35.48"
  },
  "data": []
}
```

Cada fila de data incluye periodo y los mismos campos de resumen. Se rellenan buckets con cero en ASC. Resumen se obtiene sumando componentes de los buckets con BigInt y recalculando margen global; no se promedian porcentajes. Usa DashboardService.series y la fórmula utilidad compartida. El ejemplo omite las filas solo para abreviar; un rango válido siempre genera sus buckets, aunque no tenga operaciones.

### Inventario y Kardex

Inventario default activo=true; activo=false consulta inactivos, no todos. stockBajo compara cantidad<=stockMinimo; sinExistencia compara cantidad=0. Filtros combinados con AND. Valorización por fila exacta cantidad×costoActual/precioActual, referencial del catálogo actual. Producto sin fila Existencia causa409 al encontrarse en la página; no se trata como cero ni se repara desde un reporte.

`/reportes/kardex` aporta consulta global/exportable por producto/tipo/usuario/fechas. Delega a InventarioService.findMovimientos. `/inventario/kardex/:productoId` sigue siendo el reporte individual con producto/stockActual y la misma consulta de historial. No hay un segundo motor ni reimplementación de balances. El rango por defecto del reporte global es el mes actual, y las páginas están limitadas a100.

## Consultas, seguridad y rendimiento

Ventas/compras hacen página y count con ORM e include/proyecciones, seguidos de **una** consulta batch SUM de devoluciones para todos los IDs de página. El lote de IDs se parametriza como JSON y se convierte en PostgreSQL; nunca SQL concatenado. Máximo tres consultas lógicas independientes del número de filas; sin query por documento.

Inventario: CTE parametrizada para filtros de columnas relacionadas, conteo y página en la misma sentencia; luego una consulta ORM limitada a IDs con include categoría/existencia. Dos consultas lógicas, sin cargar todo el catálogo. Cero filas conserva conteo mediante RIGHT JOIN. Kardex reutiliza página/count existente. Utilidad una agregación SQL comercial con UNION ALL; relleno y suma exacta en memoria acotada.

No se exponen usuarios completos ni tokens. Filtros no deciden autorización. ValidationPipe mantiene whitelist+forbidNonWhitelisted+transform. Query inválida/rango excedido400, sin JWT401, rol403, existencia faltante409. SQL siempre estático parametrizado con codecs tipados; sin any, PrismaClient clásico, $transaction o dependencias inversas de dominios de escritura.

No se agregaron índices: catálogo de pg_indexes y EXPLAIN ANALYZE de ventas/valorización en docs/dashboard-evidencia.json. Dataset demasiado pequeño para probar beneficio. Limitaciones RC: aggregate(count) en vez de terminal count clásico; relaciones include pueden inferirse nullable; raw requiere returnsRow/codecs y no se interpolan null directamente. Se parametrizan flags/valores tipados para filtros opcionales.

Deuda: páginas/count y batch se leen por separado bajo READ COMMITTED; una devolución concurrente puede cambiar el ajuste entre lecturas. No se promete snapshot contable coherente. OFFSET profundo y búsquedas ILIKE requieren medición con volumen real. Límites de rango no limitan cardinalidad de tablas recorridas. No hay impuestos devueltos/pagos/CFDI ni capas FIFO/LIFO/promedio. Futuras exportaciones deben reutilizar estos servicios/filtros, con streaming/límites y control de consistencia.

## Postman y pruebas

```text
GET {{base_url}}/reportes/ventas?fechaInicio=2026-10-01&fechaFin=2026-10-31&page=1&limit=20
GET {{base_url}}/reportes/compras?fechaInicio=2026-10-01&fechaFin=2026-10-31&page=1&limit=20
GET {{base_url}}/reportes/utilidad?fechaInicio=2026-10-01&fechaFin=2026-10-31&agrupacion=dia
GET {{base_url}}/reportes/inventario?page=1&limit=20
GET {{base_url}}/reportes/inventario?stockBajo=true&page=1&limit=20
GET {{base_url}}/reportes/kardex?productoId={{producto_id}}&page=1&limit=20
```

Colección importable: docs/dashboard-reportes.postman_collection.json; base_url incluye /api/v1. Authorization Bearer {{token}} en cada request. Validación completa, fórmulas, fixture comercial, evidencia read-only y recomendaciones: docs/VALIDACION-DASHBOARD-REPORTES-2026-10-05.md.
