import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { InventarioService } from '../src/modules/inventario/inventario.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';

// Opt-in: usa DATABASE_URL con el contract aplicado. Solo borra los fixtures
// creados por esta suite, por sus IDs; nunca trunca tablas ni toca datos ajenos.
describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Inventario con PostgreSQL real',
  () => {
    let app: INestApplication;
    let database: DatabaseService;
    let inventario: InventarioService;
    let productos: ProductosService;
    let categoriaId: number;
    let usuarioId: number;
    let rolId: number;
    let token: string;
    let tokenConsulta: string;
    const ids: number[] = [];
    const prefix = `TEST-INVENTARIO-${randomUUID()}`.toUpperCase();

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      database = app.get(DatabaseService);
      inventario = app.get(InventarioService);
      productos = app.get(ProductosService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix, activo: true })).id;
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.test`,
          password: 'fixture-no-login',
          rolId,
          activo: true,
        })
      ).id;
      categoriaId = (
        await orm.Categoria.create({ nombre: prefix, activo: true })
      ).id;
      const jwt = app.get(JwtService);
      token = await jwt.signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      tokenConsulta = await jwt.signAsync({ sub: usuarioId });
    });

    afterAll(async () => {
      if (database) {
        // Limpieza limitada a fixtures: primero sus movimientos, luego stock y padres.
        await database.db.transaction(async (tx) => {
          for (const id of ids) {
            await tx.orm.public.MovimientoInventario.where({
              productoId: id,
            }).deleteAll();
            await tx.orm.public.Existencia.where({ productoId: id }).delete();
            await tx.orm.public.Producto.where({ id }).delete();
          }
          if (categoriaId)
            await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
          if (usuarioId)
            await tx.orm.public.Usuario.where({ id: usuarioId }).delete();
          if (rolId) await tx.orm.public.Rol.where({ id: rolId }).delete();
        });
        await database.db.close();
      }
      await app?.close();
    });

    async function nuevoProducto() {
      const producto = await productos.create({
        sku: `${prefix}-${ids.length}`,
        nombre: 'Producto de prueba',
        costo: 0,
        precio: 1,
        stockMinimo: 5,
        categoriaId,
      });
      ids.push(producto.id);
      return producto.id;
    }
    const post = (ruta: string, body: object) =>
      request(app.getHttpServer())
        .post(`/api/v1/inventario/movimientos/${ruta}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('A-E, I: 0 → 50 → 60 → 52, rechaza 100, ajusta a 45 y conserva autor real', async () => {
      const productoId = await nuevoProducto();
      expect(
        await database.db.orm.public.Existencia.where({ productoId }).first(),
      ).toMatchObject({ cantidad: 0 });
      const entrada = await post('entrada', {
        productoId,
        cantidad: 50,
        observacion: 'Compra inicial',
      }).expect(201);
      expect(entrada.body).toMatchObject({
        tipo: 'ENTRADA',
        cantidad: 50,
        stockAnterior: 0,
        stockNuevo: 50,
        usuarioId,
      });
      expect(
        (await post('entrada', { productoId, cantidad: 10 }).expect(201)).body,
      ).toMatchObject({ stockAnterior: 50, stockNuevo: 60 });
      expect(
        (await post('salida', { productoId, cantidad: 8 }).expect(201)).body,
      ).toMatchObject({
        tipo: 'SALIDA',
        cantidad: 8,
        stockAnterior: 60,
        stockNuevo: 52,
      });
      await post('salida', { productoId, cantidad: 100 }).expect(409);
      expect(await inventario.findExistencia(productoId)).toMatchObject({
        cantidad: 52,
      });
      expect(
        (await inventario.findMovimientosProducto(productoId)).data,
      ).toHaveLength(3);
      expect(
        (
          await post('ajuste', {
            productoId,
            nuevaCantidad: 45,
            observacion: 'Conteo físico',
          }).expect(201)
        ).body,
      ).toMatchObject({
        tipo: 'AJUSTE',
        cantidad: -7,
        stockAnterior: 52,
        stockNuevo: 45,
        usuarioId,
      });
      const movimientos = await inventario.findMovimientosProducto(productoId);
      expect(movimientos.data).toHaveLength(4);
      expect(movimientos.data[0]).toMatchObject({
        tipo: 'AJUSTE',
        producto: { id: productoId },
        usuario: { id: usuarioId },
      });
      expect(movimientos.data[0]?.usuario).not.toHaveProperty('password');
      await expect(productos.remove(productoId)).rejects.toThrow(
        ConflictException,
      );
    });

    const get = (ruta: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/inventario/${ruta}`)
        .set('Authorization', `Bearer ${tokenConsulta}`);

    it('consulta movimientos con defaults, paginación, filtros combinados y orden', async () => {
      const productoId = await nuevoProducto();
      for (let i = 0; i < 23; i++)
        await inventario.entrada({ productoId, cantidad: i + 1 }, usuarioId);
      const ruta = `movimientos?productoId=${productoId}`;
      const first = await get(ruta).expect(200);
      expect(first.body.data).toHaveLength(20);
      expect(first.body.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 23,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(first.body.data[0].cantidad).toBe(23);
      const second = await get(`${ruta}&page=2`).expect(200);
      expect(second.body.data).toHaveLength(3);
      const filtrado = await get(
        `${ruta}&tipo=ENTRADA&usuarioId=${usuarioId}&fechaInicio=2000-01-01&fechaFin=2100-01-01&sortBy=cantidad&sortOrder=asc&limit=2`,
      ).expect(200);
      expect(
        filtrado.body.data.map((m: { cantidad: number }) => m.cantidad),
      ).toEqual([1, 2]);
      expect(filtrado.body.pagination.totalItems).toBe(23);
      expect((await get(`${ruta}&tipo=SALIDA`).expect(200)).body.data).toEqual(
        [],
      );
      expect(
        (await get(`${ruta}&usuarioId=2147483647`).expect(200)).body.pagination
          .totalItems,
      ).toBe(0);
      expect(
        (await get(`${ruta}&fechaFin=2000-01-01`).expect(200)).body.data,
      ).toEqual([]);
      expect(
        (await get(`${ruta}&page=99`).expect(200)).body.pagination.totalItems,
      ).toBe(23);
      const global = await get('movimientos').expect(200);
      expect(global.body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(global.body.data.length).toBeLessThanOrEqual(20);
      expect(
        global.body.data.map((m: { createdAt: string }) => m.createdAt),
      ).toEqual(
        global.body.data
          .map((m: { createdAt: string }) => m.createdAt)
          .sort()
          .reverse(),
      );
    });

    it('filtra límites de día UTC y respeta offsets de timestamps', async () => {
      const productoId = await nuevoProducto();
      for (const createdAt of [
        '2026-09-30T00:00:00.000Z',
        '2026-09-30T23:59:59.999Z',
        '2026-10-01T00:00:00.000Z',
      ]) {
        const movimiento = await inventario.entrada(
          { productoId, cantidad: 1 },
          usuarioId,
        );
        await database.db.orm.public.MovimientoInventario.where({
          id: movimiento.id,
        }).update({ createdAt });
      }
      const result = await get(
        `movimientos?productoId=${productoId}&fechaInicio=2026-09-30&fechaFin=2026-09-30`,
      ).expect(200);
      expect(result.body.pagination.totalItems).toBe(2);
      const offset = await get(
        `movimientos?productoId=${productoId}&fechaInicio=${encodeURIComponent('2026-09-29T18:00:00-06:00')}&fechaFin=2026-09-30T00:00:00Z`,
      ).expect(200);
      expect(offset.body.pagination.totalItems).toBe(1);
    });

    it.each([
      'fechaInicio=2026-10-01&fechaFin=2026-09-01',
      'sortBy=password',
      'limit=101',
      'tipo=INVALIDO',
      'fechaInicio=2026-02-30',
      'stockBajo=true',
    ])('movimientos rechaza query %s', async (q) => {
      await get(`movimientos?${q}`).expect(400);
    });

    it('Kardex paginado incluye stock y usuario seguro; ruta rechaza productoId', async () => {
      const productoId = ids[0]!;
      const result = await get(`kardex/${productoId}?limit=2`).expect(200);
      expect(result.body.producto).toMatchObject({
        id: productoId,
        stockActual: 45,
        unidadMedida: 'PIEZA',
      });
      expect(result.body.pagination).toMatchObject({
        totalItems: 4,
        totalPages: 2,
      });
      expect(result.body.data[0]).toMatchObject({
        tipo: 'AJUSTE',
        cantidad: -7,
        usuario: {
          id: usuarioId,
          nombre: prefix,
          email: `${prefix}@example.test`,
        },
      });
      expect(JSON.stringify(result.body)).not.toContain('password');
      await get(`movimientos/producto/${productoId}?productoId=2`).expect(400);
      await get('kardex/2147483647').expect(404);
      const page = await get(
        `movimientos/producto/${productoId}?tipo=SALIDA&limit=1`,
      ).expect(200);
      expect(page.body.pagination.totalItems).toBe(1);
    });

    it('existencias pagina, busca SKU/nombre/código y filtra stock bajo incluyendo igualdad', async () => {
      const productoId = await nuevoProducto();
      await database.db.orm.public.Producto.where({ id: productoId }).update({
        nombre: `${prefix}-DELL`,
        codigoBarras: `${prefix}-BARCODE`,
      });
      await inventario.entrada({ productoId, cantidad: 5 }, usuarioId);
      for (const search of [
        `${prefix}-${ids.length - 1}`,
        `${prefix.toLowerCase()}-dell`,
        `${prefix}-BARCODE`,
      ]) {
        const result = await get(
          `existencias?search=${encodeURIComponent(search)}&limit=1`,
        ).expect(200);
        expect(result.body.pagination).toMatchObject({
          totalItems: 1,
          totalPages: 1,
          limit: 1,
        });
        expect(result.body.data[0]).toMatchObject({
          productoId,
          cantidad: 5,
          stockBajo: true,
          categoria: { id: categoriaId },
          activo: true,
        });
      }
      expect(
        (
          await get(
            `existencias?search=${prefix}-BARCODE&stockBajo=true`,
          ).expect(200)
        ).body.data,
      ).toHaveLength(1);
      expect(
        (
          await get(
            `existencias?search=${prefix}-BARCODE&stockBajo=false`,
          ).expect(200)
        ).body.data,
      ).toHaveLength(0);
      await inventario.entrada({ productoId, cantidad: 1 }, usuarioId);
      expect(
        (
          await get(
            `existencias?search=${prefix}-BARCODE&stockBajo=false`,
          ).expect(200)
        ).body.data[0].stockBajo,
      ).toBe(false);
      await get('existencias?stockBajo=1').expect(400);
      const page = await get(
        `existencias?search=${prefix}&page=2&limit=1`,
      ).expect(200);
      expect(page.body.pagination).toMatchObject({
        page: 2,
        hasPreviousPage: true,
      });
      expect(page.body.data).toHaveLength(1);
      await get('existencias/2147483647').expect(404);
      await database.db.orm.public.Existencia.where({ productoId }).delete();
      await get(`existencias/${productoId}`).expect(409);
      await get(`existencias?search=${prefix}-BARCODE`).expect(409);
      await inventario.entrada({ productoId, cantidad: 1 }, usuarioId);
    });

    it('AJUSTE positivo conserva diferencia con signo y DELETE HTTP rechaza historial', async () => {
      const productoId = await nuevoProducto();
      await inventario.ajuste({ productoId, nuevaCantidad: 45 }, usuarioId);
      const ajuste = await post('ajuste', {
        productoId,
        nuevaCantidad: 60,
      }).expect(201);
      expect(ajuste.body).toMatchObject({
        cantidad: 15,
        stockAnterior: 45,
        stockNuevo: 60,
        usuarioId,
      });
      await request(app.getHttpServer())
        .delete(`/api/v1/productos/${productoId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
      expect(
        (await get(`existencias/${productoId}`).expect(200)).body.cantidad,
      ).toBe(60);
    });

    it('F-G: 404 e inactivo no alteran stock ni crean movimientos', async () => {
      await post('entrada', { productoId: 2147483647, cantidad: 1 }).expect(
        404,
      );
      const productoId = await nuevoProducto();
      await productos.desactivar(productoId);
      await post('entrada', { productoId, cantidad: 1 }).expect(409);
      expect(await inventario.findExistencia(productoId)).toMatchObject({
        cantidad: 0,
      });
      expect(
        (await inventario.findMovimientosProducto(productoId)).data,
      ).toHaveLength(0);
    });

    it('H: JWT obligatorio, rol administrador y usuarioId del body rechazado', async () => {
      for (const ruta of [
        'existencias',
        'existencias/1',
        'movimientos',
        'movimientos/producto/1',
        'kardex/1',
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/inventario/${ruta}`)
          .expect(401);
      }
      for (const ruta of ['entrada', 'salida', 'ajuste']) {
        await request(app.getHttpServer())
          .post(`/api/v1/inventario/movimientos/${ruta}`)
          .send({})
          .expect(401);
        await request(app.getHttpServer())
          .post(`/api/v1/inventario/movimientos/${ruta}`)
          .set('Authorization', `Bearer ${tokenConsulta}`)
          .send({})
          .expect(403);
      }
      await post('entrada', {
        productoId: ids[0],
        cantidad: 1,
        usuarioId: 4,
      }).expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/inventario/existencias')
        .set('Authorization', `Bearer ${tokenConsulta}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/inventario/movimientos')
        .set('Authorization', `Bearer ${tokenConsulta}`)
        .expect(200);
    });

    it('J: fallo al insertar movimiento revierte el UPDATE de existencia en PostgreSQL', async () => {
      const productoId = await nuevoProducto();
      await inventario.entrada({ productoId, cantidad: 10 }, usuarioId);
      const transaction = database.db.transaction.bind(database.db);
      const spy = vi
        .spyOn(database.db, 'transaction')
        .mockImplementationOnce((callback) =>
          transaction(async (tx) => {
            const create = vi
              .spyOn(tx.orm.public.MovimientoInventario, 'create')
              .mockRejectedValueOnce(new Error('Fallo de inserción simulado'));
            try {
              return await callback(tx);
            } finally {
              create.mockRestore();
            }
          }),
        );
      try {
        await expect(
          inventario.salida({ productoId, cantidad: 8 }, usuarioId),
        ).rejects.toThrow('Fallo de inserción simulado');
      } finally {
        spy.mockRestore();
      }
      expect(await inventario.findExistencia(productoId)).toMatchObject({
        cantidad: 10,
      });
      expect(
        (await inventario.findMovimientosProducto(productoId)).data,
      ).toHaveLength(1);
    });

    it('K: dos salidas simultáneas de 8 con stock 10: una exitosa, una 409', async () => {
      const productoId = await nuevoProducto();
      await inventario.entrada({ productoId, cantidad: 10 }, usuarioId);
      const results = await Promise.allSettled([
        inventario.salida({ productoId, cantidad: 8 }, usuarioId),
        inventario.salida({ productoId, cantidad: 8 }, usuarioId),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r) => r.status === 'rejected');
      expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(
        ConflictException,
      );
      expect(await inventario.findExistencia(productoId)).toMatchObject({
        cantidad: 2,
        stockBajo: true,
      });
      expect(
        (await inventario.findMovimientosProducto(productoId)).data,
      ).toHaveLength(2);
    });

    it('inicializa productos anteriores de forma segura ante primeras entradas simultáneas', async () => {
      const productoId = await nuevoProducto();
      await database.db.orm.public.Existencia.where({ productoId }).delete();
      await expect(inventario.findExistencia(productoId)).rejects.toThrow(
        ConflictException,
      );
      await Promise.all([
        inventario.entrada({ productoId, cantidad: 3 }, usuarioId),
        inventario.entrada({ productoId, cantidad: 4 }, usuarioId),
      ]);
      expect(await inventario.findExistencia(productoId)).toMatchObject({
        cantidad: 7,
      });
      expect(
        await database.db.orm.public.Existencia.where({ productoId }).all(),
      ).toHaveLength(1);
    });

    it('elimina producto sin historial junto con su existencia vacía', async () => {
      const productoId = await nuevoProducto();
      await productos.remove(productoId);
      await expect(inventario.findExistencia(productoId)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        await database.db.orm.public.Existencia.where({ productoId }).first(),
      ).toBeNull();
    });

    it('Producto + Existencia también hacen rollback si falla la existencia inicial', async () => {
      const transaction = database.db.transaction.bind(database.db);
      const spy = vi
        .spyOn(database.db, 'transaction')
        .mockImplementationOnce((callback) =>
          transaction(async (tx) => {
            const create = vi
              .spyOn(tx.orm.public.Existencia, 'create')
              .mockRejectedValueOnce(new Error('Fallo existencia inicial'));
            try {
              return await callback(tx);
            } finally {
              create.mockRestore();
            }
          }),
        );
      try {
        await expect(nuevoProducto()).rejects.toThrow(
          'Fallo existencia inicial',
        );
      } finally {
        spy.mockRestore();
      }
      expect(
        await database.db.orm.public.Producto.where({
          sku: `${prefix}-${ids.length}`,
        }).first(),
      ).toBeNull();
    });
  },
);
