import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { ApiRequest } from '../../../common/http/request-context.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload | undefined => {
    const request = context.switchToHttp().getRequest<ApiRequest>();

    return request.user;
  },
);
