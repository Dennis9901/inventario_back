import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ExistenciaQueryDto,
  MovimientoProductoQueryDto,
  MovimientoQueryDto,
} from './consulta-inventario.dto.js';
import { limiteFecha, paginacion } from '../paginacion.js';
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validar = (query: object, metatype = MovimientoQueryDto) =>
  pipe.transform(query, { type: 'query', metatype });
describe('Consultas de inventario', () => {
  it('aplica defaults de paginación y orden', async () => {
    expect(await validar({})).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });
  it.each([
    { page: 0 },
    { page: 'x' },
    { limit: 101 },
    { limit: 0 },
    { limit: 1.5 },
    { productoId: -1 },
    { usuarioId: 0 },
    { tipo: 'DELETE' },
    { sortBy: 'password' },
    { sortOrder: 'DROP' },
    { fechaInicio: '2026-02-30' },
    { fechaFin: '2026-09-30T12:00:00' },
  ])('rechaza %j', async (q) => {
    await expect(validar(q)).rejects.toThrow(BadRequestException);
  });
  it.each(['createdAt', 'tipo', 'cantidad', 'stockAnterior', 'stockNuevo'])(
    'permite orden %s',
    async (sortBy) => {
      expect(await validar({ sortBy, sortOrder: 'asc' })).toMatchObject({
        sortBy,
        sortOrder: 'asc',
      });
    },
  );
  it('convierte números y filtros', async () => {
    expect(
      await validar({
        page: '2',
        limit: '10',
        productoId: '1',
        usuarioId: '2',
        tipo: 'AJUSTE',
      }),
    ).toMatchObject({ page: 2, limit: 10, productoId: 1, usuarioId: 2 });
  });
  it('rechaza productoId por query en ruta de producto', async () => {
    await expect(
      pipe.transform(
        { productoId: '2' },
        { type: 'query', metatype: MovimientoProductoQueryDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it.each(['true', 'false'])('convierte stockBajo %s', async (stockBajo) => {
    expect(
      await pipe.transform(
        { stockBajo },
        { type: 'query', metatype: ExistenciaQueryDto },
      ),
    ).toMatchObject({ stockBajo: stockBajo === 'true' });
  });
  it('rechaza booleano ambiguo', async () => {
    await expect(
      pipe.transform(
        { stockBajo: '1' },
        { type: 'query', metatype: ExistenciaQueryDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it('calcula metadata para páginas vacías y múltiples', () => {
    expect(paginacion({ page: 2, limit: 20 }, 45)).toEqual({
      page: 2,
      limit: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(paginacion({ page: 1, limit: 20 }, 0).totalPages).toBe(0);
  });
  it('normaliza días UTC y offsets explícitos', () => {
    expect(limiteFecha('2026-09-30')).toBe('2026-09-30T00:00:00.000Z');
    expect(limiteFecha('2026-09-30', true)).toBe('2026-09-30T23:59:59.999Z');
    expect(limiteFecha('2026-09-30T00:00:00-06:00')).toBe(
      '2026-09-30T06:00:00.000Z',
    );
  });
});
