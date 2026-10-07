import { Global, Injectable, Module } from '@nestjs/common';
import { cargarConfiguracion } from './configuracion.js';

@Injectable()
export class ConfiguracionService {
  readonly valores = cargarConfiguracion();
}
@Global()
@Module({ providers: [ConfiguracionService], exports: [ConfiguracionService] })
export class ConfiguracionModule {}
