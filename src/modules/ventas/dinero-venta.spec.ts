import { BadRequestException } from '@nestjs/common';
import { importeConSigno } from '../../common/dinero.js';
import {
  snapshotVenta,
  totalesVenta,
  validarDetallesVenta,
} from './dinero-venta.js';

describe('Importes y snapshots de venta', () => {
  it('calcula importes exactos sin incluir impuestos en utilidad', () => {
    const d = snapshotVenta(
      { productoId: 1, cantidad: 3 },
      { precio: '0.10', costo: '0.06' },
    );
    expect(d).toMatchObject({
      precioUnitario: '0.10',
      costoUnitario: '0.06',
      subtotal: '0.30',
      costoSubtotal: '0.18',
    });
    expect(totalesVenta([d], 0.2)).toEqual({
      subtotal: '0.30',
      impuestos: '0.20',
      total: '0.50',
      costoTotal: '0.18',
      utilidad: '0.12',
    });
  });
  it.each([-150n, -50n, 0n, 50n, 150n])(
    'serializa utilidad con signo %s',
    (value) => {
      const expected = new Map([
        [-150n, '-1.50'],
        [-50n, '-0.50'],
        [0n, '0.00'],
        [50n, '0.50'],
        [150n, '1.50'],
      ]);
      expect(importeConSigno(value)).toBe(expected.get(value));
    },
  );
  it('admite utilidad negativa y cálculos superiores a Number.MAX_SAFE_INTEGER', () => {
    const d = snapshotVenta(
      { productoId: 1, cantidad: 2147483647 },
      { precio: '1000000000000.01', costo: '1000000000000.02' },
    );
    expect(totalesVenta([d], 0)).toMatchObject({
      subtotal: '2147483647000021474836.47',
      costoTotal: '2147483647000042949672.94',
      utilidad: '-21474836.47',
    });
  });
  it.each(['-1', '1.234', 'NaN', '1e2'])(
    'rechaza precio/costo inválido %s',
    (precio) => {
      expect(() =>
        snapshotVenta({ productoId: 1, cantidad: 1 }, { precio, costo: '1' }),
      ).toThrow(BadRequestException);
    },
  );
  it.each([0, -1, 1.5, 2147483648])('rechaza cantidad %s', (cantidad) => {
    expect(() => validarDetallesVenta([{ productoId: 1, cantidad }])).toThrow(
      BadRequestException,
    );
  });
  it('rechaza detalles vacíos, más de 100 o duplicados', () => {
    for (const detalles of [
      [],
      Array.from({ length: 101 }, (_, i) => ({
        productoId: i + 1,
        cantidad: 1,
      })),
      [
        { productoId: 1, cantidad: 1 },
        { productoId: 1, cantidad: 2 },
      ],
    ])
      expect(() => validarDetallesVenta(detalles)).toThrow(BadRequestException);
  });
});
