'use client';

import { App, Alert, Button, Card, Input, Modal, Popconfirm, Space, Spin, Tabs, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  DataFolderTreeNode,
  KnowledgeLayer,
  createFolder,
  deleteFolder,
  DATA_TREE_DEFAULT_OPTS,
  getDataTree,
  isKnowledgeProxyError,
  knowledgeProxyErrorMessage,
  renameFolder,
} from '@/lib/knowledge-proxy';

const { Text, Paragraph } = Typography;

const LAYER_TAB: { key: KnowledgeLayer; label: string }[] = [
  { key: 'raw', label: 'raw' },
  { key: 'wiki', label: 'wiki' },
  { key: 'schema', label: 'schema' },
  { key: 'media', label: 'media' },
];

const ROOT_TREE_KEY = '__root__';

function toTreeData(n: DataFolderTreeNode): DataNode {
  const key = n.path === '' ? ROOT_TREE_KEY : n.path;
  return {
    key,
    title: n.title,
    children: n.children.map(toTreeData),
  };
}

function treeKeyToPath(key: string): string {
  return key === ROOT_TREE_KEY ? '' : key;
}

export default function KnowledgeStructurePage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [tab, setTab] = useState<KnowledgeLayer>('raw');
  const [treeRoot, setTreeRoot] = useState<DataFolderTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const selectedPath = useMemo(
    () => (selectedKey == null ? undefined : treeKeyToPath(selectedKey)),
    [selectedKey],
  );

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const loadTree = useCallback(async () => {
    if (!activeTenantId) {
      setTreeRoot(null);
      return;
    }
    setLoading(true);
    setProxyError(undefined);
    try {
      setTreeRoot(await getDataTree(activeTenantId, tab, DATA_TREE_DEFAULT_OPTS));
      setSelectedKey(undefined);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(knowledgeProxyErrorMessage(err));
      setTreeRoot(null);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message, tab]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const treeData = useMemo(() => (treeRoot ? [toTreeData(treeRoot)] : []), [treeRoot]);

  /** 多知识库绑定时 filterDataTreeToTenantScope 会合成虚拟根「租户知识库」 */
  const isMultiKbVirtualRoot = useMemo(
    () => treeRoot?.path === '' && treeRoot?.title === '租户知识库',
    [treeRoot],
  );

  const isVirtualRootSelected =
    isMultiKbVirtualRoot &&
    (selectedKey === ROOT_TREE_KEY || selectedPath === '' || selectedPath == null);

  const canAddSubfolder = selectedKey != null && !isVirtualRootSelected;

  const createParentPath = useMemo(() => {
    if (selectedKey == null) return undefined;
    if (isVirtualRootSelected) return undefined;
    return selectedPath ?? '';
  }, [isVirtualRootSelected, selectedKey, selectedPath]);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTo, setRenameTo] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const openAdd = useCallback(() => {
    if (isVirtualRootSelected) {
      message.warning(
        '「租户知识库」根下为知识库绑定目录，不可在此新建；请先选择某一知识库目录，再在其下创建子目录',
      );
      return;
    }
    if (selectedKey == null) {
      message.warning('请先选择要在其下创建子目录的父目录');
      return;
    }
    setAddOpen(true);
  }, [isVirtualRootSelected, message, selectedKey]);

  const submitAdd = useCallback(async () => {
    if (!activeTenantId || createParentPath === undefined) return;
    const name = addName.trim();
    if (!name) {
      message.warning('请输入目录名');
      return;
    }
    setAddSubmitting(true);
    try {
      await createFolder(activeTenantId, tab, name, createParentPath);
      const parentLabel = createParentPath ? `${createParentPath}/` : `${tab}/（知识库根）/`;
      message.success(`已创建：${parentLabel}${name}/`);
      setAddOpen(false);
      setAddName('');
      void loadTree();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setAddSubmitting(false);
    }
  }, [activeTenantId, addName, createParentPath, loadTree, message, tab]);

  const submitRename = useCallback(async () => {
    if (!activeTenantId || selectedPath == null || selectedPath === '') {
      message.warning('请选择要重命名的子目录（不能选层根）');
      return;
    }
    const newName = renameTo.trim();
    if (!newName) {
      message.warning('请输入新名称');
      return;
    }
    setRenameSubmitting(true);
    try {
      await renameFolder(activeTenantId, tab, selectedPath, newName);
      message.success('已重命名');
      setRenameOpen(false);
      setRenameTo('');
      void loadTree();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setRenameSubmitting(false);
    }
  }, [activeTenantId, loadTree, message, renameTo, selectedPath, tab]);

  const submitDelete = useCallback(async () => {
    if (!activeTenantId || selectedPath == null || selectedPath === '') {
      message.warning('不能删除层根');
      return;
    }
    try {
      await deleteFolder(activeTenantId, tab, selectedPath);
      message.success('已删除');
      void loadTree();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    }
  }, [activeTenantId, loadTree, message, selectedPath, tab]);

  const openRename = useCallback(() => {
    if (!selectedPath) {
      message.warning('请先选择目录');
      return;
    }
    if (selectedPath === '') {
      message.warning('层根不可重命名');
      return;
    }
    const seg = selectedPath.replace(/\/$/, '').split('/').pop() ?? '';
    setRenameTo(seg);
    setRenameOpen(true);
  }, [message, selectedPath]);

  if (!activeTenantId) {
    return (
      <>
        <Typography.Title level={3} className="!mb-4">
          存储结构
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="按当前租户在知识库管理中配置的 wiki 路径前缀隔离；仅展示本租户绑定范围内的目录树（raw / wiki / schema / media）。"
        />
      </>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} className="!mb-0">
        存储结构
      </Typography.Title>
      <Alert type="info" showIcon message={`当前租户：${activeTenantName ?? activeTenantId}`} />
      {proxyError != null ? <KnowledgeProxyErrorAlert error={proxyError} /> : null}
      <Alert
        type="info"
        showIcon
        message="存储结构"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            与服务器 <Text code>data/</Text> 下 <Text code>raw</Text>、<Text code>wiki</Text>、
            <Text code>schema</Text>、<Text code>media</Text> 目录对应。<strong>新增</strong>须先选中
            <strong>父目录</strong>，再在其下创建单层子目录。绑定多个知识库时，树顶「租户知识库」为虚拟根
            （其下各节点为知识库管理中绑定的目录），<strong>不可在虚拟根下新建</strong>，但可在各绑定目录下新建。
            <strong>重命名</strong>与
            <strong>删除</strong>仅当该目录<strong>为空</strong>时允许。
            <Text code>media</Text> 层内文件与 manifest 请用「媒体库」维护；本页勿删{' '}
            <Text code>objects/</Text> 或 <Text code>manifest.json</Text>。
          </Paragraph>
        }
      />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as KnowledgeLayer)}
          items={LAYER_TAB.map((t) => ({
            key: t.key,
            label: t.label,
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap>
                  <Button onClick={() => void loadTree()} loading={loading}>
                    刷新
                  </Button>
                  <Button type="primary" onClick={openAdd} disabled={!canAddSubfolder}>
                    新增子目录
                  </Button>
                  <Button onClick={openRename} disabled={!selectedPath || selectedPath === ''}>
                    重命名所选
                  </Button>
                  <Popconfirm
                    title="删除该空目录？"
                    description={selectedPath || '未选择'}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    disabled={!selectedPath || selectedPath === ''}
                    onConfirm={() => void submitDelete()}
                  >
                    <Button danger disabled={!selectedPath || selectedPath === ''}>
                      删除所选
                    </Button>
                  </Popconfirm>
                </Space>
                <div
                  style={{
                    minHeight: 360,
                    overflow: 'auto',
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Spin spinning={loading}>
                    <Tree
                      showLine
                      blockNode
                      selectable
                      selectedKeys={selectedKey != null ? [selectedKey] : []}
                      onSelect={(keys) => {
                        const k = keys[0];
                        setSelectedKey(k == null ? undefined : String(k));
                      }}
                      treeData={treeData}
                    />
                  </Spin>
                </div>
              </Space>
            ),
          }))}
        />
      </Card>

      <Modal
        title={
          createParentPath
            ? `在 ${createParentPath.replace(/\/$/, '')}/ 下新增子目录`
            : `在知识库根目录下新增子目录`
        }
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={addSubmitting}
        onOk={() => void submitAdd()}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          仅单段名称，建议不要中文
        </Text>
        <Input
          placeholder="目录名"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onPressEnter={() => void submitAdd()}
        />
      </Modal>

      <Modal
        title="重命名目录"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSubmitting}
        onOk={() => void submitRename()}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          当前：{selectedPath ?? '—'}（须为空目录）
        </Text>
        <Input
          placeholder="新目录名（单段）"
          value={renameTo}
          onChange={(e) => setRenameTo(e.target.value)}
          onPressEnter={() => void submitRename()}
        />
      </Modal>
    </Space>
  );
}
