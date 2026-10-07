import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  subtotalHistorico,
  sumarImportes,
  validarDetalles,
  validarDisponible,
} from './reglas.js';

describe('Reglas de devoluciones', () => {
  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])(
    'rechaza cantidad %s',
    (cantidad) => {
      expect(() => validarDetalles([{ id: 1, cantidad }])).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([0, -1, 1.5, 2147483648])('rechaza detalleId %s', (id) => {
    expect(() => validarDetalles([{ id, cantidad: 1 }])).toThrow(
      BadRequestException,
    );
  });
  it('exige de 1 a 100 detalles únicos', () => {
    for (const detalles of [
      [],
      [
        { id: 1, cantidad: 1 },
        { id: 1, cantidad: 2 },
      ],
      Array.from({ length: 101 }, (_, i) => ({ id: i + 1, cantidad: 1 })),
    ])
      expect(() => validarDetalles(detalles)).toThrow(BadRequestException);
    expect(() =>
      validarDetalles([{ id: 1, cantidad: 2147483647 }]),
    ).not.toThrow();
  });
  it('permite parciales 3+4 de 10 y rechaza otra de 4', () => {
    expect(() => validarDisponible(10, 0n, 3)).not.toThrow();
    expect(() => validarDisponible(10, 3n, 4)).not.toThrow();
    expect(() => validarDisponible(10, 7n, 3)).not.toThrow();
    expect(() => validarDisponible(10, 7n, 4)).toThrow(ConflictException);
    expect(() => validarDisponible(10, 10n, 1)).toThrow(ConflictException);
  });
  it('calcula snapshots y sumas con centavos BigInt', () => {
    expect(subtotalHistorico('0.10', 3)).toBe('0.30');
    expect(sumarImportes([{ subtotal: '0.10' }, { subtotal: '0.20' }])).toBe(
      '0.30',
    );
    expect(subtotalHistorico('1000000000000.01', 2147483647)).toBe(
      '2147483647000021474836.47',
    );
    expect(subtotalHistorico('150.00', 2)).toBe('300.00');
    expect(subtotalHistorico('100.00', 2)).toBe('200.00');
  });
});
