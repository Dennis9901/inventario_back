import type { DatabaseTransaction } from '../../database/database.service.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { CreateProductoDto } from './dto/create-producto.dto.js';
import { UpdateProductoDto } from './dto/update-producto.dto.js';

export const normalizarTextoProducto = (value: string) =>
  value.trim().toUpperCase();
export interface CatalogoProductoImportado {
  sku: string;
  nombre: string;
  descripcion: string;
  precio: string;
  costo?: string;
  categoriaId: number;
  unidadMedidaId: number;
  unidadMedida: string;
  claveProductoServicioSat?: string;
  objetoImpuestoSat?: string;
}

@Injectable()
export class ProductosService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async validarUnidad(tx: DatabaseTransaction, id: number) {
    await tx.query(
      this.databaseService.db.raw
        .sql`SELECT id FROM public."unidadMedida" WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const unidad = await tx.orm.public.UnidadMedida.where({ id }).first();
    if (!unidad) throw new NotFoundException('La unidad de medida no existe');
    if (!unidad.activo)
      throw new ConflictException(
        'No se puede asignar una unidad de medida inactiva',
      );
  }

  async findAll() {
    return this.databaseService.db.orm.public.Producto.all();
  }

  async findOne(id: number) {
    const producto = await this.databaseService.db.orm.public.Producto.where({
      id,
    }).first();

    if (!producto) {
      throw new NotFoundException('El producto no existe');
    }

    return producto;
  }

  // Persistencia exacta para importación; referencias/estado se revalidan y
  // bloquean por batch antes de llegar aquí. Crear conserva Existencia = 0.
  async guardarImportadoEnTransaccion(
    tx: DatabaseTransaction,
    datos: CatalogoProductoImportado,
    id?: number,
  ) {
    const cambios = {
      ...datos,
      sku: normalizarTextoProducto(datos.sku),
      nombre: normalizarTextoProducto(datos.nombre),
      unidadMedida: normalizarTextoProducto(datos.unidadMedida),
    };
    if (id !== undefined)
      return tx.orm.public.Producto.where({ id }).update(cambios);
    if (datos.costo === undefined)
      throw new ConflictException(
        'Costo explícito requerido para producto nuevo',
      );
    const p = await tx.orm.public.Producto.create({
      ...cambios,
      costo: datos.costo,
      stockMinimo: 0,
      activo: true,
    });
    await tx.orm.public.Existencia.create({ productoId: p.id, cantidad: 0 });
    return p;
  }

  async create(createProductoDto: CreateProductoDto) {
    const sku = normalizarTextoProducto(createProductoDto.sku);

    const codigoBarras = createProductoDto.codigoBarras?.trim() || null;

    // 1. Validar categoría
    const categoria = await this.databaseService.db.orm.public.Categoria.where({
      id: createProductoDto.categoriaId,
    }).first();

    if (!categoria) {
      throw new NotFoundException('La categoría especificada no existe');
    }

    if (!categoria.activo) {
      throw new ConflictException('No se puede asignar una categoría inactiva');
    }

    // 2. Validar SKU
    const productoSku = await this.databaseService.db.orm.public.Producto.where(
      { sku },
    ).first();

    if (productoSku) {
      throw new ConflictException(`El SKU ${sku} ya se encuentra registrado`);
    }

    // 3. Validar código de barras
    if (codigoBarras) {
      const productoCodigo =
        await this.databaseService.db.orm.public.Producto.where({
          codigoBarras,
        }).first();

      if (productoCodigo) {
        throw new ConflictException(
          `El código de barras ${codigoBarras} ya se encuentra registrado`,
        );
      }
    }

    // 4. Crear
    return this.databaseService.transaction(async (tx) => {
      if (createProductoDto.unidadMedidaId !== undefined)
        await this.validarUnidad(tx, createProductoDto.unidadMedidaId);
      const producto = await tx.orm.public.Producto.create({
        sku,
        codigoBarras,
        ...(createProductoDto.unidadMedidaId !== undefined && {
          unidadMedidaId: createProductoDto.unidadMedidaId,
        }),
        claveProductoServicioSat:
          createProductoDto.claveProductoServicioSat?.trim() || null,
        objetoImpuestoSat: createProductoDto.objetoImpuestoSat?.trim() || null,

        nombre: normalizarTextoProducto(createProductoDto.nombre),

        descripcion: createProductoDto.descripcion?.trim() || null,

        costo: createProductoDto.costo.toFixed(2),
        precio: createProductoDto.precio.toFixed(2),
        stockMinimo: createProductoDto.stockMinimo,

        unidadMedida:
          createProductoDto.unidadMedida?.trim().toUpperCase() ?? 'PIEZA',

        categoriaId: createProductoDto.categoriaId,

        activo: true,
      });
      await tx.orm.public.Existencia.create({
        productoId: producto.id,
        cantidad: 0,
      });
      return producto;
    });
  }

  async update(id: number, updateProductoDto: UpdateProductoDto) {
    const producto = await this.findOne(id);

    let sku: string | undefined;
    let codigoBarras: string | null | undefined;

    // =========================================================
    // SKU
    // =========================================================
    if (updateProductoDto.sku !== undefined) {
      sku = normalizarTextoProducto(updateProductoDto.sku);

      const existente = await this.databaseService.db.orm.public.Producto.where(
        { sku },
      ).first();

      if (existente && existente.id !== producto.id) {
        throw new ConflictException(`El SKU ${sku} ya se encuentra registrado`);
      }
    }

    // =========================================================
    // CÓDIGO DE BARRAS
    // =========================================================
    if (updateProductoDto.codigoBarras !== undefined) {
      codigoBarras = updateProductoDto.codigoBarras.trim() || null;

      if (codigoBarras) {
        const existente =
          await this.databaseService.db.orm.public.Producto.where({
            codigoBarras,
          }).first();

        if (existente && existente.id !== producto.id) {
          throw new ConflictException(
            `El código de barras ${codigoBarras} ya se encuentra registrado`,
          );
        }
      }
    }

    // =========================================================
    // CATEGORÍA
    // =========================================================
    if (updateProductoDto.categoriaId !== undefined) {
      const categoria =
        await this.databaseService.db.orm.public.Categoria.where({
          id: updateProductoDto.categoriaId,
        }).first();

      if (!categoria) {
        throw new NotFoundException('La categoría especificada no existe');
      }

      if (!categoria.activo) {
        throw new ConflictException(
          'No se puede asignar una categoría inactiva',
        );
      }
    }

    // =========================================================
    // UPDATE
    // =========================================================
    const cambios = {
      ...(sku !== undefined && {
        sku,
      }),

      ...(codigoBarras !== undefined && {
        codigoBarras,
      }),

      ...(updateProductoDto.nombre !== undefined && {
        nombre: normalizarTextoProducto(updateProductoDto.nombre),
      }),

      ...(updateProductoDto.descripcion !== undefined && {
        descripcion: updateProductoDto.descripcion.trim() || null,
      }),

      ...(updateProductoDto.costo !== undefined && {
        costo: updateProductoDto.costo.toFixed(2),
      }),

      ...(updateProductoDto.precio !== undefined && {
        precio: updateProductoDto.precio.toFixed(2),
      }),

      ...(updateProductoDto.stockMinimo !== undefined && {
        stockMinimo: updateProductoDto.stockMinimo,
      }),

      ...(updateProductoDto.unidadMedida !== undefined && {
        unidadMedida: updateProductoDto.unidadMedida.trim().toUpperCase(),
      }),

      ...(updateProductoDto.categoriaId !== undefined && {
        categoriaId: updateProductoDto.categoriaId,
      }),
      ...(updateProductoDto.claveProductoServicioSat !== undefined && {
        claveProductoServicioSat:
          updateProductoDto.claveProductoServicioSat.trim() || null,
      }),
      ...(updateProductoDto.objetoImpuestoSat !== undefined && {
        objetoImpuestoSat: updateProductoDto.objetoImpuestoSat.trim() || null,
      }),
      ...(updateProductoDto.unidadMedidaId !== undefined && {
        unidadMedidaId: updateProductoDto.unidadMedidaId,
      }),
    };
    if (updateProductoDto.unidadMedidaId === undefined)
      return this.databaseService.db.orm.public.Producto.where({ id }).update(
        cambios,
      );
    return this.databaseService.transaction(async (tx) => {
      await this.databaseService.bloquearProducto(tx, id);
      const actual = await tx.orm.public.Producto.where({ id }).first();
      if (!actual) throw new NotFoundException('El producto no existe');
      // Conservar la referencia ya asignada permite editar metadata aunque la unidad se desactive.
      if (actual.unidadMedidaId !== updateProductoDto.unidadMedidaId)
        await this.validarUnidad(tx, updateProductoDto.unidadMedidaId!);
      return tx.orm.public.Producto.where({ id }).update(cambios);
    });
  }

  async desactivar(id: number) {
    const producto = await this.findOne(id);

    if (!producto.activo) {
      throw new ConflictException('El producto ya se encuentra inactivo');
    }

    return this.databaseService.db.orm.public.Producto.where({ id }).update({
      activo: false,
    });
  }

  async activar(id: number) {
    const producto = await this.findOne(id);

    if (producto.activo) {
      throw new ConflictException('El producto ya se encuentra activo');
    }

    return this.databaseService.db.orm.public.Producto.where({ id }).update({
      activo: true,
    });
  }

  async remove(id: number) {
    return this.databaseService.transaction(async (tx) => {
      await this.databaseService.bloquearProducto(tx, id);
      const producto = await tx.orm.public.Producto.where({ id }).first();
      if (!producto) throw new NotFoundException('El producto no existe');

      const movimiento = await tx.orm.public.MovimientoInventario.where({
        productoId: id,
      }).first();
      if (movimiento) {
        throw new ConflictException(
          'El producto tiene movimientos de inventario; utiliza la baja lógica',
        );
      }
      if (await tx.orm.public.DetalleCompra.where({ productoId: id }).first()) {
        throw new ConflictException(
          'El producto tiene compras; utiliza la baja lógica',
        );
      }
      if (await tx.orm.public.DetalleVenta.where({ productoId: id }).first()) {
        throw new ConflictException(
          'El producto tiene ventas; utiliza la baja lógica',
        );
      }
      const existencia = await tx.orm.public.Existencia.where({
        productoId: id,
      }).first();
      if (existencia && existencia.cantidad !== 0) {
        throw new ConflictException(
          'El producto tiene existencias; utiliza la baja lógica',
        );
      }
      await tx.orm.public.Existencia.where({ productoId: id }).delete();
      await tx.orm.public.Producto.where({ id }).delete();
      return {
        message: 'Producto eliminado definitivamente',
        producto: {
          id: producto.id,
          sku: producto.sku,
          nombre: producto.nombre,
        },
      };
    });
  }
}
