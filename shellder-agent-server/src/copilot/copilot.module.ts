import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenApiModule } from '../openapi/openapi.module';
import { AuthModule } from '../auth/auth.module';
import { CopilotAuthService } from './copilot-auth.service';
import { CopilotConfigService } from './copilot-config.service';
import { CopilotConfigController, CopilotWidgetController } from './copilot.controller';

@Module({
  imports: [PrismaModule, OpenApiModule, AuthModule],
  controllers: [CopilotConfigController, CopilotWidgetController],
  providers: [CopilotAuthService, CopilotConfigService],
  exports: [CopilotAuthService, CopilotConfigService],
})
export class CopilotModule {}
