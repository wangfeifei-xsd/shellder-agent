'use client';

import { Card, Collapse, Descriptions, Table, Tag, Typography } from 'antd';

const endpoints = [
  { method: 'POST', path: '/openapi/v1/auth/token', description: '应用鉴权，换取 Token', auth: 'Client ID + Client Secret' },
  { method: 'POST', path: '/openapi/v1/sessions', description: '创建会话', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/sessions/:id', description: '获取会话历史', auth: 'Bearer Token' },
  { method: 'POST', path: '/openapi/v1/sessions/:id/messages', description: '发送消息', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/sessions/:id/stream', description: 'SSE 流式结果订阅', auth: 'Bearer Token' },
  { method: 'GET', path: '/openapi/v1/tasks/:id', description: '查询任务状态', auth: 'Bearer Token' },
  { method: 'POST', path: '/openapi/v1/confirmations/:id', description: '提交人工确认结果', auth: 'Bearer Token' },
];

const errorCodes = [
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

const METHOD_COLOR: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
};

export default function OpenApiDocsPage() {
  return (
    <>
      <Typography.Title level={3}>OpenAPI 接口文档</Typography.Title>
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
          columns={[
            {
              title: '方法',
              dataIndex: 'method',
              width: 80,
              render: (v: string) => (
                <Tag color={METHOD_COLOR[v] ?? 'default'}>{v}</Tag>
              ),
            },
            { title: '路径', dataIndex: 'path', width: 320 },
            { title: '描述', dataIndex: 'description' },
            { title: '鉴权', dataIndex: 'auth', width: 200 },
          ]}
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
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "clientId": "sk_xxxx...",
  "clientSecret": "xxxx..."
}`}</pre>
                <Typography.Title level={5}>响应</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "accessToken": "eyJhbGci...",
  "tokenType": "Bearer",
  "expiresIn": "2h",
  "app": { "id": "...", "name": "...", "allowedTenantIds": [...], "allowedCapabilities": [...] }
}`}</pre>
              </div>
            ),
          },
          {
            key: 'session-create',
            label: 'POST /openapi/v1/sessions — 创建会话',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "tenantId": "租户ID（或传 externalTenantId）",
  "title": "可选标题"
}`}</pre>
                <Typography.Title level={5}>响应</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "id": "会话ID",
  "tenantId": "...",
  "title": "...",
  "status": "active",
  "createdAt": "..."
}`}</pre>
              </div>
            ),
          },
          {
            key: 'message-send',
            label: 'POST /openapi/v1/sessions/:id/messages — 发送消息',
            children: (
              <div>
                <Typography.Title level={5}>请求体</Typography.Title>
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "content": "用户消息内容"
}`}</pre>
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
                <pre className="bg-gray-50 p-3 rounded text-sm">{`{
  "action": "approve | reject",
  "opinion": "可选审批意见"
}`}</pre>
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
          columns={[
            { title: '错误码', dataIndex: 'code', width: 280 },
            {
              title: 'HTTP 状态',
              dataIndex: 'status',
              width: 100,
              render: (v: number) => (
                <Tag color={v >= 400 && v < 500 ? 'warning' : 'error'}>{v}</Tag>
              ),
            },
            { title: '描述', dataIndex: 'description' },
          ]}
        />
      </Card>
    </>
  );
}
