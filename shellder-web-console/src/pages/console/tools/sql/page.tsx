'use client';

import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EllipsisCell,
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { Connector, listConnectors } from '@/lib/connector';
import {
  SqlTemplate,
  Tool,
  ToolDetail,
  Nl2SqlPreviewResult,
  QueryE2ePreviewResult,
  getTool,
  fetchAllTools,
  nl2sqlPreviewTool,
  queryE2ePreviewTool,
  updateTool,
} from '@/lib/tool';

function pickChannelTool(tools: Tool[]): Tool | undefined {
  const enabled = tools.filter((t) => t.status === 'enabled');
  return (enabled.length ? enabled : tools)[0];
}

export default function SqlToolPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [toolsByConnector, setToolsByConnector] = useState<Record<string, Tool[]>>({});
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>();
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>();
  const [selected, setSelected] = useState<ToolDetail | undefined>();
  const [loading, setLoading] = useState(false);

  const [nlMessage, setNlMessage] = useState('');
  const [nlPreview, setNlPreview] = useState<Nl2SqlPreviewResult | undefined>();
  const [e2eResult, setE2eResult] = useState<QueryE2ePreviewResult | undefined>();
  const [nlLoading, setNlLoading] = useState(false);
  const [e2eRunning, setE2eRunning] = useState(false);

  const [tplForm] = Form.useForm<{ name: string; sql: string; description?: string }>();
  const [savingTpl, setSavingTpl] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const channelOptions = useMemo(() => {
    if (!selectedConnectorId) return [];
    return toolsByConnector[selectedConnectorId] ?? [];
  }, [selectedConnectorId, toolsByConnector]);

  const loadConnectorsAndChannels = useCallback(async () => {
    if (!activeTenantId) {
      setConnectors([]);
      setToolsByConnector({});
      return;
    }
    setLoading(true);
    try {
      const [connectorRes, toolRes] = await Promise.all([
        listConnectors({ tenantId: activeTenantId, type: 'db_readonly', pageSize: 100 }),
        fetchAllTools({ tenantId: activeTenantId, type: 'query' }),
      ]);
      const queryTools = toolRes.filter((t) => t.type === 'query');
      const byConnector: Record<string, Tool[]> = {};
      for (const t of queryTools) {
        if (!t.connectorId) continue;
        if (!byConnector[t.connectorId]) byConnector[t.connectorId] = [];
        byConnector[t.connectorId].push(t);
      }
      setConnectors(connectorRes.items);
      setToolsByConnector(byConnector);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载连接器失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => {
    void loadConnectorsAndChannels();
  }, [loadConnectorsAndChannels]);

  const loadToolDetail = useCallback(
    async (toolId: string) => {
      try {
        setSelected(await getTool(toolId));
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载查询通道失败');
        setSelected(undefined);
      }
    },
    [message],
  );

  const selectConnector = useCallback(
    async (connectorId: string) => {
      setSelectedConnectorId(connectorId);
      setE2eResult(undefined);
      setNlPreview(undefined);
      const channels = toolsByConnector[connectorId] ?? [];
      const tool = pickChannelTool(channels);
      if (!tool) {
        setSelectedChannelId(undefined);
        setSelected(undefined);
        return;
      }
      setSelectedChannelId(tool.id);
      await loadToolDetail(tool.id);
    },
    [toolsByConnector, loadToolDetail],
  );

  const selectChannel = useCallback(
    async (toolId: string) => {
      setSelectedChannelId(toolId);
      setE2eResult(undefined);
      setNlPreview(undefined);
      await loadToolDetail(toolId);
    },
    [loadToolDetail],
  );

  useEffect(() => {
    if (!selectedConnectorId || !toolsByConnector[selectedConnectorId]?.length) return;
    if (selectedChannelId && toolsByConnector[selectedConnectorId]?.some((t) => t.id === selectedChannelId)) {
      return;
    }
    void selectConnector(selectedConnectorId);
  }, [toolsByConnector, selectedConnectorId, selectedChannelId, selectConnector]);

  const sqlConfig = selected?.config.sql;
  const templates = sqlConfig?.templates ?? [];

  const queryTestLinkState = (sqlText: string, params?: Record<string, unknown>) => ({
    toolId: selected?.id,
    sql: sqlText,
    paramsText:
      params && Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : '{}',
  });

  const addTemplate = async () => {
    if (!selected || !sqlConfig) return;
    const v = await tplForm.validateFields();
    const next: SqlTemplate[] = [
      ...templates,
      { id: `tpl_${Date.now()}`, name: v.name, sql: v.sql, description: v.description },
    ];
    setSavingTpl(true);
    try {
      await updateTool(selected.id, { config: { sql: { ...sqlConfig, templates: next } } });
      message.success('模板已保存');
      tplForm.resetFields();
      await loadToolDetail(selected.id);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTpl(false);
    }
  };

  const runNl2SqlPreview = async () => {
    if (!selected) return;
    if (!nlMessage.trim()) {
      message.warning('请输入自然语言查询');
      return;
    }
    setNlLoading(true);
    setNlPreview(undefined);
    setE2eResult(undefined);
    try {
      setNlPreview(await nl2sqlPreviewTool(selected.id, nlMessage.trim()));
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'NL2SQL 生成失败');
    } finally {
      setNlLoading(false);
    }
  };

  const runQueryE2ePreview = async () => {
    if (!selected) return;
    if (!nlMessage.trim()) {
      message.warning('请输入自然语言查询');
      return;
    }
    setE2eRunning(true);
    setE2eResult(undefined);
    try {
      const preview = await queryE2ePreviewTool(selected.id, nlMessage.trim());
      setE2eResult(preview);
      setNlPreview(preview.nl2sql);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '三步试跑失败');
    } finally {
      setE2eRunning(false);
    }
  };

  const deleteTemplate = (tpl: SqlTemplate) => {
    if (!selected || !sqlConfig) return;
    modal.confirm({
      title: `删除模板「${tpl.name}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        const next = templates.filter((t) => t.id !== tpl.id);
        try {
          await updateTool(selected.id, { config: { sql: { ...sqlConfig, templates: next } } });
          message.success('已删除');
          await loadToolDetail(selected.id);
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const tplColumns: ColumnsType<SqlTemplate> = [
    ellipsisTextColumn<SqlTemplate>('名称', 'name', 160),
    withNowrap<SqlTemplate>({
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: (v: string) => (
        <EllipsisCell tooltip={v}>
          <Typography.Text className="text-xs font-mono">{v}</Typography.Text>
        </EllipsisCell>
      ),
    }),
    withNowrap<SqlTemplate>({
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <Link to="/query/query-test" state={queryTestLinkState(row.sql)}>
            在查询测试执行
          </Link>
          <a className="text-red-500" onClick={() => deleteTemplate(row)}>
            删除
          </a>
        </Space>
      ),
    }),
  ];

  const missingChannel =
    selectedConnectorId && !(toolsByConnector[selectedConnectorId]?.length ?? 0);

  return (
    <>
      <Typography.Title level={3}>查询通道调试</Typography.Title>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="按只读库连接器调试 NL2SQL 与三步流水线；查询型 Tool 在「数据库连接工具」中绑定连接器。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="请选择只读库连接器。Runtime 走 NL2SQL → 执行 → LLM 结果解读；只读 SQL 直连请在「『查询型』配置 → 查询测试」。"
          />

          <Space className="mb-4" wrap>
            <Select
              showSearch
              placeholder="选择只读库连接器"
              style={{ width: 320 }}
              loading={loading}
              value={selectedConnectorId}
              onChange={(id) => void selectConnector(id)}
              optionFilterProp="label"
              options={connectors.map((c) => ({ value: c.id, label: c.name }))}
              notFoundContent={<Empty description="该租户暂无只读库连接器" />}
            />
            {channelOptions.length > 1 && (
              <Select
                showSearch
                placeholder="选择查询通道"
                style={{ width: 280 }}
                value={selectedChannelId}
                onChange={(id) => void selectChannel(id)}
                optionFilterProp="label"
                options={channelOptions.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
          </Space>

          {missingChannel && (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message="该连接器尚未绑定查询通道"
              description={
                <>
                  请先在
                  <Link to="/query/db-channel-tools" className="mx-1">
                    数据库连接工具
                  </Link>
                  中创建并关联此连接器。
                </>
              }
            />
          )}

          {selected && sqlConfig && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="约束配置" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="查询通道">
                    <Tag>{selected.name}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="关联连接器">
                    {selected.connector ? (
                      <Tag>{selected.connector.name}</Tag>
                    ) : (
                      <Typography.Text type="danger">未关联只读库连接器</Typography.Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="ER 关系图（已发布）">
                    {selected.erPublishedSummary ? (
                      <Space direction="vertical" size={0}>
                        <span>
                          v{selected.erPublishedSummary.version ?? '—'} ·{' '}
                          {selected.erPublishedSummary.tableCount} 表 ·{' '}
                          {selected.erPublishedSummary.relationshipCount} 关系
                        </span>
                        {selected.erPublishedSummary.publishedAt && (
                          <Typography.Text type="secondary" className="text-xs">
                            {new Date(selected.erPublishedSummary.publishedAt).toLocaleString(
                              'zh-CN',
                            )}
                          </Typography.Text>
                        )}
                      </Space>
                    ) : (
                      <Typography.Text type="warning">
                        连接器未发布 ER 图（Runtime 不可用）
                      </Typography.Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="表黑名单">
                    {sqlConfig.tableBlacklist?.length ? (
                      <Space wrap>
                        {sqlConfig.tableBlacklist.map((t) => (
                          <Tag key={t} color="red">
                            {t}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      '未配置（不限制表，仅只读）'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="字段黑名单">
                    {sqlConfig.fieldBlacklist?.length ? (
                      <Space wrap>
                        {sqlConfig.fieldBlacklist.map((t) => (
                          <Tag key={t} color="red">
                            {t}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      '未配置'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="最大返回行数">{sqlConfig.maxRows}</Descriptions.Item>
                  <Descriptions.Item label="最大执行时长">
                    {sqlConfig.maxExecutionMs}ms
                  </Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph type="secondary" className="text-xs !mt-2 !mb-0">
                  约束修改请在
                  <Link to="/query/db-channel-tools" className="mx-1">
                    数据库连接工具
                  </Link>
                  中编辑；查询仅允许只读 SQL。
                </Typography.Paragraph>
              </Card>

              <Card title="三步试跑（NL2SQL → 执行 → 结果解读）" size="small">
                <Typography.Text type="secondary" className="text-xs">
                  与 Runtime 对齐：基于已发布 ER 生成 SQL、执行只读查询、LLM 生成自然语言回复。
                </Typography.Text>
                <Input.TextArea
                  rows={3}
                  className="mt-2"
                  value={nlMessage}
                  onChange={(e) => setNlMessage(e.target.value)}
                  placeholder="例如：查询最近 7 天的订单总数"
                />
                <Space className="mt-2" wrap>
                  <Button loading={nlLoading} onClick={() => void runNl2SqlPreview()}>
                    仅生成 SQL
                  </Button>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    loading={e2eRunning}
                    onClick={() => void runQueryE2ePreview()}
                  >
                    完整三步试跑
                  </Button>
                </Space>
                {nlPreview && (
                  <div className="mt-3 rounded border border-gray-100 bg-gray-50 p-3">
                    <Typography.Text type="secondary" className="text-xs">
                      步骤 ① — NL2SQL 说明
                    </Typography.Text>
                    <div className="mb-2 text-sm">{nlPreview.explanation || '—'}</div>
                    <Typography.Text type="secondary" className="text-xs">
                      生成 SQL
                    </Typography.Text>
                    <pre className="mt-1 overflow-auto whitespace-pre-wrap font-mono text-xs">
                      {nlPreview.sql}
                    </pre>
                    {nlPreview.referencedTables.length > 0 && (
                      <Space className="mt-2" wrap>
                        {nlPreview.referencedTables.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </Space>
                    )}
                    <div className="mt-2">
                      <Link
                        to="/query/query-test"
                        state={queryTestLinkState(nlPreview.sql, nlPreview.params)}
                      >
                        在查询测试中执行此 SQL
                      </Link>
                    </div>
                  </div>
                )}
                {e2eResult && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded border border-blue-100 bg-blue-50 p-3">
                      <Typography.Text type="secondary" className="text-xs">
                        步骤 ② — 查询结果（{e2eResult.execution.rowCount} 行，耗时{' '}
                        {e2eResult.execution.durationMs}ms）
                      </Typography.Text>
                      {e2eResult.execution.rowCount > 0 ? (
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">
                          {JSON.stringify(e2eResult.execution.rows.slice(0, 10), null, 2)}
                          {e2eResult.execution.rowCount > 10 &&
                            `\n… 共 ${e2eResult.execution.rowCount} 行`}
                        </pre>
                      ) : (
                        <div className="mt-1 text-sm text-gray-600">（无数据）</div>
                      )}
                    </div>
                    <div className="rounded border border-green-100 bg-green-50 p-3">
                      <Typography.Text type="secondary" className="text-xs">
                        步骤 ③ — LLM 回复
                        {e2eResult.reply.truncated &&
                          `（基于前 ${e2eResult.reply.displayedRowCount} 行解读）`}
                      </Typography.Text>
                      <div className="mt-1 whitespace-pre-wrap text-sm">{e2eResult.reply.text}</div>
                      <Typography.Text type="secondary" className="mt-2 block text-xs">
                        总耗时 {e2eResult.totalDurationMs}ms
                      </Typography.Text>
                    </div>
                  </div>
                )}
              </Card>

              <Card title="SQL 模板管理" size="small" className="lg:col-span-2">
                <Table
                  rowKey="id"
                  size="small"
                  columns={tplColumns}
                  dataSource={templates}
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无模板" /> }}
                  {...tableEllipsisLayout}
                />
                <Form form={tplForm} layout="vertical" className="mt-4">
                  <Space className="flex" align="start" size="large">
                    <Form.Item
                      label="模板名称"
                      name="name"
                      rules={[{ required: true, message: '请输入模板名称' }]}
                      style={{ width: 200 }}
                    >
                      <Input placeholder="如：按日期查订单" />
                    </Form.Item>
                    <Form.Item label="描述" name="description" style={{ width: 240 }}>
                      <Input placeholder="可选" />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    label="SQL"
                    name="sql"
                    rules={[{ required: true, message: '请输入 SQL' }]}
                  >
                    <Input.TextArea rows={3} className="font-mono text-xs" />
                  </Form.Item>
                  <Button icon={<PlusOutlined />} loading={savingTpl} onClick={addTemplate}>
                    新增模板
                  </Button>
                </Form>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
