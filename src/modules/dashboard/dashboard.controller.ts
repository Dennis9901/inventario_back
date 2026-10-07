import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardPeriodoQueryDto,
  DashboardSerieQueryDto,
  DashboardRankingQueryDto,
  DashboardStockQueryDto,
  DashboardLimitQueryDto,
} from './dto/dashboard-query.dto.js';

@ApiModulo('Dashboard', true)
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @ApiResultado('DashboardResumen', 200, 'objeto', 'Dashboard: resumen')
  @Get('resumen')
  resumen(@Query() query: DashboardPeriodoQueryDto) {
    return this.service.resumen(query);
  }

  @ApiResultado('SerieVenta', 200, 'data', 'Dashboard: ventas')
  @Get('ventas')
  ventas(@Query() query: DashboardSerieQueryDto) {
    return this.service.ventas(query);
  }

  @ApiResultado('SerieCompra', 200, 'data', 'Dashboard: compras')
  @Get('compras')
  compras(@Query() query: DashboardSerieQueryDto) {
    return this.service.compras(query);
  }

  @ApiResultado(
    'RankingProducto',
    200,
    'data',
    'Dashboard: productosMasVendidos',
  )
  @Get('productos-mas-vendidos')
  productosMasVendidos(@Query() query: DashboardRankingQueryDto) {
    return this.service.productosMasVendidos(query);
  }

  @ApiResultado('StockBajo', 200, 'data', 'Dashboard: stockBajo')
  @Get('stock-bajo')
  stockBajo(@Query() query: DashboardStockQueryDto) {
    return this.service.stockBajo(query.limit);
  }

  @ApiResultado('Movimiento', 200, 'data', 'Dashboard: movimientosRecientes')
  @Get('movimientos-recientes')
  movimientosRecientes(@Query() query: DashboardLimitQueryDto) {
    return this.service.movimientosRecientes(query.limit);
  }

  @ApiResultado('Actividad', 200, 'data', 'Dashboard: actividadReciente')
  @Get('actividad-reciente')
  actividadReciente(@Query() query: DashboardLimitQueryDto) {
    return this.service.actividadReciente(query.limit);
  }

  @ApiResultado('RankingCliente', 200, 'data', 'Dashboard: clientesPrincipales')
  @Get('clientes-principales')
  clientesPrincipales(@Query() query: DashboardRankingQueryDto) {
    return this.service.clientesPrincipales(query);
  }

  @ApiResultado(
    'RankingProveedor',
    200,
    'data',
    'Dashboard: proveedoresPrincipales',
  )
  @Get('proveedores-principales')
  proveedoresPrincipales(@Query() query: DashboardRankingQueryDto) {
    return this.service.proveedoresPrincipales(query);
  }
}
