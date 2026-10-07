import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { InventarioService } from '../src/modules/inventario/inventario.service.js';
import { ComprasService } from '../src/modules/compras/compras.service.js';

// PostgreSQL real, fixtures aislados por UUID y limpieza exclusivamente por ID.
describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Compras y proveedores con PostgreSQL real',
  () => {
    let app: INestApplication;
    let database: DatabaseService;
    let productos: ProductosService;
    let inventario: InventarioService;
    let compras: ComprasService;
    let categoriaId: number;
    let usuarioId: number;
    let receptorId: number;
    let rolId: number;
    let token: string;
    let tokenReceptor: string;
    let tokenConsulta: string;
    const productoIds: number[] = [];
    const proveedorIds: number[] = [];
    const compraIds: number[] = [];
    const prefix = `TEST-COMPRAS-${randomUUID()}`.toUpperCase();

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');

      await app.init();
      database = app.get(DatabaseService);
      productos = app.get(ProductosService);
      inventario = app.get(InventarioService);
      compras = app.get(ComprasService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix, activo: true })).id;
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.test`,
          password: 'secreto-no-exponer',
          rolId,
          activo: true,
        })
      ).id;
      receptorId = (
        await orm.Usuario.create({
          nombre: `${prefix}-RECEPTOR`,
          email: `${prefix}-receptor@example.test`,
          password: 'secreto-no-exponer',
          rolId,
          activo: true,
        })
      ).id;
      categoriaId = (
        await orm.Categoria.create({ nombre: prefix, activo: true })
      ).id;
      const jwt = app.get(JwtService);
      token = await jwt.signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      tokenReceptor = await jwt.signAsync({
        sub: receptorId,
        rol: 'ADMINISTRADOR',
      });
      tokenConsulta = await jwt.signAsync({ sub: usuarioId, rol: 'CONSULTA' });
    });

    afterAll(async () => {
      try {
        if (database) {
          await database.db.transaction(async (tx) => {
            for (const auditUserId of [usuarioId, receptorId])
              if (auditUserId)
                await tx.orm.public.Auditoria.where({
                  usuarioId: auditUserId,
                }).deleteAll();
            for (const id of compraIds) {
              await tx.orm.public.DetalleCompra.where({
                compraId: id,
              }).deleteAll();
              await tx.orm.public.Compra.where({ id }).delete();
            }
            for (const id of productoIds) {
              await tx.orm.public.MovimientoInventario.where({
                productoId: id,
              }).deleteAll();
              await tx.orm.public.Existencia.where({ productoId: id }).delete();
              await tx.orm.public.Producto.where({ id }).delete();
            }
            for (const id of proveedorIds)
              await tx.orm.public.Proveedor.where({ id }).delete();
            if (categoriaId)
              await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            for (const id of [usuarioId, receptorId])
              if (id) await tx.orm.public.Usuario.where({ id }).delete();
            if (rolId) await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
        }
      } finally {
        await database?.db.close();
        await app?.close();
      }
    });

    const post = (ruta: string, body: object = {}, auth = token) =>
      request(app.getHttpServer())
        .post(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${auth}`)
        .send(body);
    const patch = (ruta: string, body: object = {}) =>
      request(app.getHttpServer())
        .patch(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const get = (ruta: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${tokenConsulta}`);
    const del = (ruta: string) =>
      request(app.getHttpServer())
        .delete(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`);

    async function proveedor(extra: object = {}) {
      const response = await post('proveedores', {
        nombre: `${prefix}-${proveedorIds.length}`,
        ...extra,
      }).expect(201);
      proveedorIds.push(response.body.id as number);
      return response.body as {
        id: number;
        nombre: string;
        rfc: string | null;
        activo: boolean;
      };
    }
    async function producto() {
      const p = await productos.create({
        sku: `${prefix}-${productoIds.length}`,
        nombre: 'Producto comercial',
        costo: 0,
        precio: 1,
        stockMinimo: 5,
        categoriaId,
      });
      productoIds.push(p.id);
      return p.id;
    }
    async function compra(
      proveedorId: number,
      detalles: {
        productoId: number;
        cantidad: number;
        costoUnitario: number;
      }[],
      extra: object = {},
    ) {
      const response = await post('compras', {
        proveedorId,
        detalles,
        ...extra,
      }).expect(201);
      compraIds.push(response.body.id as number);
      return response.body as {
        id: number;
        folio: string;
        estado: string;
        subtotal: string;
        impuestos: string;
        total: string;
      };
    }
    async function borrador(cantidad = 10) {
      const p = await proveedor();
      const productoId = await producto();
      const c = await compra(p.id, [
        { productoId, cantidad, costoUnitario: 0.1 },
      ]);
      return { ...c, proveedorId: p.id, productoId };
    }
    async function saldo(productoId: number) {
      return (await inventario.findExistencia(productoId)).cantidad;
    }
    async function movimientos(productoId: number) {
      return (await inventario.findMovimientosProducto(productoId)).data;
    }

    it('A, C, D, E, H: crea, edita, desactiva, reactiva y elimina proveedor sin historial', async () => {
      const p = await proveedor({
        razonSocial: 'Comercial SA',
        email: ' VENTAS@example.test ',
        telefono: '123',
      });
      expect((await get(`proveedores/${p.id}`).expect(200)).body).toMatchObject(
        { activo: true, email: 'ventas@example.test' },
      );
      expect(
        (
          await patch(`proveedores/${p.id}`, {
            nombre: 'Editado',
            telefono: '456',
          }).expect(200)
        ).body,
      ).toMatchObject({ nombre: 'Editado', telefono: '456' });
      expect(
        (await patch(`proveedores/${p.id}/desactivar`).expect(200)).body.activo,
      ).toBe(false);
      await patch(`proveedores/${p.id}/desactivar`).expect(409);
      expect(
        (await patch(`proveedores/${p.id}/activar`).expect(200)).body.activo,
      ).toBe(true);
      await patch(`proveedores/${p.id}/activar`).expect(409);
      await del(`proveedores/${p.id}`).expect(200);
      await get(`proveedores/${p.id}`).expect(404);
    });

    it('B: RFC normalizado y UNIQUE bajo creación concurrente', async () => {
      const rfc = `TSE260101${randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase()}`;
      const result = await Promise.all([
        post('proveedores', { nombre: prefix, rfc: rfc.toLowerCase() }),
        post('proveedores', { nombre: prefix, rfc }),
      ]);
      for (const response of result)
        if (response.status === 201)
          proveedorIds.push(response.body.id as number);
      expect(result.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(result.find((r) => r.status === 201)?.body.rfc).toBe(rfc);
      const otro = await proveedor();
      await patch(`proveedores/${otro.id}`, { rfc }).expect(409);
    });

    it('F, G: busca nombre/razón/RFC/email y pagina proveedores', async () => {
      const rfc = `TSE260101${randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase()}`;
      const p = await proveedor({
        razonSocial: `${prefix}-RAZON`,
        rfc,
        email: `${prefix.toLowerCase()}@example.test`,
      });
      await proveedor();
      for (const search of [
        p.nombre.toLowerCase(),
        `${prefix}-RAZON`,
        rfc.toLowerCase(),
        `${prefix.toLowerCase()}@example.test`,
      ]) {
        const result = await get(
          `proveedores?search=${encodeURIComponent(search)}`,
        ).expect(200);
        expect(
          result.body.data.some((row: { id: number }) => row.id === p.id),
        ).toBe(true);
      }
      const result = await get(
        `proveedores?search=${prefix}&page=2&limit=1`,
      ).expect(200);
      expect(result.body.data).toHaveLength(1);
      expect(result.body.pagination).toMatchObject({
        page: 2,
        limit: 1,
        hasPreviousPage: true,
      });
      expect(result.body.pagination.totalPages).toBe(
        result.body.pagination.totalItems,
      );
    });

    it('I, J, K, L: crea BORRADOR con totales exactos, autor JWT y proveedor protegido', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      const c = await compra(
        p.id,
        [
          { productoId: a, cantidad: 10, costoUnitario: 0.1 },
          { productoId: b, cantidad: 5, costoUnitario: 350.5 },
        ],
        { impuestos: 10.5 },
      );
      expect(c).toMatchObject({
        estado: 'BORRADOR',
        subtotal: '1753.50',
        impuestos: '10.50',
        total: '1764.00',
      });
      expect(c.folio).toMatch(/^COMP-\d{4}-[A-F0-9-]{36}$/);
      const result = await get(`compras/${c.id}`).expect(200);
      expect(result.body.creadoPor).toMatchObject({ id: usuarioId });
      expect(result.body.recibidoPor).toBeNull();
      expect(result.body.detalles).toHaveLength(2);
      expect(result.body.detalles[0].producto).toMatchObject({ id: a });
      expect(JSON.stringify(result.body)).not.toContain('password');
      expect(JSON.stringify(result.body)).not.toContain('secreto-no-exponer');
      expect(await saldo(a)).toBe(0);
      await del(`proveedores/${p.id}`).expect(409);
      await del(`productos/${a}`).expect(409);
    });

    it.each([
      'producto inexistente',
      'producto inactivo',
      'proveedor inexistente',
      'proveedor inactivo',
      'producto duplicado',
    ])('M-Q: rechaza %s sin crear compra', async (caso) => {
      const p = await proveedor();
      const productoId = await producto();
      let proveedorId = p.id;
      let itemId = productoId;
      let expected = 409;
      if (caso === 'producto inexistente') {
        itemId = 2147483647;
        expected = 404;
      }
      if (caso === 'proveedor inexistente') {
        proveedorId = 2147483647;
        expected = 404;
      }
      if (caso === 'producto inactivo') await productos.desactivar(productoId);
      if (caso === 'proveedor inactivo')
        await patch(`proveedores/${p.id}/desactivar`).expect(200);
      const detalles = [{ productoId: itemId, cantidad: 10, costoUnitario: 1 }];
      if (caso === 'producto duplicado') {
        detalles.push({ ...detalles[0]! });
        expected = 400;
      }
      await post('compras', { proveedorId, detalles }).expect(expected);
      expect(
        await database.db.orm.public.Compra.where({ proveedorId: p.id }).all(),
      ).toHaveLength(0);
      expect(await saldo(productoId)).toBe(0);
    });

    it('R: edita BORRADOR, reemplaza detalles y recalcula totales sin cambiar folio o autor', async () => {
      const c = await borrador();
      const nuevo = await producto();
      const p = await proveedor();
      const result = await patch(`compras/${c.id}`, {
        proveedorId: p.id,
        observacion: 'Editada',
        impuestos: 0.2,
        detalles: [{ productoId: nuevo, cantidad: 3, costoUnitario: 0.1 }],
      }).expect(200);
      expect(result.body).toMatchObject({
        proveedorId: p.id,
        folio: c.folio,
        estado: 'BORRADOR',
        subtotal: '0.30',
        impuestos: '0.20',
        total: '0.50',
        creadoPor: { id: usuarioId },
      });
      expect(result.body.detalles).toHaveLength(1);
      expect(result.body.detalles[0].productoId).toBe(nuevo);
      const tax = await patch(`compras/${c.id}`, { impuestos: 0.4 }).expect(
        200,
      );
      expect(tax.body.total).toBe('0.70');
      await patch(`compras/${c.id}`, {
        detalles: [
          { productoId: nuevo, cantidad: 1, costoUnitario: 1 },
          { productoId: nuevo, cantidad: 1, costoUnitario: 1 },
        ],
      }).expect(400);
      expect((await get(`compras/${c.id}`).expect(200)).body.total).toBe(
        '0.70',
      );
      expect(await saldo(nuevo)).toBe(0);
    });

    it('U: recibe compra con un producto y segunda recepción devuelve 409 sin duplicar', async () => {
      const c = await borrador(50);
      await post(`compras/${c.id}/recibir`, {}, tokenReceptor).expect(201);
      await post(`compras/${c.id}/recibir`).expect(409);
      expect(await saldo(c.productoId)).toBe(50);
      const rows = await movimientos(c.productoId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tipo: 'ENTRADA',
        cantidad: 50,
        stockAnterior: 0,
        stockNuevo: 50,
        usuarioId: receptorId,
        observacion: `Entrada por compra ${c.folio}`,
      });
    });

    it('V-AD, S, AN, AQ, AX, AY: recepción múltiple atómica, auditoría, Kardex y restricciones', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      await inventario.entrada({ productoId: a, cantidad: 7 }, usuarioId);
      const c = await compra(p.id, [
        { productoId: b, cantidad: 20, costoUnitario: 2 },
        { productoId: a, cantidad: 50, costoUnitario: 1 },
      ]);
      const result = await post(
        `compras/${c.id}/recibir`,
        {},
        tokenReceptor,
      ).expect(201);
      expect(result.body).toMatchObject({
        estado: 'RECIBIDA',
        recibidaPorUsuarioId: receptorId,
        recibidoPor: { id: receptorId },
        creadoPor: { id: usuarioId },
      });
      expect(
        Number.isNaN(Date.parse(result.body.fechaRecepcion as string)),
      ).toBe(false);
      expect(await saldo(a)).toBe(57);
      expect(await saldo(b)).toBe(20);
      expect((await movimientos(a))[0]).toMatchObject({
        stockAnterior: 7,
        stockNuevo: 57,
        cantidad: 50,
        usuarioId: receptorId,
      });
      expect((await movimientos(b))[0]).toMatchObject({
        stockAnterior: 0,
        stockNuevo: 20,
        cantidad: 20,
        tipo: 'ENTRADA',
      });
      const kardex = await get(`inventario/kardex/${a}`).expect(200);
      expect(kardex.body.producto.stockActual).toBe(57);
      expect(kardex.body.data[0].observacion).toBe(
        `Entrada por compra ${c.folio}`,
      );
      expect(JSON.stringify(kardex.body)).not.toContain('password');
      await patch(`compras/${c.id}`, { observacion: 'No permitido' }).expect(
        409,
      );
      await post(`compras/${c.id}/cancelar`).expect(409);
      await del(`compras/${c.id}`).expect(409);
      await del(`productos/${a}`).expect(409);
      await post(`compras/${c.id}/recibir`).expect(409);
      expect(await saldo(a)).toBe(57);
      expect(await saldo(b)).toBe(20);
      expect(await movimientos(a)).toHaveLength(2);
      expect(await movimientos(b)).toHaveLength(1);
    });

    it('AE-AH: falla el último producto por overflow y revierte stock, movimientos y estado', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      const c = await compra(p.id, [
        { productoId: a, cantidad: 50, costoUnitario: 1 },
        { productoId: b, cantidad: 20, costoUnitario: 1 },
      ]);
      await inventario.entrada(
        { productoId: b, cantidad: 2147483647 },
        usuarioId,
      );
      await post(`compras/${c.id}/recibir`).expect(409);
      expect(await saldo(a)).toBe(0);
      expect(await saldo(b)).toBe(2147483647);
      expect(await movimientos(a)).toHaveLength(0);
      expect(await movimientos(b)).toHaveLength(1);
      expect((await get(`compras/${c.id}`).expect(200)).body).toMatchObject({
        estado: 'BORRADOR',
        fechaRecepcion: null,
        recibidaPorUsuarioId: null,
      });
    });

    it('revierte también cuando falla la inserción del segundo MovimientoInventario', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      const c = await compra(p.id, [
        { productoId: a, cantidad: 10, costoUnitario: 1 },
        { productoId: b, cantidad: 5, costoUnitario: 1 },
      ]);
      const original = inventario.entradaEnTransaccion.bind(inventario);
      const spy = vi.spyOn(inventario, 'entradaEnTransaccion');
      spy
        .mockImplementationOnce(original)
        .mockImplementationOnce(async (tx, dto, user) => {
          const insert = vi
            .spyOn(tx.orm.public.MovimientoInventario, 'create')
            .mockRejectedValueOnce(new Error('Fallo movimiento compra'));
          try {
            return await original(tx, dto, user);
          } finally {
            insert.mockRestore();
          }
        });
      try {
        await expect(compras.recibir(c.id, receptorId)).rejects.toThrow(
          'Fallo movimiento compra',
        );
      } finally {
        spy.mockRestore();
      }
      expect(await saldo(a)).toBe(0);
      expect(await saldo(b)).toBe(0);
      expect(await movimientos(a)).toHaveLength(0);
      expect(await movimientos(b)).toHaveLength(0);
      expect((await get(`compras/${c.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
    });

    it('AL: dos requests HTTP simultáneos reciben exactamente una vez', async () => {
      const c = await borrador(50);
      const responses = await Promise.all([
        post(`compras/${c.id}/recibir`),
        post(`compras/${c.id}/recibir`, {}, tokenReceptor),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await saldo(c.productoId)).toBe(50);
      expect(await movimientos(c.productoId)).toHaveLength(1);
      expect((await get(`compras/${c.id}`).expect(200)).body.estado).toBe(
        'RECIBIDA',
      );
    });

    it('compras distintas con productos en orden inverso se reciben sin deadlock', async () => {
      const p = await proveedor();
      const otro = await proveedor();
      const a = await producto();
      const b = await producto();
      const c1 = await compra(p.id, [
        { productoId: a, cantidad: 10, costoUnitario: 1 },
        { productoId: b, cantidad: 20, costoUnitario: 1 },
      ]);
      const c2 = await compra(otro.id, [
        { productoId: b, cantidad: 3, costoUnitario: 1 },
        { productoId: a, cantidad: 4, costoUnitario: 1 },
      ]);
      await Promise.all([
        post(`compras/${c1.id}/recibir`).expect(201),
        post(`compras/${c2.id}/recibir`).expect(201),
      ]);
      expect(await saldo(a)).toBe(14);
      expect(await saldo(b)).toBe(23);
    });

    it('T, AM, AO, AR: cancelar conserva historial, no stock y bloquea edición/recepción/DELETE', async () => {
      const c = await borrador();
      expect(
        (await post(`compras/${c.id}/cancelar`).expect(201)).body.estado,
      ).toBe('CANCELADA');
      await post(`compras/${c.id}/cancelar`).expect(409);
      await post(`compras/${c.id}/recibir`).expect(409);
      await patch(`compras/${c.id}`, { impuestos: 2 }).expect(409);
      await del(`compras/${c.id}`).expect(409);
      await del(`proveedores/${c.proveedorId}`).expect(409);
      expect(await saldo(c.productoId)).toBe(0);
      expect(await movimientos(c.productoId)).toHaveLength(0);
    });

    it('AP: elimina BORRADOR con sus detalles y permite eliminar proveedor', async () => {
      const c = await borrador();
      await del(`compras/${c.id}`).expect(200);
      await get(`compras/${c.id}`).expect(404);
      expect(
        await database.db.orm.public.DetalleCompra.where({
          compraId: c.id,
        }).all(),
      ).toHaveLength(0);
      await del(`proveedores/${c.proveedorId}`).expect(200);
      expect(await saldo(c.productoId)).toBe(0);
    });

    it('compras filtra, pagina, busca folio/proveedor y ordena de forma segura', async () => {
      const c = await borrador();
      const c2 = await compra(c.proveedorId, [
        { productoId: c.productoId, cantidad: 2, costoUnitario: 100 },
      ]);
      await post(`compras/${c2.id}/cancelar`).expect(201);
      const result = await get(
        `compras?proveedorId=${c.proveedorId}&page=1&limit=1&sortBy=total&sortOrder=asc`,
      ).expect(200);
      expect(result.body.pagination).toEqual({
        page: 1,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(result.body.data[0].id).toBe(c.id);
      expect(
        (
          await get(
            `compras?proveedorId=${c.proveedorId}&estado=CANCELADA`,
          ).expect(200)
        ).body.data,
      ).toHaveLength(1);
      expect(
        (await get(`compras?search=${c.folio.toLowerCase()}`).expect(200)).body
          .data[0].id,
      ).toBe(c.id);
      expect(
        (
          await get(
            `compras?search=${prefix.toLowerCase()}&proveedorId=${c.proveedorId}`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(2);
      expect(
        (
          await get(
            `compras?proveedorId=${c.proveedorId}&fechaFin=2000-01-01`,
          ).expect(200)
        ).body.data,
      ).toEqual([]);
      const global = await get('compras').expect(200);
      expect(global.body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(global.body.data.length).toBeLessThanOrEqual(20);
      expect(
        global.body.data.map((r: { createdAt: string }) => r.createdAt),
      ).toEqual(
        global.body.data
          .map((r: { createdAt: string }) => r.createdAt)
          .sort()
          .reverse(),
      );
    });

    it.each([
      'limit=101',
      'page=0',
      'sortBy=password',
      'estado=OTRO',
      'fechaInicio=2026-10-01&fechaFin=2026-09-01',
      'fechaFin=2026-02-30',
    ])('rechaza query inválida %s', async (q) => {
      await get(`compras?${q}`).expect(400);
    });

    it('AS, AT: JWT obligatorio y ADMINISTRADOR en todas las mutaciones', async () => {
      for (const ruta of [
        'proveedores',
        'proveedores/1',
        'compras',
        'compras/1',
      ])
        await request(app.getHttpServer()).get(`/api/v1/${ruta}`).expect(401);
      for (const ruta of [
        'proveedores',
        'compras',
        'compras/1/recibir',
        'compras/1/cancelar',
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/${ruta}`)
          .send({})
          .expect(401);
        await post(ruta, {}, tokenConsulta).expect(403);
      }
      for (const ruta of [
        'proveedores/1',
        'proveedores/1/activar',
        'proveedores/1/desactivar',
        'compras/1',
      ]) {
        await request(app.getHttpServer())
          .patch(`/api/v1/${ruta}`)
          .send({})
          .expect(401);
        await request(app.getHttpServer())
          .patch(`/api/v1/${ruta}`)
          .set('Authorization', `Bearer ${tokenConsulta}`)
          .send({})
          .expect(403);
      }
      for (const ruta of ['proveedores/1', 'compras/1']) {
        await request(app.getHttpServer())
          .delete(`/api/v1/${ruta}`)
          .expect(401);
        await request(app.getHttpServer())
          .delete(`/api/v1/${ruta}`)
          .set('Authorization', `Bearer ${tokenConsulta}`)
          .expect(403);
      }
    });

    it('AU-AW: ENTRADA/SALIDA/AJUSTE manuales conservan semántica después de una compra', async () => {
      const c = await borrador(50);
      await post(`compras/${c.id}/recibir`).expect(201);
      await post('inventario/movimientos/entrada', {
        productoId: c.productoId,
        cantidad: 10,
      }).expect(201);
      await post('inventario/movimientos/salida', {
        productoId: c.productoId,
        cantidad: 8,
      }).expect(201);
      const ajuste = await post('inventario/movimientos/ajuste', {
        productoId: c.productoId,
        nuevaCantidad: 45,
      }).expect(201);
      expect(ajuste.body).toMatchObject({
        cantidad: -7,
        stockAnterior: 52,
        stockNuevo: 45,
      });
      expect(await saldo(c.productoId)).toBe(45);
      expect(await movimientos(c.productoId)).toHaveLength(4);
    });

    it('compra que contiene un producto desactivado después de crear revierte recepción completa', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      const c = await compra(p.id, [
        { productoId: a, cantidad: 10, costoUnitario: 1 },
        { productoId: b, cantidad: 5, costoUnitario: 1 },
      ]);
      await productos.desactivar(b);
      await expect(compras.recibir(c.id, receptorId)).rejects.toThrow(
        ConflictException,
      );
      expect(await saldo(a)).toBe(0);
      expect(await movimientos(a)).toHaveLength(0);
      expect((await get(`compras/${c.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
    });
    it('flujo real: stock 0 → 50/20, recepción única y sin movimientos duplicados', async () => {
      const p = await proveedor();
      const a = await producto();
      const b = await producto();
      const c = await compra(p.id, [
        { productoId: a, cantidad: 50, costoUnitario: 12000 },
        { productoId: b, cantidad: 20, costoUnitario: 350.5 },
      ]);
      expect(await saldo(a)).toBe(0);
      expect(await saldo(b)).toBe(0);
      await post(`compras/${c.id}/recibir`).expect(201);
      await post(`compras/${c.id}/recibir`).expect(409);
      expect(await saldo(a)).toBe(50);
      expect(await saldo(b)).toBe(20);
      expect(await movimientos(a)).toHaveLength(1);
      expect(await movimientos(b)).toHaveLength(1);
    });

    it('recepción y cancelación concurrentes producen una sola transición', async () => {
      const c = await borrador();
      const responses = await Promise.all([
        post(`compras/${c.id}/recibir`),
        post(`compras/${c.id}/cancelar`),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const result = await get(`compras/${c.id}`).expect(200);
      const recibida = result.body.estado === 'RECIBIDA';
      expect(['RECIBIDA', 'CANCELADA']).toContain(result.body.estado);
      expect(await saldo(c.productoId)).toBe(recibida ? 10 : 0);
      expect(await movimientos(c.productoId)).toHaveLength(recibida ? 1 : 0);
    });

    it('recibir/cancelar rechazan cantidades y autoría enviadas en body', async () => {
      const c = await borrador();
      await post(`compras/${c.id}/recibir`, {
        cantidad: 999,
        recibidaPorUsuarioId: receptorId,
      }).expect(400);
      await post(`compras/${c.id}/cancelar`, { estado: 'RECIBIDA' }).expect(
        400,
      );
      expect((await get(`compras/${c.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
      expect(await saldo(c.productoId)).toBe(0);
    });

    it('fechas de compras incluyen día UTC completo y respetan offsets', async () => {
      const c = await borrador();
      await database.db.orm.public.Compra.where({ id: c.id }).update({
        createdAt: '2026-09-30T23:59:59.999Z',
      });
      const ruta = `compras?proveedorId=${c.proveedorId}`;
      expect(
        (
          await get(
            `${ruta}&fechaInicio=2026-09-30&fechaFin=2026-09-30`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(1);
      expect(
        (await get(`${ruta}&fechaInicio=2026-10-01`).expect(200)).body
          .pagination.totalItems,
      ).toBe(0);
      expect(
        (
          await get(
            `${ruta}&fechaFin=${encodeURIComponent('2026-09-30T17:59:59.999-06:00')}`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(1);
    });

    it('PATCH de proveedor vacío es un no-op y 404 es semántico en mutaciones', async () => {
      const p = await proveedor();
      expect(
        (await patch(`proveedores/${p.id}`, {}).expect(200)).body.nombre,
      ).toBe(p.nombre);
      await patch('proveedores/2147483647', { nombre: 'Ausente' }).expect(404);
      await del('proveedores/2147483647').expect(404);
      await patch('compras/2147483647', { observacion: 'Ausente' }).expect(404);
      await post('compras/2147483647/recibir').expect(404);
      await post('compras/2147483647/cancelar').expect(404);
      await del('compras/2147483647').expect(404);
    });
  },
);
