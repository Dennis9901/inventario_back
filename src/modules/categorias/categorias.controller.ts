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

import { CategoriasService } from './categorias.service.js';
import { CreateCategoriaDto } from './dto/create-categoria.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UpdateCategoriaDto } from './dto/update-categoria.dto.js';

@ApiModulo('Categorias', true)
@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @ApiResultado('Categoria', 200, 'array', 'Categorias: findAll')
  @Get()
  findAll() {
    return this.categoriasService.findAll();
  }

  @ApiResultado('Categoria', 200, 'objeto', 'Categorias: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.findOne(id);
  }

  @ApiResultado('Categoria', 201, 'objeto', 'Categorias: create')
  @Auditar('CATEGORIA_CREADA', 'CATEGORIA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() createCategoriaDto: CreateCategoriaDto) {
    return this.categoriasService.create(createCategoriaDto);
  }

  @ApiResultado('Categoria', 200, 'objeto', 'Categorias: update')
  @Auditar('CATEGORIA_MODIFICADA', 'CATEGORIA')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoriaDto: UpdateCategoriaDto,
  ) {
    return this.categoriasService.update(id, updateCategoriaDto);
  }

  // Eliminado lógico
  @ApiResultado('Categoria', 200, 'objeto', 'Categorias: desactivar')
  @Auditar('CATEGORIA_DESACTIVADA', 'CATEGORIA')
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.desactivar(id);
  }

  // Reactivar
  @ApiResultado('Categoria', 200, 'objeto', 'Categorias: activar')
  @Auditar('CATEGORIA_ACTIVADA', 'CATEGORIA')
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.activar(id);
  }

  // Eliminado físico
  @ApiResultado('Deleted', 200, 'objeto', 'Categorias: remove')
  @Auditar('CATEGORIA_ELIMINADA', 'CATEGORIA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.remove(id);
  }
}
