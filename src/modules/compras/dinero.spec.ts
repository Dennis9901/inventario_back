import { BadRequestException } from '@nestjs/common';
import { calcularDetalles, calcularTotales, centavos } from './dinero.js';

describe('Dinero de compras', () => {
  it('calcula sin errores binarios 0.1 + 0.2 y cantidades grandes', () => {
    const detalles = calcularDetalles([
      { productoId: 1, cantidad: 1, costoUnitario: 0.1 },
      { productoId: 2, cantidad: 1, costoUnitario: 0.2 },
    ]);
    expect(calcularTotales(detalles, 0)).toEqual({
      subtotal: '0.30',
      impuestos: '0.00',
      total: '0.30',
    });
    expect(
      calcularDetalles([
        {
          productoId: 1,
          cantidad: 2147483647,
          costoUnitario: 1_000_000_000_000,
        },
      ])[0]?.subtotal,
    ).toBe('2147483647000000000000.00');
  });
  it('calcula totales comerciales desde detalles y conserva impuestos', () => {
    const detalles = calcularDetalles([
      { productoId: 1, cantidad: 10, costoUnitario: 12500 },
      { productoId: 2, cantidad: 5, costoUnitario: 350.5 },
    ]);
    expect(calcularTotales(detalles, '10.50')).toEqual({
      subtotal: '126752.50',
      impuestos: '10.50',
      total: '126763.00',
    });
  });
  it.each([-1, NaN, Infinity, 0.001, '1.234', '1e3', 1_000_000_000_001])(
    'rechaza importe %s',
    (value) => {
      expect(() => centavos(value)).toThrow(BadRequestException);
    },
  );
  it.each([0, -1, 1.5, 2147483648])('rechaza cantidad %s', (cantidad) => {
    expect(() =>
      calcularDetalles([{ productoId: 1, cantidad, costoUnitario: 1 }]),
    ).toThrow(BadRequestException);
  });
  it('rechaza compra vacía y productos repetidos', () => {
    expect(() => calcularDetalles([])).toThrow(BadRequestException);
    expect(() =>
      calcularDetalles([
        { productoId: 1, cantidad: 1, costoUnitario: 1 },
        { productoId: 1, cantidad: 2, costoUnitario: 1 },
      ]),
    ).toThrow(BadRequestException);
  });
});
