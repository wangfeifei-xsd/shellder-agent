import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenApiAppController, OpenApiCallLogController } from './openapi-app.controller';
import { OpenApiAppService } from './openapi-app.service';
import { OpenApiAuthService } from './openapi-auth.service';
import { OpenApiCallLogService } from './openapi-call-log.service';
import { OpenApiController } from './openapi.controller';

@Module({
  imports: [PrismaModule, AgentRuntimeModule],
  controllers: [
    OpenApiAppController,
    OpenApiCallLogController,
    OpenApiController,
  ],
  providers: [
    OpenApiAppService,
    OpenApiAuthService,
    OpenApiCallLogService,
  ],
  exports: [OpenApiAppService, OpenApiAuthService, OpenApiCallLogService],
})
export class OpenApiModule {}
