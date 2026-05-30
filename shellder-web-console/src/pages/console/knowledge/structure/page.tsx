'use client';

import {
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  ALL_LAYERS,
  DataFolderTreeNode,
  LAYER_LABELS,
  KnowledgeLayer,
  createFolder,
  deleteFolder,
  getDataTree,
  isKnowledgeProxyError,
  renameFolder,
} from '@/lib/knowledge-proxy';

function toTreeData(node: DataFolderTreeNode): DataNode {
  return {
    key: node.path || '/',
    title: node.title || node.path || '(根)',
    children: (node.children ?? []).map(toTreeData),
    isLeaf: !(node.children?.length),
  };
}

export default function KnowledgeStructurePage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [layer, setLayer] = useState<KnowledgeLayer>('raw');
  const [tree, setTree] = useState<DataFolderTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();
  const [selectedPath, setSelectedPath] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setTree(null); return; }
    setLoading(true);
    setProxyError(undefined);
    try {
      setTree(await getDataTree(activeTenantId, layer));
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(err instanceof Error ? err.message : '加载目录树失败');
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, layer, message]);

  useEffect(() => { void load(); }, [load]);

  const treeData = useMemo(() => (tree ? [toTreeData(tree)] : []), [tree]);

  const handleCreate = async () => {
    if (!activeTenantId || !newFolderName.trim()) {
      message.warning('请输入目录名');
      return;
    }
    setCreating(true);
    try {
      await createFolder(activeTenantId, layer, newFolderName.trim());
      message.success('目录已创建');
      setCreateOpen(false);
      setNewFolderName('');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!activeTenantId || !selectedPath || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await renameFolder(activeTenantId, layer, selectedPath, renameValue.trim());
      message.success('已重命名');
      setRenameOpen(false);
      setSelectedPath('');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重命名失败（目录须为空）');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = () => {
    if (!activeTenantId || !selectedPath) {
      message.warning('请先在树中选择要删除的目录');
      return;
    }
    modal.confirm({
      title: `确认删除空目录「${selectedPath}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteFolder(activeTenantId, layer, selectedPath);
          message.success('已删除');
          setSelectedPath('');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败（目录须为空）');
        }
      },
    });
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">存储结构</Typography.Title>
        <Space>
          <Button icon={<FolderAddOutlined />} onClick={() => setCreateOpen(true)} disabled={!activeTenantId}>
            新建目录
          </Button>
          <Button icon={<EditOutlined />} onClick={() => {
            if (!selectedPath) { message.warning('请先选择目录'); return; }
            setRenameValue(selectedPath.replace(/\/$/, '').split('/').pop() ?? '');
            setRenameOpen(true);
          }} disabled={!activeTenantId || !selectedPath}>
            重命名
          </Button>
          <Button icon={<DeleteOutlined />} danger onClick={handleDelete} disabled={!activeTenantId || !selectedPath}>
            删除空目录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>刷新</Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」"
          description="存储结构按租户隔离，展示 raw / wiki / schema / media 四层目录树。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="展示四层存储目录结构。可在层根下新建单层子目录；重命名与删除仅支持空目录。"
          />
          {proxyError && <KnowledgeProxyErrorAlert error={proxyError} className="mb-4" />}

          <Space className="mb-4">
            <Typography.Text type="secondary">选择层：</Typography.Text>
            <Select
              style={{ width: 220 }}
              value={layer}
              onChange={(v) => { setLayer(v); setSelectedPath(''); }}
              options={ALL_LAYERS.map((l) => ({ value: l, label: LAYER_LABELS[l] }))}
            />
            {selectedPath && (
              <Typography.Text type="secondary">已选：{selectedPath}</Typography.Text>
            )}
          </Space>

          <div className="rounded border border-gray-200 bg-white p-4 min-h-[400px]">
            {loading ? (
              <Typography.Text type="secondary">加载中…</Typography.Text>
            ) : treeData.length > 0 ? (
              <Tree
                key={`${activeTenantId}-${layer}`}
                showLine
                treeData={treeData}
                defaultExpandedKeys={[]}
                selectedKeys={selectedPath ? [selectedPath] : []}
                onSelect={(keys) => setSelectedPath(keys[0] === '/' ? '' : String(keys[0] ?? ''))}
              />
            ) : (
              <Typography.Text type="secondary">该层暂无目录</Typography.Text>
            )}
          </div>
        </>
      )}

      <Modal title="新建子目录" open={createOpen} onCancel={() => setCreateOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={creating} onClick={handleCreate}>创建</Button>,
        ]}
      >
        <Alert className="mb-3" type="info" showIcon message={`在 ${LAYER_LABELS[layer]} 层根下新建单层子目录`} />
        <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="如：reef" />
      </Modal>

      <Modal title="重命名目录" open={renameOpen} onCancel={() => setRenameOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setRenameOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={renaming} onClick={handleRename}>确定</Button>,
        ]}
      >
        <Alert className="mb-3" type="warning" showIcon message="仅支持重命名空目录" />
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="新目录名" />
      </Modal>
    </>
  );
}
