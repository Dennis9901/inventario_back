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

@ApiModulo('Proveedores', true)
@Controller('proveedores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProveedoresController {
  constructor(private readonly service: ProveedoresService) {}
  @ApiResultado('Proveedor', 200, 'paginado', 'Proveedores: findAll')
  @Get()
  findAll(@Query() query: ProveedorQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado('Proveedor', 200, 'objeto', 'Proveedores: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('Proveedor', 201, 'objeto', 'Proveedores: create')
  @Auditar('PROVEEDOR_CREADO', 'PROVEEDOR')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateProveedorDto) {
    return this.service.create(dto);
  }
  @ApiResultado('Proveedor', 200, 'objeto', 'Proveedores: update')
  @Auditar('PROVEEDOR_MODIFICADO', 'PROVEEDOR')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.service.update(id, dto);
  }
  @ApiResultado('Deleted', 200, 'objeto', 'Proveedores: remove')
  @Auditar('PROVEEDOR_ELIMINADO', 'PROVEEDOR')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @ApiResultado('Proveedor', 200, 'objeto', 'Proveedores: activar')
  @Auditar('PROVEEDOR_ACTIVADO', 'PROVEEDOR')
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, true);
  }
  @ApiResultado('Proveedor', 200, 'objeto', 'Proveedores: desactivar')
  @Auditar('PROVEEDOR_DESACTIVADO', 'PROVEEDOR')
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, false);
  }
}
