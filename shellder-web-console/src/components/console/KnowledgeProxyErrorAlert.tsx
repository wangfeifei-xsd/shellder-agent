'use client';

import { Alert } from 'antd';
import { ApiError } from '@/lib/api';
import { isKnowledgeProxyError } from '@/lib/knowledge-proxy';

interface Props {
  error: unknown;
  className?: string;
}

function formatErrorDetails(details: unknown): string[] {
  if (!details) return [];
  if (Array.isArray(details)) {
    return details.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const row = item as { loc?: unknown; msg?: string; message?: string };
        const text = row.msg ?? row.message;
        if (text && Array.isArray(row.loc) && row.loc.length) {
          return `${row.loc.join('.')}: ${text}`;
        }
        if (text) return text;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    });
  }
  if (typeof details === 'string') return [details];
  return [];
}

/** 知识库 pathy 代理不可用时的明确提示（执行计划 §7.4） */
export function KnowledgeProxyErrorAlert({ error, className }: Props) {
  if (!error) return null;

  if (isKnowledgeProxyError(error)) {
    const isUnavailable = error.code === 'KNOWLEDGE_PROXY_UNAVAILABLE';
    const isTimeout = error.code === 'KNOWLEDGE_PROXY_TIMEOUT';
    const detailLines = formatErrorDetails(error.details);
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
            {detailLines.length > 0 && (
              <ul className="mb-2 list-disc pl-5 text-sm">
                {detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="mb-0 text-sm opacity-80">
              请确认 pathy-knowledge-server 已启动，且平台环境变量{' '}
              <code>PATHY_KNOWLEDGE_SERVER_BASE_URL</code> 配置正确。管理后台仅通过平台代理访问，请勿直连 pathy。
              {error.status === 422 && (
                <>
                  {' '}
                  422 多为请求参数校验失败，请核对知识库绑定中的 <code>pathy_wiki_prefix</code> 与 pathy{' '}
                  <code>DATA_ROOT</code> 下目录是否一致。
                </>
              )}
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
