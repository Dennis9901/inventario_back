import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { CreateProductoDto } from './dto/create-producto.dto.js';
import { UpdateProductoDto } from './dto/update-producto.dto.js';

@Injectable()
export class ProductosService {
  constructor(private readonly databaseService: DatabaseService) {}

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

  async create(createProductoDto: CreateProductoDto) {
    const sku = createProductoDto.sku.trim().toUpperCase();

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
    return this.databaseService.db.transaction(async (tx) => {
      const producto = await tx.orm.public.Producto.create({
        sku,
        codigoBarras,

        nombre: createProductoDto.nombre.trim().toUpperCase(),

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
      sku = updateProductoDto.sku.trim().toUpperCase();

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
    return this.databaseService.db.orm.public.Producto.where({ id }).update({
      ...(sku !== undefined && {
        sku,
      }),

      ...(codigoBarras !== undefined && {
        codigoBarras,
      }),

      ...(updateProductoDto.nombre !== undefined && {
        nombre: updateProductoDto.nombre.trim().toUpperCase(),
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
    return this.databaseService.db.transaction(async (tx) => {
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
