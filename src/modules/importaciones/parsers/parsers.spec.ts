import { csv } from './csv.js';
import { xlsx } from './xlsx.js';
import {
  decimalArchivo,
  opcionesPreview,
  columnaFiscal,
} from '../importaciones.util.js';
import { mapear } from '../importaciones.mapper.js';
import { limitesImportacion } from '../importaciones.config.js';
import {
  zipSintetico,
  xlsxSintetico,
} from '../../../../test/fixtures/importaciones-xlsx.js';
const read = (s: string) => csv(Buffer.from(s), 'utf-8');
describe('Importaciones CSV/mapping', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('UTF-8 BOM, acentos, comas y comillas escapadas', () => {
    const r = read('\uFEFFNombre,RFC\r\n"Clínica, ""Ñ""",FICTICIO\r\n');
    expect(r.filas[0]!.valores['Nombre']).toBe('Clínica, "Ñ"');
  });
  it('punto y coma y salto dentro de comillas', () => {
    const r = read('Nombre;RFC\n"Dos\nlíneas";A\nOtro;B');
    expect(r.filas[0]!.valores['Nombre']).toBe('Dos\nlíneas');
    expect(r.filas[1]!.numeroFila).toBe(4);
  });
  it('Windows-1252 explícito', () => {
    const r = csv(
      Buffer.from([78, 111, 109, 98, 114, 101, 10, 80, 101, 241, 97]),
      'windows-1252',
    );
    expect(r.filas[0]!.valores['Nombre']).toBe('Peña');
  });
  it('UTF-8 inválido no se destruye silenciosamente', () =>
    expect(() => csv(Buffer.from([78, 10, 241]), 'utf-8')).toThrow());
  it.each([
    '',
    '\u0000',
    'Nombre,RFC\n"Sin cierre,A',
    'Nombre,RFC\nA"B,C',
    'Nombre,RFC\n"A"x,C',
    'Nombre,Nombre\nA,B',
  ])('archivo inválido %s', (s) => expect(() => read(s)).toThrow());
  it.each(['Nombre,RFC\nA', 'Nombre,RFC\nA,B,C', 'Nombre,\nA,DATO'])(
    'anchura inválida clasificada por fila %s',
    (s) =>
      expect(
        read(s).filas[0]!.advertencias.some((i) => i.codigo.startsWith('CSV_')),
      ).toBe(true),
  );
  it('exportación con delimitador vacío extra y columnas finales omitidas', () => {
    expect(
      read('Nombre,RFC,,\nA,B,\nC,D,,,,').filas.every(
        (r) => r.advertencias.length === 0,
      ),
    ).toBe(true);
  });
  it('encabezados especiales se almacenan como propiedades propias seguras', () => {
    const r = read('__proto__,Precio\nSKU,1');
    expect(r.filas[0]!.valores['__proto__']).toBe('SKU');
  });
  it('columnas vacías exportadas solo si datos vacíos', () =>
    expect(read('Nombre,RFC,,\nA,B,,').filas).toHaveLength(1));
  it('máximo filas configurable', () => {
    vi.stubEnv('IMPORT_MAX_FILAS', '1');
    expect(() => read('Nombre\nA\nB')).toThrow();
  });
  it('límite celda', () =>
    expect(() => read('Nombre\n' + 'A'.repeat(10001))).toThrow());
  it('config inválida rechazada', () =>
    expect(() => limitesImportacion({ IMPORT_MAX_FILAS: '0' })).toThrow());
  it.each([
    ['160', '160.00'],
    ['$1,234.56', '1234.56'],
    ['135,50', '135.50'],
    ['0', '0.00'],
  ])('dinero %s exacto', (value, expected) =>
    expect(decimalArchivo(value)).toBe(expected),
  );
  it.each([
    '1,234',
    '1.234,56',
    '-1',
    'NaN',
    'Infinity',
    '1e3',
    '1.001',
    '1000000000001',
    '',
  ])('dinero inválido %s', (value) =>
    expect(() => decimalArchivo(value)).toThrow(),
  );
  it('normaliza Cliente, apóstrofe inicial y preserva interno', async () => {
    const rows = await mapear(
      'CLIENTES',
      read(
        "Nombre Comercial,RFC,Correo,Código Postal,Calle\nClínica O'Neil, fict01 ,PERSONA@EXAMPLE.INVALID,'00123,O'Neil",
      ),
      await opcionesPreview(),
    );
    expect(rows[0]!.datos).toMatchObject({
      nombre: "Clínica O'Neil",
      rfc: 'FICT01',
      email: 'persona@example.invalid',
      'domicilioFiscal.codigoPostal': '00123',
      'domicilioFiscal.calle': "O'Neil",
    });
    expect(rows[0]!.errores).toEqual([]);
    expect(
      rows[0]!.advertencias.some((a) => a.codigo === 'APOSTROFE_REMOVIDO'),
    ).toBe(true);
  });
  it('RFC repetido marca ambas filas, no nombre', async () => {
    const r = await mapear(
      'CLIENTES',
      read('Nombre,RFC\nUno,a\nDos,A'),
      await opcionesPreview(),
    );
    expect(
      r.every((x) =>
        x.errores.some((e) => e.codigo === 'RFC_DUPLICADO_ARCHIVO'),
      ),
    ).toBe(true);
  });
  it('email inválido por fila', async () => {
    const r = await mapear(
      'CLIENTES',
      read('Nombre,Email\nUno,invalido'),
      await opcionesPreview(),
    );
    expect(r[0]!.errores[0]!.codigo).toBe('CAMPO_INVALIDO');
  });
  it('aliases ambiguos no se eligen arbitrariamente', async () =>
    expect(
      mapear(
        'CLIENTES',
        read('Nombre,Email,Correo\nUno,a,b'),
        await opcionesPreview(),
      ),
    ).rejects.toThrow());
  it('SAT separado de SKU, nombre derivado y descripción completa', async () => {
    const text = 'Descripción ' + 'larga '.repeat(40);
    const r = await mapear(
      'PRODUCTOS',
      read(
        `Clave de Producto o Servicio,No. Identificación,Clave Unidad,Unidad,Descripción,Valor Unitario,Objeto de Impuesto\n42311512,hega1805,XBX,CAJA,${text},160,2`,
      ),
      await opcionesPreview(),
    );
    expect(r[0]!.datos).toMatchObject({
      sku: 'HEGA1805',
      claveProductoServicioSat: '42311512',
      precio: '160.00',
      objetoImpuestoSat: '2',
    });
    expect(r[0]!.datos['descripcion']).toBe(text.trim());
    expect(r[0]!.datos['nombre']!.length).toBe(200);
  });
  it('SKU vacío es error', async () => {
    const r = await mapear(
      'PRODUCTOS',
      read(
        'SKU,Clave Unidad,Unidad,Descripción,Precio Base\n,XBX,CAJA,Caja,160',
      ),
      await opcionesPreview(),
    );
    expect(r[0]!.errores.some((e) => e.codigo === 'SKU_REQUERIDO')).toBe(true);
  });
  it('descripción >500 no se trunca silenciosamente', async () => {
    const r = await mapear(
      'PRODUCTOS',
      read(
        'SKU,Clave Unidad,Unidad,Descripción,Precio Base\nP,XBX,CAJA,' +
          'A'.repeat(501) +
          ',160',
      ),
      await opcionesPreview(),
    );
    expect(r[0]!.errores.some((e) => e.campo === 'descripcion')).toBe(true);
  });
  it('opciones estrictas sin any ni campos desconocidos', async () => {
    await expect(opcionesPreview('{"inventado":true}')).rejects.toThrow();
    await expect(
      opcionesPreview('{"crearUnidadesFaltantes":"true"}'),
    ).rejects.toThrow();
  });
  it('precios requieren mapping y vigencia', async () =>
    expect(
      mapear('PRECIOS', read('SKU,Precio\nP,1'), await opcionesPreview()),
    ).rejects.toThrow());
  it('no permite precio con IVA', async () => {
    expect(columnaFiscal('Precio Privado')).toBe(false);
    expect(columnaFiscal('Precio_Publico_IVA')).toBe(true);
    expect(columnaFiscal('PrecioPublicoMasIVA')).toBe(true);
    await expect(
      mapear(
        'PRECIOS',
        read('SKU,Precio Público + IVA\nP,180'),
        await opcionesPreview(
          JSON.stringify({
            columnaIdentidad: 'SKU',
            columnasPrecios: [
              { columna: 'Precio Público + IVA', listaCodigo: 'PUBLICO' },
            ],
            vigenciaDesde: '2026-01-01T00:00:00Z',
          }),
        ),
      ),
    ).rejects.toThrow();
  });
});
describe('Importaciones XLSX acotado', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('lee XLSX sintético y datos textuales con ceros', async () => {
    const b = xlsxSintetico([
      {
        nombre: 'Precios',
        rows: [
          ['SKU', 'Precio'],
          [
            { value: '123', numeric: true, numericType: 'n', ceros: true },
            { value: '135.00', numeric: true },
          ],
        ],
      },
    ]);
    const r = await xlsx(b, undefined, 1);
    expect(r.filas[0]!.valores).toEqual({ SKU: '00123', Precio: '135.00' });
    expect(decimalArchivo('00123')).toBe('123.00');
  });
  it('múltiples hojas exige selección, nunca importa todas', async () => {
    const b = xlsxSintetico([
      { nombre: 'Uno', rows: [['SKU'], ['A']] },
      { nombre: 'Dos', rows: [['SKU'], ['B']] },
    ]);
    await expect(xlsx(b, undefined, 1)).rejects.toThrow();
    const r = await xlsx(b, 'Dos', 1);
    expect(r.hojas).toEqual(['Uno', 'Dos']);
    expect(r.filas[0]!.valores['SKU']).toBe('B');
  });
  it('usa valor almacenado de fórmula sin ejecutarla', async () => {
    const b = xlsxSintetico([
      {
        nombre: 'Hoja',
        rows: [
          ['SKU', 'Precio'],
          ['P', { value: '135.00', numeric: true, formula: '100+35' }],
        ],
      },
    ]);
    const r = await xlsx(b, undefined, 1);
    expect(r.filas[0]!.valores['Precio']).toBe('135.00');
    expect(r.filas[0]!.advertencias[0]!.codigo).toBe(
      'FORMULA_VALOR_ALMACENADO',
    );
  });
  it('fórmula sin cache señalada', async () => {
    const b = xlsxSintetico([
      {
        nombre: 'Hoja',
        rows: [
          ['SKU', 'Precio'],
          ['P', { value: '', numeric: true, formula: '1+1', sinCache: true }],
        ],
      },
    ]);
    const r = await xlsx(b, undefined, 1);
    expect(r.filas[0]!.advertencias[0]!.codigo).toBe('FORMULA_SIN_CACHE');
  });
  it('acentos y XML escapado', async () => {
    const r = await xlsx(
      xlsxSintetico([
        { nombre: 'Clínica', rows: [['Descripción'], ['Ñ & <Caja>']] },
      ]),
      undefined,
      1,
    );
    expect(r.hoja).toBe('Clínica');
    expect(r.filas[0]!.valores['Descripción']).toBe('Ñ & <Caja>');
  });
  it.each([
    ['xl/vbaProject.bin', 'macro'],
    ['../escape.xml', '<r/>'],
    ['xl/workbook.xml', '<!DOCTYPE x [<!ENTITY e "x">]><x/>'],
  ])('ZIP inseguro %s', async (name, content) =>
    expect(
      xlsx(zipSintetico([[name, content]]), undefined, 1),
    ).rejects.toThrow(),
  );
  it('referencia externa ignorada sin leer XML ni red', async () => {
    // Este XML externo ni siquiera es parseable: no forma parte de datos importables.
    const base = zipSintetico([
      [
        'xl/workbook.xml',
        '<workbook xmlns:r="x"><sheets><sheet name="P" r:id="r1"/></sheets></workbook>',
      ],
      [
        'xl/_rels/workbook.xml.rels',
        '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
      ],
      [
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>P</t></is></c></row></sheetData></worksheet>',
      ],
      ['xl/externalLinks/externalLink1.xml', '<!DOCTYPE peligrosonoaccedido>'],
    ]);
    const r = await xlsx(base, undefined, 1);
    expect(r.filas[0]!.advertencias[0]!.codigo).toBe(
      'REFERENCIAS_EXTERNAS_IGNORADAS',
    );
  });
  it('ZIP inválido rechazado', async () =>
    expect(xlsx(Buffer.from('PKinvalido'), undefined, 1)).rejects.toThrow());
  it('límite descomprimido', async () => {
    vi.stubEnv('IMPORT_MAX_EXPANDIDO_BYTES', '100');
    await expect(
      xlsx(
        zipSintetico([['xl/workbook.xml', 'A'.repeat(1000)]], true),
        undefined,
        1,
      ),
    ).rejects.toThrow();
  });
  it('nombre duplicado ZIP rechazado', async () =>
    expect(
      xlsx(
        zipSintetico([
          ['x.xml', '<x/>'],
          ['x.xml', '<y/>'],
        ]),
        undefined,
        1,
      ),
    ).rejects.toThrow());
});
