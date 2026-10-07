import { BadRequestException } from '@nestjs/common';
import { rangoFechas } from '../../common/consulta.js';
import { centavos, importeConSigno } from '../../common/dinero.js';
import type {
  DashboardPeriodoQueryDto,
  DashboardSerieQueryDto,
} from './dto/dashboard-query.dto.js';

const DIA = 86400000;
export function periodo(query: DashboardPeriodoQueryDto, ahora = new Date()) {
  if ((query.fechaInicio === undefined) !== (query.fechaFin === undefined))
    throw new BadRequestException('Envíe ambas fechas o ninguna');
  const defectoInicio = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1),
  ).toISOString();
  const defectoFin = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1) - 1,
  ).toISOString();
  const { desde, hasta } = rangoFechas(
    query.fechaInicio ?? defectoInicio,
    query.fechaFin ?? defectoFin,
  );
  const inicio = Date.parse(desde!);
  const fin = Date.parse(hasta!);
  if (
    !Number.isFinite(inicio) ||
    !Number.isFinite(fin) ||
    fin - inicio + 1 > 3660 * DIA
  )
    throw new BadRequestException('Rango máximo: 3660 días');
  return { fechaInicio: desde!, fechaFin: hasta! };
}

export function inicioBucket(
  value: string,
  agrupacion: DashboardSerieQueryDto['agrupacion'],
) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  if (agrupacion === 'semana')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (agrupacion === 'mes') d.setUTCDate(1);
  return d;
}

export function buckets(query: DashboardSerieQueryDto) {
  const p = periodo(query);
  if (!['dia', 'semana', 'mes'].includes(query.agrupacion))
    throw new BadRequestException('Agrupación inválida');
  const limite = { dia: 366, semana: 260, mes: 120 }[query.agrupacion];
  const fecha = inicioBucket(p.fechaInicio, query.agrupacion);
  const ultimo = inicioBucket(p.fechaFin, query.agrupacion);
  const resultado: string[] = [];
  while (fecha <= ultimo) {
    if (resultado.length >= limite)
      throw new BadRequestException(
        `Máximo ${limite} períodos para ${query.agrupacion}`,
      );
    resultado.push(fecha.toISOString().slice(0, 10));
    if (query.agrupacion === 'mes') fecha.setUTCMonth(fecha.getUTCMonth() + 1);
    else
      fecha.setUTCDate(
        fecha.getUTCDate() + (query.agrupacion === 'semana' ? 7 : 1),
      );
  }
  return resultado;
}

// Redondeo a dos decimales, mitades alejándose de cero, sin Float.
export function porcentaje(numerador: bigint, denominador: bigint) {
  if (denominador === 0n) return '0.00';
  const n = numerador * 10000n;
  const signo = n < 0n !== denominador < 0n ? -1n : 1n;
  const a = n < 0n ? -n : n;
  const b = denominador < 0n ? -denominador : denominador;
  return importeConSigno(signo * ((a + b / 2n) / b));
}

export function utilidad(
  brutas: string,
  devoluciones: string,
  costo: string,
  costoDevuelto: string,
) {
  const v = centavos(brutas),
    d = centavos(devoluciones),
    c = centavos(costo),
    cd = centavos(costoDevuelto);
  return {
    ventasBrutas: importeConSigno(v),
    devoluciones: importeConSigno(d),
    ventasNetas: importeConSigno(v - d),
    costoVentas: importeConSigno(c),
    costoDevuelto: importeConSigno(cd),
    costoNeto: importeConSigno(c - cd),
    utilidadOriginal: importeConSigno(v - c),
    impactoDevoluciones: importeConSigno(d - cd),
    utilidadBruta: importeConSigno(v - d - c + cd),
    margenPorcentaje: porcentaje(v - d - c + cd, v - d),
  };
}
