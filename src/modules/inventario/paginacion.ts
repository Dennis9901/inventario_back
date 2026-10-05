import type { PaginacionQueryDto } from './dto/consulta-inventario.dto.js';

export function paginacion(query: PaginacionQueryDto, totalItems: number) {
  const { page, limit } = query;
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

// Las fechas sin hora representan días UTC. Las horas requieren zona explícita.
export function limiteFecha(value: string | undefined, fin = false) {
  if (!value) return undefined;
  return new Date(
    value.length === 10
      ? `${value}T${fin ? '23:59:59.999' : '00:00:00.000'}Z`
      : value,
  ).toISOString();
}
