import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { DatabaseTransaction } from '../../database/database.service.js';
import { EntradaInventarioDto } from './dto/entrada-inventario.dto.js';
import { SalidaInventarioDto } from './dto/salida-inventario.dto.js';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto.js';

import {
  ExistenciaQueryDto,
  MovimientoQueryDto,
  MovimientoProductoQueryDto,
} from './dto/consulta-inventario.dto.js';
import { limiteFecha, paginacion } from './paginacion.js';

type Operacion =
  | {
      tipo: 'ENTRADA' | 'SALIDA';
      dto: EntradaInventarioDto | SalidaInventarioDto;
    }
  | { tipo: 'AJUSTE'; dto: AjusteInventarioDto };

@Injectable()
export class InventarioService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findExistencias(query = new ExistenciaQueryDto()) {
    const { db } = this.databaseService;
    const search = query.search
      ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      : '';
    const stock = query.stockBajo ?? false;
    const filtrarStock = query.stockBajo !== undefined;
    // SQL parametrizado para comparar columnas de tablas relacionadas. No carga la colección completa.
    const filtro = db.raw.sql`
      SELECT p.id FROM public.producto p
      LEFT JOIN public.existencia e ON e."productoId" = p.id
      WHERE (${search} = '' OR p.sku ILIKE ${search} OR p.nombre ILIKE ${search} OR p."codigoBarras" ILIKE ${search})
      AND (NOT ${filtrarStock} OR (e.cantidad <= p."stockMinimo") = ${stock})
      ORDER BY p.id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `
      .returnsRow({ id: 'pg/int4@1' })
      .build();
    const conteo = db.raw.sql`
      SELECT count(*)::int AS total FROM public.producto p
      LEFT JOIN public.existencia e ON e."productoId" = p.id
      WHERE (${search} = '' OR p.sku ILIKE ${search} OR p.nombre ILIKE ${search} OR p."codigoBarras" ILIKE ${search})
      AND (NOT ${filtrarStock} OR (e.cantidad <= p."stockMinimo") = ${stock})
    `
      .returnsRow({ total: 'pg/int4@1' })
      .build();
    const [ids, totals] = await Promise.all([
      db.runtime().query(filtro),
      db.runtime().query(conteo),
    ]);
    const productos = ids.length
      ? await this.productosConExistencia()
          .where((p) => p.id.in(ids.map((row) => row.id)))
          .orderBy((p) => p.id.asc())
          .all()
      : [];
    return {
      data: productos.map((p) => this.resumenExistencia(p)),
      pagination: paginacion(query, totals[0]!.total),
    };
  }

  async findExistencia(productoId: number) {
    this.validarEntero(productoId, 1);
    const producto = await this.productosConExistencia()
      .where({ id: productoId })
      .first();
    if (!producto) throw new NotFoundException('El producto no existe');
    return this.resumenExistencia(producto);
  }

  entrada(dto: EntradaInventarioDto, usuarioId: number) {
    return this.registrar({ tipo: 'ENTRADA', dto }, usuarioId);
  }

  salida(dto: SalidaInventarioDto, usuarioId: number) {
    return this.registrar({ tipo: 'SALIDA', dto }, usuarioId);
  }

  ajuste(dto: AjusteInventarioDto, usuarioId: number) {
    return this.registrar({ tipo: 'AJUSTE', dto }, usuarioId);
  }

  async findMovimientos(query = new MovimientoQueryDto()) {
    const inicio = limiteFecha(query.fechaInicio);
    const fin = limiteFecha(query.fechaFin, true);
    if (inicio && fin && Date.parse(inicio) > Date.parse(fin))
      throw new BadRequestException(
        'fechaInicio debe ser anterior o igual a fechaFin',
      );
    let consulta = this.movimientosConRelaciones();
    if (query.productoId !== undefined)
      consulta = consulta.where({ productoId: query.productoId });
    if (query.usuarioId !== undefined)
      consulta = consulta.where({ usuarioId: query.usuarioId });
    if (query.tipo !== undefined)
      consulta = consulta.where({ tipo: query.tipo });
    if (inicio) consulta = consulta.where((m) => m.createdAt.gte(inicio));
    if (fin) consulta = consulta.where((m) => m.createdAt.lte(fin));
    // Whitelist explícita también en el servicio, antes de acceder al proxy tipado.
    const campos = {
      createdAt: 'createdAt',
      tipo: 'tipo',
      cantidad: 'cantidad',
      stockAnterior: 'stockAnterior',
      stockNuevo: 'stockNuevo',
    } as const;
    const campo = Object.hasOwn(campos, query.sortBy)
      ? campos[query.sortBy]
      : undefined;
    if (!campo || !['asc', 'desc'].includes(query.sortOrder))
      throw new BadRequestException('Ordenamiento inválido');
    const [data, total] = await Promise.all([
      consulta
        .orderBy([
          (m) => (query.sortOrder === 'asc' ? m[campo].asc() : m[campo].desc()),
          (m) => (query.sortOrder === 'asc' ? m.id.asc() : m.id.desc()),
        ])
        .limit(query.limit)
        .offset((query.page - 1) * query.limit)
        .all(),
      consulta.aggregate((a) => ({ totalItems: a.count() })),
    ]);
    return { data, pagination: paginacion(query, total.totalItems) };
  }

  async findMovimientosProducto(
    productoId: number,
    query = new MovimientoProductoQueryDto(),
  ) {
    this.validarEntero(productoId, 1);
    const producto = await this.databaseService.db.orm.public.Producto.select(
      'id',
    )
      .where({ id: productoId })
      .first();
    if (!producto) throw new NotFoundException('El producto no existe');
    return this.findMovimientos(
      Object.assign(new MovimientoQueryDto(), query, { productoId }),
    );
  }

  async findKardex(
    productoId: number,
    query = new MovimientoProductoQueryDto(),
  ) {
    const existencia = await this.findExistencia(productoId);
    const movimientos = await this.findMovimientos(
      Object.assign(new MovimientoQueryDto(), query, { productoId }),
    );
    return {
      producto: {
        id: productoId,
        sku: existencia.sku,
        nombre: existencia.nombre,
        unidadMedida: existencia.unidadMedida,
        stockActual: existencia.cantidad,
        stockMinimo: existencia.stockMinimo,
      },
      ...movimientos,
    };
  }

  private productosConExistencia() {
    return this.databaseService.db.orm.public.Producto.select(
      'id',
      'sku',
      'nombre',
      'stockMinimo',
      'unidadMedida',
      'activo',
    )
      .include('categoria', (c) => c.select('id', 'nombre'))
      .include('existencia', (e) => e.select('cantidad'));
  }

  private resumenExistencia(producto: {
    id: number;
    sku: string;
    nombre: string;
    stockMinimo: number;
    unidadMedida: string;
    activo: boolean;
    categoria: { id: number; nombre: string } | null;
    existencia: { cantidad: number } | null;
  }) {
    if (!producto.existencia)
      throw new ConflictException('El producto no tiene Existencia registrada');
    if (!producto.categoria)
      throw new ConflictException('El producto no tiene categoría registrada');
    const cantidad = producto.existencia.cantidad;
    return {
      productoId: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      cantidad,
      stockMinimo: producto.stockMinimo,
      stockBajo: cantidad <= producto.stockMinimo,
      categoria: producto.categoria,
      unidadMedida: producto.unidadMedida,
      activo: producto.activo,
    };
  }

  private movimientosConRelaciones() {
    return this.databaseService.db.orm.public.MovimientoInventario.include(
      'producto',
      (p) => p.select('id', 'sku', 'nombre'),
    ).include('usuario', (u) => u.select('id', 'nombre', 'apellido', 'email'));
  }

  private validarEntero(valor: number, minimo: number) {
    if (!Number.isInteger(valor) || valor < minimo || valor > 2147483647) {
      throw new BadRequestException(
        `Se requiere un entero entre ${minimo} y 2147483647`,
      );
    }
  }

  entradaEnTransaccion(
    tx: DatabaseTransaction,
    dto: EntradaInventarioDto,
    usuarioId: number,
  ) {
    return this.registrarEnTransaccion(tx, { tipo: 'ENTRADA', dto }, usuarioId);
  }

  salidaEnTransaccion(
    tx: DatabaseTransaction,
    dto: SalidaInventarioDto,
    usuarioId: number,
  ) {
    return this.registrarEnTransaccion(tx, { tipo: 'SALIDA', dto }, usuarioId);
  }

  private registrar(operacion: Operacion, usuarioId: number) {
    return this.databaseService.transaction((tx) =>
      this.registrarEnTransaccion(tx, operacion, usuarioId),
    );
  }

  private async registrarEnTransaccion(
    tx: DatabaseTransaction,
    operacion: Operacion,
    usuarioId: number,
  ) {
    const { productoId, observacion } = operacion.dto;
    this.validarEntero(productoId, 1);
    const valor =
      operacion.tipo === 'AJUSTE'
        ? operacion.dto.nuevaCantidad
        : operacion.dto.cantidad;
    this.validarEntero(valor, operacion.tipo === 'AJUSTE' ? 0 : 1);
    if (
      !Number.isInteger(usuarioId) ||
      usuarioId < 1 ||
      usuarioId > 2147483647
    ) {
      throw new UnauthorizedException('Usuario autenticado inválido');
    }

    // Todas las lecturas de stock ocurren DESPUÉS de adquirir este bloqueo en PostgreSQL.
    // El DELETE físico utiliza el mismo bloqueo. Se libera únicamente al commit/rollback.
    await this.databaseService.bloquearProducto(tx, productoId);
    const producto = await tx.orm.public.Producto.where({
      id: productoId,
    }).first();
    if (!producto) throw new NotFoundException('El producto no existe');
    if (!producto.activo)
      throw new ConflictException('El producto se encuentra inactivo');
    const usuario = await tx.orm.public.Usuario.where({
      id: usuarioId,
    }).first();
    if (!usuario || !usuario.activo)
      throw new UnauthorizedException(
        'Usuario autenticado inválido o inactivo',
      );

    let existencia = await tx.orm.public.Existencia.where({
      productoId,
    }).first();
    if (!existencia) {
      existencia = await tx.orm.public.Existencia.create({
        productoId,
        cantidad: 0,
      });
    }
    const stockAnterior = existencia.cantidad;
    const stockNuevo =
      operacion.tipo === 'AJUSTE'
        ? valor
        : operacion.tipo === 'ENTRADA'
          ? stockAnterior + valor
          : stockAnterior - valor;
    if (stockNuevo < 0)
      throw new ConflictException(
        'Existencia insuficiente para realizar la salida',
      );
    if (stockNuevo > 2147483647)
      throw new ConflictException(
        'La existencia supera la cantidad máxima permitida',
      );

    await tx.orm.public.Existencia.where({ productoId }).update({
      cantidad: stockNuevo,
    });
    // En AJUSTE, cantidad es la diferencia con signo (puede ser cero).
    return tx.orm.public.MovimientoInventario.create({
      productoId,
      tipo: operacion.tipo,
      cantidad:
        operacion.tipo === 'AJUSTE' ? stockNuevo - stockAnterior : valor,
      stockAnterior,
      stockNuevo,
      observacion: observacion?.trim() || null,
      usuarioId,
    });
  }
}
