import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OpenApiAppService } from '../openapi/openapi-app.service';
import { OpenApiAuthService } from '../openapi/openapi-auth.service';
import { CopilotTokenExchangeDto } from './dto/copilot-config.dto';

export const COPILOT_JWT_ISSUER = 'shellder-copilot';

export interface CopilotJwtPayload {
  sub: string;
  appId: string;
  appName: string;
  tenantId: string;
  externalUserId?: string;
  iss: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class CopilotAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly appService: OpenApiAppService,
    private readonly openApiAuthService: OpenApiAuthService,
  ) {}

  /**
   * 换票接口：业务系统凭 clientId + clientSecret 换取 Copilot JWT。
   * 可指定 tenantId/externalTenantId 以及 externalUserId。
   */
  async exchangeToken(dto: CopilotTokenExchangeDto) {
    const app = await this.appService.findByClientId(dto.clientId);
    if (!app) {
      throw new UnauthorizedException({
        code: 'COPILOT_INVALID_CREDENTIALS',
        message: '无效的 Client ID',
      });
    }

    if (app.status === 'disabled') {
      throw new ForbiddenException({
        code: 'COPILOT_APP_DISABLED',
        message: '该接入应用已被禁用',
      });
    }

    if (!this.appService.verifySecret(app, dto.clientSecret)) {
      throw new UnauthorizedException({
        code: 'COPILOT_INVALID_CREDENTIALS',
        message: 'Client Secret 不正确',
      });
    }

    const copilotConfig = await this.prisma.copilotConfig.findUnique({
      where: { appId: app.id },
    });
    if (!copilotConfig || copilotConfig.status === 'disabled') {
      throw new ForbiddenException({
        code: 'COPILOT_NOT_CONFIGURED',
        message: '该应用未配置或已禁用 Copilot',
      });
    }

    const tenantId = await this.openApiAuthService.resolveTenantId(
      app.allowedTenantIds as string[],
      dto.tenantId,
      dto.externalTenantId,
    );

    const tokenTtl = copilotConfig.tokenTtlSeconds ?? 3600;

    const payload: CopilotJwtPayload = {
      sub: `copilot:${app.id}:${dto.externalUserId ?? 'anonymous'}`,
      appId: app.id,
      appName: app.name,
      tenantId,
      externalUserId: dto.externalUserId,
      iss: COPILOT_JWT_ISSUER,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: tokenTtl,
      issuer: COPILOT_JWT_ISSUER,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: tokenTtl,
      tenantId,
      config: {
        theme: copilotConfig.theme,
        features: copilotConfig.features,
        welcomeMessage: copilotConfig.welcomeMessage,
        placeholder: copilotConfig.placeholder,
        maxHistoryMessages: copilotConfig.maxHistoryMessages,
      },
    };
  }

  /** 验证 Copilot JWT */
  verifyCopilotToken(token: string): CopilotJwtPayload {
    try {
      return this.jwtService.verify<CopilotJwtPayload>(token, {
        issuer: COPILOT_JWT_ISSUER,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'COPILOT_TOKEN_INVALID',
        message: 'Copilot Token 无效或已过期',
      });
    }
  }
}
