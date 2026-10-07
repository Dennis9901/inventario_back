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
import { VentasService } from './ventas.service.js';
import { CreateVentaDto } from './dto/create-venta.dto.js';
import { UpdateVentaDto } from './dto/update-venta.dto.js';
import { VentaQueryDto } from './dto/venta-query.dto.js';
import { SinCuerpoPipe } from '../../common/sin-cuerpo.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiModulo('Ventas', true)
@Controller('ventas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VentasController {
  constructor(private readonly service: VentasService) {}
  @ApiResultado('Venta', 200, 'paginado', 'Ventas: findAll')
  @Get()
  findAll(@Query() query: VentaQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado('VentaDetalle', 200, 'objeto', 'Ventas: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('VentaDetalle', 201, 'objeto', 'Ventas: create')
  @Auditar('VENTA_CREADA', 'VENTA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateVentaDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.create(dto, usuario.sub);
  }
  @ApiResultado('VentaDetalle', 200, 'objeto', 'Ventas: update')
  @Auditar('VENTA_MODIFICADA', 'VENTA')
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVentaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.update(id, dto, usuario.sub);
  }
  @ApiResultado('Deleted', 200, 'objeto', 'Ventas: remove')
  @Auditar('VENTA_ELIMINADA', 'VENTA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
  @ApiResultado('VentaDetalle', 201, 'objeto', 'Ventas: confirmar')
  @Auditar('VENTA_CONFIRMADA', 'VENTA')
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
    description: 'Acción sin body o con {}',
  })
  @Post(':id/confirmar')
  @Roles('ADMINISTRADOR')
  confirmar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new SinCuerpoPipe()) _body: unknown,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.confirmar(id, usuario.sub);
  }
  @ApiResultado('VentaDetalle', 201, 'objeto', 'Ventas: cancelar')
  @Auditar('VENTA_CANCELADA', 'VENTA')
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
    description: 'Acción sin body o con {}',
  })
  @Post(':id/cancelar')
  @Roles('ADMINISTRADOR')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new SinCuerpoPipe()) _body: unknown,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.cancelar(id, usuario.sub);
  }
}
