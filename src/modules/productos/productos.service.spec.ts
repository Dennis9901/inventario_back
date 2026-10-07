import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service.js';
import { ProductosService } from './productos.service.js';

vi.mock('../../database/database.service.js', () => ({
  DatabaseService: class {},
}));

describe('ProductosService', () => {
  const producto = { id: 1, sku: 'SKU-1', nombre: 'PRODUCTO', activo: true };
  const dto = {
    sku: ' sku-1 ',
    nombre: ' producto ',
    codigoBarras: ' 123 ',
    costo: 12.5,
    precio: 20,
    stockMinimo: 0,
    categoriaId: 1,
  };
  let service: ProductosService;
  let first: ReturnType<typeof vi.fn>;
  let categoriaFirst: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    first = vi.fn().mockResolvedValue(null);
    categoriaFirst = vi.fn().mockResolvedValue({ id: 1, activo: true });
    create = vi.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
    update = vi.fn().mockResolvedValue([]);
    remove = vi.fn().mockResolvedValue([]);
    const orm = {
      public: {
        Producto: {
          all: vi.fn().mockResolvedValue([producto]),
          create,
          where: vi.fn(() => ({ first, update, delete: remove })),
        },
        Categoria: { where: vi.fn(() => ({ first: categoriaFirst })) },
        Existencia: {
          create: vi.fn().mockResolvedValue({ cantidad: 0 }),
          where: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(null),
            delete: vi.fn().mockResolvedValue([]),
          })),
        },
        DetalleVenta: {
          where: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })),
        },
        DetalleCompra: {
          where: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })),
        },
        MovimientoInventario: {
          where: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })),
        },
      },
    };
    service = new ProductosService({
      transaction: async (
        callback: (tx: { orm: typeof orm }) => Promise<unknown>,
      ) => callback({ orm }),
      bloquearProducto: vi.fn().mockResolvedValue(undefined),
      db: {
        orm,
        transaction: async (
          callback: (tx: { orm: typeof orm }) => Promise<unknown>,
        ) => callback({ orm }),
      },
    } as unknown as DatabaseService);
  });

  it('normaliza la creación y entrega los decimales como strings al contract API', async () => {
    expect(await service.create(dto)).toMatchObject({
      sku: 'SKU-1',
      nombre: 'PRODUCTO',
      codigoBarras: '123',
      costo: '12.50',
      precio: '20.00',
      stockMinimo: 0,
      unidadMedida: 'PIEZA',
      activo: true,
      descripcion: null,
    });
  });

  it.each([null, { id: 1, activo: false }])(
    'rechaza una categoría inválida: %j',
    async (categoria) => {
      categoriaFirst.mockResolvedValue(categoria);
      await expect(service.create(dto)).rejects.toThrow(
        categoria ? ConflictException : NotFoundException,
      );
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(['sku', 'codigoBarras'])(
    'rechaza duplicados de %s',
    async (campo) => {
      if (campo === 'codigoBarras') first.mockResolvedValueOnce(null);
      first.mockResolvedValueOnce(producto);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('lista y busca productos, con 404 para un identificador inexistente', async () => {
    expect(await service.findAll()).toEqual([producto]);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    first.mockResolvedValue(producto);
    expect(await service.findOne(1)).toEqual(producto);
  });

  it('actualiza parcialmente, permite sus propios identificadores y conserva ceros', async () => {
    first.mockResolvedValue(producto);
    await service.update(1, {
      sku: ' sku-1 ',
      codigoBarras: '123',
      costo: 0,
      precio: 0,
      stockMinimo: 0,
    });
    expect(update).toHaveBeenCalledWith({
      sku: 'SKU-1',
      codigoBarras: '123',
      costo: '0.00',
      precio: '0.00',
      stockMinimo: 0,
    });
  });

  it('permite limpiar los campos de texto anulables', async () => {
    first.mockResolvedValue(producto);
    await service.update(1, { codigoBarras: ' ', descripcion: ' ' });
    expect(update).toHaveBeenCalledWith({
      codigoBarras: null,
      descripcion: null,
    });
  });

  it.each(['sku', 'codigoBarras'])(
    'no actualiza con %s de otro producto',
    async (campo) => {
      first.mockResolvedValueOnce(producto).mockResolvedValueOnce({ id: 2 });
      await expect(service.update(1, { [campo]: 'OTRO' })).rejects.toThrow(
        ConflictException,
      );
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each([null, { activo: false }])(
    'no reasigna a una categoría inválida: %j',
    async (categoria) => {
      first.mockResolvedValue(producto);
      categoriaFirst.mockResolvedValue(categoria);
      await expect(service.update(1, { categoriaId: 2 })).rejects.toThrow(
        categoria ? ConflictException : NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('desactiva y activa, rechazando repetir el estado actual', async () => {
    first.mockResolvedValue(producto);
    await service.desactivar(1);
    expect(update).toHaveBeenLastCalledWith({ activo: false });
    await expect(service.activar(1)).rejects.toThrow(ConflictException);
    first.mockResolvedValue({ ...producto, activo: false });
    await service.activar(1);
    expect(update).toHaveBeenLastCalledWith({ activo: true });
    await expect(service.desactivar(1)).rejects.toThrow(ConflictException);
  });

  it('elimina físicamente y devuelve la identificación del producto', async () => {
    first.mockResolvedValue(producto);
    expect(await service.remove(1)).toEqual({
      message: 'Producto eliminado definitivamente',
      producto: { id: 1, sku: 'SKU-1', nombre: 'PRODUCTO' },
    });
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each(['update', 'activar', 'desactivar', 'remove'] as const)(
    'impide %s si el producto no existe',
    async (method) => {
      await expect(service[method](99, {})).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );
});
