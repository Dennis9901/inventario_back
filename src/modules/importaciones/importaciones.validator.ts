import { or } from '@prisma/orm-postgres/orm-client';
import type {
  DatabaseService,
  DatabaseTransaction,
} from '../../database/database.service.js';
import type { ClientesService } from '../clientes/clientes.service.js';
import type { PreviewImportacionDto } from './dto/importaciones.dto.js';
import type {
  ImportIssue,
  ImportPlan,
  NormalizedRow,
  ValidatedRow,
} from './importaciones.types.js';
import { clienteDto } from './importaciones.mapper.js';
import { hash, objeto, decimalArchivo } from './importaciones.util.js';

export async function cargarContexto(
  db: DatabaseService,
  tx: DatabaseTransaction,
  rows: NormalizedRow[],
  config: PreviewImportacionDto,
) {
  const keys = [...new Set(rows.map((r) => r.clave).filter(Boolean))];
  const tipo = rows[0]!.tipo;
  const idsClientes =
    tipo === 'CLIENTES'
      ? await tx.query(
          db.db.raw
            .sql`SELECT id FROM public.cliente WHERE upper(btrim(rfc)) IN (SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb)) ORDER BY id`
            .returnsRow({ id: 'pg/int4@1' })
            .build(),
        )
      : [];
  const clientes =
    tipo === 'CLIENTES'
      ? await tx.orm.public.Cliente.include('domicilioFiscal')
          .where((c) => c.id.in(idsClientes.map((c) => c.id)))
          .orderBy((c) => c.id.asc())
          .all()
      : [];
  const productos =
    tipo !== 'CLIENTES'
      ? await tx.orm.public.Producto.where((p) => p.sku.in(keys))
          .orderBy((p) => p.id.asc())
          .all()
      : [];
  const unidades =
    tipo === 'PRODUCTOS'
      ? await tx.orm.public.UnidadMedida.where((u) =>
          or(
            u.clave.in([
              ...new Set(rows.map((r) => r.datos['unidadClave'] ?? '')),
            ]),
            u.id.in(
              productos
                .map((p) => p.unidadMedidaId)
                .filter((id): id is number => id !== null),
            ),
          ),
        )
          .orderBy((u) => u.id.asc())
          .all()
      : [];
  const catIds = [
    ...new Set([
      ...productos.map((p) => p.categoriaId),
      ...(config.categoriaId !== undefined ? [config.categoriaId] : []),
    ]),
  ];
  const categorias =
    tipo === 'PRODUCTOS'
      ? await tx.orm.public.Categoria.where((c) => c.id.in(catIds))
          .orderBy((c) => c.id.asc())
          .all()
      : [];
  const listas =
    tipo === 'PRECIOS'
      ? await tx.orm.public.ListaPrecio.where((l) =>
          l.codigo.in(config.columnasPrecios!.map((c) => c.listaCodigo)),
        )
          .orderBy((l) => l.id.asc())
          .all()
      : [];
  const precios =
    tipo === 'PRECIOS'
      ? await tx.orm.public.ProductoPrecio.where((p) =>
          p.productoId.in(productos.map((p) => p.id)),
        )
          .where((p) => p.listaPrecioId.in(listas.map((l) => l.id)))
          .where({ activo: true })
          .orderBy((p) => p.id.asc())
          .all()
      : [];
  return { clientes, productos, unidades, categorias, listas, precios };
}
export type ImportContext = Awaited<ReturnType<typeof cargarContexto>>;
export async function bloquearContexto(
  db: DatabaseService,
  tx: DatabaseTransaction,
  rows: NormalizedRow[],
  config: PreviewImportacionDto,
) {
  const keys = JSON.stringify([
    ...new Set(rows.map((r) => r.clave).filter(Boolean)),
  ]);
  if (rows[0]!.tipo === 'CLIENTES') {
    await tx.query(
      db.db.raw
        .sql`SELECT id FROM public.cliente WHERE upper(btrim(rfc)) IN (SELECT jsonb_array_elements_text(${keys}::jsonb)) ORDER BY id FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    await tx.query(
      db.db.raw
        .sql`SELECT d.id FROM public."domicilioCliente" d JOIN public.cliente c ON c.id=d."clienteId" WHERE upper(btrim(c.rfc)) IN (SELECT jsonb_array_elements_text(${keys}::jsonb)) ORDER BY d.id FOR UPDATE OF d`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
  } else {
    await tx.query(
      db.db.raw
        .sql`SELECT id FROM public.producto WHERE sku IN (SELECT jsonb_array_elements_text(${keys}::jsonb)) ORDER BY id FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    if (rows[0]!.tipo === 'PRODUCTOS') {
      const units = JSON.stringify([
        ...new Set(rows.map((r) => r.datos['unidadClave'] ?? '')),
      ]);
      await tx.query(
        db.db.raw
          .sql`SELECT id FROM public."unidadMedida" WHERE clave IN (SELECT jsonb_array_elements_text(${units}::jsonb)) ORDER BY id FOR UPDATE`
          .returnsRow({ id: 'pg/int4@1' })
          .build(),
      );
      const cat = config.categoriaId ?? 0;
      await tx.query(
        db.db.raw
          .sql`SELECT id FROM public.categoria WHERE id=${cat} OR id IN (SELECT "categoriaId" FROM public.producto WHERE sku IN (SELECT jsonb_array_elements_text(${keys}::jsonb))) ORDER BY id FOR UPDATE`
          .returnsRow({ id: 'pg/int4@1' })
          .build(),
      );
    } else {
      const codes = JSON.stringify(
        config.columnasPrecios!.map((c) => c.listaCodigo),
      );
      await tx.query(
        db.db.raw
          .sql`SELECT id FROM public."listaPrecio" WHERE codigo IN (SELECT jsonb_array_elements_text(${codes}::jsonb)) ORDER BY id FOR UPDATE`
          .returnsRow({ id: 'pg/int4@1' })
          .build(),
      );
      await tx.query(
        db.db.raw
          .sql`SELECT pp.id FROM public."productoPrecio" pp JOIN public.producto p ON p.id=pp."productoId" JOIN public."listaPrecio" l ON l.id=pp."listaPrecioId" WHERE p.sku IN (SELECT jsonb_array_elements_text(${keys}::jsonb)) AND l.codigo IN (SELECT jsonb_array_elements_text(${codes}::jsonb)) ORDER BY pp.id FOR UPDATE OF pp`
          .returnsRow({ id: 'pg/int4@1' })
          .build(),
      );
    }
  }
}
function flatten(v: unknown, prefix = ''): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(objeto(v))) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object')
      Object.assign(out, flatten(value, path));
    else if (typeof value === 'string' || value === null) out[path] = value;
  }
  return out;
}
function error(
  r: NormalizedRow,
  campo: string,
  codigo: string,
  mensaje: string,
): ImportIssue {
  return { fila: r.numeroFila, campo, codigo, mensaje };
}
export function validarBatch(
  rows: NormalizedRow[],
  config: PreviewImportacionDto,
  ctx: ImportContext,
  clientesService: ClientesService,
): ValidatedRow[] {
  const clientes = new Map(
      ctx.clientes.map((c) => [c.rfc?.trim().toUpperCase() ?? null, c]),
    ),
    productos = new Map(ctx.productos.map((p) => [p.sku, p])),
    unidades = new Map(ctx.unidades.map((u) => [u.clave, u])),
    categorias = new Map(ctx.categorias.map((c) => [c.id, c])),
    listas = new Map(ctx.listas.map((l) => [l.codigo, l]));
  return rows.map((source) => {
    const r = {
      ...source,
      datos: { ...source.datos },
      errores: [...source.errores],
      advertencias: [...source.advertencias],
    };
    const plan: ImportPlan = {
      accion: 'CREAR',
      existenteId: null,
      fingerprint: '',
      cambios: [],
      precios: [],
    };
    let actual: Record<string, string | null> = {};
    let esperado: Record<string, string> = {};
    let version: unknown = null;
    if (r.tipo === 'CLIENTES') {
      const c = r.clave ? clientes.get(r.clave) : undefined;
      const coincidencias = ctx.clientes.filter(
        (x) => x.rfc?.trim().toUpperCase() === r.clave,
      );
      plan.existenteId = c?.id ?? null;
      version = coincidencias.length > 1 ? coincidencias : (c ?? null);
      if (coincidencias.length > 1)
        r.errores.push(
          error(
            r,
            'rfc',
            'RFC_CONFLICTO_BD',
            'Varias identidades equivalentes en BD; requiere revisión explícita',
          ),
        );

      if (c && !c.activo)
        r.errores.push(
          error(r, 'rfc', 'CLIENTE_INACTIVO', 'Cliente existente inactivo'),
        );
      const dto = clienteDto(r.datos);
      esperado = Object.fromEntries(
        Object.entries(clientesService.normalizar(dto)).filter(
          (e): e is [string, string] => typeof e[1] === 'string',
        ),
      );
      if (dto.domicilioFiscal)
        Object.assign(
          esperado,
          flatten(dto.domicilioFiscal, 'domicilioFiscal'),
        );
      if (c) actual = flatten(c);
    } else if (r.tipo === 'PRODUCTOS') {
      const p = productos.get(r.clave),
        u = unidades.get(r.datos['unidadClave'] ?? '');
      const cat = categorias.get(config.categoriaId ?? p?.categoriaId ?? 0);
      plan.existenteId = p?.id ?? null;
      version = { p: p ?? null, u: u ?? null, cat: cat ?? null };
      if (p && !p.activo)
        r.errores.push(
          error(r, 'sku', 'PRODUCTO_INACTIVO', 'Producto existente inactivo'),
        );
      if (!cat?.activo)
        r.errores.push(
          error(
            r,
            'categoriaId',
            'CATEGORIA_INVALIDA',
            'Requiere categoría existente activa',
          ),
        );
      if (u && !u.activo)
        r.errores.push(
          error(r, 'unidad', 'UNIDAD_INACTIVA', 'Unidad inactiva'),
        );
      if (u && u.nombre.trim().toUpperCase() !== r.datos['unidadNombre'])
        r.errores.push(
          error(
            r,
            'unidad',
            'UNIDAD_NOMBRE_CONFLICTO',
            'Nombre de unidad difiere del catálogo',
          ),
        );
      if (!u && !config.crearUnidadesFaltantes)
        r.errores.push(
          error(
            r,
            'unidad',
            'UNIDAD_NO_EXISTE',
            'Unidad no existe; creación explícita requerida',
          ),
        );
      if (!u && config.crearUnidadesFaltantes)
        r.advertencias.push(
          error(
            r,
            'unidad',
            'UNIDAD_A_CREAR',
            'Unidad se creará dentro del batch',
          ),
        );
      if (!p && !r.datos['costo']) {
        if (config.costoNuevos !== undefined)
          try {
            r.datos['costo'] = decimalArchivo(config.costoNuevos);
          } catch {
            r.errores.push(
              error(r, 'costo', 'COSTO_INVALIDO', 'Costo configurado inválido'),
            );
          }
        else
          r.errores.push(
            error(
              r,
              'costo',
              'COSTO_REQUERIDO',
              'Producto nuevo requiere costo explícito',
            ),
          );
      }
      if (!r.datos['precio'] && !p)
        r.errores.push(
          error(
            r,
            'precio',
            'PRECIO_REQUERIDO',
            'Producto nuevo requiere precio base',
          ),
        );
      esperado = {
        sku: r.datos['sku'] ?? '',
        nombre: r.datos['nombre'] ?? '',
        descripcion: r.datos['descripcion'] ?? '',
        unidadMedida: r.datos['unidadNombre'] ?? '',
        categoriaId: String(cat?.id ?? 0),
        unidadClave: r.datos['unidadClave'] ?? '',
        ...(r.datos['precio'] && { precio: r.datos['precio'] }),
        ...(r.datos['costo'] && { costo: r.datos['costo'] }),
        ...(r.datos['claveProductoServicioSat'] && {
          claveProductoServicioSat: r.datos['claveProductoServicioSat'],
        }),
        ...(r.datos['objetoImpuestoSat'] && {
          objetoImpuestoSat: r.datos['objetoImpuestoSat'],
        }),
      };
      if (p) {
        actual = {
          ...flatten(p),
          categoriaId: String(p.categoriaId),
          unidadClave:
            ctx.unidades.find((x) => x.id === p.unidadMedidaId)?.clave ?? null,
        };
      }
    } else {
      const p = productos.get(r.clave);
      plan.existenteId = p?.id ?? null;
      if (!p)
        r.errores.push(
          error(r, 'sku', 'PRODUCTO_NO_EXISTE', 'Producto no existe'),
        );
      else if (!p.activo)
        r.errores.push(
          error(r, 'sku', 'PRODUCTO_INACTIVO', 'Producto inactivo'),
        );
      const state: unknown[] = [];
      config.columnasPrecios!.forEach((col, i) => {
        const l = listas.get(col.listaCodigo);
        const precios =
          p && l
            ? ctx.precios.filter(
                (pp) => pp.productoId === p.id && pp.listaPrecioId === l.id,
              )
            : [];
        state.push({ lista: l ?? null, precios });
        if (!l && !config.crearListasFaltantes)
          r.errores.push(
            error(r, col.columna, 'LISTA_NO_EXISTE', 'Lista destino no existe'),
          );
        if (!l && config.crearListasFaltantes)
          r.advertencias.push(
            error(
              r,
              col.columna,
              'LISTA_A_CREAR',
              'Lista activa no predeterminada se creará en el batch',
            ),
          );
        if (l && !l.activo)
          r.errores.push(
            error(r, col.columna, 'LISTA_INACTIVA', 'Lista destino inactiva'),
          );
        const desde = config.vigenciaDesde!,
          hasta = config.vigenciaHasta ?? null;
        const overlaps = precios.filter(
          (pp) =>
            new Date(pp.vigenciaDesde).toISOString() <
              (hasta ?? '9999-12-31T23:59:59.999Z') &&
            (!pp.vigenciaHasta ||
              new Date(pp.vigenciaHasta).toISOString() > desde),
        );
        const previous = overlaps[0];
        let accion: ImportPlan['accion'] = 'CREAR';
        let anteriorId: number | null = null;
        if (previous) {
          const oldStart = new Date(previous.vigenciaDesde).toISOString(),
            oldEnd = previous.vigenciaHasta
              ? new Date(previous.vigenciaHasta).toISOString()
              : null;
          if (
            overlaps.length === 1 &&
            decimalArchivo(previous.precio) === r.datos[`precio.${i}`] &&
            oldStart <= desde &&
            (!oldEnd || (hasta !== null && oldEnd >= hasta))
          )
            accion = 'SIN_CAMBIOS';
          else if (
            overlaps.length === 1 &&
            oldStart < desde &&
            (!oldEnd || oldEnd > desde) &&
            desde > new Date().toISOString()
          ) {
            accion = 'CERRAR_Y_CREAR';
            anteriorId = previous.id;
          } else {
            accion = 'CONFLICTO';
            r.errores.push(
              error(
                r,
                col.columna,
                'VIGENCIA_CONFLICTO',
                'Solapamiento o corte no futuro; no se modifica historia',
              ),
            );
          }
        }
        plan.precios.push({
          codigo: col.listaCodigo,
          precio: r.datos[`precio.${i}`] ?? '',
          accion,
          anteriorId,
        });
        if (accion !== 'SIN_CAMBIOS')
          plan.cambios.push({
            campo: col.listaCodigo,
            anterior: previous?.precio ?? null,
            nuevo: r.datos[`precio.${i}`] ?? '',
          });
      });
      plan.accion = plan.precios.every((p) => p.accion === 'SIN_CAMBIOS')
        ? 'SIN_CAMBIOS'
        : plan.precios.some((p) => p.accion === 'CERRAR_Y_CREAR')
          ? 'CERRAR_Y_CREAR'
          : 'CREAR';
      version = { producto: p ?? null, listas: state };
    }
    if (r.tipo !== 'PRECIOS') {
      for (const [campo, nuevo] of Object.entries(esperado)) {
        const old = actual[campo] ?? null;
        if (old !== nuevo) plan.cambios.push({ campo, anterior: old, nuevo });
      }
      plan.accion =
        plan.existenteId !== null
          ? plan.cambios.length
            ? 'ACTUALIZAR'
            : 'SIN_CAMBIOS'
          : 'CREAR';
    }
    if (plan.accion === 'SIN_CAMBIOS')
      r.advertencias.push(
        error(r, '', 'SIN_CAMBIOS', 'No requiere escritura comercial'),
      );
    plan.fingerprint = hash(JSON.stringify(version));
    if (r.errores.length) plan.accion = 'CONFLICTO';
    return {
      ...r,
      plan,
      estado: r.errores.length
        ? 'ERROR'
        : r.advertencias.length
          ? 'ADVERTENCIA'
          : 'VALIDA',
    };
  });
}
