# Dashboard comercial e inventario

Implementación sobre el backend NestJS existente, ESM y Prisma ORM 8 RC Contracts. Solo SELECT/aggregate: no modifica documentos, snapshots, Existencia ni MovimientoInventario. No necesita nuevas tablas, dependencias, índices, cache ni migraciones.

## Arquitectura y acceso

`DashboardModule` importa `InventarioModule`; `DashboardService` consulta DatabaseService y reutiliza `InventarioService.findMovimientos` para movimientos recientes. Reportes reutiliza las métricas/fórmulas de Dashboard. Inventario, Compras, Ventas y Devoluciones no dependen de Dashboard ni Reportes. La lógica de consulta está en servicios, preparada para Angular y futura exportación.

Todos los endpoints requieren JWT y rol ADMINISTRADOR mediante JwtAuthGuard, RolesGuard y Roles existentes. JWT ausente/inválido: 401; rol distinto: 403. Proyecciones explícitas de usuarios sin password/hash/token. No hay filtros de identidad que decidan permisos.

## Endpoints bajo /api/v1

| GET | Query | Respuesta |
|---|---|---|
| /dashboard/resumen | fechaInicio, fechaFin | periodo, ventas, compras, utilidad, inventario, clientes, proveedores, comparativa |
| /dashboard/ventas | fechas, agrupacion | data: periodo, ventasBrutas, devoluciones, ventasNetas, costoNeto, utilidad |
| /dashboard/compras | fechas, agrupacion | data: periodo, comprasBrutas, devoluciones, comprasNetas |
| /dashboard/productos-mas-vendidos | fechas, limit | data: producto{id,sku,nombre}, cantidadVendidaBruta, cantidadDevuelta, cantidadVendidaNeta, importeNeto |
| /dashboard/stock-bajo | limit | data: productoId, sku, nombre, cantidad, stockMinimo, unidadMedida, faltanteParaMinimo |
| /dashboard/movimientos-recientes | limit | data: id, productoId, producto{id,sku,nombre}, tipo, cantidad, stockAnterior, stockNuevo, observacion, usuarioId, usuario{id,nombre,apellido,email}, createdAt |
| /dashboard/actividad-reciente | limit | data: tipo, id, folio, importe, fecha, descripcion |
| /dashboard/clientes-principales | fechas, limit | data: cliente{id,nombre}, cantidadVentas, ventasBrutas, devoluciones, ventasNetas |
| /dashboard/proveedores-principales | fechas, limit | data: proveedor{id,nombre}, cantidadCompras, comprasBrutas, devoluciones, comprasNetas |

DTOs: DashboardPeriodoQueryDto, DashboardSerieQueryDto, DashboardRankingQueryDto, DashboardLimitQueryDto, DashboardStockQueryDto. `limit` default10/máximo50 excepto stock-bajo máximo100. Validación estricta de ISO8601, enteros positivos, enums y propiedades desconocidas; no se aceptan query extras. agrupacion default `dia`, whitelist `dia|semana|mes`.

## Fechas y zona horaria

Se mantiene la política existente: días sin hora `YYYY-MM-DD` representan UTC, 00:00:00.000Z hasta 23:59:59.999Z inclusive. Timestamps requieren Z u offset explícito y se normalizan a UTC. No se añade timezone configurable. Enviar offsets para delimitar jornadas de México; **los buckets continúan agrupados en UTC**, aunque los límites lleguen con offset.

Ambas fechas son necesarias si se envía alguna. Sin fechas, todos los endpoints temporales utilizan el mes calendario UTC actual completo. fechaInicio > fechaFin produce400. Máximo general3660 días; series permiten como máximo366 buckets diarios,260 semanales y120 mensuales. Se valida antes de consultar/generar buckets; un exceso devuelve400. Semanas comienzan lunes UTC; meses el día1. Cada etiqueta es YYYY-MM-DD y señala el inicio del bucket; el primer bucket puede empezar antes de fechaInicio. Las operaciones siguen limitadas exactamente al rango solicitado, inclusive cuando los buckets son parciales.

Las series retornan todos los buckets, con ceros donde no hay operaciones, en ASC. Un período válido sin movimientos retorna una serie de ceros. Rankings/listas sin registros retornan `data: []`. Todas las formas de respuesta son estables.

## Fuentes, importes y fórmulas

Ventas comerciales: únicamente Venta CONFIRMADA, por fechaConfirmacion. Compras: únicamente Compra RECIBIDA, por fechaRecepcion. Ambas devoluciones: únicamente PROCESADA, por fechaProcesamiento. BORRADOR/CANCELADA quedan fuera de métricas y rankings. Nunca se sustituye una fecha de ejecución con createdAt.

| KPI | Fórmula |
|---|---|
| ventas.brutas | SUM(Venta.subtotal) sin impuestos |
| ventas.impuestos | SUM(Venta.impuestos) |
| ventas.facturadas | SUM(Venta.total), con impuestos |
| ventas.devoluciones | SUM(DevolucionVenta.subtotal) |
| ventas.netas | brutas − devoluciones |
| utilidad.costoVentasOriginal | SUM(Venta.costoTotal), snapshot histórico |
| utilidad.costoDevuelto | SUM(DevolucionVenta.costoTotal), snapshot histórico |
| utilidad.costoNeto | costoVentasOriginal − costoDevuelto |
| utilidad.brutaOriginal | ventas.brutas − costoVentasOriginal |
| utilidad.impactoDevoluciones | devoluciones − costoDevuelto |
| utilidad.brutaAjustada | brutaOriginal − impactoDevoluciones = ventas.netas − costoNeto |
| utilidad.margenPorcentaje | brutaAjustada / ventas.netas ×100; cero si denominador0 |
| compras.brutas | SUM(Compra.subtotal) |
| compras.devoluciones | SUM(DevolucionCompra.subtotal) |
| compras.netas | brutas − devoluciones |
| compras.impuestos / facturadas | SUM(impuestos) / SUM(total) |

Los objetos ventas/compras también incluyen cantidad de documentos y cantidadDevoluciones. No se devuelve una facturación neta con impuestos: el dominio de devoluciones no guarda un snapshot de impuestos devueltos. No se inventa una devolución fiscal.

Las devoluciones cuentan por su propia fecha incluso si el documento original pertenece a otro período. Por ello netas, costoNeto y utilidad pueden ser negativos. Una devolución por300 con costo recuperado180 reduce la utilidad en120, nunca en300. El reporte de utilidad comparte las fórmulas y las agregaciones con Dashboard.

SUM/multiplicaciones SQL usan PostgreSQL numeric. En TypeScript se usan centavos BigInt y helpers comunes, con serialización monetaria a string de dos decimales y signo. Porcentajes se redondean a dos decimales, mitades alejándose de cero. Nunca se suman importes monetarios con Number/Float. Conteos y unidades son números JSON.

## Inventario actual y valorización

Siempre refleja el estado actual del catálogo, independiente del período comercial. Solo activos: productosActivos, SUM(Existencia.cantidad), stock bajo `cantidad <= stockMinimo`, sin existencia física `cantidad = 0`.

ValorCosto = SUM(cantidad×Producto.costo). ValorVenta = SUM(cantidad×Producto.precio). **Valorización referencial usando costo/precio actual del producto**, no valoración contable FIFO/LIFO/promedio. Ventas y utilidad usan snapshots históricos incluso después de cambiar el catálogo.

Si falta la fila Existencia, no se inventa stock0 ni se escribe para repararla: inventario.productosSinRegistroExistencia informa la anomalía; la fila no contribuye a sumas, stock bajo ni cero. Reporte Inventario conserva el409 existente al encontrar un producto sin Existencia en su página.

## Rankings, actividad y comparativa

Productos: DetalleVenta histórico menos DetalleDevolucionVenta procesada del período. SUM de cantidades brutas/devueltas y subtotales históricos; ranking por cantidadVendidaNeta DESC, producto.id ASC para desempatar. Clientes por ventas netas DESC/id ASC; proveedores por compras netas DESC/id ASC. Los rankings históricos incluyen sujetos/productos actualmente inactivos que tuvieron actividad; no borran su historia. SKU/nombres son los actuales, pues el dominio no guarda snapshots descriptivos.

Stock bajo: activos con Existencia real; cantidad0 primero, déficit DESC, id ASC. Igualdad con mínimo cuenta; faltanteParaMinimo=max(stockMinimo−cantidad,0). Movimientos recientes reutilizan el listado de Inventario, createdAt DESC/id DESC.

Actividad reciente hace una consulta UNION ALL con cuatro ramas limitadas a `limit` cada una y aplica orden/limit global. Fecha operativa DESC, tipo ASC, id DESC. Combina ventas confirmadas, compras recibidas y devoluciones procesadas; importe corresponde al subtotal sin impuestos. No materializa todo el historial en Node.

Comparativa: período anterior de igual duración exacta inmediatamente anterior. Consulta adicional agregada para todas las fuentes, evitando consultas por KPI. `(actual−anterior)/abs(anterior)×100`; si anterior0 se devuelve null. Devuelve periodoAnterior, ventasNetasPorcentaje y utilidadPorcentaje. Duración inclusiva calculada en milisegundos; no significa necesariamente mes calendario anterior.

## SQL, performance y límites

Raw SQL parametrizado con returnsRow y codecs tipados se usa para UNION/CTE de fuentes independientes, date_trunc UTC, sumas y rankings netos, multiplicación numeric con joins, comparación entre cantidad y stockMinimo y actividad limitada. Agrupación se mapea a valores internos day/week/month; jamás se interpola un identificador SQL del usuario. Los filtros y LIMIT se parametrizan. Se reutiliza ORM con include/proyecciones para movimientos y conteos de clientes/proveedores. Sin consultas por fila, sin N+1.

Resumen usa dos consultas comerciales agregadas (actual/anterior), una de inventario y dos conteos activos. Series usan una agregación comercial, no una consulta por bucket. Rankings/stock/actividad: una consulta cada uno. Movimientos: motor existente de página+count con relaciones.

EXPLAIN ANALYZE real e índices en docs/dashboard-evidencia.json. Dataset pequeño: ventas Seq Scan+Aggregate; valorización Nested Loop con scans. Sin índices añadidos: no hay evidencia suficiente para justificar beneficio. Con volumen real, medir estado+fecha operativa, createdAt+id en movimientos e ILIKE antes de cualquier cambio de contrato.

Lecturas independientes no forman un snapshot contable global bajo concurrencia. Los límites acotan buckets/filas devueltas; una consulta de diez años aún puede recorrer muchas operaciones. Sin cache/Redis/materialized views/exportaciones. Conteos usan int4 y números JSON; volúmenes fuera de sus límites requieren revisar el contrato numérico. Recomendado medir carga real, definir snapshots consistentes y generar tipos del cliente en el próximo sprint.

## Postman y verificación

Colección docs/dashboard-reportes.postman_collection.json. Variables base_url=`http://localhost:3000/api/v1`, token administrador y producto_id real. Todas las solicitudes GET, sin body, Authorization: Bearer {{token}}.

```text
GET {{base_url}}/dashboard/resumen
GET {{base_url}}/dashboard/resumen?fechaInicio=2026-10-01&fechaFin=2026-10-31
GET {{base_url}}/dashboard/ventas?fechaInicio=2026-10-01&fechaFin=2026-10-31&agrupacion=dia
GET {{base_url}}/dashboard/compras?fechaInicio=2026-10-01&fechaFin=2026-10-31&agrupacion=mes
GET {{base_url}}/dashboard/productos-mas-vendidos?fechaInicio=2026-10-01&fechaFin=2026-10-31&limit=10
GET {{base_url}}/dashboard/stock-bajo?limit=10
GET {{base_url}}/dashboard/movimientos-recientes?limit=10
GET {{base_url}}/dashboard/actividad-reciente?limit=10
GET {{base_url}}/dashboard/clientes-principales?fechaInicio=2026-10-01&fechaFin=2026-10-31
GET {{base_url}}/dashboard/proveedores-principales?fechaInicio=2026-10-01&fechaFin=2026-10-31
```

Baseline359 unitarias+160 E2E. Final418+206=624; sin omitidas. Fixture A costo100/precio150 y B50/80, compra20/30, venta8/10, devolución cliente A3 y proveedor B5: stocks15/15, brutas2000, devolución450, netas1550, costo1300−300=1000, utilidad550, margen35.48%, valorización2250/3450. Snapshot del catálogo modificado conserva utilidad histórica. 42 consultas dejan conteos, saldo y diez hashes de encabezados/detalles/historial idénticos. Fixtures limpiados por sus IDs. Evidencia y reporte completo en docs/VALIDACION-DASHBOARD-REPORTES-2026-10-05.md.
