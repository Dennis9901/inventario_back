import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { InventarioService } from '../src/modules/inventario/inventario.service.js';
import { DevolucionesVentaService } from '../src/modules/devoluciones/devoluciones-venta.service.js';
import { DevolucionesCompraService } from '../src/modules/devoluciones/devoluciones-compra.service.js';

type Tipo = 'ventas' | 'compras';
type Documento = {
  id: number;
  folio: string;
  estado: string;
  detalles: {
    id: number;
    productoId: number;
    cantidad: number;
    precioUnitario?: string;
    costoUnitario: string;
  }[];
};
type Devolucion = Documento & { subtotal: string; costoTotal?: string };

// Solo PostgreSQL real. Cada fixture tiene UUID y se elimina por sus propios IDs.
describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Devoluciones con PostgreSQL real',
  () => {
    let app: INestApplication;
    let database: DatabaseService;
    let productos: ProductosService;
    let inventario: InventarioService;
    let dvService: DevolucionesVentaService;
    let dcService: DevolucionesCompraService;
    let rolId: number;
    let creadorId: number;
    let procesadorId: number;
    let categoriaId: number;
    let clienteId: number;
    let proveedorId: number;
    let token: string;
    let tokenProcesador: string;
    let tokenConsulta: string;
    const prefix = `TEST-DEVOLUCIONES-${randomUUID()}`.toUpperCase();
    const pIds: number[] = [];
    const ventas: number[] = [];
    const compras: number[] = [];
    const dvs: number[] = [];
    const dcs: number[] = [];

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
      dvService = app.get(DevolucionesVentaService);
      dcService = app.get(DevolucionesCompraService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix, activo: true })).id;
      creadorId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.test`,
          password: 'secreto-no-exponer',
          rolId,
          activo: true,
        })
      ).id;
      procesadorId = (
        await orm.Usuario.create({
          nombre: `${prefix}-PROCESADOR`,
          email: `${prefix}-procesador@example.test`,
          password: 'secreto-no-exponer',
          rolId,
          activo: true,
        })
      ).id;
      categoriaId = (
        await orm.Categoria.create({ nombre: prefix, activo: true })
      ).id;
      clienteId = (await orm.Cliente.create({ nombre: prefix, activo: true }))
        .id;
      proveedorId = (
        await orm.Proveedor.create({ nombre: prefix, activo: true })
      ).id;
      const jwt = app.get(JwtService);
      token = await jwt.signAsync({ sub: creadorId, rol: 'ADMINISTRADOR' });
      tokenProcesador = await jwt.signAsync({
        sub: procesadorId,
        rol: 'ADMINISTRADOR',
      });
      tokenConsulta = await jwt.signAsync({ sub: creadorId, rol: 'CONSULTA' });
      const isolation = await database.db
        .runtime()
        .query(
          database.db.raw
            .sql`SELECT current_setting('transaction_isolation') AS nivel`
            .returnsRow({ nivel: 'pg/text@1' })
            .build(),
        );
      expect(isolation[0]?.nivel).toBe('read committed');
    });

    afterAll(async () => {
      try {
        if (database) {
          await database.db.transaction(async (tx) => {
            for (const auditUserId of [creadorId, procesadorId])
              if (auditUserId)
                await tx.orm.public.Auditoria.where({
                  usuarioId: auditUserId,
                }).deleteAll();
            for (const id of dvs) {
              await tx.orm.public.DetalleDevolucionVenta.where({
                devolucionVentaId: id,
              }).deleteAll();
              await tx.orm.public.DevolucionVenta.where({ id }).delete();
            }
            for (const id of dcs) {
              await tx.orm.public.DetalleDevolucionCompra.where({
                devolucionCompraId: id,
              }).deleteAll();
              await tx.orm.public.DevolucionCompra.where({ id }).delete();
            }
            for (const id of ventas) {
              await tx.orm.public.DetalleVenta.where({
                ventaId: id,
              }).deleteAll();
              await tx.orm.public.Venta.where({ id }).delete();
            }
            for (const id of compras) {
              await tx.orm.public.DetalleCompra.where({
                compraId: id,
              }).deleteAll();
              await tx.orm.public.Compra.where({ id }).delete();
            }
            for (const id of pIds) {
              await tx.orm.public.MovimientoInventario.where({
                productoId: id,
              }).deleteAll();
              await tx.orm.public.Existencia.where({ productoId: id }).delete();
              await tx.orm.public.Producto.where({ id }).delete();
            }
            if (clienteId)
              await tx.orm.public.Cliente.where({ id: clienteId }).delete();
            if (proveedorId)
              await tx.orm.public.Proveedor.where({ id: proveedorId }).delete();
            if (categoriaId)
              await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            for (const id of [creadorId, procesadorId])
              if (id) await tx.orm.public.Usuario.where({ id }).delete();
            if (rolId) await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
          // Evidencia de limpieza: no queda ninguno de nuestros encabezados, detalles, stocks o movimientos.
          const orm = database.db.orm.public;
          if (dvs.length) {
            expect(
              await orm.DevolucionVenta.where((d) => d.id.in(dvs)).all(),
            ).toEqual([]);
            expect(
              await orm.DetalleDevolucionVenta.where((d) =>
                d.devolucionVentaId.in(dvs),
              ).all(),
            ).toEqual([]);
          }
          if (dcs.length) {
            expect(
              await orm.DevolucionCompra.where((d) => d.id.in(dcs)).all(),
            ).toEqual([]);
            expect(
              await orm.DetalleDevolucionCompra.where((d) =>
                d.devolucionCompraId.in(dcs),
              ).all(),
            ).toEqual([]);
          }
          if (pIds.length) {
            expect(
              await orm.Producto.where((p) => p.id.in(pIds)).all(),
            ).toEqual([]);
            expect(
              await orm.Existencia.where((e) => e.productoId.in(pIds)).all(),
            ).toEqual([]);
            expect(
              await orm.MovimientoInventario.where((m) =>
                m.productoId.in(pIds),
              ).all(),
            ).toEqual([]);
          }
          if (ventas.length) {
            expect(await orm.Venta.where((v) => v.id.in(ventas)).all()).toEqual(
              [],
            );
            expect(
              await orm.DetalleVenta.where((d) => d.ventaId.in(ventas)).all(),
            ).toEqual([]);
          }
          if (compras.length) {
            expect(
              await orm.Compra.where((c) => c.id.in(compras)).all(),
            ).toEqual([]);
            expect(
              await orm.DetalleCompra.where((d) =>
                d.compraId.in(compras),
              ).all(),
            ).toEqual([]);
          }
          expect(
            await orm.Usuario.where((u) =>
              u.id.in([creadorId, procesadorId]),
            ).all(),
          ).toEqual([]);
          expect(await orm.Cliente.where({ id: clienteId }).first()).toBeNull();
          expect(
            await orm.Proveedor.where({ id: proveedorId }).first(),
          ).toBeNull();
          expect(
            await orm.Categoria.where({ id: categoriaId }).first(),
          ).toBeNull();
          expect(await orm.Rol.where({ id: rolId }).first()).toBeNull();
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
    const get = (ruta: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${tokenConsulta}`);
    const del = (ruta: string) =>
      request(app.getHttpServer())
        .delete(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`);
    const ruta = (tipo: Tipo) => `devoluciones/${tipo}`;
    const originalKey = (tipo: Tipo) =>
      tipo === 'ventas' ? 'ventaId' : 'compraId';
    const detalleKey = (tipo: Tipo) =>
      tipo === 'ventas' ? 'detalleVentaId' : 'detalleCompraId';
    async function producto(stock = 0) {
      const p = await productos.create({
        sku: `${prefix}-${pIds.length}`,
        nombre: prefix,
        costo: 100,
        precio: 150,
        categoriaId,
        stockMinimo: 0,
      });
      pIds.push(p.id);
      if (stock)
        await inventario.entrada(
          { productoId: p.id, cantidad: stock },
          creadorId,
        );
      return p.id;
    }
    async function documento(
      tipo: Tipo,
      detalles: { productoId: number; cantidad: number }[],
      estado = true,
    ) {
      const body =
        tipo === 'ventas'
          ? { clienteId, detalles }
          : {
              proveedorId,
              detalles: detalles.map((d) => ({ ...d, costoUnitario: 100 })),
            };
      const response = await post(tipo, body).expect(201);
      const doc = response.body as Documento;
      (tipo === 'ventas' ? ventas : compras).push(doc.id);
      if (estado)
        await post(
          `${tipo}/${doc.id}/${tipo === 'ventas' ? 'confirmar' : 'recibir'}`,
        ).expect(201);
      return doc;
    }
    async function elegible(tipo: Tipo, cantidad = 10) {
      const productoId = await producto(tipo === 'ventas' ? cantidad + 15 : 0);
      const doc = await documento(tipo, [{ productoId, cantidad }]);
      return { doc, productoId };
    }
    async function devolucion(
      tipo: Tipo,
      doc: Documento,
      cantidades: number[],
      extra: object = {},
    ) {
      const response = await post(ruta(tipo), {
        [originalKey(tipo)]: doc.id,
        motivo: 'DEVOLUCION',
        observacion: 'Retorno',
        detalles: doc.detalles.map((d, i) => ({
          [detalleKey(tipo)]: d.id,
          cantidad: cantidades[i]!,
        })),
        ...extra,
      }).expect(201);
      const result = response.body as Devolucion;
      (tipo === 'ventas' ? dvs : dcs).push(result.id);
      return result;
    }
    const saldo = async (id: number) =>
      (await inventario.findExistencia(id)).cantidad;
    const movimientos = async (id: number) =>
      (await inventario.findMovimientosProducto(id)).data;

    for (const tipo of ['ventas', 'compras'] as const) {
      describe(tipo, () => {
        it('crea BORRADOR auditado sin alterar stock ni movimientos', async () => {
          const { doc, productoId } = await elegible(tipo);
          const antes = await movimientos(productoId);
          const stock = await saldo(productoId);
          const d = await devolucion(tipo, doc, [2]);
          expect(d).toMatchObject({
            estado: 'BORRADOR',
            createdByUsuarioId: creadorId,
            procesadaPorUsuarioId: null,
            fechaProcesamiento: null,
            subtotal: tipo === 'ventas' ? '300.00' : '200.00',
          });
          expect(d.folio).toMatch(
            tipo === 'ventas'
              ? /^DV-\d{4}-[A-F0-9-]{36}$/
              : /^DC-\d{4}-[A-F0-9-]{36}$/,
          );
          expect(await saldo(productoId)).toBe(stock);
          expect(await movimientos(productoId)).toEqual(antes);
          expect(JSON.stringify(d)).not.toMatch(/password|secreto-no-exponer/);
        });
        it('documento inexistente y disponible inexistente devuelven 404', async () => {
          await post(ruta(tipo), {
            [originalKey(tipo)]: 2147483647,
            motivo: 'Retorno',
            detalles: [{ [detalleKey(tipo)]: 1, cantidad: 1 }],
          }).expect(404);
          await get(`${ruta(tipo)}/disponible/2147483647`).expect(404);
          await get(`${ruta(tipo)}/2147483647`).expect(404);
          await post(`${ruta(tipo)}/2147483647/procesar`).expect(404);
          await post(`${ruta(tipo)}/2147483647/cancelar`).expect(404);
          await del(`${ruta(tipo)}/2147483647`).expect(404);
        });
        it.each(['BORRADOR', 'CANCELADA'])(
          'rechaza documento %s',
          async (estado) => {
            const p = await producto(10);
            const doc = await documento(
              tipo,
              [{ productoId: p, cantidad: 2 }],
              false,
            );
            if (estado === 'CANCELADA')
              await post(`${tipo}/${doc.id}/cancelar`).expect(201);
            await post(ruta(tipo), {
              [originalKey(tipo)]: doc.id,
              motivo: 'Retorno',
              detalles: [
                { [detalleKey(tipo)]: doc.detalles[0]!.id, cantidad: 1 },
              ],
            }).expect(409);
            await get(`${ruta(tipo)}/disponible/${doc.id}`).expect(409);
          },
        );
        it('rechaza detalle de otra operación', async () => {
          const a = await elegible(tipo);
          const b = await elegible(tipo);
          await post(ruta(tipo), {
            [originalKey(tipo)]: a.doc.id,
            motivo: 'Retorno',
            detalles: [
              { [detalleKey(tipo)]: b.doc.detalles[0]!.id, cantidad: 1 },
            ],
          }).expect(400);
        });
        it.each([0, -1])('rechaza cantidad %s', async (cantidad) => {
          const { doc } = await elegible(tipo);
          await post(ruta(tipo), {
            [originalKey(tipo)]: doc.id,
            motivo: 'Retorno',
            detalles: [{ [detalleKey(tipo)]: doc.detalles[0]!.id, cantidad }],
          }).expect(400);
        });
        it('rechaza duplicados sin crear encabezado', async () => {
          const { doc } = await elegible(tipo);
          const detalle = {
            [detalleKey(tipo)]: doc.detalles[0]!.id,
            cantidad: 1,
          };
          await post(ruta(tipo), {
            [originalKey(tipo)]: doc.id,
            motivo: 'Retorno',
            detalles: [detalle, detalle],
          }).expect(400);
          expect(
            (
              await get(`${ruta(tipo)}?${originalKey(tipo)}=${doc.id}`).expect(
                200,
              )
            ).body.pagination.totalItems,
          ).toBe(0);
        });
        it('snapshots históricos sobreviven a cambios del catálogo antes y después de crear', async () => {
          const { doc, productoId } = await elegible(tipo);
          await productos.update(productoId, { precio: 250, costo: 180 });
          const d = await devolucion(tipo, doc, [2]);
          expect(d.detalles[0]).toMatchObject({ costoUnitario: '100.00' });
          if (tipo === 'ventas')
            expect(d).toMatchObject({
              costoTotal: '200.00',
              subtotal: '300.00',
              detalles: [{ precioUnitario: '150.00', costoSubtotal: '200.00' }],
            });
          else expect(d.subtotal).toBe('200.00');
          await productos.update(productoId, { precio: 300, costo: 200 });
          await post(`${ruta(tipo)}/${d.id}/procesar`).expect(201);
          expect(
            (await get(`${ruta(tipo)}/${d.id}`).expect(200)).body.detalles[0],
          ).toMatchObject(d.detalles[0]!);
        });
        it('procesa compensación, stocks correctos y usuario procesador distinto', async () => {
          const { doc, productoId } = await elegible(tipo);
          const antes = await movimientos(productoId);
          const stock = await saldo(productoId);
          const d = await devolucion(tipo, doc, [2]);
          const result = await post(
            `${ruta(tipo)}/${d.id}/procesar`,
            {},
            tokenProcesador,
          ).expect(201);
          expect(result.body).toMatchObject({
            estado: 'PROCESADA',
            createdByUsuarioId: creadorId,
            procesadaPorUsuarioId: procesadorId,
            procesadoPor: { id: procesadorId },
            creadoPor: { id: creadorId },
          });
          expect(
            Number.isNaN(Date.parse(result.body.fechaProcesamiento as string)),
          ).toBe(false);
          const nuevo = stock + (tipo === 'ventas' ? 2 : -2);
          expect(await saldo(productoId)).toBe(nuevo);
          const rows = await movimientos(productoId);
          expect(rows).toHaveLength(antes.length + 1);
          expect(rows[0]).toMatchObject({
            tipo: tipo === 'ventas' ? 'ENTRADA' : 'SALIDA',
            cantidad: 2,
            stockAnterior: stock,
            stockNuevo: nuevo,
            usuarioId: procesadorId,
          });
          expect(rows[0]!.observacion).toContain(d.folio);
          expect(rows[0]!.observacion).toContain(doc.folio);
          expect(rows.slice(1)).toEqual(antes);
          expect(JSON.stringify(result.body)).not.toContain('password');
        });
        it('parciales 3+4, borradores/canceladas no reservan y el límite se revalida al procesar', async () => {
          const { doc, productoId } = await elegible(tipo);
          const stale = await devolucion(tipo, doc, [4]);
          const cancelada = await devolucion(tipo, doc, [9]);
          await post(`${ruta(tipo)}/${cancelada.id}/cancelar`).expect(201);
          const a = await devolucion(tipo, doc, [3]);
          const b = await devolucion(tipo, doc, [4]);
          const disponible = async () =>
            (await get(`${ruta(tipo)}/disponible/${doc.id}`).expect(200)).body
              .detalles[0];
          expect(await disponible()).toMatchObject({
            cantidadOriginal: 10,
            cantidadDevuelta: 0,
            cantidadDisponible: 10,
          });
          await post(`${ruta(tipo)}/${a.id}/procesar`).expect(201);
          await post(`${ruta(tipo)}/${b.id}/procesar`).expect(201);
          expect(await disponible()).toMatchObject({
            cantidadOriginal: 10,
            cantidadDevuelta: 7,
            cantidadDisponible: 3,
          });
          const stock = await saldo(productoId);
          const antes = await movimientos(productoId);
          await post(`${ruta(tipo)}/${stale.id}/procesar`).expect(409);
          await post(ruta(tipo), {
            [originalKey(tipo)]: doc.id,
            motivo: 'Exceso',
            detalles: [
              { [detalleKey(tipo)]: doc.detalles[0]!.id, cantidad: 4 },
            ],
          }).expect(409);
          expect(await saldo(productoId)).toBe(stock);
          expect(await movimientos(productoId)).toEqual(antes);
          expect(
            (await get(`${ruta(tipo)}/${stale.id}`).expect(200)).body.estado,
          ).toBe('BORRADOR');
          const final = await devolucion(tipo, doc, [3]);
          await post(`${ruta(tipo)}/${final.id}/procesar`).expect(201);
          expect(await disponible()).toMatchObject({
            cantidadDevuelta: 10,
            cantidadDisponible: 0,
          });
        });
        it('dos devoluciones distintas concurrentes no exceden el original', async () => {
          const { doc, productoId } = await elegible(tipo);
          const cantidad = tipo === 'ventas' ? 6 : 7;
          const a = await devolucion(tipo, doc, [cantidad]);
          const b = await devolucion(tipo, doc, [cantidad]);
          const stock = await saldo(productoId);
          const antes = await movimientos(productoId);
          const responses = await Promise.all([
            post(`${ruta(tipo)}/${a.id}/procesar`),
            post(`${ruta(tipo)}/${b.id}/procesar`),
          ]);
          expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
            201, 409,
          ]);
          expect(await saldo(productoId)).toBe(
            stock + (tipo === 'ventas' ? cantidad : -cantidad),
          );
          expect(await movimientos(productoId)).toHaveLength(antes.length + 1);
          expect(
            (await get(`${ruta(tipo)}/disponible/${doc.id}`).expect(200)).body
              .detalles[0].cantidadDevuelta,
          ).toBe(cantidad);
        });
        it('doble procesamiento simultáneo modifica stock una sola vez', async () => {
          const { doc, productoId } = await elegible(tipo);
          const d = await devolucion(tipo, doc, [2]);
          const stock = await saldo(productoId);
          const antes = await movimientos(productoId);
          const responses = await Promise.all([
            post(`${ruta(tipo)}/${d.id}/procesar`),
            post(`${ruta(tipo)}/${d.id}/procesar`, {}, tokenProcesador),
          ]);
          expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
            201, 409,
          ]);
          expect(await saldo(productoId)).toBe(
            stock + (tipo === 'ventas' ? 2 : -2),
          );
          expect(await movimientos(productoId)).toHaveLength(antes.length + 1);
        });
        it('cancelación solo BORRADOR y DELETE preservan historial', async () => {
          const { doc, productoId } = await elegible(tipo);
          const stock = await saldo(productoId);
          const antes = await movimientos(productoId);
          const cancelada = await devolucion(tipo, doc, [1]);
          await post(`${ruta(tipo)}/${cancelada.id}/cancelar`).expect(201);
          await post(`${ruta(tipo)}/${cancelada.id}/cancelar`).expect(409);
          await post(`${ruta(tipo)}/${cancelada.id}/procesar`).expect(409);
          await del(`${ruta(tipo)}/${cancelada.id}`).expect(409);
          const borrador = await devolucion(tipo, doc, [1]);
          await del(`${ruta(tipo)}/${borrador.id}`).expect(200);
          await get(`${ruta(tipo)}/${borrador.id}`).expect(404);
          expect(await saldo(productoId)).toBe(stock);
          expect(await movimientos(productoId)).toEqual(antes);
          const procesada = await devolucion(tipo, doc, [1]);
          await post(`${ruta(tipo)}/${procesada.id}/procesar`).expect(201);
          const despues = await movimientos(productoId);
          await del(`${ruta(tipo)}/${procesada.id}`).expect(409);
          await post(`${ruta(tipo)}/${procesada.id}/cancelar`).expect(409);
          await post(`${ruta(tipo)}/${procesada.id}/procesar`).expect(409);
          expect(await movimientos(productoId)).toEqual(despues);
          await del(`productos/${productoId}`).expect(409);
        });
        it('listado paginado, filtros, búsqueda y usuarios públicos', async () => {
          const { doc } = await elegible(tipo);
          const a = await devolucion(tipo, doc, [1]);
          const b = await devolucion(tipo, doc, [2]);
          await post(`${ruta(tipo)}/${b.id}/cancelar`).expect(201);
          const base = `${ruta(tipo)}?${originalKey(tipo)}=${doc.id}`;
          const listado = await get(
            `${base}&limit=1&sortBy=subtotal&sortOrder=asc`,
          ).expect(200);
          expect(listado.body.data[0].id).toBe(a.id);
          expect(listado.body.pagination).toEqual({
            page: 1,
            limit: 1,
            totalItems: 2,
            totalPages: 2,
            hasNextPage: true,
            hasPreviousPage: false,
          });
          expect(
            (await get(`${base}&page=2&limit=1`).expect(200)).body.pagination
              .hasPreviousPage,
          ).toBe(true);
          expect(
            (await get(`${base}&estado=CANCELADA`).expect(200)).body.pagination
              .totalItems,
          ).toBe(1);
          expect(
            (await get(`${base}&fechaFin=2000-01-01`).expect(200)).body.data,
          ).toEqual([]);
          for (const search of [
            a.folio.toLowerCase(),
            doc.folio.toLowerCase(),
            prefix.toLowerCase(),
          ])
            expect(
              (
                await get(
                  `${base}&search=${encodeURIComponent(search)}`,
                ).expect(200)
              ).body.pagination.totalItems,
            ).toBe(search === a.folio.toLowerCase() ? 1 : 2);
          const filtroSujeto =
            tipo === 'ventas'
              ? `clienteId=${clienteId}`
              : `proveedorId=${proveedorId}`;
          expect(
            (await get(`${base}&${filtroSujeto}`).expect(200)).body.pagination
              .totalItems,
          ).toBe(2);
          expect(
            (
              await get(
                `${base}&${tipo === 'ventas' ? 'clienteId' : 'proveedorId'}=2147483647`,
              ).expect(200)
            ).body.data,
          ).toEqual([]);
          expect(JSON.stringify(listado.body)).not.toContain('password');
          const individual = (await get(`${ruta(tipo)}/${a.id}`).expect(200))
            .body;
          expect(
            individual[tipo === 'ventas' ? 'cliente' : 'proveedor'],
          ).toMatchObject({ id: tipo === 'ventas' ? clienteId : proveedorId });
          expect(individual.detalles[0].producto).toHaveProperty('sku');
        });
        it.each([
          'limit=101',
          'page=0',
          'sortBy=password',
          'estado=RECIBIDA',
          'fechaInicio=2026-10-05&fechaFin=2026-09-01',
          'fechaFin=2026-02-30',
        ])('query inválida %s devuelve 400', async (query) => {
          await get(`${ruta(tipo)}?${query}`).expect(400);
        });
        it('JWT obligatorio en consultas y ADMINISTRADOR en todas las escrituras', async () => {
          for (const path of [
            ruta(tipo),
            `${ruta(tipo)}/1`,
            `${ruta(tipo)}/disponible/1`,
          ])
            await request(app.getHttpServer())
              .get(`/api/v1/${path}`)
              .expect(401);
          for (const path of [
            ruta(tipo),
            `${ruta(tipo)}/1/procesar`,
            `${ruta(tipo)}/1/cancelar`,
          ]) {
            await request(app.getHttpServer())
              .post(`/api/v1/${path}`)
              .send({})
              .expect(401);
            await post(path, {}, tokenConsulta).expect(403);
          }
          await request(app.getHttpServer())
            .delete(`/api/v1/${ruta(tipo)}/1`)
            .expect(401);
          await request(app.getHttpServer())
            .delete(`/api/v1/${ruta(tipo)}/1`)
            .set('Authorization', `Bearer ${tokenConsulta}`)
            .expect(403);
        });
        it('acciones rechazan body manipulado', async () => {
          const { doc } = await elegible(tipo);
          const d = await devolucion(tipo, doc, [1]);
          await post(`${ruta(tipo)}/${d.id}/procesar`, {
            procesadaPorUsuarioId: procesadorId,
          }).expect(400);
          await post(`${ruta(tipo)}/${d.id}/cancelar`, {
            estado: 'PROCESADA',
          }).expect(400);
          expect(
            (await get(`${ruta(tipo)}/${d.id}`).expect(200)).body.estado,
          ).toBe('BORRADOR');
        });
        it('usuario inactivo impide crear/procesar/cancelar/eliminar', async () => {
          const { doc } = await elegible(tipo);
          const d = await devolucion(tipo, doc, [1]);
          await database.db.orm.public.Usuario.where({
            id: procesadorId,
          }).update({ activo: false });
          try {
            await post(
              ruta(tipo),
              {
                [originalKey(tipo)]: doc.id,
                motivo: 'Retorno',
                detalles: [
                  { [detalleKey(tipo)]: doc.detalles[0]!.id, cantidad: 1 },
                ],
              },
              tokenProcesador,
            ).expect(401);
            await post(
              `${ruta(tipo)}/${d.id}/procesar`,
              {},
              tokenProcesador,
            ).expect(401);
            await post(
              `${ruta(tipo)}/${d.id}/cancelar`,
              {},
              tokenProcesador,
            ).expect(401);
            await request(app.getHttpServer())
              .delete(`/api/v1/${ruta(tipo)}/${d.id}`)
              .set('Authorization', `Bearer ${tokenProcesador}`)
              .expect(401);
          } finally {
            await database.db.orm.public.Usuario.where({
              id: procesadorId,
            }).update({ activo: true });
          }
        });
        it('producto inactivo al procesar conserva BORRADOR sin movimientos nuevos', async () => {
          const { doc, productoId } = await elegible(tipo);
          const d = await devolucion(tipo, doc, [1]);
          const antes = await movimientos(productoId);
          const stock = await saldo(productoId);
          await productos.desactivar(productoId);
          await post(`${ruta(tipo)}/${d.id}/procesar`).expect(409);
          expect(await saldo(productoId)).toBe(stock);
          expect(await movimientos(productoId)).toEqual(antes);
        });
      });
    }

    it('devolución proveedor respeta stock físico tras venta: 10-8=2, devolver5 falla', async () => {
      const { doc, productoId } = await elegible('compras');
      await documento('ventas', [{ productoId, cantidad: 8 }]);
      const d = await devolucion('compras', doc, [5]);
      const antes = await movimientos(productoId);
      expect(
        (await get(`devoluciones/compras/disponible/${doc.id}`).expect(200))
          .body.detalles[0],
      ).toMatchObject({ cantidadDisponible: 10, stockActual: 2 });
      await post(`devoluciones/compras/${d.id}/procesar`).expect(409);
      expect(await saldo(productoId)).toBe(2);
      expect(await movimientos(productoId)).toEqual(antes);
      expect(
        (await get(`devoluciones/compras/${d.id}`).expect(200)).body,
      ).toMatchObject({
        estado: 'BORRADOR',
        procesadaPorUsuarioId: null,
        fechaProcesamiento: null,
      });
    });

    it('rollback compra A2/B3/C5 cuando C solo tiene2: ninguna salida parcial', async () => {
      const ids = [await producto(), await producto(), await producto()];
      const doc = await documento(
        'compras',
        ids.map((productoId, i) => ({
          productoId,
          cantidad: [20, 10, 10][i]!,
        })),
      );
      await documento('ventas', [{ productoId: ids[2]!, cantidad: 8 }]);
      const d = await devolucion('compras', doc, [2, 3, 5]);
      const antes = await Promise.all(ids.map(movimientos));
      await post(`devoluciones/compras/${d.id}/procesar`).expect(409);
      expect(await Promise.all(ids.map(saldo))).toEqual([20, 10, 2]);
      expect(await Promise.all(ids.map(movimientos))).toEqual(antes);
      expect(
        (await get(`devoluciones/compras/${d.id}`).expect(200)).body.estado,
      ).toBe('BORRADOR');
    });

    it.each(['ventas', 'compras'] as const)(
      'rollback %s si falla insertar último movimiento tras cambiar stock',
      async (tipo) => {
        const ids = [
          await producto(tipo === 'ventas' ? 20 : 0),
          await producto(tipo === 'ventas' ? 20 : 0),
          await producto(tipo === 'ventas' ? 20 : 0),
        ];
        const doc = await documento(
          tipo,
          ids.map((productoId) => ({ productoId, cantidad: 10 })),
        );
        const d = await devolucion(tipo, doc, [2, 3, 5]);
        const stocks = await Promise.all(ids.map(saldo));
        const antes = await Promise.all(ids.map(movimientos));
        const method =
          tipo === 'ventas' ? 'entradaEnTransaccion' : 'salidaEnTransaccion';
        const original = inventario[method].bind(inventario);
        const spy = vi.spyOn(inventario, method);
        spy
          .mockImplementationOnce(original)
          .mockImplementationOnce(original)
          .mockImplementationOnce(async (tx, dto, user) => {
            const insert = vi
              .spyOn(tx.orm.public.MovimientoInventario, 'create')
              .mockRejectedValueOnce(
                new Error('Fallo último movimiento devolución'),
              );
            try {
              return await original(tx, dto, user);
            } finally {
              insert.mockRestore();
            }
          });
        try {
          const service = tipo === 'ventas' ? dvService : dcService;
          await expect(service.procesar(d.id, procesadorId)).rejects.toThrow(
            'Fallo último movimiento devolución',
          );
        } finally {
          spy.mockRestore();
        }
        expect(await Promise.all(ids.map(saldo))).toEqual(stocks);
        expect(await Promise.all(ids.map(movimientos))).toEqual(antes);
        expect(
          (await get(`${ruta(tipo)}/${d.id}`).expect(200)).body,
        ).toMatchObject({
          estado: 'BORRADOR',
          fechaProcesamiento: null,
          procesadaPorUsuarioId: null,
        });
      },
    );

    it('flujo comercial e histórico completo, Kardex 0→20→12→15→11 e históricos intactos', async () => {
      const p = await producto();
      const compra = await documento('compras', [
        { productoId: p, cantidad: 20 },
      ]);
      expect(await saldo(p)).toBe(20);
      const venta = await documento('ventas', [{ productoId: p, cantidad: 8 }]);
      expect(await saldo(p)).toBe(12);
      const originales = await movimientos(p);
      const ventaOriginal = (await get(`ventas/${venta.id}`).expect(200)).body;
      const compraOriginal = (await get(`compras/${compra.id}`).expect(200))
        .body;
      await productos.update(p, {
        precio: 250,
        costo: 180,
        unidadMedida: 'CAJA',
        claveProductoServicioSat: '42311512',
        objetoImpuestoSat: '2',
      });
      expect(await saldo(p)).toBe(12);
      expect(await movimientos(p)).toEqual(originales);
      const dv = await devolucion('ventas', venta, [3]);
      const dc = await devolucion('compras', compra, [4]);
      expect(dv).toMatchObject({
        subtotal: '450.00',
        costoTotal: '300.00',
        detalles: [{ precioUnitario: '150.00', costoUnitario: '100.00' }],
      });
      expect(dc).toMatchObject({
        subtotal: '400.00',
        detalles: [{ costoUnitario: '100.00' }],
      });
      await post(`devoluciones/ventas/${dv.id}/procesar`).expect(201);
      expect(await saldo(p)).toBe(15);
      await post(`devoluciones/compras/${dc.id}/procesar`).expect(201);
      expect(await saldo(p)).toBe(11);
      const kardex = await get(
        `inventario/kardex/${p}?page=1&limit=20&sortOrder=asc`,
      ).expect(200);
      expect(kardex.body.producto.stockActual).toBe(11);
      expect(kardex.body.data).toMatchObject([
        { tipo: 'ENTRADA', cantidad: 20, stockAnterior: 0, stockNuevo: 20 },
        { tipo: 'SALIDA', cantidad: 8, stockAnterior: 20, stockNuevo: 12 },
        { tipo: 'ENTRADA', cantidad: 3, stockAnterior: 12, stockNuevo: 15 },
        { tipo: 'SALIDA', cantidad: 4, stockAnterior: 15, stockNuevo: 11 },
      ]);
      expect(kardex.body.data).toHaveLength(4);
      expect((await movimientos(p)).slice(2)).toEqual(originales);
      expect((await get(`ventas/${venta.id}`).expect(200)).body).toEqual(
        ventaOriginal,
      );
      expect((await get(`compras/${compra.id}`).expect(200)).body).toEqual(
        compraOriginal,
      );
    });

    it('devoluciones venta/compra concurrentes con productos inversos respetan el orden global', async () => {
      const a = await producto();
      const b = await producto();
      const compra = await documento('compras', [
        { productoId: b, cantidad: 20 },
        { productoId: a, cantidad: 20 },
      ]);
      const venta = await documento('ventas', [
        { productoId: a, cantidad: 8 },
        { productoId: b, cantidad: 8 },
      ]);
      const dv = await devolucion('ventas', venta, [3, 3]);
      const dc = await devolucion('compras', compra, [4, 4]);
      await Promise.all([
        post(`devoluciones/ventas/${dv.id}/procesar`).expect(201),
        post(`devoluciones/compras/${dc.id}/procesar`).expect(201),
      ]);
      expect(await Promise.all([saldo(a), saldo(b)])).toEqual([11, 11]);
      for (const id of [a, b]) {
        const history = (await movimientos(id)).sort((x, y) => x.id - y.id);
        let stock = 0;
        for (const m of history) {
          expect(m.stockAnterior).toBe(stock);
          stock += (m.tipo === 'SALIDA' ? -1 : 1) * m.cantidad;
          expect(m.stockNuevo).toBe(stock);
          expect(stock).toBeGreaterThanOrEqual(0);
        }
        expect(stock).toBe(11);
      }
    });
    for (const tipo of ['ventas', 'compras'] as const) {
      it(`${tipo}: dos devoluciones concurrentes válidas comparten disponibilidad`, async () => {
        const { doc, productoId } = await elegible(tipo);
        const a = await devolucion(tipo, doc, [3]);
        const b = await devolucion(tipo, doc, [4]);
        const stock = await saldo(productoId);
        await Promise.all([
          post(`${ruta(tipo)}/${a.id}/procesar`).expect(201),
          post(`${ruta(tipo)}/${b.id}/procesar`).expect(201),
        ]);
        expect(await saldo(productoId)).toBe(
          stock + (tipo === 'ventas' ? 7 : -7),
        );
        expect(
          (await get(`${ruta(tipo)}/disponible/${doc.id}`).expect(200)).body
            .detalles[0],
        ).toMatchObject({ cantidadDevuelta: 7, cantidadDisponible: 3 });
      });
      it(`${tipo}: procesar y cancelar concurrentes permiten una sola transición`, async () => {
        const { doc, productoId } = await elegible(tipo);
        const d = await devolucion(tipo, doc, [2]);
        const stock = await saldo(productoId);
        const antes = await movimientos(productoId);
        const responses = await Promise.all([
          post(`${ruta(tipo)}/${d.id}/procesar`),
          post(`${ruta(tipo)}/${d.id}/cancelar`),
        ]);
        expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
          201, 409,
        ]);
        const estado = (await get(`${ruta(tipo)}/${d.id}`).expect(200)).body
          .estado;
        const cambio =
          estado === 'PROCESADA' ? (tipo === 'ventas' ? 2 : -2) : 0;
        expect(await saldo(productoId)).toBe(stock + cambio);
        expect(await movimientos(productoId)).toHaveLength(
          antes.length + (cambio === 0 ? 0 : 1),
        );
      });
      it(`${tipo}: DELETE concurrente con procesamiento preserva atomicidad`, async () => {
        const { doc, productoId } = await elegible(tipo);
        const d = await devolucion(tipo, doc, [2]);
        const stock = await saldo(productoId);
        const antes = await movimientos(productoId);
        const [procesar, eliminar] = await Promise.all([
          post(`${ruta(tipo)}/${d.id}/procesar`),
          del(`${ruta(tipo)}/${d.id}`),
        ]);
        expect([
          [201, 409],
          [404, 200],
        ]).toContainEqual([procesar.status, eliminar.status]);
        expect(await saldo(productoId)).toBe(
          stock + (procesar.status === 201 ? (tipo === 'ventas' ? 2 : -2) : 0),
        );
        expect(await movimientos(productoId)).toHaveLength(
          antes.length + (procesar.status === 201 ? 1 : 0),
        );
      });
      it(`${tipo}: fechas inclusivas UTC y orden estable`, async () => {
        const { doc } = await elegible(tipo);
        const d = await devolucion(tipo, doc, [1]);
        const orm = database.db.orm.public;
        if (tipo === 'ventas')
          await orm.DevolucionVenta.where({ id: d.id }).update({
            createdAt: '2026-09-30T23:59:59.999Z',
          });
        else
          await orm.DevolucionCompra.where({ id: d.id }).update({
            createdAt: '2026-09-30T23:59:59.999Z',
          });
        const base = `${ruta(tipo)}?${originalKey(tipo)}=${doc.id}`;
        expect(
          (
            await get(
              `${base}&fechaInicio=2026-09-30&fechaFin=2026-09-30`,
            ).expect(200)
          ).body.pagination.totalItems,
        ).toBe(1);
        expect(
          (await get(`${base}&fechaInicio=2026-10-01`).expect(200)).body
            .pagination.totalItems,
        ).toBe(0);
        expect(
          (
            await get(
              `${base}&fechaFin=${encodeURIComponent('2026-09-30T17:59:59.999-06:00')}`,
            ).expect(200)
          ).body.pagination.totalItems,
        ).toBe(1);
        for (const sortBy of ['createdAt', 'folio', 'estado', 'subtotal']) {
          expect(
            (await get(`${base}&sortBy=${sortBy}`).expect(200)).body.data[0].id,
          ).toBe(d.id);
        }
      });
      it(`${tipo}: PostgreSQL rechaza cantidad cero, procesada sin auditoría y FK restrict`, async () => {
        const { doc } = await elegible(tipo);
        const d = await devolucion(tipo, doc, [1]);
        await expect(
          database.db.transaction(async (tx) => {
            if (tipo === 'ventas')
              await tx.orm.public.DetalleDevolucionVenta.where({
                devolucionVentaId: d.id,
              }).update({ cantidad: 0 });
            else
              await tx.orm.public.DetalleDevolucionCompra.where({
                devolucionCompraId: d.id,
              }).update({ cantidad: 0 });
          }),
        ).rejects.toThrow();
        await expect(
          database.db.transaction(async (tx) => {
            if (tipo === 'ventas')
              await tx.orm.public.DevolucionVenta.where({ id: d.id }).update({
                estado: 'PROCESADA',
              });
            else
              await tx.orm.public.DevolucionCompra.where({ id: d.id }).update({
                estado: 'PROCESADA',
              });
          }),
        ).rejects.toThrow();
        await expect(
          database.db.transaction(async (tx) => {
            if (tipo === 'ventas')
              await tx.orm.public.DetalleVenta.where({
                id: doc.detalles[0]!.id,
              }).delete();
            else
              await tx.orm.public.DetalleCompra.where({
                id: doc.detalles[0]!.id,
              }).delete();
          }),
        ).rejects.toThrow();
        await expect(
          database.db.transaction(async (tx) => {
            if (tipo === 'ventas')
              await tx.orm.public.DevolucionVenta.where({ id: d.id }).delete();
            else
              await tx.orm.public.DevolucionCompra.where({ id: d.id }).delete();
          }),
        ).rejects.toThrow();
        expect(
          (await get(`${ruta(tipo)}/${d.id}`).expect(200)).body.estado,
        ).toBe('BORRADOR');
      });
    }

    it('ventas concurrentes con devolución proveedor protegen el mismo stock físico', async () => {
      const { doc, productoId } = await elegible('compras');
      const venta = await documento(
        'ventas',
        [{ productoId, cantidad: 7 }],
        false,
      );
      const dc = await devolucion('compras', doc, [7]);
      const responses = await Promise.all([
        post(`ventas/${venta.id}/confirmar`),
        post(`devoluciones/compras/${dc.id}/procesar`),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await saldo(productoId)).toBe(3);
      expect(
        (await movimientos(productoId)).filter((m) => m.tipo === 'SALIDA'),
      ).toHaveLength(1);
    });
  },
);
