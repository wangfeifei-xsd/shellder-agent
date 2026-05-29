import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { truncate } from './audit.constants';

/** 工具调用审计采集入参（07 工具模块起调用） */
export interface LogToolCallInput {
  tenantId?: string | null;
  toolId?: string | null;
  toolName: string;
  callerUserId?: string | null;
  callerName?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  requestSummary?: string | null;
  status?: AuditStatus;
  errorMessage?: string | null;
  durationMs?: number | null;
  highRisk?: boolean;
}

/** 用户操作审计采集入参（拦截器或服务层调用） */
export interface LogUserActionInput {
  tenantId?: string | null;
  operatorUserId?: string | null;
  operatorName?: string | null;
  action: string;
  module?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
  diff?: unknown;
  status?: AuditStatus;
  ip?: string | null;
  requestId?: string | null;
}

/** 外部接口审计采集入参（06 连接器 / 13 业务能力起调用） */
export interface LogExternalCallInput {
  tenantId?: string | null;
  connectorId?: string | null;
  target: string;
  method?: string | null;
  callerUserId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  requestSummary?: string | null;
  status?: AuditStatus;
  statusCode?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

/**
 * 审计采集服务（全局）。
 * 所有写操作必须审计（架构 §8），所有外部系统调用必须记录。
 * 采集失败仅记录日志，**不抛出**，避免审计故障阻断业务主流程。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logToolCall(input: LogToolCallInput): Promise<void> {
    try {
      await this.prisma.toolCallAudit.create({
        data: {
          tenantId: input.tenantId ?? null,
          toolId: input.toolId ?? null,
          toolName: input.toolName,
          callerUserId: input.callerUserId ?? null,
          callerName: input.callerName ?? null,
          sessionId: input.sessionId ?? null,
          taskId: input.taskId ?? null,
          requestSummary: input.requestSummary ? truncate(input.requestSummary) : null,
          status: input.status ?? AuditStatus.pending,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
          highRisk: input.highRisk ?? false,
        },
      });
    } catch (err) {
      this.warn('logToolCall', err);
    }
  }

  async logUserAction(input: LogUserActionInput): Promise<void> {
    try {
      await this.prisma.userActionAudit.create({
        data: {
          tenantId: input.tenantId ?? null,
          operatorUserId: input.operatorUserId ?? null,
          operatorName: input.operatorName ?? null,
          action: input.action,
          module: input.module ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ? truncate(input.targetId, 64) : null,
          summary: input.summary ? truncate(input.summary, 512) : null,
          diff:
            input.diff === undefined
              ? Prisma.JsonNull
              : (input.diff as Prisma.InputJsonValue),
          status: input.status ?? AuditStatus.success,
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
        },
      });
    } catch (err) {
      this.warn('logUserAction', err);
    }
  }

  async logExternalCall(input: LogExternalCallInput): Promise<void> {
    try {
      await this.prisma.externalCallAudit.create({
        data: {
          tenantId: input.tenantId ?? null,
          connectorId: input.connectorId ?? null,
          target: truncate(input.target, 255),
          method: input.method ?? null,
          callerUserId: input.callerUserId ?? null,
          sessionId: input.sessionId ?? null,
          taskId: input.taskId ?? null,
          requestSummary: input.requestSummary ? truncate(input.requestSummary) : null,
          status: input.status ?? AuditStatus.success,
          statusCode: input.statusCode ?? null,
          durationMs: input.durationMs ?? null,
          errorMessage: input.errorMessage ?? null,
        },
      });
    } catch (err) {
      this.warn('logExternalCall', err);
    }
  }

  private warn(method: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(`审计采集失败（${method}）：${message}`);
  }
}
