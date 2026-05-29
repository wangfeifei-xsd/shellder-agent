'use client';

import { DatabaseOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CHUNK_STRATEGY_OPTIONS,
  CreateKbInput,
  KB_STATUS_META,
  KB_STATUS_OPTIONS,
  KbEmbeddingTask,
  KbStatus,
  KnowledgeBase,
  KnowledgeBaseDetail,
  SIMILARITY_METRIC_OPTIONS,
  UpdateKbInput,
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
} from '@/lib/knowledge';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface KbFormValues {
  name: string;
  description?: string;
  embeddingModel?: string;
  similarityMetric?: string;
  chunkStrategy?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  status?: string;
}

export default function KnowledgePage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<KbFormValues>();

  const [data, setData] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<KbStatus | undefined>();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBase | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<KnowledgeBaseDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setData([]); return; }
    setLoading(true);
    try {
      const res = await listKnowledgeBases({
        tenantId: activeTenantId,
        keyword: keyword || undefined,
        status: statusFilter,
        pageSize: 200,
      });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载知识库列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, statusFilter, message]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({
      embeddingModel: 'text-embedding-3-small',
      similarityMetric: 'cosine',
      chunkStrategy: 'fixed_size',
      chunkSize: 500,
      chunkOverlap: 50,
    });
    setDrawerOpen(true);
  };

  const openEdit = (kb: KnowledgeBase) => {
    setEditing(kb);
    form.resetFields();
    form.setFieldsValue({
      name: kb.name,
      description: kb.description ?? undefined,
      embeddingModel: kb.embeddingModel,
      similarityMetric: kb.similarityMetric,
      chunkStrategy: kb.chunkStrategy,
      chunkSize: kb.chunkSize,
      chunkOverlap: kb.chunkOverlap,
      status: kb.status,
    });
    setDrawerOpen(true);
  };

  const openDetail = async (kb: KnowledgeBase) => {
    setDetailLoading(true);
    try { setDetail(await getKnowledgeBase(kb.id)); }
    catch (err) { message.error(err instanceof Error ? err.message : '加载知识库详情失败'); }
    finally { setDetailLoading(false); }
  };

  const handleSubmit = async () => {
    if (!activeTenantId) { message.warning('请先在顶栏选择当前操作租户'); return; }
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateKbInput = {
          name: v.name,
          description: v.description,
          embeddingModel: v.embeddingModel,
          similarityMetric: v.similarityMetric as UpdateKbInput['similarityMetric'],
          chunkStrategy: v.chunkStrategy as UpdateKbInput['chunkStrategy'],
          chunkSize: v.chunkSize,
          chunkOverlap: v.chunkOverlap,
          status: v.status as UpdateKbInput['status'],
        };
        await updateKnowledgeBase(editing.id, payload);
      } else {
        const payload: CreateKbInput = {
          tenantId: activeTenantId,
          name: v.name,
          description: v.description,
          embeddingModel: v.embeddingModel,
          similarityMetric: v.similarityMetric as CreateKbInput['similarityMetric'],
          chunkStrategy: v.chunkStrategy as CreateKbInput['chunkStrategy'],
          chunkSize: v.chunkSize,
          chunkOverlap: v.chunkOverlap,
        };
        await createKnowledgeBase(payload);
      }
      setDrawerOpen(false);
      message.success('保存成功');
      void load();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally { setSubmitting(false); }
  };

  const handleDelete = (kb: KnowledgeBase) => {
    modal.confirm({
      title: `确认删除知识库「${kb.name}」？`,
      content: '删除后知识库及关联文档/分块将被标记为删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await deleteKnowledgeBase(kb.id); message.success('已删除'); void load(); }
        catch (err) { message.error(err instanceof Error ? err.message : '删除失败'); }
      },
    });
  };

  const columns: ColumnsType<KnowledgeBase> = [
    {
      title: '知识库名称',
      dataIndex: 'name',
      render: (v: string, row) => (
        <Link href={`/knowledge/${row.id}`} className="text-blue-600 hover:underline">{v}</Link>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string | null) => v || '—' },
    { title: 'Embedding 模型', dataIndex: 'embeddingModel', width: 180, ellipsis: true },
    { title: '分块策略', dataIndex: 'chunkStrategy', width: 100, render: (v: string) => {
      const map: Record<string, string> = { fixed_size: '固定大小', paragraph: '按段落', sentence: '按句子' };
      return map[v] ?? v;
    }},
    { title: '文档数', dataIndex: 'documentCount', width: 80, align: 'right' },
    { title: '分块数', dataIndex: 'chunkCount', width: 80, align: 'right' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: KbStatus) => <Tag color={KB_STATUS_META[s]?.color}>{KB_STATUS_META[s]?.label ?? s}</Tag>,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openDetail(row)}>详情</a>
          <a onClick={() => openEdit(row)}>编辑</a>
          <Link href={`/knowledge/${row.id}`}>文档</Link>
          <a className="text-red-500" onClick={() => handleDelete(row)}>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          <DatabaseOutlined className="mr-2" />知识库管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>
          新建知识库
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" description="知识库按租户隔离，需选定租户后查看与维护。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="知识库用于存储和管理文档知识，支持文档上传、分块、向量化及语义检索。"
          />
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索名称 / 描述" style={{ width: 260 }} onSearch={setKeyword} />
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={KB_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<KnowledgeBase> rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无知识库" /> }}
          />
        </>
      )}

      {/* ── 新建 / 编辑抽屉 ─────────────────────── */}
      <Drawer
        title={editing ? '编辑知识库' : '新建知识库'}
        width={600}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="知识库名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：产品FAQ知识库" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="知识库描述…" />
          </Form.Item>
          <Form.Item label="Embedding 模型" name="embeddingModel">
            <Input placeholder="text-embedding-3-small" />
          </Form.Item>
          <Space className="flex" size="large" align="start">
            <Form.Item label="相似度算法" name="similarityMetric" style={{ width: 180 }}>
              <Select options={SIMILARITY_METRIC_OPTIONS} />
            </Form.Item>
            <Form.Item label="分块策略" name="chunkStrategy" style={{ width: 150 }}>
              <Select options={CHUNK_STRATEGY_OPTIONS} />
            </Form.Item>
          </Space>
          <Space className="flex" size="large" align="start">
            <Form.Item label="分块大小（字符）" name="chunkSize" style={{ width: 180 }}>
              <InputNumber min={100} max={10000} />
            </Form.Item>
            <Form.Item label="重叠大小（字符）" name="chunkOverlap" style={{ width: 180 }}>
              <InputNumber min={0} max={1000} />
            </Form.Item>
          </Space>
          {editing && (
            <Form.Item label="状态" name="status" style={{ width: 150 }}>
              <Select options={KB_STATUS_OPTIONS} />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* ── 详情抽屉 ────────────────────────────── */}
      <Drawer title="知识库详情" width={720} open={!!detail} loading={detailLoading} onClose={() => setDetail(undefined)} destroyOnClose>
        {detail && <KbDetailView detail={detail} />}
      </Drawer>
    </>
  );
}

function KbDetailView({ detail }: { detail: KnowledgeBaseDetail }) {
  return (
    <>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={KB_STATUS_META[detail.status]?.color}>{KB_STATUS_META[detail.status]?.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="描述" span={2}>{detail.description || '—'}</Descriptions.Item>
        <Descriptions.Item label="Embedding 模型">{detail.embeddingModel}</Descriptions.Item>
        <Descriptions.Item label="相似度算法">{detail.similarityMetric}</Descriptions.Item>
        <Descriptions.Item label="分块策略">{detail.chunkStrategy}</Descriptions.Item>
        <Descriptions.Item label="分块大小">{detail.chunkSize} 字符（重叠 {detail.chunkOverlap}）</Descriptions.Item>
        <Descriptions.Item label="文档数">{detail.documentCount}</Descriptions.Item>
        <Descriptions.Item label="分块数">{detail.chunkCount}</Descriptions.Item>
        <Descriptions.Item label="数据源数">{detail.dataSourceCount}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{fmt(detail.createdAt)}</Descriptions.Item>
      </Descriptions>

      {detail.recentEmbeddingTasks.length > 0 && (
        <>
          <Typography.Title level={5} className="!mt-6">最近向量化任务</Typography.Title>
          <Table rowKey="id" size="small" pagination={false}
            columns={[
              { title: '文档', dataIndex: ['document', 'title'], render: (v: string | undefined) => v || '—' },
              {
                title: '状态', dataIndex: 'status', width: 90,
                render: (s: string) => {
                  const m: Record<string, { label: string; color: string }> = {
                    queued: { label: '排队中', color: 'default' },
                    running: { label: '运行中', color: 'processing' },
                    done: { label: '完成', color: 'green' },
                    failed: { label: '失败', color: 'red' },
                  };
                  return <Tag color={m[s]?.color}>{m[s]?.label ?? s}</Tag>;
                },
              },
              {
                title: '进度', key: 'progress', width: 100,
                render: (_, row: KbEmbeddingTask) =>
                  row.totalChunks > 0 ? `${row.processedChunks}/${row.totalChunks}` : '—',
              },
              { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
            ]}
            dataSource={detail.recentEmbeddingTasks}
          />
        </>
      )}
    </>
  );
}
