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

@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly service: ClientesService) {}
  @Get()
  findAll(@Query() query: ClienteQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateClienteDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
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
