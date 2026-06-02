'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  renderEllipsisLink,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  AuditStatus,
  UserActionAudit,
  listUserActionAudits,
  statusMeta,
} from '@/lib/audit';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

export default function UserActionAuditPage() {
  const { message } = App.useApp();

  const [data, setData] = useState<UserActionAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<UserActionAudit | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUserActionAudits({ keyword, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载用户操作审计失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<UserActionAudit> = [
    withNowrap<UserActionAudit>({
      title: '操作',
      dataIndex: 'action',
      width: 180,
      render: (v: string, row) => renderEllipsisLink(v, () => setDetail(row)),
    }),
    withNowrap<UserActionAudit>({
      title: '操作人',
      dataIndex: 'operatorName',
      width: 120,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<UserActionAudit>({
      title: '目标',
      key: 'target',
      width: 180,
      render: (_, row) => {
        const text = row.targetType
          ? `${row.targetType}${row.targetId ? `#${row.targetId}` : ''}`
          : '';
        return renderOptionalText(text || undefined);
      },
    }),
    withNowrap<UserActionAudit>({
      title: '模块',
      dataIndex: 'module',
      width: 120,
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : renderOptionalText(undefined)),
    }),
    withNowrap<UserActionAudit>({
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: AuditStatus) => {
        const meta = statusMeta(s);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    }),
    withNowrap<UserActionAudit>({
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => fmt(v),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          用户操作审计
        </Typography.Title>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="按操作标识或摘要搜索"
          style={{ width: 280 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<UserActionAudit>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{ emptyText: '暂无用户操作审计记录' }}
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

      <Drawer
        title="用户操作详情"
        width={560}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="操作">{detail.action}</Descriptions.Item>
              <Descriptions.Item label="摘要">{detail.summary || '—'}</Descriptions.Item>
              <Descriptions.Item label="操作人">{detail.operatorName || '—'}</Descriptions.Item>
              <Descriptions.Item label="模块">{detail.module || '—'}</Descriptions.Item>
              <Descriptions.Item label="目标类型">{detail.targetType || '—'}</Descriptions.Item>
              <Descriptions.Item label="目标 ID">{detail.targetId || '—'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMeta(detail.status).color}>
                  {statusMeta(detail.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="租户 ID">{detail.tenantId || '—'}</Descriptions.Item>
              <Descriptions.Item label="来源 IP">{detail.ip || '—'}</Descriptions.Item>
              <Descriptions.Item label="请求 ID">{detail.requestId || '—'}</Descriptions.Item>
              <Descriptions.Item label="时间">{fmt(detail.createdAt)}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} className="!mt-4">
              操作差异摘要
            </Typography.Title>
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs">
              {JSON.stringify(detail.diff ?? {}, null, 2)}
            </pre>
          </>
        )}
      </Drawer>
    </>
  );
}
