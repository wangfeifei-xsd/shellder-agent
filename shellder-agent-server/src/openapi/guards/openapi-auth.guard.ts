import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { OPENAPI_JWT_ISSUER, OpenApiJwtPayload } from '../openapi-auth.types';

@Injectable()
export class OpenApiAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'OPENAPI_UNAUTHENTICATED',
        message: '缺少 OpenAPI 访问令牌',
      });
    }

    try {
      const payload = this.jwtService.verify<OpenApiJwtPayload>(token, {
        issuer: OPENAPI_JWT_ISSUER,
      });
      (request as any).openApiApp = {
        appId: payload.sub,
        appName: payload.appName,
        clientId: payload.clientId,
        allowedTenantIds: payload.allowedTenantIds ?? [],
        allowedCapabilities: payload.allowedCapabilities ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'OPENAPI_TOKEN_INVALID',
        message: 'OpenAPI 访问令牌无效或已过期',
      });
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, value] = header.split(' ');
    return type === 'Bearer' ? value : undefined;
  }
}
