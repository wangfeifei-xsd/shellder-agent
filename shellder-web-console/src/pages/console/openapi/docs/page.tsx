'use client';

import { Button, Card, Collapse, Descriptions, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';

interface EndpointRow {
  method: string;
  path: string;
  description: string;
  auth: string;
}

interface ErrorCodeRow {
  code: string;
  status: number;
  description: string;
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
};

const endpointColumns: ColumnsType<EndpointRow> = [
  withNowrap<EndpointRow>({
    title: '方法',
    dataIndex: 'method',
    width: 80,
    render: (v: string) => <Tag color={METHOD_COLOR[v] ?? 'default'}>{v}</Tag>,
  }),
  ellipsisTextColumn<EndpointRow>('路径', 'path', 320),
  ellipsisTextColumn<EndpointRow>('描述', 'description', 200),
  ellipsisTextColumn<EndpointRow>('鉴权', 'auth', 200),
];

const errorCodeColumns: ColumnsType<ErrorCodeRow> = [
  ellipsisTextColumn<ErrorCodeRow>('错误码', 'code', 280),
  withNowrap<ErrorCodeRow>({
    title: 'HTTP 状态',
    dataIndex: 'status',
    width: 100,
    render: (v: number) => (
      <Tag color={v >= 400 && v < 500 ? 'warning' : 'error'}>{v}</Tag>
    ),
  }),
  ellipsisTextColumn<ErrorCodeRow>('描述', 'description', 240),
];

const endpoints: EndpointRow[] = [
  { method: 'POST', path: '/openapi/v1/auth/token', description: '应用鉴权，换取 Token', auth: 'Client ID + Client Secret' },
  { method: 'POST', path: '/openapi/v1/sessions', description: '创建会话', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/sessions/:id', description: '获取会话历史', auth: 'Bearer Token' },
  { method: 'POST', path: '/openapi/v1/sessions/:id/messages', description: '发送消息', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/sessions/:id/stream', description: 'SSE 流式结果订阅', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/tasks/:id', description: '查询任务状态', auth: 'Bearer Token' },
  { method: 'POST', path: '/openapi/v1/confirmations/:id', description: '提交人工确认结果', auth: 'Bearer Token' },
];

const errorCodes: ErrorCodeRow[] = [
  { code: 'OPENAPI_UNAUTHENTICATED', status: 401, description: '缺少或无效的访问令牌' },
  { code: 'OPENAPI_INVALID_CREDENTIALS', status: 401, description: 'Client ID 或 Secret 不正确' },
  { code: 'OPENAPI_APP_DISABLED', status: 403, description: '接入应用已被禁用' },
  { code: 'OPENAPI_TENANT_FORBIDDEN', status: 403, description: '应用无权访问此租户' },
  { code: 'TENANT_DISABLED', status: 403, description: '租户已禁用' },
  { code: 'TENANT_NOT_FOUND', status: 404, description: '租户不存在' },
  { code: 'SESSION_NOT_FOUND', status: 404, description: '会话不存在' },
  { code: 'TASK_NOT_FOUND', status: 404, description: '任务不存在' },
  { code: 'APPROVAL_NOT_FOUND', status: 404, description: '审批记录不存在' },
  { code: 'APPROVAL_ALREADY_PROCESSED', status: 403, description: '审批已处理' },
];

const AUTH_REQUEST_SAMPLE = `{
  "clientId": "sk_xxxx...",
  "clientSecret": "xxxx..."
}`;

const AUTH_RESPONSE_SAMPLE = `{
  "accessToken": "eyJhbGci...",
  "tokenType": "Bearer",
  "expiresIn": "2h",
  "app": { "id": "...", "name": "...", "allowedTenantIds": [...], "allowedCapabilities": [...] }
}`;

const SESSION_CREATE_REQUEST_SAMPLE = `{
  "tenantId": "租户ID（或传 externalTenantId）",
  "title": "可选标题"
}`;

const SESSION_CREATE_RESPONSE_SAMPLE = `{
  "id": "会话ID",
  "tenantId": "...",
  "title": "...",
  "status": "active",
  "createdAt": "..."
}`;

const MESSAGE_SEND_REQUEST_SAMPLE = `{
  "content": "用户消息内容"
}`;

const CONFIRMATION_REQUEST_SAMPLE = `{
  "action": "approve | reject",
  "opinion": "可选审批意见"
}`;

function buildOpenApiDocsMarkdown() {
  const endpointTable = [
    '| 方法 | 路径 | 描述 | 鉴权 |',
    '| --- | --- | --- | --- |',
    ...endpoints.map((item) => `| ${item.method} | ${item.path} | ${item.description} | ${item.auth} |`),
  ].join('\n');

  const errorCodeTable = [
    '| 错误码 | HTTP 状态 | 描述 |',
    '| --- | --- | --- |',
    ...errorCodes.map((item) => `| ${item.code} | ${item.status} | ${item.description} |`),
  ].join('\n');

  return `# OpenAPI 接口文档

shellder-agent 对外开放的 REST / SSE API，供第三方系统接入。

## 鉴权说明

- 鉴权方式：Client Credentials -> Bearer Token
- Token 获取：POST /openapi/v1/auth/token，请求体 { clientId, clientSecret }，返回 { accessToken, tokenType, expiresIn }
- 后续请求：在请求头中添加 Authorization: Bearer <accessToken>
- 租户映射：请求可传 tenantId（Agent 平台 ID）或 externalTenantId（上层业务标识）；服务端映射为 tenant.id，无匹配返回 404

## 接口清单

${endpointTable}

## 示例

### POST /openapi/v1/auth/token — 应用鉴权

请求体：
\`\`\`json
${AUTH_REQUEST_SAMPLE}
\`\`\`

响应：
\`\`\`json
${AUTH_RESPONSE_SAMPLE}
\`\`\`

### POST /openapi/v1/sessions — 创建会话

请求体：
\`\`\`json
${SESSION_CREATE_REQUEST_SAMPLE}
\`\`\`

响应：
\`\`\`json
${SESSION_CREATE_RESPONSE_SAMPLE}
\`\`\`

### POST /openapi/v1/sessions/:id/messages — 发送消息

请求体：
\`\`\`json
${MESSAGE_SEND_REQUEST_SAMPLE}
\`\`\`

### GET /openapi/v1/sessions/:id/stream — SSE 流式

- 返回 Server-Sent Events 流，事件格式与 Agent Runtime（阶段 12）一致。
- 事件类型：
  - \`session.connected\`：连接成功，附带会话状态
  - \`message\`：消息事件（含 role/type/content/seq）
  - \`session.snapshot_end\`：历史消息快照传输完成

### POST /openapi/v1/confirmations/:id — 人工确认

请求体：
\`\`\`json
${CONFIRMATION_REQUEST_SAMPLE}
\`\`\`

## 错误码说明

${errorCodeTable}
`;
}

export default function OpenApiDocsPage() {
  const markdown = buildOpenApiDocsMarkdown();

  const handleCopyPage = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      message.success('页面内容已复制（Markdown）');
    } catch {
      message.error('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const handleExportMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'openapi-docs.md';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    message.success('已导出 Markdown');
  };

  return (
    <>
      <Typography.Title level={3}>OpenAPI 接口文档</Typography.Title>
      <Space className="mb-3">
        <Button onClick={handleCopyPage}>复制页面</Button>
        <Button onClick={handleExportMarkdown}>导出为 md</Button>
      </Space>
      <Typography.Paragraph type="secondary">
        shellder-agent 对外开放的 REST / SSE API，供第三方系统接入。
      </Typography.Paragraph>

      <Card title="鉴权说明" className="mb-4">
        <Descriptions column={1}>
          <Descriptions.Item label="鉴权方式">
            Client Credentials → Bearer Token
          </Descriptions.Item>
          <Descriptions.Item label="Token 获取">
            POST /openapi/v1/auth/token，请求体 {'{'} clientId, clientSecret {'}'} → 返回 {'{'} accessToken, tokenType, expiresIn {'}'}
          </Descriptions.Item>
          <Descriptions.Item label="后续请求">
            在请求头中添加 Authorization: Bearer {'<accessToken>'}
          </Descriptions.Item>
          <Descriptions.Item label="租户映射">
            请求可传 tenantId（Agent 平台 ID）或 externalTenantId（上层业务标识）；服务端映射为 tenant.id，无匹配返回 404
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="接口清单" className="mb-4">
        <Table
          rowKey="path"
          dataSource={endpoints}
          pagination={false}
          size="small"
          {...tableEllipsisLayout}
          columns={endpointColumns}
        />
      </Card>

      <Collapse
        className="mb-4"
        items={[
          {
            key: 'auth',
            label: 'POST /openapi/v1/auth/token — 应用鉴权',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{AUTH_REQUEST_SAMPLE}</pre>
                <Typography.Title level={5}>响应</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{AUTH_RESPONSE_SAMPLE}</pre>
              </div>
            ),
          },
          {
            key: 'session-create',
            label: 'POST /openapi/v1/sessions — 创建会话',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{SESSION_CREATE_REQUEST_SAMPLE}</pre>
                <Typography.Title level={5}>响应</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{SESSION_CREATE_RESPONSE_SAMPLE}</pre>
              </div>
            ),
          },
          {
            key: 'message-send',
            label: 'POST /openapi/v1/sessions/:id/messages — 发送消息',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{MESSAGE_SEND_REQUEST_SAMPLE}</pre>
              </div>
            ),
          },
          {
            key: 'sse',
            label: 'GET /openapi/v1/sessions/:id/stream — SSE 流式',
            children: (
              <div>
                <Typography.Paragraph>
                  返回 Server-Sent Events 流，事件格式与 Agent Runtime（阶段 12）一致。
                </Typography.Paragraph>
                <Typography.Title level={5}>事件类型</Typography.Title>
                <ul className="list-disc pl-5">
                  <li><code>session.connected</code> — 连接成功，附带会话状态</li>
                  <li><code>message</code> — 消息事件（含 role/type/content/seq）</li>
                  <li><code>session.snapshot_end</code> — 历史消息快照传输完成</li>
                </ul>
              </div>
            ),
          },
          {
            key: 'confirmation',
            label: 'POST /openapi/v1/confirmations/:id — 人工确认',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{CONFIRMATION_REQUEST_SAMPLE}</pre>
              </div>
            ),
          },
        ]}
      />

      <Card title="错误码说明">
        <Table
          rowKey="code"
          dataSource={errorCodes}
          pagination={false}
          size="small"
          {...tableEllipsisLayout}
          columns={errorCodeColumns}
        />
      </Card>
    </>
  );
}
