'use client';

import { Alert } from 'antd';
import { ApiError } from '@/lib/api';
import { isKnowledgeProxyError } from '@/lib/knowledge-proxy';

interface Props {
  error: unknown;
  className?: string;
}

/** 知识库 pathy 代理不可用时的明确提示（执行计划 §7.4） */
export function KnowledgeProxyErrorAlert({ error, className }: Props) {
  if (!error) return null;

  if (isKnowledgeProxyError(error)) {
    const isUnavailable = error.code === 'KNOWLEDGE_PROXY_UNAVAILABLE';
    const isTimeout = error.code === 'KNOWLEDGE_PROXY_TIMEOUT';
    return (
      <Alert
        className={className}
        type="error"
        showIcon
        message={
          isUnavailable
            ? '知识库服务不可用'
            : isTimeout
              ? '知识库服务请求超时'
              : '知识库代理上游错误'
        }
        description={
          <>
            <p className="mb-1">{error.message}</p>
            <p className="mb-0 text-sm opacity-80">
              请确认 pathy-knowledge-server 已启动，且平台环境变量{' '}
              <code>PATHY_KNOWLEDGE_SERVER_BASE_URL</code> 配置正确。管理后台仅通过平台代理访问，请勿直连 pathy。
            </p>
          </>
        }
      />
    );
  }

  if (error instanceof ApiError && error.status === 503) {
    return (
      <Alert
        className={className}
        type="error"
        showIcon
        message="知识库服务不可用"
        description={error.message}
      />
    );
  }

  return (
    <Alert
      className={className}
      type="error"
      showIcon
      message="操作失败"
      description={error instanceof Error ? error.message : '未知错误'}
    />
  );
}
