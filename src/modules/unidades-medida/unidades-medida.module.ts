import { Module } from '@nestjs/common';
import { UnidadesMedidaService } from './unidades-medida.service.js';
import { UnidadesMedidaController } from './unidades-medida.controller.js';
@Module({
  controllers: [UnidadesMedidaController],
  providers: [UnidadesMedidaService],
  exports: [UnidadesMedidaService],
})
export class UnidadesMedidaModule {}
