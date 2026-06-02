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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  EllipsisCell,
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { ToolTestResultView } from '@/components/console/ToolTestResultView';
import {
  SqlTemplate,
  Tool,
  ToolDetail,
  Nl2SqlPreviewResult,
  QueryE2ePreviewResult,
  ToolTestResult,
  getTool,
  listTools,
  nl2sqlPreviewTool,
  queryE2ePreviewTool,
  sqlTestTool,
  updateTool,
} from '@/lib/tool';

type QueryTestLocationState = {
  toolId?: string;
  sql?: string;
  paramsText?: string;
};

export default function QueryTestPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const location = useLocation();
  const navState = (location.state as QueryTestLocationState | null) ?? {};
  const sqlExecRef = useRef<HTMLDivElement>(null);

  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(navState.toolId);
  const [selected, setSelected] = useState<ToolDetail | undefined>();
  const [loading, setLoading] = useState(false);

  const [nlMessage, setNlMessage] = useState('');
  const [nlPreview, setNlPreview] = useState<Nl2SqlPreviewResult | undefined>();
  const [e2eResult, setE2eResult] = useState<QueryE2ePreviewResult | undefined>();
  const [nlLoading, setNlLoading] = useState(false);
  const [e2eRunning, setE2eRunning] = useState(false);

  const [sql, setSql] = useState(navState.sql ?? '');
  const [paramsText, setParamsText] = useState(navState.paramsText ?? '{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolTestResult | undefined>();

  const [tplForm] = Form.useForm<{ name: string; sql: string; description?: string }>();
  const [savingTpl, setSavingTpl] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const loadTools = useCallback(async () => {
    if (!activeTenantId) {
      setTools([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listTools({ tenantId: activeTenantId, type: 'query', pageSize: 100 });
      setTools(res.items.filter((t) => t.type === 'query'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载查询型工具失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const loadToolDetail = useCallback(
    async (id: string) => {
      try {
        const detail = await getTool(id);
        if (detail.type !== 'query') {
          message.error('仅支持查询型（数据库连接）工具');
          setSelected(undefined);
          return;
        }
        setSelected(detail);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载工具失败');
        setSelected(undefined);
      }
    },
    [message],
  );

  const selectTool = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setE2eResult(undefined);
      setNlPreview(undefined);
      setResult(undefined);
      await loadToolDetail(id);
    },
    [loadToolDetail],
  );

  useEffect(() => {
    if (navState.toolId) {
      void selectTool(navState.toolId);
    }
  }, [navState.toolId, selectTool]);

  useEffect(() => {
    if (navState.sql) setSql(navState.sql);
    if (navState.paramsText) setParamsText(navState.paramsText);
  }, [navState.sql, navState.paramsText]);

  const sqlConfig = selected?.config.sql;
  const templates = sqlConfig?.templates ?? [];

  const applySqlForTest = (sqlText: string, params?: Record<string, unknown>) => {
    setSql(sqlText);
    setParamsText(
      params && Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : '{}',
    );
    sqlExecRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const runTest = async () => {
    if (!selected) return;
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText) as Record<string, unknown>;
    } catch {
      message.error('参数不是合法 JSON');
      return;
    }
    if (!sql.trim()) {
      message.warning('请输入 SQL');
      return;
    }
    setRunning(true);
    try {
      setResult(await sqlTestTool(selected.id, { sql, params }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'SQL 测试失败');
    } finally {
      setRunning(false);
    }
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
      width: 120,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => applySqlForTest(row.sql)}>填入 SQL 执行</a>
          <a className="text-red-500" onClick={() => deleteTemplate(row)}>
            删除
          </a>
        </Space>
      ),
    }),
  ];

  return (
    <>
      <Typography.Title level={3}>查询测试</Typography.Title>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="查询测试按租户隔离；请仅选择「数据库连接工具」中注册的查询型 Tool。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description={
              <>
                选择查询型 Tool 后，可试跑 NL2SQL 三步流水线、管理 SQL 模板，并直连只读库执行 SELECT
                验证约束。工具管理侧按连接器调试请前往
                <Link to="/tools/sql" className="mx-1">
                  查询通道调试
                </Link>
                。
              </>
            }
          />

          <Space className="mb-4" wrap>
            <Select
              showSearch
              placeholder="选择数据库连接工具（查询型）"
              style={{ width: 320 }}
              loading={loading}
              value={selectedId}
              onChange={(id) => void selectTool(id)}
              optionFilterProp="label"
              options={tools.map((t) => ({ value: t.id, label: t.name }))}
              notFoundContent={
                <Empty
                  description={
                    <>
                      该租户暂无数据库连接工具，请先在
                      <Link to="/query/db-channel-tools">数据库连接工具</Link> 中创建
                    </>
                  }
                />
              }
            />
          </Space>

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
                      <a
                        onClick={() => applySqlForTest(nlPreview.sql, nlPreview.params)}
                      >
                        填入下方 SQL 执行
                      </a>
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

              <div ref={sqlExecRef} className="lg:col-span-2">
              <Card title="SQL 执行" size="small">
                <Typography.Text type="secondary" className="text-xs">
                  仅 SELECT；命名参数用 :name。直连只读库验证连接器与约束（表白名单、行数上限等）。
                </Typography.Text>
                <Input.TextArea
                  rows={6}
                  className="mt-2 font-mono text-xs"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="SELECT id, amount FROM orders WHERE dt = :dt"
                />
                <Typography.Text type="secondary" className="mt-3 block text-xs">
                  参数（JSON）
                </Typography.Text>
                <Input.TextArea
                  rows={3}
                  className="mt-1 font-mono text-xs"
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                />
                <Button
                  className="mt-3"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={running}
                  onClick={() => void runTest()}
                >
                  执行查询
                </Button>
              </Card>
              </div>

              {result && (
                <Card title="测试结果" size="small" className="lg:col-span-2">
                  <ToolTestResultView result={result} />
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
