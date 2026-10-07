import { deflateRawSync } from 'node:zlib';
export function zipSintetico(
  entries: [string, string][],
  deflate = false,
): Buffer {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name),
      raw = Buffer.from(text),
      data = deflate ? deflateRawSync(raw) : raw;
    let crc = 0xffffffff;
    for (const byte of raw) {
      crc ^= byte;
      for (let j = 0; j < 8; j++)
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(filename.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(
    central.reduce((n, b) => n + b.length, 0),
    12,
  );
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
export interface CeldaSintetica {
  value: string;
  numeric?: boolean;
  numericType?: 'n' | 'b';
  formula?: string;
  sinCache?: boolean;
  ceros?: boolean;
}
export interface HojaSintetica {
  nombre: string;
  rows: (string | CeldaSintetica)[][];
}
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function xlsxSintetico(hojas: HojaSintetica[]): Buffer {
  const entries: [string, string][] = [
    [
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ],
    [
      'xl/workbook.xml',
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${escape(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<Relationships>${hojas.map((_h, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ],
    [
      'xl/styles.xml',
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    ],
  ];
  hojas.forEach((h, i) =>
    entries.push([
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet><sheetData>${h.rows
        .map(
          (row, r) =>
            `<row r="${r + 1}">${row
              .map((v, c) => {
                const cell: CeldaSintetica =
                  typeof v === 'string' ? { value: v } : v;
                const ref = String.fromCharCode(65 + c) + (r + 1);
                return `<c r="${ref}"${cell.numeric ? (cell.numericType ? ` t="${cell.numericType}"` : '') : ' t="inlineStr"'}${cell.ceros ? ' s="1"' : ''}>${cell.formula ? `<f>${escape(cell.formula)}</f>` : ''}${cell.sinCache ? '' : cell.numeric ? `<v>${escape(cell.value)}</v>` : `<is><t>${escape(cell.value)}</t></is>`}</c>`;
              })
              .join('')}</row>`,
        )
        .join('')}</sheetData></worksheet>`,
    ]),
  );
  return zipSintetico(entries, true);
}
