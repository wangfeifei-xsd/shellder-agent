'use client';

import { useEdgesState, useNodesState } from '@xyflow/react';
import { App, Button, Card, Collapse, Input, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { ApiError } from '@/lib/api';
import { ErDiagramAnnotateEditor } from '@/components/console/ErDiagramAnnotateEditor';
import { ErDiagramFlowCanvas } from '@/components/console/ErDiagramFlowCanvas';
import { diagramToFlow, flowToDiagram } from '@/components/console/er-diagram-flow';
import {
  ErDiagram,
  ErDiagramState,
  getConnectorErDiagram,
  getConnectorSchema,
  introspectConnector,
  IntrospectedSchema,
  IntrospectedColumn,
  IntrospectedTable,
  publishConnectorErDiagram,
  regenerateConnectorErDraft,
  saveConnectorErDraft,
} from '@/lib/connector';

function formatApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }
  if (err.details) {
    console.error('[ErDiagramPanel]', err.code, err.requestId, err.details);
  }
  const preview =
    err.details &&
    typeof err.details === 'object' &&
    'preview' in err.details &&
    typeof (err.details as { preview: unknown }).preview === 'string'
      ? (err.details as { preview: string }).preview
      : undefined;
  if (preview) {
    return `${err.message}（模型返回预览见浏览器控制台 Network / Console）`;
  }
  return err.message;
}

function serializeDiagram(diagram: ErDiagram | null): string {
  if (!diagram) return '{\n  "tables": [],\n  "relationships": []\n}';
  return JSON.stringify(diagram, null, 2);
}

function parseDiagramJsonText(text: string): { ok: true; diagram: ErDiagram } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: '内容为空' };
  const jsonStr = trimmed.startsWith('{')
    ? trimmed
    : (trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? trimmed);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'JSON 解析失败' };
  }
  const d = parsed as ErDiagram;
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '根节点必须是 JSON 对象' };
  }
  if (!Array.isArray(d.tables)) {
    return { ok: false, error: '缺少 tables 数组' };
  }
  if (d.relationships !== undefined && !Array.isArray(d.relationships)) {
    return { ok: false, error: 'relationships 必须是数组' };
  }
  if (!d.relationships) d.relationships = [];
  return { ok: true, diagram: d };
}

const ER_JSON_HINT = `可编辑 displayName、relationships、列 pk/fk 等。tables[].name 须为已抽取的物理表名。`;

const introspectedTableColumns: ColumnsType<IntrospectedTable> = [
  ellipsisTextColumn<IntrospectedTable>('表名', 'name', 180),
  withNowrap<IntrospectedTable>({
    title: '注释',
    dataIndex: 'comment',
    ellipsis: true,
    render: (v: string | null) => renderOptionalText(v),
  }),
  withNowrap<IntrospectedTable>({
    title: '列数',
    width: 72,
    render: (_, row) => row.columns.length,
  }),
  withNowrap<IntrospectedTable>({
    title: '主键',
    ellipsis: true,
    render: (_, row) => renderOptionalText(row.primaryKey.length ? row.primaryKey.join(', ') : undefined),
  }),
  withNowrap<IntrospectedTable>({
    title: '外键',
    width: 72,
    render: (_, row) => row.foreignKeys.length,
  }),
];

const introspectedColumnColumns: ColumnsType<IntrospectedColumn> = [
  ellipsisTextColumn<IntrospectedColumn>('列名', 'name', 160),
  ellipsisTextColumn<IntrospectedColumn>('类型', 'columnType', 140),
  withNowrap<IntrospectedColumn>({
    title: '可空',
    width: 56,
    render: (_: unknown, c) => (c.nullable ? '是' : '否'),
  }),
  withNowrap<IntrospectedColumn>({
    title: '默认',
    dataIndex: 'defaultValue',
    width: 100,
    render: (v: string | null) => renderOptionalText(v),
  }),
  withNowrap<IntrospectedColumn>({
    title: '注释',
    dataIndex: 'comment',
    ellipsis: true,
    render: (v: string | null) => renderOptionalText(v || undefined),
  }),
];

function IntrospectedSchemaTables({ schema }: { schema: IntrospectedSchema }) {
  return (
    <Table<IntrospectedTable>
      size="small"
      rowKey="name"
      pagination={{ pageSize: 10, showSizeChanger: true, size: 'small' }}
      dataSource={schema.tables}
      columns={introspectedTableColumns}
      {...tableEllipsisLayout}
      expandable={{
        expandedRowRender: (row) => (
          <Table
            size="small"
            rowKey="name"
            pagination={false}
            dataSource={row.columns}
            columns={introspectedColumnColumns}
            {...tableEllipsisLayout}
          />
        ),
      }}
    />
  );
}

export function ErDiagramPanel({
  connectorId,
  onChanged,
}: {
  connectorId: string;
  onChanged?: () => void;
}) {
  const { message } = App.useApp();
  const [state, setState] = useState<ErDiagramState | null>(null);
  const [schema, setSchema] = useState<IntrospectedSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'annotate' | 'json'>('annotate');
  const [diagramBase, setDiagramBase] = useState<ErDiagram | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const draft = state?.draft;
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => diagramToFlow(diagramBase ?? draft ?? state?.published ?? null),
    [diagramBase, draft, state?.published],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const syncVisualFromDiagram = useCallback(
    (diagram: ErDiagram | null) => {
      const { nodes: n, edges: e } = diagramToFlow(diagram);
      setNodes(n);
      setEdges(e);
    },
    [setNodes, setEdges],
  );

  const resetJsonFromDiagram = useCallback((diagram: ErDiagram | null) => {
    setJsonText(serializeDiagram(diagram));
    setJsonDirty(false);
    setJsonError(null);
  }, []);

  const commitDiagram = useCallback(
    (diagram: ErDiagram) => {
      setDiagramBase(diagram);
      syncVisualFromDiagram(diagram);
      resetJsonFromDiagram(diagram);
    },
    [syncVisualFromDiagram, resetJsonFromDiagram],
  );

  const currentDiagram = useCallback(
    (): ErDiagram =>
      flowToDiagram(nodes, edges, diagramBase ?? draft ?? state?.published ?? null),
    [nodes, edges, diagramBase, draft, state?.published],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sch] = await Promise.all([
        getConnectorErDiagram(connectorId),
        getConnectorSchema(connectorId),
      ]);
      setState(s);
      setSchema(sch.introspectedSchema);
      const diagram = s.draft ?? s.published;
      setDiagramBase(diagram);
      syncVisualFromDiagram(diagram);
      resetJsonFromDiagram(diagram);
    } catch (err) {
      message.error(formatApiError(err, '加载 ER 图失败'));
    } finally {
      setLoading(false);
    }
  }, [connectorId, message, syncVisualFromDiagram, resetJsonFromDiagram]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    } finally {
      setBusy(null);
    }
  };

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

  const resolveDiagramForSave = (): ErDiagram | null => {
    if (jsonDirty) {
      const parsed = parseDiagramJsonText(jsonText);
      if (!parsed.ok) {
        message.error(`JSON 无效：${parsed.error}`);
        return null;
      }
      return parsed.diagram;
    }
    return currentDiagram();
  };

  const applyJsonToVisual = () => {
    const parsed = parseDiagramJsonText(jsonText);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      message.error(parsed.error);
      return;
    }
    commitDiagram(parsed.diagram);
    setJsonError(null);
    message.success('已应用到画布与标注编辑');
  };

  const syncJsonFromVisual = () => {
    commitDiagram(currentDiagram());
    message.success('已从画布同步到编辑器');
  };

  const formatJsonEditor = () => {
    const parsed = parseDiagramJsonText(jsonText);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      message.error(parsed.error);
      return;
    }
    setJsonText(serializeDiagram(parsed.diagram));
    setJsonDirty(true);
    setJsonError(null);
  };

  return (
    <Card
      size="small"
      title="表结构与 ER 关系图"
      loading={loading}
      className="mt-4"
      extra={
        <Space wrap>
          <Button
            size="small"
            loading={busy === 'introspect'}
            onClick={() =>
              run('introspect', async () => {
                const res = await introspectConnector(connectorId);
                setSchema(res.schema);
                message.success('表结构抽取完成');
              })
            }
          >
            抽取表结构
          </Button>
          <Button
            size="small"
            loading={busy === 'regenerate'}
            onClick={() =>
              run('regenerate', async () => {
                await regenerateConnectorErDraft(connectorId);
                message.success(
                  draft?.tables?.length || draft?.relationships?.length
                    ? '已在现有草稿上完成 LLM 辅助优化'
                    : 'ER 草稿已生成',
                );
              })
            }
          >
            LLM 辅助生成草稿
          </Button>
          <Button
            size="small"
            loading={busy === 'save'}
            onClick={() =>
              run('save', async () => {
                const diagram = resolveDiagramForSave();
                if (!diagram) return;
                await saveConnectorErDraft(connectorId, diagram);
                setDiagramBase(diagram);
                resetJsonFromDiagram(diagram);
                message.success('草稿已保存');
              })
            }
          >
            保存草稿
          </Button>
          <Button
            size="small"
            type="primary"
            loading={busy === 'publish'}
            onClick={() =>
              run('publish', async () => {
                const res = await publishConnectorErDiagram(connectorId);
                message.success(`已发布 v${res.version}`);
              })
            }
          >
            发布
          </Button>
        </Space>
      }
    >
      {!state?.published ? (
        <Typography.Text type="danger" className="mb-3 block">
          查询型 Runtime 不可用：请先发布关系图（抽取 → 生成草稿 → 发布）。
        </Typography.Text>
      ) : (
        <Space className="mb-3" wrap>
          <Tag color="green">已发布 v{state.publishedVersion}</Tag>
          <Typography.Text type="secondary" className="text-xs">
            {state.published?.tables?.length ?? 0} 表 · 发布于 {fmt(state.publishedAt)}
          </Typography.Text>
        </Space>
      )}
      {state?.introspectedAt && schema?.tables?.length ? (
        <Collapse
          className="mb-3"
          items={[
            {
              key: 'introspected-schema',
              label: (
                <Space wrap>
                  <Tag color="blue">已抽取</Tag>
                  <span>{schema.tables.length} 张表</span>
                  <Typography.Text type="secondary" className="text-xs">
                    库 {schema.database} · {fmt(state.introspectedAt)}
                  </Typography.Text>
                </Space>
              ),
              children: <IntrospectedSchemaTables schema={schema} />,
            },
          ]}
        />
      ) : state?.introspectedAt ? (
        <Typography.Text type="secondary" className="mb-3 block text-xs">
          已抽取（{fmt(state.introspectedAt)}），表结构数据加载中或为空
        </Typography.Text>
      ) : null}
      <Typography.Text type="secondary" className="mb-2 block text-xs">
        ER 关系图 · 推荐在「标注编辑」中改显示名与关联；可视化可拖拽布局；JSON 高级用于批量改列
        {!state?.introspectedAt ? ' · 请先「抽取表结构」' : ''}
      </Typography.Text>
      <Tabs
        size="small"
        activeKey={viewMode}
        onChange={(key) => {
          const next = key as 'visual' | 'annotate' | 'json';
          if ((next === 'annotate' || next === 'json') && !jsonDirty) {
            commitDiagram(currentDiagram());
          }
          setViewMode(next);
        }}
        items={[
          {
            key: 'annotate',
            label: '标注编辑',
            children: (
              <ErDiagramAnnotateEditor
                diagram={diagramBase ?? draft ?? state?.published ?? null}
                onChange={commitDiagram}
              />
            ),
          },
          {
            key: 'visual',
            label: '可视化',
            children: (
              <>
                <Space className="mb-2" size="small" wrap>
                  <Tag color="processing">蓝实线 · 已确认</Tag>
                  <Tag color="warning">黄虚线 · 推断</Tag>
                  <Typography.Text type="secondary" className="text-xs">
                    按依赖分列，同列内按关联错开；可拖拽微调
                  </Typography.Text>
                </Space>
                {nodes.length > 0 ? (
                  <ErDiagramFlowCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                  />
                ) : (
                  <div className="flex h-[480px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400">
                    暂无 ER 图，请先「抽取表结构」或 LLM 生成草稿
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'json',
            label: jsonDirty ? 'JSON 高级 *' : 'JSON 高级',
            children: (
              <div>
                <Typography.Paragraph type="secondary" className="!mb-2 text-xs">
                  {ER_JSON_HINT}
                </Typography.Paragraph>
                <Input.TextArea
                  className="font-mono text-xs"
                  rows={18}
                  value={jsonText}
                  spellCheck={false}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    setJsonDirty(true);
                    setJsonError(null);
                  }}
                  placeholder='{"tables":[],"relationships":[]}'
                />
                {jsonError ? (
                  <Typography.Text type="danger" className="mt-1 block text-xs">
                    {jsonError}
                  </Typography.Text>
                ) : null}
                <Space className="mt-2" wrap>
                  <Button size="small" type="primary" onClick={applyJsonToVisual}>
                    应用到画布
                  </Button>
                  <Button size="small" onClick={syncJsonFromVisual}>
                    从画布同步
                  </Button>
                  <Button size="small" onClick={formatJsonEditor}>
                    格式化
                  </Button>
                </Space>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
