import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { MovimientoQueryDto } from '../inventario/dto/consulta-inventario.dto.js';
import { centavos, importeConSigno } from '../../common/dinero.js';
import { buckets, periodo, porcentaje, utilidad } from './calculos.js';
import {
  DashboardPeriodoQueryDto,
  DashboardSerieQueryDto,
  DashboardRankingQueryDto,
} from './dto/dashboard-query.dto.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventario: InventarioService,
  ) {}

  // Una consulta agrupa cuatro fuentes por operación y bucket. SUM se ejecuta en PostgreSQL numeric.
  async metricas(query: DashboardPeriodoQueryDto, agrupacion = 'resumen') {
    const p = periodo(query);
    const unidad =
      { dia: 'day', semana: 'week', mes: 'month' }[agrupacion] ?? 'month';
    const db = this.database.db;
    return db.runtime().query(
      db.raw.sql`
      WITH operaciones AS (
        SELECT 'VENTA' AS tipo, "fechaConfirmacion" AS fecha, subtotal, "costoTotal" AS costo, impuestos, total
        FROM public.venta WHERE estado = 'CONFIRMADA' AND "fechaConfirmacion" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT 'DEVOLUCION_VENTA', "fechaProcesamiento", subtotal, "costoTotal", 0, 0
        FROM public."devolucionVenta" WHERE estado = 'PROCESADA' AND "fechaProcesamiento" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT 'COMPRA', "fechaRecepcion", subtotal, 0, impuestos, total
        FROM public.compra WHERE estado = 'RECIBIDA' AND "fechaRecepcion" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT 'DEVOLUCION_COMPRA', "fechaProcesamiento", subtotal, 0, 0, 0
        FROM public."devolucionCompra" WHERE estado = 'PROCESADA' AND "fechaProcesamiento" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
      )
      SELECT tipo, CASE WHEN ${agrupacion} = 'resumen' THEN '' ELSE to_char(date_trunc(${unidad}, fecha AT TIME ZONE 'UTC'), 'YYYY-MM-DD') END AS periodo,
        count(*)::int AS cantidad, sum(subtotal)::text AS subtotal, sum(costo)::text AS costo,
        sum(impuestos)::text AS impuestos, sum(total)::text AS total
      FROM operaciones GROUP BY 1, 2 ORDER BY 2, 1
    `
        .returnsRow({
          tipo: 'pg/text@1',
          periodo: 'pg/text@1',
          cantidad: 'pg/int4@1',
          subtotal: 'pg/text@1',
          costo: 'pg/text@1',
          impuestos: 'pg/text@1',
          total: 'pg/text@1',
        })
        .build(),
    );
  }

  async comercial(query: DashboardPeriodoQueryDto) {
    const rows = await this.metricas(query);
    const obtener = (tipo: string) =>
      rows.find((r) => r.tipo === tipo) ?? {
        cantidad: 0,
        subtotal: '0.00',
        costo: '0.00',
        impuestos: '0.00',
        total: '0.00',
      };
    const v = obtener('VENTA'),
      dv = obtener('DEVOLUCION_VENTA'),
      c = obtener('COMPRA'),
      dc = obtener('DEVOLUCION_COMPRA');
    const u = utilidad(v.subtotal, dv.subtotal, v.costo, dv.costo);
    return {
      ventas: {
        cantidad: v.cantidad,
        cantidadDevoluciones: dv.cantidad,
        brutas: u.ventasBrutas,
        devoluciones: u.devoluciones,
        netas: u.ventasNetas,
        impuestos: importeConSigno(centavos(v.impuestos)),
        facturadas: importeConSigno(centavos(v.total)),
      },
      compras: {
        cantidad: c.cantidad,
        cantidadDevoluciones: dc.cantidad,
        brutas: importeConSigno(centavos(c.subtotal)),
        devoluciones: importeConSigno(centavos(dc.subtotal)),
        netas: importeConSigno(centavos(c.subtotal) - centavos(dc.subtotal)),
        impuestos: importeConSigno(centavos(c.impuestos)),
        facturadas: importeConSigno(centavos(c.total)),
      },
      utilidad: {
        brutaOriginal: u.utilidadOriginal,
        impactoDevoluciones: u.impactoDevoluciones,
        brutaAjustada: u.utilidadBruta,
        costoVentasOriginal: u.costoVentas,
        costoDevuelto: u.costoDevuelto,
        costoNeto: u.costoNeto,
        margenPorcentaje: u.margenPorcentaje,
      },
    };
  }

  async inventarioActual() {
    const db = this.database.db;
    const rows = await db.runtime().query(
      db.raw.sql`
      SELECT count(*)::int AS activos, count(*) FILTER (WHERE e.cantidad <= p."stockMinimo")::int AS bajo,
        count(*) FILTER (WHERE e.cantidad = 0)::int AS cero,
        count(*) FILTER (WHERE e.id IS NULL)::int AS faltantes,
        coalesce(sum(e.cantidad), 0)::text AS unidades,
        coalesce(sum(e.cantidad * p.costo), 0)::text AS costo,
        coalesce(sum(e.cantidad * p.precio), 0)::text AS precio
      FROM public.producto p LEFT JOIN public.existencia e ON e."productoId" = p.id WHERE p.activo
    `
        .returnsRow({
          activos: 'pg/int4@1',
          bajo: 'pg/int4@1',
          cero: 'pg/int4@1',
          faltantes: 'pg/int4@1',
          unidades: 'pg/text@1',
          costo: 'pg/text@1',
          precio: 'pg/text@1',
        })
        .build(),
    );
    const r = rows[0]!;
    return {
      productosActivos: r.activos,
      unidadesExistencia: Number(r.unidades),
      productosStockBajo: r.bajo,
      productosSinExistencia: r.cero,
      productosSinRegistroExistencia: r.faltantes,
      valorCosto: importeConSigno(centavos(r.costo)),
      valorVenta: importeConSigno(centavos(r.precio)),
    };
  }

  async resumen(query: DashboardPeriodoQueryDto) {
    const p = periodo(query);
    const duracion = Date.parse(p.fechaFin) - Date.parse(p.fechaInicio) + 1;
    const anterior = {
      fechaInicio: new Date(Date.parse(p.fechaInicio) - duracion).toISOString(),
      fechaFin: new Date(Date.parse(p.fechaInicio) - 1).toISOString(),
    };
    const [actual, previo, inventario, clientes, proveedores] =
      await Promise.all([
        this.comercial(p),
        this.comercial(anterior),
        this.inventarioActual(),
        this.database.db.orm.public.Cliente.where({ activo: true }).aggregate(
          (a) => ({ activos: a.count() }),
        ),
        this.database.db.orm.public.Proveedor.where({ activo: true }).aggregate(
          (a) => ({ activos: a.count() }),
        ),
      ]);
    const firmado = (v: string) =>
      v.startsWith('-') ? -centavos(v.slice(1)) : centavos(v);
    const cambio = (a: string, b: string) =>
      firmado(b) === 0n
        ? null
        : porcentaje(
            firmado(a) - firmado(b),
            firmado(b) < 0n ? -firmado(b) : firmado(b),
          );
    return {
      periodo: p,
      ...actual,
      inventario,
      clientes: { activos: clientes.activos },
      proveedores: { activos: proveedores.activos },
      comparativa: {
        periodoAnterior: anterior,
        ventasNetasPorcentaje: cambio(actual.ventas.netas, previo.ventas.netas),
        utilidadPorcentaje: cambio(
          actual.utilidad.brutaAjustada,
          previo.utilidad.brutaAjustada,
        ),
      },
    };
  }

  async series(query: DashboardSerieQueryDto) {
    const etiquetas = buckets(query);
    const rows = await this.metricas(query, query.agrupacion);
    return {
      data: etiquetas.map((etiqueta) => {
        const valor = (tipo: string) =>
          rows.find((r) => r.periodo === etiqueta && r.tipo === tipo) ?? {
            subtotal: '0.00',
            costo: '0.00',
          };
        const v = valor('VENTA'),
          dv = valor('DEVOLUCION_VENTA'),
          c = valor('COMPRA'),
          dc = valor('DEVOLUCION_COMPRA');
        return {
          periodo: etiqueta,
          ...utilidad(v.subtotal, dv.subtotal, v.costo, dv.costo),
          comprasBrutas: importeConSigno(centavos(c.subtotal)),
          devolucionesCompra: importeConSigno(centavos(dc.subtotal)),
          comprasNetas: importeConSigno(
            centavos(c.subtotal) - centavos(dc.subtotal),
          ),
        };
      }),
    };
  }

  async ventas(query: DashboardSerieQueryDto) {
    const s = await this.series(query);
    return {
      data: s.data.map((r) => ({
        periodo: r.periodo,
        ventasBrutas: r.ventasBrutas,
        devoluciones: r.devoluciones,
        ventasNetas: r.ventasNetas,
        costoNeto: r.costoNeto,
        utilidad: r.utilidadBruta,
      })),
    };
  }
  async compras(query: DashboardSerieQueryDto) {
    const s = await this.series(query);
    return {
      data: s.data.map((r) => ({
        periodo: r.periodo,
        comprasBrutas: r.comprasBrutas,
        devoluciones: r.devolucionesCompra,
        comprasNetas: r.comprasNetas,
      })),
    };
  }

  async productosMasVendidos(query: DashboardRankingQueryDto) {
    const p = periodo(query),
      db = this.database.db;
    const data = await db.runtime().query(
      db.raw.sql`
      WITH lineas AS (
        SELECT d."productoId" AS id, d.cantidad AS vendida, 0 AS devuelta, d.subtotal AS importe
        FROM public."detalleVenta" d JOIN public.venta v ON v.id = d."ventaId"
        WHERE v.estado = 'CONFIRMADA' AND v."fechaConfirmacion" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT d."productoId", 0, d.cantidad, -d.subtotal
        FROM public."detalleDevolucionVenta" d JOIN public."devolucionVenta" v ON v.id = d."devolucionVentaId"
        WHERE v.estado = 'PROCESADA' AND v."fechaProcesamiento" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
      )
      SELECT p.id, p.sku, p.nombre, sum(l.vendida)::text AS bruta, sum(l.devuelta)::text AS devuelta,
        sum(l.importe)::text AS importe FROM lineas l JOIN public.producto p ON p.id = l.id
      GROUP BY p.id ORDER BY sum(l.vendida - l.devuelta) DESC, p.id ASC LIMIT ${query.limit}
    `
        .returnsRow({
          id: 'pg/int4@1',
          sku: 'pg/text@1',
          nombre: 'pg/text@1',
          bruta: 'pg/text@1',
          devuelta: 'pg/text@1',
          importe: 'pg/text@1',
        })
        .build(),
    );
    return {
      data: data.map((r) => ({
        producto: { id: r.id, sku: r.sku, nombre: r.nombre },
        cantidadVendidaBruta: Number(r.bruta),
        cantidadDevuelta: Number(r.devuelta),
        cantidadVendidaNeta: Number(r.bruta) - Number(r.devuelta),
        importeNeto: importeConSigno(
          r.importe.startsWith('-')
            ? -centavos(r.importe.slice(1))
            : centavos(r.importe),
        ),
      })),
    };
  }

  async stockBajo(limit: number) {
    const db = this.database.db;
    const data = await db.runtime().query(
      db.raw.sql`
      SELECT p.id AS "productoId", p.sku, p.nombre, e.cantidad, p."stockMinimo", p."unidadMedida",
        greatest(p."stockMinimo" - e.cantidad, 0)::int AS "faltanteParaMinimo"
      FROM public.producto p JOIN public.existencia e ON e."productoId" = p.id
      WHERE p.activo AND e.cantidad <= p."stockMinimo"
      ORDER BY (e.cantidad = 0) DESC, p."stockMinimo" - e.cantidad DESC, p.id ASC LIMIT ${limit}
    `
        .returnsRow({
          productoId: 'pg/int4@1',
          sku: 'pg/text@1',
          nombre: 'pg/text@1',
          cantidad: 'pg/int4@1',
          stockMinimo: 'pg/int4@1',
          unidadMedida: 'pg/text@1',
          faltanteParaMinimo: 'pg/int4@1',
        })
        .build(),
    );
    return { data };
  }
  async movimientosRecientes(limit: number) {
    const result = await this.inventario.findMovimientos(
      Object.assign(new MovimientoQueryDto(), { limit }),
    );
    return { data: result.data };
  }

  async actividadReciente(limit: number) {
    const db = this.database.db;
    return {
      data: await db.runtime().query(
        db.raw.sql`
      WITH actividad AS (
        (SELECT 'VENTA' AS tipo, id, folio, subtotal::text AS importe, "fechaConfirmacion" AS fecha FROM public.venta WHERE estado = 'CONFIRMADA' ORDER BY "fechaConfirmacion" DESC, id DESC LIMIT ${limit})
        UNION ALL
        (SELECT 'COMPRA', id, folio, subtotal::text, "fechaRecepcion" FROM public.compra WHERE estado = 'RECIBIDA' ORDER BY "fechaRecepcion" DESC, id DESC LIMIT ${limit})
        UNION ALL
        (SELECT 'DEVOLUCION_VENTA', id, folio, subtotal::text, "fechaProcesamiento" FROM public."devolucionVenta" WHERE estado = 'PROCESADA' ORDER BY "fechaProcesamiento" DESC, id DESC LIMIT ${limit})
        UNION ALL
        (SELECT 'DEVOLUCION_COMPRA', id, folio, subtotal::text, "fechaProcesamiento" FROM public."devolucionCompra" WHERE estado = 'PROCESADA' ORDER BY "fechaProcesamiento" DESC, id DESC LIMIT ${limit})
      ) SELECT tipo, id, folio, importe, fecha, tipo || ' ' || folio AS descripcion FROM actividad ORDER BY fecha DESC, tipo ASC, id DESC LIMIT ${limit}
    `
          .returnsRow({
            tipo: 'pg/text@1',
            id: 'pg/int4@1',
            folio: 'pg/text@1',
            importe: 'pg/text@1',
            fecha: 'pg/timestamptz-string@1',
            descripcion: 'pg/text@1',
          })
          .build(),
      ),
    };
  }

  async sujetosPrincipales(query: DashboardRankingQueryDto, compras: boolean) {
    const p = periodo(query),
      db = this.database.db;
    const rows = await db.runtime().query(
      db.raw.sql`
      WITH eventos AS (
        SELECT "clienteId" AS id, 1 AS cantidad, subtotal AS bruto, 0::numeric AS devuelto FROM public.venta
        WHERE NOT ${compras} AND estado = 'CONFIRMADA' AND "fechaConfirmacion" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT v."clienteId", 0, 0, d.subtotal FROM public."devolucionVenta" d JOIN public.venta v ON v.id = d."ventaId"
        WHERE NOT ${compras} AND d.estado = 'PROCESADA' AND d."fechaProcesamiento" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT "proveedorId", 1, subtotal, 0 FROM public.compra
        WHERE ${compras} AND estado = 'RECIBIDA' AND "fechaRecepcion" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
        UNION ALL
        SELECT c."proveedorId", 0, 0, d.subtotal FROM public."devolucionCompra" d JOIN public.compra c ON c.id = d."compraId"
        WHERE ${compras} AND d.estado = 'PROCESADA' AND d."fechaProcesamiento" BETWEEN ${p.fechaInicio}::timestamptz AND ${p.fechaFin}::timestamptz
      ), sujetos AS (
        SELECT id, nombre FROM public.cliente WHERE NOT ${compras}
        UNION ALL SELECT id, nombre FROM public.proveedor WHERE ${compras}
      ) SELECT s.id, s.nombre, sum(e.cantidad)::int AS cantidad, sum(e.bruto)::text AS bruto, sum(e.devuelto)::text AS devuelto
      FROM eventos e JOIN sujetos s ON s.id = e.id GROUP BY s.id, s.nombre
      ORDER BY sum(e.bruto - e.devuelto) DESC, s.id ASC LIMIT ${query.limit}
    `
        .returnsRow({
          id: 'pg/int4@1',
          nombre: 'pg/text@1',
          cantidad: 'pg/int4@1',
          bruto: 'pg/text@1',
          devuelto: 'pg/text@1',
        })
        .build(),
    );
    return rows.map((r) => ({
      sujeto: { id: r.id, nombre: r.nombre },
      cantidad: r.cantidad,
      brutas: importeConSigno(centavos(r.bruto)),
      devoluciones: importeConSigno(centavos(r.devuelto)),
      netas: importeConSigno(centavos(r.bruto) - centavos(r.devuelto)),
    }));
  }
  async clientesPrincipales(query: DashboardRankingQueryDto) {
    return {
      data: (await this.sujetosPrincipales(query, false)).map((r) => ({
        cliente: r.sujeto,
        cantidadVentas: r.cantidad,
        ventasBrutas: r.brutas,
        devoluciones: r.devoluciones,
        ventasNetas: r.netas,
      })),
    };
  }
  async proveedoresPrincipales(query: DashboardRankingQueryDto) {
    return {
      data: (await this.sujetosPrincipales(query, true)).map((r) => ({
        proveedor: r.sujeto,
        cantidadCompras: r.cantidad,
        comprasBrutas: r.brutas,
        devoluciones: r.devoluciones,
        comprasNetas: r.netas,
      })),
    };
  }
}
