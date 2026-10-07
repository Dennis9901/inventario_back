import { SetMetadata } from '@nestjs/common';
export const AUDIT_ACTION = 'api:audit-action';
export const Auditar = (accion: string, entidad: string) =>
  SetMetadata(AUDIT_ACTION, { accion, entidad });
