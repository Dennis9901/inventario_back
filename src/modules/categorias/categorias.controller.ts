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

@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Get()
  findAll() {
    return this.categoriasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.findOne(id);
  }

  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() createCategoriaDto: CreateCategoriaDto) {
    return this.categoriasService.create(createCategoriaDto);
  }

  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoriaDto: UpdateCategoriaDto,
  ) {
    return this.categoriasService.update(id, updateCategoriaDto);
  }

  // Eliminado lógico
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.desactivar(id);
  }

  // Reactivar
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.activar(id);
  }

  // Eliminado físico
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.remove(id);
  }
}
