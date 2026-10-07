import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface.js';

export interface ApiRequest extends Request {
  requestId?: string;
  user?: JwtPayload;
}
export interface AuditAction {
  accion: string;
  entidad: string;
}
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  usuarioId?: number;
  entidadId?: number;
  auditoria?: AuditAction;
  auditoriaPersistida?: boolean;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();
