import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiRequest } from './request-context.js';
import { StructuredLogger, textoSeguro } from './structured-logger.js';

const codigos: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'SERVICE_UNAVAILABLE',
};
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<ApiRequest>(),
      res = http.getResponse<Response>();
    const requestId = req.requestId ?? randomUUID();
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const body: unknown =
      error instanceof HttpException ? error.getResponse() : undefined;
    const detalles =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const mensajes = detalles['message'];
    const validacion =
      statusCode === 400 &&
      (detalles['code'] === 'VALIDATION_ERROR' || Array.isArray(mensajes));
    const message =
      statusCode >= 500
        ? 'Error interno del servidor'
        : validacion
          ? 'Error de validación'
          : textoSeguro(
              typeof body === 'string'
                ? body
                : typeof mensajes === 'string'
                  ? mensajes
                  : 'Error de solicitud',
            );
    const code =
      statusCode >= 500
        ? (codigos[statusCode] ?? 'INTERNAL_ERROR')
        : validacion
          ? 'VALIDATION_ERROR'
          : typeof detalles['code'] === 'string' &&
              /^[A-Z][A-Z0-9_]{0,79}$/.test(detalles['code'])
            ? detalles['code']
            : message === 'Existencia insuficiente para realizar la salida'
              ? 'STOCK_INSUFICIENTE'
              : message === 'El producto se encuentra inactivo'
                ? 'PRODUCTO_INACTIVO'
                : (codigos[statusCode] ?? 'HTTP_ERROR');
    const errors = validacion
      ? Array.isArray(detalles['errors'])
        ? detalles['errors']
        : (mensajes as string[]).map((m) => ({
            field: '_global',
            messages: [textoSeguro(m)],
          }))
      : [];
    if (statusCode >= 500)
      this.logger.write(
        {
          type: 'http_error',
          requestId,
          method: req.method,
          path: (req.originalUrl ?? req.path).split('?')[0],
          userId: req.user?.sub,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          message:
            error instanceof Error
              ? error.message
              : 'Error inesperado no tipado',
          stack: error instanceof Error ? error.stack : undefined,
        },
        true,
      );
    if (res.headersSent) return;
    res.setHeader('X-Request-Id', requestId);
    res.status(statusCode).json({
      statusCode,
      code,
      message,
      errors,
      path: textoSeguro(
        (req.originalUrl ?? req.path).split('?')[0] ?? req.path,
      ),
      method: req.method,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
