import {
  BadGatewayException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';

export const KNOWLEDGE_PROXY_UNAVAILABLE = 'KNOWLEDGE_PROXY_UNAVAILABLE';
export const KNOWLEDGE_PROXY_UPSTREAM = 'KNOWLEDGE_PROXY_UPSTREAM';
export const KNOWLEDGE_PROXY_TIMEOUT = 'KNOWLEDGE_PROXY_TIMEOUT';

export function knowledgeProxyUnavailable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: KNOWLEDGE_PROXY_UNAVAILABLE,
    message,
  });
}

export function knowledgeProxyTimeout(timeoutMs: number): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: KNOWLEDGE_PROXY_TIMEOUT,
    message: `pathy-knowledge-server 请求超时（>${timeoutMs}ms）`,
  });
}

export function knowledgeProxyUpstream(
  status: number,
  detail: string,
): HttpException {
  if (status >= 500) {
    return new BadGatewayException({
      code: KNOWLEDGE_PROXY_UPSTREAM,
      message: `pathy-knowledge-server 返回 ${status}：${detail}`,
    });
  }
  return new HttpException(
    {
      code: KNOWLEDGE_PROXY_UPSTREAM,
      message: `pathy-knowledge-server 返回 ${status}：${detail}`,
    },
    status,
  );
}
