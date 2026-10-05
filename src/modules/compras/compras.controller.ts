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
import { ComprasService } from './compras.service.js';
import { CreateCompraDto } from './dto/create-compra.dto.js';
import { UpdateCompraDto } from './dto/update-compra.dto.js';
import { CompraQueryDto } from './dto/compra-query.dto.js';
import { AccionCompraDto } from './dto/accion-compra.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComprasController {
  constructor(private readonly service: ComprasService) {}
  @Get()
  findAll(@Query() query: CompraQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateCompraDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.create(dto, usuario.sub);
  }
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.update(id, dto, usuario.sub);
  }
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
  @Post(':id/recibir')
  @Roles('ADMINISTRADOR')
  recibir(
    @Param('id', ParseIntPipe) id: number,
    @Body() _body: AccionCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.recibir(id, usuario.sub);
  }
  @Post(':id/cancelar')
  @Roles('ADMINISTRADOR')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() _body: AccionCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.cancelar(id, usuario.sub);
  }
}
