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
import { CreateDevolucionVentaDto } from './dto/create-devolucion-venta.dto.js';
import { DevolucionVentaQueryDto } from './dto/devolucion-query.dto.js';

@Injectable()
export class DevolucionesVentaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
  ) {}

  private consulta(tx?: DatabaseTransaction) {
    return (tx?.orm ?? this.database.db.orm).public.DevolucionVenta.include(
      'venta',
      (v) =>
        v
          .select('id', 'folio', 'clienteId')
          .include('cliente', (c) => c.select('id', 'nombre', 'rfc')),
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
      throw new NotFoundException('La devolución de venta no existe');
    return { ...devolucion, cliente: devolucion.venta?.cliente ?? null };
  }

  async findAll(query = new DevolucionVentaQueryDto()) {
    const { desde, hasta } = rangoFechas(query.fechaInicio, query.fechaFin);
    let consulta = this.consulta();
    if (query.ventaId !== undefined)
      consulta = consulta.where({ ventaId: query.ventaId });
    if (query.clienteId !== undefined)
      consulta = consulta.where((d) =>
        d.venta.some((v) => v.clienteId.eq(query.clienteId!)),
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
          d.venta.some((v) =>
            or(
              v.folio.ilike(patron),
              v.cliente.some((c) =>
                or(
                  c.nombre.ilike(patron),
                  c.apellido.ilike(patron),
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
    ).public.Venta.include('detalles', (d) =>
      d
        .orderBy((d) => d.id.asc())
        .include('producto', (p) => p.select('id', 'sku', 'nombre')),
    )
      .where({ id })
      .first();
    if (!documento) throw new NotFoundException('La venta no existe');
    if (documento.estado !== 'CONFIRMADA')
      throw new ConflictException('La venta debe estar CONFIRMADA');
    return documento;
  }

  private async bloquearOriginal(tx: DatabaseTransaction, id: number) {
    validarId(id);
    // Recurso común a TODAS las devoluciones de este documento. Lecturas posteriores al lock.
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.venta WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    return this.original(id, tx);
  }

  private async cantidadesDevueltas(id: number, tx?: DatabaseTransaction) {
    // SUM en PostgreSQL, una consulta para todos los detalles; solo PROCESADAS consumen límite.
    const plan = this.database.db.raw.sql`
      SELECT d."detalleVentaId" AS id, SUM(d.cantidad)::text AS cantidad
      FROM public."detalleDevolucionVenta" d
      JOIN public."devolucionVenta" v ON v.id = d."devolucionVentaId"
      WHERE v."ventaId" = ${id} AND v.estado = 'PROCESADA'
      GROUP BY d."detalleVentaId"
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
      ventaId: id,
      folio: documento.folio,
      detalles: documento.detalles.map((d) => {
        const cantidadDevuelta = Number(devueltas.get(d.id) ?? 0n);
        return {
          detalleVentaId: d.id,
          producto: d.producto,
          cantidadOriginal: d.cantidad,
          cantidadDevuelta,
          cantidadDisponible: d.cantidad - cantidadDevuelta,
          costoUnitario: d.costoUnitario,
          precioUnitario: d.precioUnitario,
        };
      }),
    };
  }

  create(dto: CreateDevolucionVentaDto, usuarioId: number) {
    validarDetalles(
      dto.detalles.map((d) => ({ id: d.detalleVentaId, cantidad: d.cantidad })),
    );
    if (!dto.motivo?.trim())
      throw new BadRequestException('El motivo es obligatorio');
    return this.database.transaction(async (tx) => {
      await this.validarUsuario(tx, usuarioId);
      const documento = await this.bloquearOriginal(tx, dto.ventaId);
      const originales = new Map(documento.detalles.map((d) => [d.id, d]));
      const devueltas = await this.cantidadesDevueltas(documento.id, tx);
      const detalles = dto.detalles.map((d) => {
        const original = originales.get(d.detalleVentaId);
        if (!original)
          throw new BadRequestException(
            'El detalle no pertenece a la venta indicada',
          );
        validarDisponible(
          original.cantidad,
          devueltas.get(original.id) ?? 0n,
          d.cantidad,
        );
        return {
          detalleVentaId: original.id,
          productoId: original.productoId,
          cantidad: d.cantidad,
          costoUnitario: original.costoUnitario,
          subtotal: subtotalHistorico(original.precioUnitario, d.cantidad),
          precioUnitario: original.precioUnitario,
          costoSubtotal: subtotalHistorico(original.costoUnitario, d.cantidad),
        };
      });
      const devolucion = await tx.orm.public.DevolucionVenta.create({
        folio: `DV-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`,
        ventaId: documento.id,
        estado: 'BORRADOR',
        motivo: dto.motivo.trim(),
        observacion: dto.observacion?.trim() || null,
        subtotal: sumarImportes(detalles),
        costoTotal: sumarImportes(
          detalles.map((d) => ({ subtotal: d.costoSubtotal })),
        ),
        createdByUsuarioId: usuarioId,
      });
      for (const detalle of [...detalles].sort(
        (a, b) => a.productoId - b.productoId,
      ))
        await tx.orm.public.DetalleDevolucionVenta.create({
          devolucionVentaId: devolucion.id,
          ...detalle,
        });
      return this.findOne(devolucion.id, tx);
    });
  }

  private async bloquearBorrador(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public."devolucionVenta" WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const devolucion = await tx.orm.public.DevolucionVenta.where({
      id,
    }).first();
    if (!devolucion)
      throw new NotFoundException('La devolución de venta no existe');
    if (devolucion.estado !== 'BORRADOR')
      throw new ConflictException('La devolución debe estar en BORRADOR');
    return devolucion;
  }

  procesar(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const devolucion = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      const documento = await this.bloquearOriginal(tx, devolucion.ventaId);
      const originales = new Map(documento.detalles.map((d) => [d.id, d]));
      const devueltas = await this.cantidadesDevueltas(documento.id, tx);
      const detalles = await tx.orm.public.DetalleDevolucionVenta.where({
        devolucionVentaId: id,
      })
        .orderBy((d) => d.productoId.asc())
        .all();
      validarDetalles(
        detalles.map((d) => ({ id: d.detalleVentaId, cantidad: d.cantidad })),
      );
      for (const detalle of detalles) {
        const original = originales.get(detalle.detalleVentaId);
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
        await this.inventario.entradaEnTransaccion(
          tx,
          {
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            observacion: `Entrada por devolución de venta ${devolucion.folio} (venta ${documento.folio})`,
          },
          usuarioId,
        );
      }
      await tx.orm.public.DevolucionVenta.where({ id }).update({
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
      await tx.orm.public.DevolucionVenta.where({ id }).update({
        estado: 'CANCELADA',
      });
      return this.findOne(id, tx);
    });
  }

  remove(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const devolucion = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.DetalleDevolucionVenta.where({
        devolucionVentaId: id,
      }).deleteAll();
      await tx.orm.public.DevolucionVenta.where({ id }).delete();
      return {
        message: 'Devolución BORRADOR eliminada definitivamente',
        devolucion: { id, folio: devolucion.folio },
      };
    });
  }
}
