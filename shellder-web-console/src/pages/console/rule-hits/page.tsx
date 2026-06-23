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
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  RESULT_META,
  RULE_ACTION_META,
  RULE_TYPE_META,
  RuleHit,
  RuleType,
  listRuleHits,
} from '@/lib/rule';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

const TYPE_OPTIONS = Object.entries(RULE_TYPE_META).map(([value, m]) => ({
  value,
  label: m.label,
}));

export default function RuleHitsPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [data, setData] = useState<RuleHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [ruleType, setRuleType] = useState<RuleType | undefined>();
  const [detail, setDetail] = useState<RuleHit | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRuleHits({
        tenantId: activeTenantId,
        keyword,
        ruleType,
        page,
        pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载规则命中记录失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, ruleType, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<RuleHit> = [
    withNowrap<RuleHit>({
      title: '规则',
      dataIndex: 'ruleName',
      width: 200,
      render: (v: string, row) => (
        <Space size={4} className="flex-nowrap">
          {renderEllipsisLink(v, () => setDetail(row))}
          {!row.ruleId ? (
            <Tag className="shrink-0" color="default">
              已删除
            </Tag>
          ) : null}
        </Space>
      ),
    }),
    withNowrap<RuleHit>({
      title: '类型',
      dataIndex: 'ruleType',
      width: 120,
      render: (t: RuleType) => (
        <Tag color={RULE_TYPE_META[t].color}>{RULE_TYPE_META[t].label}</Tag>
      ),
    }),
    withNowrap<RuleHit>({
      title: 'Tool',
      dataIndex: 'toolName',
      width: 160,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<RuleHit>({
      title: '处理结果',
      dataIndex: 'result',
      width: 100,
      render: (r: RuleHit['result']) => (
        <Tag color={RESULT_META[r].color}>{RESULT_META[r].label}</Tag>
      ),
    }),
    withNowrap<RuleHit>({
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
          规则命中记录
        </Typography.Title>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="请先在顶栏选择「当前操作租户」"
          description="命中记录按租户隔离；嵌入 Copilot 测试时请确保与预览页使用同一租户。"
        />
      ) : (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          message="记录范围说明"
          description="本页展示 Policy 显式规则（规则配置）的命中；路由规则触发的确认会以「[路由] 规则名」写入。能力路由规则本身不在此列表。"
        />
      )}

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="按规则 / Tool 名称搜索"
          style={{ width: 260 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="规则类型"
          style={{ width: 150 }}
          options={TYPE_OPTIONS}
          value={ruleType}
          onChange={(v) => {
            setRuleType(v);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<RuleHit>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{ emptyText: <Empty description="暂无规则命中记录" /> }}
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
        title="命中详情"
        width={520}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="规则名称">{detail.ruleName}</Descriptions.Item>
            <Descriptions.Item label="规则类型">
              <Tag color={RULE_TYPE_META[detail.ruleType].color}>
                {RULE_TYPE_META[detail.ruleType].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="规则动作">
              <Tag color={RULE_ACTION_META[detail.ruleAction].color}>
                {RULE_ACTION_META[detail.ruleAction].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="处理结果">
              <Tag color={RESULT_META[detail.result].color}>
                {RESULT_META[detail.result].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tool">{detail.toolName || '—'}</Descriptions.Item>
            <Descriptions.Item label="业务能力">{detail.capability || '—'}</Descriptions.Item>
            <Descriptions.Item label="请求摘要">
              {detail.requestSummary || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="租户 ID">{detail.tenantId}</Descriptions.Item>
            <Descriptions.Item label="会话 ID">{detail.sessionId || '—'}</Descriptions.Item>
            <Descriptions.Item label="任务 ID">{detail.taskId || '—'}</Descriptions.Item>
            <Descriptions.Item label="规则状态">
              {detail.ruleId ? '关联规则存在' : '关联规则已删除（快照保留）'}
            </Descriptions.Item>
            <Descriptions.Item label="命中时间">{fmt(detail.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
