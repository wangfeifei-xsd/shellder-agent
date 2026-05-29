import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OpenApiAppContext } from '../openapi-auth.types';

export const CurrentApp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OpenApiAppContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.openApiApp;
  },
);
