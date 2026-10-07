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
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevolucionesVentaService } from './devoluciones-venta.service.js';
import { CreateDevolucionVentaDto } from './dto/create-devolucion-venta.dto.js';
import { DevolucionVentaQueryDto } from './dto/devolucion-query.dto.js';
import { SinCuerpoPipe } from '../../common/sin-cuerpo.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiModulo('Devoluciones', true)
@Controller('devoluciones/ventas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevolucionesVentaController {
  constructor(private readonly service: DevolucionesVentaService) {}
  @ApiResultado('DevolucionVenta', 200, 'paginado', 'Devoluciones: findAll')
  @Get()
  findAll(@Query() query: DevolucionVentaQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado(
    'DisponibilidadVenta',
    200,
    'objeto',
    'Devoluciones: disponible',
  )
  @Get('disponible/:ventaId')
  disponible(@Param('ventaId', ParseIntPipe) id: number) {
    return this.service.disponible(id);
  }
  @ApiResultado(
    'DevolucionVentaDetalle',
    200,
    'objeto',
    'Devoluciones: findOne',
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado('DevolucionVentaDetalle', 201, 'objeto', 'Devoluciones: create')
  @Auditar('DEVOLUCION_VENTA_CREADA', 'DEVOLUCION_VENTA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(
    @Body() dto: CreateDevolucionVentaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.create(dto, usuario.sub);
  }
  @ApiResultado(
    'DevolucionVentaDetalle',
    201,
    'objeto',
    'Devoluciones: procesar',
  )
  @Auditar('DEVOLUCION_VENTA_PROCESADA', 'DEVOLUCION_VENTA')
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
    description: 'Acción sin body o con {}',
  })
  @Post(':id/procesar')
  @Roles('ADMINISTRADOR')
  procesar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new SinCuerpoPipe()) _body: unknown,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.procesar(id, usuario.sub);
  }
  @ApiResultado(
    'DevolucionVentaDetalle',
    201,
    'objeto',
    'Devoluciones: cancelar',
  )
  @Auditar('DEVOLUCION_VENTA_CANCELADA', 'DEVOLUCION_VENTA')
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
  @ApiResultado('Deleted', 200, 'objeto', 'Devoluciones: remove')
  @Auditar('DEVOLUCION_VENTA_ELIMINADA', 'DEVOLUCION_VENTA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
}
