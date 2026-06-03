import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenApiModule } from '../openapi/openapi.module';
import { AuthModule } from '../auth/auth.module';
import { CopilotAuthService } from './copilot-auth.service';
import { CopilotConfigService } from './copilot-config.service';
import { CapabilityDemoController } from './capability-demo.controller';
import { CopilotConfigController, CopilotWidgetController } from './copilot.controller';

@Module({
  imports: [PrismaModule, OpenApiModule, AuthModule, AgentRuntimeModule],
  controllers: [
    CopilotConfigController,
    CopilotWidgetController,
    CapabilityDemoController,
  ],
  providers: [CopilotAuthService, CopilotConfigService],
  exports: [CopilotAuthService, CopilotConfigService],
})
export class CopilotModule {}
