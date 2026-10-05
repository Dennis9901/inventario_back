import { BadRequestException } from '@nestjs/common';
import { limiteFecha } from '../modules/inventario/paginacion.js';

export function patronBusqueda(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function rangoFechas(inicio?: string, fin?: string) {
  const desde = limiteFecha(inicio);
  const hasta = limiteFecha(fin, true);
  if (desde && hasta && Date.parse(desde) > Date.parse(hasta))
    throw new BadRequestException(
      'fechaInicio debe ser anterior o igual a fechaFin',
    );
  return { desde, hasta };
}

export function validarId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647)
    throw new BadRequestException('Identificador inválido');
}
