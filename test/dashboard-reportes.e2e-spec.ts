import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { ComprasService } from '../src/modules/compras/compras.service.js';
import { VentasService } from '../src/modules/ventas/ventas.service.js';
import { DevolucionesVentaService } from '../src/modules/devoluciones/devoluciones-venta.service.js';
import { DevolucionesCompraService } from '../src/modules/devoluciones/devoluciones-compra.service.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { centavos } from '../src/common/dinero.js';

const rango = 'fechaInicio=2040-10-01&fechaFin=2040-10-03';
const rutas = [
  'dashboard/resumen',
  'dashboard/ventas',
  'dashboard/compras',
  'dashboard/productos-mas-vendidos',
  'dashboard/stock-bajo',
  'dashboard/movimientos-recientes',
  'dashboard/actividad-reciente',
  'dashboard/clientes-principales',
  'dashboard/proveedores-principales',
  'reportes/ventas',
  'reportes/compras',
  'reportes/utilidad',
  'reportes/inventario',
  'reportes/kardex',
];

describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Dashboard y Reportes PostgreSQL real',
  () => {
    let app: INestApplication,
      database: DatabaseService,
      productos: ProductosService,
      dashboard: DashboardService;
    let rolId: number,
      usuarioId: number,
      categoriaId: number,
      clienteId: number,
      proveedorId: number;
    let token: string, consultaToken: string;
    const prefix = `TEST-ANALITICA-${randomUUID()}`.toUpperCase();
    const pIds: number[] = [],
      vIds: number[] = [],
      cIds: number[] = [],
      dvIds: number[] = [],
      dcIds: number[] = [];
    let ventaId: number, compraId: number;
    let valorAntes: Awaited<ReturnType<DashboardService['inventarioActual']>>;
    const evidencia: Record<string, unknown> = {};
    const get = (path: string, jwt = token) =>
      request(app.getHttpServer())
        .get(`/api/v1/${path}`)
        .set('Authorization', `Bearer ${jwt}`);

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');

      await app.init();
      database = app.get(DatabaseService);
      productos = app.get(ProductosService);
      dashboard = app.get(DashboardService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix })).id;
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.test`,
          password: 'NO-EXPONER',
          rolId,
        })
      ).id;
      categoriaId = (await orm.Categoria.create({ nombre: prefix })).id;
      clienteId = (await orm.Cliente.create({ nombre: prefix })).id;
      proveedorId = (await orm.Proveedor.create({ nombre: prefix })).id;
      token = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      consultaToken = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'CONSULTA' });
      valorAntes = await dashboard.inventarioActual();
      for (const [letra, costo, precio] of [
        ['A', 100, 150],
        ['B', 50, 80],
      ] as const) {
        const p = await productos.create({
          sku: `${prefix}-${letra}`,
          nombre: `${prefix}-${letra}`,
          costo,
          precio,
          categoriaId,
          stockMinimo: 15,
        });
        pIds.push(p.id);
      }
      const compras = app.get(ComprasService),
        ventas = app.get(VentasService);
      const compra = await compras.create(
        {
          proveedorId,
          detalles: [
            { productoId: pIds[0]!, cantidad: 20, costoUnitario: 100 },
            { productoId: pIds[1]!, cantidad: 30, costoUnitario: 50 },
          ],
        },
        usuarioId,
      );
      compraId = compra.id;
      cIds.push(compra.id);
      await compras.recibir(compra.id, usuarioId);
      const venta = await ventas.create(
        {
          clienteId,
          impuestos: 320,
          detalles: [
            { productoId: pIds[0]!, cantidad: 8 },
            { productoId: pIds[1]!, cantidad: 10 },
          ],
        },
        usuarioId,
      );
      ventaId = venta.id;
      vIds.push(venta.id);
      await ventas.confirmar(venta.id, usuarioId);
      const dvService = app.get(DevolucionesVentaService),
        dcService = app.get(DevolucionesCompraService);
      const dv = await dvService.create(
        {
          ventaId,
          motivo: 'fixture',
          detalles: [
            {
              detalleVentaId: venta.detalles.find(
                (d) => d.productoId === pIds[0],
              )!.id,
              cantidad: 3,
            },
          ],
        },
        usuarioId,
      );
      dvIds.push(dv.id);
      await dvService.procesar(dv.id, usuarioId);
      const dc = await dcService.create(
        {
          compraId,
          motivo: 'fixture',
          detalles: [
            {
              detalleCompraId: compra.detalles.find(
                (d) => d.productoId === pIds[1],
              )!.id,
              cantidad: 5,
            },
          ],
        },
        usuarioId,
      );
      dcIds.push(dc.id);
      await dcService.procesar(dc.id, usuarioId);
      // Solo fixtures propios: fecha de creación distinta a la de ejecución de negocio.
      await orm.Venta.where({ id: ventaId }).update({
        createdAt: '2039-01-01T00:00:00Z',
        fechaConfirmacion: '2040-10-01T23:59:59.999Z',
      });
      await orm.Compra.where({ id: compraId }).update({
        createdAt: '2039-01-01T00:00:00Z',
        fechaRecepcion: '2040-10-01T12:00:00Z',
      });
      await orm.DevolucionVenta.where({ id: dv.id }).update({
        createdAt: '2039-01-01T00:00:00Z',
        fechaProcesamiento: '2040-10-03T00:00:00Z',
      });
      await orm.DevolucionCompra.where({ id: dc.id }).update({
        createdAt: '2039-01-01T00:00:00Z',
        fechaProcesamiento: '2040-10-03T12:00:00Z',
      });
      // Estados excluidos con importes reales.
      for (const cancelar of [false, true]) {
        const v = await ventas.create(
          { clienteId, detalles: [{ productoId: pIds[0]!, cantidad: 1 }] },
          usuarioId,
        );
        vIds.push(v.id);
        const c = await compras.create(
          {
            proveedorId,
            detalles: [
              { productoId: pIds[0]!, cantidad: 1, costoUnitario: 100 },
            ],
          },
          usuarioId,
        );
        cIds.push(c.id);
        await orm.Venta.where({ id: v.id }).update({
          createdAt: '2040-10-01T12:00:00Z',
        });
        await orm.Compra.where({ id: c.id }).update({
          createdAt: '2040-10-01T12:00:00Z',
        });
        const d = await dvService.create(
          {
            ventaId,
            motivo: 'excluir',
            detalles: [{ detalleVentaId: venta.detalles[0]!.id, cantidad: 1 }],
          },
          usuarioId,
        );
        dvIds.push(d.id);
        const e = await dcService.create(
          {
            compraId,
            motivo: 'excluir',
            detalles: [
              { detalleCompraId: compra.detalles[0]!.id, cantidad: 1 },
            ],
          },
          usuarioId,
        );
        dcIds.push(e.id);
        await orm.DevolucionVenta.where({ id: d.id }).update({
          createdAt: '2040-10-01T12:00:00Z',
        });
        await orm.DevolucionCompra.where({ id: e.id }).update({
          createdAt: '2040-10-01T12:00:00Z',
        });
        if (cancelar) {
          await ventas.cancelar(v.id, usuarioId);
          await compras.cancelar(c.id, usuarioId);
          await dvService.cancelar(d.id, usuarioId);
          await dcService.cancelar(e.id, usuarioId);
        }
      }
    });

    afterAll(async () => {
      try {
        if (database)
          await database.db.transaction(async (tx) => {
            for (const auditUserId of [usuarioId])
              if (auditUserId)
                await tx.orm.public.Auditoria.where({
                  usuarioId: auditUserId,
                }).deleteAll();
            const orm = tx.orm.public;
            for (const id of dvIds) {
              await orm.DetalleDevolucionVenta.where({
                devolucionVentaId: id,
              }).deleteAll();
              await orm.DevolucionVenta.where({ id }).delete();
            }
            for (const id of dcIds) {
              await orm.DetalleDevolucionCompra.where({
                devolucionCompraId: id,
              }).deleteAll();
              await orm.DevolucionCompra.where({ id }).delete();
            }
            for (const id of vIds) {
              await orm.DetalleVenta.where({ ventaId: id }).deleteAll();
              await orm.Venta.where({ id }).delete();
            }
            for (const id of cIds) {
              await orm.DetalleCompra.where({ compraId: id }).deleteAll();
              await orm.Compra.where({ id }).delete();
            }
            for (const id of pIds) {
              await orm.MovimientoInventario.where({
                productoId: id,
              }).deleteAll();
              await orm.Existencia.where({ productoId: id }).delete();
              await orm.Producto.where({ id }).delete();
            }
            if (clienteId) await orm.Cliente.where({ id: clienteId }).delete();
            if (proveedorId)
              await orm.Proveedor.where({ id: proveedorId }).delete();
            if (categoriaId)
              await orm.Categoria.where({ id: categoriaId }).delete();
            if (usuarioId) await orm.Usuario.where({ id: usuarioId }).delete();
            if (rolId) await orm.Rol.where({ id: rolId }).delete();
          });
        if (database && pIds.length) {
          expect(
            await database.db.orm.public.Producto.where((p) =>
              p.id.in(pIds),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.MovimientoInventario.where((p) =>
              p.productoId.in(pIds),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.Venta.where((p) =>
              p.id.in(vIds),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.Compra.where((p) =>
              p.id.in(cIds),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.DevolucionVenta.where((p) =>
              p.id.in(dvIds),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.DevolucionCompra.where((p) =>
              p.id.in(dcIds),
            ).all(),
          ).toEqual([]);
          evidencia.fixturesEliminados = true;
          writeFileSync(
            'docs/dashboard-evidencia.json',
            JSON.stringify(evidencia, null, 2),
          );
        }
      } finally {
        if (app) await app.close();
      }
    });

    it('fixture comercial: stock15/15; brutas2000; netas1550; costo1000; utilidad550', async () => {
      const r = (await get(`dashboard/resumen?${rango}`).expect(200)).body;
      expect(r.ventas).toMatchObject({
        cantidad: 1,
        cantidadDevoluciones: 1,
        brutas: '2000.00',
        devoluciones: '450.00',
        netas: '1550.00',
        impuestos: '320.00',
        facturadas: '2320.00',
      });
      expect(r.compras).toMatchObject({
        cantidad: 1,
        cantidadDevoluciones: 1,
        brutas: '3500.00',
        devoluciones: '250.00',
        netas: '3250.00',
      });
      expect(r.utilidad).toEqual({
        brutaOriginal: '700.00',
        impactoDevoluciones: '150.00',
        brutaAjustada: '550.00',
        costoVentasOriginal: '1300.00',
        costoDevuelto: '300.00',
        costoNeto: '1000.00',
        margenPorcentaje: '35.48',
      });
      expect(r.comparativa.ventasNetasPorcentaje).toBeNull();
      expect(r.inventario.productosActivos).toBe(
        valorAntes.productosActivos + 2,
      );
      expect(r.inventario.unidadesExistencia).toBe(
        valorAntes.unidadesExistencia + 30,
      );
      expect(r.inventario.productosStockBajo).toBe(
        valorAntes.productosStockBajo + 2,
      );
      expect(r.inventario.productosSinExistencia).toBe(
        valorAntes.productosSinExistencia,
      );
      const stocks = await database.db.orm.public.Existencia.where((e) =>
        e.productoId.in(pIds),
      )
        .orderBy((e) => e.productoId.asc())
        .all();
      expect(stocks.map((e) => e.cantidad)).toEqual([15, 15]);
      const u = (await get(`reportes/utilidad?${rango}`).expect(200)).body;
      expect(u.resumen).toMatchObject({
        ventasBrutas: '2000.00',
        devoluciones: '450.00',
        ventasNetas: '1550.00',
        costoVentas: '1300.00',
        costoDevuelto: '300.00',
        costoNeto: '1000.00',
        utilidadBruta: '550.00',
        margenPorcentaje: r.utilidad.margenPorcentaje,
      });
      evidencia.comercial = {
        ventas: r.ventas,
        compras: r.compras,
        utilidad: r.utilidad,
        reporteUtilidad: u.resumen,
        stock: [15, 15],
      };
    });
    it('valorización actual añade exactamente costo2250 y venta3450', async () => {
      const r = await dashboard.inventarioActual();
      expect(centavos(r.valorCosto) - centavos(valorAntes.valorCosto)).toBe(
        225000n,
      );
      expect(centavos(r.valorVenta) - centavos(valorAntes.valorVenta)).toBe(
        345000n,
      );
      evidencia.valorizacion = {
        valorCostoFixture: '2250.00',
        valorVentaFixture: '3450.00',
        antes: valorAntes,
        despues: r,
      };
      const inventario = (
        await get(`reportes/inventario?categoriaId=${categoriaId}`).expect(200)
      ).body;
      expect(inventario.pagination.totalItems).toBe(2);
      expect(
        inventario.data.map((p: { valorCosto: string }) => p.valorCosto),
      ).toEqual(['1500.00', '750.00']);
    });
    it('series diaria rellenan cero en día2 y usan fechas operativas', async () => {
      const r = (
        await get(`dashboard/ventas?${rango}&agrupacion=dia`).expect(200)
      ).body.data;
      expect(r).toEqual([
        {
          periodo: '2040-10-01',
          ventasBrutas: '2000.00',
          devoluciones: '0.00',
          ventasNetas: '2000.00',
          costoNeto: '1300.00',
          utilidad: '700.00',
        },
        {
          periodo: '2040-10-02',
          ventasBrutas: '0.00',
          devoluciones: '0.00',
          ventasNetas: '0.00',
          costoNeto: '0.00',
          utilidad: '0.00',
        },
        {
          periodo: '2040-10-03',
          ventasBrutas: '0.00',
          devoluciones: '450.00',
          ventasNetas: '-450.00',
          costoNeto: '-300.00',
          utilidad: '-150.00',
        },
      ]);
      const c = (await get(`dashboard/compras?${rango}`).expect(200)).body.data;
      expect(c[1].comprasNetas).toBe('0.00');
      expect(c[2].comprasNetas).toBe('-250.00');
    });
    it.each(['semana', 'mes'])(
      'series %s mantienen sumas y orden',
      async (agrupacion) => {
        const r = (
          await get(
            `dashboard/ventas?${rango}&agrupacion=${agrupacion}`,
          ).expect(200)
        ).body.data as {
          periodo: string;
          ventasBrutas: string;
          devoluciones: string;
        }[];
        expect(r.map((x) => x.periodo)).toEqual(r.map((x) => x.periodo).sort());
        expect(r.reduce((s, x) => s + centavos(x.ventasBrutas), 0n)).toBe(
          200000n,
        );
        expect(r.reduce((s, x) => s + centavos(x.devoluciones), 0n)).toBe(
          45000n,
        );
      },
    );
    it('sin operaciones conserva contratos y cero', async () => {
      const r = (
        await get(
          'dashboard/resumen?fechaInicio=2041-01-01&fechaFin=2041-01-03',
        ).expect(200)
      ).body;
      expect(r.ventas.netas).toBe('0.00');
      expect(r.utilidad.brutaAjustada).toBe('0.00');
      expect(r.utilidad.margenPorcentaje).toBe('0.00');
      const s = (
        await get(
          'dashboard/ventas?fechaInicio=2041-01-01&fechaFin=2041-01-03',
        ).expect(200)
      ).body.data;
      expect(s).toHaveLength(3);
      expect(
        s.every((x: { ventasNetas: string }) => x.ventasNetas === '0.00'),
      ).toBe(true);
    });
    it('ranking por unidades netas: B10 antes de A5; nombres actuales', async () => {
      const r = (
        await get(`dashboard/productos-mas-vendidos?${rango}`).expect(200)
      ).body.data;
      expect(r.map((x: { producto: { id: number } }) => x.producto.id)).toEqual(
        [pIds[1], pIds[0]],
      );
      expect(r[1]).toMatchObject({
        cantidadVendidaBruta: 8,
        cantidadDevuelta: 3,
        cantidadVendidaNeta: 5,
        importeNeto: '750.00',
      });
    });
    it('rankings clientes y proveedores netos', async () => {
      expect(
        (await get(`dashboard/clientes-principales?${rango}`).expect(200)).body
          .data[0],
      ).toMatchObject({
        cliente: { id: clienteId },
        cantidadVentas: 1,
        ventasBrutas: '2000.00',
        devoluciones: '450.00',
        ventasNetas: '1550.00',
      });
      expect(
        (await get(`dashboard/proveedores-principales?${rango}`).expect(200))
          .body.data[0],
      ).toMatchObject({
        proveedor: { id: proveedorId },
        cantidadCompras: 1,
        comprasNetas: '3250.00',
      });
    });
    it('reportes paginados ajustan devoluciones históricas y estados default', async () => {
      const v = (
        await get(`reportes/ventas?${rango}&clienteId=${clienteId}`).expect(200)
      ).body;
      expect(v.data[0]).toMatchObject({
        id: ventaId,
        subtotal: '2000.00',
        costoTotal: '1300.00',
        utilidadOriginal: '700.00',
        devoluciones: '450.00',
        utilidadAjustada: '550.00',
        estado: 'CONFIRMADA',
      });
      expect(v.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      const c = (
        await get(
          `reportes/compras?${rango}&proveedorId=${proveedorId}`,
        ).expect(200)
      ).body;
      expect(c.data[0]).toMatchObject({
        devoluciones: '250.00',
        compraNeta: '3250.00',
        estado: 'RECIBIDA',
      });
      expect(
        (
          await get(
            `reportes/ventas?${rango}&estado=BORRADOR&clienteId=${clienteId}`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(1);
      const vacia = (
        await get(
          `reportes/inventario?categoriaId=${categoriaId}&page=3&limit=1`,
        ).expect(200)
      ).body;
      expect(vacia.data).toEqual([]);
      expect(vacia.pagination).toEqual({
        page: 3,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });
      const pagina1 = (
        await get(
          `reportes/inventario?categoriaId=${categoriaId}&page=1&limit=1`,
        ).expect(200)
      ).body;
      expect(pagina1.pagination.hasNextPage).toBe(true);
    });
    it('stock igual al mínimo cuenta; cero primero e inactivos excluidos', async () => {
      expect(
        (
          await get(
            `reportes/inventario?categoriaId=${categoriaId}&stockBajo=true`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(2);
      const p = await productos.create({
        sku: `${prefix}-CERO`,
        nombre: prefix,
        costo: 0,
        precio: 0,
        stockMinimo: 1000000,
        categoriaId,
      });
      pIds.push(p.id);
      const r = (await get('dashboard/stock-bajo?limit=100').expect(200)).body
        .data;
      expect(r[0]).toMatchObject({
        productoId: p.id,
        cantidad: 0,
        faltanteParaMinimo: 1000000,
      });
      await productos.desactivar(p.id);
      expect(
        (
          await get('dashboard/stock-bajo?limit=100').expect(200)
        ).body.data.some((x: { productoId: number }) => x.productoId === p.id),
      ).toBe(false);
      expect(
        (
          await get(
            `reportes/inventario?categoriaId=${categoriaId}&activo=false&sinExistencia=true`,
          ).expect(200)
        ).body.pagination.totalItems,
      ).toBe(1);
    });
    it('snapshots históricos150/100 sobreviven catálogo300/200', async () => {
      await productos.update(pIds[0]!, { precio: 300, costo: 200 });
      try {
        const v = (
          await get(`reportes/ventas?${rango}&clienteId=${clienteId}`).expect(
            200,
          )
        ).body.data[0];
        expect(v.utilidadAjustada).toBe('550.00');
        const u = (await get(`reportes/utilidad?${rango}`).expect(200)).body
          .resumen;
        expect(u.utilidadBruta).toBe('550.00');
        const p = (
          await get(`reportes/inventario?categoriaId=${categoriaId}`).expect(
            200,
          )
        ).body.data[0];
        expect(p).toMatchObject({
          costoActual: '200.00',
          precioActual: '300.00',
          valorCosto: '3000.00',
          valorVenta: '4500.00',
        });
      } finally {
        await productos.update(pIds[0]!, { precio: 150, costo: 100 });
      }
    });
    it('Kardex global reutiliza movimientos del motor existente', async () => {
      const r = (
        await get(
          `reportes/kardex?productoId=${pIds[0]}&fechaInicio=2000-01-01&fechaFin=2000-01-03`,
        ).expect(200)
      ).body;
      expect(r.data).toEqual([]);
      expect(r.pagination.totalItems).toBe(0);
      const dia = new Date().toISOString().slice(0, 10);
      const a = (
        await get(
          `reportes/kardex?productoId=${pIds[0]}&fechaInicio=${dia}&fechaFin=${dia}`,
        ).expect(200)
      ).body;
      const b = (
        await get(
          `inventario/kardex/${pIds[0]}?fechaInicio=${dia}&fechaFin=${dia}`,
        ).expect(200)
      ).body;
      expect(a.data).toEqual(b.data);
      expect(a.pagination).toEqual(b.pagination);
    });
    for (const ruta of rutas) {
      it(`${ruta}: JWT401, rol403, sin datos secretos`, async () => {
        await request(app.getHttpServer()).get(`/api/v1/${ruta}`).expect(401);
        await get(ruta, consultaToken).expect(403);
        const r = await get(ruta).expect(200);
        expect(JSON.stringify(r.body)).not.toMatch(
          /password|NO-EXPONER|"token"|"hash"/,
        );
      });
    }
    it.each([
      ['dashboard/ventas', 'agrupacion=hora'],
      ['dashboard/ventas', 'fechaInicio=2020-01-01&fechaFin=2026-01-01'],
      ['dashboard/resumen', 'fechaInicio=2026-02-30&fechaFin=2026-03-01'],
      ['dashboard/resumen', 'fechaInicio=2026-10-03&fechaFin=2026-10-01'],
      ['dashboard/resumen', 'fechaInicio=2026-10-01'],
      ['dashboard/resumen', 'timezone=America/Mexico_City'],
      ['dashboard/productos-mas-vendidos', 'limit=51'],
      ['dashboard/stock-bajo', 'limit=101'],
      ['dashboard/movimientos-recientes', 'limit=51'],
      ['reportes/ventas', 'page=0'],
      ['reportes/compras', 'limit=101'],
      ['reportes/ventas', 'sortBy=password'],
      ['reportes/compras', 'sortOrder=sql'],
      ['reportes/inventario', 'activo=1'],
      ['reportes/kardex', 'usuarioId=0'],
      ['reportes/utilidad', 'agrupacion=hora'],
    ])('%s rechaza query %s', async (ruta, query) => {
      await get(`${ruta}?${query}`).expect(400);
    });

    it('ranking exacto A10-dev3=7, B8-dev0=8 ordena B/A', async () => {
      const ids: number[] = [];
      for (const letra of ['RANK-A', 'RANK-B']) {
        const p = await productos.create({
          sku: `${prefix}-${letra}`,
          nombre: letra,
          costo: 1,
          precio: 2,
          stockMinimo: 0,
          categoriaId,
        });
        pIds.push(p.id);
        ids.push(p.id);
      }
      const cs = app.get(ComprasService),
        vs = app.get(VentasService),
        ds = app.get(DevolucionesVentaService),
        orm = database.db.orm.public;
      const c = await cs.create(
        {
          proveedorId,
          detalles: ids.map((productoId) => ({
            productoId,
            cantidad: 20,
            costoUnitario: 1,
          })),
        },
        usuarioId,
      );
      cIds.push(c.id);
      await cs.recibir(c.id, usuarioId);
      const v = await vs.create(
        {
          clienteId,
          detalles: [
            { productoId: ids[0]!, cantidad: 10 },
            { productoId: ids[1]!, cantidad: 8 },
          ],
        },
        usuarioId,
      );
      vIds.push(v.id);
      await vs.confirmar(v.id, usuarioId);
      const d = await ds.create(
        {
          ventaId: v.id,
          motivo: 'ranking',
          detalles: [
            {
              detalleVentaId: v.detalles.find((x) => x.productoId === ids[0])!
                .id,
              cantidad: 3,
            },
          ],
        },
        usuarioId,
      );
      dvIds.push(d.id);
      await ds.procesar(d.id, usuarioId);
      await orm.Venta.where({ id: v.id }).update({
        fechaConfirmacion: '2042-01-01T12:00:00Z',
      });
      await orm.DevolucionVenta.where({ id: d.id }).update({
        fechaProcesamiento: '2042-01-01T13:00:00Z',
      });
      const r = (
        await get(
          'dashboard/productos-mas-vendidos?fechaInicio=2042-01-01&fechaFin=2042-01-01',
        ).expect(200)
      ).body.data;
      expect(r).toMatchObject([
        {
          producto: { id: ids[1] },
          cantidadVendidaBruta: 8,
          cantidadDevuelta: 0,
          cantidadVendidaNeta: 8,
        },
        {
          producto: { id: ids[0] },
          cantidadVendidaBruta: 10,
          cantidadDevuelta: 3,
          cantidadVendidaNeta: 7,
        },
      ]);
    });
    it('PostgreSQL monetario: 0.10*3=0.30 y 19.99*7=139.93 con devolución', async () => {
      const ids: number[] = [];
      for (const [letra, precio] of [
        ['DECIMAL-A', 0.1],
        ['DECIMAL-B', 19.99],
      ] as const) {
        const p = await productos.create({
          sku: `${prefix}-${letra}`,
          nombre: letra,
          costo: 0.05,
          precio,
          stockMinimo: 0,
          categoriaId,
        });
        pIds.push(p.id);
        ids.push(p.id);
      }
      const cs = app.get(ComprasService),
        vs = app.get(VentasService),
        ds = app.get(DevolucionesVentaService),
        orm = database.db.orm.public;
      const c = await cs.create(
        {
          proveedorId,
          detalles: ids.map((productoId) => ({
            productoId,
            cantidad: 10,
            costoUnitario: 0.05,
          })),
        },
        usuarioId,
      );
      cIds.push(c.id);
      await cs.recibir(c.id, usuarioId);
      const v = await vs.create(
        {
          clienteId,
          detalles: [
            { productoId: ids[0]!, cantidad: 3 },
            { productoId: ids[1]!, cantidad: 7 },
          ],
        },
        usuarioId,
      );
      vIds.push(v.id);
      await vs.confirmar(v.id, usuarioId);
      expect(v.detalles.map((x) => x.subtotal)).toEqual(['0.30', '139.93']);
      const d = await ds.create(
        {
          ventaId: v.id,
          motivo: 'decimal',
          detalles: [{ detalleVentaId: v.detalles[0]!.id, cantidad: 1 }],
        },
        usuarioId,
      );
      dvIds.push(d.id);
      await ds.procesar(d.id, usuarioId);
      await orm.Venta.where({ id: v.id }).update({
        fechaConfirmacion: '2043-01-01T12:00:00Z',
      });
      await orm.DevolucionVenta.where({ id: d.id }).update({
        fechaProcesamiento: '2043-01-01T13:00:00Z',
      });
      const r = (
        await get(
          'reportes/utilidad?fechaInicio=2043-01-01&fechaFin=2043-01-01',
        ).expect(200)
      ).body.resumen;
      expect(r).toMatchObject({
        ventasBrutas: '140.23',
        devoluciones: '0.10',
        ventasNetas: '140.13',
        costoVentas: '0.50',
        costoDevuelto: '0.05',
        costoNeto: '0.45',
        utilidadBruta: '139.68',
      });
    });

    async function estado() {
      const db = database.db;
      return (
        await db.runtime().query(
          db.raw.sql`
      SELECT
        (SELECT count(*)::int FROM public."movimientoInventario") AS movimientos,
        (SELECT coalesce(sum(cantidad), 0)::text FROM public.existencia) AS existencias,
        (SELECT count(*)::int FROM public.venta) AS ventas,
        (SELECT count(*)::int FROM public.compra) AS compras,
        (SELECT count(*)::int FROM public."devolucionVenta") AS "devolucionesVenta",
        (SELECT count(*)::int FROM public."devolucionCompra") AS "devolucionesCompra",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public.existencia e)) AS "hashStock",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."movimientoInventario" e)) AS "hashMovimientos",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public.venta e)) AS "hashVentas",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public.compra e)) AS "hashCompras",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."devolucionVenta" e)) AS "hashDevolucionesVenta",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."devolucionCompra" e)) AS "hashDevolucionesCompra",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."detalleVenta" e)) AS "hashDetallesVenta",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."detalleCompra" e)) AS "hashDetallesCompra",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."detalleDevolucionVenta" e)) AS "hashDetallesDevolucionVenta",
        md5((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id), '[]')::text FROM public."detalleDevolucionCompra" e)) AS "hashDetallesDevolucionCompra"
    `
            .returnsRow({
              movimientos: 'pg/int4@1',
              existencias: 'pg/text@1',
              ventas: 'pg/int4@1',
              compras: 'pg/int4@1',
              devolucionesVenta: 'pg/int4@1',
              devolucionesCompra: 'pg/int4@1',
              hashStock: 'pg/text@1',
              hashMovimientos: 'pg/text@1',
              hashVentas: 'pg/text@1',
              hashCompras: 'pg/text@1',
              hashDevolucionesVenta: 'pg/text@1',
              hashDevolucionesCompra: 'pg/text@1',
              hashDetallesVenta: 'pg/text@1',
              hashDetallesCompra: 'pg/text@1',
              hashDetallesDevolucionVenta: 'pg/text@1',
              hashDetallesDevolucionCompra: 'pg/text@1',
            })
            .build(),
        )
      )[0]!;
    }
    it('batería read-only: conteos, saldos y hashes idénticos antes/después', async () => {
      const antes = await estado();
      for (let repeticion = 0; repeticion < 3; repeticion++)
        for (const ruta of rutas) {
          const tieneFechas = ![
            'dashboard/stock-bajo',
            'dashboard/movimientos-recientes',
            'dashboard/actividad-reciente',
            'reportes/inventario',
          ].includes(ruta);
          await get(`${ruta}${tieneFechas ? `?${rango}` : ''}`).expect(200);
        }
      const despues = await estado();
      expect(despues).toEqual(antes);
      evidencia.readOnly = {
        consultas: rutas.length * 3,
        antes,
        despues,
        identicos: true,
      };
    });
    it('EXPLAIN ANALYZE e índices reales sin cambios de contract', async () => {
      const db = database.db;
      const ventas = await db
        .runtime()
        .query(
          db.raw
            .sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT sum(subtotal), sum("costoTotal") FROM public.venta WHERE estado = 'CONFIRMADA' AND "fechaConfirmacion" BETWEEN '2040-10-01'::timestamptz AND '2040-10-04'::timestamptz`
            .returnsRow({ 'QUERY PLAN': 'pg/text@1' })
            .build(),
        );
      const stock = await db
        .runtime()
        .query(
          db.raw
            .sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT sum(e.cantidad * p.costo) FROM public.producto p JOIN public.existencia e ON e."productoId" = p.id WHERE p.activo`
            .returnsRow({ 'QUERY PLAN': 'pg/text@1' })
            .build(),
        );
      const indices = await db.runtime().query(
        db.raw
          .sql`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`
          .returnsRow({
            tablename: 'pg/text@1',
            indexname: 'pg/text@1',
            indexdef: 'pg/text@1',
          })
          .build(),
      );
      evidencia.performance = { ventas, stock, indices, indicesAgregados: [] };
      expect(ventas.length).toBeGreaterThan(0);
      expect(stock.length).toBeGreaterThan(0);
    });
  },
);
