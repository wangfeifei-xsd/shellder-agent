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
    message: `wiki 知识库服务 请求超时（>${timeoutMs}ms）`,
  });
}

export function knowledgeProxyUpstream(
  status: number,
  detail: string,
  upstream?: unknown,
): HttpException {
  const body = {
    code: KNOWLEDGE_PROXY_UPSTREAM,
    message: `wiki 知识库服务 返回 ${status}：${detail}`,
    ...(upstream !== undefined ? { details: upstream } : {}),
  };
  if (status === 503) {
    return new ServiceUnavailableException(body);
  }
  if (status >= 500) {
    return new BadGatewayException(body);
  }
  return new HttpException(body, status);
}
