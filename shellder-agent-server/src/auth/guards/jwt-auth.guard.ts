import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JWT_ISSUER, JwtPayload } from '../jwt.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '缺少访问令牌',
      });
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        issuer: JWT_ISSUER,
      });
      request.user = {
        id: payload.sub,
        username: payload.username,
        roles: payload.roles ?? [],
        tenantIds: payload.tenantIds ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: '访问令牌无效或已过期',
      });
    }
  }

  /**
   * 优先 Authorization: Bearer；SSE（EventSource）无法带 Header，回退 ?token=。
   */
  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header) {
      const [type, value] = header.split(' ');
      if (type === 'Bearer' && value) return value;
    }

    const queryToken = request.query.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return undefined;
  }
}
