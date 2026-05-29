import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from './agent-runtime/agent-runtime.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CapabilityModule } from './capability/capability.module';
import { ConnectorModule } from './connector/connector.module';
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
    AgentRuntimeModule,
  ],
})
export class AppModule {}
