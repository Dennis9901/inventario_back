export function limitesImportacion(env: NodeJS.ProcessEnv = process.env) {
  function entero(key: string, base: number, max: number) {
    const n = Number(env[key] ?? base);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error(`Configuración inválida: ${key}`);
    return n;
  }
  return {
    maxBytes: entero('IMPORT_MAX_BYTES', 2 * 1024 * 1024, 10 * 1024 * 1024),
    maxFilas: entero('IMPORT_MAX_FILAS', 2000, 5000),
    maxExpandido: entero(
      'IMPORT_MAX_EXPANDIDO_BYTES',
      20 * 1024 * 1024,
      50 * 1024 * 1024,
    ),
    maxPreviewHoras: entero('IMPORT_PREVIEW_HORAS', 24, 168),
    maxEntradasZip: 200,
    maxColumnas: 100,
    maxCelda: 10000,
  };
}
