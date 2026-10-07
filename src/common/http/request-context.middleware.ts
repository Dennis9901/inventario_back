import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { requestContext } from './request-context.js';
import type { ApiRequest, RequestContext } from './request-context.js';
import { StructuredLogger, textoSeguro } from './structured-logger.js';

export function idSeguro(header: unknown) {
  return typeof header === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      header,
    )
    ? header.toLowerCase()
    : randomUUID();
}
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly logger: StructuredLogger) {}
  use(req: ApiRequest, res: Response, next: NextFunction) {
    if (req.requestId) {
      next();
      return;
    }
    const requestId = idSeguro(req.headers['x-request-id']);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const inicio = process.hrtime.bigint();
    const contexto: RequestContext = {
      requestId,
      method: req.method,
      path: textoSeguro(req.path),
    };
    let registrado = false;
    const registrar = () => {
      if (registrado) return;
      registrado = true;
      this.logger.write({
        type: 'http_request',
        requestId,
        method: contexto.method,
        path: contexto.path,
        statusCode: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - inicio) / 1e6,
        userId: req.user?.sub ?? contexto.usuarioId,
      });
    };
    res.once('finish', registrar);
    res.once('close', registrar);
    requestContext.run(contexto, next);
  }
}
