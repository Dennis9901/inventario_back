import { BadRequestException, ConflictException } from '@nestjs/common';
import { validarId } from '../../common/consulta.js';
import { centavos, importe } from '../../common/dinero.js';

export function validarDetalles(detalles: { id: number; cantidad: number }[]) {
  if (!Array.isArray(detalles) || !detalles.length || detalles.length > 100)
    throw new BadRequestException(
      'La devolución requiere entre 1 y 100 detalles',
    );
  if (new Set(detalles.map((d) => d.id)).size !== detalles.length)
    throw new BadRequestException('Detalles originales repetidos');
  for (const detalle of detalles) {
    validarId(detalle.id);
    validarId(detalle.cantidad);
  }
}

export function validarDisponible(
  original: number,
  devuelta: bigint,
  solicitada: number,
) {
  if (BigInt(solicitada) > BigInt(original) - devuelta)
    throw new ConflictException(
      'Cantidad superior a la disponible para devolver',
    );
}

export function subtotalHistorico(unitario: string, cantidad: number) {
  return importe(centavos(unitario) * BigInt(cantidad));
}

export function sumarImportes(detalles: { subtotal: string }[]) {
  return importe(detalles.reduce((sum, d) => sum + centavos(d.subtotal), 0n));
}
