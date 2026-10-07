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
import { ClientesService } from './clientes.service.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import { ClienteQueryDto } from './dto/cliente-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiModulo('Clientes', true)
@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly service: ClientesService) {}
  @ApiResultado('Cliente', 200, 'paginado', 'Clientes: findAll')
  @Get()
  findAll(@Query() query: ClienteQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado('Cliente', 200, 'objeto', 'Clientes: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('Cliente', 201, 'objeto', 'Clientes: create')
  @Auditar('CLIENTE_CREADO', 'CLIENTE')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateClienteDto) {
    return this.service.create(dto);
  }
  @ApiResultado('Cliente', 200, 'objeto', 'Clientes: update')
  @Auditar('CLIENTE_MODIFICADO', 'CLIENTE')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.service.update(id, dto);
  }
  @ApiResultado('Deleted', 200, 'objeto', 'Clientes: remove')
  @Auditar('CLIENTE_ELIMINADO', 'CLIENTE')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @ApiResultado('Cliente', 200, 'objeto', 'Clientes: activar')
  @Auditar('CLIENTE_ACTIVADO', 'CLIENTE')
  @Patch(':id/activar')
  @Roles('ADMINISTRADOR')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, true);
  }
  @ApiResultado('Cliente', 200, 'objeto', 'Clientes: desactivar')
  @Auditar('CLIENTE_DESACTIVADO', 'CLIENTE')
  @Patch(':id/desactivar')
  @Roles('ADMINISTRADOR')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarActivo(id, false);
  }
}
