import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module.js';
import { ProductosModule } from '../productos/productos.module.js';
import { ListasPreciosModule } from '../listas-precios/listas-precios.module.js';
import { ImportacionesController } from './importaciones.controller.js';
import { ImportacionesService } from './importaciones.service.js';
@Module({
  imports: [ClientesModule, ProductosModule, ListasPreciosModule],
  controllers: [ImportacionesController],
  providers: [ImportacionesService],
  exports: [ImportacionesService],
})
export class ImportacionesModule {}
