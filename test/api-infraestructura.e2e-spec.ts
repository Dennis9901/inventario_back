import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import * as argon2 from 'argon2';
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarHttp } from '../src/common/http/configurar-http.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { HealthService } from '../src/modules/health/health.service.js';
import type { OpenAPIObject } from '@nestjs/swagger';

const prefix = `TEST-API-${randomUUID()}`.toUpperCase();
const clave = `fixture-${randomUUID()}`;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type RegistroLog = Record<string, unknown>;

describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Infraestructura API con PostgreSQL real',
  () => {
    let app: INestApplication, database: DatabaseService, spec: OpenAPIObject;
    let usuarioId: number,
      rolId: number,
      rolPropio = false,
      categoriaId: number,
      clienteId: number,
      proveedorId: number;
    let token: string, consultaToken: string, loginRequestId: string;
    const pIds: number[] = [],
      vIds: number[] = [],
      cIds: number[] = [],
      dvIds: number[] = [],
      dcIds: number[] = [],
      categoriaIds: number[] = [],
      usuarioIds: number[] = [],
      clienteIds: number[] = [],
      proveedorIds: number[] = [];
    const logs: RegistroLog[] = [];
    const evidencia: Record<string, unknown> = {};
    const capturar = (message: unknown) => {
      if (typeof message === 'string' && message.startsWith('{')) {
        try {
          logs.push(JSON.parse(message) as RegistroLog);
        } catch {
          /* Mensaje ajeno al logger JSON */
        }
      }
    };
    const get = (ruta: string, jwt = token) =>
      request(app.getHttpServer())
        .get(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${jwt}`);
    const post = (ruta: string, body: object = {}, jwt = token) =>
      request(app.getHttpServer())
        .post(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send(body);
    const patch = (ruta: string, body: object = {}) =>
      request(app.getHttpServer())
        .patch(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const auditorias = () =>
      database.db.orm.public.Auditoria.where({ usuarioId })
        .orderBy((a) => a.id.asc())
        .all();
    async function producto(costo = 100, precio = 150) {
      const r = await post('productos', {
        sku: `${prefix}-${randomUUID()}`,
        nombre: prefix,
        costo,
        precio,
        stockMinimo: 0,
        categoriaId,
      }).expect(201);
      pIds.push(r.body.id as number);
      return r.body.id as number;
    }
    async function venta(detalles: { productoId: number; cantidad: number }[]) {
      const r = await post('ventas', { clienteId, detalles }).expect(201);
      vIds.push(r.body.id as number);
      return r.body as {
        id: number;
        detalles: { id: number; productoId: number }[];
      };
    }
    async function compra(
      detalles: {
        productoId: number;
        cantidad: number;
        costoUnitario: number;
      }[],
    ) {
      const r = await post('compras', { proveedorId, detalles }).expect(201);
      cIds.push(r.body.id as number);
      return r.body as {
        id: number;
        detalles: { id: number; productoId: number }[];
      };
    }
    function validarError(res: request.Response, status: number, code: string) {
      expect(res.status).toBe(status);
      expect(res.body).toMatchObject({
        statusCode: status,
        code,
        method: expect.any(String),
        path: expect.any(String),
        timestamp: expect.any(String),
        requestId: res.headers['x-request-id'],
        errors: expect.any(Array),
      });
      expect(res.body.requestId).toMatch(uuid);
      expect(Number.isNaN(Date.parse(res.body.timestamp as string))).toBe(
        false,
      );
    }
    beforeAll(async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(capturar);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(capturar);
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      spec = configurarHttp(app);
      await app.init();
      database = app.get(DatabaseService);
      const orm = database.db.orm.public;
      const admin = await orm.Rol.where({ nombre: 'ADMINISTRADOR' }).first();
      if (admin) {
        expect(admin.activo).toBe(true);
        rolId = admin.id;
      } else {
        rolId = (
          await orm.Rol.create({ nombre: 'ADMINISTRADOR', activo: true })
        ).id;
        rolPropio = true;
      }
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix.toLowerCase()}@example.invalid`,
          password: await argon2.hash(clave),
          rolId,
          activo: true,
        })
      ).id;
      categoriaId = (await orm.Categoria.create({ nombre: prefix })).id;
      clienteId = (await orm.Cliente.create({ nombre: prefix })).id;
      proveedorId = (await orm.Proveedor.create({ nombre: prefix })).id;
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `${prefix.toLowerCase()}@example.invalid`,
          password: clave,
        })
        .expect(200);
      token = login.body.access_token as string;
      loginRequestId = login.headers['x-request-id'] as string;
      consultaToken = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'CONSULTA' });
    });
    afterAll(async () => {
      try {
        if (database) {
          await database.db.transaction(async (tx) => {
            const orm = tx.orm.public;
            for (const id of [usuarioId, ...usuarioIds])
              if (id) await orm.Auditoria.where({ usuarioId: id }).deleteAll();
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
            for (const id of [clienteId, ...clienteIds])
              if (id) await orm.Cliente.where({ id }).delete();
            for (const id of [proveedorId, ...proveedorIds])
              if (id) await orm.Proveedor.where({ id }).delete();
            for (const id of [categoriaId, ...categoriaIds])
              if (id) await orm.Categoria.where({ id }).delete();
            for (const id of [usuarioId, ...usuarioIds])
              if (id) await orm.Usuario.where({ id }).delete();
            if (rolPropio) await orm.Rol.where({ id: rolId }).delete();
          });
          expect(
            await database.db.orm.public.Auditoria.where((a) =>
              a.usuarioId.in([usuarioId, ...usuarioIds]),
            ).all(),
          ).toEqual([]);
          expect(
            await database.db.orm.public.Producto.where((p) =>
              p.id.in(pIds),
            ).all(),
          ).toEqual([]);
          evidencia.fixturesEliminados = true;
        }
        evidencia.logs = {
          requests: logs.filter((l) => l['type'] === 'http_request').length,
          sinSecretos:
            !JSON.stringify(logs).includes(clave) &&
            !JSON.stringify(logs).includes(token),
        };
        writeFileSync(
          'docs/api-evidencia.json',
          JSON.stringify(evidencia, null, 2),
        );
      } finally {
        if (app) await app.close();
        vi.restoreAllMocks();
      }
    });

    it('login real deja auditoría con usuario y requestId, sin credenciales', async () => {
      const rows = await auditorias();
      const login = rows.find((a) => a.accion === 'LOGIN_EXITOSO');
      expect(login).toMatchObject({
        usuarioId,
        requestId: loginRequestId,
        entidad: 'USUARIO',
        entidadId: usuarioId,
      });
      expect(JSON.stringify(rows)).not.toContain(clave);
      expect(JSON.stringify(rows)).not.toContain(token);
    });
    it('liveness público, sin consulta DB; readiness SELECT1 real', async () => {
      const spy = vi.spyOn(app.get(HealthService), 'ping');
      const h = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(h.body).toMatchObject({
        status: 'ok',
        version: '0.0.1',
        uptime: expect.any(Number),
      });
      expect(spy).not.toHaveBeenCalled();
      const ready = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);
      expect(ready.body).toEqual({ status: 'ready', database: 'up' });
      spy.mockRestore();
      evidencia.health = h.body;
      evidencia.readiness = ready.body;
    });
    it('readiness503 seguro si falla DB', async () => {
      const spy = vi
        .spyOn(app.get(HealthService), 'ping')
        .mockRejectedValueOnce(
          new Error(`SQL privado ${process.env.DATABASE_URL}`),
        );
      try {
        const r = await request(app.getHttpServer())
          .get('/api/v1/health/ready')
          .expect(503);
        expect(r.body).toEqual({ status: 'not_ready', database: 'down' });
        expect(JSON.stringify(r.body)).not.toContain('SQL');
        evidencia.readinessCaida = r.body;
      } finally {
        spy.mockRestore();
      }
    });
    it('Swagger UI y JSON cargan con Helmet, tags y esquemas completos', async () => {
      const ui = await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200);
      expect(ui.text).toContain('swagger-ui');
      expect(ui.headers['content-security-policy']).toContain(
        "script-src 'self'",
      );
      expect(ui.headers['x-content-type-options']).toBe('nosniff');
      await request(app.getHttpServer())
        .get('/api/docs/swagger-ui-init.js')
        .expect(200);
      const json = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(json.body.info.title).toBe('Inventario API');
      expect(json.body.openapi).toBe('3.0.0');
      expect(JSON.stringify(spec.components?.schemas)).not.toContain(
        '\"type\":\"null\"',
      );
      const required = [
        '/api/v1/auth/login',
        '/api/v1/roles',
        '/api/v1/usuarios',
        '/api/v1/categorias',
        '/api/v1/productos',
        '/api/v1/inventario/movimientos/salida',
        '/api/v1/proveedores',
        '/api/v1/compras',
        '/api/v1/clientes',
        '/api/v1/ventas',
        '/api/v1/devoluciones/ventas',
        '/api/v1/devoluciones/compras',
        '/api/v1/dashboard/resumen',
        '/api/v1/reportes/utilidad',
        '/api/v1/auditoria',
        '/api/v1/health',
      ];
      for (const path of required) expect(spec.paths[path]).toBeDefined();
      expect(spec.components?.schemas?.['CreateProductoDto']).toMatchObject({
        properties: {
          sku: { type: 'string' },
          costo: { type: 'number' },
          categoriaId: { type: 'integer' },
        },
      });
      expect(spec.components?.schemas?.['CreateVentaDto']).toMatchObject({
        properties: {
          detalles: {
            type: 'array',
            items: { $ref: expect.stringContaining('VentaDetalleDto') },
          },
        },
      });
      expect(spec.components?.schemas?.['ApiErrorResponse']).toBeDefined();
      expect(
        spec.components?.schemas?.['ValidationErrorResponse'],
      ).toBeDefined();
      for (const path of Object.values(spec.paths))
        for (const method of ['get', 'post', 'patch', 'delete'] as const) {
          const op = path[method];
          if (!op) continue;
          const response = op.responses['200'] ?? op.responses['201'];
          expect(response).toBeDefined();
          expect(JSON.stringify(response)).not.toBe('{}');
        }
      expect(JSON.stringify(spec)).not.toContain(clave);
      expect(JSON.stringify(spec)).not.toContain(token);
      writeFileSync('docs/api-openapi.json', JSON.stringify(spec, null, 2));
      evidencia.swagger = {
        ui: 200,
        json: 200,
        rutas: Object.keys(spec.paths).length,
      };
    });
    it('OpenAPI security: login y health públicos; administrativos Bearer', async () => {
      expect(spec.paths['/api/v1/auth/login'].post?.security ?? []).toEqual([]);
      expect(spec.paths['/api/v1/health'].get?.security ?? []).toEqual([]);
      expect(spec.paths['/api/v1/health/ready'].get?.security ?? []).toEqual(
        [],
      );
      for (const path of [
        '/api/v1/productos',
        '/api/v1/roles',
        '/api/v1/auditoria',
        '/api/v1/dashboard/resumen',
        '/api/v1/auth/me',
      ])
        expect(spec.paths[path].get?.security).toEqual([{ bearer: [] }]);
      await get('productos').expect(200);
    });
    it('CORS lista exacta y X-Request-Id expuesto', async () => {
      const allowed = await request(app.getHttpServer())
        .options('/api/v1/productos')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,x-request-id')
        .expect(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:4200',
      );
      expect(
        allowed.headers['access-control-allow-credentials'],
      ).toBeUndefined();
      const denied = await request(app.getHttpServer())
        .options('/api/v1/productos')
        .set('Origin', 'https://origen-no-autorizado.invalid')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
      const normal = await get('productos')
        .set('Origin', 'http://localhost:4200')
        .expect(200);
      expect(normal.headers['access-control-expose-headers']).toContain(
        'X-Request-Id',
      );
    });
    it('400 por campo y errores nested para Angular', async () => {
      const r = await post('usuarios');
      validarError(r, 400, 'VALIDATION_ERROR');
      expect(r.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'email', messages: expect.any(Array) },
          { field: 'nombre', messages: expect.any(Array) },
        ]),
      );
      const nested = await post('ventas', { clienteId, detalles: [{}] });
      validarError(nested, 400, 'VALIDATION_ERROR');
      expect(
        nested.body.errors.some(
          (e: { field: string }) => e.field === 'detalles.0.productoId',
        ),
      ).toBe(true);
      evidencia.error400 = r.body;
    });
    it('401,403,404 uniformes y Roles deja de ser público', async () => {
      const r401 = await request(app.getHttpServer()).get('/api/v1/productos');
      validarError(r401, 401, 'UNAUTHORIZED');
      const r403 = await get('auditoria', consultaToken);
      validarError(r403, 403, 'FORBIDDEN');
      const r404 = await get('no-existe');
      validarError(r404, 404, 'NOT_FOUND');
      await request(app.getHttpServer()).get('/api/v1/roles').expect(401);
      await post('roles', { nombre: 'NO-CREAR' }, consultaToken).expect(403);
      evidencia.error401 = r401.body;
      evidencia.error403 = r403.body;
      evidencia.error404 = r404.body;
    });
    it.each([undefined, 'malicioso<script>', 'a'.repeat(2000)])(
      'requestId genera UUID seguro para %s',
      async (header) => {
        let r = get('no-existe');
        if (header) r = r.set('X-Request-Id', header);
        const res = await r.expect(404);
        expect(res.headers['x-request-id']).toMatch(uuid);
        expect(res.body.requestId).toBe(res.headers['x-request-id']);
      },
    );
    it('requestId válido se reutiliza y log correlaciona método/path/status/duración sin query', async () => {
      const id = randomUUID();
      const r = await get('no-existe?password=valor-no-loggear')
        .set('X-Request-Id', id.toUpperCase())
        .expect(404);
      expect(r.headers['x-request-id']).toBe(id);
      const log = logs.find(
        (l) => l['type'] === 'http_request' && l['requestId'] === id,
      );
      expect(log).toMatchObject({
        method: 'GET',
        path: '/api/v1/no-existe',
        statusCode: 404,
        requestId: id,
      });
      expect(log!['durationMs']).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(logs)).not.toContain('valor-no-loggear');
      evidencia.correlacion = {
        responseId: id,
        errorId: r.body.requestId,
        log,
      };
    });
    it('500 público seguro y diagnóstico interno correlacionado sanitizado', async () => {
      const spy = vi
        .spyOn(app.get(ProductosService), 'findAll')
        .mockRejectedValueOnce(
          new Error(
            `sentinel-interno password=${clave} ${process.env.DATABASE_URL} Bearer ${token}`,
          ),
        );
      try {
        const r = await get('productos');
        validarError(r, 500, 'INTERNAL_ERROR');
        expect(r.body.message).toBe('Error interno del servidor');
        expect(JSON.stringify(r.body)).not.toMatch(
          /stack|sentinel-interno|postgresql/,
        );
        const log = logs.find(
          (l) =>
            l['type'] === 'http_error' && l['requestId'] === r.body.requestId,
        );
        expect(log!['message']).toContain('sentinel-interno');
        expect(log!['stack']).toBeDefined();
        expect(JSON.stringify(logs)).not.toContain(clave);
        expect(JSON.stringify(logs)).not.toContain(token);
        expect(JSON.stringify(logs)).not.toContain(process.env.DATABASE_URL!);
        evidencia.error500 = r.body;
        evidencia.diagnosticoSanitizado = log;
      } finally {
        spy.mockRestore();
      }
    });

    it('flujo integral login/producto/entrada/cliente/venta/devolución/dashboard/reporte/auditoría', async () => {
      const p = await producto();
      await post('inventario/movimientos/entrada', {
        productoId: p,
        cantidad: 20,
      }).expect(201);
      await patch(`productos/${p}`, { nombre: `${prefix}-MODIFICADO` }).expect(
        200,
      );
      const cli = await post('clientes', {
        nombre: `${prefix}-CLIENTE`,
      }).expect(201);
      clienteIds.push(cli.body.id as number);
      const vRes = await post('ventas', {
        clienteId: cli.body.id,
        detalles: [{ productoId: p, cantidad: 5 }],
      }).expect(201);
      vIds.push(vRes.body.id as number);
      const confirmar = await post(`ventas/${vRes.body.id}/confirmar`).expect(
        201,
      );
      const d = await post('devoluciones/ventas', {
        ventaId: vRes.body.id,
        motivo: 'Fixture integral',
        detalles: [{ detalleVentaId: vRes.body.detalles[0].id, cantidad: 2 }],
      }).expect(201);
      dvIds.push(d.body.id as number);
      await post(`devoluciones/ventas/${d.body.id}/procesar`).expect(201);
      const orm = database.db.orm.public;
      await orm.Venta.where({ id: vRes.body.id as number }).update({
        fechaConfirmacion: '2044-01-01T12:00:00Z',
      });
      await orm.DevolucionVenta.where({ id: d.body.id as number }).update({
        fechaProcesamiento: '2044-01-01T13:00:00Z',
      });
      const antes = await auditorias();
      const dashboard = (
        await get(
          'dashboard/resumen?fechaInicio=2044-01-01&fechaFin=2044-01-01',
        ).expect(200)
      ).body;
      const reporte = (
        await get(
          'reportes/utilidad?fechaInicio=2044-01-01&fechaFin=2044-01-01',
        ).expect(200)
      ).body;
      const kardex = (
        await get(`inventario/kardex/${p}?sortOrder=asc`).expect(200)
      ).body;
      expect(kardex.producto.stockActual).toBe(17);
      expect(
        kardex.data.map((m: { tipo: string; cantidad: number }) => [
          m.tipo,
          m.cantidad,
        ]),
      ).toEqual([
        ['ENTRADA', 20],
        ['SALIDA', 5],
        ['ENTRADA', 2],
      ]);
      expect(dashboard.ventas.netas).toBe('450.00');
      expect(dashboard.utilidad.brutaAjustada).toBe('150.00');
      expect(reporte.resumen.utilidadBruta).toBe('150.00');
      expect(await auditorias()).toEqual(antes);
      const confirmAudit = antes.find(
        (a) => a.accion === 'VENTA_CONFIRMADA' && a.entidadId === vRes.body.id,
      );
      expect(confirmAudit).toMatchObject({
        requestId: confirmar.headers['x-request-id'],
        usuarioId,
      });
      const lista = await get(
        `auditoria?usuarioId=${usuarioId}&limit=100`,
      ).expect(200);
      expect(lista.body.pagination.totalItems).toBe(antes.length);
      expect(
        lista.body.data.every(
          (a: { usuarioId: number; requestId: string }) =>
            a.usuarioId === usuarioId && uuid.test(a.requestId),
        ),
      ).toBe(true);
      evidencia.integral = {
        stock: 17,
        kardex: kardex.data.map((m: { tipo: string; cantidad: number }) => ({
          tipo: m.tipo,
          cantidad: m.cantidad,
        })),
        ventasNetas: dashboard.ventas.netas,
        utilidad: dashboard.utilidad.brutaAjustada,
        auditoriaAcciones: antes.map((a) => a.accion),
        getsSinAuditoria: true,
      };
    });
    it('ENTRADA/SALIDA/AJUSTE manual registran exactamente un evento cada uno', async () => {
      const p = await producto();
      for (const [ruta, body, accion] of [
        ['entrada', { productoId: p, cantidad: 10 }, 'ENTRADA_MANUAL'],
        ['salida', { productoId: p, cantidad: 2 }, 'SALIDA_MANUAL'],
        ['ajuste', { productoId: p, nuevaCantidad: 5 }, 'AJUSTE_MANUAL'],
      ] as const) {
        const r = await post(`inventario/movimientos/${ruta}`, body).expect(
          201,
        );
        const rows = await database.db.orm.public.Auditoria.where({
          requestId: r.headers['x-request-id'] as string,
        }).all();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ accion, usuarioId });
      }
    });
    it('recibir compra y procesar devolución proveedor generan auditoría', async () => {
      const p = await producto();
      const c = await compra([
        { productoId: p, cantidad: 10, costoUnitario: 100 },
      ]);
      const recibido = await post(`compras/${c.id}/recibir`).expect(201);
      const d = await post('devoluciones/compras', {
        compraId: c.id,
        motivo: 'fixture',
        detalles: [{ detalleCompraId: c.detalles[0]!.id, cantidad: 2 }],
      }).expect(201);
      dcIds.push(d.body.id as number);
      const procesado = await post(
        `devoluciones/compras/${d.body.id}/procesar`,
      ).expect(201);
      for (const [r, accion] of [
        [recibido, 'COMPRA_RECIBIDA'],
        [procesado, 'DEVOLUCION_COMPRA_PROCESADA'],
      ] as const)
        expect(
          (
            await database.db.orm.public.Auditoria.where({
              requestId: r.headers['x-request-id'] as string,
            }).all()
          )[0],
        ).toMatchObject({ accion, usuarioId });
    });
    it('cancelaciones compra,venta y ambas devoluciones se auditan', async () => {
      const p = await producto();
      const c = await compra([
        { productoId: p, cantidad: 10, costoUnitario: 100 },
      ]);
      const v = await venta([{ productoId: p, cantidad: 1 }]);
      for (const [ruta, accion] of [
        [`compras/${c.id}/cancelar`, 'COMPRA_CANCELADA'],
        [`ventas/${v.id}/cancelar`, 'VENTA_CANCELADA'],
      ] as const) {
        const r = await post(ruta).expect(201);
        expect(
          (
            await database.db.orm.public.Auditoria.where({
              requestId: r.headers['x-request-id'] as string,
            }).all()
          )[0]?.accion,
        ).toBe(accion);
      }
      const c2 = await compra([
        { productoId: p, cantidad: 10, costoUnitario: 100 },
      ]);
      await post(`compras/${c2.id}/recibir`).expect(201);
      const v2 = await venta([{ productoId: p, cantidad: 3 }]);
      await post(`ventas/${v2.id}/confirmar`).expect(201);
      const dv = await post('devoluciones/ventas', {
        ventaId: v2.id,
        motivo: 'fixture',
        detalles: [{ detalleVentaId: v2.detalles[0]!.id, cantidad: 1 }],
      }).expect(201);
      dvIds.push(dv.body.id as number);
      const dc = await post('devoluciones/compras', {
        compraId: c2.id,
        motivo: 'fixture',
        detalles: [{ detalleCompraId: c2.detalles[0]!.id, cantidad: 1 }],
      }).expect(201);
      dcIds.push(dc.body.id as number);
      await post(`devoluciones/ventas/${dv.body.id}/cancelar`).expect(201);
      await post(`devoluciones/compras/${dc.body.id}/cancelar`).expect(201);
      expect((await auditorias()).map((a) => a.accion)).toEqual(
        expect.arrayContaining([
          'DEVOLUCION_VENTA_CANCELADA',
          'DEVOLUCION_COMPRA_CANCELADA',
        ]),
      );
    });
    it('rollback último producto: stock/movimientos/estado y auditoría de éxito ausente', async () => {
      const a = await producto(),
        b = await producto();
      await post('inventario/movimientos/entrada', {
        productoId: a,
        cantidad: 5,
      }).expect(201);
      const v = await venta([
        { productoId: a, cantidad: 2 },
        { productoId: b, cantidad: 1 },
      ]);
      const antes = await database.db.orm.public.MovimientoInventario.where(
        (m) => m.productoId.in([a, b]),
      ).all();
      const r = await post(`ventas/${v.id}/confirmar`);
      validarError(r, 409, 'STOCK_INSUFICIENTE');
      expect(
        (
          await database.db.orm.public.Existencia.where({
            productoId: a,
          }).first()
        )?.cantidad,
      ).toBe(5);
      expect(
        (await database.db.orm.public.Venta.where({ id: v.id }).first())
          ?.estado,
      ).toBe('BORRADOR');
      expect(
        await database.db.orm.public.MovimientoInventario.where((m) =>
          m.productoId.in([a, b]),
        ).all(),
      ).toEqual(antes);
      expect(
        await database.db.orm.public.Auditoria.where({
          requestId: r.headers['x-request-id'] as string,
        }).all(),
      ).toEqual([]);
      evidencia.rollback = {
        stock: 5,
        estado: 'BORRADOR',
        movimientosIntactos: true,
        auditoriasExito: 0,
      };
      evidencia.error409 = r.body;
    });
    it('fallo de INSERT Auditoria dentro de transacción revierte la operación comercial', async () => {
      const p = await producto();
      const c = await compra([
        { productoId: p, cantidad: 10, costoUnitario: 100 },
      ]);
      const original = database.db.transaction.bind(database.db);
      const spy = vi
        .spyOn(database.db, 'transaction')
        .mockImplementationOnce((callback) =>
          original(async (tx) => {
            const insert = vi
              .spyOn(tx.orm.public.Auditoria, 'create')
              .mockRejectedValueOnce(new Error('Fallo audit insert fixture'));
            try {
              return await callback(tx);
            } finally {
              insert.mockRestore();
            }
          }),
        );
      try {
        const r = await post(`compras/${c.id}/recibir`);
        validarError(r, 500, 'INTERNAL_ERROR');
        expect(
          (
            await database.db.orm.public.Existencia.where({
              productoId: p,
            }).first()
          )?.cantidad,
        ).toBe(0);
        expect(
          (await database.db.orm.public.Compra.where({ id: c.id }).first())
            ?.estado,
        ).toBe('BORRADOR');
        expect(
          await database.db.orm.public.MovimientoInventario.where({
            productoId: p,
          }).all(),
        ).toEqual([]);
        expect(
          await database.db.orm.public.Auditoria.where({
            requestId: r.headers['x-request-id'] as string,
          }).all(),
        ).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });
    it('concurrencia: una confirmación y una auditoría, stock descontado una vez', async () => {
      const p = await producto();
      await post('inventario/movimientos/entrada', {
        productoId: p,
        cantidad: 10,
      }).expect(201);
      const v = await venta([{ productoId: p, cantidad: 3 }]);
      const results = await Promise.all([
        post(`ventas/${v.id}/confirmar`),
        post(`ventas/${v.id}/confirmar`),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const rows = await database.db.orm.public.Auditoria.where({
        accion: 'VENTA_CONFIRMADA',
        entidadId: v.id,
      }).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.requestId).toBe(
        results.find((r) => r.status === 201)!.headers['x-request-id'],
      );
      expect(
        (
          await database.db.orm.public.Existencia.where({
            productoId: p,
          }).first()
        )?.cantidad,
      ).toBe(7);
      evidencia.concurrencia = {
        status: [201, 409],
        stock: 7,
        auditoriasExito: 1,
      };
    });
    it('concurrencia devolución: procesamiento único y una auditoría de éxito', async () => {
      const p = await producto();
      await post('inventario/movimientos/entrada', {
        productoId: p,
        cantidad: 10,
      }).expect(201);
      const v = await venta([{ productoId: p, cantidad: 3 }]);
      await post(`ventas/${v.id}/confirmar`).expect(201);
      const detalle = (await get(`ventas/${v.id}`).expect(200)).body
        .detalles[0];
      const d = await post('devoluciones/ventas', {
        ventaId: v.id,
        motivo: 'Fixture concurrencia',
        detalles: [{ detalleVentaId: detalle.id, cantidad: 2 }],
      }).expect(201);
      dvIds.push(d.body.id as number);
      const results = await Promise.all([
        post(`devoluciones/ventas/${d.body.id}/procesar`),
        post(`devoluciones/ventas/${d.body.id}/procesar`),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(
        await database.db.orm.public.Auditoria.where({
          accion: 'DEVOLUCION_VENTA_PROCESADA',
          entidadId: d.body.id as number,
        }).all(),
      ).toHaveLength(1);
      expect(
        (
          await database.db.orm.public.Existencia.where({
            productoId: p,
          }).first()
        )?.cantidad,
      ).toBe(9);
      evidencia.concurrenciaDevolucion = {
        status: [201, 409],
        stock: 9,
        auditoriasExito: 1,
      };
    });
    it('auditoría listada/detalle, filtros, paginación y proyección de usuario', async () => {
      const lista = await get(
        `auditoria?usuarioId=${usuarioId}&accion=PRODUCTO_CREADO&entidad=PRODUCTO&limit=1&page=1&sortOrder=asc`,
      ).expect(200);
      expect(lista.body.data).toHaveLength(1);
      expect(lista.body.pagination.hasNextPage).toBe(true);
      const row = lista.body.data[0];
      const detalle = await get(`auditoria/${row.id}`).expect(200);
      expect(detalle.body.usuario).toEqual({
        id: usuarioId,
        nombre: prefix,
        email: `${prefix.toLowerCase()}@example.invalid`,
      });
      expect(JSON.stringify(detalle.body)).not.toMatch(/password|access_token/);
      const busqueda = await get(
        `auditoria?search=${row.requestId}&usuarioId=${usuarioId}&entidadId=${row.entidadId}`,
      ).expect(200);
      expect(busqueda.body.pagination.totalItems).toBe(1);
      const empty = await get(
        `auditoria?usuarioId=${usuarioId}&fechaFin=2000-01-01`,
      ).expect(200);
      expect(empty.body.data).toEqual([]);
      validarError(await get('auditoria/2147483647'), 404, 'NOT_FOUND');
    });
    it.each([
      'page=0',
      'limit=101',
      'sortOrder=otro',
      'usuarioId=0',
      'fechaInicio=2026-10-03&fechaFin=2026-10-01',
      'fechaInicio=2026-02-30',
    ])('auditoría rechaza %s', async (q) => {
      validarError(
        await get(`auditoria?${q}`),
        400,
        q.includes('fechaFin') ? 'BAD_REQUEST' : 'VALIDATION_ERROR',
      );
    });
    it('catálogo, usuarios y sujetos: acciones administrativas auditadas sin datos sensibles', async () => {
      const user = await post('usuarios', {
        nombre: `${prefix}-USUARIO`,
        email: `${randomUUID()}@example.invalid`,
        password: clave,
        rolId,
      }).expect(201);
      usuarioIds.push(user.body.id as number);
      const categoria = await post('categorias', {
        nombre: `${prefix}-CATEGORIA`,
      }).expect(201);
      categoriaIds.push(categoria.body.id as number);
      await patch(`categorias/${categoria.body.id}`, {
        descripcion: 'Modificada',
      }).expect(200);
      await patch(`categorias/${categoria.body.id}/desactivar`).expect(200);
      await patch(`categorias/${categoria.body.id}/activar`).expect(200);
      const proveedor = await post('proveedores', {
        nombre: `${prefix}-PROVEEDOR`,
      }).expect(201);
      proveedorIds.push(proveedor.body.id as number);
      await patch(`proveedores/${proveedor.body.id}`, {
        contacto: 'Ficticio',
      }).expect(200);
      await patch(`proveedores/${proveedor.body.id}/desactivar`).expect(200);
      await patch(`proveedores/${proveedor.body.id}/activar`).expect(200);
      const cliente = await post('clientes', {
        nombre: `${prefix}-OTRO-CLIENTE`,
      }).expect(201);
      clienteIds.push(cliente.body.id as number);
      await patch(`clientes/${cliente.body.id}`, {
        telefono: '5550000000',
      }).expect(200);
      const acciones = (await auditorias()).map((a) => a.accion);
      expect(acciones).toEqual(
        expect.arrayContaining([
          'USUARIO_CREADO',
          'CATEGORIA_CREADA',
          'CATEGORIA_MODIFICADA',
          'CATEGORIA_DESACTIVADA',
          'CATEGORIA_ACTIVADA',
          'PROVEEDOR_CREADO',
          'PROVEEDOR_MODIFICADO',
          'PROVEEDOR_DESACTIVADO',
          'PROVEEDOR_ACTIVADO',
          'CLIENTE_CREADO',
          'CLIENTE_MODIFICADO',
        ]),
      );
      expect(JSON.stringify(await auditorias())).not.toContain(clave);
    });
    it('fallo de auditoría post-commit de catálogo conserva éxito y emite diagnóstico', async () => {
      const spy = vi
        .spyOn(database.db.orm.public.Auditoria, 'create')
        .mockRejectedValueOnce(new Error('Fallo audit catálogo fixture'));
      try {
        const r = await post('categorias', {
          nombre: `${prefix}-AUDIT-FALLO`,
        }).expect(201);
        categoriaIds.push(r.body.id as number);
        expect(
          (
            await database.db.orm.public.Categoria.where({
              id: r.body.id as number,
            }).first()
          )?.nombre,
        ).toBe(`${prefix}-AUDIT-FALLO`);
        expect(
          await database.db.orm.public.Auditoria.where({
            requestId: r.headers['x-request-id'] as string,
          }).all(),
        ).toEqual([]);
        expect(
          logs.find(
            (l) =>
              l['type'] === 'audit_failure' &&
              l['requestId'] === r.headers['x-request-id'],
          ),
        ).toBeDefined();
        evidencia.auditoriaPostCommit = {
          status: 201,
          negocioConfirmado: true,
          falloAuditoriaLogueado: true,
        };
      } finally {
        spy.mockRestore();
      }
    });
    it('GET Dashboard/Reportes no cambian negocio ni crean Auditoria', async () => {
      const antes = await auditorias();
      const orm = database.db.orm.public;
      const estado = async () => ({
        stocks: await orm.Existencia.where((e) => e.productoId.in(pIds)).all(),
        movimientos: await orm.MovimientoInventario.where((m) =>
          m.productoId.in(pIds),
        ).all(),
        ventas: await orm.Venta.where((v) => v.id.in(vIds)).all(),
        compras: await orm.Compra.where((c) => c.id.in(cIds)).all(),
        devolucionesVenta: await orm.DevolucionVenta.where((d) =>
          d.id.in(dvIds),
        ).all(),
        devolucionesCompra: await orm.DevolucionCompra.where((d) =>
          d.id.in(dcIds),
        ).all(),
      });
      const before = await estado();
      for (const ruta of [
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
      ])
        await get(ruta).expect(200);
      expect(await auditorias()).toEqual(antes);
      const after = await estado();
      expect(after).toEqual(before);
      const resumenEstado = (s: typeof before) => ({
        movimientos: s.movimientos.length,
        unidadesExistencia: s.stocks.reduce((n, e) => n + e.cantidad, 0),
        ventas: s.ventas.length,
        compras: s.compras.length,
        devolucionesVenta: s.devolucionesVenta.length,
        devolucionesCompra: s.devolucionesCompra.length,
      });
      evidencia.readOnly = {
        gets: 14,
        auditoriasAntes: antes.length,
        auditoriasDespues: antes.length,
        negocioIntacto: true,
        antes: resumenEstado(before),
        despues: resumenEstado(after),
      };
    });
    it('logs y metadata sin passwords, Authorization, JWT ni URL de conexión', async () => {
      const texto = JSON.stringify(logs);
      expect(texto).not.toContain(clave);
      expect(texto).not.toContain(token);
      expect(texto).not.toContain(consultaToken);
      expect(texto).not.toContain(process.env.DATABASE_URL!);
      expect(texto).not.toContain(process.env.JWT_SECRET!);
      expect(texto).not.toMatch(/Bearer ey|authorization|"password"/i);
      const audit = JSON.stringify(await auditorias());
      expect(audit).not.toContain(clave);
      expect(audit).not.toContain(token);
      expect(audit).not.toMatch(/password|authorization|cookie|access_token/i);
    });
  },
);
