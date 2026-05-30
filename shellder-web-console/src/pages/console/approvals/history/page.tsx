'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  APPROVAL_STATUS_META,
  ApprovalItem,
  ApprovalRiskLevel,
  ApprovalStatus,
  RISK_LEVEL_META,
  RISK_LEVEL_OPTIONS,
  listApprovals,
} from '@/lib/approval';

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

const HISTORY_STATUS_OPTIONS = [
  { value: 'approved', label: '已确认' },
  { value: 'rejected', label: '已驳回' },
  { value: 'timeout', label: '已超时' },
];

export default function ApprovalHistoryPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [data, setData] = useState<ApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [status, setStatus] = useState<ApprovalStatus | undefined>();
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await listApprovals({
        tenantId: activeTenantId,
        status,
        keyword: keyword || undefined,
        page,
        pageSize,
      });
      // 仅展示已处理的记录（排除 pending）
      const filtered = status
        ? res.items
        : res.items.filter((i) => i.status !== 'pending');
      setData(filtered);
      setTotal(status ? res.total : filtered.length);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : '加载审批记录失败',
      );
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, status, keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ApprovalItem> = [
    {
      title: '动作类型',
      dataIndex: 'actionType',
      width: 160,
      render: (v: string, row) => (
        <Link to={`/approvals/${row.id}`}>{v}</Link>
      ),
    },
    {
      title: '动作摘要',
      dataIndex: 'actionSummary',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      render: (v: ApprovalRiskLevel) => (
        <Tag color={RISK_LEVEL_META[v].color}>{RISK_LEVEL_META[v].label}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: ApprovalStatus) => (
        <Tag color={APPROVAL_STATUS_META[v].color}>
          {APPROVAL_STATUS_META[v].label}
        </Tag>
      ),
    },
    {
      title: '审批人',
      dataIndex: 'reviewerName',
      width: 120,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '审批时间',
      dataIndex: 'reviewedAt',
      width: 170,
      render: fmt,
    },
    {
      title: '审批意见',
      dataIndex: 'opinion',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, row) => (
        <Link to={`/approvals/${row.id}`}>详情</Link>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          审批记录
        </Typography.Title>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="审批按租户隔离，需选定租户后查看。"
        />
      ) : (
        <>
          <Space className="mb-4" wrap>
            <Select
              allowClear
              placeholder="审批结果"
              style={{ width: 140 }}
              options={HISTORY_STATUS_OPTIONS}
              value={status}
              onChange={(v) => setStatus(v as ApprovalStatus | undefined)}
            />
            <Input.Search
              allowClear
              placeholder="搜索动作/发起人"
              style={{ width: 240 }}
              onSearch={setKeyword}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
          </Space>

          <Table<ApprovalItem>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </>
      )}
    </>
  );
}
