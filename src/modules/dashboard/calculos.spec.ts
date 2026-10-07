import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { centavos, importeConSigno } from '../../common/dinero.js';
import { buckets, periodo, porcentaje, utilidad } from './calculos.js';
import {
  DashboardPeriodoQueryDto,
  DashboardSerieQueryDto,
  DashboardRankingQueryDto,
  DashboardStockQueryDto,
} from './dto/dashboard-query.dto.js';
import {
  ReporteVentasQueryDto,
  ReporteComprasQueryDto,
  ReporteInventarioQueryDto,
} from '../reportes/dto/reportes-query.dto.js';

describe('Analítica exacta', () => {
  it('1000/600 menos devolución 300/180: ambas expresiones producen 280 y 40%', () => {
    const u = utilidad('1000.00', '300.00', '600.00', '180.00');
    expect(u).toMatchObject({
      ventasNetas: '700.00',
      costoNeto: '420.00',
      utilidadOriginal: '400.00',
      impactoDevoluciones: '120.00',
      utilidadBruta: '280.00',
      margenPorcentaje: '40.00',
    });
    expect(centavos(u.ventasNetas) - centavos(u.costoNeto)).toBe(
      centavos(u.utilidadBruta),
    );
    expect(centavos(u.utilidadOriginal) - centavos(u.impactoDevoluciones)).toBe(
      centavos(u.utilidadBruta),
    );
  });
  it('sin operaciones devuelve cero y evita división por cero', () => {
    for (const v of Object.values(utilidad('0', '0', '0', '0')))
      expect(v).toBe('0.00');
    expect(utilidad('100', '100', '60', '60').margenPorcentaje).toBe('0.00');
  });
  it.each([
    ['0.10', 3, '0.30'],
    ['19.99', 7, '139.93'],
    ['1000000000000.01', 100, '100000000000001.00'],
  ] as const)(
    'multiplica %s por %s exactamente',
    (precio, cantidad, esperado) => {
      expect(importeConSigno(centavos(precio) * BigInt(cantidad))).toBe(
        esperado,
      );
    },
  );
  it('fracciones y devoluciones sin error binario', () =>
    expect(utilidad('139.93', '19.99', '70.00', '10.00').utilidadBruta).toBe(
      '59.94',
    ));
  it('utilidad negativa y devoluciones de períodos anteriores son válidas', () =>
    expect(utilidad('0', '300', '0', '180')).toMatchObject({
      ventasNetas: '-300.00',
      costoNeto: '-180.00',
      utilidadBruta: '-120.00',
    }));
  it.each([
    [1n, 3n, '33.33'],
    [2n, 3n, '66.67'],
    [-2n, 3n, '-66.67'],
    [1n, 0n, '0.00'],
  ])('redondea porcentaje exacto', (a, b, r) =>
    expect(porcentaje(a, b)).toBe(r),
  );
});

describe('Períodos UTC y buckets', () => {
  it('mes calendario actual UTC', () =>
    expect(periodo({}, new Date('2026-10-05T12:00:00Z'))).toEqual({
      fechaInicio: '2026-10-01T00:00:00.000Z',
      fechaFin: '2026-10-31T23:59:59.999Z',
    }));
  it('offset se normaliza a UTC', () =>
    expect(
      periodo({
        fechaInicio: '2026-10-01T18:00:00-06:00',
        fechaFin: '2026-10-02',
      }).fechaInicio,
    ).toBe('2026-10-02T00:00:00.000Z'));
  it.each([
    { fechaInicio: '2026-10-01' },
    { fechaFin: '2026-10-01' },
    { fechaInicio: '2026-10-03', fechaFin: '2026-10-01' },
    { fechaInicio: '2000-01-01', fechaFin: '2026-10-01' },
  ])('rechaza rango incompleto/invertido/excesivo', (q) =>
    expect(() => periodo(q)).toThrow(),
  );
  it.each([
    [
      'dia',
      '2026-10-01',
      '2026-10-03',
      ['2026-10-01', '2026-10-02', '2026-10-03'],
    ],
    ['semana', '2026-09-30', '2026-10-06', ['2026-09-28', '2026-10-05']],
    [
      'mes',
      '2025-12-31',
      '2026-02-01',
      ['2025-12-01', '2026-01-01', '2026-02-01'],
    ],
  ] as const)(
    'buckets %s completos y ASC',
    (agrupacion, fechaInicio, fechaFin, esperado) =>
      expect(buckets({ agrupacion, fechaInicio, fechaFin })).toEqual(esperado),
  );
  it.each([
    ['dia', '2025-01-01', '2026-01-02'],
    ['semana', '2020-01-01', '2026-01-01'],
    ['mes', '2016-01-01', '2026-01-01'],
  ] as const)('limita %s', (agrupacion, fechaInicio, fechaFin) =>
    expect(() => buckets({ agrupacion, fechaInicio, fechaFin })).toThrow(),
  );
  it('permite exactamente 366 buckets diarios', () =>
    expect(
      buckets({
        agrupacion: 'dia',
        fechaInicio: '2024-01-01',
        fechaFin: '2024-12-31',
      }),
    ).toHaveLength(366));
});

describe('DTOs de Dashboard y Reportes', () => {
  it.each(['2026-02-30', 'basura', '2026-10-01T00:00:00'])(
    'rechaza fecha %s',
    async (fechaInicio) =>
      expect(
        await validate(
          plainToInstance(DashboardPeriodoQueryDto, { fechaInicio }),
        ),
      ).not.toHaveLength(0),
  );
  it('rechaza agrupación arbitraria', async () =>
    expect(
      await validate(
        plainToInstance(DashboardSerieQueryDto, {
          agrupacion: "day'); DROP TABLE venta; --",
        }),
      ),
    ).not.toHaveLength(0));
  it.each([0, 51, 1.5])('limit ranking inválido %s', async (limit) =>
    expect(
      await validate(plainToInstance(DashboardRankingQueryDto, { limit })),
    ).not.toHaveLength(0),
  );
  it('stock admite 100 pero no 101', async () => {
    expect(
      await validate(plainToInstance(DashboardStockQueryDto, { limit: '100' })),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(DashboardStockQueryDto, { limit: '101' })),
    ).not.toHaveLength(0);
  });
  for (const dto of [ReporteVentasQueryDto, ReporteComprasQueryDto]) {
    it.each([
      { page: 0 },
      { limit: 101 },
      { sortBy: 'password' },
      { sortOrder: 'random' },
    ])(`${dto.name}: query inválida`, async (q) =>
      expect(
        await validate(plainToInstance<object, unknown>(dto, q)),
      ).not.toHaveLength(0),
    );
    it(`${dto.name}: whitelist rechaza campos extra`, async () =>
      expect(
        await validate(
          plainToInstance<object, unknown>(dto, { usuarioId: 123 }),
          { whitelist: true, forbidNonWhitelisted: true },
        ),
      ).not.toHaveLength(0));
  }
  it('inventario transforma booleanos estrictos', async () => {
    const dto = plainToInstance(ReporteInventarioQueryDto, {
      activo: 'false',
      stockBajo: 'true',
      sinExistencia: 'false',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.activo).toBe(false);
    expect(dto.stockBajo).toBe(true);
    expect(
      await validate(
        plainToInstance(ReporteInventarioQueryDto, { activo: '1' }),
      ),
    ).not.toHaveLength(0);
  });
});
