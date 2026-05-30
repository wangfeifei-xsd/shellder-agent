import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export function llmNotConfigured(message?: string): BadRequestException {
  return new BadRequestException({
    code: 'LLM_NOT_CONFIGURED',
    message:
      message ??
      '平台 LLM 未配置或 API Key 缺失，请先在「系统设置 / 模型接入」完成 Base URL、模型与 API Key 配置。',
  });
}

export function llmUpstreamError(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'LLM_UPSTREAM_ERROR',
    message,
  });
}

export function llmTimeout(timeoutMs: number): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'LLM_TIMEOUT',
    message: `LLM 请求超时（${timeoutMs}ms）`,
  });
}
