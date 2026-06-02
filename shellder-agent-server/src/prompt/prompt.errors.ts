import { BadRequestException, NotFoundException } from '@nestjs/common';

export function promptTemplateNotFound() {
  return new NotFoundException({
    code: 'PROMPT_TEMPLATE_NOT_FOUND',
    message: 'Prompt 模板不存在',
  });
}

export function promptVersionNotFound() {
  return new NotFoundException({
    code: 'PROMPT_VERSION_NOT_FOUND',
    message: 'Prompt 版本不存在',
  });
}

export function promptBindingNotFound() {
  return new NotFoundException({
    code: 'PROMPT_BINDING_NOT_FOUND',
    message: 'Prompt 绑定不存在',
  });
}

export function promptVariableMissing(missing: string[]) {
  return new BadRequestException({
    code: 'PROMPT_VARIABLE_MISSING',
    message: `缺少必填模板变量：${missing.join(', ')}`,
    missing,
  });
}

export function promptVersionNotDraft() {
  return new BadRequestException({
    code: 'PROMPT_VERSION_NOT_DRAFT',
    message: '仅 draft 版本可编辑',
  });
}

export function promptPublishConflict() {
  return new BadRequestException({
    code: 'PROMPT_PUBLISH_CONFLICT',
    message: '该模板已有 published 版本，请先发布或处理冲突',
  });
}

export function promptKeyConflict() {
  return new BadRequestException({
    code: 'PROMPT_KEY_CONFLICT',
    message: '相同 scope/tenant 下 prompt_key 已存在',
  });
}
