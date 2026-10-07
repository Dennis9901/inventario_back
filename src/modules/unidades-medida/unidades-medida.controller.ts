import {
  CreateUnidadMedidaDto,
  UpdateUnidadMedidaDto,
} from './dto/unidad-medida.dto.js';
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
import { UnidadesMedidaService } from './unidades-medida.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiModulo('UnidadesMedida', true)
@Controller('unidades-medida')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UnidadesMedidaController {
  constructor(private readonly service: UnidadesMedidaService) {}
  @ApiResultado('UnidadMedida', 200, 'array', 'UnidadesMedida: findAll')
  @Get()
  findAll() {
    return this.service.findAll();
  }
  @ApiResultado('UnidadMedida', 200, 'objeto', 'UnidadesMedida: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('UnidadMedida', 201, 'objeto', 'UnidadesMedida: create')
  @Auditar('UNIDAD_MEDIDA_CREADO', 'UNIDAD_MEDIDA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateUnidadMedidaDto) {
    return this.service.create(dto);
  }
  @ApiResultado('UnidadMedida', 200, 'objeto', 'UnidadesMedida: update')
  @Auditar('UNIDAD_MEDIDA_MODIFICADO', 'UNIDAD_MEDIDA')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
  ) {
    return this.service.update(id, dto);
  }
  @ApiResultado('Deleted', 200, 'objeto', 'UnidadesMedida: remove')
  @Auditar('UNIDAD_MEDIDA_ELIMINADO', 'UNIDAD_MEDIDA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @ApiResultado('UnidadMedida', 200, 'objeto', 'UnidadesMedida: activar')
  @Auditar('UNIDAD_MEDIDA_ACTIVADO', 'UNIDAD_MEDIDA')
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, true);
  }
  @ApiResultado('UnidadMedida', 200, 'objeto', 'UnidadesMedida: desactivar')
  @Auditar('UNIDAD_MEDIDA_DESACTIVADO', 'UNIDAD_MEDIDA')
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, false);
  }
}
