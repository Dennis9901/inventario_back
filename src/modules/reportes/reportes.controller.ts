import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ReportesService } from './reportes.service.js';
import {
  ReporteVentasQueryDto,
  ReporteComprasQueryDto,
  ReporteUtilidadQueryDto,
  ReporteInventarioQueryDto,
  ReporteKardexQueryDto,
} from './dto/reportes-query.dto.js';

@ApiModulo('Reportes', true)
@Controller('reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @ApiResultado('ReporteVenta', 200, 'paginado', 'Reportes: ventas')
  @Get('ventas')
  ventas(@Query() query: ReporteVentasQueryDto) {
    return this.service.ventas(query);
  }

  @ApiResultado('ReporteCompra', 200, 'paginado', 'Reportes: compras')
  @Get('compras')
  compras(@Query() query: ReporteComprasQueryDto) {
    return this.service.compras(query);
  }

  @ApiResultado('ReporteUtilidad', 200, 'objeto', 'Reportes: utilidad')
  @Get('utilidad')
  utilidad(@Query() query: ReporteUtilidadQueryDto) {
    return this.service.utilidad(query);
  }

  @ApiResultado(
    'ReporteInventario',
    200,
    'paginado',
    'Reportes: inventarioActual',
  )
  @Get('inventario')
  inventarioActual(@Query() query: ReporteInventarioQueryDto) {
    return this.service.inventarioActual(query);
  }

  @ApiResultado('Movimiento', 200, 'paginado', 'Reportes: kardex')
  @Get('kardex')
  kardex(@Query() query: ReporteKardexQueryDto) {
    return this.service.kardex(query);
  }
}
