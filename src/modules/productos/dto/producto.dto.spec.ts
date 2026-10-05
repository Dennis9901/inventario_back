import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProductoDto } from './create-producto.dto.js';
import { UpdateProductoDto } from './update-producto.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const valid = {
  sku: 'SKU',
  nombre: 'Producto',
  costo: 0,
  precio: 1.25,
  stockMinimo: 0,
  categoriaId: 1,
};

describe.each([CreateProductoDto, UpdateProductoDto])(
  '%s validation',
  (metatype) => {
    const transform = (data: object) =>
      pipe.transform(data, { type: 'body', metatype });

    it('acepta los datos válidos', async () => {
      await expect(transform(valid)).resolves.toMatchObject(valid);
    });

    it.each(['sku', 'nombre', 'unidadMedida'])(
      'rechaza %s en blanco',
      async (field) => {
        await expect(transform({ ...valid, [field]: '   ' })).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it.each([
      'sku',
      'nombre',
      'codigoBarras',
      'descripcion',
      'costo',
      'precio',
      'stockMinimo',
      'unidadMedida',
      'categoriaId',
    ])('rechaza null en %s', async (field) => {
      await expect(transform({ ...valid, [field]: null })).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([
      { costo: -1 },
      { precio: 1.234 },
      { stockMinimo: 0.5 },
      { categoriaId: 0 },
      { activo: false },
    ])('rechaza valores inválidos %j', async (change) => {
      await expect(transform({ ...valid, ...change })).rejects.toThrow(
        BadRequestException,
      );
    });
  },
);

it('acepta un PATCH parcial sin campos obligatorios', async () => {
  await expect(
    pipe.transform(
      { precio: 0 },
      { type: 'body', metatype: UpdateProductoDto },
    ),
  ).resolves.toEqual({ precio: 0 });
});
