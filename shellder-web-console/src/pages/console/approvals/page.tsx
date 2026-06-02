'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
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
import {
  EllipsisCell,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  APPROVAL_STATUS_META,
  APPROVAL_STATUS_OPTIONS,
  ApprovalItem,
  ApprovalRiskLevel,
  ApprovalStatus,
  RISK_LEVEL_META,
  RISK_LEVEL_OPTIONS,
  listApprovals,
} from '@/lib/approval';

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

export default function ApprovalListPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [data, setData] = useState<ApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [status, setStatus] = useState<ApprovalStatus | undefined>('pending');
  const [keyword, setKeyword] = useState('');
  const [riskLevel, setRiskLevel] = useState<ApprovalRiskLevel | undefined>();

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
        riskLevel,
        keyword: keyword || undefined,
        page,
        pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载审批列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, status, riskLevel, keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ApprovalItem> = [
    withNowrap<ApprovalItem>({
      title: '动作类型',
      dataIndex: 'actionType',
      width: 160,
      render: (v: string, row) => (
        <EllipsisCell tooltip={v}>
          <Link to={`/approvals/${row.id}`}>{v}</Link>
        </EllipsisCell>
      ),
    }),
    withNowrap<ApprovalItem>({
      title: '动作摘要',
      dataIndex: 'actionSummary',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<ApprovalItem>({
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      render: (v: ApprovalRiskLevel) => (
        <Tag color={RISK_LEVEL_META[v].color}>{RISK_LEVEL_META[v].label}</Tag>
      ),
    }),
    withNowrap<ApprovalItem>({
      title: '发起人',
      dataIndex: 'initiatorName',
      width: 120,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<ApprovalItem>({
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: ApprovalStatus) => (
        <Tag color={APPROVAL_STATUS_META[v].color}>{APPROVAL_STATUS_META[v].label}</Tag>
      ),
    }),
    withNowrap<ApprovalItem>({
      title: '审批人',
      dataIndex: 'reviewerName',
      width: 120,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<ApprovalItem>({
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: fmt,
    }),
    withNowrap<ApprovalItem>({
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, row) => (
        <EllipsisCell>
          <Link to={`/approvals/${row.id}`}>详情</Link>
        </EllipsisCell>
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          待确认列表
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
              placeholder="审批状态"
              style={{ width: 140 }}
              options={APPROVAL_STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <Select
              allowClear
              placeholder="风险等级"
              style={{ width: 140 }}
              options={RISK_LEVEL_OPTIONS}
              value={riskLevel}
              onChange={setRiskLevel}
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
            {...tableEllipsisLayout}
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
