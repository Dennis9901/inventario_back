// Esta RC conserva SQLSTATE en meta o cause. No se ocultan errores desconocidos.
export function tieneSqlState(
  error: unknown,
  state: string,
  depth = 0,
): boolean {
  if (!error || typeof error !== 'object' || depth > 8) return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === state ||
    record['sqlState'] === state ||
    tieneSqlState(record['meta'], state, depth + 1) ||
    tieneSqlState(record['cause'], state, depth + 1)
  );
}
