import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { RoutingEngineService } from './routing-engine.service';
import { RoutingIntraTestDto, RoutingTestDto } from './dto/routing-test.dto';

/** 路由测试（功能清单 §1.4 能力路由 / 路由测试） */
@Controller('api/v1/routing')
@RequireMenu('routing')
export class RoutingTestController {
  constructor(private readonly routingEngine: RoutingEngineService) {}

  /**
   * POST /api/v1/routing/test
   * 输入测试语句 → { capabilityType, reason, candidates, needConfirmation }
   */
  @Post('test')
  test(@CurrentUser() user: AuthUser, @Body() dto: RoutingTestDto) {
    return this.routingEngine.routeTest(dto.tenantId, dto.input, dto.userId ?? user.id, {
      pinnedCapabilityType: dto.pinnedCapabilityType,
    });
  }

  /** POST /api/v1/routing/test/intra — 仅测 Stage2 */
  @Post('test/intra')
  testIntra(@CurrentUser() user: AuthUser, @Body() dto: RoutingIntraTestDto) {
    return this.routingEngine.routeWithinCapability(
      dto.tenantId,
      dto.capabilityType,
      dto.input,
      dto.userId ?? user.id,
    );
  }
}
