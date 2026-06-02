'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  EllipsisCell,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { CapabilityKey, CatalogItem, fetchCatalog } from '@/lib/auth';
import {
  PermissionPolicyItem,
  listPermissionPolicies,
  updatePermissionPolicy,
} from '@/lib/role';

export default function PermissionPolicyPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<PermissionPolicyItem[]>([]);
  const [capabilities, setCapabilities] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPermissionPolicies();
      setItems(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载权限策略失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchCatalog().then((c) => setCapabilities(c.capabilities)).catch(() => undefined);
  }, []);

  const persist = async (
    roleId: string,
    patch: { capabilities?: CapabilityKey[]; canApproveHighRisk?: boolean },
  ) => {
    setSavingId(roleId);
    try {
      const updated = await updatePermissionPolicy(roleId, patch);
      setItems((prev) => prev.map((it) => (it.roleId === roleId ? updated : it)));
      message.success('已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
      void load();
    } finally {
      setSavingId(undefined);
    }
  };

  const columns: ColumnsType<PermissionPolicyItem> = [
    withNowrap<PermissionPolicyItem>({
      title: '角色',
      dataIndex: 'roleName',
      width: 200,
      render: (v: string, row) => (
        <EllipsisCell tooltip={`${v} (${row.roleCode})`}>
          <Space size={4} className="flex-nowrap">
            <Typography.Text strong>{v}</Typography.Text>
            <Typography.Text type="secondary">{row.roleCode}</Typography.Text>
            {row.isSystem ? <Tag color="gold" className="shrink-0">内置</Tag> : null}
          </Space>
        </EllipsisCell>
      ),
    }),
    withNowrap<PermissionPolicyItem>({
      title: '四类能力访问权限',
      dataIndex: 'capabilities',
      render: (caps: CapabilityKey[], row) => (
        <Checkbox.Group
          className="flex flex-nowrap gap-2 overflow-x-auto"
          value={caps}
          disabled={savingId === row.roleId}
          onChange={(v) => persist(row.roleId, { capabilities: v as CapabilityKey[] })}
        >
          {capabilities.map((c) => (
            <Checkbox key={c.key} value={c.key} className="!mr-0 shrink-0">
              {c.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      ),
    }),
    withNowrap<PermissionPolicyItem>({
      title: '高风险动作审批权限',
      dataIndex: 'canApproveHighRisk',
      width: 180,
      render: (v: boolean, row) => (
        <Switch
          checked={v}
          loading={savingId === row.roleId}
          onChange={(checked) => persist(row.roleId, { canApproveHighRisk: checked })}
        />
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          权限策略
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      <Typography.Paragraph type="secondary">
        按角色维度配置四类业务能力（问答 / 查询 / 操作 / 流程）的访问权限，以及高风险动作的审批权限。修改即时保存。
      </Typography.Paragraph>
      <Table<PermissionPolicyItem>
        rowKey="roleId"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={false}
        {...tableEllipsisLayout}
      />
    </>
  );
}
