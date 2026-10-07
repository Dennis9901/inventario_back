import { fromBuffer, type Entry } from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { posix } from 'node:path';
import {
  errorArchivo,
  objeto,
  lista,
  texto,
  encabezado,
} from '../importaciones.util.js';
import { limitesImportacion } from '../importaciones.config.js';
import type { ParsedFile, ImportIssue } from '../importaciones.types.js';
async function unzip(buffer: Buffer): Promise<Map<string, string>> {
  const l = limitesImportacion();
  return new Promise((resolve, reject) => {
    fromBuffer(
      buffer,
      {
        lazyEntries: true,
        validateEntrySizes: true,
        strictFileNames: true,
        autoClose: true,
      },
      (err, zip) => {
        if (err || !zip) {
          reject(new Error('ZIP inválido'));
          return;
        }
        const files = new Map<string, string>();
        const nombres = new Set<string>();
        let total = 0,
          count = 0,
          failed = false;
        const fail = (e: unknown) => {
          if (!failed) {
            failed = true;
            zip.close();
            reject(e);
          }
        };
        zip.on('error', fail);
        zip.on('end', () => {
          if (!failed) resolve(files);
        });
        zip.on('entry', (entry: Entry) => {
          void (async () => {
            const name = entry.fileName;
            if (
              ++count > l.maxEntradasZip ||
              nombres.has(name) ||
              name.startsWith('/') ||
              name.includes('\\') ||
              name.split('/').includes('..') ||
              entry.generalPurposeBitFlag & 1 ||
              ![0, 8].includes(entry.compressionMethod)
            )
              throw new Error('ZIP no permitido');
            nombres.add(name);
            total += entry.uncompressedSize;
            if (
              total > l.maxExpandido ||
              entry.uncompressedSize > l.maxExpandido ||
              /vbaProject|macrosheets|embeddings/i.test(name)
            )
              throw new Error(
                'XLSX excede límites o contiene componentes no permitidos',
              );
            if (/externalLinks/i.test(name)) {
              files.set('__external_ignored__', 'true');
              zip.readEntry();
              return;
            }
            if (!name.endsWith('.xml') && !name.endsWith('.rels')) {
              zip.readEntry();
              return;
            }
            const stream = await new Promise<import('node:stream').Readable>(
              (res, rej) =>
                zip.openReadStream(entry, (e, s) =>
                  e || !s ? rej(e ?? new Error('ZIP inválido')) : res(s),
                ),
            );
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              if (!Buffer.isBuffer(chunk)) throw new Error('ZIP inválido');
              bytes += chunk.length;
              if (bytes > entry.uncompressedSize || bytes > l.maxExpandido) {
                stream.destroy();
                throw new Error('ZIP excede límites');
              }
              chunks.push(chunk);
            }
            const xml = new TextDecoder('utf-8', { fatal: true }).decode(
              Buffer.concat(chunks),
            );
            if (/<!DOCTYPE|<!ENTITY/i.test(xml))
              throw new Error('DTD/entidades no permitidas');
            files.set(name, xml);
            zip.readEntry();
          })().catch(fail);
        });
        zip.readEntry();
      },
    );
  });
}
function xml(value: string | undefined): Record<string, unknown> {
  if (!value || XMLValidator.validate(value) !== true)
    errorArchivo('IMPORT_XLSX_INVALIDO', 'XML requerido ausente o inválido');
  // Sin DTD ni entidades personalizadas; solo decodificar escapes estándar acotados.
  try {
    const parsed: unknown = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      maxNestedTags: 64,
      trimValues: false,
    }).parse(value);
    return objeto(parsed);
  } catch {
    errorArchivo(
      'IMPORT_XLSX_INVALIDO',
      'XML incompatible o excesivamente anidado',
    );
  }
}
function unescapeXml(s: string) {
  return s.replace(
    /&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g,
    (v) => {
      const named: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      };
      if (named[v] !== undefined) return named[v]!;
      const n = v.startsWith('&#x')
        ? Number.parseInt(v.slice(3, -1), 16)
        : Number.parseInt(v.slice(2, -1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : '';
    },
  );
}
function textNode(node: unknown): string {
  if (typeof node === 'string') return unescapeXml(node);
  const o = objeto(node);
  if (o['t'] !== undefined) return textNode(o['t']);
  if (o['#text'] !== undefined) return unescapeXml(texto(o['#text']));
  return lista(o['r'])
    .map((r) => textNode(objeto(r)['t']))
    .join('');
}
function index(reference: string) {
  const m = /^([A-Z]+)\d+$/.exec(reference);
  if (!m) errorArchivo('IMPORT_XLSX_INVALIDO', 'Referencia de celda inválida');
  let n = 0;
  for (const c of m[1]!) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
export async function xlsx(
  buffer: Buffer,
  hoja: string | undefined,
  filaEncabezado: number,
): Promise<ParsedFile> {
  let files: Map<string, string>;
  try {
    files = await unzip(buffer);
  } catch {
    errorArchivo(
      'IMPORT_XLSX_INVALIDO',
      'XLSX incompatible, corrupto o excede límites de expansión',
    );
  }
  if (/macroEnabled/i.test(files.get('[Content_Types].xml') ?? ''))
    errorArchivo(
      'IMPORT_XLSX_INVALIDO',
      'Libro habilitado para macros no permitido',
    );
  const workbook = objeto(xml(files.get('xl/workbook.xml'))['workbook']);
  const sheets = lista(objeto(workbook['sheets'])['sheet']).map(objeto);
  const names = sheets.map((s) => unescapeXml(texto(s['@_name'])));
  if (!names.length) errorArchivo('IMPORT_XLSX_INVALIDO', 'No hay hojas');
  if (!hoja && names.length > 1)
    errorArchivo(
      'IMPORT_HOJA_REQUERIDA',
      `Selecciona una hoja; ${names.length} hojas detectadas`,
    );
  const selected = sheets.find(
    (s) => unescapeXml(texto(s['@_name'])) === (hoja ?? names[0]),
  );
  if (!selected)
    errorArchivo('IMPORT_HOJA_NO_EXISTE', 'La hoja seleccionada no existe');
  const rels = lista(
    objeto(xml(files.get('xl/_rels/workbook.xml.rels'))['Relationships'])[
      'Relationship'
    ],
  ).map(objeto);
  const rel = rels.find((r) => r['@_Id'] === selected['@_r:id']);
  if (!rel || rel['@_TargetMode'] === 'External')
    errorArchivo('IMPORT_XLSX_INVALIDO', 'Relación de hoja inválida');
  const target = texto(rel['@_Target']);
  const path = target.startsWith('/')
    ? target.slice(1)
    : posix.normalize(posix.join('xl', target));
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path))
    errorArchivo('IMPORT_XLSX_INVALIDO', 'Ruta interna de hoja inválida');
  const strings = files.has('xl/sharedStrings.xml')
    ? lista(objeto(xml(files.get('xl/sharedStrings.xml'))['sst'])['si']).map(
        textNode,
      )
    : [];
  const formats = new Map<string, string>();
  let styles: Record<string, unknown> = {};
  if (files.has('xl/styles.xml'))
    styles = objeto(xml(files.get('xl/styles.xml'))['styleSheet']);
  for (const f of lista(objeto(styles['numFmts'])['numFmt']).map(objeto))
    formats.set(texto(f['@_numFmtId']), texto(f['@_formatCode']));
  const xfs = lista(objeto(styles['cellXfs'])['xf']).map(objeto);
  const l = limitesImportacion();
  const rows = lista(objeto(xml(files.get(path))['worksheet'])['sheetData']);
  const raw = lista(objeto(rows[0])['row']).map(objeto);
  if (raw.length > l.maxFilas + 50)
    errorArchivo('IMPORT_LIMITE_FILAS', 'Demasiadas filas');
  const read = (r: Record<string, unknown>) => {
    const values: Record<number, string> = {};
    const issues: { col: number; code: string }[] = [];
    for (const c of lista(r['c']).map(objeto)) {
      const col = index(texto(c['@_r']));
      if (col >= l.maxColumnas)
        errorArchivo('IMPORT_LIMITE_COLUMNAS', 'Demasiadas columnas');
      const type = texto(c['@_t']);
      let value =
        type === 's'
          ? strings[Number(texto(c['v']))]
          : type === 'inlineStr'
            ? textNode(c['is'])
            : texto(c['v']);
      if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
      if (value === undefined)
        errorArchivo('IMPORT_XLSX_INVALIDO', 'String de celda inválido');
      if (c['f'] !== undefined) {
        issues.push({
          col,
          code:
            c['v'] === undefined
              ? 'FORMULA_SIN_CACHE'
              : 'FORMULA_VALOR_ALMACENADO',
        });
      }
      if (type === 'e') issues.push({ col, code: 'CELDA_ERROR_EXCEL' });
      const mask = formats.get(
        texto(xfs[Number(texto(c['@_s']))]?.['@_numFmtId']),
      );
      if (
        (type === '' || type === 'n') &&
        /^\d+$/.test(value) &&
        mask &&
        /^0+$/.test(mask)
      )
        value = value.padStart(mask.length, '0');
      if (value.length > l.maxCelda)
        errorArchivo('IMPORT_LIMITE_CELDA', 'Celda demasiado extensa');
      values[col] = value;
    }
    return { values, issues };
  };
  const h = raw.find((r) => Number(texto(r['@_r'])) === filaEncabezado);
  if (!h)
    errorArchivo('IMPORT_ENCABEZADO_INVALIDO', 'Fila encabezado no existe');
  const headers = read(h).values;
  const normalized = Object.values(headers).filter(Boolean).map(encabezado);
  if (new Set(normalized).size !== normalized.length)
    errorArchivo('IMPORT_ENCABEZADO_DUPLICADO', 'Encabezados duplicados');
  const filas: ParsedFile['filas'] = [];
  for (const r of raw) {
    const numeroFila = Number(texto(r['@_r']));
    if (!Number.isInteger(numeroFila) || numeroFila < 1)
      errorArchivo('IMPORT_XLSX_INVALIDO', 'Número de fila inválido');
    if (numeroFila <= filaEncabezado) continue;
    const { values, issues } = read(r);
    if (!Object.values(values).some((v) => v.trim())) continue;
    const valores: Record<string, string> = {};
    for (const [col, head] of Object.entries(headers))
      if (head)
        Object.defineProperty(valores, head, {
          value: values[Number(col)] ?? '',
          enumerable: true,
        });
    const advertencias: ImportIssue[] = issues
      .filter((i) => Boolean(headers[i.col]))
      .map((i) => ({
        fila: numeroFila,
        campo: headers[i.col]!,
        codigo: i.code,
        mensaje:
          i.code === 'FORMULA_VALOR_ALMACENADO'
            ? 'Se usa resultado almacenado; fórmula no ejecutada'
            : 'Celda Excel sin valor utilizable',
      }));
    filas.push({ numeroFila, valores, advertencias });
  }
  if (!filas.length) errorArchivo('IMPORT_SIN_FILAS', 'No hay filas');
  if (filas.length > l.maxFilas)
    errorArchivo('IMPORT_LIMITE_FILAS', 'Demasiadas filas');
  if (files.has('__external_ignored__'))
    filas[0]!.advertencias.push({
      fila: filas[0]!.numeroFila,
      campo: '',
      codigo: 'REFERENCIAS_EXTERNAS_IGNORADAS',
      mensaje: 'No se accede a referencias externas; solo valores almacenados',
    });
  return {
    encabezados: Object.values(headers).filter(Boolean),
    filas,
    hojas: names,
    hoja: hoja ?? names[0]!,
  };
}
