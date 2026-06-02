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
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EllipsisCell,
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CreateKbInput,
  KB_STATUS_META,
  KB_STATUS_OPTIONS,
  KbStatus,
  KnowledgeBase,
  UpdateKbInput,
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
} from '@/lib/knowledge';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

const PATHY_GUIDE_LINKS = [
  { href: '/knowledge/layers', label: '知识层管理' },
  { href: '/knowledge/structure', label: '存储结构' },
  { href: '/knowledge/media', label: '媒体库' },
  { href: '/knowledge/recall-test', label: '问答测试' },
] as const;

interface KbFormValues {
  name: string;
  description?: string;
  pathyWikiPrefix?: string;
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

  const [detail, setDetail] = useState<KnowledgeBase | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const defaultWikiPrefix = activeTenantId ? `tenants/${activeTenantId}/` : '';

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
    form.setFieldsValue({ pathyWikiPrefix: defaultWikiPrefix });
    setDrawerOpen(true);
  };

  const openEdit = (kb: KnowledgeBase) => {
    setEditing(kb);
    form.resetFields();
    form.setFieldsValue({
      name: kb.name,
      description: kb.description ?? undefined,
      pathyWikiPrefix: kb.pathyWikiPrefix ?? undefined,
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
    const pathyWikiPrefix = v.pathyWikiPrefix?.trim() || undefined;
    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateKbInput = {
          name: v.name,
          description: v.description,
          pathyWikiPrefix,
          status: v.status as UpdateKbInput['status'],
        };
        await updateKnowledgeBase(editing.id, payload);
      } else {
        const payload: CreateKbInput = {
          tenantId: activeTenantId,
          name: v.name,
          description: v.description,
          pathyWikiPrefix,
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
      title: `确认删除知识库绑定「${kb.name}」？`,
      content: '删除后仅移除平台侧租户绑定元数据，pathy 侧已有文件不会自动删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await deleteKnowledgeBase(kb.id); message.success('已删除'); void load(); }
        catch (err) { message.error(err instanceof Error ? err.message : '删除失败'); }
      },
    });
  };

  const columns: ColumnsType<KnowledgeBase> = [
    ellipsisTextColumn<KnowledgeBase>('名称', 'name', 160),
    withNowrap<KnowledgeBase>({
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<KnowledgeBase>({
      title: 'pathy wiki 前缀',
      dataIndex: 'pathyWikiPrefix',
      ellipsis: true,
      render: (v: string | null) => {
        const text = v || `（默认）tenants/${activeTenantId}/`;
        return (
          <EllipsisCell tooltip={text}>
            <Typography.Text code className="text-xs">
              {text}
            </Typography.Text>
          </EllipsisCell>
        );
      },
    }),
    withNowrap<KnowledgeBase>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: KbStatus) => (
        <Tag color={KB_STATUS_META[s]?.color}>{KB_STATUS_META[s]?.label ?? s}</Tag>
      ),
    }),
    withNowrap<KnowledgeBase>({
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => fmt(v),
    }),
    withNowrap<KnowledgeBase>({
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => void openDetail(row)}>详情</a>
          <a onClick={() => openEdit(row)}>编辑</a>
          <a className="text-red-500" onClick={() => handleDelete(row)}>
            删除
          </a>
        </Space>
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          <DatabaseOutlined className="mr-2" />知识库管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>
          新建绑定
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" description="知识库按租户隔离，需选定租户后查看与维护。" />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description={
              <>
                本页仅维护租户与 pathy 的 wiki 路径绑定；文档存储、分块与召回由 pathy-knowledge-server 提供。
                请使用：
                {PATHY_GUIDE_LINKS.map((item, i) => (
                  <span key={item.href}>
                    {i > 0 ? '、' : ' '}
                    <Link to={item.href}>{item.label}</Link>
                  </span>
                ))}
                。
              </>
            }
          />
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索名称 / 描述" style={{ width: 260 }} onSearch={setKeyword} />
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={KB_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<KnowledgeBase>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无知识库绑定" /> }}
            {...tableEllipsisLayout}
          />
        </>
      )}

      <Drawer
        title={editing ? '编辑知识库绑定' : '新建知识库绑定'}
        width={560}
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
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：默认租户知识库" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="绑定说明…" />
          </Form.Item>
          <Form.Item
            label="pathy wiki 前缀"
            name="pathyWikiPrefix"
            extra="留空则运行时使用 tenants/{租户ID}/；需与 pathy DATA_ROOT 下目录一致。"
          >
            <Input placeholder={defaultWikiPrefix || 'tenants/<tenantId>/'} />
          </Form.Item>
          {editing && (
            <Form.Item label="状态" name="status" style={{ width: 150 }}>
              <Select options={KB_STATUS_OPTIONS} />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      <Drawer title="知识库绑定详情" width={640} open={!!detail} loading={detailLoading} onClose={() => setDetail(undefined)} destroyOnClose>
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={KB_STATUS_META[detail.status]?.color}>{KB_STATUS_META[detail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="pathy wiki 前缀">
                <Typography.Text code>{detail.pathyWikiPrefix || `（默认）tenants/${detail.tenantId}/`}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{fmt(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{fmt(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <Alert
              className="mt-4"
              type="info"
              showIcon
              message="内容维护入口"
              description={
                <>
                  上传文档、检索测试请在左侧菜单进入
                  {PATHY_GUIDE_LINKS.map((item, i) => (
                    <span key={item.href}>
                      {i > 0 ? '、' : ' '}
                      <Link to={item.href}>{item.label}</Link>
                    </span>
                  ))}
                  。
                </>
              }
            />
          </>
        )}
      </Drawer>
    </>
  );
}
