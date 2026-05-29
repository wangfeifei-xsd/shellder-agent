'use client';

import { Alert, Descriptions, Space, Tag, Typography } from 'antd';
import { ToolTestResult } from '@/lib/tool';

function statusMeta(status: ToolTestResult['status']): { color: string; label: string } {
  switch (status) {
    case 'success':
      return { color: 'green', label: '执行成功' };
    case 'failed':
      return { color: 'red', label: '执行失败' };
    case 'denied':
      return { color: 'red', label: 'Policy 拒绝' };
    case 'need_confirm':
      return { color: 'orange', label: '需人工确认' };
    case 'skipped':
    default:
      return { color: 'default', label: '未执行' };
  }
}

/** 调用测试 / SQL 测试结果展示（执行计划 §4.4）：Policy 决策、schema 校验、原始请求/响应、转换结果。 */
export function ToolTestResultView({ result }: { result: ToolTestResult }) {
  const meta = statusMeta(result.status);
  return (
    <div className="mt-4">
      <Space className="mb-2" wrap>
        <Tag color={meta.color}>{meta.label}</Tag>
        <Tag color={result.executed ? 'blue' : 'default'}>
          {result.executed ? '已发起调用' : '未发起调用'}
        </Tag>
        <Typography.Text type="secondary" className="text-xs">
          {result.durationMs}ms
        </Typography.Text>
      </Space>
      <Alert
        className="mb-3"
        type={
          result.status === 'success'
            ? 'success'
            : result.status === 'need_confirm' || result.status === 'skipped'
              ? 'warning'
              : 'error'
        }
        showIcon
        message={result.message}
      />

      <Typography.Text strong>Policy 决策</Typography.Text>
      <Descriptions column={2} bordered size="small" className="mt-1">
        <Descriptions.Item label="结果">{result.policy.result}</Descriptions.Item>
        <Descriptions.Item label="高风险">
          {result.policy.highRisk ? '是' : '否'}
        </Descriptions.Item>
        <Descriptions.Item label="命中规则" span={2}>
          {result.policy.matchedRules.length ? (
            <Space wrap>
              {result.policy.matchedRules.map((r) => (
                <Tag key={r.ruleId}>
                  {r.name}（{r.action}）
                </Tag>
              ))}
            </Space>
          ) : (
            '无'
          )}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Text strong className="block mt-3">
        入参 Schema 校验
      </Typography.Text>
      {result.inputValidation.valid ? (
        <Tag color="green">通过</Tag>
      ) : (
        <Alert
          type="error"
          showIcon
          message="未通过"
          description={result.inputValidation.errors.join('；')}
        />
      )}

      {result.outputValidation && (
        <>
          <Typography.Text strong className="block mt-3">
            出参 Schema 校验
          </Typography.Text>
          {result.outputValidation.valid ? (
            <Tag color="green">通过</Tag>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="未通过"
              description={result.outputValidation.errors.join('；')}
            />
          )}
        </>
      )}

      {result.rawRequest !== undefined && (
        <>
          <Typography.Text strong className="block mt-3">
            原始请求
          </Typography.Text>
          <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded">
            {JSON.stringify(result.rawRequest, null, 2)}
          </pre>
        </>
      )}
      {result.rawResponse !== undefined && (
        <>
          <Typography.Text strong className="block mt-3">
            原始响应
          </Typography.Text>
          <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded max-h-64 overflow-auto">
            {JSON.stringify(result.rawResponse, null, 2)}
          </pre>
        </>
      )}
      {result.transformedResult !== undefined && (
        <>
          <Typography.Text strong className="block mt-3">
            转换结果
          </Typography.Text>
          <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded max-h-64 overflow-auto">
            {JSON.stringify(result.transformedResult, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
