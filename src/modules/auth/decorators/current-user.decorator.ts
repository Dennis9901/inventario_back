import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request } from 'express';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
