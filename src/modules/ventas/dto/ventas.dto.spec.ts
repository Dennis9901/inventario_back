import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateVentaDto } from './create-venta.dto.js';
import { UpdateVentaDto } from './update-venta.dto.js';
import { VentaQueryDto } from './venta-query.dto.js';
import { CreateClienteDto } from '../../clientes/dto/create-cliente.dto.js';
import { UpdateClienteDto } from '../../clientes/dto/update-cliente.dto.js';
import { ClienteQueryDto } from '../../clientes/dto/cliente-query.dto.js';
import { SinCuerpoPipe } from '../../../common/sin-cuerpo.pipe.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const venta = { clienteId: 1, detalles: [{ productoId: 1, cantidad: 2 }] };
const validar = (
  body: object,
  metatype:
    | typeof CreateVentaDto
    | typeof UpdateVentaDto
    | typeof CreateClienteDto
    | typeof UpdateClienteDto,
) => pipe.transform(body, { type: 'body', metatype });

describe('DTOs de ventas/clientes', () => {
  it('valida venta y cambios parciales sin aceptar precios del cliente', async () => {
    expect(await validar(venta, CreateVentaDto)).toMatchObject(venta);
    expect(
      await validar({ observacion: 'Editada' }, UpdateVentaDto),
    ).toMatchObject({ observacion: 'Editada' });
    expect(await validar({ telefono: '123' }, UpdateClienteDto)).toMatchObject({
      telefono: '123',
    });
  });
  it.each([
    { estado: 'CONFIRMADA' },
    { folio: 'VENT-FALSO' },
    { subtotal: 1 },
    { total: 1 },
    { costoTotal: 1 },
    { utilidad: 1 },
    { createdByUsuarioId: 2 },
    { confirmadaPorUsuarioId: 2 },
    { fechaConfirmacion: '2026-10-02' },
    { clienteId: null },
    { detalles: [] },
    { detalles: null },
    { impuestos: null },
    { impuestos: -1 },
    { impuestos: 0.001 },
    { detalles: [{ productoId: 1, cantidad: 0 }] },
    { detalles: [{ productoId: 1, cantidad: -1 }] },
    { detalles: [{ productoId: 1, cantidad: '2' }] },
    { detalles: [{ productoId: 1, cantidad: 0.5 }] },
    { detalles: [{ productoId: 1, cantidad: 2, precioUnitario: 1 }] },
    { detalles: [{ productoId: 1, cantidad: 2, costoUnitario: 1 }] },
    { detalles: [{ productoId: 1, cantidad: 2, subtotal: 1 }] },
  ])('rechaza creación manipulada %j', async (extra) => {
    await expect(
      validar({ ...venta, ...extra }, CreateVentaDto),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([
    { detalles: null },
    { clienteId: null },
    { impuestos: null },
    { estado: 'BORRADOR' },
  ])('rechaza update %j', async (body) => {
    await expect(validar(body, UpdateVentaDto)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('normaliza RFC/email de cliente', async () => {
    expect(
      await validar(
        {
          nombre: 'Juan',
          apellido: 'Pérez',
          rfc: ' tse260101abc ',
          email: ' JUAN@example.com ',
        },
        CreateClienteDto,
      ),
    ).toMatchObject({ rfc: 'TSE260101ABC', email: 'juan@example.com' });
  });
  it.each([
    { nombre: ' ' },
    { nombre: null },
    { nombre: 'P', email: 'invalido' },
    { nombre: 'P', rfc: 'X'.repeat(101) },
    { nombre: 'P', activo: false },
  ])('rechaza cliente inválido %j', async (body) => {
    await expect(validar(body, CreateClienteDto)).rejects.toThrow(
      BadRequestException,
    );
  });
  it.each([
    { limit: '101' },
    { page: '0' },
    { estado: 'OTRO' },
    { clienteId: '-1' },
    { sortBy: 'password' },
    { sortOrder: 'DROP' },
    { fechaInicio: '2026-02-30' },
    { fechaFin: '2026-10-01T12:00:00' },
  ])('rechaza query %j', async (query) => {
    await expect(
      pipe.transform(query, { type: 'query', metatype: VentaQueryDto }),
    ).rejects.toThrow(BadRequestException);
  });
  it('aplica defaults de ambas colecciones', async () => {
    expect(
      await pipe.transform({}, { type: 'query', metatype: VentaQueryDto }),
    ).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(
      await pipe.transform({}, { type: 'query', metatype: ClienteQueryDto }),
    ).toMatchObject({ page: 1, limit: 20 });
  });
  it.each(['createdAt', 'folio', 'estado', 'total', 'utilidad'])(
    'acepta orden %s',
    async (sortBy) => {
      expect(
        await pipe.transform(
          { sortBy },
          { type: 'query', metatype: VentaQueryDto },
        ),
      ).toMatchObject({ sortBy });
    },
  );
  it.each([
    null,
    [],
    'texto',
    1,
    { cantidad: 2 },
    { confirmadaPorUsuarioId: 1 },
  ])('acción rechaza body %j', (body) => {
    expect(() => new SinCuerpoPipe().transform(body)).toThrow(
      BadRequestException,
    );
  });
  it('acción admite body ausente o vacío', () => {
    expect(() => new SinCuerpoPipe().transform(undefined)).not.toThrow();
    expect(() => new SinCuerpoPipe().transform({})).not.toThrow();
  });
});
