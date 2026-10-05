import { Module } from '@nestjs/common';
import { ComprasController } from './compras.controller.js';
import { ComprasService } from './compras.service.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ProveedoresModule } from '../proveedores/proveedores.module.js';

@Module({
  imports: [InventarioModule, ProveedoresModule],
  controllers: [ComprasController],
  providers: [ComprasService],
  exports: [ComprasService],
})
export class ComprasModule {}
