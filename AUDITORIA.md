# Auditoría administrativa

Auditoria registra quién realizó una acción exitosa. Kardex continúa registrando inventario; no se modifica ni se usa Auditoria como fuente de verdad comercial.

Modelo: id autoincremental, requestId UUID como String, usuarioId nullable, accion, entidad, entidadId nullable, descripcion nullable, metadata nullable String (JSON controlado), createdAt TimestamptzString. La relación Usuario usa ON DELETE SET NULL para preservar registros históricos. El check exige requestId de 36 caracteres y acción/entidad de 1–80 caracteres. Metadata usa TEXT serializado; evita depender de soporte JSON incierto en la RC.

Se añade el índice `(createdAt, id)` para la paginación ordenada estable, más el índice de usuarioId generado para la FK. No se añaden índices especulativos para todos los filtros. Con fixtures pequeños no se puede demostrar beneficio a escala; revisar planes con cardinalidad real antes de añadir índices.

## Acciones

Los decorators de los controllers auditan LOGIN_EXITOSO, creación de roles y usuarios, creación/modificación/eliminación y activación/desactivación de categorías/productos/proveedores/clientes donde existen esas rutas; ENTRADA_MANUAL, SALIDA_MANUAL, AJUSTE_MANUAL; creación/modificación/eliminación, recepción/cancelación de compras; creación/modificación/eliminación, confirmación/cancelación de ventas; creación/modificación/eliminación, procesamiento/cancelación de ambas devoluciones. No se inventan endpoints de usuarios que no existen.

La identidad procede del JWT validado; login la obtiene del resultado seguro de Auth. No se consulta Usuario en cada request. Se registra id del recurso, requestId y metadata limitada a folio, estadoNuevo, productoId y activo. No se guarda body, password, token, headers ni objetos completos.

## Atomicidad

Las operaciones que ya utilizan transacciones llaman `DatabaseService.transaction`, que delega al runtime existente `db.transaction`. Después de que el callback comercial tiene éxito, inserta Auditoria en la misma transacción antes del commit. No se usa PrismaClient clásico ni `$transaction`. Se conservan callbacks, bloqueos, validaciones, snapshots y motor de stock. Fallar la operación o insertar auditoría provoca rollback conjunto. Las carreras de confirmación generan un solo registro de éxito.

Para las escrituras de catálogo que originalmente no eran transaccionales y login, el interceptor inserta después del éxito. Si esa inserción falla, registra `audit_failure` correlacionado y conserva la respuesta exitosa: no devuelve un falso fallo después de un negocio confirmado. Esta auditoría es best effort y puede faltar ante caída de BD/proceso; no tiene reintentos persistentes. No promete atomicidad total para esas rutas. Si se requiere auditoría obligatoria de catálogos en el siguiente sprint, integrarla en transacciones cortas propias.

La integración está limitada a requests HTTP decorados; llamadas directas de servicios, seeds y scripts sin contexto HTTP no generan auditoría. No existe event sourcing ni retención automática, cron o borrado de auditoría.

## Consultas

`GET /api/v1/auditoria`: JWT ADMINISTRADOR; page>=1, limit default20/max100, usuarioId, accion, entidad, entidadId, fechaInicio, fechaFin, search, sortOrder asc/desc. Default createdAt DESC, id DESC. Acción/entidad son filtros exactos; search busca texto escapando comodines. Usa count + página e include de usuario básico, sin N+1. Respuesta `{data:[],pagination:{page,limit,totalItems,totalPages,hasNextPage,hasPreviousPage}}`.

`GET /api/v1/auditoria/:id`: mismo permiso, 404 uniforme si no existe. Usuario solo id/nombre/email. metadata se devuelve como string JSON nullable, contrato explícito para Angular.

Consultas GET normales, incluidos Dashboard y Reportes, jamás crean auditoría. La batería real de 14 GET verifica auditorías y datos comerciales idénticos antes/después.

La migración fue inspeccionada: cuatro operaciones aditivas, tabla/índice orden/índice FK/relación. No se alteraron tablas comerciales ni información histórica. Evidencias del plan, db verify y dry-run final en docs/api-db-*.jsonl.
