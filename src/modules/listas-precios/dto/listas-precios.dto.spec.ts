import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateListaPrecioDto,
  UpdateListaPrecioDto,
  CreateProductoPrecioDto,
  UpdateProductoPrecioDto,
  ProductoPrecioQueryDto,
} from './listas-precios.dto.js';
import { CreateVentaDto } from '../../ventas/dto/create-venta.dto.js';
import { UpdateVentaDto } from '../../ventas/dto/update-venta.dto.js';
const precio = {
  productoId: 1,
  precio: '135.00',
  vigenciaDesde: '2026-01-01T00:00:00Z',
};
describe('DTO Backend 5B', () => {
  it.each(['PUBLICO', 'CLINICA', 'MAYOREO'])(
    'acepta código estable %s',
    async (codigo) =>
      expect(
        await validate(
          plainToInstance(CreateListaPrecioDto, { codigo, nombre: 'Nombre' }),
        ),
      ).toEqual([]),
  );
  it.each(['', 'clinica', 'CON ESPACIO', 'A'.repeat(41)])(
    'rechaza código %s',
    async (codigo) =>
      expect(
        (
          await validate(
            plainToInstance(CreateListaPrecioDto, { codigo, nombre: 'Nombre' }),
          )
        ).length,
      ).toBeGreaterThan(0),
  );
  it.each(['0', '135.00', '1000000000000'])(
    'acepta decimal %s',
    async (value) =>
      expect(
        await validate(
          plainToInstance(CreateProductoPrecioDto, {
            ...precio,
            precio: value,
          }),
        ),
      ).toEqual([]),
  );
  it.each(['NaN', 'Infinity', '-1', '1.001', '1e2', 135, null])(
    'rechaza precio %s',
    async (value) =>
      expect(
        (
          await validate(
            plainToInstance(CreateProductoPrecioDto, {
              ...precio,
              precio: value,
            }),
          )
        ).length,
      ).toBeGreaterThan(0),
  );
  it.each(['2026-01-01', '2026-01-01T00:00:00', '2026-02-30T00:00:00Z'])(
    'rechaza fecha %s',
    async (value) =>
      expect(
        (
          await validate(
            plainToInstance(CreateProductoPrecioDto, {
              ...precio,
              vigenciaDesde: value,
            }),
          )
        ).length,
      ).toBeGreaterThan(0),
  );
  it('permite fin abierto y zona explícita', async () =>
    expect(
      await validate(
        plainToInstance(CreateProductoPrecioDto, {
          ...precio,
          vigenciaDesde: '2026-01-01T00:00:00-06:00',
          vigenciaHasta: null,
        }),
      ),
    ).toEqual([]));
  it('PATCH lista rechaza null', async () =>
    expect(
      (await validate(plainToInstance(UpdateListaPrecioDto, { nombre: null })))
        .length,
    ).toBeGreaterThan(0));
  it('PATCH precio rechaza fin null', async () =>
    expect(
      (
        await validate(
          plainToInstance(UpdateProductoPrecioDto, { vigenciaHasta: null }),
        )
      ).length,
    ).toBeGreaterThan(0));
  it('filtros transforman booleano e id', async () => {
    const dto = plainToInstance(ProductoPrecioQueryDto, {
      activo: 'false',
      productoId: '3',
      page: '2',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.activo).toBe(false);
    expect(dto.productoId).toBe(3);
  });
  it('legacy sin lista válido', async () =>
    expect(
      await validate(
        plainToInstance(CreateVentaDto, {
          clienteId: 1,
          detalles: [{ productoId: 1, cantidad: 2 }],
        }),
      ),
    ).toEqual([]));
  it('create venta rechaza lista null', async () =>
    expect(
      (
        await validate(
          plainToInstance(CreateVentaDto, {
            clienteId: 1,
            listaPrecioId: null,
            detalles: [{ productoId: 1, cantidad: 2 }],
          }),
        )
      ).length,
    ).toBeGreaterThan(0));
  it('PATCH venta permite volver a base con null', async () =>
    expect(
      await validate(plainToInstance(UpdateVentaDto, { listaPrecioId: null })),
    ).toEqual([]));
});
