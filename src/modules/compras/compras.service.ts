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
import { ProveedoresService } from '../proveedores/proveedores.service.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  patronBusqueda,
  rangoFechas,
  validarId,
} from '../../common/consulta.js';
import { calcularDetalles, calcularTotales } from './dinero.js';
import { CreateCompraDto } from './dto/create-compra.dto.js';
import { UpdateCompraDto } from './dto/update-compra.dto.js';
import { CompraQueryDto } from './dto/compra-query.dto.js';

@Injectable()
export class ComprasService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
    private readonly proveedores: ProveedoresService,
  ) {}

  private consulta(tx?: DatabaseTransaction) {
    return (tx?.orm ?? this.database.db.orm).public.Compra.include(
      'proveedor',
      (p) => p.select('id', 'nombre', 'rfc'),
    )
      .include('creadoPor', (u) => u.select('id', 'nombre', 'email'))
      .include('recibidoPor', (u) => u.select('id', 'nombre', 'email'));
  }

  async findOne(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const compra = await this.consulta(tx)
      .include('detalles', (d) =>
        d
          .orderBy((d) => d.id.asc())
          .include('producto', (p) => p.select('id', 'sku', 'nombre')),
      )
      .where({ id })
      .first();
    if (!compra) throw new NotFoundException('La compra no existe');
    return compra;
  }

  async findAll(query = new CompraQueryDto()) {
    const { desde, hasta } = rangoFechas(query.fechaInicio, query.fechaFin);
    let consulta = this.consulta();
    if (query.proveedorId !== undefined)
      consulta = consulta.where({ proveedorId: query.proveedorId });
    if (query.estado !== undefined)
      consulta = consulta.where({ estado: query.estado });
    if (desde) consulta = consulta.where((c) => c.createdAt.gte(desde));
    if (hasta) consulta = consulta.where((c) => c.createdAt.lte(hasta));
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((c) =>
        or(
          c.folio.ilike(patron),
          c.proveedor.some((p) => p.nombre.ilike(patron)),
        ),
      );
    }
    const campos = {
      createdAt: 'createdAt',
      folio: 'folio',
      estado: 'estado',
      total: 'total',
    } as const;
    const campo = Object.hasOwn(campos, query.sortBy)
      ? campos[query.sortBy]
      : undefined;
    if (!campo || !['asc', 'desc'].includes(query.sortOrder))
      throw new BadRequestException('Ordenamiento inválido');
    const [data, total] = await Promise.all([
      consulta
        .orderBy([
          (c) => (query.sortOrder === 'asc' ? c[campo].asc() : c[campo].desc()),
          (c) => (query.sortOrder === 'asc' ? c.id.asc() : c.id.desc()),
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

  private async validarProveedor(tx: DatabaseTransaction, id: number) {
    const proveedor = await this.proveedores.bloquear(tx, id);
    if (!proveedor.activo)
      throw new ConflictException('El proveedor está inactivo');
  }

  private async validarProductos(tx: DatabaseTransaction, ids: number[]) {
    // Orden global de bloqueos compartido con la recepción, evita deadlocks entre compras.
    for (const id of [...ids].sort((a, b) => a - b)) {
      validarId(id);
      await this.database.bloquearProducto(tx, id);
    }
    const productos = await tx.orm.public.Producto.select('id', 'activo')
      .where((p) => p.id.in(ids))
      .all();
    if (productos.length !== ids.length)
      throw new NotFoundException('Uno o más productos no existen');
    if (productos.some((p) => !p.activo))
      throw new ConflictException('Uno o más productos están inactivos');
  }

  async create(dto: CreateCompraDto, usuarioId: number) {
    const detalles = calcularDetalles(dto.detalles);
    const totales = calcularTotales(detalles, dto.impuestos ?? 0);
    return this.database.db.transaction(async (tx) => {
      await this.validarUsuario(tx, usuarioId);
      await this.validarProveedor(tx, dto.proveedorId);
      await this.validarProductos(
        tx,
        detalles.map((d) => d.productoId),
      );
      const compra = await tx.orm.public.Compra.create({
        folio: `COMP-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`,
        proveedorId: dto.proveedorId,
        estado: 'BORRADOR',
        ...totales,
        observacion: dto.observacion?.trim() || null,
        createdByUsuarioId: usuarioId,
      });
      for (const detalle of detalles)
        await tx.orm.public.DetalleCompra.create({
          compraId: compra.id,
          ...detalle,
        });
      return this.findOne(compra.id, tx);
    });
  }

  private async bloquearBorrador(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.compra WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const compra = await tx.orm.public.Compra.where({ id }).first();
    if (!compra) throw new NotFoundException('La compra no existe');
    if (compra.estado !== 'BORRADOR')
      throw new ConflictException('La compra debe estar en BORRADOR');
    return compra;
  }

  update(id: number, dto: UpdateCompraDto, usuarioId: number) {
    return this.database.db.transaction(async (tx) => {
      const compra = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      const proveedorId = dto.proveedorId ?? compra.proveedorId;
      await this.validarProveedor(tx, proveedorId);
      const detalles =
        dto.detalles !== undefined
          ? calcularDetalles(dto.detalles)
          : await tx.orm.public.DetalleCompra.where({ compraId: id }).all();
      await this.validarProductos(
        tx,
        detalles.map((d) => d.productoId),
      );
      const totales = calcularTotales(
        detalles,
        dto.impuestos ?? compra.impuestos,
      );
      if (dto.detalles !== undefined) {
        await tx.orm.public.DetalleCompra.where({ compraId: id }).deleteAll();
        for (const detalle of detalles)
          await tx.orm.public.DetalleCompra.create({
            compraId: id,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            costoUnitario: detalle.costoUnitario,
            subtotal: detalle.subtotal,
          });
      }
      await tx.orm.public.Compra.where({ id }).update({
        proveedorId,
        ...totales,
        ...(dto.observacion !== undefined && {
          observacion: dto.observacion.trim() || null,
        }),
      });
      return this.findOne(id, tx);
    });
  }

  recibir(id: number, usuarioId: number) {
    return this.database.db.transaction(async (tx) => {
      const compra = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await this.validarProveedor(tx, compra.proveedorId);
      const detalles = await tx.orm.public.DetalleCompra.where({ compraId: id })
        .orderBy((d) => d.productoId.asc())
        .all();
      if (!detalles.length)
        throw new ConflictException('La compra no tiene detalles');
      for (const detalle of detalles) {
        await this.inventario.entradaEnTransaccion(
          tx,
          {
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            observacion: `Entrada por compra ${compra.folio}`,
          },
          usuarioId,
        );
      }
      await tx.orm.public.Compra.where({ id }).update({
        estado: 'RECIBIDA',
        recibidaPorUsuarioId: usuarioId,
        fechaRecepcion: new Date().toISOString(),
      });
      return this.findOne(id, tx);
    });
  }

  cancelar(id: number, usuarioId: number) {
    return this.database.db.transaction(async (tx) => {
      await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.Compra.where({ id }).update({ estado: 'CANCELADA' });
      return this.findOne(id, tx);
    });
  }

  remove(id: number, usuarioId: number) {
    return this.database.db.transaction(async (tx) => {
      const compra = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.DetalleCompra.where({ compraId: id }).deleteAll();
      await tx.orm.public.Compra.where({ id }).delete();
      return {
        message: 'Compra BORRADOR eliminada definitivamente',
        compra: { id, folio: compra.folio },
      };
    });
  }
}
