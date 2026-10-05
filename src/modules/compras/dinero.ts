import { BadRequestException } from '@nestjs/common';
import { centavos, importe } from '../../common/dinero.js';
export { centavos, importe, calcularTotales } from '../../common/dinero.js';

export function calcularDetalles(
  detalles: { productoId: number; cantidad: number; costoUnitario: number }[],
) {
  if (!detalles.length || detalles.length > 100)
    throw new BadRequestException('La compra requiere entre 1 y 100 detalles');
  if (new Set(detalles.map((d) => d.productoId)).size !== detalles.length)
    throw new BadRequestException('Productos repetidos en detalles');
  return detalles.map((d) => {
    if (
      !Number.isInteger(d.cantidad) ||
      d.cantidad < 1 ||
      d.cantidad > 2147483647
    )
      throw new BadRequestException('Cantidad inválida');
    const costo = centavos(d.costoUnitario);
    return {
      productoId: d.productoId,
      cantidad: d.cantidad,
      costoUnitario: importe(costo),
      subtotal: importe(costo * BigInt(d.cantidad)),
    };
  });
}
