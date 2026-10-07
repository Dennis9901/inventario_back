import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module.js';
import { DevolucionesVentaController } from './devoluciones-venta.controller.js';
import { DevolucionesCompraController } from './devoluciones-compra.controller.js';
import { DevolucionesVentaService } from './devoluciones-venta.service.js';
import { DevolucionesCompraService } from './devoluciones-compra.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [DevolucionesVentaController, DevolucionesCompraController],
  providers: [DevolucionesVentaService, DevolucionesCompraService],
  exports: [DevolucionesVentaService, DevolucionesCompraService],
})
export class DevolucionesModule {}
