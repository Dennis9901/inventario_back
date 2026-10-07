import { Module } from '@nestjs/common';
import {
  ListasPreciosController,
  PrecioProductoController,
} from './listas-precios.controller.js';
import { ListasPreciosService } from './listas-precios.service.js';
@Module({
  controllers: [ListasPreciosController, PrecioProductoController],
  providers: [ListasPreciosService],
  exports: [ListasPreciosService],
})
export class ListasPreciosModule {}
