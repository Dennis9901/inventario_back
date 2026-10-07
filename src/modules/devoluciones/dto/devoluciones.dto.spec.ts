import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateDevolucionVentaDto } from './create-devolucion-venta.dto.js';
import { CreateDevolucionCompraDto } from './create-devolucion-compra.dto.js';
import {
  DevolucionVentaQueryDto,
  DevolucionCompraQueryDto,
} from './devolucion-query.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
for (const tipo of ['Venta', 'Compra'] as const) {
  const idKey = tipo === 'Venta' ? 'ventaId' : 'compraId';
  const detailKey = `detalle${tipo}Id`;
  const dto =
    tipo === 'Venta' ? CreateDevolucionVentaDto : CreateDevolucionCompraDto;
  const queryDto =
    tipo === 'Venta' ? DevolucionVentaQueryDto : DevolucionCompraQueryDto;
  const valido = {
    [idKey]: 1,
    motivo: ' Retorno ',
    detalles: [{ [detailKey]: 1, cantidad: 2 }],
  };
  describe(`DTOs de devolución ${tipo}`, () => {
    it('acepta solo datos del cliente y normaliza motivo', async () => {
      expect(
        await pipe.transform(valido, { type: 'body', metatype: dto }),
      ).toMatchObject({ motivo: 'Retorno' });
    });
    it.each([
      { estado: 'PROCESADA' },
      { folio: 'FALSO' },
      { createdByUsuarioId: 2 },
      { procesadaPorUsuarioId: 2 },
      { fechaProcesamiento: '2026-10-05' },
      { subtotal: 1 },
      { costoTotal: 1 },
      { motivo: '' },
      { motivo: '   ' },
      { motivo: null },
      { motivo: 5 },
      { observacion: null },
      { motivo: 'x'.repeat(501) },
      { [idKey]: null },
      { [idKey]: 0 },
      { [idKey]: '1' },
      { detalles: [] },
      { detalles: null },
      ...[0, -1, 0.5, '2', 2147483648, null].map((cantidad) => ({
        detalles: [{ [detailKey]: 1, cantidad }],
      })),
      ...[
        'productoId',
        'precioUnitario',
        'costoUnitario',
        'subtotal',
        'costoSubtotal',
      ].map((campo) => ({
        detalles: [{ [detailKey]: 1, cantidad: 1, [campo]: 1 }],
      })),
      { detalles: [{ [detailKey]: 0, cantidad: 1 }] },
      {
        detalles: Array.from({ length: 101 }, (_, i) => ({
          [detailKey]: i + 1,
          cantidad: 1,
        })),
      },
    ])('rechaza cuerpo %j', async (extra) => {
      await expect(
        pipe.transform(
          { ...valido, ...extra },
          { type: 'body', metatype: dto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
    it('aplica paginación y orden default', async () => {
      expect(
        await pipe.transform({}, { type: 'query', metatype: queryDto }),
      ).toMatchObject({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });
    it.each([
      { limit: '101' },
      { page: '0' },
      { sortBy: 'password' },
      { sortOrder: 'SQL' },
      { estado: 'CONFIRMADA' },
      { fechaInicio: '2026-02-30' },
      { fechaFin: '2026-10-05T12:00:00' },
      { [idKey]: '-1' },
      { campoAjeno: 1 },
    ])('rechaza query %j', async (query) => {
      await expect(
        pipe.transform(query, { type: 'query', metatype: queryDto }),
      ).rejects.toThrow(BadRequestException);
    });
    it.each(['createdAt', 'folio', 'estado', 'subtotal'])(
      'acepta orden %s',
      async (sortBy) => {
        expect(
          await pipe.transform(
            { sortBy, sortOrder: 'asc' },
            { type: 'query', metatype: queryDto },
          ),
        ).toMatchObject({ sortBy, sortOrder: 'asc' });
      },
    );
  });
}
