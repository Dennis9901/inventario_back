import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { DatabaseService } from '../../database/database.service.js';
import type { DatabaseTransaction } from '../../database/database.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  patronBusqueda,
  rangoFechas,
  validarId,
} from '../../common/consulta.js';
import {
  validarDetalles,
  validarDisponible,
  subtotalHistorico,
  sumarImportes,
} from './reglas.js';
import { CreateDevolucionCompraDto } from './dto/create-devolucion-compra.dto.js';
import { DevolucionCompraQueryDto } from './dto/devolucion-query.dto.js';

@Injectable()
export class DevolucionesCompraService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
  ) {}

  private consulta(tx?: DatabaseTransaction) {
    return (tx?.orm ?? this.database.db.orm).public.DevolucionCompra.include(
      'compra',
      (v) =>
        v
          .select('id', 'folio', 'proveedorId')
          .include('proveedor', (c) => c.select('id', 'nombre', 'rfc')),
    )
      .include('creadoPor', (u) => u.select('id', 'nombre', 'email'))
      .include('procesadoPor', (u) => u.select('id', 'nombre', 'email'));
  }

  async findOne(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const devolucion = await this.consulta(tx)
      .include('detalles', (d) =>
        d
          .orderBy((d) => d.id.asc())
          .include('producto', (p) => p.select('id', 'sku', 'nombre')),
      )
      .where({ id })
      .first();
    if (!devolucion)
      throw new NotFoundException('La devolución de compra no existe');
    return { ...devolucion, proveedor: devolucion.compra?.proveedor ?? null };
  }

  async findAll(query = new DevolucionCompraQueryDto()) {
    const { desde, hasta } = rangoFechas(query.fechaInicio, query.fechaFin);
    let consulta = this.consulta();
    if (query.compraId !== undefined)
      consulta = consulta.where({ compraId: query.compraId });
    if (query.proveedorId !== undefined)
      consulta = consulta.where((d) =>
        d.compra.some((v) => v.proveedorId.eq(query.proveedorId!)),
      );
    if (query.estado !== undefined)
      consulta = consulta.where({ estado: query.estado });
    if (desde) consulta = consulta.where((d) => d.createdAt.gte(desde));
    if (hasta) consulta = consulta.where((d) => d.createdAt.lte(hasta));
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((d) =>
        or(
          d.folio.ilike(patron),
          d.compra.some((v) =>
            or(
              v.folio.ilike(patron),
              v.proveedor.some((c) =>
                or(
                  c.nombre.ilike(patron),
                  c.razonSocial.ilike(patron),
                  c.rfc.ilike(patron),
                ),
              ),
            ),
          ),
        ),
      );
    }
    const campos = {
      createdAt: 'createdAt',
      folio: 'folio',
      estado: 'estado',
      subtotal: 'subtotal',
    } as const;
    const campo = Object.hasOwn(campos, query.sortBy)
      ? campos[query.sortBy]
      : undefined;
    if (!campo || !['asc', 'desc'].includes(query.sortOrder))
      throw new BadRequestException('Ordenamiento inválido');
    const [data, total] = await Promise.all([
      consulta
        .orderBy([
          (d) => (query.sortOrder === 'asc' ? d[campo].asc() : d[campo].desc()),
          (d) => (query.sortOrder === 'asc' ? d.id.asc() : d.id.desc()),
        ])
        .limit(query.limit)
        .offset((query.page - 1) * query.limit)
        .all(),
      consulta.aggregate((a) => ({ totalItems: a.count() })),
    ]);
    return { data, pagination: paginacion(query, total.totalItems) };
  }

  private async validarUsuario(tx: DatabaseTransaction, usuarioId: number) {
    if (!Number.isInteger(usuarioId) || usuarioId < 1 || usuarioId > 2147483647)
      throw new UnauthorizedException('Usuario autenticado inválido');
    const usuario = await tx.orm.public.Usuario.select('id', 'activo')
      .where({ id: usuarioId })
      .first();
    if (!usuario?.activo)
      throw new UnauthorizedException(
        'Usuario autenticado inválido o inactivo',
      );
  }

  private async original(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const documento = await (
      tx?.orm ?? this.database.db.orm
    ).public.Compra.include('detalles', (d) =>
      d
        .orderBy((d) => d.id.asc())
        .include('producto', (p) =>
          p
            .select('id', 'sku', 'nombre')
            .include('existencia', (e) => e.select('cantidad')),
        ),
    )
      .where({ id })
      .first();
    if (!documento) throw new NotFoundException('La compra no existe');
    if (documento.estado !== 'RECIBIDA')
      throw new ConflictException('La compra debe estar RECIBIDA');
    return documento;
  }

  private async bloquearOriginal(tx: DatabaseTransaction, id: number) {
    validarId(id);
    // Recurso común a TODAS las devoluciones de este documento. Lecturas posteriores al lock.
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.compra WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    return this.original(id, tx);
  }

  private async cantidadesDevueltas(id: number, tx?: DatabaseTransaction) {
    // SUM en PostgreSQL, una consulta para todos los detalles; solo PROCESADAS consumen límite.
    const plan = this.database.db.raw.sql`
      SELECT d."detalleCompraId" AS id, SUM(d.cantidad)::text AS cantidad
      FROM public."detalleDevolucionCompra" d
      JOIN public."devolucionCompra" v ON v.id = d."devolucionCompraId"
      WHERE v."compraId" = ${id} AND v.estado = 'PROCESADA'
      GROUP BY d."detalleCompraId"
    `
      .returnsRow({ id: 'pg/int4@1', cantidad: 'pg/text@1' })
      .build();
    const rows = await (tx
      ? tx.query(plan)
      : this.database.db.runtime().query(plan));
    return new Map(rows.map((r) => [r.id, BigInt(r.cantidad)]));
  }

  async disponible(id: number) {
    const documento = await this.original(id);
    const devueltas = await this.cantidadesDevueltas(id);
    return {
      compraId: id,
      folio: documento.folio,
      detalles: documento.detalles.map((d) => {
        const cantidadDevuelta = Number(devueltas.get(d.id) ?? 0n);
        return {
          detalleCompraId: d.id,
          producto: d.producto,
          cantidadOriginal: d.cantidad,
          cantidadDevuelta,
          cantidadDisponible: d.cantidad - cantidadDevuelta,
          costoUnitario: d.costoUnitario,
          stockActual: d.producto?.existencia?.cantidad ?? null,
        };
      }),
    };
  }

  create(dto: CreateDevolucionCompraDto, usuarioId: number) {
    validarDetalles(
      dto.detalles.map((d) => ({
        id: d.detalleCompraId,
        cantidad: d.cantidad,
      })),
    );
    if (!dto.motivo?.trim())
      throw new BadRequestException('El motivo es obligatorio');
    return this.database.transaction(async (tx) => {
      await this.validarUsuario(tx, usuarioId);
      const documento = await this.bloquearOriginal(tx, dto.compraId);
      const originales = new Map(documento.detalles.map((d) => [d.id, d]));
      const devueltas = await this.cantidadesDevueltas(documento.id, tx);
      const detalles = dto.detalles.map((d) => {
        const original = originales.get(d.detalleCompraId);
        if (!original)
          throw new BadRequestException(
            'El detalle no pertenece a la compra indicada',
          );
        validarDisponible(
          original.cantidad,
          devueltas.get(original.id) ?? 0n,
          d.cantidad,
        );
        return {
          detalleCompraId: original.id,
          productoId: original.productoId,
          cantidad: d.cantidad,
          costoUnitario: original.costoUnitario,
          subtotal: subtotalHistorico(original.costoUnitario, d.cantidad),
        };
      });
      const devolucion = await tx.orm.public.DevolucionCompra.create({
        folio: `DC-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`,
        compraId: documento.id,
        estado: 'BORRADOR',
        motivo: dto.motivo.trim(),
        observacion: dto.observacion?.trim() || null,
        subtotal: sumarImportes(detalles),
        createdByUsuarioId: usuarioId,
      });
      for (const detalle of [...detalles].sort(
        (a, b) => a.productoId - b.productoId,
      ))
        await tx.orm.public.DetalleDevolucionCompra.create({
          devolucionCompraId: devolucion.id,
          ...detalle,
        });
      return this.findOne(devolucion.id, tx);
    });
  }

  private async bloquearBorrador(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public."devolucionCompra" WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const devolucion = await tx.orm.public.DevolucionCompra.where({
      id,
    }).first();
    if (!devolucion)
      throw new NotFoundException('La devolución de compra no existe');
    if (devolucion.estado !== 'BORRADOR')
      throw new ConflictException('La devolución debe estar en BORRADOR');
    return devolucion;
  }

  procesar(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const devolucion = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      const documento = await this.bloquearOriginal(tx, devolucion.compraId);
      const originales = new Map(documento.detalles.map((d) => [d.id, d]));
      const devueltas = await this.cantidadesDevueltas(documento.id, tx);
      const detalles = await tx.orm.public.DetalleDevolucionCompra.where({
        devolucionCompraId: id,
      })
        .orderBy((d) => d.productoId.asc())
        .all();
      validarDetalles(
        detalles.map((d) => ({ id: d.detalleCompraId, cantidad: d.cantidad })),
      );
      for (const detalle of detalles) {
        const original = originales.get(detalle.detalleCompraId);
        if (!original || original.productoId !== detalle.productoId)
          throw new ConflictException(
            'El detalle no corresponde al documento original',
          );
        validarDisponible(
          original.cantidad,
          devueltas.get(original.id) ?? 0n,
          detalle.cantidad,
        );
      }
      for (const detalle of detalles) {
        await this.inventario.salidaEnTransaccion(
          tx,
          {
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            observacion: `Salida por devolución de compra ${devolucion.folio} (compra ${documento.folio})`,
          },
          usuarioId,
        );
      }
      await tx.orm.public.DevolucionCompra.where({ id }).update({
        estado: 'PROCESADA',
        procesadaPorUsuarioId: usuarioId,
        fechaProcesamiento: new Date().toISOString(),
      });
      return this.findOne(id, tx);
    });
  }

  cancelar(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.DevolucionCompra.where({ id }).update({
        estado: 'CANCELADA',
      });
      return this.findOne(id, tx);
    });
  }

  remove(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const devolucion = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.DetalleDevolucionCompra.where({
        devolucionCompraId: id,
      }).deleteAll();
      await tx.orm.public.DevolucionCompra.where({ id }).delete();
      return {
        message: 'Devolución BORRADOR eliminada definitivamente',
        devolucion: { id, folio: devolucion.folio },
      };
    });
  }
}
