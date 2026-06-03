import { BadRequestException } from '@nestjs/common';

export const KNOWLEDGE_SELF_HOSTED_DEPRECATED = 'KNOWLEDGE_SELF_HOSTED_DEPRECATED';

export function throwSelfHostedDeprecated(feature: string): never {
  throw new BadRequestException({
    code: KNOWLEDGE_SELF_HOSTED_DEPRECATED,
    message:
      `${feature} 已废弃（V1 改由 wiki 知识库服务 提供）。` +
      '请使用 /api/v1/knowledge/* 代理接口；运行时召回走 POST /api/v1/dialogue/recall。',
  });
}
