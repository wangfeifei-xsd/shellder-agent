'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
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
  ToolCallAudit,
  listToolCallAudits,
  statusMeta,
} from '@/lib/audit';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

export default function ToolCallAuditPage() {
  const { message } = App.useApp();

  const [data, setData] = useState<ToolCallAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<AuditStatus | undefined>();

  const [detail, setDetail] = useState<ToolCallAudit | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listToolCallAudits({ keyword, status, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载工具调用审计失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, status, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ToolCallAudit> = [
    withNowrap<ToolCallAudit>({
      title: 'Tool 名称',
      dataIndex: 'toolName',
      width: 200,
      render: (v: string, row) => (
        <Space size={4} className="flex-nowrap">
          {renderEllipsisLink(v, () => setDetail(row))}
          {row.highRisk ? (
            <Tag className="shrink-0" color="volcano">
              高风险
            </Tag>
          ) : null}
        </Space>
      ),
    }),
    withNowrap<ToolCallAudit>({
      title: '调用人',
      dataIndex: 'callerName',
      width: 120,
      render: (v: string | null) => (v ? renderOptionalText(v) : renderOptionalText('系统')),
    }),
    withNowrap<ToolCallAudit>({
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: AuditStatus) => {
        const meta = statusMeta(s);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    }),
    withNowrap<ToolCallAudit>({
      title: '耗时',
      dataIndex: 'durationMs',
      width: 100,
      render: (v: number | null) => (v == null ? '—' : `${v} ms`),
    }),
    withNowrap<ToolCallAudit>({
      title: '入参摘要',
      dataIndex: 'requestSummary',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<ToolCallAudit>({
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
          工具调用审计
        </Typography.Title>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="按 Tool 名称搜索"
          style={{ width: 240 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'success', label: '成功' },
            { value: 'failed', label: '失败' },
            { value: 'pending', label: '进行中' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<ToolCallAudit>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{ emptyText: '暂无工具调用审计（07 工具模块起写入真实数据）' }}
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
        title="工具调用详情"
        width={520}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Tool 名称">{detail.toolName}</Descriptions.Item>
            <Descriptions.Item label="Tool ID">{detail.toolId || '—'}</Descriptions.Item>
            <Descriptions.Item label="调用人">{detail.callerName || '系统'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMeta(detail.status).color}>{statusMeta(detail.status).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="高风险">{detail.highRisk ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="耗时">
              {detail.durationMs == null ? '—' : `${detail.durationMs} ms`}
            </Descriptions.Item>
            <Descriptions.Item label="会话 ID">{detail.sessionId || '—'}</Descriptions.Item>
            <Descriptions.Item label="任务 ID">{detail.taskId || '—'}</Descriptions.Item>
            <Descriptions.Item label="租户 ID">{detail.tenantId || '—'}</Descriptions.Item>
            <Descriptions.Item label="入参摘要">{detail.requestSummary || '—'}</Descriptions.Item>
            <Descriptions.Item label="错误信息">{detail.errorMessage || '—'}</Descriptions.Item>
            <Descriptions.Item label="时间">{fmt(detail.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
