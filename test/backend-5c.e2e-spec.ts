import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ClientesService } from '../src/modules/clientes/clientes.service.js';
import { ProductosService } from '../src/modules/productos/productos.service.js';
import { ListasPreciosService } from '../src/modules/listas-precios/listas-precios.service.js';
import { schemas } from '../src/common/http/openapi.schemas.js';
import { xlsxSintetico } from './fixtures/importaciones-xlsx.js';

interface Preview {
  id: number;
  hashArchivo: string;
  filasError: number;
  puedeConfirmar: boolean;
  totalFilas: number;
}
interface Fila {
  numeroFila: number;
  estado: string;
  datosNormalizados: Record<string, string>;
  plan: {
    accion: string;
    cambios: { campo: string; anterior: string | null; nuevo: string }[];
  };
  errores: { codigo: string }[];
  resultado: { entidad: string; id: number }[] | null;
}
const mimeXlsx =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Backend 5C PostgreSQL',
  () => {
    let app: INestApplication,
      db: DatabaseService,
      admin: string,
      lectura: string,
      rolId: number,
      usuarioId: number,
      categoriaId: number;
    const prefix = `TEST-5C-${randomUUID()}`.toUpperCase();
    const sesiones: number[] = [],
      ventas: number[] = [],
      compras: number[] = [],
      dvs: number[] = [],
      dcs: number[] = [],
      extraClientes: number[] = [],
      unitsCreated: number[] = [];
    const proveedores: number[] = [];
    const codes = [
      `T${randomUUID().replaceAll('-', '').slice(0, 25).toUpperCase()}P`,
      `T${randomUUID().replaceAll('-', '').slice(0, 25).toUpperCase()}C`,
    ];
    const evidence: Record<string, unknown> = {};
    let count = 0;
    const http = () => request(app.getHttpServer());
    const get = (route: string, token = admin) =>
      http().get(`/api/v1/${route}`).set('Authorization', `Bearer ${token}`);
    const post = (route: string, body: object, token = admin) =>
      http()
        .post(`/api/v1/${route}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const rawPreview = (
      tipo: string,
      data: Buffer,
      options: object = {},
      filename = 'fixture.csv',
      mime = 'text/csv',
      token = admin,
    ) =>
      http()
        .post(`/api/v1/importaciones/${tipo}/preview`)
        .set('Authorization', `Bearer ${token}`)
        .field('opciones', JSON.stringify(options))
        .attach('archivo', data, { filename, contentType: mime });
    async function preview(
      tipo: string,
      data: string | Buffer,
      options: object = {},
      filename = 'fixture.csv',
      mime = 'text/csv',
    ): Promise<Preview> {
      const r = await rawPreview(
        tipo,
        Buffer.isBuffer(data) ? data : Buffer.from(data),
        options,
        filename,
        mime,
      ).expect(201);
      const v = r.body as Preview;
      sesiones.push(v.id);
      return v;
    }
    const confirm = (p: Preview, options: object = {}) =>
      post(`importaciones/${p.id}/confirmar`, {
        hashArchivo: p.hashArchivo,
        ...options,
      });
    const filas = async (p: Preview): Promise<Fila[]> => {
      const r = await get(`importaciones/${p.id}/filas`).expect(200);
      return r.body.data as Fila[];
    };
    const clientesCsv = (n = 3, tag = String(count++)) =>
      'Nombre Comercial,RFC,E-Mail,Código Postal,Calle\n' +
      Array.from(
        { length: n },
        (_v, i) =>
          `${prefix}-${tag}-${i},${prefix}-${tag}-${i},persona${i}@example.invalid,'00123,Calle ficticia`,
      ).join('\n');
    const productosCsv = (skus: string[], unit = 'H87', nombre = 'PIEZA') =>
      'Clave de Producto o Servicio,No. Identificación,Clave Unidad,Unidad,Descripción,Valor Unitario,Objeto de Impuesto\n' +
      skus
        .map(
          (s) =>
            `42311512,${s},${unit},${nombre},${prefix} Caja ficticia,160,2`,
        )
        .join('\n');
    const configProductos = (extra: object = {}) => ({
      categoriaId,
      costoNuevos: '100.00',
      ...extra,
    });
    const configPrecios = (
      desde = '2026-01-01T00:00:00Z',
      extra: object = {},
    ) => ({
      columnaIdentidad: 'SKU',
      columnasPrecios: [
        { columna: 'Público', listaCodigo: codes[0] },
        { columna: 'Clínica', listaCodigo: codes[1] },
      ],
      vigenciaDesde: desde,
      ...extra,
    });
    const preciosCsv = (skus: string[], clinica = '155') =>
      'SKU,Público,Clínica,IVA\n' +
      skus.map((s) => `${s},180,${clinica},0.16`).join('\n');
    async function nuevosProductos(n = 1) {
      const skus = Array.from({ length: n }, () => `${prefix}-P-${count++}`);
      const p = await preview(
        'productos',
        productosCsv(skus),
        configProductos({ crearUnidadesFaltantes: true }),
      );
      expect(p.filasError).toBe(0);
      await confirm(p).expect(201);
      return skus;
    }
    beforeAll(async () => {
      const mod = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = mod.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
      db = app.get(DatabaseService);
      const o = db.db.orm.public;
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
      admin = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      lectura = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'CONSULTA' });
      for (const [clave, nombre] of [
        ['H87', 'PIEZA'],
        ['XBX', 'CAJA'],
        ['XPK', 'PAQUETE'],
        ['KPK', 'PAQUETE'],
      ]) {
        if (!(await o.UnidadMedida.where({ clave }).first())) {
          unitsCreated.push(
            (await o.UnidadMedida.create({ clave: clave!, nombre: nombre! }))
              .id,
          );
        }
      }
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      try {
        if (db)
          await db.db.transaction(async (tx) => {
            const all = await tx.orm.public.Importacion.where({
              usuarioId,
            }).all();
            for (const i of all) {
              await tx.orm.public.ImportacionFila.where({
                importacionId: i.id,
              }).deleteAll();
              await tx.orm.public.Importacion.where({ id: i.id }).delete();
            }
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
            const products = await tx.orm.public.Producto.where((p) =>
              p.sku.ilike(`${prefix}%`),
            ).all();
            for (const p of products) {
              await tx.orm.public.ProductoPrecio.where({
                productoId: p.id,
              }).deleteAll();
              await tx.orm.public.MovimientoInventario.where({
                productoId: p.id,
              }).deleteAll();
              await tx.orm.public.Existencia.where({
                productoId: p.id,
              }).deleteAll();
              await tx.orm.public.Producto.where({ id: p.id }).delete();
            }
            for (const code of codes)
              await tx.orm.public.ListaPrecio.where({
                codigo: code,
              }).deleteAll();
            const clients = await tx.orm.public.Cliente.where((c) =>
              c.rfc.ilike(`${prefix}%`),
            ).all();
            for (const c of clients) {
              await tx.orm.public.DomicilioCliente.where({
                clienteId: c.id,
              }).deleteAll();
              await tx.orm.public.Cliente.where({ id: c.id }).delete();
            }
            for (const id of extraClientes) {
              await tx.orm.public.DomicilioCliente.where({
                clienteId: id,
              }).deleteAll();
              await tx.orm.public.Cliente.where({ id }).deleteAll();
            }
            const units = await tx.orm.public.UnidadMedida.where((u) =>
              u.clave.ilike(`${prefix}%`),
            ).all();
            for (const u of units)
              await tx.orm.public.UnidadMedida.where({ id: u.id }).delete();
            for (const id of unitsCreated)
              await tx.orm.public.UnidadMedida.where({ id }).delete();
            for (const id of proveedores)
              await tx.orm.public.Proveedor.where({ id }).delete();
            await tx.orm.public.Auditoria.where({ usuarioId }).deleteAll();
            await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            await tx.orm.public.Usuario.where({ id: usuarioId }).delete();
            await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
        if (db) {
          expect(
            await db.db.orm.public.Importacion.where({ usuarioId }).all(),
          ).toEqual([]);
          expect(
            await db.db.orm.public.Producto.where((p) =>
              p.sku.ilike(`${prefix}%`),
            ).all(),
          ).toEqual([]);
          evidence.limpieza = true;
          await writeFile(
            'docs/backend-5c/evidencia.json',
            JSON.stringify(evidence, null, 2),
          );
        }
      } finally {
        if (app) await app.close();
      }
    });
    it('401 y 403 para todos los endpoints de importación', async () => {
      for (const route of [
        'importaciones',
        'importaciones/1',
        'importaciones/1/filas',
      ]) {
        await http().get(`/api/v1/${route}`).expect(401);
        await get(route, lectura).expect(403);
      }
      for (const tipo of ['clientes', 'productos', 'precios']) {
        await http().post(`/api/v1/importaciones/${tipo}/preview`).expect(401);
        await rawPreview(
          tipo,
          Buffer.from('Nombre\nUno'),
          {},
          'x.csv',
          'text/csv',
          lectura,
        ).expect(403);
      }
      for (const accion of ['confirmar', 'cancelar']) {
        await post(`importaciones/1/${accion}`, {}, lectura).expect(403);
      }
    });
    it('preview clientes es read-only comercial; confirmación importa 3 y domicilio', async () => {
      const before = {
        clientes: (await db.db.orm.public.Cliente.all()).length,
        productos: (await db.db.orm.public.Producto.all()).length,
        precios: (await db.db.orm.public.ProductoPrecio.all()).length,
        stock: await db.db.orm.public.Existencia.all(),
        movimientos: await db.db.orm.public.MovimientoInventario.all(),
        ventas: await db.db.orm.public.Venta.all(),
      };
      const p = await preview('clientes', clientesCsv());
      expect(p).toMatchObject({
        totalFilas: 3,
        filasError: 0,
        puedeConfirmar: true,
      });
      expect((await db.db.orm.public.Cliente.all()).length).toBe(
        before.clientes,
      );
      expect((await db.db.orm.public.Producto.all()).length).toBe(
        before.productos,
      );
      expect((await db.db.orm.public.ProductoPrecio.all()).length).toBe(
        before.precios,
      );
      expect(await db.db.orm.public.Existencia.all()).toEqual(before.stock);
      expect(await db.db.orm.public.MovimientoInventario.all()).toEqual(
        before.movimientos,
      );
      expect(await db.db.orm.public.Venta.all()).toEqual(before.ventas);
      const f = await filas(p);
      expect(f.every((x) => x.plan.accion === 'CREAR')).toBe(true);
      expect(f[0]!.datosNormalizados['domicilioFiscal.codigoPostal']).toBe(
        '00123',
      );
      await confirm(p).expect(201);
      const rows = await filas(p);
      expect(rows.every((r) => r.resultado?.[0]?.entidad === 'CLIENTE')).toBe(
        true,
      );
      const c = await db.db.orm.public.Cliente.where({
        id: rows[0]!.resultado![0]!.id,
      })
        .include('domicilioFiscal')
        .first();
      expect(c!.domicilioFiscal!.codigoPostal).toBe('00123');
      evidence.previewReadOnly = true;
      evidence.clientesImportados = 3;
    });
    it('update RFC controlado, conserva celdas vacías y sin cambios', async () => {
      const rfc = `${prefix}-UPDATE`;
      const original = await app.get(ClientesService).create({
        nombre: 'Ficticio anterior',
        rfc,
        email: 'anterior@example.invalid',
        telefono: '0000123',
        domicilioFiscal: { pais: 'MX', calle: 'Conservar' },
      });
      extraClientes.push(original!.id);
      // Caso legacy: identidad almacenada sin normalización, misma entidad.
      await db.db.orm.public.Cliente.where({ id: original!.id }).update({
        rfc: ` ${rfc.toLowerCase()} `,
      });
      const p = await preview(
        'clientes',
        `Nombre Comercial,RFC,E-Mail,Teléfono,País,Calle\nNuevo nombre,${rfc},,,MX,`,
      );
      const f = await filas(p);
      expect(f[0]!.plan.accion).toBe('ACTUALIZAR');
      await confirm(p).expect(409);
      await confirm(p, { autorizarActualizaciones: true }).expect(201);
      const c = await app.get(ClientesService).findOne(original!.id);
      expect(c.email).toBe('anterior@example.invalid');
      expect(c.telefono).toBe('0000123');
      expect(c.domicilioFiscal!.calle).toBe('Conservar');
      const unchanged = await preview(
        'clientes',
        `Nombre Comercial,RFC\nNuevo nombre,${rfc}\n`,
      );
      expect((await filas(unchanged))[0]!.plan.accion).toBe('SIN_CAMBIOS');
      await confirm(unchanged).expect(201);
    });
    it('duplicado de archivo y errores por fila bloquean todo el batch', async () => {
      const rfc = `${prefix}-DUP`;
      const p = await preview(
        'clientes',
        `Nombre,RFC\nUno,${rfc}\nDos,${rfc.toLowerCase()}`,
      );
      expect(p.filasError).toBe(2);
      await confirm(p).expect(409);
      const f = await filas(p);
      expect(
        f.every((x) =>
          x.errores.some((e) => e.codigo === 'RFC_DUPLICADO_ARCHIVO'),
        ),
      ).toBe(true);
      await rawPreview(
        'clientes',
        Buffer.from(`Nombre,RFC\nUno,${rfc}\nDos,${rfc.toLowerCase()}`),
      ).expect(409);
      const legacyRfc = `${prefix}-DB-DUP`;
      await db.db.orm.public.Cliente.create({ nombre: prefix, rfc: legacyRfc });
      await db.db.orm.public.Cliente.create({
        nombre: prefix,
        rfc: legacyRfc.toLowerCase(),
      });
      const bd = await preview(
        'clientes',
        `Nombre,RFC\nImportado,${legacyRfc}`,
      );
      expect(bd.filasError).toBe(1);
      expect(
        (await filas(bd))[0]!.errores.some(
          (e) => e.codigo === 'RFC_CONFLICTO_BD',
        ),
      ).toBe(true);
      await confirm(bd, { autorizarActualizaciones: true }).expect(409);
    });
    it('hash distinto rechazado; duplicado completado 409', async () => {
      const data = clientesCsv(1);
      const p = await preview('clientes', data);
      await post(`importaciones/${p.id}/confirmar`, {
        hashArchivo: '0'.repeat(64),
      }).expect(409);
      await confirm(p).expect(201);
      const r = await rawPreview('clientes', Buffer.from(data)).expect(409);
      expect(r.body.code).toBe('IMPORT_ARCHIVO_DUPLICADO');
    });
    it('cancelar solo PREVIEW y permite repreview explícito del mismo archivo', async () => {
      const data = clientesCsv(1);
      const p = await preview('clientes', data);
      await post(`importaciones/${p.id}/cancelar`, {}).expect(201);
      await confirm(p).expect(409);
      const again = await preview('clientes', data);
      await confirm(again).expect(201);
      await post(`importaciones/${again.id}/cancelar`, {}).expect(409);
    });
    it('filas paginadas con estado/search y listado de sesiones', async () => {
      const p = await preview('clientes', clientesCsv(3));
      const r = await get(
        `importaciones/${p.id}/filas?page=2&limit=1&estado=ADVERTENCIA&search=TEST-5C`,
      ).expect(200);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.pagination.totalItems).toBe(3);
      const list = await get(
        'importaciones?tipo=CLIENTES&estado=PREVIEW&limit=1',
      ).expect(200);
      expect(list.body.data).toHaveLength(1);
      await get('importaciones/2147483647').expect(404);
    });
    it('preview expirado y cliente inactivo no se confirman', async () => {
      const p = await preview('clientes', clientesCsv(1));
      await db.db.orm.public.Importacion.where({ id: p.id }).update({
        createdAt: '2020-01-01T00:00:00Z',
      });
      const r = await confirm(p).expect(409);
      expect(r.body.code).toBe('IMPORT_PREVIEW_EXPIRADO');
    });
    it('clientes sin RFC se crean con advertencia, nunca upsert por nombre', async () => {
      const p = await preview('clientes', 'Nombre Comercial\nFicticio sin RFC');
      expect((await filas(p))[0]!.plan.accion).toBe('CREAR');
      await confirm(p).expect(201);
      extraClientes.push((await filas(p))[0]!.resultado![0]!.id);
    });
    it('stale preview detecta RFC creado después; no sobrescribe', async () => {
      const rfc = `${prefix}-STALE`;
      const p = await preview('clientes', `Nombre,RFC\nImportado,${rfc}`);
      await app.get(ClientesService).create({ nombre: 'Creado después', rfc });
      const r = await confirm(p, { autorizarActualizaciones: true }).expect(
        409,
      );
      expect(r.body.code).toBe('IMPORT_PREVIEW_OBSOLETO');
      expect(
        (await db.db.orm.public.Cliente.where({ rfc }).first())!.nombre,
      ).toBe('Creado después');
      evidence.stalePreview = true;
    });
    it('rollback clientes después de primera escritura; FALLIDA y cero parcialidad', async () => {
      const data = clientesCsv(3, 'ROLLBACKCLIENTES');
      const p = await preview('clientes', data);
      const service = app.get(ClientesService),
        original = service.guardarImportadoEnTransaccion.bind(service);
      let calls = 0;
      vi.spyOn(service, 'guardarImportadoEnTransaccion').mockImplementation(
        async (...args) => {
          if (++calls === 2) throw new Error('Fallo sintético');
          return original(...args);
        },
      );
      const r = await confirm(p).expect(409);
      expect(r.body.code).toBe('IMPORT_CONFIRM_ROLLBACK');
      expect((await get(`importaciones/${p.id}`)).body.estado).toBe('FALLIDA');
      expect(
        await db.db.orm.public.Cliente.where((c) =>
          c.rfc.ilike(`${prefix}-ROLLBACKCLIENTES%`),
        ).all(),
      ).toEqual([]);
      expect((await filas(p)).every((f) => f.resultado === null)).toBe(true);
      evidence.rollbackClientes = true;
    });
    it('doble confirmación concurrente produce una ejecución', async () => {
      const p = await preview('clientes', clientesCsv(3, 'CONCURRENT'));
      const r = await Promise.all([confirm(p), confirm(p)]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(
        await db.db.orm.public.Cliente.where((c) =>
          c.rfc.ilike(`${prefix}-CONCURRENT%`),
        ).all(),
      ).toHaveLength(3);
      evidence.dobleConfirmacion = r.map((x) => x.status);
    });
    it('productos: SAT, SKU, unidades H87/XBX/XPK/KPK y stock cero sin Kardex', async () => {
      const skus = [
        `${prefix}-HEGA1805`,
        `${prefix}-PIEZA`,
        `${prefix}-XPK`,
        `${prefix}-KPK`,
      ];
      const data =
        'Clave de Producto o Servicio,No. Identificación,Clave Unidad,Unidad,Descripción,Valor Unitario,Objeto de Impuesto\n' +
        [
          ['XBX', 'CAJA'],
          ['H87', 'PIEZA'],
          ['XPK', 'PAQUETE'],
          ['KPK', 'PAQUETE'],
        ]
          .map(
            ([u, n], i) => `42311512,${skus[i]},${u},${n},${prefix} ${i},160,2`,
          )
          .join('\n');
      const p = await preview('productos', data, configProductos());
      expect(p.filasError).toBe(0);
      expect(
        await db.db.orm.public.Producto.where((x) => x.sku.in(skus)).all(),
      ).toEqual([]);
      await confirm(p).expect(201);
      const products = await db.db.orm.public.Producto.where((x) =>
        x.sku.in(skus),
      )
        .include('existencia')
        .include('unidadCatalogo')
        .all();
      expect(products).toHaveLength(4);
      for (const prod of products) {
        expect(prod.precio).toBe('160.00');
        expect(prod.costo).toBe('100.00');
        expect(prod.claveProductoServicioSat).toBe('42311512');
        expect(prod.unidadMedida).toBe(prod.unidadCatalogo!.nombre);
        expect(prod.existencia!.cantidad).toBe(0);
        expect(
          await db.db.orm.public.MovimientoInventario.where({
            productoId: prod.id,
          }).all(),
        ).toEqual([]);
      }
    });
    it('producto nuevo sin costo explícito produce ERROR; no inventa costo', async () => {
      const p = await preview(
        'productos',
        productosCsv([`${prefix}-SIN-COSTO`]),
        { categoriaId },
      );
      expect(p.filasError).toBe(1);
      expect(
        (await filas(p))[0]!.errores.some(
          (e) => e.codigo === 'COSTO_REQUERIDO',
        ),
      ).toBe(true);
      await confirm(p).expect(409);
    });
    it('unidad faltante default false y creación explícita transaccional', async () => {
      const sku = `${prefix}-UNIDAD`,
        unit = `${prefix}-U`;
      const p = await preview(
        'productos',
        productosCsv([sku], unit, 'CAJA'),
        configProductos(),
      );
      expect(
        (await filas(p))[0]!.errores.some(
          (e) => e.codigo === 'UNIDAD_NO_EXISTE',
        ),
      ).toBe(true);
      await post(`importaciones/${p.id}/cancelar`, {}).expect(201);
      const again = await preview(
        'productos',
        productosCsv([sku], unit, 'CAJA'),
        configProductos({ crearUnidadesFaltantes: true }),
      );
      await confirm(again).expect(201);
      expect(
        await db.db.orm.public.UnidadMedida.where({ clave: unit }).first(),
      ).not.toBeNull();
    });
    it('producto existente muestra precio160→170, pide update, preserva costo/stock', async () => {
      const [sku] = await nuevosProductos();
      const data = productosCsv([sku!]).replace(',160,2', ',170,2');
      const p = await preview('productos', data, { categoriaId });
      const f = (await filas(p))[0]!;
      expect(
        f.plan.cambios.some(
          (c) =>
            c.campo === 'precio' &&
            c.anterior === '160.00' &&
            c.nuevo === '170.00',
        ),
      ).toBe(true);
      await confirm(p).expect(409);
      await confirm(p, { autorizarActualizaciones: true }).expect(201);
      const prod = await db.db.orm.public.Producto.where({ sku: sku! })
        .include('existencia')
        .first();
      expect(prod!.precio).toBe('170.00');
      expect(prod!.costo).toBe('100.00');
      expect(prod!.existencia!.cantidad).toBe(0);
    });
    it('stale preview SKU creado después rechaza batch', async () => {
      const sku = `${prefix}-STALE-SKU`;
      const p = await preview(
        'productos',
        productosCsv([sku]),
        configProductos(),
      );
      await app.get(ProductosService).create({
        sku,
        nombre: 'Después',
        precio: 160,
        costo: 100,
        stockMinimo: 0,
        categoriaId,
      });
      const r = await confirm(p, { autorizarActualizaciones: true }).expect(
        409,
      );
      expect(r.body.code).toBe('IMPORT_PREVIEW_OBSOLETO');
    });
    it('rollback productos revierte unidades nuevas y existencias', async () => {
      const skus = [`${prefix}-RB-P1`, `${prefix}-RB-P2`],
        unit = `${prefix}-RB-U`;
      const p = await preview(
        'productos',
        productosCsv(skus, unit, 'CAJA'),
        configProductos({ crearUnidadesFaltantes: true }),
      );
      const service = app.get(ProductosService),
        original = service.guardarImportadoEnTransaccion.bind(service);
      let calls = 0;
      vi.spyOn(service, 'guardarImportadoEnTransaccion').mockImplementation(
        async (...args) => {
          if (++calls === 2) throw new Error('Fallo sintético');
          return original(...args);
        },
      );
      await confirm(p).expect(409);
      expect(
        await db.db.orm.public.Producto.where((x) => x.sku.in(skus)).all(),
      ).toEqual([]);
      expect(
        await db.db.orm.public.UnidadMedida.where({ clave: unit }).first(),
      ).toBeNull();
      evidence.rollbackProductos = true;
    });
    it('listas faltantes no se crean sin opción explícita; confirmar crea dentro del batch', async () => {
      const skus = await nuevosProductos(3);
      const data = preciosCsv(skus);
      const p = await preview('precios', data, configPrecios());
      expect(p.filasError).toBe(3);
      expect(
        (await filas(p))[0]!.errores.some(
          (e) => e.codigo === 'LISTA_NO_EXISTE',
        ),
      ).toBe(true);
      await post(`importaciones/${p.id}/cancelar`, {}).expect(201);
      const again = await preview(
        'precios',
        data,
        configPrecios('2026-01-01T00:00:00Z', { crearListasFaltantes: true }),
      );
      expect(again.filasError).toBe(0);
      await confirm(again, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      expect(
        await db.db.orm.public.ListaPrecio.where((l) =>
          l.codigo.in(codes),
        ).all(),
      ).toHaveLength(2);
      evidence.preciosIniciales = 6;
    });
    it('XLSX selecciona hoja y usa mapping por encabezado, no posición', async () => {
      const [sku] = await nuevosProductos();
      const buffer = xlsxSintetico([
        { nombre: 'Ignorar', rows: [['Otro'], ['Nunca']] },
        {
          nombre: 'Precios',
          rows: [
            ['Clínica', 'SKU', 'Público', 'IVA'],
            [
              { value: '155', numeric: true },
              sku!,
              { value: '180', numeric: true },
              { value: '0.16', numeric: true },
            ],
          ],
        },
      ]);
      const p = await preview(
        'precios',
        buffer,
        configPrecios('2026-01-01T00:00:00Z', { hoja: 'Precios' }),
        'fixture.xlsx',
        mimeXlsx,
      );
      expect((await get(`importaciones/${p.id}`)).body.hojas).toEqual([
        'Ignorar',
        'Precios',
      ]);
      await confirm(p, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(201);
    });
    it('hoja sin SKU requiere cruce explícito de identidad', async () => {
      const [sku] = await nuevosProductos();
      const b = xlsxSintetico([
        {
          nombre: 'Histórica',
          rows: [
            ['Descripción', 'Clínica'],
            ['Artículo ficticio', { value: '155', numeric: true }],
          ],
        },
      ]);
      const options = {
        columnaIdentidad: 'Descripción',
        columnasPrecios: [{ columna: 'Clínica', listaCodigo: codes[1] }],
        mappingIdentidades: [{ identificador: 'Artículo ficticio', sku }],
        vigenciaDesde: '2026-01-01T00:00:00Z',
      };
      const p = await preview('precios', b, options, 'fixture.xlsx', mimeXlsx);
      expect(p.filasError).toBe(0);
      await confirm(p, { vigenciaDesde: options.vigenciaDesde }).expect(201);
    });
    it('sin cambios no crea vigencia adicional', async () => {
      const [sku] = await nuevosProductos();
      const first = await preview(
        'precios',
        preciosCsv([sku!], '165'),
        configPrecios(),
      );
      await confirm(first, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const p = await preview(
        'precios',
        preciosCsv([sku!], '165') + '\n',
        configPrecios(),
      );
      expect((await filas(p))[0]!.plan.accion).toBe('SIN_CAMBIOS');
      const prod = (await db.db.orm.public.Producto.where({
        sku: sku!,
      }).first())!;
      const before = await db.db.orm.public.ProductoPrecio.where({
        productoId: prod.id,
      }).all();
      await confirm(p, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(201);
      expect(
        await db.db.orm.public.ProductoPrecio.where({
          productoId: prod.id,
        }).all(),
      ).toEqual(before);
    });
    it('cierre futuro requiere autorización y vigencia coincidente; luego cambia155→165 sin solapamiento', async () => {
      const [sku] = await nuevosProductos();
      const initial = await preview(
        'precios',
        preciosCsv([sku!]),
        configPrecios(),
      );
      await confirm(initial, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const corte = new Date(Date.now() + 60000).toISOString();
      const p = await preview(
        'precios',
        preciosCsv([sku!], '165'),
        configPrecios(corte),
      );
      expect((await filas(p))[0]!.plan.accion).toBe('CERRAR_Y_CREAR');
      await confirm(p, { vigenciaDesde: corte }).expect(409);
      await confirm(p, {
        vigenciaDesde: '2035-01-01T00:00:00Z',
        autorizarCierreVigencias: true,
      }).expect(409);
      await confirm(p, {
        vigenciaDesde: corte,
        autorizarCierreVigencias: true,
      }).expect(201);
      const prod = (await db.db.orm.public.Producto.where({
          sku: sku!,
        }).first())!,
        l = (await db.db.orm.public.ListaPrecio.where({
          codigo: codes[1],
        }).first())!;
      const pp = await db.db.orm.public.ProductoPrecio.where({
        productoId: prod.id,
        listaPrecioId: l.id,
      })
        .orderBy((x) => x.id.asc())
        .all();
      expect(pp).toHaveLength(2);
      expect(new Date(pp[0]!.vigenciaHasta!).toISOString()).toBe(corte);
      expect(new Date(pp[1]!.vigenciaDesde).toISOString()).toBe(corte);
    });
    it('dos importaciones diferentes del mismo precio: una completa y otra stale', async () => {
      const [sku] = await nuevosProductos();
      const initial = await preview(
        'precios',
        preciosCsv([sku!]),
        configPrecios(),
      );
      await confirm(initial, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const corte = new Date(Date.now() + 60000).toISOString();
      const a = await preview(
          'precios',
          preciosCsv([sku!], '165'),
          configPrecios(corte),
        ),
        b = await preview(
          'precios',
          preciosCsv([sku!], '175'),
          configPrecios(corte),
        );
      const r = await Promise.all([
        confirm(a, { vigenciaDesde: corte, autorizarCierreVigencias: true }),
        confirm(b, { vigenciaDesde: corte, autorizarCierreVigencias: true }),
      ]);
      expect(r.map((x) => x.status).sort((x, y) => x - y)).toEqual([201, 409]);
      evidence.concurrenciaPrecios = r.map((x) => x.status);
    });
    it('rollback precios revierte cierre y nuevas vigencias', async () => {
      const skus = await nuevosProductos(2);
      const initial = await preview(
        'precios',
        preciosCsv(skus),
        configPrecios(),
      );
      await confirm(initial, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const corte = new Date(Date.now() + 60000).toISOString(),
        p = await preview(
          'precios',
          preciosCsv(skus, '165'),
          configPrecios(corte),
        );
      const prods = await db.db.orm.public.Producto.where((x) =>
          x.sku.in(skus),
        ).all(),
        before = await db.db.orm.public.ProductoPrecio.where((x) =>
          x.productoId.in(prods.map((p) => p.id)),
        )
          .orderBy((x) => x.id.asc())
          .all();
      const service = app.get(ListasPreciosService),
        original = service.aplicarVigenciaImportada.bind(service);
      let calls = 0;
      vi.spyOn(service, 'aplicarVigenciaImportada').mockImplementation(
        async (...args) => {
          if (++calls === 2) throw new Error('Fallo sintético');
          return original(...args);
        },
      );
      await confirm(p, {
        vigenciaDesde: corte,
        autorizarCierreVigencias: true,
      }).expect(409);
      expect(
        await db.db.orm.public.ProductoPrecio.where((x) =>
          x.productoId.in(prods.map((p) => p.id)),
        )
          .orderBy((x) => x.id.asc())
          .all(),
      ).toEqual(before);
      evidence.rollbackPrecios = true;
    });
    it('flujo integral 3 clientes/productos, precios, venta155, segunda importación165 y snapshot intacto', async () => {
      const cp = await preview('clientes', clientesCsv(3, 'INTEGRAL'));
      await confirm(cp).expect(201);
      const cliente = (await filas(cp))[0]!.resultado![0]!.id;
      const skus = Array.from(
          { length: 3 },
          (_v, i) => `${prefix}-INTEGRAL-${i}`,
        ),
        pp = await preview('productos', productosCsv(skus), configProductos());
      await confirm(pp).expect(201);
      const prod = (await db.db.orm.public.Producto.where({ sku: skus[0]! })
        .include('existencia')
        .first())!;
      expect(prod.existencia!.cantidad).toBe(0);
      const prices = await preview(
        'precios',
        preciosCsv(skus),
        configPrecios(),
      );
      await confirm(prices, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const l = (await db.db.orm.public.ListaPrecio.where({
        codigo: codes[1],
      }).first())!;
      const v1 = await post('ventas', {
        clienteId: cliente,
        listaPrecioId: l.id,
        detalles: [{ productoId: prod.id, cantidad: 1 }],
      }).expect(201);
      ventas.push(v1.body.id);
      expect(v1.body.detalles[0].precioUnitario).toBe('155.00');
      const corte = new Date(Date.now() + 1500).toISOString();
      const next = await preview(
        'precios',
        preciosCsv([skus[0]!], '165'),
        configPrecios(corte),
      );
      await confirm(next, {
        vigenciaDesde: corte,
        autorizarCierreVigencias: true,
      }).expect(201);
      await new Promise((resolve) => setTimeout(resolve, 1600));
      expect(
        (await get(`ventas/${v1.body.id}`)).body.detalles[0].precioUnitario,
      ).toBe('155.00');
      const v2 = await post('ventas', {
        clienteId: cliente,
        listaPrecioId: l.id,
        detalles: [{ productoId: prod.id, cantidad: 1 }],
      }).expect(201);
      ventas.push(v2.body.id);
      expect(v2.body.detalles[0].precioUnitario).toBe('165.00');
      expect(
        (await db.db.orm.public.Existencia.where({
          productoId: prod.id,
        }).first())!.cantidad,
      ).toBe(0);
      expect(
        await db.db.orm.public.MovimientoInventario.where({
          productoId: prod.id,
        }).all(),
      ).toEqual([]);
      evidence.integral = {
        clientes: 3,
        productos: 3,
        stockImportado: 0,
        precioBase: '160.00',
        publico: '180.00',
        clinicaAntes: '155.00',
        clinicaDespues: '165.00',
        ventaHistorica: '155.00',
        ventaNueva: '165.00',
        kardexImportacion: 0,
      };
    });
    it('importación de precios preserva snapshots de Compra, Venta CONFIRMADA y ambas devoluciones', async () => {
      const [sku] = await nuevosProductos();
      const prod = (await db.db.orm.public.Producto.where({
        sku: sku!,
      }).first())!;
      const cp = await preview('clientes', clientesCsv(1, 'SNAPSHOTS'));
      await confirm(cp).expect(201);
      const clienteId = (await filas(cp))[0]!.resultado![0]!.id;
      const supplier = await db.db.orm.public.Proveedor.create({
        nombre: prefix,
      });
      proveedores.push(supplier.id);
      const first = await preview(
        'precios',
        preciosCsv([sku!]),
        configPrecios(),
      );
      await confirm(first, { vigenciaDesde: '2026-01-01T00:00:00Z' }).expect(
        201,
      );
      const lista = (await db.db.orm.public.ListaPrecio.where({
        codigo: codes[1],
      }).first())!;
      const c = await post('compras', {
        proveedorId: supplier.id,
        detalles: [{ productoId: prod.id, cantidad: 10, costoUnitario: 100 }],
      }).expect(201);
      compras.push(c.body.id);
      await post(`compras/${c.body.id}/recibir`, {}).expect(201);
      const v = await post('ventas', {
        clienteId,
        listaPrecioId: lista.id,
        detalles: [{ productoId: prod.id, cantidad: 3 }],
      }).expect(201);
      ventas.push(v.body.id);
      await post(`ventas/${v.body.id}/confirmar`, {}).expect(201);
      const dv = await post('devoluciones/ventas', {
        ventaId: v.body.id,
        motivo: 'Fixture',
        detalles: [{ detalleVentaId: v.body.detalles[0].id, cantidad: 1 }],
      }).expect(201);
      dvs.push(dv.body.id);
      await post(`devoluciones/ventas/${dv.body.id}/procesar`, {}).expect(201);
      const dc = await post('devoluciones/compras', {
        compraId: c.body.id,
        motivo: 'Fixture',
        detalles: [{ detalleCompraId: c.body.detalles[0].id, cantidad: 1 }],
      }).expect(201);
      dcs.push(dc.body.id);
      await post(`devoluciones/compras/${dc.body.id}/procesar`, {}).expect(201);
      const routes = [
        `compras/${c.body.id}`,
        `ventas/${v.body.id}`,
        `devoluciones/ventas/${dv.body.id}`,
        `devoluciones/compras/${dc.body.id}`,
      ];
      const antes = await Promise.all(routes.map((r) => get(r).expect(200)));
      const movimientos = await db.db.orm.public.MovimientoInventario.where({
        productoId: prod.id,
      }).all();
      const corte = new Date(Date.now() + 1500).toISOString();
      const next = await preview(
        'precios',
        preciosCsv([sku!], '165'),
        configPrecios(corte),
      );
      await confirm(next, {
        vigenciaDesde: corte,
        autorizarCierreVigencias: true,
      }).expect(201);
      await new Promise((resolve) => setTimeout(resolve, 1600));
      for (let i = 0; i < routes.length; i++)
        expect((await get(routes[i]!).expect(200)).body).toEqual(
          antes[i]!.body,
        );
      expect(antes[0]!.body.detalles[0].costoUnitario).toBe('100.00');
      expect(antes[1]!.body.detalles[0].precioUnitario).toBe('155.00');
      expect(antes[2]!.body.detalles[0].precioUnitario).toBe('155.00');
      expect(antes[3]!.body.detalles[0].costoUnitario).toBe('100.00');
      expect(
        await db.db.orm.public.MovimientoInventario.where({
          productoId: prod.id,
        }).all(),
      ).toEqual(movimientos);
      expect(
        (await db.db.orm.public.Existencia.where({
          productoId: prod.id,
        }).first())!.cantidad,
      ).toBe(7);
      evidence.snapshotsComerciales = {
        compra: '100.00',
        venta: '155.00',
        devolucionVenta: '155.00',
        devolucionCompra: '100.00',
        stockSinCambio: 7,
      };
    });
    it.each([
      ['fixture.txt', 'text/plain', 'Nombre\nUno'],
      ['fixture.csv', 'image/png', 'Nombre\nUno'],
      ['fixture.csv', 'text/csv', ''],
      ['fixture.csv', 'text/csv', 'No reconocido\nUno'],
      ['fixture.csv', 'text/csv', 'Nombre\n"Sin cierre'],
      ['fixture.xlsx', mimeXlsx, 'PKinvalido'],
    ])('archivo inválido %s/%s', async (filename, mime, data) => {
      await rawPreview(
        filename.endsWith('.xlsx') ? 'precios' : 'clientes',
        Buffer.from(data),
        {},
        filename,
        mime,
      ).expect(400);
    });
    it('tamaño excedido seguro, campos desconocidos y filename nunca es ruta', async () => {
      await rawPreview(
        'clientes',
        Buffer.alloc(2 * 1024 * 1024 + 1, 65),
      ).expect(413);
      await http()
        .post('/api/v1/importaciones/clientes/preview')
        .set('Authorization', `Bearer ${admin}`)
        .attach('archivo', Buffer.from('Nombre\nUno'), {
          filename: 'x.csv',
          contentType: 'text/csv',
        })
        .field('ruta', '/etc/passwd')
        .expect(400);
      const p = await preview(
        'clientes',
        clientesCsv(1),
        {},
        '../../fixture.csv',
      );
      expect((await get(`importaciones/${p.id}`)).body.nombreArchivo).toBe(
        'fixture.csv',
      );
    });
    it('Swagger multipart, auditoría batch y privacidad de metadata', async () => {
      const actions = await db.db.orm.public.Auditoria.where({
        usuarioId,
      }).all();
      expect(
        actions.some((a) => a.accion === 'IMPORTACION_PREVIEW_CREADO'),
      ).toBe(true);
      expect(actions.some((a) => a.accion === 'IMPORTACION_COMPLETADA')).toBe(
        true,
      );
      expect(actions.some((a) => a.accion === 'IMPORTACION_FALLIDA')).toBe(
        true,
      );
      for (const a of actions.filter((a) => a.entidad === 'IMPORTACION')) {
        expect(a.metadata ?? '').not.toContain('@example');
        expect(a.metadata ?? '').not.toContain('Calle ficticia');
      }
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      doc.components ??= {};
      doc.components.schemas = { ...doc.components.schemas, ...schemas };
      expect(
        doc.paths['/api/v1/importaciones/clientes/preview']?.post?.requestBody,
      ).toHaveProperty('content.multipart/form-data');
      expect(doc.components.schemas.ImportacionFila).toHaveProperty(
        'properties.plan.properties.accion',
      );
      await writeFile(
        'docs/backend-5c/openapi.json',
        JSON.stringify(doc, null, 2),
      );
    });
  },
);
