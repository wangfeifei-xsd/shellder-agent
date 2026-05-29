import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditStatus } from '@prisma/client';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { ACTIVE_TENANT_HEADER, sanitize } from '../audit.constants';
import { AuditService } from '../audit.service';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';

/**
 * 全局用户操作审计拦截器。
 * 仅对标注了 @Audit 的处理器生效；请求成功或失败后自动写 user_action_audit。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const headerTenant = request.header(ACTIVE_TENANT_HEADER);
    const tenantId = headerTenant?.trim() || null;
    const params = (request.params as Record<string, string> | undefined) ?? {};
    const paramId = params.id ?? params.roleId ?? null;
    const ip = request.ip ?? null;
    const requestId = request.requestId ?? null;
    const safeBody = sanitize(request.body);
    const safeParams = sanitize(request.params);

    const baseRecord = {
      tenantId,
      operatorUserId: user?.id ?? null,
      operatorName: user?.username ?? null,
      action: options.action,
      module: options.module ?? null,
      targetType: options.targetType ?? null,
      ip,
      requestId,
    };

    return next.handle().pipe(
      tap({
        next: (result) => {
          const targetId = paramId ?? this.extractId(result);
          void this.auditService.logUserAction({
            ...baseRecord,
            targetId,
            summary:
              options.summary ?? this.buildSummary(options, targetId),
            diff: { params: safeParams, body: safeBody },
            status: AuditStatus.success,
          });
        },
        error: (err: unknown) => {
          void this.auditService.logUserAction({
            ...baseRecord,
            targetId: paramId,
            summary:
              options.summary ?? this.buildSummary(options, paramId, true),
            diff: {
              params: safeParams,
              body: safeBody,
              error: err instanceof Error ? err.message : String(err),
            },
            status: AuditStatus.failed,
          });
        },
      }),
    );
  }

  private extractId(result: unknown): string | null {
    if (result && typeof result === 'object' && 'id' in result) {
      const id = (result as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private buildSummary(options: AuditOptions, targetId: string | null, failed = false): string {
    const target = options.targetType
      ? `${options.targetType}${targetId ? `#${targetId}` : ''}`
      : (targetId ?? '');
    const suffix = failed ? '（失败）' : '';
    return `${options.action} ${target}`.trim() + suffix;
  }
}
