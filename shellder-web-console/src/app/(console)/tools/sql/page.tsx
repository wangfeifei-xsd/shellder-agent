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
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { ToolTestResultView } from '@/components/console/ToolTestResultView';
import {
  SqlTemplate,
  Tool,
  ToolTestResult,
  getTool,
  listTools,
  sqlTestTool,
  updateTool,
} from '@/lib/tool';

export default function SqlToolPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selected, setSelected] = useState<Tool | undefined>();
  const [loading, setLoading] = useState(false);

  const [sql, setSql] = useState('');
  const [paramsText, setParamsText] = useState('{}');
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
      setTools(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载查询型工具失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const selectTool = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setResult(undefined);
      try {
        setSelected(await getTool(id));
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载工具失败');
      }
    },
    [message],
  );

  const sqlConfig = selected?.config.sql;
  const templates = sqlConfig?.templates ?? [];

  const runTest = async (overrideSql?: string) => {
    if (!selected) return;
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText) as Record<string, unknown>;
    } catch {
      message.error('参数不是合法 JSON');
      return;
    }
    const useSql = overrideSql ?? sql;
    if (!useSql.trim()) {
      message.warning('请输入 SQL 或选择模板执行');
      return;
    }
    setRunning(true);
    try {
      setResult(await sqlTestTool(selected.id, { sql: useSql, params }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'SQL 测试失败');
    } finally {
      setRunning(false);
    }
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
      await selectTool(selected.id);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTpl(false);
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
          await selectTool(selected.id);
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const tplColumns: ColumnsType<SqlTemplate> = [
    { title: '名称', dataIndex: 'name', width: 160 },
    {
      title: 'SQL',
      dataIndex: 'sql',
      render: (v: string) => <Typography.Text className="text-xs font-mono">{v}</Typography.Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <a
            onClick={() => {
              setSql(row.sql);
              void runTest(row.sql);
            }}
          >
            运行
          </a>
          <a onClick={() => setSql(row.sql)}>载入</a>
          <a className="text-red-500" onClick={() => deleteTemplate(row)}>
            删除
          </a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>SQL 查询工具</Typography.Title>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="SQL 查询工具按租户隔离配置。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="查询型工具仅经只读数据库连接器执行 SELECT；测试受表白名单、最大返回行数、最大执行时长约束。"
          />

          <Space className="mb-4" wrap>
            <Select
              showSearch
              placeholder="选择查询型工具"
              style={{ width: 320 }}
              loading={loading}
              value={selectedId}
              onChange={selectTool}
              optionFilterProp="label"
              options={tools.map((t) => ({ value: t.id, label: t.name }))}
              notFoundContent={<Empty description="该租户暂无查询型工具" />}
            />
          </Space>

          {selected && sqlConfig && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="约束配置" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="关联连接器">
                    {selected.connector ? (
                      <Tag>{selected.connector.name}</Tag>
                    ) : (
                      <Typography.Text type="danger">未关联只读库连接器</Typography.Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="表白名单">
                    {sqlConfig.tableWhitelist.length ? (
                      <Space wrap>
                        {sqlConfig.tableWhitelist.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="danger">未配置（禁止执行）</Typography.Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="字段白名单">
                    {sqlConfig.fieldWhitelist.length ? (
                      <Space wrap>
                        {sqlConfig.fieldWhitelist.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </Space>
                    ) : (
                      '不限制'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="最大返回行数">{sqlConfig.maxRows}</Descriptions.Item>
                  <Descriptions.Item label="最大执行时长">
                    {sqlConfig.maxExecutionMs}ms
                  </Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph type="secondary" className="text-xs !mt-2 !mb-0">
                  约束的修改请在「工具管理」页编辑该工具。
                </Typography.Paragraph>
              </Card>

              <Card title="SQL 测试" size="small">
                <Typography.Text type="secondary" className="text-xs">
                  SQL（仅 SELECT；命名参数用 :name）
                </Typography.Text>
                <Input.TextArea
                  rows={4}
                  className="font-mono text-xs"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="SELECT id, amount FROM orders WHERE dt = :dt"
                />
                <Typography.Text type="secondary" className="text-xs">
                  参数（JSON）
                </Typography.Text>
                <Input.TextArea
                  rows={2}
                  className="font-mono text-xs"
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                />
                <Button
                  className="mt-2"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={running}
                  onClick={() => void runTest()}
                >
                  执行 SQL 测试
                </Button>
              </Card>

              <Card title="SQL 模板管理" size="small" className="lg:col-span-2">
                <Table
                  rowKey="id"
                  size="small"
                  columns={tplColumns}
                  dataSource={templates}
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无模板" /> }}
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
