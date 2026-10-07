import { Auditar } from '../../common/http/auditar.decorator.js';
import { ApiBody } from '@nestjs/swagger';
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

@ApiModulo('Compras', true)
@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComprasController {
  constructor(private readonly service: ComprasService) {}
  @ApiResultado('Compra', 200, 'paginado', 'Compras: findAll')
  @Get()
  findAll(@Query() query: CompraQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado('CompraDetalle', 200, 'objeto', 'Compras: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('CompraDetalle', 201, 'objeto', 'Compras: create')
  @Auditar('COMPRA_CREADA', 'COMPRA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateCompraDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.create(dto, usuario.sub);
  }
  @ApiResultado('CompraDetalle', 200, 'objeto', 'Compras: update')
  @Auditar('COMPRA_MODIFICADA', 'COMPRA')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.update(id, dto, usuario.sub);
  }
  @ApiResultado('Deleted', 200, 'objeto', 'Compras: remove')
  @Auditar('COMPRA_ELIMINADA', 'COMPRA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
  @ApiResultado('CompraDetalle', 201, 'objeto', 'Compras: recibir')
  @Auditar('COMPRA_RECIBIDA', 'COMPRA')
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
    description: 'Acción sin body o con {}',
  })
  @Post(':id/recibir')
  @Roles('ADMINISTRADOR')
  recibir(
    @Param('id', ParseIntPipe) id: number,
    @Body() _body: AccionCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.recibir(id, usuario.sub);
  }
  @ApiResultado('CompraDetalle', 201, 'objeto', 'Compras: cancelar')
  @Auditar('COMPRA_CANCELADA', 'COMPRA')
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
    description: 'Acción sin body o con {}',
  })
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
