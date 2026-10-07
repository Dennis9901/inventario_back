import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfiguracionService } from '../../configuracion/configuracion.module.js';
import { RequestContextMiddleware } from './request-context.middleware.js';
import {
  ApiErrorResponse,
  ValidationErrorResponse,
  ValidationFieldError,
} from './api-error.dto.js';
import { schemas } from './openapi.schemas.js';

export function configurarHttp(app: INestApplication) {
  const config = app.get(ConfiguracionService).valores;
  app.setGlobalPrefix('api/v1');
  // Antes de Swagger/CORS para cubrir también docs, 404 y preflight. Middleware Nest evita duplicados.
  const contexto = app.get(RequestContextMiddleware);
  app.use(contexto.use.bind(contexto));
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Inventario API')
      .setDescription(
        'API administrativa para gestión de inventario, compras, ventas, devoluciones, clientes, proveedores, dashboard y reportes.',
      )
      .setVersion(config.version)
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build(),
    {
      extraModels: [
        ApiErrorResponse,
        ValidationErrorResponse,
        ValidationFieldError,
      ],
    },
  );
  documento.components ??= {};
  documento.components.schemas = {
    ...documento.components.schemas,
    ...schemas,
  };
  SwaggerModule.setup('api/docs', app, documento, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: false },
  });
  return documento;
}
