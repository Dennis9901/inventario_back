import { BadRequestException } from '@nestjs/common';
import {
  centavos,
  importe,
  importeConSigno,
  calcularTotales,
} from '../../common/dinero.js';
import { validarId } from '../../common/consulta.js';

export type DetalleSolicitado = { productoId: number; cantidad: number };
export type SnapshotVenta = DetalleSolicitado & {
  precioUnitario: string;
  costoUnitario: string;
  subtotal: string;
  costoSubtotal: string;
};

export function validarDetallesVenta(detalles: DetalleSolicitado[]) {
  if (!detalles.length || detalles.length > 100)
    throw new BadRequestException('La venta requiere entre 1 y 100 detalles');
  if (new Set(detalles.map((d) => d.productoId)).size !== detalles.length)
    throw new BadRequestException('Productos repetidos en detalles');
  for (const detalle of detalles) {
    validarId(detalle.productoId);
    if (
      !Number.isInteger(detalle.cantidad) ||
      detalle.cantidad < 1 ||
      detalle.cantidad > 2147483647
    )
      throw new BadRequestException('Cantidad inválida');
  }
}

export function snapshotVenta(
  detalle: DetalleSolicitado,
  producto: { precio: string; costo: string },
): SnapshotVenta {
  const precio = centavos(producto.precio);
  const costo = centavos(producto.costo);
  const cantidad = BigInt(detalle.cantidad);
  return {
    ...detalle,
    precioUnitario: importe(precio),
    costoUnitario: importe(costo),
    subtotal: importe(precio * cantidad),
    costoSubtotal: importe(costo * cantidad),
  };
}

export function totalesVenta(
  detalles: { subtotal: string; costoSubtotal: string }[],
  impuestos: number | string,
) {
  const totales = calcularTotales(detalles, impuestos);
  const costo = detalles.reduce(
    (sum, d) => sum + centavos(d.costoSubtotal),
    0n,
  );
  return {
    ...totales,
    costoTotal: importe(costo),
    utilidad: importeConSigno(centavos(totales.subtotal) - costo),
  };
}
