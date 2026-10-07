import { camposInvalidos } from '../../common/http/validation.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClienteDto } from '../clientes/dto/create-cliente.dto.js';
import { UpdateProductoDto } from '../productos/dto/update-producto.dto.js';
import {
  encabezado,
  decimalArchivo,
  columnaFiscal,
  errorArchivo,
} from './importaciones.util.js';
import type { PreviewImportacionDto } from './dto/importaciones.dto.js';
import type {
  ImportIssue,
  NormalizedRow,
  ParsedFile,
  TipoImportacion,
} from './importaciones.types.js';
export const columnasClientes: Record<string, string[]> = {
  nombreComercial: ['Nombre Comercial', 'Nombre'],
  rfc: ['RFC'],
  razonSocial: ['Razón Social'],
  regimenFiscal: ['Régimen Fiscal'],
  numeroRegistroTributario: ['Número de Registro Tributario'],
  usoCfdi: ['Uso CFDI'],
  telefono: ['Teléfono'],
  celular: ['Celular'],
  email: ['E-Mail', 'Email', 'Correo'],
  emailAlterno: ['E-Mail Alterno', 'Email Alterno'],
  residenciaFiscal: ['Residencia Fiscal'],
  'domicilioFiscal.pais': ['País'],
  'domicilioFiscal.codigoPostal': [
    'Código Postal',
    'Domicilio fiscal(Código Postal)',
  ],
  'domicilioFiscal.estado': ['Estado'],
  'domicilioFiscal.municipio': ['Municipio'],
  'domicilioFiscal.localidad': ['Localidad'],
  'domicilioFiscal.colonia': ['Colonia'],
  'domicilioFiscal.calle': ['Calle'],
  'domicilioFiscal.numeroExterior': ['Número Exterior'],
  'domicilioFiscal.numeroInterior': ['Número Interior'],
  'domicilioFiscal.referencia': ['Referencia'],
};
export const columnasProductos: Record<string, string[]> = {
  sku: ['No. Identificación', 'SKU', 'No IDENTIFICACION'],
  claveProductoServicioSat: ['Clave de Producto o Servicio', 'CODIGO SAT'],
  unidadClave: ['Clave Unidad', 'UNIDAD DE MEDIDA SAT'],
  unidadNombre: ['Unidad', 'UNIDAD DE MEDIDA'],
  descripcion: ['Descripción'],
  precio: ['Valor Unitario', 'Precio Base'],
  objetoImpuestoSat: ['Objeto de Impuesto'],
  costo: ['Costo'],
};
function column(headers: string[], aliases: string[]) {
  const matches = headers.filter((h) =>
    aliases.some((a) => encabezado(a) === encabezado(h)),
  );
  if (matches.length > 1)
    errorArchivo(
      'IMPORT_MAPPING_AMBIGUO',
      'Dos columnas representan el mismo campo',
    );
  return matches[0];
}
function issue(
  fila: number,
  campo: string,
  codigo: string,
  mensaje: string,
): ImportIssue {
  return { fila, campo, codigo, mensaje };
}
export function clienteDto(datos: Record<string, string>): CreateClienteDto {
  const raw: Record<string, unknown> = {};
  const domicilio: Record<string, string> = {};
  for (const [k, v] of Object.entries(datos)) {
    if (k.startsWith('domicilioFiscal.')) domicilio[k.slice(16)] = v;
    else raw[k] = v;
  }
  if (Object.keys(domicilio).length) raw['domicilioFiscal'] = domicilio;
  return plainToInstance(CreateClienteDto, raw);
}
export async function mapear(
  tipo: TipoImportacion,
  file: ParsedFile,
  config: PreviewImportacionDto,
): Promise<NormalizedRow[]> {
  const aliases = tipo === 'CLIENTES' ? columnasClientes : columnasProductos;
  const mapping: Record<string, string> = {};
  if (tipo !== 'PRECIOS')
    for (const [field, names] of Object.entries(aliases)) {
      const c = column(file.encabezados, names);
      if (c) mapping[field] = c;
    }
  if (
    tipo === 'CLIENTES' &&
    !mapping['nombreComercial'] &&
    !mapping['razonSocial']
  )
    errorArchivo(
      'IMPORT_ENCABEZADO_FALTANTE',
      'Falta Nombre Comercial o Razón Social',
    );
  if (
    tipo === 'PRODUCTOS' &&
    (!mapping['sku'] ||
      !mapping['descripcion'] ||
      !mapping['precio'] ||
      !mapping['unidadClave'] ||
      !mapping['unidadNombre'])
  )
    errorArchivo(
      'IMPORT_ENCABEZADO_FALTANTE',
      'Faltan columnas obligatorias de productos',
    );
  if (tipo === 'PRECIOS') {
    if (!config.columnasPrecios?.length || !config.vigenciaDesde)
      errorArchivo(
        'IMPORT_MAPPING_REQUERIDO',
        'PRECIOS requiere columnasPrecios y vigenciaDesde',
      );
    const ids = config.mappingIdentidades ?? [];
    if (
      new Set(ids.map((i) => i.identificador.trim().toUpperCase())).size !==
      ids.length
    )
      errorArchivo(
        'IMPORT_MAPPING_AMBIGUO',
        'Identidades repetidas en mapping',
      );
    if (
      new Set(config.columnasPrecios.map((c) => c.listaCodigo)).size !==
      config.columnasPrecios.length
    )
      errorArchivo('IMPORT_MAPPING_AMBIGUO', 'Lista destino repetida');
    const id = column(file.encabezados, [config.columnaIdentidad]);
    if (!id)
      errorArchivo(
        'IMPORT_ENCABEZADO_FALTANTE',
        'No existe columna de identidad. Hoja sin SKU requiere cruce explícito y columnaIdentidad.',
      );
    mapping['sku'] = id;
    config.columnasPrecios.forEach((c, i) => {
      const col = column(file.encabezados, [c.columna]);
      if (!col)
        errorArchivo(
          'IMPORT_ENCABEZADO_FALTANTE',
          'No existe una columna de precio configurada',
        );
      if (columnaFiscal(col))
        errorArchivo(
          'IMPORT_PRECIO_CON_IVA',
          'No se permite mapear IVA/TOTAL como precio comercial',
        );
      mapping[`precio.${i}`] = col;
    });
  }
  const result: NormalizedRow[] = [];
  for (const raw of file.filas) {
    const datos: Record<string, string> = {};
    const errores: ImportIssue[] = [],
      advertencias: ImportIssue[] = [];
    for (const [k, col] of Object.entries(mapping)) {
      let value = (raw.valores[col] ?? '').trim();
      if (!value) continue;
      if (
        ((tipo === 'CLIENTES' &&
          /rfc|telefono|celular|codigoPostal|numeroExterior|numeroInterior|regimenFiscal|usoCfdi|numeroRegistroTributario/.test(
            k,
          )) ||
          k === 'sku' ||
          k === 'unidadClave' ||
          k === 'claveProductoServicioSat' ||
          k === 'objetoImpuestoSat') &&
        /^'[\d+]/.test(value)
      ) {
        value = value.slice(1);
        advertencias.push(
          issue(
            raw.numeroFila,
            k,
            'APOSTROFE_REMOVIDO',
            'Marcador inicial de texto retirado',
          ),
        );
      }
      if (
        k === 'rfc' ||
        k === 'sku' ||
        k === 'unidadClave' ||
        k === 'unidadNombre'
      )
        value = value.toUpperCase();
      if (k === 'email' || k === 'emailAlterno') value = value.toLowerCase();
      if (k === 'precio' || k === 'costo' || k.startsWith('precio.'))
        try {
          value = decimalArchivo(value);
        } catch {
          errores.push(
            issue(
              raw.numeroFila,
              k,
              'IMPORTE_INVALIDO',
              'Importe ambiguo, fuera de rango o inválido',
            ),
          );
        }
      datos[k] = value;
    }
    for (const i of raw.advertencias.filter(
      (i) => i.campo === '' || Object.values(mapping).includes(i.campo),
    )) {
      if (
        i.codigo.startsWith('CSV_') ||
        i.codigo === 'FORMULA_SIN_CACHE' ||
        i.codigo === 'CELDA_ERROR_EXCEL'
      )
        errores.push(i);
      else advertencias.push(i);
    }
    if (tipo === 'CLIENTES') {
      datos['nombre'] = datos['nombreComercial'] ?? datos['razonSocial'] ?? '';
      const errors = await validate(clienteDto(datos), {
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      });
      for (const e of camposInvalidos(errors))
        errores.push(
          issue(
            raw.numeroFila,
            e.field,
            'CAMPO_INVALIDO',
            'Campo incompatible con contrato Cliente',
          ),
        );
      if (!datos['rfc'])
        advertencias.push(
          issue(
            raw.numeroFila,
            'rfc',
            'IDENTIDAD_SIN_RFC',
            'Solo CREAR; nombre no se usa para identificar cliente existente',
          ),
        );
    } else if (tipo === 'PRODUCTOS') {
      const description = datos['descripcion'] ?? '';
      datos['nombre'] = description.slice(0, 200).toUpperCase();
      if (description.length > 200)
        advertencias.push(
          issue(
            raw.numeroFila,
            'nombre',
            'NOMBRE_DERIVADO',
            'Nombre derivado de primeros 200 caracteres; descripción completa conservada',
          ),
        );
      if (!datos['sku'])
        errores.push(
          issue(raw.numeroFila, 'sku', 'SKU_REQUERIDO', 'SKU vacío'),
        );
      if (!datos['unidadClave'] || !datos['unidadNombre'])
        errores.push(
          issue(
            raw.numeroFila,
            'unidad',
            'UNIDAD_REQUERIDA',
            'Clave y nombre de unidad requeridos',
          ),
        );
      const dto = plainToInstance(UpdateProductoDto, {
        sku: datos['sku'],
        nombre: datos['nombre'],
        descripcion: description,
        claveProductoServicioSat: datos['claveProductoServicioSat'],
        objetoImpuestoSat: datos['objetoImpuestoSat'],
        unidadMedida: datos['unidadNombre'],
      });
      for (const e of camposInvalidos(
        await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
          validationError: { target: false, value: false },
        }),
      ))
        errores.push(
          issue(
            raw.numeroFila,
            e.field,
            'CAMPO_INVALIDO',
            'Campo incompatible con contrato Producto',
          ),
        );
      if ((datos['unidadClave']?.length ?? 0) > 50)
        errores.push(
          issue(
            raw.numeroFila,
            'unidadClave',
            'CAMPO_INVALIDO',
            'Clave de unidad demasiado extensa',
          ),
        );
    } else {
      if (config.mappingIdentidades?.length) {
        const mapped = config.mappingIdentidades.find(
          (m) => m.identificador.trim().toUpperCase() === datos['sku'],
        );
        if (!mapped)
          errores.push(
            issue(
              raw.numeroFila,
              'sku',
              'IDENTIDAD_SIN_MAPPING',
              'Identificador sin cruce SKU explícito',
            ),
          );
        else datos['sku'] = mapped.sku.trim().toUpperCase();
      }
      if (!datos['sku'] || datos['sku'].length > 100)
        errores.push(
          issue(
            raw.numeroFila,
            'sku',
            'SKU_REQUERIDO',
            'SKU requerido y máximo 100 caracteres',
          ),
        );
      config.columnasPrecios!.forEach((_c, i) => {
        if (!datos[`precio.${i}`])
          errores.push(
            issue(
              raw.numeroFila,
              `precio.${i}`,
              'PRECIO_REQUERIDO',
              'Precio requerido para cada lista mapeada',
            ),
          );
      });
      if (file.encabezados.some((h) => columnaFiscal(h)))
        advertencias.push(
          issue(
            raw.numeroFila,
            'IVA',
            'IVA_IGNORADO',
            'IVA/TOTAL no se importan ni se infieren impuestos',
          ),
        );
    }
    result.push({
      numeroFila: raw.numeroFila,
      tipo,
      clave: datos[tipo === 'CLIENTES' ? 'rfc' : 'sku'] ?? '',
      datos,
      errores,
      advertencias,
    });
  }
  const repeated = new Map<string, NormalizedRow[]>();
  for (const r of result) {
    if (!r.clave) continue;
    const key = r.clave;
    const group = repeated.get(key) ?? [];
    group.push(r);
    repeated.set(key, group);
  }
  for (const group of repeated.values())
    if (group.length > 1)
      for (const r of group)
        r.errores.push(
          issue(
            r.numeroFila,
            tipo === 'CLIENTES' ? 'rfc' : 'sku',
            tipo === 'CLIENTES'
              ? 'RFC_DUPLICADO_ARCHIVO'
              : 'SKU_DUPLICADO_ARCHIVO',
            'Identidad repetida dentro del archivo',
          ),
        );
  if (tipo === 'PRODUCTOS') {
    const units = new Map<string, Set<string>>();
    for (const r of result) {
      const key = r.datos['unidadClave'] ?? '';
      const names = units.get(key) ?? new Set<string>();
      names.add(r.datos['unidadNombre'] ?? '');
      units.set(key, names);
    }
    for (const r of result)
      if ((units.get(r.datos['unidadClave'] ?? '')?.size ?? 0) > 1)
        r.errores.push(
          issue(
            r.numeroFila,
            'unidad',
            'UNIDAD_NOMBRE_CONFLICTO',
            'Una clave presenta nombres distintos en el archivo',
          ),
        );
  }
  return result;
}
