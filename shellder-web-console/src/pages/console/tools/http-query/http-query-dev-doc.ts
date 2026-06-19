import type { HttpQueryParameter, HttpQueryToolConfig, Tool } from '@/lib/tool';

export interface HttpQueryDevDocInput {
  toolCode: string;
  toolName: string;
  description?: string | null;
  intentTags?: string[];
  priority?: number;
  timeoutMs?: number;
  connectorName?: string | null;
  connectorTarget?: string | null;
  tenantName?: string | null;
  parameters?: HttpQueryParameter[];
  httpQuery?: HttpQueryToolConfig;
}

const RESPONSE_TYPE_LABEL: Record<string, string> = {
  play_audio: '播放音频（play_audio）',
  text_reply: '文本回复（text_reply）',
  json_data: '通用 JSON（json_data）',
};

const RESPONSE_TYPE_HINT: Record<string, string> = {
  play_audio: 'Runtime 将 `audio_url` 等字段写入工具结果，供表现层播放音频。',
  text_reply: 'Runtime 优先使用 `reply_text` 或 `replyTextPath` 指向的字段作为对话回复。',
  json_data: 'Runtime 将 `fieldMapping` 映射结果写入工具结果 data。',
};

function mdEscapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function resolveMappingSource(mapping: string): string {
  if (mapping.startsWith('$context.')) {
    const key = mapping.slice('$context.'.length);
    const labels: Record<string, string> = {
      tenantId: '对话上下文 · 租户 ID（`tenantId`）',
      userId: '对话上下文 · 用户 ID（`userId`）',
      callerName: '对话上下文 · 调用方名称（`callerName`）',
      sessionId: '对话上下文 · 会话 ID（`sessionId`）',
    };
    return labels[key] ?? `对话上下文 · \`${key}\``;
  }
  return `LLM 抽取入参 · \`${mapping}\`（见 parameters）`;
}

function buildParametersSection(parameters: HttpQueryParameter[]): string {
  const lines = [
    '## 1. parameters — 工具入参',
    '',
    '由主对话 LLM 根据用户话术抽取，写入信号 `[查询工具:{tool_code} {params_json}]` 的 JSON 对象。',
    '**业务系统不直接接收该结构**；Shellder Agent 执行器会按 `invoke.queryMapping` / `invoke.bodyMapping` 映射为 HTTP 请求参数。',
    '',
  ];

  if (!parameters.length) {
    lines.push('当前未定义入参。', '');
    return lines.join('\n');
  }

  lines.push('| 参数名 (name) | 类型 | 必填 | 说明 |', '| --- | --- | --- | --- |');
  for (const p of parameters) {
    lines.push(
      `| \`${mdEscapeCell(p.name)}\` | ${p.type ?? 'string'} | ${p.required ? '是' : '否'} | ${mdEscapeCell(p.description ?? '-')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function buildMappingTable(
  title: string,
  mapping: Record<string, string> | undefined,
  emptyHint: string,
): string {
  const lines = [title, ''];
  const entries = mapping ? Object.entries(mapping) : [];
  if (!entries.length) {
    lines.push(emptyHint, '');
    return lines.join('\n');
  }
  lines.push('| HTTP 参数名 | 值来源 |', '| --- | --- |');
  for (const [key, mappingVal] of entries) {
    lines.push(`| \`${mdEscapeCell(key)}\` | ${resolveMappingSource(String(mappingVal))} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildInvokeSection(input: HttpQueryDevDocInput, invoke: HttpQueryToolConfig['invoke']): string {
  const method = invoke.method?.toUpperCase() ?? 'GET';
  const path = invoke.path ?? '';
  const timeoutMs = invoke.timeoutMs ?? input.timeoutMs ?? 10000;
  const baseUrl = input.connectorTarget?.trim() || '{HTTP 连接器.target}';
  const normalizedPath = path.startsWith('/') ? path : path ? `/${path}` : '';

  const lines = [
    '## 2. invoke — 业务系统 HTTP 请求约定',
    '',
    'Shellder Agent 查询工具执行器按下列配置调用**业务系统 HTTP 接口**（完整 URL 由关联 HTTP 连接器的 `target` 与 `path` 拼装，不暴露给 LLM）。',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| HTTP 方法 | \`${method}\` |`,
    `| base_url（连接器 target） | \`${mdEscapeCell(baseUrl)}\` |`,
    `| path | \`${mdEscapeCell(path)}\` |`,
    `| 关联连接器 | ${input.connectorName ? mdEscapeCell(input.connectorName) : '（未绑定）'} |`,
    `| 超时 (timeoutMs) | ${timeoutMs} ms |`,
    '',
  ];

  if (!input.connectorTarget) {
    lines.push(
      '> `base_url` 取自控制台「HTTP 连接器」的 **target** 字段（如 `https://api.example.com`），请在连接器配置中维护。',
      '',
    );
  }

  lines.push(buildMappingTable('### Query 参数映射（queryMapping）', invoke.queryMapping, '未配置 query 参数映射。'));
  lines.push(
    buildMappingTable('### Body 参数映射（bodyMapping）', invoke.bodyMapping, '未配置 body 参数映射（GET 请求通常无需 body）。'),
  );

  const queryEntries = invoke.queryMapping ? Object.entries(invoke.queryMapping) : [];
  const exampleParams = queryEntries
    .filter(([, v]) => !String(v).startsWith('$context.'))
    .map(([k, v]) => `${k}={${String(v)}}`)
    .join('&');
  const contextParams = queryEntries
    .filter(([, v]) => String(v).startsWith('$context.'))
    .map(([k]) => `${k}={...}`)
    .join('&');
  const queryExample = [exampleParams, contextParams].filter(Boolean).join('&');
  const urlExample = `${baseUrl}${normalizedPath}${queryExample ? `?${queryExample}` : ''}`;

  lines.push('### 请求 URL 示例', '', '```', urlExample, '```', '');
  if (method !== 'GET' && method !== 'HEAD' && invoke.bodyMapping && Object.keys(invoke.bodyMapping).length) {
    const bodyExample: Record<string, string> = {};
    for (const [k, v] of Object.entries(invoke.bodyMapping)) {
      bodyExample[k] = String(v).startsWith('$context.') ? `{${v}}` : `{${v}}`;
    }
    lines.push('### 请求 Body 示例（POST/PUT 等）', '', '```json', formatJson(bodyExample), '```', '');
  }

  return lines.join('\n');
}

function buildResponseExample(
  response: HttpQueryToolConfig['response'],
  fieldMapping: Record<string, string>,
): string {
  const example: Record<string, unknown> = {};
  const successPath = response.successPath ?? null;
  const successValue = response.successValue;

  if (successPath === '$.code') {
    example.code = successValue ?? 0;
  }

  const data: Record<string, unknown> = {};
  for (const [internalKey, jsonPath] of Object.entries(fieldMapping)) {
    const path = String(jsonPath);
    const leaf = path.split('.').pop()?.replace(/^\$\.?/, '') ?? internalKey;
    const camel = leaf.includes('_')
      ? leaf.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      : leaf;
    if (internalKey === 'reply_text') {
      data[camel] = '（可选）面向用户的回复文案';
    } else if (internalKey === 'audio_url') {
      data[camel] = 'https://example.com/audio.mp3';
    } else {
      data[camel] = `（${internalKey}）`;
    }
  }
  if (Object.keys(data).length) {
    example.data = data;
  }
  return formatJson(example);
}

function buildResponseSection(response: HttpQueryToolConfig['response']): string {
  const responseType = response.type ?? 'json_data';
  const fieldMapping = response.fieldMapping ?? {};

  const lines = [
    '## 3. response — 业务系统 HTTP 返回值约定',
    '',
    '业务接口应返回 **JSON** 响应体；Shellder Agent 按下列规则判定成功并提取字段。',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| 响应类型 (type) | ${RESPONSE_TYPE_LABEL[responseType] ?? responseType} |`,
  ];

  if (response.successPath != null) {
    lines.push(`| 成功字段 (successPath) | \`${response.successPath}\` |`);
    lines.push(`| 成功值 (successValue) | \`${response.successValue ?? '（任意非空）'}\` |`);
  } else {
    lines.push('| 成功判定 | 未配置 successPath，HTTP 2xx 且可解析 JSON 即视为成功 |');
  }

  if (response.replyTextPath) {
    lines.push(`| 回复文本路径 (replyTextPath) | \`${response.replyTextPath}\` |`);
  }

  lines.push('');
  if (RESPONSE_TYPE_HINT[responseType]) {
    lines.push(`> ${RESPONSE_TYPE_HINT[responseType]}`, '');
  }

  lines.push('### 字段映射（fieldMapping）', '');
  const mappingEntries = Object.entries(fieldMapping);
  if (!mappingEntries.length) {
    lines.push('未配置字段映射。', '');
  } else {
    lines.push('| Shellder 内部字段 | 业务 JSON JSONPath |', '| --- | --- |');
    for (const [internalKey, jsonPath] of mappingEntries) {
      lines.push(`| \`${mdEscapeCell(internalKey)}\` | \`${mdEscapeCell(String(jsonPath))}\` |`);
    }
    lines.push('');
  }

  lines.push(
    '### 期望响应 JSON 示例（仅供参考）',
    '',
    '```json',
    buildResponseExample(response, fieldMapping),
    '```',
    '',
  );
  return lines.join('\n');
}

export function toolToHttpQueryDevDocInput(
  tool: Pick<Tool, 'name' | 'description' | 'timeoutMs' | 'config' | 'connector'>,
  opts?: { connectorTarget?: string | null; tenantName?: string | null },
): HttpQueryDevDocInput {
  const hq = tool.config.httpQuery;
  if (!hq) {
    throw new Error('该工具不是 HTTP 查询工具');
  }
  return {
    toolCode: hq.toolCode,
    toolName: tool.name,
    description: tool.description,
    intentTags: hq.intentTags,
    priority: hq.priority,
    timeoutMs: tool.timeoutMs,
    connectorName: tool.connector?.name,
    connectorTarget: opts?.connectorTarget ?? null,
    tenantName: opts?.tenantName ?? null,
    parameters: hq.parameters,
    httpQuery: hq,
  };
}

export function buildHttpQueryDevDocMarkdown(input: HttpQueryDevDocInput): string {
  const hq = input.httpQuery;
  if (!hq) {
    throw new Error('缺少 httpQuery 配置');
  }

  const parameters = input.parameters ?? hq.parameters ?? [];
  const invoke = hq.invoke;
  const response = hq.response;
  const intentTags = input.intentTags ?? [];
  const exportedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const lines = [
    `# ${input.toolName}（\`${input.toolCode}\`）— 业务接口对接说明`,
    '',
    '> 由 Shellder Agent 查询工具配置导出，供业务系统开发 HTTP 接口使用。',
    '',
    '## 文档说明',
    '',
    '| 配置段 | 含义 | 谁负责 |',
    '| --- | --- | --- |',
    '| **parameters** | 工具入参定义（LLM 从用户话术抽取） | Shellder 配置；业务侧通过 queryMapping/bodyMapping 间接使用 |',
    '| **invoke** | Shellder 如何请求业务 HTTP 接口 | 业务系统实现接口；Shellder 按配置调用 |',
    '| **response** | 业务 HTTP 接口应返回的 JSON 结构与映射 | **业务系统实现**；Shellder 按配置解析 |',
    '',
    '## 工具概要',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| toolCode | \`${input.toolCode}\` |`,
    `| 名称 | ${input.toolName} |`,
    `| 类型 | HTTP 业务查询（\`http_query\`） |`,
    `| 说明 | ${input.description?.trim() ? mdEscapeCell(input.description) : '-'} |`,
    `| 意图标签 | ${intentTags.length ? intentTags.map((t) => `\`${t}\``).join('、') : '-'} |`,
    `| 优先级 | ${input.priority ?? 0} |`,
    `| 租户 | ${input.tenantName?.trim() ? mdEscapeCell(input.tenantName) : '-'} |`,
    `| 导出时间 | ${exportedAt} |`,
    '',
    buildParametersSection(parameters),
    buildInvokeSection(input, invoke),
    buildResponseSection(response),
    '## 附录：完整配置 JSON',
    '',
    '```json',
    formatJson({
      toolCode: input.toolCode,
      name: input.toolName,
      description: input.description,
      intentTags,
      priority: input.priority,
      parameters,
      invoke,
      response,
    }),
    '```',
    '',
  ];

  return lines.join('\n');
}

export function downloadHttpQueryDevDoc(input: HttpQueryDevDocInput): void {
  const markdown = buildHttpQueryDevDocMarkdown(input);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${input.toolCode || 'http-query'}-integration.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
