import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Auditar } from '../../common/http/auditar.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ListasPreciosService } from './listas-precios.service.js';
import {
  CreateListaPrecioDto,
  UpdateListaPrecioDto,
  ListaPrecioQueryDto,
  CreateProductoPrecioDto,
  UpdateProductoPrecioDto,
  ProductoPrecioQueryDto,
  ResolverPrecioQueryDto,
} from './dto/listas-precios.dto.js';
@ApiModulo('ListasPrecios', true)
@Controller('listas-precios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ListasPreciosController {
  constructor(private readonly service: ListasPreciosService) {}
  @Get()
  @ApiResultado('ListaPrecio', 200, 'paginado')
  findAll(@Query() q: ListaPrecioQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id')
  @ApiResultado('ListaPrecio')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_CREADA', 'LISTA_PRECIO')
  @ApiResultado('ListaPrecio', 201)
  create(@Body() dto: CreateListaPrecioDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_MODIFICADA', 'LISTA_PRECIO')
  @ApiResultado('ListaPrecio')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateListaPrecioDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_ELIMINADA', 'LISTA_PRECIO')
  @ApiResultado('Deleted')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_ACTIVAR', 'LISTA_PRECIO')
  @ApiResultado('ListaPrecio')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, true);
  }
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_DESACTIVAR', 'LISTA_PRECIO')
  @ApiResultado('ListaPrecio')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, false);
  }
  @Patch(':id/predeterminada')
  @Roles('ADMINISTRADOR')
  @Auditar('LISTA_PRECIO_PREDETERMINADA', 'LISTA_PRECIO')
  @ApiResultado('ListaPrecio')
  predeterminada(@Param('id', ParseIntPipe) id: number) {
    return this.service.predeterminada(id);
  }
  @Get(':id/productos')
  @ApiResultado('ProductoPrecio', 200, 'paginado')
  precios(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: ProductoPrecioQueryDto,
  ) {
    return this.service.precios(id, q);
  }
  @Get(':id/productos/:precioId')
  @ApiResultado('ProductoPrecio')
  precio(
    @Param('id', ParseIntPipe) id: number,
    @Param('precioId', ParseIntPipe) precioId: number,
  ) {
    return this.service.precioPorId(id, precioId);
  }
  @Post(':id/productos')
  @Roles('ADMINISTRADOR')
  @Auditar('PRODUCTO_PRECIO_VIGENCIA_CREADA', 'PRODUCTO_PRECIO')
  @ApiResultado('ProductoPrecio', 201)
  crearPrecio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductoPrecioDto,
  ) {
    return this.service.crearPrecio(id, dto);
  }
  @Patch(':id/productos/:precioId')
  @Roles('ADMINISTRADOR')
  @Auditar('PRODUCTO_PRECIO_VIGENCIA_CERRADA', 'PRODUCTO_PRECIO')
  @ApiResultado('ProductoPrecio')
  cerrarPrecio(
    @Param('id', ParseIntPipe) id: number,
    @Param('precioId', ParseIntPipe) precioId: number,
    @Body() dto: UpdateProductoPrecioDto,
  ) {
    return this.service.cerrarPrecio(id, precioId, dto);
  }
}
@ApiModulo('Productos', true)
@Controller('productos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrecioProductoController {
  constructor(private readonly service: ListasPreciosService) {}
  @Get(':productoId/precio')
  @ApiResultado(
    'PrecioResuelto',
    200,
    'objeto',
    'Precio actual UTC; fallback Producto.precio si falta vigencia; sin lista usa precio base',
  )
  resolver(
    @Param('productoId', ParseIntPipe) id: number,
    @Query() q: ResolverPrecioQueryDto,
  ) {
    return this.service.resolverPrecio(id, q.listaPrecioId);
  }
}
