import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from './agent-runtime/agent-runtime.module';
import { ApprovalModule } from './approval/approval.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BusinessCapabilityModule } from './business-capability/business-capability.module';
import { CapabilityModule } from './capability/capability.module';
import { ConnectorModule } from './connector/connector.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { MessageModule } from './message/message.module';
import { MetricsModule } from './metrics/metrics.module';
import { PolicyModule } from './policy/policy.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { SessionModule } from './session/session.module';
import { TaskModule } from './task/task.module';
import { TenantModule } from './tenant/tenant.module';
import { ToolModule } from './tool/tool.module';
import { SkillModule } from './skill/skill.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { OpenApiModule } from './openapi/openapi.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { LlmModule } from './llm/llm.module';
import { CopilotModule } from './copilot/copilot.module';
import { PromptModule } from './prompt/prompt.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    HealthModule,
    MetricsModule,
    TenantModule,
    RbacModule,
    PolicyModule,
    ConnectorModule,
    ToolModule,
    SessionModule,
    MessageModule,
    TaskModule,
    CapabilityModule,
    SkillModule,
    KnowledgeModule,
    ApprovalModule,
    AgentRuntimeModule,
    BusinessCapabilityModule,
    OpenApiModule,
    DashboardModule,
    SystemSettingsModule,
    LlmModule,
    CopilotModule,
    PromptModule,
  ],
})
export class AppModule {}
