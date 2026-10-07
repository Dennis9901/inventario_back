import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { InventarioService } from '../src/modules/inventario/inventario.service.js';
import { VentasService } from '../src/modules/ventas/ventas.service.js';

// Fixtures propios, PostgreSQL real y limpieza por ID. No toca datos ajenos.
describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Ventas/clientes con PostgreSQL real',
  () => {
    let app: INestApplication;
    let database: DatabaseService;
    let productos: ProductosService;
    let inventario: InventarioService;
    let ventas: VentasService;
    let usuarioId: number;
    let confirmadorId: number;
    let rolId: number;
    let categoriaId: number;
    let token: string;
    let tokenConfirmador: string;
    let tokenConsulta: string;
    const productoIds: number[] = [];
    const clienteIds: number[] = [];
    const ventaIds: number[] = [];
    const compraIds: number[] = [];
    const proveedorIds: number[] = [];
    const prefix = `TEST-VENTAS-${randomUUID()}`.toUpperCase();

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
      ventas = app.get(VentasService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix, activo: true })).id;
      const password = await argon2.hash('VentasPrueba123!');
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix.toLowerCase()}@example.test`,
          password,
          rolId,
          activo: true,
        })
      ).id;
      confirmadorId = (
        await orm.Usuario.create({
          nombre: `${prefix}-CONFIRMADOR`,
          email: `${prefix.toLowerCase()}-confirmador@example.test`,
          password,
          rolId,
          activo: true,
        })
      ).id;
      categoriaId = (
        await orm.Categoria.create({ nombre: prefix, activo: true })
      ).id;
      const jwt = app.get(JwtService);
      token = await jwt.signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      tokenConfirmador = await jwt.signAsync({
        sub: confirmadorId,
        rol: 'ADMINISTRADOR',
      });
      tokenConsulta = await jwt.signAsync({ sub: usuarioId, rol: 'CONSULTA' });
    });

    afterAll(async () => {
      try {
        if (database) {
          await database.db.transaction(async (tx) => {
            for (const auditUserId of [usuarioId, confirmadorId])
              if (auditUserId)
                await tx.orm.public.Auditoria.where({
                  usuarioId: auditUserId,
                }).deleteAll();
            for (const id of ventaIds) {
              await tx.orm.public.DetalleVenta.where({
                ventaId: id,
              }).deleteAll();
              await tx.orm.public.Venta.where({ id }).delete();
            }
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
            for (const id of clienteIds)
              await tx.orm.public.Cliente.where({ id }).delete();
            for (const id of proveedorIds)
              await tx.orm.public.Proveedor.where({ id }).delete();
            if (categoriaId)
              await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            for (const id of [usuarioId, confirmadorId])
              if (id) await tx.orm.public.Usuario.where({ id }).delete();
            if (rolId) await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
          // Comprueba la limpieza real, incluyendo movimientos y detalles propios.
          if (productoIds.length) {
            expect(
              await database.db.orm.public.Producto.where((p) =>
                p.id.in(productoIds),
              ).all(),
            ).toEqual([]);
            expect(
              await database.db.orm.public.MovimientoInventario.where((m) =>
                m.productoId.in(productoIds),
              ).all(),
            ).toEqual([]);
            expect(
              await database.db.orm.public.Existencia.where((e) =>
                e.productoId.in(productoIds),
              ).all(),
            ).toEqual([]);
          }
          if (clienteIds.length)
            expect(
              await database.db.orm.public.Cliente.where((c) =>
                c.id.in(clienteIds),
              ).all(),
            ).toEqual([]);
          if (ventaIds.length) {
            expect(
              await database.db.orm.public.Venta.where((v) =>
                v.id.in(ventaIds),
              ).all(),
            ).toEqual([]);
            expect(
              await database.db.orm.public.DetalleVenta.where((d) =>
                d.ventaId.in(ventaIds),
              ).all(),
            ).toEqual([]);
          }
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

    async function cliente(extra: object = {}) {
      const result = await post('clientes', {
        nombre: `${prefix}-${clienteIds.length}`,
        ...extra,
      }).expect(201);
      clienteIds.push(result.body.id as number);
      return result.body as { id: number; nombre: string; rfc: string | null };
    }
    async function producto(stock = 0, precio = 150, costo = 100) {
      const p = await productos.create({
        sku: `${prefix}-${productoIds.length}`,
        nombre: 'Producto venta',
        costo,
        precio,
        stockMinimo: 5,
        categoriaId,
      });
      productoIds.push(p.id);
      if (stock)
        await inventario.entrada(
          { productoId: p.id, cantidad: stock },
          usuarioId,
        );
      return p.id;
    }
    async function venta(
      clienteId: number,
      detalles: { productoId: number; cantidad: number }[],
      extra: object = {},
    ) {
      const result = await post('ventas', {
        clienteId,
        detalles,
        ...extra,
      }).expect(201);
      ventaIds.push(result.body.id as number);
      return result.body as { id: number; folio: string; estado: string };
    }
    async function borrador(stock = 10, cantidad = 2) {
      const c = await cliente();
      const productoId = await producto(stock);
      const v = await venta(c.id, [{ productoId, cantidad }]);
      return { ...v, clienteId: c.id, productoId };
    }
    const saldo = async (productoId: number) =>
      (await inventario.findExistencia(productoId)).cantidad;
    const movimientos = async (productoId: number) =>
      (await inventario.findMovimientosProducto(productoId)).data;
    const salidas = async (productoId: number) =>
      (await movimientos(productoId)).filter((m) => m.tipo === 'SALIDA');
    const rfcNuevo = () =>
      `TSE${String(parseInt(randomUUID().slice(0, 8), 16) % 1000000).padStart(6, '0')}${randomUUID().slice(0, 3).toUpperCase()}`;

    it('A/B/E/F/I: CRUD cliente, normalización, baja/reactivación y DELETE sin ventas', async () => {
      const c = await cliente({
        apellido: 'Pérez',
        email: ' JUAN@example.test ',
        telefono: '123',
      });
      expect((await get(`clientes/${c.id}`).expect(200)).body).toMatchObject({
        activo: true,
        email: 'juan@example.test',
        apellido: 'Pérez',
      });
      expect(
        (
          await patch(`clientes/${c.id}`, {
            nombre: 'Juan',
            telefono: '456',
          }).expect(200)
        ).body,
      ).toMatchObject({ nombre: 'Juan', telefono: '456' });
      await patch(`clientes/${c.id}/desactivar`).expect(200);
      await patch(`clientes/${c.id}/desactivar`).expect(409);
      await patch(`clientes/${c.id}/activar`).expect(200);
      await patch(`clientes/${c.id}/activar`).expect(409);
      await patch(`clientes/${c.id}`, {}).expect(200);
      await del(`clientes/${c.id}`).expect(200);
      await get(`clientes/${c.id}`).expect(404);
    });

    it('C/D: RFC UNIQUE incluso concurrente; email inválido rechazado', async () => {
      const rfc = rfcNuevo();
      const responses = await Promise.all([
        post('clientes', { nombre: prefix, rfc }),
        post('clientes', { nombre: prefix, rfc: rfc.toLowerCase() }),
      ]);
      for (const response of responses)
        if (response.status === 201)
          clienteIds.push(response.body.id as number);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const c = await cliente();
      await patch(`clientes/${c.id}`, { rfc }).expect(409);
      await post('clientes', { nombre: prefix, email: 'invalido' }).expect(400);
    });

    it('G/H: búsqueda por todos los campos y paginación de clientes', async () => {
      const rfc = rfcNuevo();
      const c = await cliente({
        apellido: `${prefix}-APELLIDO`,
        razonSocial: `${prefix}-RAZON`,
        rfc,
        email: `${prefix.toLowerCase()}@example.test`,
        telefono: `TEL-${prefix.slice(-36)}`,
      });
      await cliente();
      for (const search of [
        c.nombre.toLowerCase(),
        `${prefix}-APELLIDO`,
        `${prefix}-RAZON`,
        rfc.toLowerCase(),
        `${prefix.toLowerCase()}@example.test`,
        `TEL-${prefix.slice(-36)}`,
      ]) {
        const result = await get(
          `clientes?search=${encodeURIComponent(search)}`,
        ).expect(200);
        expect(
          result.body.data.some((row: { id: number }) => row.id === c.id),
        ).toBe(true);
      }
      const result = await get(
        `clientes?search=${prefix}&page=2&limit=1`,
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

    it('J-M/U-Z: BORRADOR guarda snapshots y dinero exacto sin stock ni movimientos', async () => {
      const c = await cliente();
      const p = await producto(0, 0.1, 0.06);
      const v = await venta(c.id, [{ productoId: p, cantidad: 3 }], {
        impuestos: 0.2,
      });
      expect(v.folio).toMatch(/^VENT-\d{4}-[A-F0-9-]{36}$/);
      const result = await get(`ventas/${v.id}`).expect(200);
      expect(result.body).toMatchObject({
        estado: 'BORRADOR',
        subtotal: '0.30',
        impuestos: '0.20',
        total: '0.50',
        costoTotal: '0.18',
        utilidad: '0.12',
        creadoPor: { id: usuarioId },
        confirmadoPor: null,
        fechaConfirmacion: null,
      });
      expect(result.body.detalles[0]).toMatchObject({
        cantidad: 3,
        precioUnitario: '0.10',
        costoUnitario: '0.06',
        subtotal: '0.30',
        costoSubtotal: '0.18',
      });
      expect(await saldo(p)).toBe(0);
      expect(await movimientos(p)).toEqual([]);
      await del(`clientes/${c.id}`).expect(409);
      await del(`productos/${p}`).expect(409);
      for (const secret of ['password', 'hash', 'access_token'])
        expect(JSON.stringify(result.body)).not.toContain(secret);
    });

    it.each([
      'cliente inexistente',
      'cliente inactivo',
      'producto inexistente',
      'producto inactivo',
      'cantidad cero',
      'cantidad negativa',
      'producto duplicado',
    ])('N-T: creación rechaza %s', async (caso) => {
      const c = await cliente();
      const p = await producto();
      let clienteId = c.id;
      let productoId = p;
      let cantidad = 1;
      let expected = 400;
      if (caso === 'cliente inexistente') {
        clienteId = 2147483647;
        expected = 404;
      }
      if (caso === 'producto inexistente') {
        productoId = 2147483647;
        expected = 404;
      }
      if (caso === 'cliente inactivo') {
        await patch(`clientes/${c.id}/desactivar`).expect(200);
        expected = 409;
      }
      if (caso === 'producto inactivo') {
        await productos.desactivar(p);
        expected = 409;
      }
      if (caso === 'cantidad cero') cantidad = 0;
      if (caso === 'cantidad negativa') cantidad = -1;
      const detalles = [{ productoId, cantidad }];
      if (caso === 'producto duplicado') detalles.push({ ...detalles[0]! });
      await post('ventas', { clienteId, detalles }).expect(expected);
      expect(
        await database.db.orm.public.Venta.where({ clienteId: c.id }).all(),
      ).toEqual([]);
      expect(await movimientos(p)).toEqual([]);
    });

    it('AA/AD/AE: PATCH preserva snapshot e ID de detalle idéntico, actualiza modificados/nuevos', async () => {
      const c = await cliente();
      const a = await producto(0, 100, 60);
      const b = await producto(0, 200, 120);
      const v = await venta(c.id, [
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 1 },
      ]);
      const anterior = (await get(`ventas/${v.id}`).expect(200)).body;
      await productos.update(a, { precio: 150, costo: 80 });
      await productos.update(b, { precio: 300, costo: 180 });
      const soloCabecera = await patch(`ventas/${v.id}`, {
        observacion: 'Editada',
        impuestos: 10,
      }).expect(200);
      expect(soloCabecera.body.detalles).toEqual(anterior.detalles);
      const nuevo = await producto(0, 50, 20);
      const result = await patch(`ventas/${v.id}`, {
        detalles: [
          { productoId: a, cantidad: 2 },
          { productoId: b, cantidad: 3 },
          { productoId: nuevo, cantidad: 1 },
        ],
      }).expect(200);
      const da = result.body.detalles.find(
        (d: { productoId: number }) => d.productoId === a,
      );
      const db = result.body.detalles.find(
        (d: { productoId: number }) => d.productoId === b,
      );
      const dn = result.body.detalles.find(
        (d: { productoId: number }) => d.productoId === nuevo,
      );
      expect(da).toEqual(anterior.detalles[0]);
      expect(db).toMatchObject({
        precioUnitario: '300.00',
        costoUnitario: '180.00',
        cantidad: 3,
      });
      expect(dn).toMatchObject({
        precioUnitario: '50.00',
        costoUnitario: '20.00',
      });
      expect(result.body).toMatchObject({
        subtotal: '1150.00',
        impuestos: '10.00',
        total: '1160.00',
        costoTotal: '680.00',
        utilidad: '470.00',
        folio: v.folio,
      });
      const parcial = await patch(`ventas/${v.id}`, {
        detalles: [{ productoId: a, cantidad: 2 }],
      }).expect(200);
      expect(parcial.body.detalles).toEqual([anterior.detalles[0]]);
      await patch(`ventas/${v.id}`, {
        detalles: [
          { productoId: a, cantidad: 1 },
          { productoId: a, cantidad: 2 },
        ],
      }).expect(400);
      expect((await get(`ventas/${v.id}`).expect(200)).body.subtotal).toBe(
        '200.00',
      );
      expect(await saldo(a)).toBe(0);
    });

    it('snapshot histórico sobrevive cambio de catálogo y nueva venta toma precios actuales', async () => {
      const c = await cliente();
      const p = await producto(10, 100, 60);
      const a = await venta(c.id, [{ productoId: p, cantidad: 1 }]);
      await productos.update(p, { precio: 150, costo: 80 });
      await post(`ventas/${a.id}/confirmar`).expect(201);
      const result = await get(`ventas/${a.id}`).expect(200);
      expect(result.body.detalles[0]).toMatchObject({
        precioUnitario: '100.00',
        costoUnitario: '60.00',
      });
      expect(result.body.utilidad).toBe('40.00');
      const b = await venta(c.id, [{ productoId: p, cantidad: 1 }]);
      expect(
        (await get(`ventas/${b.id}`).expect(200)).body.detalles[0],
      ).toMatchObject({ precioUnitario: '150.00', costoUnitario: '80.00' });
    });

    it('AF-AN/AU-AX: confirmar genera SALIDA auditada, transición y no duplica', async () => {
      const v = await borrador(10, 2);
      const inicio = Date.now();
      const result = await post(
        `ventas/${v.id}/confirmar`,
        {},
        tokenConfirmador,
      ).expect(201);
      expect(result.body).toMatchObject({
        estado: 'CONFIRMADA',
        confirmadaPorUsuarioId: confirmadorId,
        confirmadoPor: { id: confirmadorId },
        creadoPor: { id: usuarioId },
      });
      expect(
        Date.parse(result.body.fechaConfirmacion as string),
      ).toBeGreaterThanOrEqual(inicio);
      expect(
        Date.parse(result.body.fechaConfirmacion as string),
      ).toBeLessThanOrEqual(Date.now());
      expect(await saldo(v.productoId)).toBe(8);
      expect(await salidas(v.productoId)).toHaveLength(1);
      expect((await salidas(v.productoId))[0]).toMatchObject({
        tipo: 'SALIDA',
        cantidad: 2,
        stockAnterior: 10,
        stockNuevo: 8,
        usuarioId: confirmadorId,
        observacion: `Salida por venta ${v.folio}`,
      });
      await post(`ventas/${v.id}/confirmar`).expect(409);
      expect(await saldo(v.productoId)).toBe(8);
      expect(await salidas(v.productoId)).toHaveLength(1);
      await patch(`ventas/${v.id}`, { impuestos: 1 }).expect(409);
      await post(`ventas/${v.id}/cancelar`).expect(409);
      await del(`ventas/${v.id}`).expect(409);
      await del(`productos/${v.productoId}`).expect(409);
      expect(await salidas(v.productoId)).toHaveLength(1);
    });

    it('AO/AP: confirmar múltiples productos produce todas las SALIDAS', async () => {
      const c = await cliente();
      const a = await producto(10);
      const b = await producto(20);
      const v = await venta(c.id, [
        { productoId: b, cantidad: 4 },
        { productoId: a, cantidad: 2 },
      ]);
      await post(`ventas/${v.id}/confirmar`).expect(201);
      expect(await saldo(a)).toBe(8);
      expect(await saldo(b)).toBe(16);
      expect(await salidas(a)).toHaveLength(1);
      expect(await salidas(b)).toHaveLength(1);
    });

    it('AQ-AT: último producto insuficiente revierte TODO stock y movimientos', async () => {
      const c = await cliente();
      const a = await producto(2);
      const b = await producto(10);
      const cc = await producto(1);
      const v = await venta(c.id, [
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 4 },
        { productoId: cc, cantidad: 3 },
      ]);
      await post(`ventas/${v.id}/confirmar`).expect(409);
      expect(await saldo(a)).toBe(2);
      expect(await saldo(b)).toBe(10);
      expect(await saldo(cc)).toBe(1);
      for (const p of [a, b, cc]) expect(await salidas(p)).toEqual([]);
      expect((await get(`ventas/${v.id}`).expect(200)).body).toMatchObject({
        estado: 'BORRADOR',
        fechaConfirmacion: null,
        confirmadaPorUsuarioId: null,
      });
    });

    it('stock 5, venta 8: 409 sin salida ni cambio de estado', async () => {
      const v = await borrador(5, 8);
      await post(`ventas/${v.id}/confirmar`).expect(409);
      expect(await saldo(v.productoId)).toBe(5);
      expect(await salidas(v.productoId)).toEqual([]);
      expect((await get(`ventas/${v.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
    });

    it('rollback también ante falla de inserción del segundo movimiento', async () => {
      const c = await cliente();
      const a = await producto(10);
      const b = await producto(20);
      const v = await venta(c.id, [
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 4 },
      ]);
      const original = inventario.salidaEnTransaccion.bind(inventario);
      const spy = vi.spyOn(inventario, 'salidaEnTransaccion');
      spy
        .mockImplementationOnce(original)
        .mockImplementationOnce(async (tx, dto, usuario) => {
          const insert = vi
            .spyOn(tx.orm.public.MovimientoInventario, 'create')
            .mockRejectedValueOnce(new Error('Fallo salida venta'));
          try {
            return await original(tx, dto, usuario);
          } finally {
            insert.mockRestore();
          }
        });
      try {
        await expect(ventas.confirmar(v.id, confirmadorId)).rejects.toThrow(
          'Fallo salida venta',
        );
      } finally {
        spy.mockRestore();
      }
      expect(await saldo(a)).toBe(10);
      expect(await saldo(b)).toBe(20);
      expect(await salidas(a)).toEqual([]);
      expect(await salidas(b)).toEqual([]);
      expect((await get(`ventas/${v.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
    });

    it('dos ventas concurrentes 7+7 con stock 10: una confirma y stock final 3', async () => {
      const c = await cliente();
      const otro = await cliente();
      const p = await producto(10);
      const a = await venta(c.id, [{ productoId: p, cantidad: 7 }]);
      const b = await venta(otro.id, [{ productoId: p, cantidad: 7 }]);
      const result = await Promise.all([
        post(`ventas/${a.id}/confirmar`),
        post(`ventas/${b.id}/confirmar`),
      ]);
      expect(result.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await saldo(p)).toBe(3);
      expect(await salidas(p)).toHaveLength(1);
      expect((await salidas(p))[0]).toMatchObject({
        cantidad: 7,
        stockAnterior: 10,
        stockNuevo: 3,
      });
      const estados = [
        (await get(`ventas/${a.id}`).expect(200)).body.estado,
        (await get(`ventas/${b.id}`).expect(200)).body.estado,
      ];
      expect(
        estados.sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual(['BORRADOR', 'CONFIRMADA']);
    });

    it('dos confirmaciones concurrentes de misma venta descuentan una sola vez', async () => {
      const v = await borrador(10, 7);
      const result = await Promise.all([
        post(`ventas/${v.id}/confirmar`),
        post(`ventas/${v.id}/confirmar`, {}, tokenConfirmador),
      ]);
      expect(result.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await saldo(v.productoId)).toBe(3);
      expect(await salidas(v.productoId)).toHaveLength(1);
    });

    it('orden inverso de productos en ventas concurrentes evita deadlock', async () => {
      const c = await cliente();
      const otro = await cliente();
      const a = await producto(20);
      const b = await producto(20);
      const va = await venta(c.id, [
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 4 },
      ]);
      const vb = await venta(otro.id, [
        { productoId: b, cantidad: 3 },
        { productoId: a, cantidad: 5 },
      ]);
      await Promise.all([
        post(`ventas/${va.id}/confirmar`).expect(201),
        post(`ventas/${vb.id}/confirmar`).expect(201),
      ]);
      expect(await saldo(a)).toBe(13);
      expect(await saldo(b)).toBe(13);
      expect(await salidas(a)).toHaveLength(2);
      expect(await salidas(b)).toHaveLength(2);
    });

    it('recepción y confirmación concurrentes con productos inversos conservan el balance', async () => {
      const c = await cliente();
      const a = await producto(10);
      const b = await producto(10);
      const proveedor = await post('proveedores', { nombre: prefix }).expect(
        201,
      );
      proveedorIds.push(proveedor.body.id as number);
      const compra = await post('compras', {
        proveedorId: proveedor.body.id,
        detalles: [
          { productoId: b, cantidad: 4, costoUnitario: 100 },
          { productoId: a, cantidad: 3, costoUnitario: 100 },
        ],
      }).expect(201);
      compraIds.push(compra.body.id as number);
      const v = await venta(c.id, [
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 5 },
      ]);
      await Promise.all([
        post(`compras/${compra.body.id}/recibir`).expect(201),
        post(`ventas/${v.id}/confirmar`).expect(201),
      ]);
      expect(await saldo(a)).toBe(11);
      expect(await saldo(b)).toBe(9);
      for (const id of [a, b]) {
        const historia = (await movimientos(id)).sort((x, y) => x.id - y.id);
        expect(historia).toHaveLength(3);
        let anterior = 0;
        for (const movimiento of historia) {
          expect(movimiento.stockAnterior).toBe(anterior);
          expect(movimiento.stockNuevo).toBe(
            anterior +
              (movimiento.tipo === 'SALIDA' ? -1 : 1) * movimiento.cantidad,
          );
          anterior = movimiento.stockNuevo;
        }
        expect(anterior).toBe(await saldo(id));
        expect(await salidas(id)).toHaveLength(1);
      }
      expect(
        (await get(`compras/${compra.body.id}`).expect(200)).body.estado,
      ).toBe('RECIBIDA');
      expect((await get(`ventas/${v.id}`).expect(200)).body.estado).toBe(
        'CONFIRMADA',
      );
    });

    it('AY-BC/AC/BG: cancelar BORRADOR conserva stock e historial', async () => {
      const v = await borrador();
      await post(`ventas/${v.id}/cancelar`).expect(201);
      expect(await saldo(v.productoId)).toBe(10);
      expect(await salidas(v.productoId)).toEqual([]);
      expect((await get(`ventas/${v.id}`).expect(200)).body.estado).toBe(
        'CANCELADA',
      );
      await post(`ventas/${v.id}/cancelar`).expect(409);
      await post(`ventas/${v.id}/confirmar`).expect(409);
      await patch(`ventas/${v.id}`, { observacion: 'No permitido' }).expect(
        409,
      );
      await del(`ventas/${v.id}`).expect(409);
      await del(`clientes/${v.clienteId}`).expect(409);
    });

    it('BD/BE: DELETE BORRADOR elimina detalles y libera cliente', async () => {
      const v = await borrador(0);
      await del(`ventas/${v.id}`).expect(200);
      await get(`ventas/${v.id}`).expect(404);
      expect(
        await database.db.orm.public.DetalleVenta.where({
          ventaId: v.id,
        }).all(),
      ).toEqual([]);
      await del(`clientes/${v.clienteId}`).expect(200);
      expect(await movimientos(v.productoId)).toEqual([]);
      await del(`productos/${v.productoId}`).expect(200);
    });

    it('utilidad negativa se persiste sin redondeo ni incluir impuestos', async () => {
      const c = await cliente();
      const p = await producto(0, 0.1, 0.2);
      const v = await venta(c.id, [{ productoId: p, cantidad: 3 }], {
        impuestos: 1,
      });
      expect((await get(`ventas/${v.id}`).expect(200)).body).toMatchObject({
        subtotal: '0.30',
        costoTotal: '0.60',
        total: '1.30',
        utilidad: '-0.30',
      });
    });

    it('listado pagina, filtra cliente/estado/fechas, busca folio/cliente/RFC y ordena', async () => {
      const rfc = rfcNuevo();
      const c = await cliente({ rfc });
      const p = await producto();
      const a = await venta(c.id, [{ productoId: p, cantidad: 1 }]);
      const b = await venta(c.id, [{ productoId: p, cantidad: 2 }]);
      await post(`ventas/${b.id}/cancelar`).expect(201);
      const result = await get(
        `ventas?clienteId=${c.id}&limit=1&sortBy=total&sortOrder=asc`,
      ).expect(200);
      expect(result.body.pagination).toEqual({
        page: 1,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(result.body.data[0].id).toBe(a.id);
      expect(
        (await get(`ventas?clienteId=${c.id}&page=2&limit=1`).expect(200)).body
          .pagination.hasPreviousPage,
      ).toBe(true);
      expect(
        (await get(`ventas?clienteId=${c.id}&estado=CANCELADA`).expect(200))
          .body.pagination.totalItems,
      ).toBe(1);
      for (const search of [c.nombre.toLowerCase(), rfc.toLowerCase()])
        expect(
          (
            await get(
              `ventas?clienteId=${c.id}&search=${encodeURIComponent(search)}`,
            ).expect(200)
          ).body.pagination.totalItems,
        ).toBe(2);
      expect(
        (await get(`ventas?search=${a.folio.toLowerCase()}`).expect(200)).body
          .data[0].id,
      ).toBe(a.id);
      expect(
        (await get(`ventas?clienteId=${c.id}&fechaFin=2000-01-01`).expect(200))
          .body.data,
      ).toEqual([]);
      const defaults = await get('ventas').expect(200);
      expect(defaults.body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(defaults.body.data.length).toBeLessThanOrEqual(20);
      expect(
        defaults.body.data.map((r: { createdAt: string }) => r.createdAt),
      ).toEqual(
        defaults.body.data
          .map((r: { createdAt: string }) => r.createdAt)
          .sort()
          .reverse(),
      );
      expect(JSON.stringify(defaults.body)).not.toContain('password');
    });

    it.each([
      'limit=101',
      'page=0',
      'sortBy=password',
      'estado=RECIBIDA',
      'clienteId=-1',
      'fechaInicio=2026-10-01&fechaFin=2026-09-01',
      'fechaFin=2026-02-30',
    ])('rechaza query %s', async (q) => {
      await get(`ventas?${q}`).expect(400);
    });

    it('fechas son días UTC inclusivos y timestamps respetan offset', async () => {
      const v = await borrador();
      await database.db.orm.public.Venta.where({ id: v.id }).update({
        createdAt: '2026-09-30T23:59:59.999Z',
      });
      const ruta = `ventas?clienteId=${v.clienteId}`;
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

    it('JWT obligatorio y ADMINISTRADOR en todas las mutaciones', async () => {
      for (const ruta of ['clientes', 'clientes/1', 'ventas', 'ventas/1'])
        await request(app.getHttpServer()).get(`/api/v1/${ruta}`).expect(401);
      for (const ruta of [
        'clientes',
        'ventas',
        'ventas/1/confirmar',
        'ventas/1/cancelar',
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/${ruta}`)
          .send({})
          .expect(401);
        await post(ruta, {}, tokenConsulta).expect(403);
      }
      for (const ruta of [
        'clientes/1',
        'clientes/1/activar',
        'clientes/1/desactivar',
        'ventas/1',
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
      for (const ruta of ['clientes/1', 'ventas/1']) {
        await request(app.getHttpServer())
          .delete(`/api/v1/${ruta}`)
          .expect(401);
        await request(app.getHttpServer())
          .delete(`/api/v1/${ruta}`)
          .set('Authorization', `Bearer ${tokenConsulta}`)
          .expect(403);
      }
    });

    it('confirmar/cancelar rechazan datos del cliente; solo body vacío', async () => {
      const v = await borrador();
      await post(`ventas/${v.id}/confirmar`, {
        cantidad: 999,
        confirmadaPorUsuarioId: confirmadorId,
      }).expect(400);
      await post(`ventas/${v.id}/cancelar`, { estado: 'CONFIRMADA' }).expect(
        400,
      );
      expect((await get(`ventas/${v.id}`).expect(200)).body.estado).toBe(
        'BORRADOR',
      );
      await request(app.getHttpServer())
        .post(`/api/v1/ventas/${v.id}/confirmar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });

    it('confirmar y cancelar concurrentes permiten una sola transición', async () => {
      const v = await borrador();
      const result = await Promise.all([
        post(`ventas/${v.id}/confirmar`),
        post(`ventas/${v.id}/cancelar`),
      ]);
      expect(result.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const estado = (await get(`ventas/${v.id}`).expect(200)).body.estado;
      expect(await saldo(v.productoId)).toBe(estado === 'CONFIRMADA' ? 8 : 10);
      expect(await salidas(v.productoId)).toHaveLength(
        estado === 'CONFIRMADA' ? 1 : 0,
      );
    });

    it('producto/cliente desactivados después de crear impiden confirmación', async () => {
      const v = await borrador();
      await productos.desactivar(v.productoId);
      await post(`ventas/${v.id}/confirmar`).expect(409);
      expect(await saldo(v.productoId)).toBe(10);
      const otro = await borrador();
      await patch(`clientes/${otro.clienteId}/desactivar`).expect(200);
      await post(`ventas/${otro.id}/confirmar`).expect(409);
      expect(await saldo(otro.productoId)).toBe(10);
    });

    it('flujo comercial completo: Compra → ENTRADA → Venta → SALIDA y snapshots históricos', async () => {
      const p = await producto(0, 150, 100);
      const proveedor = await post('proveedores', { nombre: prefix }).expect(
        201,
      );
      proveedorIds.push(proveedor.body.id as number);
      const compra = await post('compras', {
        proveedorId: proveedor.body.id,
        detalles: [{ productoId: p, cantidad: 20, costoUnitario: 100 }],
      }).expect(201);
      compraIds.push(compra.body.id as number);
      await post(`compras/${compra.body.id}/recibir`).expect(201);
      expect(await saldo(p)).toBe(20);
      const c = await cliente();
      const v = await venta(c.id, [{ productoId: p, cantidad: 5 }]);
      expect(await saldo(p)).toBe(20);
      await post(`ventas/${v.id}/confirmar`, {}, tokenConfirmador).expect(201);
      expect(await saldo(p)).toBe(15);
      const result = await get(`ventas/${v.id}`).expect(200);
      expect(result.body).toMatchObject({
        subtotal: '750.00',
        costoTotal: '500.00',
        utilidad: '250.00',
      });
      const kardex = await get(`inventario/kardex/${p}`).expect(200);
      expect(kardex.body.producto.stockActual).toBe(15);
      expect(kardex.body.data).toHaveLength(2);
      expect(kardex.body.data[0]).toMatchObject({
        tipo: 'SALIDA',
        cantidad: 5,
        stockAnterior: 20,
        stockNuevo: 15,
      });
      expect(kardex.body.data[1]).toMatchObject({
        tipo: 'ENTRADA',
        cantidad: 20,
        stockAnterior: 0,
        stockNuevo: 20,
      });
      await productos.update(p, { precio: 200, costo: 120 });
      expect(
        (await get(`ventas/${v.id}`).expect(200)).body.detalles[0],
      ).toMatchObject({ precioUnitario: '150.00', costoUnitario: '100.00' });
      const nueva = await venta(c.id, [{ productoId: p, cantidad: 1 }]);
      expect(
        (await get(`ventas/${nueva.id}`).expect(200)).body.detalles[0],
      ).toMatchObject({ precioUnitario: '200.00', costoUnitario: '120.00' });
      await del(`productos/${p}`).expect(409);
    });

    it('regresión Auth/Roles/Usuarios/Categorías/Productos y movimientos manuales', async () => {
      const login = await post('auth/login', {
        email: `${prefix.toLowerCase()}@example.test`,
        password: 'VentasPrueba123!',
      }).expect(200);
      expect(login.body.usuario.id).toBe(usuarioId);
      expect(JSON.stringify(login.body.usuario)).not.toContain('password');
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await get('roles').expect(403);
      const usuarios = await get('usuarios').expect(200);
      expect(JSON.stringify(usuarios.body)).not.toContain('password');
      await get('categorias').expect(200);
      await get('productos').expect(200);
      const p = await producto(10);
      await post('inventario/movimientos/entrada', {
        productoId: p,
        cantidad: 5,
      }).expect(201);
      await post('inventario/movimientos/salida', {
        productoId: p,
        cantidad: 3,
      }).expect(201);
      const ajuste = await post('inventario/movimientos/ajuste', {
        productoId: p,
        nuevaCantidad: 8,
      }).expect(201);
      expect(ajuste.body).toMatchObject({
        cantidad: -4,
        stockAnterior: 12,
        stockNuevo: 8,
      });
      expect(await saldo(p)).toBe(8);
      await get(`inventario/kardex/${p}`).expect(200);
      await del(`productos/${p}`).expect(409);
    });
  },
);
