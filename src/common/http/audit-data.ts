import type { RequestContext } from './request-context.js';

function registro(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return registro(value[0]);
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
export function datosAuditoria(contexto: RequestContext, resultado: unknown) {
  const r = registro(resultado);
  const nested = registro(
    r['producto'] ??
      r['venta'] ??
      r['compra'] ??
      r['categoria'] ??
      r['cliente'] ??
      r['proveedor'] ??
      r['devolucion'],
  );
  const usuario = registro(r['usuario']);
  const usuarioId =
    contexto.usuarioId ??
    (contexto.auditoria?.accion === 'LOGIN_EXITOSO' &&
    typeof usuario['id'] === 'number'
      ? usuario['id']
      : null);
  const entidadId =
    contexto.entidadId ??
    (typeof r['id'] === 'number'
      ? r['id']
      : typeof nested['id'] === 'number'
        ? nested['id']
        : contexto.auditoria?.accion === 'LOGIN_EXITOSO'
          ? usuarioId
          : null);
  const metadata: Record<string, string | number> = {};
  if (typeof r['folio'] === 'string' && /^[A-Z0-9-]{1,100}$/.test(r['folio']))
    metadata['folio'] = r['folio'];
  if (
    typeof r['estado'] === 'string' &&
    [
      'BORRADOR',
      'RECIBIDA',
      'CONFIRMADA',
      'PROCESADA',
      'CANCELADA',
      'PREVIEW',
      'PROCESANDO',
      'COMPLETADA',
      'FALLIDA',
    ].includes(r['estado'])
  )
    metadata['estadoNuevo'] = r['estado'];
  if (contexto.auditoria?.entidad === 'IMPORTACION') {
    for (const key of [
      'totalFilas',
      'filasValidas',
      'filasAdvertencia',
      'filasError',
    ]) {
      const value = r[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0)
        metadata[key] = value;
    }
    if (
      typeof r['tipo'] === 'string' &&
      ['CLIENTES', 'PRODUCTOS', 'PRECIOS'].includes(r['tipo'])
    )
      metadata['tipo'] = r['tipo'];
  }
  if (typeof r['productoId'] === 'number')
    metadata['productoId'] = r['productoId'];
  if (typeof r['activo'] === 'boolean')
    metadata['activo'] = r['activo'] ? 1 : 0;
  return {
    requestId: contexto.requestId,
    usuarioId,
    accion: contexto.auditoria!.accion,
    entidad: contexto.auditoria!.entidad,
    entidadId,
    descripcion: `${contexto.auditoria!.accion}: ${contexto.auditoria!.entidad}`,
    metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
  };
}
