import { Global, Module } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.js';
import { RequestContextMiddleware } from './request-context.middleware.js';
@Global()
@Module({
  providers: [StructuredLogger, RequestContextMiddleware],
  exports: [StructuredLogger, RequestContextMiddleware],
})
export class HttpModule {}
