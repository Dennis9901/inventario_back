import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ListasPreciosService } from '../src/modules/listas-precios/listas-precios.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { schemas } from '../src/common/http/openapi.schemas.js';
import { tieneSqlState } from '../src/common/errores-db.js';

describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Backend 5B PostgreSQL',
  () => {
    let app: INestApplication,
      db: DatabaseService,
      precios: ListasPreciosService;
    let rolId: number,
      usuarioId: number,
      categoriaId: number,
      clienteId: number,
      proveedorId: number;
    let admin: string, lectura: string;
    const prefix = `TEST-5B-${randomUUID()}`.toUpperCase();
    const productos: number[] = [],
      listas: number[] = [],
      ventas: number[] = [],
      compras: number[] = [],
      devoluciones: number[] = [];
    let anteriorPredeterminada: number | null = null;
    const evidencia: Record<string, unknown> = {};
    const http = () => request(app.getHttpServer());
    const get = (ruta: string, token = lectura) =>
      http().get(`/api/v1/${ruta}`).set('Authorization', `Bearer ${token}`);
    const post = (ruta: string, body: object, token = admin) =>
      http()
        .post(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const patch = (ruta: string, body: object = {}, token = admin) =>
      http()
        .patch(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const del = (ruta: string) =>
      http().delete(`/api/v1/${ruta}`).set('Authorization', `Bearer ${admin}`);
    const desde = '2026-01-01T00:00:00Z';
    async function producto() {
      const p = await app.get(ProductosService).create({
        sku: `${prefix}-${productos.length}`,
        nombre: prefix,
        costo: 100,
        precio: 160,
        stockMinimo: 0,
        categoriaId,
      });
      productos.push(p.id);
      return p.id;
    }
    async function lista() {
      const r = await post('listas-precios', {
        codigo: `T${randomUUID().replaceAll('-', '').slice(0, 30).toUpperCase()}`,
        nombre: prefix,
      }).expect(201);
      listas.push(r.body.id);
      return r.body.id as number;
    }
    const asignar = (
      l: number,
      p: number,
      precio = '135.00',
      inicio = desde,
      fin: string | null = null,
    ) =>
      post(`listas-precios/${l}/productos`, {
        productoId: p,
        precio,
        vigenciaDesde: inicio,
        vigenciaHasta: fin,
      });
    async function venta(p: number, l?: number, cantidad = 2) {
      const r = await post('ventas', {
        clienteId,
        ...(l !== undefined && { listaPrecioId: l }),
        detalles: [{ productoId: p, cantidad }],
      }).expect(201);
      ventas.push(r.body.id);
      return r.body;
    }
    beforeAll(async () => {
      const mod = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = mod.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
      db = app.get(DatabaseService);
      precios = app.get(ListasPreciosService);
      const o = db.db.orm.public;
      anteriorPredeterminada =
        (await o.ListaPrecio.where({ esPredeterminada: true }).first())?.id ??
        null;
      rolId = (await o.Rol.create({ nombre: prefix })).id;
      usuarioId = (
        await o.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.invalid`,
          password: 'fixture',
          rolId,
        })
      ).id;
      categoriaId = (await o.Categoria.create({ nombre: prefix })).id;
      clienteId = (await o.Cliente.create({ nombre: prefix })).id;
      proveedorId = (await o.Proveedor.create({ nombre: prefix })).id;
      admin = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      lectura = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'CONSULTA' });
    });
    afterAll(async () => {
      try {
        if (db)
          await db.db.transaction(async (tx) => {
            for (const id of devoluciones) {
              await tx.orm.public.DetalleDevolucionVenta.where({
                devolucionVentaId: id,
              }).deleteAll();
              await tx.orm.public.DevolucionVenta.where({ id }).delete();
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
            for (const id of listas) {
              await tx.orm.public.ProductoPrecio.where({
                listaPrecioId: id,
              }).deleteAll();
              await tx.orm.public.ListaPrecio.where({ id }).deleteAll();
            }
            if (anteriorPredeterminada)
              await tx.orm.public.ListaPrecio.where({
                id: anteriorPredeterminada,
              }).update({ esPredeterminada: true });
            for (const id of productos) {
              await tx.orm.public.MovimientoInventario.where({
                productoId: id,
              }).deleteAll();
              await tx.orm.public.Existencia.where({
                productoId: id,
              }).deleteAll();
              await tx.orm.public.Producto.where({ id }).delete();
            }
            await tx.orm.public.Auditoria.where({ usuarioId }).deleteAll();
            await tx.orm.public.Cliente.where({ id: clienteId }).delete();
            await tx.orm.public.Proveedor.where({ id: proveedorId }).delete();
            await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            await tx.orm.public.Usuario.where({ id: usuarioId }).delete();
            await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
        if (db) {
          expect(
            await db.db.orm.public.ListaPrecio.where((l) =>
              l.id.in(listas),
            ).all(),
          ).toEqual([]);
          expect(
            await db.db.orm.public.Producto.where((p) =>
              p.id.in(productos),
            ).all(),
          ).toEqual([]);
          evidencia.limpieza = true;
          await writeFile(
            'docs/backend-5b/evidencia.json',
            JSON.stringify(evidencia, null, 2),
          );
        }
      } finally {
        if (app) await app.close();
      }
    });

    it('401 lecturas sin JWT', async () => {
      await http().get('/api/v1/listas-precios').expect(401);
    });
    it('403 mutaciones para consulta', async () => {
      await post(
        'listas-precios',
        { codigo: 'PUBLICO', nombre: prefix },
        lectura,
      ).expect(403);
    });
    it('crear, consultar, editar nombre sin cambiar identidad y paginar', async () => {
      const l = await lista();
      const original = await get(`listas-precios/${l}`).expect(200);
      await patch(`listas-precios/${l}`, {
        nombre: 'Clínica renombrada',
      }).expect(200);
      expect((await get(`listas-precios/${l}`)).body.codigo).toBe(
        original.body.codigo,
      );
      await patch(`listas-precios/${l}`, { codigo: 'OTRO' }).expect(409);
      const r = await get(
        `listas-precios?search=${original.body.codigo}&page=1&limit=1`,
      ).expect(200);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.pagination.totalItems).toBe(1);
    });
    it('nombre repetido permitido; código duplicado 409', async () => {
      const l = await lista();
      const r = await get(`listas-precios/${l}`);
      await post('listas-precios', {
        codigo: r.body.codigo,
        nombre: 'Otro',
      }).expect(409);
      await lista();
    });
    it('activar/desactivar; delete vacío permitido, inexistente 404', async () => {
      const l = await lista();
      await patch(`listas-precios/${l}/desactivar`).expect(200);
      expect(
        (await get('listas-precios?activo=false')).body.data.some(
          (x: { id: number }) => x.id === l,
        ),
      ).toBe(true);
      await patch(`listas-precios/${l}/desactivar`).expect(409);
      await patch(`listas-precios/${l}/activar`).expect(200);
      await del(`listas-precios/${l}`).expect(200);
      await get(`listas-precios/${l}`).expect(404);
      await get('listas-precios/2147483647').expect(404);
    });
    it('predeterminada activa; no desactivar/eliminar, carrera termina con una', async () => {
      const a = await lista(),
        b = await lista();
      const resultados = await Promise.all([
        patch(`listas-precios/${a}/predeterminada`),
        patch(`listas-precios/${b}/predeterminada`),
      ]);
      expect(resultados.map((r) => r.status)).toEqual([200, 200]);
      const rows = await db.db.orm.public.ListaPrecio.where({
        esPredeterminada: true,
      }).all();
      expect(rows).toHaveLength(1);
      await patch(`listas-precios/${rows[0]!.id}/desactivar`).expect(409);
      await del(`listas-precios/${rows[0]!.id}`).expect(409);
      const otro = rows[0]!.id === a ? b : a;
      await patch(`listas-precios/${otro}/desactivar`).expect(200);
      await patch(`listas-precios/${otro}/predeterminada`).expect(409);
      evidencia.predeterminadaConcurrente = {
        statuses: resultados.map((r) => r.status),
        cantidad: rows.length,
      };
    });
    it('BD impide dos predeterminadas incluso fuera de servicio', async () => {
      const l = await lista();
      let error: unknown;
      try {
        await db.db.orm.public.ListaPrecio.where({ id: l }).update({
          esPredeterminada: true,
        });
      } catch (e) {
        error = e;
      }
      expect(tieneSqlState(error, '23505')).toBe(true);
    });
    it('precio base 160, CLINICA 135, fallback sin vigencia y legacy', async () => {
      const p = await producto(),
        l = await lista();
      await asignar(l, p).expect(201);
      expect(
        (await get(`productos/${p}/precio?listaPrecioId=${l}`)).body,
      ).toMatchObject({ precio: '135.00', origen: 'LISTA_PRECIO' });
      expect((await get(`productos/${p}/precio`)).body).toMatchObject({
        precio: '160.00',
        origen: 'PRECIO_BASE',
      });
      const vacia = await lista();
      expect(
        (await get(`productos/${p}/precio?listaPrecioId=${vacia}`)).body,
      ).toMatchObject({
        precio: '160.00',
        origen: 'PRECIO_BASE',
        listaPrecioId: vacia,
      });
      expect((await venta(p)).detalles[0].precioUnitario).toBe('160.00');
      evidencia.legacy = true;
    });
    it('resuelve fechas históricas y frontera [desde,hasta)', async () => {
      const p = await producto(),
        l = await lista();
      await asignar(l, p, '100', desde, '2026-07-01T00:00:00Z').expect(201);
      await asignar(l, p, '120', '2026-07-01T00:00:00Z').expect(201);
      expect(
        (await precios.resolverPrecio(p, l, '2026-03-01T00:00:00Z')).precio,
      ).toBe('100.00');
      expect(
        (await precios.resolverPrecio(p, l, '2026-08-01T00:00:00Z')).precio,
      ).toBe('120.00');
      expect(
        (await precios.resolverPrecio(p, l, '2026-07-01T00:00:00Z')).precio,
      ).toBe('120.00');
      expect(
        (await precios.resolverPrecio(p, l, '2025-12-31T23:59:59Z')).origen,
      ).toBe('PRECIO_BASE');
      await get(`productos/${p}/precio?fecha=2026-03-01`).expect(400);
    });
    it('precio cero, consulta por id, filtros/paginación y no DELETE de historia', async () => {
      const p = await producto(),
        l = await lista();
      const r = await asignar(l, p, '0').expect(201);
      expect(
        (await get(`listas-precios/${l}/productos/${r.body.id}`)).body.precio,
      ).toBe('0.00');
      const listado = await get(
        `listas-precios/${l}/productos?productoId=${p}&vigenteEn=2026-03-01T00:00:00Z&search=TEST-5B&limit=1`,
      ).expect(200);
      expect(listado.body.data).toHaveLength(1);
      expect(listado.body.data[0].producto.id).toBe(p);
      await del(`listas-precios/${l}/productos/${r.body.id}`).expect(404);
      await del(`listas-precios/${l}`).expect(409);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {
        precio: '10',
      }).expect(400);
    });
    it.each(['NaN', 'Infinity', '-1', '1.001', '1000000000001', 135, null])(
      'precio inválido %s',
      async (precio) => {
        const l = await lista(),
          p = await producto();
        await asignar(l, p, precio as string).expect(400);
      },
    );
    it('validación estricta de intervalos, body redundante e ids', async () => {
      const l = await lista(),
        p = await producto();
      await asignar(l, p, '10', desde, desde).expect(400);
      await asignar(l, p, '10', desde, '2025-01-01T00:00:00Z').expect(400);
      await post(`listas-precios/${l}/productos`, {
        productoId: p,
        listaPrecioId: l,
        precio: '10',
        vigenciaDesde: desde,
      }).expect(400);
      await asignar(l, 2147483647).expect(404);
      await asignar(2147483647, p).expect(404);
      await get(`productos/2147483647/precio`).expect(404);
      await get(`productos/${p}/precio?listaPrecioId=2147483647`).expect(404);
    });
    it('lista/producto inactivos rechazan configuración y resolución', async () => {
      const l = await lista(),
        p = await producto();
      await patch(`listas-precios/${l}/desactivar`).expect(200);
      await asignar(l, p).expect(409);
      await get(`productos/${p}/precio?listaPrecioId=${l}`).expect(409);
      await patch(`listas-precios/${l}/activar`).expect(200);
      await patch(`productos/${p}/desactivar`).expect(200);
      await asignar(l, p).expect(409);
      await get(`productos/${p}/precio`).expect(409);
    });
    it('solapamiento y carrera HTTP: exactamente un precio', async () => {
      const l = await lista(),
        p = await producto();
      const r = await Promise.all([
        asignar(l, p, '100', desde, '2027-01-01T00:00:00Z'),
        asignar(l, p, '120', '2026-06-01T00:00:00Z', '2027-01-01T00:00:00Z'),
      ]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(
        await db.db.orm.public.ProductoPrecio.where({
          listaPrecioId: l,
          productoId: p,
        }).all(),
      ).toHaveLength(1);
      evidencia.solapamientoConcurrente = r.map((x) => x.status);
    });
    it('exclusión PostgreSQL rechaza carrera directa sin locks de aplicación', async () => {
      const l = await lista(),
        p = await producto();
      const r = await Promise.allSettled(
        ['100.00', '120.00'].map((precio) =>
          db.db.orm.public.ProductoPrecio.create({
            productoId: p,
            listaPrecioId: l,
            precio,
            vigenciaDesde: desde,
            vigenciaHasta: null,
          }),
        ),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const fallo = r.find((x) => x.status === 'rejected');
      expect(
        fallo?.status === 'rejected' &&
          (tieneSqlState(fallo.reason, '23P01') ||
            tieneSqlState(fallo.reason, '40P01')),
      ).toBe(true);
      // Dos inserciones GiST simultáneas pueden abortar una por deadlock;
      // ninguna carrera puede dejar solapamiento. Verificar también 23P01 serial.
      expect(
        await db.db.orm.public.ProductoPrecio.where({
          productoId: p,
          listaPrecioId: l,
        }).all(),
      ).toHaveLength(1);
      let serial: unknown;
      try {
        await db.db.orm.public.ProductoPrecio.create({
          productoId: p,
          listaPrecioId: l,
          precio: '130.00',
          vigenciaDesde: desde,
          vigenciaHasta: null,
        });
      } catch (e: unknown) {
        serial = e;
      }
      expect(tieneSqlState(serial, '23P01')).toBe(true);
      evidencia.exclusionDirecta = {
        aprobados: 1,
        rechazados: 1,
        sqlState:
          fallo?.status === 'rejected' && tieneSqlState(fallo.reason, '40P01')
            ? '40P01'
            : '23P01',
        rechazoSerial: '23P01',
      };
    });
    it('cierres solo futuros, precio/inicio inmutables, vigencias nuevas explícitas', async () => {
      const l = await lista(),
        p = await producto();
      const r = await asignar(l, p).expect(201);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {}).expect(400);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {
        vigenciaHasta: '2026-02-01T00:00:00Z',
      }).expect(409);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {
        vigenciaDesde: '2027-01-01T00:00:00Z',
      }).expect(400);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {
        vigenciaHasta: '2035-01-01T00:00:00Z',
      }).expect(200);
      await patch(`listas-precios/${l}/productos/${r.body.id}`, {
        vigenciaHasta: '2036-01-01T00:00:00Z',
      }).expect(409);
      await asignar(l, p, '145', '2035-01-01T00:00:00Z').expect(201);
    });
    it('BORRADOR cambia lista recalculando todas las líneas y null regresa a base', async () => {
      const a = await producto(),
        b = await producto(),
        l = await lista();
      await asignar(l, a).expect(201);
      await asignar(l, b, '140').expect(201);
      const r = await post('ventas', {
        clienteId,
        detalles: [
          { productoId: a, cantidad: 2 },
          { productoId: b, cantidad: 3 },
        ],
      }).expect(201);
      ventas.push(r.body.id);
      const cambio = await patch(`ventas/${r.body.id}`, {
        listaPrecioId: l,
      }).expect(200);
      expect(
        cambio.body.detalles
          .map((d: { precioUnitario: string }) => d.precioUnitario)
          .sort(),
      ).toEqual(['135.00', '140.00']);
      expect(cambio.body.subtotal).toBe('690.00');
      const base = await patch(`ventas/${r.body.id}`, {
        listaPrecioId: null,
      }).expect(200);
      expect(base.body.subtotal).toBe('800.00');
      await patch(`ventas/${r.body.id}`, { listaPrecioId: 2147483647 }).expect(
        404,
      );
    });
    it('venta concurrente con configuración: snapshots de un solo estado comercial', async () => {
      const a = await producto(),
        b = await producto(),
        l = await lista();
      await asignar(l, a).expect(201);
      await asignar(l, b).expect(201);
      const [r] = await Promise.all([
        post('ventas', {
          clienteId,
          listaPrecioId: l,
          detalles: [
            { productoId: a, cantidad: 1 },
            { productoId: b, cantidad: 1 },
          ],
        }),
        db.transaction(async (tx) => {
          await precios.bloquearConfiguracion(tx, true);
          await tx.orm.public.ProductoPrecio.where({
            listaPrecioId: l,
          }).updateAll({ activo: false });
          for (const productoId of [a, b])
            await tx.orm.public.ProductoPrecio.create({
              listaPrecioId: l,
              productoId,
              precio: '145.00',
              vigenciaDesde: desde,
            });
        }),
      ]);
      expect(r.status).toBe(201);
      ventas.push(r.body.id);
      const valores = r.body.detalles.map(
        (d: { precioUnitario: string }) => d.precioUnitario,
      );
      expect(new Set(valores).size).toBe(1);
      expect(['135.00', '145.00']).toContain(valores[0]);
      evidencia.ventaConcurrente = valores;
    });
    it('edición concurrente de BORRADOR y cambio de configuración conserva un estado completo', async () => {
      const a = await producto(),
        b = await producto(),
        l = await lista();
      await asignar(l, a).expect(201);
      await asignar(l, b).expect(201);
      const original = await post('ventas', {
        clienteId,
        detalles: [
          { productoId: a, cantidad: 1 },
          { productoId: b, cantidad: 1 },
        ],
      }).expect(201);
      ventas.push(original.body.id);
      const [r] = await Promise.all([
        patch(`ventas/${original.body.id}`, { listaPrecioId: l }),
        db.transaction(async (tx) => {
          await precios.bloquearConfiguracion(tx, true);
          await tx.orm.public.ProductoPrecio.where({
            listaPrecioId: l,
          }).updateAll({ activo: false });
          for (const productoId of [a, b])
            await tx.orm.public.ProductoPrecio.create({
              productoId,
              listaPrecioId: l,
              precio: '145.00',
              vigenciaDesde: desde,
            });
        }),
      ]);
      expect(r.status).toBe(200);
      const valores = r.body.detalles.map(
        (d: { precioUnitario: string }) => d.precioUnitario,
      );
      expect(new Set(valores).size).toBe(1);
      expect(['135.00', '145.00']).toContain(valores[0]);
      const metadata = await patch(`ventas/${original.body.id}`, {
        observacion: 'Conservar snapshot',
      }).expect(200);
      expect(metadata.body.detalles).toEqual(r.body.detalles);
      evidencia.edicionConcurrente = valores;
    });
    it('403 para todas las mutaciones de lista/precio y lecturas permitidas', async () => {
      const l = await lista(),
        p = await producto();
      const precio = await asignar(l, p).expect(201);
      await patch(`listas-precios/${l}`, { nombre: 'Otro' }, lectura).expect(
        403,
      );
      for (const accion of ['activar', 'desactivar', 'predeterminada'])
        await patch(`listas-precios/${l}/${accion}`, {}, lectura).expect(403);
      await post(
        `listas-precios/${l}/productos`,
        { productoId: p, precio: '1', vigenciaDesde: desde },
        lectura,
      ).expect(403);
      await patch(
        `listas-precios/${l}/productos/${precio.body.id}`,
        { vigenciaHasta: '2035-01-01T00:00:00Z' },
        lectura,
      ).expect(403);
      await http()
        .delete(`/api/v1/listas-precios/${l}`)
        .set('Authorization', `Bearer ${lectura}`)
        .expect(403);
      await get(`listas-precios/${l}/productos`).expect(200);
      await get(`productos/${p}/precio?listaPrecioId=${l}`).expect(200);
    });
    it('flujo comercial real: compra +20, ventas -8/-2, devolución +3, stock 13; históricos inmutables', async () => {
      const p = await producto(),
        publico = await lista(),
        clinica = await lista();
      await asignar(publico, p, '160').expect(201);
      const precio = await asignar(clinica, p).expect(201);
      const c = await post('compras', {
        proveedorId,
        detalles: [{ productoId: p, cantidad: 20, costoUnitario: 100 }],
      }).expect(201);
      compras.push(c.body.id);
      await post(`compras/${c.body.id}/recibir`, {}).expect(201);
      const v1 = await venta(p, clinica, 8);
      expect(v1.detalles[0].precioUnitario).toBe('135.00');
      await post(`ventas/${v1.id}/confirmar`, {}).expect(201);
      expect(
        (await db.db.orm.public.Existencia.where({ productoId: p }).first())!
          .cantidad,
      ).toBe(12);
      const rutas = [
        'dashboard/resumen',
        'reportes/ventas',
        'reportes/utilidad',
        'reportes/inventario',
      ];
      const antes = await Promise.all(
        rutas.map((r) => get(r, admin).expect(200)),
      );
      const corte = new Date(Date.now() + 1000).toISOString();
      await patch(`listas-precios/${clinica}/productos/${precio.body.id}`, {
        vigenciaHasta: corte,
      }).expect(200);
      await asignar(clinica, p, '145', corte).expect(201);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      for (let i = 0; i < rutas.length; i++) {
        const despues = await get(rutas[i]!, admin).expect(200);
        expect(despues.body).toEqual(antes[i]!.body);
      }
      expect(
        (await get(`ventas/${v1.id}`)).body.detalles[0].precioUnitario,
      ).toBe('135.00');
      const v2 = await venta(p, clinica, 2);
      expect(v2.detalles[0].precioUnitario).toBe('145.00');
      await post(`ventas/${v2.id}/confirmar`, {}).expect(201);
      expect(
        (await db.db.orm.public.Existencia.where({ productoId: p }).first())!
          .cantidad,
      ).toBe(10);
      const dv = await post('devoluciones/ventas', {
        ventaId: v1.id,
        motivo: 'Fixture 5B',
        detalles: [{ detalleVentaId: v1.detalles[0].id, cantidad: 3 }],
      }).expect(201);
      devoluciones.push(dv.body.id);
      expect(dv.body.detalles[0].precioUnitario).toBe('135.00');
      expect(dv.body.subtotal).toBe('405.00');
      await post(`devoluciones/ventas/${dv.body.id}/procesar`, {}).expect(201);
      const stock = await db.db.orm.public.Existencia.where({
        productoId: p,
      }).first();
      expect(stock!.cantidad).toBe(13);
      const kardex = await db.db.orm.public.MovimientoInventario.where({
        productoId: p,
      })
        .orderBy((m) => m.id.asc())
        .all();
      expect(kardex.map((m) => m.stockNuevo - m.stockAnterior)).toEqual([
        20, -8, -2, 3,
      ]);
      await patch(`ventas/${v1.id}`, { listaPrecioId: publico }).expect(409);
      const cancelada = await venta(p, clinica);
      await post(`ventas/${cancelada.id}/cancelar`, {}).expect(201);
      await patch(`ventas/${cancelada.id}`, { listaPrecioId: publico }).expect(
        409,
      );
      expect(
        (await get(`compras/${c.body.id}`)).body.detalles[0].costoUnitario,
      ).toBe('100.00');
      evidencia.comercial = {
        productoId: p,
        precioBase: '160.00',
        venta1: '135.00',
        venta2: '145.00',
        devolucion: '135.00',
        costoCompra: '100.00',
        stockFinal: stock!.cantidad,
        kardex,
      };
    });
    it('auditoría y Swagger documentan recursos y lista opcional', async () => {
      const acciones = await db.db.orm.public.Auditoria.where({
        usuarioId,
      }).all();
      expect(acciones.some((a) => a.accion === 'LISTA_PRECIO_CREADA')).toBe(
        true,
      );
      expect(
        acciones.some((a) => a.accion === 'PRODUCTO_PRECIO_VIGENCIA_CERRADA'),
      ).toBe(true);
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      doc.components ??= {};
      doc.components.schemas = { ...doc.components.schemas, ...schemas };
      expect(doc.paths['/api/v1/productos/{productoId}/precio']).toBeDefined();
      expect(doc.components.schemas.CreateVentaDto).toHaveProperty(
        'properties.listaPrecioId',
      );
      await writeFile(
        'docs/backend-5b/openapi.json',
        JSON.stringify(doc, null, 2),
      );
    });
  },
);
