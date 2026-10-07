import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { ReportesService } from './reportes.service.js';
import { ReportesController } from './reportes.controller.js';

@Module({
  imports: [InventarioModule, DashboardModule],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
