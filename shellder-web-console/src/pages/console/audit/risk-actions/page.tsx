'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
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
import { AuditStatus, RiskAction, listRiskActions, statusMeta } from '@/lib/audit';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

const SOURCE_LABEL: Record<RiskAction['source'], string> = {
  tool_call: '高风险工具调用',
  approval: '审批记录',
};

export default function RiskActionAuditPage() {
  const { message } = App.useApp();

  const [data, setData] = useState<RiskAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<RiskAction | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRiskActions({ keyword, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载风险动作审计失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<RiskAction> = [
    withNowrap<RiskAction>({
      title: '动作',
      dataIndex: 'action',
      width: 200,
      render: (v: string, row) => renderEllipsisLink(v, () => setDetail(row)),
    }),
    withNowrap<RiskAction>({
      title: '来源',
      dataIndex: 'source',
      width: 160,
      render: (v: RiskAction['source']) => <Tag color="volcano">{SOURCE_LABEL[v]}</Tag>,
    }),
    withNowrap<RiskAction>({
      title: '操作人',
      dataIndex: 'operator',
      width: 120,
      render: (v: string | null) => (v ? renderOptionalText(v) : renderOptionalText('系统')),
    }),
    withNowrap<RiskAction>({
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: AuditStatus) => {
        const meta = statusMeta(s);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    }),
    withNowrap<RiskAction>({
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
          风险动作审计
        </Typography.Title>
      </div>

      <Alert
        className="mb-4"
        type="info"
        showIcon
        message="聚合只读视图"
        description="风险动作审计不单独采集，聚合自高风险工具调用，14-审批中心 就绪后将合并审批记录展示全链路摘要。"
      />

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="按动作搜索"
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

      <Table<RiskAction>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        {...tableEllipsisLayout}
        locale={{
          emptyText: (
            <Empty description="暂无风险动作（无高风险工具调用与审批数据）" />
          ),
        }}
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
        title="风险动作详情"
        width={520}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="动作">{detail.action}</Descriptions.Item>
            <Descriptions.Item label="来源">{SOURCE_LABEL[detail.source]}</Descriptions.Item>
            <Descriptions.Item label="操作人">{detail.operator || '系统'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMeta(detail.status).color}>{statusMeta(detail.status).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="会话 ID">{detail.sessionId || '—'}</Descriptions.Item>
            <Descriptions.Item label="任务 ID">{detail.taskId || '—'}</Descriptions.Item>
            <Descriptions.Item label="租户 ID">{detail.tenantId || '—'}</Descriptions.Item>
            <Descriptions.Item label="摘要">{detail.summary || '—'}</Descriptions.Item>
            <Descriptions.Item label="时间">{fmt(detail.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
