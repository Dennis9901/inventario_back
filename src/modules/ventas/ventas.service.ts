import { ListasPreciosService } from '../listas-precios/listas-precios.service.js';
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
import { ClientesService } from '../clientes/clientes.service.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  patronBusqueda,
  rangoFechas,
  validarId,
} from '../../common/consulta.js';
import {
  snapshotVenta,
  totalesVenta,
  validarDetallesVenta,
} from './dinero-venta.js';
import type { DetalleSolicitado, SnapshotVenta } from './dinero-venta.js';
import { CreateVentaDto } from './dto/create-venta.dto.js';
import { UpdateVentaDto } from './dto/update-venta.dto.js';
import { VentaQueryDto } from './dto/venta-query.dto.js';

@Injectable()
export class VentasService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
    private readonly clientes: ClientesService,
    private readonly precios: ListasPreciosService,
  ) {}

  private consulta(tx?: DatabaseTransaction) {
    return (tx?.orm ?? this.database.db.orm).public.Venta.include(
      'cliente',
      (c) => c.select('id', 'nombre', 'apellido', 'rfc'),
    )
      .include('creadoPor', (u) => u.select('id', 'nombre', 'email'))
      .include('confirmadoPor', (u) => u.select('id', 'nombre', 'email'));
  }

  async findOne(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const venta = await this.consulta(tx)
      .include('detalles', (d) =>
        d
          .orderBy((d) => d.id.asc())
          .include('producto', (p) => p.select('id', 'sku', 'nombre')),
      )
      .where({ id })
      .first();
    if (!venta) throw new NotFoundException('La venta no existe');
    return venta;
  }

  async findAll(query = new VentaQueryDto()) {
    const { desde, hasta } = rangoFechas(query.fechaInicio, query.fechaFin);
    let consulta = this.consulta();
    if (query.clienteId !== undefined)
      consulta = consulta.where({ clienteId: query.clienteId });
    if (query.estado !== undefined)
      consulta = consulta.where({ estado: query.estado });
    if (desde) consulta = consulta.where((v) => v.createdAt.gte(desde));
    if (hasta) consulta = consulta.where((v) => v.createdAt.lte(hasta));
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((v) =>
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
      );
    }
    const campos = {
      createdAt: 'createdAt',
      folio: 'folio',
      estado: 'estado',
      total: 'total',
      utilidad: 'utilidad',
    } as const;
    const campo = Object.hasOwn(campos, query.sortBy)
      ? campos[query.sortBy]
      : undefined;
    if (!campo || !['asc', 'desc'].includes(query.sortOrder))
      throw new BadRequestException('Ordenamiento inválido');
    const [data, total] = await Promise.all([
      consulta
        .orderBy([
          (v) => (query.sortOrder === 'asc' ? v[campo].asc() : v[campo].desc()),
          (v) => (query.sortOrder === 'asc' ? v.id.asc() : v.id.desc()),
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

  private async validarCliente(tx: DatabaseTransaction, id: number) {
    const cliente = await this.clientes.bloquear(tx, id);
    if (!cliente.activo)
      throw new ConflictException('El cliente está inactivo');
  }

  private async productosBloqueados(
    tx: DatabaseTransaction,
    detalles: DetalleSolicitado[],
  ) {
    for (const id of detalles.map((d) => d.productoId).sort((a, b) => a - b))
      await this.database.bloquearProducto(tx, id);
    const productos = await tx.orm.public.Producto.select(
      'id',
      'activo',
      'precio',
      'costo',
    )
      .where((p) => p.id.in(detalles.map((d) => d.productoId)))
      .all();
    if (productos.length !== detalles.length)
      throw new NotFoundException('Uno o más productos no existen');
    if (productos.some((p) => !p.activo))
      throw new ConflictException('Uno o más productos están inactivos');
    return new Map(productos.map((p) => [p.id, p]));
  }

  private async bloquearBorrador(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.venta WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const venta = await tx.orm.public.Venta.where({ id }).first();
    if (!venta) throw new NotFoundException('La venta no existe');
    if (venta.estado !== 'BORRADOR')
      throw new ConflictException('La venta debe estar en BORRADOR');
    return venta;
  }

  async create(dto: CreateVentaDto, usuarioId: number) {
    validarDetallesVenta(dto.detalles);
    return this.database.transaction(async (tx) => {
      await this.precios.bloquearConfiguracion(tx);
      if (dto.listaPrecioId !== undefined)
        await this.precios.validarLista(tx, dto.listaPrecioId);
      await this.validarUsuario(tx, usuarioId);
      await this.validarCliente(tx, dto.clienteId);
      const productos = await this.productosBloqueados(tx, dto.detalles);
      const fechaPrecio = new Date().toISOString();
      const detalles: SnapshotVenta[] = [];
      for (const d of dto.detalles) {
        const producto = productos.get(d.productoId)!;
        const precio = await this.precios.resolverEnTransaccion(
          tx,
          d.productoId,
          dto.listaPrecioId,
          fechaPrecio,
        );
        detalles.push(snapshotVenta(d, { ...producto, precio: precio.precio }));
      }
      const venta = await tx.orm.public.Venta.create({
        folio: `VENT-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`,
        clienteId: dto.clienteId,
        listaPrecioId: dto.listaPrecioId ?? null,
        estado: 'BORRADOR',
        ...totalesVenta(detalles, dto.impuestos ?? 0),
        observacion: dto.observacion?.trim() || null,
        createdByUsuarioId: usuarioId,
      });
      for (const detalle of detalles)
        await tx.orm.public.DetalleVenta.create({
          ventaId: venta.id,
          ...detalle,
        });
      return this.findOne(venta.id, tx);
    });
  }

  update(id: number, dto: UpdateVentaDto, usuarioId: number) {
    if (dto.detalles !== undefined) validarDetallesVenta(dto.detalles);
    return this.database.transaction(async (tx) => {
      const venta = await this.bloquearBorrador(tx, id);
      await this.precios.bloquearConfiguracion(tx);
      const listaPrecioId =
        dto.listaPrecioId !== undefined
          ? dto.listaPrecioId
          : venta.listaPrecioId;
      const cambioLista = listaPrecioId !== venta.listaPrecioId;
      if (listaPrecioId !== null)
        await this.precios.validarLista(tx, listaPrecioId);
      await this.validarUsuario(tx, usuarioId);
      const clienteId = dto.clienteId ?? venta.clienteId;
      await this.validarCliente(tx, clienteId);
      const anteriores = await tx.orm.public.DetalleVenta.where({
        ventaId: id,
      }).all();
      let detalles: SnapshotVenta[] = anteriores;
      if (dto.detalles !== undefined || cambioLista) {
        const solicitados =
          dto.detalles ??
          anteriores.map((d) => ({
            productoId: d.productoId,
            cantidad: d.cantidad,
          }));
        const productos = await this.productosBloqueados(tx, solicitados);
        const porProducto = new Map(anteriores.map((d) => [d.productoId, d]));
        detalles = [];
        const fechaPrecio = new Date().toISOString();
        for (const d of solicitados) {
          const anterior = porProducto.get(d.productoId);
          if (!cambioLista && anterior?.cantidad === d.cantidad)
            detalles.push(anterior);
          else {
            const producto = productos.get(d.productoId)!;
            const precio = await this.precios.resolverEnTransaccion(
              tx,
              d.productoId,
              listaPrecioId,
              fechaPrecio,
            );
            detalles.push(
              snapshotVenta(d, { ...producto, precio: precio.precio }),
            );
          }
        }
        const nuevosIds = new Set(solicitados.map((d) => d.productoId));
        for (const anterior of anteriores) {
          if (!nuevosIds.has(anterior.productoId))
            await tx.orm.public.DetalleVenta.where({
              id: anterior.id,
            }).delete();
        }
        for (const detalle of detalles) {
          const anterior = porProducto.get(detalle.productoId);
          if (
            !cambioLista &&
            anterior &&
            anterior.cantidad === detalle.cantidad
          )
            continue;
          const valores = {
            cantidad: detalle.cantidad,
            precioUnitario: detalle.precioUnitario,
            costoUnitario: detalle.costoUnitario,
            subtotal: detalle.subtotal,
            costoSubtotal: detalle.costoSubtotal,
          };
          if (anterior)
            await tx.orm.public.DetalleVenta.where({ id: anterior.id }).update(
              valores,
            );
          else
            await tx.orm.public.DetalleVenta.create({
              ventaId: id,
              productoId: detalle.productoId,
              ...valores,
            });
        }
      }
      await tx.orm.public.Venta.where({ id }).update({
        clienteId,
        listaPrecioId,
        ...totalesVenta(detalles, dto.impuestos ?? venta.impuestos),
        ...(dto.observacion !== undefined && {
          observacion: dto.observacion.trim() || null,
        }),
      });
      return this.findOne(id, tx);
    });
  }

  confirmar(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const venta = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await this.validarCliente(tx, venta.clienteId);
      const detalles = await tx.orm.public.DetalleVenta.where({ ventaId: id })
        .orderBy((d) => d.productoId.asc())
        .all();
      if (!detalles.length)
        throw new ConflictException('La venta no tiene detalles');
      for (const detalle of detalles) {
        await this.inventario.salidaEnTransaccion(
          tx,
          {
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            observacion: `Salida por venta ${venta.folio}`,
          },
          usuarioId,
        );
      }
      await tx.orm.public.Venta.where({ id }).update({
        estado: 'CONFIRMADA',
        confirmadaPorUsuarioId: usuarioId,
        fechaConfirmacion: new Date().toISOString(),
      });
      return this.findOne(id, tx);
    });
  }

  cancelar(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.Venta.where({ id }).update({ estado: 'CANCELADA' });
      return this.findOne(id, tx);
    });
  }

  remove(id: number, usuarioId: number) {
    return this.database.transaction(async (tx) => {
      const venta = await this.bloquearBorrador(tx, id);
      await this.validarUsuario(tx, usuarioId);
      await tx.orm.public.DetalleVenta.where({ ventaId: id }).deleteAll();
      await tx.orm.public.Venta.where({ id }).delete();
      return {
        message: 'Venta BORRADOR eliminada definitivamente',
        venta: { id, folio: venta.folio },
      };
    });
  }
}
