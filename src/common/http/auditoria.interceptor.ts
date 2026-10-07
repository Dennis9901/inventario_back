import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concatMap } from 'rxjs';
import { DatabaseService } from '../../database/database.service.js';
import { requestContext } from './request-context.js';
import type { ApiRequest, AuditAction } from './request-context.js';
import { AUDIT_ACTION } from './auditar.decorator.js';
import { datosAuditoria } from './audit-data.js';
import { StructuredLogger } from './structured-logger.js';

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
    private readonly logger: StructuredLogger,
  ) {}
  intercept(execution: ExecutionContext, next: CallHandler) {
    const accion = this.reflector.get<AuditAction | undefined>(
      AUDIT_ACTION,
      execution.getHandler(),
    );
    if (!accion) return next.handle();
    const req = execution.switchToHttp().getRequest<ApiRequest>();
    const contexto = requestContext.getStore();
    if (!contexto) throw new Error('Contexto HTTP de auditoría no disponible');
    contexto.auditoria = accion;
    contexto.usuarioId = req.user?.sub;
    const id = Number(req.params['id']);
    if (Number.isInteger(id) && id > 0) contexto.entidadId = id;
    return next.handle().pipe(
      concatMap(async (resultado: unknown) => {
        if (!contexto.auditoriaPersistida) {
          try {
            const datos = datosAuditoria(contexto, resultado);
            contexto.usuarioId ??= datos.usuarioId ?? undefined;
            await this.database.db.orm.public.Auditoria.create(datos);
            contexto.auditoriaPersistida = true;
          } catch (error: unknown) {
            // La escritura no transaccional ya se confirmó. No devolver un falso fallo de negocio.
            this.logger.write(
              {
                type: 'audit_failure',
                requestId: contexto.requestId,
                method: contexto.method,
                path: contexto.path,
                userId: contexto.usuarioId,
                accion: accion.accion,
                errorType: error instanceof Error ? error.name : 'UnknownError',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Auditoría no persistida',
                stack: error instanceof Error ? error.stack : undefined,
              },
              true,
            );
          }
        }
        return resultado;
      }),
    );
  }
}
