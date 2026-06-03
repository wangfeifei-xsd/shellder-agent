'use client';

import { Alert } from 'antd';
import { ApiError } from '@/lib/api';
import { isKnowledgeProxyError } from '@/lib/knowledge-proxy';
import { isLlmError } from '@/lib/llm-settings';

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

/** 知识库 wiki 代理不可用时的明确提示（执行计划 §7.4） */
export function KnowledgeProxyErrorAlert({ error, className }: Props) {
  if (!error) return null;

  if (isLlmError(error)) {
    const isNotConfigured = error.code === 'LLM_NOT_CONFIGURED';
    return (
      <Alert
        className={className}
        type="error"
        showIcon
        message={isNotConfigured ? '平台 LLM 未配置' : '模型调用失败'}
        description={
          <>
            <p className="mb-1">{error.message}</p>
            {isNotConfigured && (
              <p className="mb-0 text-sm opacity-80">
                请前往「系统设置 / 模型接入」配置 Base URL、模型 ID 与 API Key。
              </p>
            )}
          </>
        }
      />
    );
  }

  if (isKnowledgeProxyError(error)) {
    const isUnavailable = error.code === 'KNOWLEDGE_PROXY_UNAVAILABLE';
    const isTimeout = error.code === 'KNOWLEDGE_PROXY_TIMEOUT';
    const isUpstream = error.code === 'KNOWLEDGE_PROXY_UPSTREAM';
    const needsWikiLlmKey =
      isUpstream &&
      /API\s*密钥|OPENAI_API_KEY|openai_api_key/i.test(error.message);
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
              {needsWikiLlmKey ? (
                <>
                  wiki 全流程测试需在 <strong>wiki 知识库服务</strong> 所在机器配置大模型密钥（环境变量{' '}
                  <code>OPENAI_API_KEY</code> 或数据目录 <code>.pathy/openai_api_key</code>），与平台「模型接入」无关。
                  也可在问答测试页切换到「平台 QA」模式，由平台 LLM 生成回答。
                </>
              ) : (
                <>
                  请确认 wiki 知识库服务已启动，并在「知识库管理」页保存 wiki 服务连接（写入 MySQL）。管理后台仅通过平台代理访问，请勿直连
                  wiki 服务。
                </>
              )}
              {error.status === 422 && (
                <>
                  {' '}
                  422 多为请求参数校验失败，请核对知识库绑定中的 <code>wiki_prefix</code> 与 wiki 服务{' '}
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
