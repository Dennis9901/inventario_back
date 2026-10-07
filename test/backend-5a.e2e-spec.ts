import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFile } from 'node:fs/promises';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { schemas } from '../src/common/http/openapi.schemas.js';

describe.runIf(process.env.TEST_INVENTARIO_DB === '1')(
  'Backend 5A con PostgreSQL',
  () => {
    let app: INestApplication;
    let database: DatabaseService;
    let rolId: number;
    let usuarioId: number;
    let categoriaId: number;
    let admin: string;
    let consulta: string;
    const prefix = `TEST-5A-${randomUUID()}`.toUpperCase();
    const clientes: number[] = [];
    const productos: number[] = [];
    const unidades: number[] = [];
    const http = () => request(app.getHttpServer());
    const post = (ruta: string, body: object, auth = admin) =>
      http()
        .post(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${auth}`)
        .send(body);
    const patch = (ruta: string, body: object = {}, auth = admin) =>
      http()
        .patch(`/api/v1/${ruta}`)
        .set('Authorization', `Bearer ${auth}`)
        .send(body);
    const get = (ruta: string) =>
      http().get(`/api/v1/${ruta}`).set('Authorization', `Bearer ${consulta}`);
    const del = (ruta: string) =>
      http().delete(`/api/v1/${ruta}`).set('Authorization', `Bearer ${admin}`);
    async function cliente(body: object = {}) {
      const r = await post('clientes', { nombre: prefix, ...body }).expect(201);
      clientes.push(r.body.id);
      return r.body as { id: number; rfc: string | null };
    }
    async function unidad(clave: string, nombre: string) {
      const r = await post('unidades-medida', { clave, nombre }).expect(201);
      unidades.push(r.body.id);
      return r.body as { id: number; clave: string; nombre: string };
    }
    async function producto(body: object = {}) {
      const r = await post('productos', {
        sku: `${prefix}-${productos.length}`,
        nombre: prefix,
        costo: 100,
        precio: 160,
        categoriaId,
        stockMinimo: 0,
        ...body,
      }).expect(201);
      productos.push(r.body.id);
      return r.body as {
        id: number;
        sku: string;
        unidadMedida: string;
        unidadMedidaId: number | null;
      };
    }
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
      database = app.get(DatabaseService);
      const orm = database.db.orm.public;
      rolId = (await orm.Rol.create({ nombre: prefix })).id;
      usuarioId = (
        await orm.Usuario.create({
          nombre: prefix,
          email: `${prefix}@example.invalid`,
          password: 'fixture',
          rolId,
        })
      ).id;
      categoriaId = (await orm.Categoria.create({ nombre: prefix })).id;
      admin = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'ADMINISTRADOR' });
      consulta = await app
        .get(JwtService)
        .signAsync({ sub: usuarioId, rol: 'CONSULTA' });
    });
    afterAll(async () => {
      try {
        if (database) {
          await database.db.transaction(async (tx) => {
            for (const id of productos) {
              await tx.orm.public.Existencia.where({
                productoId: id,
              }).deleteAll();
              await tx.orm.public.Producto.where({ id }).deleteAll();
            }
            for (const id of clientes) {
              await tx.orm.public.DomicilioCliente.where({
                clienteId: id,
              }).deleteAll();
              await tx.orm.public.Cliente.where({ id }).deleteAll();
            }
            for (const id of unidades)
              await tx.orm.public.UnidadMedida.where({ id }).deleteAll();
            await tx.orm.public.Auditoria.where({ usuarioId }).deleteAll();
            await tx.orm.public.Categoria.where({ id: categoriaId }).delete();
            await tx.orm.public.Usuario.where({ id: usuarioId }).delete();
            await tx.orm.public.Rol.where({ id: rolId }).delete();
          });
          for (const id of clientes)
            expect(
              await database.db.orm.public.DomicilioCliente.where({
                clienteId: id,
              }).first(),
            ).toBeNull();
          for (const id of unidades)
            expect(
              await database.db.orm.public.UnidadMedida.where({ id }).first(),
            ).toBeNull();
          for (const id of productos)
            expect(
              await database.db.orm.public.Producto.where({ id }).first(),
            ).toBeNull();
        }
      } finally {
        await database?.db.close();
        await app?.close();
      }
    });
    it('cliente legacy funciona sin datos fiscales ni domicilio', async () => {
      const c = await cliente({
        apellido: 'Ejemplo',
        telefono: '123',
        direccion: 'Legacy',
      });
      expect((await get(`clientes/${c.id}`).expect(200)).body).toMatchObject({
        apellido: 'Ejemplo',
        direccion: 'Legacy',
        rfc: null,
        domicilioFiscal: null,
      });
    });
    it('cliente extendido persiste y normaliza fiscal, contactos y domicilio sin perder ceros', async () => {
      const c = await cliente({
        nombreComercial: ' Comercio Ejemplo ',
        razonSocial: ' Sociedad Ejemplo ',
        rfc: '  pecg720518ag6  ',
        regimenFiscal: ' 601 ',
        usoCfdi: ' G03 ',
        numeroRegistroTributario: ' REG-01 ',
        residenciaFiscal: ' MEX ',
        telefono: ' 123 ',
        celular: ' 456 ',
        email: ' PRINCIPAL@EXAMPLE.INVALID ',
        emailAlterno: ' ALTERNO@EXAMPLE.INVALID ',
        domicilioFiscal: {
          pais: ' México ',
          codigoPostal: '00123',
          estado: 'Estado ficticio',
          municipio: 'Municipio ficticio',
          localidad: 'Localidad',
          colonia: 'Colonia',
          calle: ' Calle Ejemplo ',
          numeroExterior: '01',
          numeroInterior: 'A',
          referencia: 'Referencia',
        },
      });
      expect((await get(`clientes/${c.id}`).expect(200)).body).toMatchObject({
        nombreComercial: 'Comercio Ejemplo',
        razonSocial: 'Sociedad Ejemplo',
        rfc: 'PECG720518AG6',
        regimenFiscal: '601',
        usoCfdi: 'G03',
        numeroRegistroTributario: 'REG-01',
        residenciaFiscal: 'MEX',
        telefono: '123',
        celular: '456',
        email: 'principal@example.invalid',
        emailAlterno: 'alterno@example.invalid',
        domicilioFiscal: {
          pais: 'México',
          codigoPostal: '00123',
          calle: 'Calle Ejemplo',
          numeroExterior: '01',
        },
      });
      await patch(`clientes/${c.id}`, {
        domicilioFiscal: { numeroInterior: ' B ' },
      }).expect(200);
      expect(
        (await get(`clientes/${c.id}`).expect(200)).body.domicilioFiscal,
      ).toMatchObject({ codigoPostal: '00123', numeroInterior: 'B' });
      expect(
        (
          await get(
            `clientes?search=${encodeURIComponent('Comercio Ejemplo')}`,
          ).expect(200)
        ).body.data.some((v: { id: number }) => v.id === c.id),
      ).toBe(true);
    });
    it('RFC vacío usa NULL múltiple y PATCH no borra datos omitidos', async () => {
      const a = await cliente({ rfc: ' ' });
      const b = await cliente({ rfc: '' });
      expect(a.rfc).toBeNull();
      expect(b.rfc).toBeNull();
      await patch(`clientes/${a.id}`, { rfc: ' legado-alfa ' }).expect(200);
      await patch(`clientes/${a.id}`, { celular: '123' }).expect(200);
      expect((await get(`clientes/${a.id}`).expect(200)).body.rfc).toBe(
        'LEGADO-ALFA',
      );
      await post('clientes', { nombre: prefix, rfc: ' legado-alfa ' }).expect(
        409,
      );
      await patch(`clientes/${a.id}`, { rfc: '' }).expect(200);
      expect((await get(`clientes/${a.id}`).expect(200)).body.rfc).toBeNull();
    });
    it('producto legacy conserva unidad y existencia inicial', async () => {
      const p = await producto();
      expect(p.unidadMedida).toBe('PIEZA');
      expect(p.unidadMedidaId).toBeNull();
      expect(
        await database.db.orm.public.Existencia.where({
          productoId: p.id,
        }).first(),
      ).toMatchObject({ cantidad: 0 });
    });
    it('claves H87/XBX/XPK/KPK admiten nombres repetidos y rechazan duplicados', async () => {
      // Si el catálogo ya contiene estos códigos, usar sufijos de fixture para conservar datos reales.
      for (const [clave, nombre] of [
        ['H87', 'PIEZA'],
        ['XBX', 'CAJA'],
        ['XPK', 'PAQUETE'],
        ['KPK', 'PAQUETE'],
      ]) {
        const existe = await database.db.orm.public.UnidadMedida.where({
          clave,
        }).first();
        const u = await unidad(
          existe ? `${clave}-${prefix.slice(-8)}` : clave,
          nombre,
        );
        expect(u.nombre).toBe(nombre);
        await post('unidades-medida', {
          clave: ` ${u.clave.toLowerCase()} `,
          nombre: 'Otro nombre',
        }).expect(409);
      }
    });
    it('producto extendido separa SKU/SAT, conserva legacy y metadata no genera movimientos', async () => {
      const u = await unidad(`${prefix.slice(-8)}-CAJA`, 'CAJA');
      const p = await producto({
        sku: `HEGA1805-${prefix.slice(-8)}`,
        claveProductoServicioSat: '42311512',
        objetoImpuestoSat: '2',
        unidadMedidaId: u.id,
        unidadMedida: 'CAJA',
      });
      const antes = await database.db.orm.public.Existencia.where({
        productoId: p.id,
      }).first();
      await patch(`productos/${p.id}`, {
        claveProductoServicioSat: 'ALFA',
        objetoImpuestoSat: '01',
        unidadMedida: 'PAQUETE',
      }).expect(200);
      expect((await get(`productos/${p.id}`).expect(200)).body).toMatchObject({
        sku: p.sku,
        claveProductoServicioSat: 'ALFA',
        objetoImpuestoSat: '01',
        unidadMedidaId: u.id,
        unidadMedida: 'PAQUETE',
        precio: '160.00',
      });
      expect(
        await database.db.orm.public.Existencia.where({
          productoId: p.id,
        }).first(),
      ).toEqual(antes);
      expect(
        await database.db.orm.public.MovimientoInventario.where({
          productoId: p.id,
        }).all(),
      ).toEqual([]);
      expect(
        (await get(`inventario/kardex/${p.id}`).expect(200)).body.data,
      ).toEqual([]);
    });
    it('unidad inactiva no admite nuevas asignaciones, mantiene lectura y edición del producto existente', async () => {
      const u = await unidad(`${prefix.slice(-8)}-INACTIVA`, 'PIEZA');
      const p = await producto({ unidadMedidaId: u.id });
      await patch(`unidades-medida/${u.id}/desactivar`).expect(200);
      await post('productos', {
        sku: `${prefix}-NO-CREAR`,
        nombre: prefix,
        costo: 1,
        precio: 1,
        stockMinimo: 0,
        categoriaId,
        unidadMedidaId: u.id,
      }).expect(409);
      const otro = await producto();
      await patch(`productos/${otro.id}`, { unidadMedidaId: u.id }).expect(409);
      await patch(`productos/${p.id}`, {
        unidadMedidaId: u.id,
        descripcion: 'Editado',
      }).expect(200);
      expect(
        (await get(`productos/${p.id}`).expect(200)).body.unidadMedidaId,
      ).toBe(u.id);
      await del(`unidades-medida/${u.id}`).expect(409);
      await expect(
        database.db.orm.public.UnidadMedida.where({ id: u.id }).delete(),
      ).rejects.toThrow();
      await patch(`unidades-medida/${u.id}/activar`).expect(200);
    });
    it('JWT y roles protegen todas las mutaciones de unidades', async () => {
      await http().get('/api/v1/unidades-medida').expect(401);
      const u = await unidad(`${prefix.slice(-8)}-ROLES`, 'Ejemplo');
      await get('unidades-medida').expect(200);
      await get(`unidades-medida/${u.id}`).expect(200);
      await post(
        'unidades-medida',
        { clave: 'NO-CREAR', nombre: 'Ejemplo' },
        consulta,
      ).expect(403);
      for (const ruta of [`${u.id}`, `${u.id}/activar`, `${u.id}/desactivar`])
        await patch(`unidades-medida/${ruta}`, {}, consulta).expect(403);
      await http()
        .delete(`/api/v1/unidades-medida/${u.id}`)
        .set('Authorization', `Bearer ${consulta}`)
        .expect(403);
      await get('unidades-medida/2147483647').expect(404);
      await get('unidades-medida/0').expect(400);
    });
    it('unidad admite edición, baja lógica y DELETE sin productos y genera auditoría sin datos fiscales', async () => {
      const u = await unidad(`${prefix.slice(-8)}-AUDIT`, 'Ejemplo');
      await patch(`unidades-medida/${u.id}`, { nombre: 'Actualizado' }).expect(
        200,
      );
      await patch(`unidades-medida/${u.id}/desactivar`).expect(200);
      await patch(`unidades-medida/${u.id}/desactivar`).expect(409);
      await patch(`unidades-medida/${u.id}/activar`).expect(200);
      await del(`unidades-medida/${u.id}`).expect(200);
      await get(`unidades-medida/${u.id}`).expect(404);
      const registros = await database.db.orm.public.Auditoria.where({
        usuarioId,
        entidad: 'UNIDAD_MEDIDA',
        entidadId: u.id,
      }).all();
      expect(registros.map((a) => a.accion).sort()).toEqual(
        [
          'UNIDAD_MEDIDA_CREADO',
          'UNIDAD_MEDIDA_MODIFICADO',
          'UNIDAD_MEDIDA_DESACTIVADO',
          'UNIDAD_MEDIDA_ACTIVADO',
          'UNIDAD_MEDIDA_ELIMINADO',
        ].sort(),
      );
      expect(registros.every((a) => !a.metadata?.includes('PECG'))).toBe(true);
    });
    it('DELETE cliente elimina explícitamente su domicilio fiscal sin huérfanos', async () => {
      const c = await cliente({ domicilioFiscal: { pais: 'México' } });
      await expect(
        database.db.orm.public.Cliente.where({ id: c.id }).delete(),
      ).rejects.toThrow();
      await del(`clientes/${c.id}`).expect(200);
      expect(
        await database.db.orm.public.DomicilioCliente.where({
          clienteId: c.id,
        }).first(),
      ).toBeNull();
    });
    it('Swagger documenta nuevos DTO, schemas y rutas de unidades', async () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('Inventario Backend 5A')
          .addBearerAuth()
          .build(),
      );
      document.components ??= {};
      document.components.schemas = {
        ...document.components.schemas,
        ...schemas,
      };
      expect(
        document.paths['/api/v1/unidades-medida']?.post?.security,
      ).toBeDefined();
      expect(
        JSON.stringify(document.components.schemas['CreateClienteDto']),
      ).toContain('domicilioFiscal');
      expect(
        JSON.stringify(document.components.schemas['CreateProductoDto']),
      ).toContain('claveProductoServicioSat');
      expect(document.components.schemas['UnidadMedida']).toBeDefined();
      await writeFile(
        'docs/backend-5a/openapi.json',
        JSON.stringify(document, null, 2),
      );
    });
  },
);
