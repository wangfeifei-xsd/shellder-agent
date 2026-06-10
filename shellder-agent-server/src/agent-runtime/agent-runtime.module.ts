import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PolicyModule } from '../policy/policy.module';
import { AuditModule } from '../audit/audit.module';
import { CapabilityModule } from '../capability/capability.module';
import { ApprovalModule } from '../approval/approval.module';
import { SessionModule } from '../session/session.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { LlmModule } from '../llm/llm.module';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentRuntimeController } from './agent-runtime.controller';
import { SseEmitterService } from './sse-emitter.service';
import { SessionTitleService } from './session-title.service';

@Module({
  imports: [
    PrismaModule,
    PolicyModule,
    AuditModule,
    CapabilityModule,
    SessionModule,
    SystemSettingsModule,
    LlmModule,
    forwardRef(() => ApprovalModule),
  ],
  controllers: [AgentRuntimeController],
  providers: [AgentRuntimeService, SseEmitterService, SessionTitleService],
  exports: [AgentRuntimeService, SseEmitterService],
})
export class AgentRuntimeModule {}
