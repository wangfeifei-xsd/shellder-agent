import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthUser } from '../auth/jwt.types';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { LlmService } from '../llm/llm.service';
import { HttpQueryPolishDto } from './dto/http-query-polish.dto';

export interface HttpQueryPolishResult {
  draft: Record<string, unknown>;
  rationale: string;
  warnings?: string[];
}

interface LlmPolishPayload {
  name?: unknown;
  description?: unknown;
  toolCode?: unknown;
  intentTags?: unknown;
  priority?: unknown;
  riskLevel?: unknown;
  needConfirmation?: unknown;
  timeoutMs?: unknown;
  permissionScope?: unknown;
  parametersText?: unknown;
  invokeMethod?: unknown;
  invokePath?: unknown;
  invokeTimeoutMs?: unknown;
  queryMappingText?: unknown;
  bodyMappingText?: unknown;
  responseType?: unknown;
  successPath?: unknown;
  successValue?: unknown;
  fieldMappingText?: unknown;
  replyTextPath?: unknown;
  rationale?: unknown;
}

const FORM_KEYS = [
  'name',
  'description',
  'toolCode',
  'intentTags',
  'priority',
  'riskLevel',
  'needConfirmation',
  'timeoutMs',
  'permissionScope',
  'parametersText',
  'invokeMethod',
  'invokePath',
  'invokeTimeoutMs',
  'queryMappingText',
  'bodyMappingText',
  'responseType',
  'successPath',
  'successValue',
  'fieldMappingText',
  'replyTextPath',
] as const;

@Injectable()
export class HttpQueryAssistService {
  private readonly logger = new Logger(HttpQueryAssistService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async polishDraft(user: AuthUser, dto: HttpQueryPolishDto): Promise<HttpQueryPolishResult> {
    await this.tenantScope.assertAccess(user, dto.tenantId, { resource: '工具' });

    try {
      await this.llm.assertConfigured();
    } catch {
      throw new ServiceUnavailableException({
        code: 'LLM_NOT_CONFIGURED',
        message: '平台 LLM 未配置，请先在系统设置中配置模型后再使用 AI 润色',
      });
    }

    const systemPrompt = `你是 shellder-agent 平台 HTTP 业务查询工具（http_query）配置助手。
用户正在管理后台填写 Tool 表单，字段含义：
- name / description：展示名与说明
- toolCode：小写 snake_case，供 LLM 信号 [查询工具:tool_code {...}] 引用
- intentTags：中文/英文意图标签数组
- parametersText：JSON 数组，每项含 name/type/required/description
- invokeMethod / invokePath / queryMappingText / bodyMappingText / invokeTimeoutMs：HTTP 调用；path 为相对路径（baseUrl 在连接器）
- queryMappingText / bodyMappingText：目标字段 → 入参名或 $context.userId / $context.tenantId / $context.callerName / $context.sessionId
- responseType：play_audio | text_reply | json_data
- successPath / successValue / fieldMappingText / replyTextPath：响应 JSONPath 映射

要求：
1. 仅输出一个 JSON 对象，不要 markdown 代码块
2. 保留用户已有合理配置，补全缺失项、润色中文描述与 intentTags
3. parametersText / queryMappingText / bodyMappingText / fieldMappingText 必须是合法 JSON 字符串（内容本身是 JSON）
4. toolCode 须匹配 ^[a-z][a-z0-9_]*$
5. riskLevel 仅 low | medium | high

输出 JSON 字段（全部给出）：
name, description, toolCode, intentTags(string[]), priority(number), riskLevel, needConfirmation(boolean), timeoutMs(number),
permissionScope(string|omit), parametersText(string), invokeMethod("GET"|"POST"), invokePath(string),
invokeTimeoutMs(number|omit), queryMappingText(string), bodyMappingText(string),
responseType, successPath, successValue(string), fieldMappingText(string), replyTextPath(string|omit), rationale(string)`;

    const userPrompt = [
      dto.instruction?.trim() ? `润色要求：${dto.instruction.trim()}` : '请根据当前草稿补全并润色配置。',
      `当前草稿：\n${JSON.stringify(dto.draft, null, 2)}`,
    ].join('\n\n');

    const completion = await this.llm.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const raw = this.parseJsonObject(completion.text);
    const warnings: string[] = [];
    const draft: Record<string, unknown> = {};

    for (const key of FORM_KEYS) {
      if (raw[key] !== undefined && raw[key] !== null) {
        draft[key] = raw[key];
      }
    }

    this.assertJsonTextField(draft.parametersText, 'parametersText', warnings);
    this.assertJsonTextField(draft.queryMappingText, 'queryMappingText', warnings, false);
    this.assertJsonTextField(draft.bodyMappingText, 'bodyMappingText', warnings, false);
    this.assertJsonTextField(draft.fieldMappingText, 'fieldMappingText', warnings, false);

    if (typeof draft.toolCode === 'string' && !/^[a-z][a-z0-9_]*$/.test(draft.toolCode)) {
      warnings.push('toolCode 格式无效，请手动修正');
    }

    if (!draft.name && !draft.toolCode) {
      throw new BadRequestException({
        code: 'HTTP_QUERY_AI_EMPTY',
        message: '模型未生成有效配置，请补充名称或描述后重试',
      });
    }

    const rationale =
      typeof raw.rationale === 'string' && raw.rationale.trim()
        ? raw.rationale.trim()
        : '已根据当前内容生成配置，保存前请核对 path 与 JSON 映射。';

    return {
      draft,
      rationale,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private parseJsonObject(text: string): LlmPolishPayload {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fence?.[1] ?? trimmed).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
      this.logger.warn(`HTTP 查询工具 AI 响应非 JSON: ${trimmed.slice(0, 200)}`);
      throw new BadRequestException({
        code: 'HTTP_QUERY_AI_PARSE_ERROR',
        message: '模型返回格式无效，请重试',
      });
    }
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as LlmPolishPayload;
    } catch {
      throw new BadRequestException({
        code: 'HTTP_QUERY_AI_PARSE_ERROR',
        message: '模型返回 JSON 解析失败，请重试',
      });
    }
  }

  private assertJsonTextField(
    value: unknown,
    field: string,
    warnings: string[],
    required = true,
  ) {
    if (value === undefined || value === null || value === '') {
      if (required) warnings.push(`${field} 为空`);
      return;
    }
    if (typeof value !== 'string') {
      warnings.push(`${field} 不是字符串`);
      return;
    }
    try {
      JSON.parse(value);
    } catch {
      warnings.push(`${field} 不是合法 JSON`);
    }
  }
}
