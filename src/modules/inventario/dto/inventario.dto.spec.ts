import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EntradaInventarioDto } from './entrada-inventario.dto.js';
import { SalidaInventarioDto } from './salida-inventario.dto.js';
import { AjusteInventarioDto } from './ajuste-inventario.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe.each([
  { metatype: EntradaInventarioDto, campo: 'cantidad', minimo: 1 },
  { metatype: SalidaInventarioDto, campo: 'cantidad', minimo: 1 },
  { metatype: AjusteInventarioDto, campo: 'nuevaCantidad', minimo: 0 },
])('DTO $metatype.name', ({ metatype, campo, minimo }) => {
  const transform = (body: object) =>
    pipe.transform(body, { type: 'body', metatype });
  it('acepta el mínimo y observación opcional', async () => {
    const body = { productoId: 1, [campo]: minimo };
    await expect(transform(body)).resolves.toMatchObject(body);
  });
  it.each([null, -1, 0.5, '10', 2147483648])(
    'rechaza cantidad %j',
    async (valor) => {
      await expect(
        transform({ productoId: 1, [campo]: valor }),
      ).rejects.toThrow(BadRequestException);
    },
  );
  it.each([0, -1, null, 1.5, '1', 2147483648])(
    'rechaza productoId %j',
    async (productoId) => {
      await expect(transform({ productoId, [campo]: minimo })).rejects.toThrow(
        BadRequestException,
      );
    },
  );
  it.each([
    { usuarioId: 4 },
    { tipo: 'ENTRADA' },
    { observacion: null },
    { observacion: 5 },
    { observacion: 'x'.repeat(501) },
  ])('rechaza body inválido %j', async (extra) => {
    await expect(
      transform({ productoId: 1, [campo]: minimo, ...extra }),
    ).rejects.toThrow(BadRequestException);
  });
  it('rechaza valor menor al mínimo', async () => {
    await expect(
      transform({ productoId: 1, [campo]: minimo - 1 }),
    ).rejects.toThrow(BadRequestException);
  });
});
