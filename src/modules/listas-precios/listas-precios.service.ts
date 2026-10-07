import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../../database/database.service.js';
import { validarId, patronBusqueda } from '../../common/consulta.js';
import { tieneSqlState } from '../../common/errores-db.js';
import { centavos, importe } from '../../common/dinero.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  CreateListaPrecioDto,
  UpdateListaPrecioDto,
  ListaPrecioQueryDto,
  CreateProductoPrecioDto,
  UpdateProductoPrecioDto,
  ProductoPrecioQueryDto,
} from './dto/listas-precios.dto.js';

@Injectable()
export class ListasPreciosService {
  constructor(private readonly database: DatabaseService) {}

  // Orden: lock comercial global -> lista/productos -> precios. Lecturas de venta
  // comparten el lock; una configuración completa no cambia durante sus snapshots.
  async bloquearConfiguracion(tx: DatabaseTransaction, exclusivo = false) {
    await tx.query(
      (exclusivo
        ? this.database.db.raw
            .sql`SELECT 1 AS id FROM pg_advisory_xact_lock(5, 5002)`
        : this.database.db.raw
            .sql`SELECT 1 AS id FROM pg_advisory_xact_lock_shared(5, 5002)`
      )
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
  }
  private async mutar<T>(fn: (tx: DatabaseTransaction) => Promise<T>) {
    try {
      return await this.database.transaction(async (tx) => {
        await this.bloquearConfiguracion(tx, true);
        return fn(tx);
      });
    } catch (e: unknown) {
      if (tieneSqlState(e, '23505') || tieneSqlState(e, '23P01'))
        throw new ConflictException(
          'Código/predeterminada duplicado o vigencias solapadas',
        );
      if (tieneSqlState(e, '23503'))
        throw new ConflictException(
          'La lista tiene referencias; utiliza desactivación',
        );
      throw e;
    }
  }
  async findOne(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const lista = await (
      tx?.orm ?? this.database.db.orm
    ).public.ListaPrecio.where({ id }).first();
    if (!lista) throw new NotFoundException('La lista de precios no existe');
    return lista;
  }
  async validarLista(tx: DatabaseTransaction, id: number) {
    const lista = await this.findOne(id, tx);
    if (!lista.activo) throw new ConflictException('La lista está inactiva');
    return lista;
  }
  async findAll(q = new ListaPrecioQueryDto()) {
    let c = this.database.db.orm.public.ListaPrecio;
    if (q.activo !== undefined) c = c.where({ activo: q.activo });
    if (q.search)
      c = c.where((l) =>
        or(
          l.nombre.ilike(patronBusqueda(q.search!)),
          l.codigo.ilike(patronBusqueda(q.search!)),
        ),
      );
    const [data, n] = await Promise.all([
      c
        .orderBy((l) => l.id.asc())
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .all(),
      c.aggregate((a) => ({ total: a.count() })),
    ]);
    return { data, pagination: paginacion(q, n.total) };
  }
  create(dto: CreateListaPrecioDto) {
    return this.mutar((tx) =>
      tx.orm.public.ListaPrecio.create({
        codigo: dto.codigo,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
      }),
    );
  }
  update(id: number, dto: UpdateListaPrecioDto) {
    return this.mutar(async (tx) => {
      const lista = await this.findOne(id, tx);
      if (dto.codigo !== undefined && dto.codigo !== lista.codigo)
        throw new ConflictException('El código de lista es inmutable');
      const cambios = {
        ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
        ...(dto.descripcion !== undefined && {
          descripcion: dto.descripcion.trim() || null,
        }),
      };
      if (Object.keys(cambios).length)
        await tx.orm.public.ListaPrecio.where({ id }).update(cambios);
      return this.findOne(id, tx);
    });
  }
  cambiarActivo(id: number, activo: boolean) {
    return this.mutar(async (tx) => {
      const lista = await this.findOne(id, tx);
      if (lista.activo === activo)
        throw new ConflictException('La lista ya tiene ese estado');
      if (!activo && lista.esPredeterminada)
        throw new ConflictException(
          'Selecciona otra predeterminada antes de desactivar',
        );
      await tx.orm.public.ListaPrecio.where({ id }).update({ activo });
      return this.findOne(id, tx);
    });
  }
  predeterminada(id: number) {
    return this.mutar(async (tx) => {
      await this.validarLista(tx, id);
      await tx.orm.public.ListaPrecio.where({
        esPredeterminada: true,
      }).updateAll({ esPredeterminada: false });
      await tx.orm.public.ListaPrecio.where({ id }).update({
        esPredeterminada: true,
      });
      return this.findOne(id, tx);
    });
  }
  remove(id: number) {
    return this.mutar(async (tx) => {
      const lista = await this.findOne(id, tx);
      if (lista.esPredeterminada)
        throw new ConflictException('No se elimina la lista predeterminada');
      if (
        (await tx.orm.public.ProductoPrecio.where({
          listaPrecioId: id,
        }).first()) ||
        (await tx.orm.public.Venta.where({ listaPrecioId: id }).first())
      )
        throw new ConflictException(
          'La lista tiene historial; utiliza desactivación',
        );
      await tx.orm.public.ListaPrecio.where({ id }).delete();
      return { id, message: 'Lista eliminada definitivamente' };
    });
  }
  private fecha(value: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new BadRequestException('Fecha requiere timestamp con zona');
    return new Date(value).toISOString();
  }
  async precios(listaId: number, q = new ProductoPrecioQueryDto()) {
    await this.findOne(listaId);
    let c = this.database.db.orm.public.ProductoPrecio.include(
      'producto',
      (p) => p.select('id', 'sku', 'nombre'),
    ).where({ listaPrecioId: listaId });
    if (q.productoId !== undefined) c = c.where({ productoId: q.productoId });
    if (q.activo !== undefined) c = c.where({ activo: q.activo });
    if (q.vigenteEn) {
      const fecha = this.fecha(q.vigenteEn);
      c = c
        .where({ activo: true })
        .where((p) => p.vigenciaDesde.lte(fecha))
        .where((p) => or(p.vigenciaHasta.isNull(), p.vigenciaHasta.gt(fecha)));
    }
    if (q.search)
      c = c.where((p) =>
        p.producto.some((x) =>
          or(
            x.nombre.ilike(patronBusqueda(q.search!)),
            x.sku.ilike(patronBusqueda(q.search!)),
          ),
        ),
      );
    const [data, n] = await Promise.all([
      c
        .orderBy((p) => p.id.asc())
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .all(),
      c.aggregate((a) => ({ total: a.count() })),
    ]);
    return { data, pagination: paginacion(q, n.total) };
  }
  async precioPorId(listaId: number, id: number, tx?: DatabaseTransaction) {
    await this.findOne(listaId, tx);
    validarId(id);
    const precio = await (
      tx?.orm ?? this.database.db.orm
    ).public.ProductoPrecio.where({ id, listaPrecioId: listaId }).first();
    if (!precio)
      throw new NotFoundException(
        'El precio de producto no existe en la lista',
      );
    return precio;
  }
  crearPrecio(listaId: number, dto: CreateProductoPrecioDto) {
    const dinero = centavos(dto.precio);
    if (dinero > 100000000000000n)
      throw new BadRequestException('Precio fuera de rango');
    const desde = this.fecha(dto.vigenciaDesde),
      hasta = dto.vigenciaHasta ? this.fecha(dto.vigenciaHasta) : null;
    if (hasta && hasta <= desde)
      throw new BadRequestException('El fin debe ser posterior al inicio');
    return this.mutar(async (tx) => {
      await this.validarLista(tx, listaId);
      validarId(dto.productoId);
      await this.database.bloquearProducto(tx, dto.productoId);
      const p = await tx.orm.public.Producto.where({
        id: dto.productoId,
      }).first();
      if (!p) throw new NotFoundException('El producto no existe');
      if (!p.activo) throw new ConflictException('El producto está inactivo');
      let c = tx.orm.public.ProductoPrecio.where({
        listaPrecioId: listaId,
        productoId: dto.productoId,
        activo: true,
      }).where((p) => or(p.vigenciaHasta.isNull(), p.vigenciaHasta.gt(desde)));
      if (hasta) c = c.where((p) => p.vigenciaDesde.lt(hasta));
      if (await c.first())
        throw new ConflictException(
          'La vigencia se solapa; cierra explícitamente la anterior',
        );
      return tx.orm.public.ProductoPrecio.create({
        listaPrecioId: listaId,
        productoId: dto.productoId,
        precio: importe(dinero),
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
      });
    });
  }
  cerrarPrecio(listaId: number, id: number, dto: UpdateProductoPrecioDto) {
    return this.mutar(async (tx) => {
      await this.validarLista(tx, listaId);
      const p = await this.precioPorId(listaId, id, tx);
      if (!dto.vigenciaHasta)
        throw new BadRequestException('Se requiere vigenciaHasta');
      const hasta = this.fecha(dto.vigenciaHasta),
        ahora = new Date().toISOString();
      if (
        hasta <= ahora ||
        hasta <= new Date(p.vigenciaDesde).toISOString() ||
        (p.vigenciaHasta && hasta > new Date(p.vigenciaHasta).toISOString())
      )
        throw new ConflictException(
          'Solo se permite cerrar/reducir vigencia a un instante futuro posterior al inicio',
        );
      await tx.orm.public.ProductoPrecio.where({ id }).update({
        vigenciaHasta: hasta,
      });
      return this.precioPorId(listaId, id, tx);
    });
  }
  // Plan validado por batch bajo bloquearConfiguracion(exclusivo). La BD
  // sigue aplicando CHECK/EXCLUDE; no se cambian importes ni snapshots anteriores.
  async aplicarVigenciaImportada(
    tx: DatabaseTransaction,
    datos: {
      productoId: number;
      listaPrecioId: number;
      precio: string;
      vigenciaDesde: string;
      vigenciaHasta: string | null;
    },
    anteriorId: number | null,
  ) {
    const precio = importe(centavos(datos.precio));
    if (centavos(precio) > 100000000000000n)
      throw new BadRequestException('Precio fuera de rango');
    const desde = this.fecha(datos.vigenciaDesde),
      hasta = datos.vigenciaHasta ? this.fecha(datos.vigenciaHasta) : null;
    if (hasta && hasta <= desde)
      throw new BadRequestException('El fin debe ser posterior al inicio');
    if (anteriorId !== null) {
      if (desde <= new Date().toISOString())
        throw new ConflictException('Cierre importado requiere corte futuro');
      await tx.orm.public.ProductoPrecio.where({
        id: anteriorId,
        productoId: datos.productoId,
        listaPrecioId: datos.listaPrecioId,
        activo: true,
      }).update({ vigenciaHasta: desde });
    }
    return tx.orm.public.ProductoPrecio.create({
      ...datos,
      precio,
      vigenciaDesde: desde,
      vigenciaHasta: hasta,
    });
  }

  async resolverEnTransaccion(
    tx: DatabaseTransaction,
    productoId: number,
    listaId?: number | null,
    fecha = new Date().toISOString(),
  ) {
    validarId(productoId);
    const instante = this.fecha(fecha);
    const producto = await tx.orm.public.Producto.where({
      id: productoId,
    }).first();
    if (!producto) throw new NotFoundException('El producto no existe');
    if (!producto.activo)
      throw new ConflictException('El producto está inactivo');
    const lista = listaId != null ? await this.validarLista(tx, listaId) : null;
    const precio = lista
      ? await tx.orm.public.ProductoPrecio.where({
          productoId,
          listaPrecioId: lista.id,
          activo: true,
        })
          .where((p) => p.vigenciaDesde.lte(instante))
          .where((p) =>
            or(p.vigenciaHasta.isNull(), p.vigenciaHasta.gt(instante)),
          )
          .first()
      : null;
    return {
      productoId,
      precio: importe(centavos(precio?.precio ?? producto.precio)),
      origen: precio ? 'LISTA_PRECIO' : 'PRECIO_BASE',
      listaPrecioId: lista?.id ?? null,
      lista: lista
        ? { id: lista.id, codigo: lista.codigo, nombre: lista.nombre }
        : null,
      vigencia: precio
        ? {
            id: precio.id,
            desde: precio.vigenciaDesde,
            hasta: precio.vigenciaHasta,
          }
        : null,
    };
  }
  resolverPrecio(productoId: number, listaId?: number, fecha?: string) {
    return this.database.transaction(async (tx) => {
      await this.bloquearConfiguracion(tx);
      await this.database.bloquearProducto(tx, productoId);
      return this.resolverEnTransaccion(tx, productoId, listaId, fecha);
    });
  }
}
