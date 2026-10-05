import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ClientesModule } from '../clientes/clientes.module.js';

@Module({
  imports: [InventarioModule, ClientesModule],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
