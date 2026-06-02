'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  EXEC_STATUS_META,
  Skill,
  SkillExecStatus,
  SkillExecution,
  getSkillExecutions,
  listSkills,
} from '@/lib/skill';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function SkillExecutionsPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>();
  const [data, setData] = useState<SkillExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SkillExecStatus | undefined>();

  useEffect(() => {
    if (!activeTenantId) { setSkills([]); return; }
    void listSkills({ tenantId: activeTenantId, pageSize: 200 }).then((r) => setSkills(r.items)).catch(() => setSkills([]));
  }, [activeTenantId]);

  const load = useCallback(async () => {
    if (!selectedSkillId) { setData([]); return; }
    setLoading(true);
    try {
      const res = await getSkillExecutions(selectedSkillId, { status: statusFilter, pageSize: 200 });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载调用记录失败');
    } finally { setLoading(false); }
  }, [selectedSkillId, statusFilter, message]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<SkillExecution> = [
    withNowrap<SkillExecution>({
      title: '时间',
      dataIndex: 'startedAt',
      width: 160,
      render: (v: string) => fmt(v),
    }),
    withNowrap<SkillExecution>({
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: SkillExecStatus) => (
        <Tag color={EXEC_STATUS_META[s].color}>{EXEC_STATUS_META[s].label}</Tag>
      ),
    }),
    withNowrap<SkillExecution>({
      title: '会话',
      dataIndex: 'sessionId',
      width: 160,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '任务',
      dataIndex: 'taskId',
      width: 160,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '用户',
      dataIndex: 'userId',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '失败原因',
      dataIndex: 'errorSummary',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (_, row) => {
        if (!row.finishedAt) return '—';
        return `${new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime()}ms`;
      },
    }),
  ];

  return (
    <>
      <Typography.Title level={3}>技能书调用记录</Typography.Title>
      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" />
      ) : (
        <>
          <Space className="mb-4" wrap>
            <Select showSearch optionFilterProp="label" allowClear placeholder="选择技能书" style={{ width: 260 }}
              options={skills.map((s) => ({ value: s.id, label: `${s.name}（${s.code}）` }))}
              value={selectedSkillId} onChange={setSelectedSkillId}
            />
            <Select allowClear placeholder="状态" style={{ width: 120 }}
              options={Object.entries(EXEC_STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))}
              value={statusFilter} onChange={setStatusFilter}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<SkillExecution>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无调用记录" /> }}
            {...tableEllipsisLayout}
          />
        </>
      )}
    </>
  );
}
