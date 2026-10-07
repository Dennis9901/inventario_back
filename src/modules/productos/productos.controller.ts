import { Auditar } from '../../common/http/auditar.decorator.js';
import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ProductosService } from './productos.service.js';
import { CreateProductoDto } from './dto/create-producto.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UpdateProductoDto } from './dto/update-producto.dto.js';

@ApiModulo('Productos', true)
@Controller('productos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @ApiResultado('Producto', 200, 'array', 'Productos: findAll')
  @Get()
  findAll() {
    return this.productosService.findAll();
  }

  @ApiResultado('Producto', 200, 'objeto', 'Productos: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @ApiResultado('Producto', 201, 'objeto', 'Productos: create')
  @Auditar('PRODUCTO_CREADO', 'PRODUCTO')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() createProductoDto: CreateProductoDto) {
    return this.productosService.create(createProductoDto);
  }

  @ApiResultado('Producto', 200, 'objeto', 'Productos: update')
  @Auditar('PRODUCTO_MODIFICADO', 'PRODUCTO')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductoDto: UpdateProductoDto,
  ) {
    return this.productosService.update(id, updateProductoDto);
  }

  @ApiResultado('Producto', 200, 'objeto', 'Productos: desactivar')
  @Auditar('PRODUCTO_DESACTIVADO', 'PRODUCTO')
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.desactivar(id);
  }

  @ApiResultado('Producto', 200, 'objeto', 'Productos: activar')
  @Auditar('PRODUCTO_ACTIVADO', 'PRODUCTO')
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.activar(id);
  }

  @ApiResultado('Deleted', 200, 'objeto', 'Productos: remove')
  @Auditar('PRODUCTO_ELIMINADO', 'PRODUCTO')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.remove(id);
  }
}
