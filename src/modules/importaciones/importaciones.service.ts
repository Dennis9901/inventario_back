import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../../database/database.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { ProductosService } from '../productos/productos.service.js';
import { ListasPreciosService } from '../listas-precios/listas-precios.service.js';
import { validarId, patronBusqueda } from '../../common/consulta.js';
import { tieneSqlState } from '../../common/errores-db.js';
import { requestContext } from '../../common/http/request-context.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  ConfirmarImportacionDto,
  ImportacionQueryDto,
  ImportacionFilaQueryDto,
  type PreviewImportacionDto,
} from './dto/importaciones.dto.js';
import {
  hash,
  opcionesPreview,
  objeto,
  lista,
  errorArchivo,
} from './importaciones.util.js';
import { limitesImportacion } from './importaciones.config.js';
import { csv } from './parsers/csv.js';
import { xlsx } from './parsers/xlsx.js';
import { mapear, clienteDto } from './importaciones.mapper.js';
import {
  cargarContexto,
  bloquearContexto,
  validarBatch,
  type ImportContext,
} from './importaciones.validator.js';
import type {
  ImportIssue,
  NormalizedRow,
  TipoImportacion,
  UploadedImportFile,
  ValidatedRow,
} from './importaciones.types.js';
import type { Models } from '../../prisma/contract.js';

type Importacion = Omit<Models.public_Importacion, 'filas' | 'usuario'>;
type ImportacionFila = Omit<Models.public_ImportacionFila, 'importacion'>;
function issues(value: unknown): ImportIssue[] {
  return lista(value).map((v) => {
    const r = objeto(v);
    if (
      typeof r['fila'] !== 'number' ||
      typeof r['campo'] !== 'string' ||
      typeof r['codigo'] !== 'string' ||
      typeof r['mensaje'] !== 'string'
    )
      throw new Error('Plan persistido inválido');
    return {
      fila: r['fila'],
      campo: r['campo'],
      codigo: r['codigo'],
      mensaje: r['mensaje'],
    };
  });
}
function sourceFromStored(
  f: ImportacionFila,
  tipo: TipoImportacion,
): NormalizedRow {
  const raw: unknown = JSON.parse(f.datosNormalizados);
  const r = objeto(raw),
    datos = objeto(r['datos']);
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(datos)) {
    if (typeof value !== 'string') throw new Error('Plan persistido inválido');
    strings[key] = value;
  }
  return {
    numeroFila: f.numeroFila,
    tipo,
    clave: f.clave,
    datos: strings,
    errores: issues(r['errores']),
    advertencias: issues(r['advertencias']),
  };
}
function planHash(rows: ValidatedRow[], config: PreviewImportacionDto) {
  return hash(
    JSON.stringify({
      config,
      filas: rows.map((r) => ({
        numeroFila: r.numeroFila,
        datos: r.datos,
        plan: r.plan,
        errores: r.errores,
        advertencias: r.advertencias,
      })),
    }),
  );
}
@Injectable()
export class ImportacionesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly clientes: ClientesService,
    private readonly productos: ProductosService,
    private readonly precios: ListasPreciosService,
  ) {}
  private publicImport(i: Importacion) {
    return {
      id: i.id,
      importacionId: i.id,
      tipo: i.tipo,
      estado: i.estado,
      nombreArchivo: i.nombreArchivo,
      hashArchivo: i.hashArchivo,
      totalFilas: i.totalFilas,
      filasValidas: i.filasValidas,
      filasAdvertencia: i.filasAdvertencia,
      filasError: i.filasError,
      puedeConfirmar:
        i.estado === 'PREVIEW' &&
        i.filasError === 0 &&
        Date.now() - Date.parse(i.createdAt) <
          limitesImportacion().maxPreviewHoras * 3600000,
      hojas: JSON.parse(i.hojas) as unknown,
      usuarioId: i.usuarioId,
      createdAt: i.createdAt,
      confirmedAt: i.confirmedAt,
      completedAt: i.completedAt,
      failedAt: i.failedAt,
      errorCodigo: i.errorCodigo,
    };
  }
  private async cargar(id: number, tx?: DatabaseTransaction) {
    validarId(id);
    const i = await (tx?.orm ?? this.database.db.orm).public.Importacion.where({
      id,
    }).first();
    if (!i) throw new NotFoundException('La importación no existe');
    return i;
  }
  async findOne(id: number) {
    return this.publicImport(await this.cargar(id));
  }
  async findAll(q = new ImportacionQueryDto()) {
    let c = this.database.db.orm.public.Importacion;
    if (q.tipo) c = c.where({ tipo: q.tipo });
    if (q.estado) c = c.where({ estado: q.estado });
    const [data, n] = await Promise.all([
      c
        .orderBy((i) => i.id.desc())
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .all(),
      c.aggregate((a) => ({ n: a.count() })),
    ]);
    return {
      data: data.map((i) => this.publicImport(i)),
      pagination: paginacion(q, n.n),
    };
  }
  async filas(id: number, q = new ImportacionFilaQueryDto()) {
    const i = await this.cargar(id);
    let c = this.database.db.orm.public.ImportacionFila.where({
      importacionId: id,
    });
    if (q.estado) c = c.where({ estado: q.estado });
    if (q.search) c = c.where((f) => f.clave.ilike(patronBusqueda(q.search!)));
    const [data, n] = await Promise.all([
      c
        .orderBy((f) => f.numeroFila.asc())
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .all(),
      c.aggregate((a) => ({ n: a.count() })),
    ]);
    return {
      data: data.map((f) => ({
        id: f.id,
        numeroFila: f.numeroFila,
        clave: f.clave,
        datosNormalizados: sourceFromStored(f, i.tipo).datos,
        estado: f.estado,
        plan: JSON.parse(f.plan) as unknown,
        errores: JSON.parse(f.errores) as unknown,
        advertencias: JSON.parse(f.advertencias) as unknown,
        resultado: f.resultado ? (JSON.parse(f.resultado) as unknown) : null,
      })),
      pagination: paginacion(q, n.n),
    };
  }
  async preview(
    tipo: TipoImportacion,
    file: UploadedImportFile | undefined,
    rawOptions: string | undefined,
    usuarioId: number,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
      errorArchivo('IMPORT_ARCHIVO_REQUERIDO', 'Archivo no vacío requerido');
    const l = limitesImportacion();
    if (file.size !== file.buffer.length || file.size > l.maxBytes)
      errorArchivo(
        'IMPORT_ARCHIVO_GRANDE',
        'Archivo excede el tamaño permitido',
      );
    const filename =
      file.originalname.replaceAll('\\', '/').split('/').at(-1) ?? '';
    if (
      !filename ||
      filename.length > 120 ||
      filename.split('').some((c) => c.charCodeAt(0) < 32)
    )
      errorArchivo('IMPORT_NOMBRE_INVALIDO', 'Nombre de archivo inválido');
    const extension = filename.toLowerCase().split('.').at(-1);
    const esXlsx = extension === 'xlsx';
    if (extension !== 'csv' && (!esXlsx || tipo !== 'PRECIOS'))
      errorArchivo(
        'IMPORT_FORMATO_INVALIDO',
        'Clientes/productos CSV; precios CSV o XLSX',
      );
    const mimeCsv = [
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
    ];
    if (
      esXlsx
        ? file.mimetype !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : !mimeCsv.includes(file.mimetype)
    )
      errorArchivo('IMPORT_MIME_INVALIDO', 'MIME incompatible con formato');
    if (
      esXlsx
        ? file.buffer.length < 4 || file.buffer.readUInt16LE(0) !== 0x4b50
        : file.buffer
            .subarray(0, 4)
            .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    )
      errorArchivo(
        'IMPORT_ARCHIVO_INVALIDO',
        'Contenido incompatible con formato',
      );
    const config = await opcionesPreview(rawOptions);
    const parsed = esXlsx
      ? await xlsx(file.buffer, config.hoja, config.filaEncabezado)
      : csv(file.buffer, config.encoding, config.filaEncabezado);
    const rows = await mapear(tipo, parsed, config),
      digest = hash(file.buffer);
    try {
      return await this.database.transaction(async (tx) => {
        const usuario = await tx.orm.public.Usuario.where({
          id: usuarioId,
          activo: true,
        }).first();
        if (!usuario)
          throw new ConflictException('Usuario autenticado inactivo');
        const duplicate = await tx.orm.public.Importacion.where({
          tipo,
          hashArchivo: digest,
        })
          .where((i) => i.estado.in(['PREVIEW', 'PROCESANDO', 'COMPLETADA']))
          .first();
        if (duplicate)
          throw new ConflictException({
            code: 'IMPORT_ARCHIVO_DUPLICADO',
            message:
              'Archivo ya registrado; consulta la importación existente o cancela su PREVIEW',
            importacionId: duplicate.id,
          });
        await this.precios.bloquearConfiguracion(tx);
        const ctx = await cargarContexto(this.database, tx, rows, config),
          validated = validarBatch(rows, config, ctx, this.clientes);
        const i = await tx.orm.public.Importacion.create({
          tipo,
          nombreArchivo: filename,
          hashArchivo: digest,
          hashPlan: planHash(validated, config),
          configuracion: JSON.stringify(config),
          hojas: JSON.stringify(parsed.hojas),
          usuarioId,
          totalFilas: rows.length,
          filasValidas: validated.filter((r) => r.estado === 'VALIDA').length,
          filasAdvertencia: validated.filter((r) => r.estado === 'ADVERTENCIA')
            .length,
          filasError: validated.filter((r) => r.estado === 'ERROR').length,
        });
        for (let n = 0; n < rows.length; n++) {
          const row = validated[n]!,
            source = rows[n]!;
          await tx.orm.public.ImportacionFila.create({
            importacionId: i.id,
            numeroFila: row.numeroFila,
            clave: row.clave,
            datosNormalizados: JSON.stringify({
              datos: source.datos,
              errores: source.errores,
              advertencias: source.advertencias,
            }),
            plan: JSON.stringify(row.plan),
            estado: row.estado,
            errores: JSON.stringify(row.errores),
            advertencias: JSON.stringify(row.advertencias),
          });
        }
        return this.publicImport(i);
      });
    } catch (e: unknown) {
      if (tieneSqlState(e, '23505'))
        throw new ConflictException({
          code: 'IMPORT_ARCHIVO_DUPLICADO',
          message: 'Otro preview registró el mismo archivo',
        });
      throw e;
    }
  }
  private async bloquear(id: number, tx: DatabaseTransaction) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.importacion WHERE id=${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    return this.cargar(id, tx);
  }
  cancelar(id: number) {
    return this.database.transaction(async (tx) => {
      const i = await this.bloquear(id, tx);
      if (i.estado !== 'PREVIEW')
        throw new ConflictException(
          'Solo se cancela PREVIEW; no deshace negocio',
        );
      await tx.orm.public.Importacion.where({ id }).update({
        estado: 'CANCELADA',
      });
      return this.publicImport(await this.cargar(id, tx));
    });
  }
  private async aplicar(
    tx: DatabaseTransaction,
    rows: ValidatedRow[],
    config: PreviewImportacionDto,
    ctx: ImportContext,
    ids: Map<number, ImportacionFila>,
  ) {
    const nuevasUnidades = new Set<number>(),
      nuevasListas = new Set<number>();
    const units = new Map(ctx.unidades.map((u) => [u.clave, u])),
      lists = new Map(ctx.listas.map((l) => [l.codigo, l]));
    // Referencias faltantes explícitamente autorizadas se crean una vez y en este commit.
    if (rows[0]!.tipo === 'PRODUCTOS')
      for (const r of rows) {
        const clave = r.datos['unidadClave']!;
        if (!units.has(clave)) {
          const u = await tx.orm.public.UnidadMedida.create({
            clave,
            nombre: r.datos['unidadNombre']!,
            activo: true,
          });
          units.set(clave, u);
          nuevasUnidades.add(u.id);
        }
      }
    if (rows[0]!.tipo === 'PRECIOS')
      for (const c of config.columnasPrecios!) {
        if (!lists.has(c.listaCodigo)) {
          const l = await tx.orm.public.ListaPrecio.create({
            codigo: c.listaCodigo,
            nombre: c.listaCodigo,
            activo: true,
            esPredeterminada: false,
          });
          lists.set(c.listaCodigo, l);
          nuevasListas.add(l.id);
        }
      }
    for (const r of rows) {
      const resultados: { entidad: string; id: number; accion: string }[] = [];
      if (r.plan.accion === 'SIN_CAMBIOS') {
        if (r.plan.existenteId !== null)
          resultados.push({
            entidad: r.tipo === 'CLIENTES' ? 'CLIENTE' : 'PRODUCTO',
            id: r.plan.existenteId,
            accion: 'SIN_CAMBIOS',
          });
      } else if (r.tipo === 'CLIENTES') {
        const existing = ctx.clientes.find((c) => c.id === r.plan.existenteId);
        const c = await this.clientes.guardarImportadoEnTransaccion(
          tx,
          clienteDto(r.datos),
          r.plan.existenteId ?? undefined,
          Boolean(existing?.domicilioFiscal),
        );
        resultados.push({
          entidad: 'CLIENTE',
          id: c.id,
          accion: r.plan.accion,
        });
      } else if (r.tipo === 'PRODUCTOS') {
        const existing = ctx.productos.find((p) => p.id === r.plan.existenteId),
          unit = units.get(r.datos['unidadClave']!)!;
        const p = await this.productos.guardarImportadoEnTransaccion(
          tx,
          {
            sku: r.clave,
            nombre: r.datos['nombre']!,
            descripcion: r.datos['descripcion']!,
            precio: r.datos['precio'] ?? existing!.precio,
            ...(r.datos['costo'] !== undefined && { costo: r.datos['costo'] }),
            categoriaId: config.categoriaId ?? existing!.categoriaId,
            unidadMedidaId: unit.id,
            unidadMedida: unit.nombre,
            ...(r.datos['claveProductoServicioSat'] && {
              claveProductoServicioSat: r.datos['claveProductoServicioSat'],
            }),
            ...(r.datos['objetoImpuestoSat'] && {
              objetoImpuestoSat: r.datos['objetoImpuestoSat'],
            }),
          },
          r.plan.existenteId ?? undefined,
        );
        if (!p) throw new Error('Producto desapareció durante confirmación');
        resultados.push({
          entidad: 'PRODUCTO',
          id: p.id,
          accion: r.plan.accion,
        });
      } else {
        for (const price of r.plan.precios) {
          if (price.accion === 'SIN_CAMBIOS') continue;
          const pp = await this.precios.aplicarVigenciaImportada(
            tx,
            {
              productoId: r.plan.existenteId!,
              listaPrecioId: lists.get(price.codigo)!.id,
              precio: price.precio,
              vigenciaDesde: config.vigenciaDesde!,
              vigenciaHasta: config.vigenciaHasta ?? null,
            },
            price.anteriorId,
          );
          resultados.push({
            entidad: 'PRODUCTO_PRECIO',
            id: pp.id,
            accion: price.accion,
          });
        }
      }
      if (r.tipo === 'PRODUCTOS') {
        const unidad = units.get(r.datos['unidadClave']!);
        if (unidad && nuevasUnidades.has(unidad.id))
          resultados.push({
            entidad: 'UNIDAD_MEDIDA',
            id: unidad.id,
            accion: 'CREAR_REFERENCIA',
          });
      }
      if (r.tipo === 'PRECIOS')
        for (const price of r.plan.precios) {
          const lista = lists.get(price.codigo);
          if (lista && nuevasListas.has(lista.id))
            resultados.push({
              entidad: 'LISTA_PRECIO',
              id: lista.id,
              accion: 'CREAR_REFERENCIA',
            });
        }
      await tx.orm.public.ImportacionFila.where({
        id: ids.get(r.numeroFila)!.id,
      }).update({ resultado: JSON.stringify(resultados) });
    }
  }
  async confirmar(id: number, dto: ConfirmarImportacionDto) {
    let started = false;
    try {
      return await this.database.transaction(async (tx) => {
        const i = await this.bloquear(id, tx);
        if (i.estado !== 'PREVIEW')
          throw new ConflictException('La importación ya no está en PREVIEW');
        if (i.hashArchivo !== dto.hashArchivo)
          throw new ConflictException({
            code: 'IMPORT_HASH_NO_COINCIDE',
            message: 'Hash distinto al preview',
          });
        if (i.filasError)
          throw new ConflictException({
            code: 'IMPORT_FILAS_ERROR',
            message: 'Corrige todas las filas ERROR antes de confirmar',
          });
        if (
          Date.now() - Date.parse(i.createdAt) >=
          limitesImportacion().maxPreviewHoras * 3600000
        )
          throw new ConflictException({
            code: 'IMPORT_PREVIEW_EXPIRADO',
            message: 'Preview expirado; cancela y genera otro',
          });
        const config = await opcionesPreview(i.configuracion);
        if (
          i.tipo === 'PRECIOS' &&
          (!dto.vigenciaDesde ||
            new Date(dto.vigenciaDesde).toISOString() !==
              config.vigenciaDesde ||
            (dto.vigenciaHasta
              ? new Date(dto.vigenciaHasta).toISOString()
              : null) !== (config.vigenciaHasta ?? null))
        )
          throw new ConflictException({
            code: 'IMPORT_VIGENCIA_NO_COINCIDE',
            message: 'Confirmación debe repetir vigencia del preview',
          });
        const stored = await tx.orm.public.ImportacionFila.where({
          importacionId: id,
        })
          .orderBy((f) => f.numeroFila.asc())
          .all();
        const source = stored.map((f) => sourceFromStored(f, i.tipo));
        await this.precios.bloquearConfiguracion(tx, true);
        await bloquearContexto(this.database, tx, source, config);
        const ctx = await cargarContexto(this.database, tx, source, config),
          validated = validarBatch(source, config, ctx, this.clientes);
        if (
          validated.some((r) => r.estado === 'ERROR') ||
          planHash(validated, config) !== i.hashPlan
        )
          throw new ConflictException({
            code: 'IMPORT_PREVIEW_OBSOLETO',
            message: 'La realidad cambió; cancela y genera otro preview',
          });
        if (
          validated.some((r) => r.plan.accion === 'ACTUALIZAR') &&
          !dto.autorizarActualizaciones
        )
          throw new ConflictException({
            code: 'IMPORT_UPDATE_NO_AUTORIZADO',
            message: 'Se requiere autorizarActualizaciones explícito',
          });
        if (
          validated.some((r) =>
            r.plan.precios.some((p) => p.accion === 'CERRAR_Y_CREAR'),
          ) &&
          !dto.autorizarCierreVigencias
        )
          throw new ConflictException({
            code: 'IMPORT_CIERRE_NO_AUTORIZADO',
            message: 'Se requiere autorizarCierreVigencias explícito',
          });
        started = true;
        await tx.orm.public.Importacion.where({ id }).update({
          estado: 'PROCESANDO',
          confirmedAt: new Date().toISOString(),
        });
        await this.aplicar(
          tx,
          validated,
          config,
          ctx,
          new Map(stored.map((f) => [f.numeroFila, f])),
        );
        await tx.orm.public.Importacion.where({ id }).update({
          estado: 'COMPLETADA',
          completedAt: new Date().toISOString(),
        });
        return this.publicImport(await this.cargar(id, tx));
      });
    } catch (e: unknown) {
      if (started) {
        const context = requestContext.getStore();
        if (context)
          context.auditoria = {
            accion: 'IMPORTACION_FALLIDA',
            entidad: 'IMPORTACION',
          };
        await this.database.transaction(async (tx) => {
          const i = await this.bloquear(id, tx);
          if (i.estado === 'PREVIEW')
            await tx.orm.public.Importacion.where({ id }).update({
              estado: 'FALLIDA',
              failedAt: new Date().toISOString(),
              errorCodigo: 'IMPORT_CONFIRM_ROLLBACK',
            });
          return this.publicImport(await this.cargar(id, tx));
        });
        throw new ConflictException({
          code: 'IMPORT_CONFIRM_ROLLBACK',
          message:
            'Confirmación revertida íntegramente; consulta la importación FALLIDA',
        });
      }
      if (e instanceof BadRequestException)
        throw new ConflictException({
          code: 'IMPORT_PLAN_INVALIDO',
          message: 'Plan persistido incompatible; genera otro preview',
        });
      throw e;
    }
  }
}
