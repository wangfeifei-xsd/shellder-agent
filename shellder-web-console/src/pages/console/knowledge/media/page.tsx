'use client';

import {
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  MediaItem,
  deleteMedia,
  getMediaDownloadUrl,
  getMediaSummary,
  isKnowledgeProxyError,
  listMediaItems,
  reindexMediaBackrefs,
  uploadMedia,
} from '@/lib/knowledge-proxy';

const TOKEN_KEY = 'shellder.accessToken';

function formatSize(n?: number) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeMediaPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [summary, setSummary] = useState<{ count: number; bytes_registered: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();
  const [reindexing, setReindexing] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setItems([]); return; }
    setLoading(true);
    setProxyError(undefined);
    try {
      const [listRes, summaryRes] = await Promise.all([
        listMediaItems(activeTenantId),
        getMediaSummary(activeTenantId).catch(() => null),
      ]);
      setItems(listRes.items ?? []);
      setBytesTotal(listRes.bytes_total ?? 0);
      setSummary(summaryRes);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(err instanceof Error ? err.message : '加载媒体列表失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async () => {
    if (!activeTenantId || !uploadFile) {
      message.warning('请选择文件');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadMedia(
        activeTenantId,
        uploadFile,
        uploadTitle.trim() || undefined,
        uploadFolder.trim() || undefined,
      );
      message.success(res.deduplicated ? `已上传（去重，code: ${res.code}）` : `上传成功，code: ${res.code}`);
      setUploadOpen(false);
      setUploadTitle('');
      setUploadFolder('');
      setUploadFile(null);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (code: string) => {
    if (!activeTenantId) return;
    const url = getMediaDownloadUrl(activeTenantId, code);
    const token = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = code;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '下载失败');
    }
  };

  const handleDelete = (item: MediaItem) => {
    if (!activeTenantId) return;
    modal.confirm({
      title: `确认删除媒体「${item.code}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteMedia(activeTenantId, item.code);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleReindex = async () => {
    if (!activeTenantId) return;
    setReindexing(true);
    try {
      const res = await reindexMediaBackrefs(activeTenantId);
      message.success(`反向索引已重建：${res.codes_with_refs} 个 code，${res.total_ref_rows} 条引用`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重建失败');
    } finally {
      setReindexing(false);
    }
  };

  const columns: ColumnsType<MediaItem> = [
    { title: 'Code', dataIndex: 'code', width: 120 },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (v: string | undefined) => v || '—' },
    { title: 'MIME', dataIndex: 'mime', width: 140, render: (v: string | undefined) => v || '—' },
    { title: '大小', dataIndex: 'size', width: 100, render: (v: number | undefined) => formatSize(v) },
    { title: '目录', dataIndex: 'target_folder', ellipsis: true, render: (v: string | undefined) => v || '—' },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => void handleDownload(row.code)}><DownloadOutlined /> 下载</a>
          <a className="text-red-500" onClick={() => handleDelete(row)}><DeleteOutlined /></a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">媒体库</Typography.Title>
        <Space>
          <Button icon={<SyncOutlined />} loading={reindexing} onClick={handleReindex} disabled={!activeTenantId}>
            重建反向索引
          </Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)} disabled={!activeTenantId}>
            上传媒体
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>刷新</Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」"
          description="媒体库按租户隔离，支持图片/视频/APK 等资源的上传、列表、下载与删除。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="管理 wiki 引用的多媒体资源。Wiki 中使用 ![[MEDIA:code]] 或 <!-- media:code --> 占位符引用。"
          />
          {proxyError && <KnowledgeProxyErrorAlert error={proxyError} className="mb-4" />}

          <div className="mb-4 grid grid-cols-3 gap-4">
            <Card><Statistic title="媒体数量" value={items.length} /></Card>
            <Card><Statistic title="总大小（列表）" value={formatSize(bytesTotal)} valueStyle={{ fontSize: 20 }} /></Card>
            <Card>
              <Statistic title="已登记（摘要）" value={summary?.count ?? '—'}
                suffix={summary ? ` / ${formatSize(summary.bytes_registered)}` : undefined}
                valueStyle={{ fontSize: 20 }} />
            </Card>
          </div>

          <Table<MediaItem> rowKey="code" loading={loading} columns={columns} dataSource={items} pagination={{ pageSize: 20 }} />
        </>
      )}

      <Modal title="上传媒体" open={uploadOpen} onCancel={() => setUploadOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setUploadOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={uploading} onClick={handleUpload} disabled={!uploadFile}>上传</Button>,
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="文件" required>
            <Upload maxCount={1} beforeUpload={(f) => { setUploadFile(f); return false; }}
              onRemove={() => setUploadFile(null)}>
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="标题（可选）">
            <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="媒体标题" />
          </Form.Item>
          <Form.Item label="目标目录（可选）">
            <Input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="media/ 下子目录" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
