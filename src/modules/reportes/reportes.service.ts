import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { DatabaseService } from '../../database/database.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { periodo, utilidad } from '../dashboard/calculos.js';
import { patronBusqueda } from '../../common/consulta.js';
import { centavos, importeConSigno } from '../../common/dinero.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  ReporteVentasQueryDto,
  ReporteComprasQueryDto,
  ReporteInventarioQueryDto,
  ReporteKardexQueryDto,
  ReporteUtilidadQueryDto,
} from './dto/reportes-query.dto.js';

@Injectable()
export class ReportesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
    private readonly dashboard: DashboardService,
  ) {}

  private async devoluciones(ids: number[], compra: boolean) {
    if (!ids.length)
      return new Map<number, { subtotal: string; costo: string }>();
    const db = this.database.db;
    const json = JSON.stringify(ids);
    const rows = await db.runtime().query(
      db.raw.sql`
      WITH ids AS (SELECT value::int AS id FROM jsonb_array_elements_text(${json}::jsonb)), devoluciones AS (
        SELECT d."ventaId" AS id, d.subtotal, d."costoTotal" AS costo FROM public."devolucionVenta" d JOIN ids ON ids.id = d."ventaId" WHERE NOT ${compra} AND d.estado = 'PROCESADA'
        UNION ALL
        SELECT d."compraId", d.subtotal, 0 FROM public."devolucionCompra" d JOIN ids ON ids.id = d."compraId" WHERE ${compra} AND d.estado = 'PROCESADA'
      ) SELECT id, sum(subtotal)::text AS subtotal, sum(costo)::text AS costo FROM devoluciones GROUP BY id
    `
        .returnsRow({
          id: 'pg/int4@1',
          subtotal: 'pg/text@1',
          costo: 'pg/text@1',
        })
        .build(),
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  async ventas(query: ReporteVentasQueryDto) {
    const p = periodo(query);
    let consulta = this.database.db.orm.public.Venta.select(
      'id',
      'folio',
      'estado',
      'createdAt',
      'fechaConfirmacion',
      'subtotal',
      'impuestos',
      'total',
      'costoTotal',
    ).include('cliente', (c) => c.select('id', 'nombre', 'apellido', 'rfc'));
    consulta = consulta.where({ estado: query.estado });
    if (query.clienteId !== undefined)
      consulta = consulta.where({ clienteId: query.clienteId });
    if (query.estado === 'CONFIRMADA')
      consulta = consulta
        .where((v) => v.fechaConfirmacion.gte(p.fechaInicio))
        .where((v) => v.fechaConfirmacion.lte(p.fechaFin));
    else
      consulta = consulta
        .where((v) => v.createdAt.gte(p.fechaInicio))
        .where((v) => v.createdAt.lte(p.fechaFin));
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((v) =>
        or(
          v.folio.ilike(patron),
          v.cliente.some((c) =>
            or(
              c.nombre.ilike(patron),
              c.apellido.ilike(patron),
              c.rfc.ilike(patron),
              c.razonSocial.ilike(patron),
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
    if (
      !Object.hasOwn(campos, query.sortBy) ||
      !['asc', 'desc'].includes(query.sortOrder)
    )
      throw new BadRequestException('Orden inválido');
    const campo = campos[query.sortBy];
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
    const ds = await this.devoluciones(
      data.map((r) => r.id),
      false,
    );
    return {
      data: data.map((v) => {
        const d = ds.get(v.id) ?? { subtotal: '0.00', costo: '0.00' };
        const u = utilidad(v.subtotal, d.subtotal, v.costoTotal, d.costo);
        return {
          ...v,
          fecha: v.fechaConfirmacion ?? v.createdAt,
          utilidadOriginal: u.utilidadOriginal,
          devoluciones: u.devoluciones,
          costoDevuelto: u.costoDevuelto,
          ventasNetas: u.ventasNetas,
          costoNeto: u.costoNeto,
          utilidadAjustada: u.utilidadBruta,
        };
      }),
      pagination: paginacion(query, total.totalItems),
    };
  }

  async compras(query: ReporteComprasQueryDto) {
    const p = periodo(query);
    let consulta = this.database.db.orm.public.Compra.select(
      'id',
      'folio',
      'estado',
      'createdAt',
      'fechaRecepcion',
      'subtotal',
      'impuestos',
      'total',
    ).include('proveedor', (c) => c.select('id', 'nombre', 'rfc'));
    consulta = consulta.where({ estado: query.estado });
    if (query.proveedorId !== undefined)
      consulta = consulta.where({ proveedorId: query.proveedorId });
    if (query.estado === 'RECIBIDA')
      consulta = consulta
        .where((v) => v.fechaRecepcion.gte(p.fechaInicio))
        .where((v) => v.fechaRecepcion.lte(p.fechaFin));
    else
      consulta = consulta
        .where((v) => v.createdAt.gte(p.fechaInicio))
        .where((v) => v.createdAt.lte(p.fechaFin));
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((v) =>
        or(
          v.folio.ilike(patron),
          v.proveedor.some((c) => c.nombre.ilike(patron)),
        ),
      );
    }
    const campos = {
      createdAt: 'createdAt',
      folio: 'folio',
      estado: 'estado',
      total: 'total',
    } as const;
    if (
      !Object.hasOwn(campos, query.sortBy) ||
      !['asc', 'desc'].includes(query.sortOrder)
    )
      throw new BadRequestException('Orden inválido');
    const campo = campos[query.sortBy];
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
    const ds = await this.devoluciones(
      data.map((r) => r.id),
      true,
    );
    return {
      data: data.map((v) => {
        const d = ds.get(v.id)?.subtotal ?? '0.00';
        return {
          ...v,
          fecha: v.fechaRecepcion ?? v.createdAt,
          devoluciones: importeConSigno(centavos(d)),
          compraNeta: importeConSigno(centavos(v.subtotal) - centavos(d)),
        };
      }),
      pagination: paginacion(query, total.totalItems),
    };
  }

  async utilidad(query: ReporteUtilidadQueryDto) {
    // La misma consulta y fórmulas que Dashboard; el resumen se obtiene sumando los buckets exactos.
    const serie = await this.dashboard.series(query);
    const sumar = (
      campo: 'ventasBrutas' | 'devoluciones' | 'costoVentas' | 'costoDevuelto',
    ) =>
      importeConSigno(serie.data.reduce((s, r) => s + centavos(r[campo]), 0n));
    return {
      resumen: utilidad(
        sumar('ventasBrutas'),
        sumar('devoluciones'),
        sumar('costoVentas'),
        sumar('costoDevuelto'),
      ),
      data: serie.data.map(
        ({
          comprasBrutas: _c,
          devolucionesCompra: _d,
          comprasNetas: _n,
          ...r
        }) => r,
      ),
    };
  }

  async inventarioActual(query: ReporteInventarioQueryDto) {
    const db = this.database.db;
    const search = query.search ? patronBusqueda(query.search) : '';
    const categoria = query.categoriaId ?? 0,
      activo = query.activo ?? true;
    const bajo = query.stockBajo ?? false,
      filtrarBajo = query.stockBajo !== undefined;
    const cero = query.sinExistencia ?? false,
      filtrarCero = query.sinExistencia !== undefined;
    // COUNT y página comparten una sentencia/snapshot. RIGHT JOIN conserva total en páginas vacías.
    const rows = await db.runtime().query(
      db.raw.sql`
      WITH filtrado AS (
        SELECT p.id, e.cantidad FROM public.producto p LEFT JOIN public.existencia e ON e."productoId" = p.id
        WHERE p.activo = ${activo} AND (${categoria} = 0 OR p."categoriaId" = ${categoria})
        AND (${search} = '' OR p.sku ILIKE ${search} OR p.nombre ILIKE ${search} OR p."codigoBarras" ILIKE ${search})
        AND (NOT ${filtrarBajo} OR (e.cantidad <= p."stockMinimo") = ${bajo})
        AND (NOT ${filtrarCero} OR (e.cantidad = 0) = ${cero})
      ), pagina AS (SELECT id FROM filtrado ORDER BY id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit})
      SELECT coalesce(pagina.id, 0)::int AS id, (SELECT count(*)::int FROM filtrado) AS total FROM pagina
      RIGHT JOIN (SELECT 1) dummy ON true
    `
        .returnsRow({ id: 'pg/int4@1', total: 'pg/int4@1' })
        .build(),
    );
    const ids = rows.filter((r) => r.id !== 0).map((r) => r.id);
    const productos = ids.length
      ? await db.orm.public.Producto.include('existencia', (e) =>
          e.select('cantidad'),
        )
          .include('categoria', (c) => c.select('id', 'nombre'))
          .where((p) => p.id.in(ids))
          .orderBy((p) => p.id.asc())
          .all()
      : [];
    return {
      data: productos.map((p) => {
        if (!p.existencia)
          throw new ConflictException(
            'El producto no tiene Existencia registrada',
          );
        const cantidad = p.existencia.cantidad;
        return {
          productoId: p.id,
          sku: p.sku,
          codigoBarras: p.codigoBarras,
          nombre: p.nombre,
          categoria: p.categoria,
          cantidad,
          stockMinimo: p.stockMinimo,
          unidadMedida: p.unidadMedida,
          costoActual: importeConSigno(centavos(p.costo)),
          precioActual: importeConSigno(centavos(p.precio)),
          valorCosto: importeConSigno(BigInt(cantidad) * centavos(p.costo)),
          valorVenta: importeConSigno(BigInt(cantidad) * centavos(p.precio)),
          stockBajo: cantidad <= p.stockMinimo,
          activo: p.activo,
        };
      }),
      pagination: paginacion(query, rows[0]!.total),
    };
  }

  kardex(query: ReporteKardexQueryDto) {
    const p = periodo(query);
    return this.inventario.findMovimientos(
      Object.assign(new ReporteKardexQueryDto(), query, p),
    );
  }
}
