'use client';

import { useEdgesState, useNodesState } from '@xyflow/react';
import { App, Button, Card, Collapse, Input, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { ApiError } from '@/lib/api';
import {
  DataScopeDimensionPanel,
  tableHasAnyDataScope,
} from '@/components/console/DataScopeDimensionPanel';
import { ErDiagramAnnotateEditor } from '@/components/console/ErDiagramAnnotateEditor';
import { ErDiagramFlowCanvas } from '@/components/console/ErDiagramFlowCanvas';
import { diagramToFlow, flowToDiagram } from '@/components/console/er-diagram-flow';
import {
  ErDataScopeBinding,
  ErDiagram,
  ErDiagramState,
  ErTableNode,
  getConnectorErDiagram,
  getConnectorSchema,
  getErGenerationStatus,
  introspectConnector,
  IntrospectedSchema,
  IntrospectedColumn,
  IntrospectedTable,
  publishConnectorErDiagram,
  regenerateConnectorErDraft,
  saveConnectorErDraft,
  suggestConnectorErDataScope,
} from '@/lib/connector';
import {
  type DataScopeDimension,
  DATA_SCOPE_PANEL_HINT,
  confirmAllDataScopeBindings,
  confirmDataScopeDimension,
  countPendingDataScopeTables,
  filterTablesByDimension,
  normalizeDiagramDataScope,
  hasScopeMaintenance,
  hasUserMaintenance,
  initDataScopeForDimension,
  patchDataScopeDimension,
  removeDataScopeDimension,
} from '@/components/console/er-data-scope-ui';

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
  const [dataScopeCollapseOpen, setDataScopeCollapseOpen] = useState<string[]>([]);

  const draft = state?.draft;
  const diagramForScope = diagramBase ?? draft ?? state?.published ?? null;
  const scopeTables = useMemo(
    () => filterTablesByDimension(diagramForScope?.tables ?? [], 'scope'),
    [diagramForScope],
  );
  const userTables = useMemo(
    () => filterTablesByDimension(diagramForScope?.tables ?? [], 'user'),
    [diagramForScope],
  );
  const tablesWithAnyDataScope = useMemo(
    () => (diagramForScope?.tables ?? []).filter(tableHasAnyDataScope),
    [diagramForScope],
  );
  const pendingDataScopeCount = useMemo(
    () => countPendingDataScopeTables(diagramForScope?.tables ?? []),
    [diagramForScope],
  );
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

  // ── LLM 生成 ER 草稿：异步任务 + 轮询 ──
  const [generating, setGenerating] = useState(false);

  // 挂载时检查是否有进行中的生成任务（如刷新页面后恢复轮询）
  useEffect(() => {
    let cancelled = false;
    void getErGenerationStatus(connectorId)
      .then((s) => {
        if (!cancelled && s.status === 'running') setGenerating(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getErGenerationStatus(connectorId);
        if (cancelled || s.status === 'running') return;
        setGenerating(false);
        if (s.status === 'done') {
          message.success('LLM 辅助生成 ER 草稿完成');
          await load();
          onChanged?.();
        } else if (s.status === 'failed') {
          message.error(s.error || 'ER 草稿生成失败');
        } else {
          message.warning('生成任务状态丢失（服务可能已重启），请重新生成');
        }
      } catch {
        // 网络抖动忽略，下一轮继续
      }
    };
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generating, connectorId, load, message, onChanged]);

  const startErGeneration = async () => {
    try {
      await regenerateConnectorErDraft(connectorId);
      setGenerating(true);
      message.info('生成任务已提交，正在后台执行，完成后自动刷新');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ER_GENERATION_RUNNING') {
        setGenerating(true);
        message.info('已有生成任务进行中，正在等待结果');
        return;
      }
      message.error(formatApiError(err, '提交生成任务失败'));
    }
  };

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

  const resolveTableColumnOptions = useCallback(
    (tableName: string) => {
      const fromDiagram = diagramForScope?.tables?.find((t) => t.name === tableName);
      if (fromDiagram?.columns?.length) {
        return fromDiagram.columns.map((c) => ({ value: c.name, label: c.name }));
      }
      const fromSchema = schema?.tables?.find((t) => t.name === tableName);
      return (fromSchema?.columns ?? []).map((c) => ({ value: c.name, label: c.name }));
    },
    [diagramForScope?.tables, schema?.tables],
  );

  const ensureTableInDiagram = (base: ErDiagram, tableName: string): ErDiagram => {
    const existing = (base.tables ?? []).find((t) => t.name === tableName);
    if (existing) return base;
    const schemaTable = schema?.tables?.find((t) => t.name === tableName);
    const columns = (schemaTable?.columns ?? []).map((c) => ({
      name: c.name,
      type: c.dataType,
    }));
    return {
      ...base,
      tables: [
        ...(base.tables ?? []),
        {
          name: tableName,
          displayName: schemaTable?.comment?.trim() || undefined,
          columns,
        },
      ],
    };
  };

  const applyTableDataScopePatch = (
    tableName: string,
    updater: (existing: ErDataScopeBinding | undefined) => ErDataScopeBinding | undefined,
  ): ErDiagram => {
    let base = diagramForScope ?? { tables: [], relationships: [] };
    base = ensureTableInDiagram(base, tableName);
    const tables = (base.tables ?? []).map((t) => {
      if (t.name !== tableName) return t;
      const schemaTable = schema?.tables?.find((s) => s.name === tableName);
      const columns =
        t.columns?.length
          ? t.columns
          : (schemaTable?.columns ?? []).map((c) => ({ name: c.name, type: c.dataType }));
      const next = updater(t.dataScope);
      return next
        ? { ...t, columns, dataScope: next }
        : { ...t, columns, dataScope: undefined };
    });
    return { ...base, tables };
  };

  const patchTableDataScope = (
    tableName: string,
    updater: (existing: ErDataScopeBinding | undefined) => ErDataScopeBinding | undefined,
  ) => {
    const nextDiagram = applyTableDataScopePatch(tableName, updater);
    commitDiagram(nextDiagram);
    setJsonDirty(true);
  };

  const persistErDraft = async (
    diagram: ErDiagram,
    busyKey: string,
    successMessage: string,
  ) => {
    setBusy(busyKey);
    try {
      const normalized = normalizeDiagramDataScope(diagram) as ErDiagram;
      const res = await saveConnectorErDraft(connectorId, normalized);
      const saved = res.draft ?? normalized;
      setDiagramBase(saved);
      setState((prev) => (prev ? { ...prev, draft: saved } : prev));
      resetJsonFromDiagram(saved);
      setJsonDirty(false);
      message.success(successMessage);
    } catch (err) {
      message.error(formatApiError(err, '保存失败'));
    } finally {
      setBusy(null);
    }
  };

  const addTableToDimension = (tableName: string, dim: DataScopeDimension) => {
    const existing = diagramForScope?.tables?.find((t) => t.name === tableName);
    if (dim === 'scope' && hasScopeMaintenance(existing?.dataScope)) {
      message.warning('该表已在范围列列表中');
      return;
    }
    if (dim === 'user' && hasUserMaintenance(existing?.dataScope)) {
      message.warning('该表已在用户列列表中');
      return;
    }
    patchTableDataScope(tableName, (ds) =>
      patchDataScopeDimension(ds ?? initDataScopeForDimension(dim), dim, {
        inferred: false,
      }),
    );
    setDataScopeCollapseOpen(['data-scope-confirm']);
    message.success(`已添加表「${tableName}」到${dim === 'scope' ? '范围列' : '用户列'}映射`);
  };

  const removeTableFromDimension = async (tableName: string, dim: DataScopeDimension) => {
    const diagram = applyTableDataScopePatch(tableName, (ds) =>
      removeDataScopeDimension(ds, dim),
    );
    commitDiagram(diagram);
    await persistErDraft(
      diagram,
      `remove-${dim}-${tableName}`,
      `已从${dim === 'scope' ? '范围列' : '用户列'}映射中移除`,
    );
  };

  const updateDimensionColumn = (
    tableName: string,
    dim: DataScopeDimension,
    column: string | undefined,
  ) => {
    patchTableDataScope(tableName, (ds) =>
      patchDataScopeDimension(ds ?? initDataScopeForDimension(dim), dim, {
        column,
        inferred: false,
      }),
    );
  };

  const confirmDimensionRow = async (tableName: string, dim: DataScopeDimension) => {
    const diagram = applyTableDataScopePatch(tableName, (ds) => {
      if (!ds) return undefined;
      return confirmDataScopeDimension(ds, dim);
    });
    commitDiagram(diagram);
    await persistErDraft(diagram, `confirm-${dim}-${tableName}`, '已确认列映射');
  };

  const confirmAllDataScope = async () => {
    const base = diagramForScope ?? { tables: [], relationships: [] };
    const tables = confirmAllDataScopeBindings(base.tables ?? []);
    const diagram: ErDiagram = { ...base, tables };
    commitDiagram(diagram);
    await persistErDraft(diagram, 'confirm-all-scope', '已全部确认限制字段');
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
          <Tooltip title={generating ? '正在后台生成，完成后自动刷新' : undefined}>
            <Button
              size="small"
              loading={generating}
              onClick={() => void startErGeneration()}
            >
              LLM 辅助生成草稿
            </Button>
          </Tooltip>
          <Tooltip
            title={
              state?.introspectedAt
                ? undefined
                : '请先抽取表结构'
            }
          >
            <Button
              size="small"
              disabled={!state?.introspectedAt}
              loading={busy === 'suggest-scope'}
              onClick={() =>
                run('suggest-scope', async () => {
                  const res = await suggestConnectorErDataScope(connectorId);
                  if (res.warnings?.length) {
                    message.warning(res.warnings.join(' '));
                  } else {
                    message.success('列映射建议已生成，请核对物理列后确认');
                  }
                  setDataScopeCollapseOpen(['data-scope-confirm']);
                })
              }
            >
              分析列映射
            </Button>
          </Tooltip>
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
      {state?.introspectedAt && schema?.tables?.length ? (
        <Collapse
          className="mb-3"
          activeKey={dataScopeCollapseOpen}
          onChange={(keys) =>
            setDataScopeCollapseOpen(
              Array.isArray(keys) ? keys : keys ? [keys] : [],
            )
          }
          items={[
            {
              key: 'data-scope-confirm',
              label: (
                <Space wrap>
                  <Tag color={pendingDataScopeCount > 0 ? 'warning' : 'processing'}>
                    {pendingDataScopeCount > 0
                      ? '待确认'
                      : tablesWithAnyDataScope.length > 0
                        ? '已配置'
                        : '可配置'}
                  </Tag>
                  <span>
                    数据范围列映射 · 范围 {scopeTables.length} / 用户 {userTables.length} 张表
                  </span>
                </Space>
              ),
              children: (
                <>
                  <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
                    {DATA_SCOPE_PANEL_HINT}
                  </Typography.Paragraph>
                  <DataScopeDimensionPanel
                    dimension="scope"
                    allTables={diagramForScope?.tables ?? []}
                    schemaTableNames={(schema?.tables ?? []).map((t) => t.name)}
                    resolveTableComment={(name) => {
                      const fromSchema = schema?.tables?.find((t) => t.name === name);
                      const fromDiagram = diagramForScope?.tables?.find((t) => t.name === name);
                      return (
                        fromSchema?.comment?.trim() ||
                        fromDiagram?.displayName?.trim() ||
                        undefined
                      );
                    }}
                    resolveColumnOptions={resolveTableColumnOptions}
                    onColumnChange={(tableName, column) =>
                      updateDimensionColumn(tableName, 'scope', column)
                    }
                    onAddTable={(tableName) => addTableToDimension(tableName, 'scope')}
                    onRemoveTable={(tableName) => removeTableFromDimension(tableName, 'scope')}
                    onConfirmRow={(tableName) => confirmDimensionRow(tableName, 'scope')}
                  />
                  <DataScopeDimensionPanel
                    dimension="user"
                    allTables={diagramForScope?.tables ?? []}
                    schemaTableNames={(schema?.tables ?? []).map((t) => t.name)}
                    resolveTableComment={(name) => {
                      const fromSchema = schema?.tables?.find((t) => t.name === name);
                      const fromDiagram = diagramForScope?.tables?.find((t) => t.name === name);
                      return (
                        fromSchema?.comment?.trim() ||
                        fromDiagram?.displayName?.trim() ||
                        undefined
                      );
                    }}
                    resolveColumnOptions={resolveTableColumnOptions}
                    onColumnChange={(tableName, column) =>
                      updateDimensionColumn(tableName, 'user', column)
                    }
                    onAddTable={(tableName) => addTableToDimension(tableName, 'user')}
                    onRemoveTable={(tableName) => removeTableFromDimension(tableName, 'user')}
                    onConfirmRow={(tableName) => confirmDimensionRow(tableName, 'user')}
                  />
                  {pendingDataScopeCount > 0 ? (
                    <Button
                      size="small"
                      className="mt-2"
                      loading={busy === 'confirm-all-scope'}
                      onClick={() => void confirmAllDataScope()}
                    >
                      全部确认
                    </Button>
                  ) : null}
                </>
              ),
            },
          ]}
        />
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
