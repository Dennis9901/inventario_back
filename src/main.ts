import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarHttp } from './common/http/configurar-http.js';
import { ConfiguracionService } from './configuracion/configuracion.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarHttp(app);
  await app.listen(app.get(ConfiguracionService).valores.port);
}
await bootstrap();
