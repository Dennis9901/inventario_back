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
import { DevolucionesCompraService } from './devoluciones-compra.service.js';
import { CreateDevolucionCompraDto } from './dto/create-devolucion-compra.dto.js';
import { DevolucionCompraQueryDto } from './dto/devolucion-query.dto.js';
import { SinCuerpoPipe } from '../../common/sin-cuerpo.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiModulo('Devoluciones', true)
@Controller('devoluciones/compras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevolucionesCompraController {
  constructor(private readonly service: DevolucionesCompraService) {}
  @ApiResultado('DevolucionCompra', 200, 'paginado', 'Devoluciones: findAll')
  @Get()
  findAll(@Query() query: DevolucionCompraQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado(
    'DisponibilidadCompra',
    200,
    'objeto',
    'Devoluciones: disponible',
  )
  @Get('disponible/:compraId')
  disponible(@Param('compraId', ParseIntPipe) id: number) {
    return this.service.disponible(id);
  }
  @ApiResultado(
    'DevolucionCompraDetalle',
    200,
    'objeto',
    'Devoluciones: findOne',
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @ApiResultado(
    'DevolucionCompraDetalle',
    201,
    'objeto',
    'Devoluciones: create',
  )
  @Auditar('DEVOLUCION_COMPRA_CREADA', 'DEVOLUCION_COMPRA')
  @Post()
  @Roles('ADMINISTRADOR')
  create(
    @Body() dto: CreateDevolucionCompraDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.create(dto, usuario.sub);
  }
  @ApiResultado(
    'DevolucionCompraDetalle',
    201,
    'objeto',
    'Devoluciones: procesar',
  )
  @Auditar('DEVOLUCION_COMPRA_PROCESADA', 'DEVOLUCION_COMPRA')
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
    'DevolucionCompraDetalle',
    201,
    'objeto',
    'Devoluciones: cancelar',
  )
  @Auditar('DEVOLUCION_COMPRA_CANCELADA', 'DEVOLUCION_COMPRA')
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
  @Auditar('DEVOLUCION_COMPRA_ELIMINADA', 'DEVOLUCION_COMPRA')
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
}
