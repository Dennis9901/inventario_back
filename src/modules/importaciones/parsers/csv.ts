import { errorArchivo, encabezado } from '../importaciones.util.js';
import { limitesImportacion } from '../importaciones.config.js';
import type { ParsedFile } from '../importaciones.types.js';
export function csv(
  buffer: Buffer,
  encoding: 'utf-8' | 'windows-1252',
  filaEncabezado = 1,
): ParsedFile {
  const l = limitesImportacion();
  let s: string;
  try {
    s = new TextDecoder(encoding, { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, '');
  } catch {
    errorArchivo(
      'IMPORT_ENCODING_INVALIDO',
      'Archivo incompatible con encoding seleccionado',
    );
  }
  if (!s.trim() || s.includes(String.fromCharCode(0)))
    errorArchivo('IMPORT_ARCHIVO_INVALIDO', 'CSV vacío o binario');
  const first = s.split(/\r?\n/, 1)[0]!;
  let quoted = false,
    coma = 0,
    semi = 0;
  for (let i = 0; i < first.length; i++) {
    const c = first[i];
    if (c === '"') {
      if (quoted && first[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === ',') coma++;
      if (c === ';') semi++;
    }
  }
  if (coma && semi && coma === semi)
    errorArchivo(
      'IMPORT_DELIMITADOR_AMBIGUO',
      'Selecciona archivo con delimitador inequívoco',
    );
  const delimiter = semi > coma ? ';' : ',';
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    cell = '',
    state: 'INICIO' | 'TEXTO' | 'COMILLAS' | 'CIERRE' = 'INICIO',
    line = 1,
    start = 1;
  function field() {
    if (cell.length > l.maxCelda)
      errorArchivo('IMPORT_LIMITE_CELDA', 'Celda demasiado extensa');
    cells.push(cell);
    if (cells.length > l.maxColumnas)
      errorArchivo('IMPORT_LIMITE_COLUMNAS', 'Demasiadas columnas');
    cell = '';
    state = 'INICIO';
  }
  function row() {
    field();
    if (cells.some((c) => c.trim())) rows.push({ cells, line: start });
    cells = [];
    if (rows.length > l.maxFilas + 50)
      errorArchivo('IMPORT_LIMITE_FILAS', 'Demasiadas filas');
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (state === 'COMILLAS') {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = 'CIERRE';
      } else {
        cell += c;
        if (c === '\n') line++;
      }
    } else if (c === delimiter) field();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row();
      line++;
      start = line;
    } else if (c === '"') {
      if (state !== 'INICIO')
        errorArchivo('IMPORT_CSV_CORRUPTO', 'Comillas inesperadas');
      state = 'COMILLAS';
    } else {
      if (state === 'CIERRE') {
        if (c !== ' ' && c !== '\t')
          errorArchivo(
            'IMPORT_CSV_CORRUPTO',
            'Texto después del cierre de comillas',
          );
      } else {
        cell += c;
        state = 'TEXTO';
      }
    }
    if (cell.length > l.maxCelda)
      errorArchivo('IMPORT_LIMITE_CELDA', 'Celda demasiado extensa');
  }
  if (state === 'COMILLAS')
    errorArchivo('IMPORT_CSV_CORRUPTO', 'Campo entrecomillado sin cierre');
  if (cell || cells.length || state === 'CIERRE') row();
  const header = rows[filaEncabezado - 1];
  if (!header)
    errorArchivo('IMPORT_ENCABEZADO_INVALIDO', 'No existe fila de encabezado');
  const headers = header.cells.map((c) => c.trim());
  const seen = new Set<string>();
  for (const h of headers.filter(Boolean)) {
    const key = encabezado(h);
    if (seen.has(key))
      errorArchivo('IMPORT_ENCABEZADO_DUPLICADO', 'Encabezados duplicados');
    seen.add(key);
  }
  const data = rows.slice(filaEncabezado);
  if (!data.length) errorArchivo('IMPORT_SIN_FILAS', 'No hay filas de datos');
  if (data.length > l.maxFilas)
    errorArchivo('IMPORT_LIMITE_FILAS', 'Demasiadas filas');
  return {
    encabezados: headers.filter(Boolean),
    hojas: [],
    hoja: null,
    filas: data.map((r) => {
      const advertencias: import('../importaciones.types.js').ImportIssue[] =
        [];
      const requiredWidth = headers.findLastIndex((h) => Boolean(h)) + 1;
      if (
        r.cells.length < requiredWidth ||
        r.cells.slice(headers.length).some((v) => v.trim())
      )
        advertencias.push({
          fila: r.line,
          campo: '',
          codigo: 'CSV_COLUMNAS_INVALIDAS',
          mensaje: 'Cantidad de columnas incompatible; fila no importable',
        });
      const valores: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h)
          Object.defineProperty(valores, h, {
            value: r.cells[i] ?? '',
            enumerable: true,
          });
        else if (r.cells[i]?.trim())
          advertencias.push({
            fila: r.line,
            campo: '',
            codigo: 'CSV_CAMPO_SIN_ENCABEZADO',
            mensaje: 'Datos en columna sin encabezado; no se infiere mapping',
          });
      });
      return { numeroFila: r.line, valores, advertencias };
    }),
  };
}
