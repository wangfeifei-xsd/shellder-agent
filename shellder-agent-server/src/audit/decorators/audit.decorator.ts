import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:options';

/** @Audit 装饰器配置：标记需自动采集用户操作审计的写接口 */
export interface AuditOptions {
  /** 操作标识，如 user.update / role.create / tenant.updateStatus */
  action: string;
  /** 模块权限 key，如 user.manage */
  module?: string;
  /** 目标资源类型，如 user / role / tenant */
  targetType?: string;
  /** 操作摘要（缺省时由拦截器按 action + 目标自动生成） */
  summary?: string;
}

/**
 * 标记某写操作需记入「用户操作审计」。
 * 由全局 AuditInterceptor 在请求成功/失败后自动落库（架构 §8：所有写操作必须审计）。
 */
export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);
