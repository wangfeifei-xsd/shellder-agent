import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { applicationProperties } from '@shellder/config';
import { PrismaService } from '../prisma/prisma.service';
import { OpenApiAppService } from './openapi-app.service';
import {
  OPENAPI_JWT_ISSUER,
  OpenApiJwtPayload,
} from './openapi-auth.types';

@Injectable()
export class OpenApiAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly appService: OpenApiAppService,
  ) {}

  async issueToken(clientId: string, clientSecret: string) {
    const app = await this.appService.findByClientId(clientId);
    if (!app) {
      throw new UnauthorizedException({
        code: 'OPENAPI_INVALID_CREDENTIALS',
        message: '无效的 Client ID',
      });
    }

    if (app.status === 'disabled') {
      throw new ForbiddenException({
        code: 'OPENAPI_APP_DISABLED',
        message: '该接入应用已被禁用',
      });
    }

    if (!this.appService.verifySecret(app, clientSecret)) {
      throw new UnauthorizedException({
        code: 'OPENAPI_INVALID_CREDENTIALS',
        message: 'Client Secret 不正确',
      });
    }

    const payload: Omit<OpenApiJwtPayload, 'iss' | 'iat' | 'exp'> = {
      sub: app.id,
      appName: app.name,
      clientId: app.clientId,
      allowedTenantIds: app.allowedTenantIds as string[],
      allowedCapabilities: app.allowedCapabilities as string[],
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: applicationProperties.get().auth.openapi.tokenExpiresIn,
      issuer: OPENAPI_JWT_ISSUER,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: applicationProperties.get().auth.openapi.tokenExpiresIn,
      app: {
        id: app.id,
        name: app.name,
        allowedTenantIds: app.allowedTenantIds,
        allowedCapabilities: app.allowedCapabilities,
      },
    };
  }

  /** 校验应用是否可访问指定租户 */
  async assertTenantAccess(
    allowedTenantIds: string[],
    tenantId: string,
  ) {
    if (!allowedTenantIds.includes(tenantId)) {
      throw new ForbiddenException({
        code: 'OPENAPI_TENANT_FORBIDDEN',
        message: '该应用无权访问此租户',
      });
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new ForbiddenException({
        code: 'TENANT_NOT_FOUND',
        message: `租户不存在：${tenantId}`,
      });
    }
    if (tenant.status === 'disabled') {
      throw new ForbiddenException({
        code: 'TENANT_DISABLED',
        message: '该租户已禁用，拒绝调用',
      });
    }
    return tenant;
  }

  /** 解析 tenantId / externalTenantId → tenant.id */
  async resolveTenantId(
    allowedTenantIds: string[],
    tenantId?: string,
    externalTenantId?: string,
  ): Promise<string> {
    if (tenantId) {
      await this.assertTenantAccess(allowedTenantIds, tenantId);
      return tenantId;
    }
    if (externalTenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { externalTenantId },
      });
      if (!tenant) {
        throw new ForbiddenException({
          code: 'TENANT_NOT_FOUND',
          message: `无法通过 externalTenantId 映射租户：${externalTenantId}`,
        });
      }
      await this.assertTenantAccess(allowedTenantIds, tenant.id);
      return tenant.id;
    }

    if (allowedTenantIds.length === 1) {
      await this.assertTenantAccess(allowedTenantIds, allowedTenantIds[0]);
      return allowedTenantIds[0];
    }

    throw new ForbiddenException({
      code: 'TENANT_ID_REQUIRED',
      message: '请求必须指定 tenantId 或 externalTenantId',
    });
  }

  /** 校验能力类型访问权限 */
  assertCapabilityAccess(
    allowedCapabilities: string[],
    capabilityType: string,
  ) {
    if (
      allowedCapabilities.length > 0 &&
      !allowedCapabilities.includes(capabilityType)
    ) {
      throw new ForbiddenException({
        code: 'OPENAPI_CAPABILITY_FORBIDDEN',
        message: `该应用无权访问此能力类型：${capabilityType}`,
      });
    }
  }
}
