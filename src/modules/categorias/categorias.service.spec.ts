import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service.js';
import { CategoriasService } from './categorias.service.js';
vi.mock('../../database/database.service.js', () => ({ DatabaseService: class {} }));

describe('Categorías: eliminación y protección referencial', () => {
  function setup() {
    const categoria = { id: 1, nombre: 'SINTÉTICA' };
    const first = vi.fn().mockResolvedValue(categoria);
    const productoFirst = vi.fn().mockResolvedValue(null);
    const remove = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue([]);
    const productoWhere = vi.fn().mockReturnValue({ first: productoFirst });
    const tx = { query, orm: { public: {
      Categoria: { where: vi.fn().mockReturnValue({ first, delete: remove }) },
      Producto: { where: productoWhere },
    } } };
    const sql = vi.fn().mockReturnValue({ returnsRow: () => ({ build: () => ({}) }) });
    const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
    const db = { db: { raw: { sql } }, transaction } as unknown as DatabaseService;
    return { service: new CategoriasService(db), first, productoFirst, productoWhere, remove, query, transaction, categoria };
  }
  it('elimina categoría libre en transacción conservando respuesta', async () => {
    const s = setup();
    expect(await s.service.remove(1)).toEqual({ message: 'Categoría eliminada definitivamente', categoria: s.categoria });
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.transaction).toHaveBeenCalledOnce();
    expect(s.remove).toHaveBeenCalledOnce();
  });
  it('rechaza producto asociado con 409 antes del DELETE', async () => {
    const s = setup(); s.productoFirst.mockResolvedValue({ id: 3 } as never);
    const error = await s.service.remove(1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(s.productoWhere).toHaveBeenCalledWith({ categoriaId: 1 });
    expect(s.remove).not.toHaveBeenCalled();
  });
  it('traduce la excepción FK simulada anidada sin convertirla en éxito', async () => {
    const s = setup(); s.remove.mockRejectedValue({ cause: { meta: { sqlState: '23503' } } });
    const error = await s.service.remove(1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
  });
  it('mantiene 404 si la categoría ya no existe', async () => {
    const s = setup(); s.first.mockResolvedValue(null as never);
    await expect(s.service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(s.remove).not.toHaveBeenCalled();
  });
  it('propaga errores desconocidos', async () => {
    const s = setup(); const error = new Error('error inesperado'); s.remove.mockRejectedValue(error);
    await expect(s.service.remove(1)).rejects.toBe(error);
  });
  it('conserva la segunda llamada inexistente como 404 de negocio', async () => {
    const s = setup(); await s.service.remove(1); s.first.mockResolvedValue(null as never);
    await expect(s.service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(s.remove).toHaveBeenCalledTimes(1);
  });
});
