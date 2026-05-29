import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JWT_ISSUER, JwtPayload } from './jwt.types';
import { PermissionService } from './permission.service';
import { verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly permissionService: PermissionService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { roles: { include: { role: true } }, tenants: true },
    });

    // 统一错误：用户不存在或密码错误均返回同一提示，避免账号枚举
    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码错误',
      });
    }

    // 禁用用户无法登录（验收标准 4）
    if (user.status === UserStatus.disabled) {
      throw new UnauthorizedException({
        code: 'USER_DISABLED',
        message: '账号已被禁用，请联系管理员',
      });
    }

    const roles = user.roles.map((r) => r.role.code);
    const tenantIds = user.tenants.map((t) => t.tenantId);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      roles,
      tenantIds,
      iss: JWT_ISSUER,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    };
  }

  /** GET /auth/me：当前用户、可访问租户与聚合权限 */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        tenants: { include: { tenant: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: '登录用户不存在',
      });
    }

    const permissions = this.permissionService.aggregate(
      user.roles.map((r) => r.role),
    );

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      roles: user.roles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
      tenants: user.tenants.map((t) => ({
        id: t.tenant.id,
        code: t.tenant.code,
        name: t.tenant.name,
        status: t.tenant.status,
      })),
      permissions,
    };
  }
}
