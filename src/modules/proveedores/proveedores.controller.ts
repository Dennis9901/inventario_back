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
import { ProveedoresService } from './proveedores.service.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { ProveedorQueryDto } from './dto/proveedor-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('proveedores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProveedoresController {
  constructor(private readonly service: ProveedoresService) {}
  @Get()
  findAll(@Query() query: ProveedorQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateProveedorDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, true);
  }
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, false);
  }
}
