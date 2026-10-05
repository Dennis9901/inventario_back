import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateCompraDto } from './create-compra.dto.js';
import { UpdateCompraDto } from './update-compra.dto.js';
import { CompraQueryDto } from './compra-query.dto.js';
import { CreateProveedorDto } from '../../proveedores/dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from '../../proveedores/dto/update-proveedor.dto.js';
import { ProveedorQueryDto } from '../../proveedores/dto/proveedor-query.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const compra = {
  proveedorId: 1,
  detalles: [{ productoId: 1, cantidad: 50, costoUnitario: 12000 }],
};
const validar = (
  body: object,
  metatype:
    | typeof CreateCompraDto
    | typeof UpdateCompraDto
    | typeof CreateProveedorDto
    | typeof UpdateProveedorDto,
) => pipe.transform(body, { type: 'body', metatype });

describe('DTOs comerciales', () => {
  it('valida detalles anidados y updates parciales', async () => {
    expect(await validar(compra, CreateCompraDto)).toMatchObject(compra);
    expect(
      await validar({ observacion: 'Editada' }, UpdateCompraDto),
    ).toMatchObject({ observacion: 'Editada' });
    expect(
      await validar({ telefono: '123' }, UpdateProveedorDto),
    ).toMatchObject({ telefono: '123' });
  });
  it.each([
    { estado: 'RECIBIDA' },
    { subtotal: 1 },
    { total: 1 },
    { folio: 'FALSO' },
    { createdByUsuarioId: 2 },
    { recibidaPorUsuarioId: 2 },
    { detalles: [] },
    { detalles: null },
    { proveedorId: null },
    { impuestos: null },
    { impuestos: -1 },
    { impuestos: 0.001 },
    { detalles: [{ productoId: 1, cantidad: 0, costoUnitario: 1 }] },
    { detalles: [{ productoId: 1, cantidad: '2', costoUnitario: 1 }] },
    { detalles: [{ productoId: 1, cantidad: 1, costoUnitario: -1 }] },
    {
      detalles: [{ productoId: 1, cantidad: 1, costoUnitario: 1, subtotal: 1 }],
    },
  ])('rechaza body de compra %j', async (extra) => {
    await expect(
      validar({ ...compra, ...extra }, CreateCompraDto),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([
    { detalles: null },
    { proveedorId: null },
    { impuestos: null },
    { estado: 'BORRADOR' },
  ])('rechaza update %j', async (body) => {
    await expect(validar(body, UpdateCompraDto)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('normaliza RFC y email sin aceptar activo del cliente', async () => {
    expect(
      await validar(
        {
          nombre: 'Proveedor',
          rfc: ' tse260101abc ',
          email: ' VENTAS@example.com ',
        },
        CreateProveedorDto,
      ),
    ).toMatchObject({ rfc: 'TSE260101ABC', email: 'ventas@example.com' });
    await expect(
      validar({ nombre: 'Proveedor', activo: false }, CreateProveedorDto),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([
    { nombre: ' ' },
    { nombre: null },
    { nombre: 'P', rfc: 'invalido' },
    { nombre: 'P', email: 'invalido' },
  ])('rechaza proveedor %j', async (body) => {
    await expect(validar(body, CreateProveedorDto)).rejects.toThrow(
      BadRequestException,
    );
  });
  it.each([
    { limit: '101' },
    { page: '0' },
    { estado: 'OTRO' },
    { proveedorId: '-1' },
    { sortBy: 'password' },
    { sortOrder: 'DROP' },
    { fechaInicio: '2026-02-30' },
    { fechaFin: '2026-10-01T12:00:00' },
  ])('rechaza query %j', async (query) => {
    await expect(
      pipe.transform(query, { type: 'query', metatype: CompraQueryDto }),
    ).rejects.toThrow(BadRequestException);
  });
  it('aplica defaults de ambas colecciones', async () => {
    expect(
      await pipe.transform({}, { type: 'query', metatype: CompraQueryDto }),
    ).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(
      await pipe.transform({}, { type: 'query', metatype: ProveedorQueryDto }),
    ).toMatchObject({ page: 1, limit: 20 });
  });
});
