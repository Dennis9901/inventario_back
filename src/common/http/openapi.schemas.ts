import type { SchemaObject, ReferenceObject } from '@nestjs/swagger';

const text: SchemaObject = { type: 'string' };
const id: SchemaObject = { type: 'integer', example: 1 };
const bool: SchemaObject = { type: 'boolean' };
const fecha: SchemaObject = { type: 'string', format: 'date-time' };
const dinero: SchemaObject = {
  type: 'string',
  pattern: '^-?\\d+\\.\\d{2}$',
  example: '150.00',
  description: 'Importe decimal exacto; no Number binario',
};
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const obj = (
  properties: Record<string, SchemaObject | ReferenceObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({
  type: 'array',
  items,
});
const basic = obj({ id, nombre: text });
const user = obj({
  id,
  nombre: text,
  email: { type: 'string', format: 'email' },
});
const product = obj({ id, sku: text, nombre: text });
const timestamps = { createdAt: fecha, updatedAt: fecha };
const common = { id, nombre: text, activo: bool, ...timestamps };
const sujeto = obj({
  ...common,
  razonSocial: nullable(text),
  rfc: nullable(text),
  email: nullable(text),
  telefono: nullable(text),
  direccion: nullable(text),
});
const clienteDocumento = obj({
  id,
  nombre: text,
  apellido: nullable(text),
  rfc: nullable(text),
});
const proveedorDocumento = obj({ id, nombre: text, rfc: nullable(text) });
const linea = obj({
  id,
  productoId: id,
  producto: product,
  cantidad: id,
  costoUnitario: dinero,
  subtotal: dinero,
  createdAt: fecha,
});
const lineaVenta = obj({
  ...linea.properties,
  precioUnitario: dinero,
  costoSubtotal: dinero,
});
const documento = {
  id,
  folio: text,
  estado: text,
  subtotal: dinero,
  impuestos: dinero,
  total: dinero,
  observacion: nullable(text),
  createdByUsuarioId: id,
  creadoPor: user,
  ...timestamps,
};
const compra = obj({
  ...documento,
  proveedorId: id,
  proveedor: proveedorDocumento,
  recibidaPorUsuarioId: nullable(id),
  recibidoPor: nullable(user),
  fechaRecepcion: nullable(fecha),
});
const venta = obj({
  ...documento,
  clienteId: id,
  cliente: clienteDocumento,
  costoTotal: dinero,
  utilidad: dinero,
  confirmadaPorUsuarioId: nullable(id),
  confirmadoPor: nullable(user),
  fechaConfirmacion: nullable(fecha),
});
const devolucion = obj({
  id,
  folio: text,
  estado: { type: 'string', enum: ['BORRADOR', 'PROCESADA', 'CANCELADA'] },
  motivo: text,
  observacion: nullable(text),
  subtotal: dinero,
  createdByUsuarioId: id,
  creadoPor: user,
  procesadaPorUsuarioId: nullable(id),
  procesadoPor: nullable(user),
  fechaProcesamiento: nullable(fecha),
  ...timestamps,
});
const movimiento = obj({
  id,
  productoId: id,
  producto: product,
  tipo: { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'] },
  cantidad: id,
  stockAnterior: id,
  stockNuevo: id,
  observacion: nullable(text),
  usuarioId: id,
  usuario: {
    ...user,
    properties: { ...user.properties, apellido: nullable(text) },
  },
  createdAt: fecha,
});
const existencia = obj({
  productoId: id,
  sku: text,
  nombre: text,
  categoria: basic,
  cantidad: id,
  stockMinimo: id,
  stockBajo: bool,
  unidadMedida: text,
  activo: bool,
});
const utilidad = obj({
  ventasBrutas: dinero,
  devoluciones: dinero,
  ventasNetas: dinero,
  costoVentas: dinero,
  costoDevuelto: dinero,
  costoNeto: dinero,
  utilidadOriginal: dinero,
  impactoDevoluciones: dinero,
  utilidadBruta: dinero,
  margenPorcentaje: dinero,
});
const periodo = obj({ fechaInicio: fecha, fechaFin: fecha });
const kpis = obj({
  cantidad: id,
  cantidadDevoluciones: id,
  brutas: dinero,
  devoluciones: dinero,
  netas: dinero,
  impuestos: dinero,
  facturadas: dinero,
});
const inventario = obj({
  productosActivos: id,
  unidadesExistencia: id,
  productosStockBajo: id,
  productosSinExistencia: id,
  productosSinRegistroExistencia: id,
  valorCosto: dinero,
  valorVenta: dinero,
});
export const schemas: Record<string, SchemaObject> = {
  Rol: obj({ ...common, descripcion: nullable(text) }),
  Usuario: obj({ ...common, apellido: nullable(text), email: text, rolId: id }),
  Categoria: obj({ ...common, descripcion: nullable(text) }),
  Producto: obj({
    ...common,
    sku: text,
    codigoBarras: nullable(text),
    descripcion: nullable(text),
    costo: dinero,
    precio: dinero,
    stockMinimo: id,
    unidadMedida: text,
    unidadMedidaId: nullable(id),
    claveProductoServicioSat: nullable(text),
    objetoImpuestoSat: nullable(text),
    categoriaId: id,
  }),
  Proveedor: obj({ ...sujeto.properties, contacto: nullable(text) }),
  Importacion: obj({
    id,
    importacionId: id,
    tipo: { type: 'string', enum: ['CLIENTES', 'PRODUCTOS', 'PRECIOS'] },
    estado: {
      type: 'string',
      enum: ['PREVIEW', 'PROCESANDO', 'COMPLETADA', 'FALLIDA', 'CANCELADA'],
    },
    nombreArchivo: text,
    hashArchivo: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    totalFilas: id,
    filasValidas: id,
    filasAdvertencia: id,
    filasError: id,
    puedeConfirmar: bool,
    hojas: array(text),
    usuarioId: id,
    createdAt: fecha,
    confirmedAt: nullable(fecha),
    completedAt: nullable(fecha),
    failedAt: nullable(fecha),
    errorCodigo: nullable(text),
  }),
  ImportacionFila: obj({
    id,
    numeroFila: id,
    clave: text,
    datosNormalizados: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    estado: { type: 'string', enum: ['VALIDA', 'ADVERTENCIA', 'ERROR'] },
    plan: obj({
      accion: {
        type: 'string',
        enum: [
          'CREAR',
          'ACTUALIZAR',
          'SIN_CAMBIOS',
          'CERRAR_Y_CREAR',
          'CONFLICTO',
        ],
      },
      existenteId: nullable(id),
      fingerprint: {
        type: 'string',
        description: 'Fingerprint de revalidación; no autentica solicitudes.',
      },
      cambios: array(
        obj({ campo: text, anterior: nullable(text), nuevo: text }),
      ),
      precios: array(
        obj({
          codigo: text,
          precio: {
            type: 'string',
            description:
              'Decimal normalizado; una fila ERROR puede conservar texto inválido para diagnóstico.',
          },
          accion: {
            type: 'string',
            enum: ['CREAR', 'SIN_CAMBIOS', 'CERRAR_Y_CREAR', 'CONFLICTO'],
          },
          anteriorId: nullable(id),
        }),
      ),
    }),
    errores: array(obj({ fila: id, campo: text, codigo: text, mensaje: text })),
    advertencias: array(
      obj({ fila: id, campo: text, codigo: text, mensaje: text }),
    ),
    resultado: {
      type: 'array',
      nullable: true,
      items: obj({ entidad: text, id, accion: text }),
    },
  }),
  ListaPrecio: obj({
    ...common,
    codigo: text,
    descripcion: nullable(text),
    esPredeterminada: bool,
  }),
  ProductoPrecio: obj({
    id,
    productoId: id,
    listaPrecioId: id,
    precio: dinero,
    vigenciaDesde: fecha,
    vigenciaHasta: nullable(fecha),
    activo: bool,
    ...timestamps,
  }),
  PrecioResuelto: obj({
    productoId: id,
    precio: dinero,
    origen: { type: 'string', enum: ['LISTA_PRECIO', 'PRECIO_BASE'] },
    listaPrecioId: nullable(id),
    lista: nullable(obj({ id, codigo: text, nombre: text })),
    vigencia: nullable(obj({ id, desde: fecha, hasta: nullable(fecha) })),
  }),
  UnidadMedida: obj({ ...common, clave: text }),
  DomicilioCliente: obj({
    id,
    clienteId: id,
    ...timestamps,
    pais: nullable(text),
    codigoPostal: nullable(text),
    estado: nullable(text),
    municipio: nullable(text),
    localidad: nullable(text),
    colonia: nullable(text),
    calle: nullable(text),
    numeroExterior: nullable(text),
    numeroInterior: nullable(text),
    referencia: nullable(text),
  }),
  Cliente: obj({
    ...sujeto.properties,
    apellido: nullable(text),
    nombreComercial: nullable(text),
    regimenFiscal: nullable(text),
    usoCfdi: nullable(text),
    numeroRegistroTributario: nullable(text),
    residenciaFiscal: nullable(text),
    celular: nullable(text),
    emailAlterno: nullable(text),
    domicilioFiscal: {
      type: 'object',
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/DomicilioCliente' }],
    },
  }),
  Compra: compra,
  CompraDetalle: obj({
    ...compra.properties,
    detalles: array({
      ...linea,
      properties: { ...linea.properties, compraId: id },
    }),
  }),
  Venta: obj({ ...venta.properties, listaPrecioId: nullable(id) }),
  VentaDetalle: obj({
    ...venta.properties,
    detalles: array({
      ...lineaVenta,
      properties: { ...lineaVenta.properties, ventaId: id },
    }),
  }),
  DevolucionVenta: obj({
    ...devolucion.properties,
    ventaId: id,
    venta: obj({ id, folio: text, clienteId: id, cliente: clienteDocumento }),
    costoTotal: dinero,
    cliente: clienteDocumento,
  }),
  DevolucionCompra: obj({
    ...devolucion.properties,
    compraId: id,
    compra: obj({
      id,
      folio: text,
      proveedorId: id,
      proveedor: proveedorDocumento,
    }),
    proveedor: proveedorDocumento,
  }),
  DevolucionVentaDetalle: obj({
    ...devolucion.properties,
    ventaId: id,
    venta: obj({ id, folio: text, clienteId: id, cliente: clienteDocumento }),
    costoTotal: dinero,
    cliente: clienteDocumento,
    detalles: array(
      obj({
        ...lineaVenta.properties,
        devolucionVentaId: id,
        detalleVentaId: id,
      }),
    ),
  }),
  DevolucionCompraDetalle: obj({
    ...devolucion.properties,
    compraId: id,
    compra: obj({
      id,
      folio: text,
      proveedorId: id,
      proveedor: proveedorDocumento,
    }),
    proveedor: proveedorDocumento,
    detalles: array(
      obj({ ...linea.properties, devolucionCompraId: id, detalleCompraId: id }),
    ),
  }),
  Movimiento: movimiento,
  Existencia: existencia,
  Kardex: obj({
    producto: obj({
      ...product.properties,
      unidadMedida: text,
      unidadMedidaId: nullable(id),
      claveProductoServicioSat: nullable(text),
      objetoImpuestoSat: nullable(text),
      stockActual: id,
      stockMinimo: id,
    }),
    data: array(movimiento),
    pagination: { $ref: '#/components/schemas/Pagination' },
  }),
  DisponibilidadVenta: obj({
    ventaId: id,
    folio: text,
    detalles: array(
      obj({
        detalleVentaId: id,
        producto: product,
        cantidadOriginal: id,
        cantidadDevuelta: id,
        cantidadDisponible: id,
        costoUnitario: dinero,
        precioUnitario: dinero,
      }),
    ),
  }),
  DisponibilidadCompra: obj({
    compraId: id,
    folio: text,
    detalles: array(
      obj({
        detalleCompraId: id,
        producto: product,
        cantidadOriginal: id,
        cantidadDevuelta: id,
        cantidadDisponible: id,
        costoUnitario: dinero,
        stockActual: nullable(id),
      }),
    ),
  }),
  Login: obj({
    access_token: {
      type: 'string',
      description: 'JWT devuelto al cliente; sin ejemplo real',
    },
    token_type: { type: 'string', enum: ['Bearer'] },
    expires_in: text,
    usuario: obj({
      id,
      nombre: text,
      apellido: nullable(text),
      email: text,
      rolId: id,
    }),
  }),
  CurrentUser: obj({ sub: id, email: text, rolId: id, rol: text }, [
    'sub',
    'rol',
  ]),
  DashboardResumen: obj({
    periodo,
    ventas: kpis,
    compras: kpis,
    utilidad: obj({
      brutaOriginal: dinero,
      impactoDevoluciones: dinero,
      brutaAjustada: dinero,
      costoVentasOriginal: dinero,
      costoDevuelto: dinero,
      costoNeto: dinero,
      margenPorcentaje: dinero,
    }),
    inventario,
    clientes: obj({ activos: id }),
    proveedores: obj({ activos: id }),
    comparativa: obj({
      periodoAnterior: periodo,
      ventasNetasPorcentaje: nullable(dinero),
      utilidadPorcentaje: nullable(dinero),
    }),
  }),
  SerieVenta: obj({
    periodo: text,
    ventasBrutas: dinero,
    devoluciones: dinero,
    ventasNetas: dinero,
    costoNeto: dinero,
    utilidad: dinero,
  }),
  SerieCompra: obj({
    periodo: text,
    comprasBrutas: dinero,
    devoluciones: dinero,
    comprasNetas: dinero,
  }),
  RankingProducto: obj({
    producto: product,
    cantidadVendidaBruta: id,
    cantidadDevuelta: id,
    cantidadVendidaNeta: id,
    importeNeto: dinero,
  }),
  RankingCliente: obj({
    cliente: basic,
    cantidadVentas: id,
    ventasBrutas: dinero,
    devoluciones: dinero,
    ventasNetas: dinero,
  }),
  RankingProveedor: obj({
    proveedor: basic,
    cantidadCompras: id,
    comprasBrutas: dinero,
    devoluciones: dinero,
    comprasNetas: dinero,
  }),
  StockBajo: obj({
    productoId: id,
    sku: text,
    nombre: text,
    cantidad: id,
    stockMinimo: id,
    unidadMedida: text,
    unidadMedidaId: nullable(id),
    claveProductoServicioSat: nullable(text),
    objetoImpuestoSat: nullable(text),
    faltanteParaMinimo: id,
  }),
  Actividad: obj({
    tipo: text,
    id,
    folio: text,
    importe: dinero,
    fecha,
    descripcion: text,
  }),
  ReporteVenta: obj({
    id,
    folio: text,
    estado: text,
    createdAt: fecha,
    fechaConfirmacion: nullable(fecha),
    fecha,
    cliente: clienteDocumento,
    subtotal: dinero,
    impuestos: dinero,
    total: dinero,
    costoTotal: dinero,
    utilidadOriginal: dinero,
    devoluciones: dinero,
    costoDevuelto: dinero,
    ventasNetas: dinero,
    costoNeto: dinero,
    utilidadAjustada: dinero,
  }),
  ReporteCompra: obj({
    id,
    folio: text,
    estado: text,
    createdAt: fecha,
    fechaRecepcion: nullable(fecha),
    fecha,
    proveedor: proveedorDocumento,
    subtotal: dinero,
    impuestos: dinero,
    total: dinero,
    devoluciones: dinero,
    compraNeta: dinero,
  }),
  ReporteInventario: obj({
    ...existencia.properties,
    codigoBarras: nullable(text),
    costoActual: dinero,
    precioActual: dinero,
    valorCosto: dinero,
    valorVenta: dinero,
  }),
  ReporteUtilidad: obj({
    resumen: utilidad,
    data: array(obj({ periodo: text, ...utilidad.properties })),
  }),
  Auditoria: obj({
    id,
    requestId: { type: 'string', format: 'uuid' },
    usuarioId: nullable(id),
    usuario: nullable(user),
    accion: text,
    entidad: text,
    entidadId: nullable(id),
    descripcion: nullable(text),
    metadata: {
      ...nullable(text),
      description:
        'JSON serializado, limitado a folio/estadoNuevo/productoId/activo; nunca body o credenciales',
    },
    createdAt: fecha,
  }),
  Health: obj({
    status: { type: 'string', enum: ['ok'] },
    timestamp: fecha,
    uptime: { type: 'number' },
    version: text,
  }),
  Readiness: obj({
    status: { type: 'string', enum: ['ready', 'not_ready'] },
    database: { type: 'string', enum: ['up', 'down'] },
  }),
  Pagination: obj({
    page: id,
    limit: id,
    totalItems: id,
    totalPages: id,
    hasNextPage: bool,
    hasPreviousPage: bool,
  }),
  Deleted: obj({ message: text }),
};
export function schemaRespuesta(
  nombre: string,
  formato: 'objeto' | 'array' | 'data' | 'paginado' = 'objeto',
): SchemaObject | ReferenceObject {
  const ref = { $ref: `#/components/schemas/${nombre}` };
  if (formato === 'array') return array(ref);
  if (formato === 'data') return obj({ data: array(ref) });
  if (formato === 'paginado')
    return obj({
      data: array(ref),
      pagination: { $ref: '#/components/schemas/Pagination' },
    });
  return ref;
}
