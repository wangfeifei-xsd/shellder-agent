'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  Progress,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  STEP_STATUS_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  TaskProgress,
  getTaskProgress,
} from '@/lib/task';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function TaskTrackingPage() {
  const { message } = App.useApp();
  const searchParams = useSearchParams();
  const initialTaskId = searchParams.get('taskId') ?? '';

  const [taskId, setTaskId] = useState(initialTaskId);
  const [inputValue, setInputValue] = useState(initialTaskId);
  const [progress, setProgress] = useState<TaskProgress | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      setProgress(await getTaskProgress(taskId));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载任务进度失败');
    } finally {
      setLoading(false);
    }
  }, [taskId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearch = () => {
    setTaskId(inputValue.trim());
  };

  const pct = progress
    ? progress.totalSteps > 0
      ? Math.round((progress.completedCount / progress.totalSteps) * 100)
      : progress.task.status === 'completed'
        ? 100
        : progress.task.status === 'running'
          ? 50
          : 0
    : 0;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          长任务跟踪
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          disabled={!taskId}
        >
          刷新
        </Button>
      </div>

      <Space className="mb-4">
        <Input
          placeholder="输入任务 ID"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 360 }}
        />
        <Button type="primary" onClick={handleSearch}>
          查询
        </Button>
      </Space>

      {!taskId && (
        <Alert type="info" showIcon message="请输入任务 ID 或从任务列表点击「跟踪」查看进度。" />
      )}

      {progress && (
        <>
          <Card className="mb-4">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <Typography.Text type="secondary">任务：</Typography.Text>
                <Typography.Text strong>
                  {progress.task.title || progress.task.id.slice(0, 12)}
                </Typography.Text>
                <div className="mt-1">
                  <Tag color={TASK_STATUS_META[progress.task.status].color}>
                    {TASK_STATUS_META[progress.task.status].label}
                  </Tag>
                  <Tag color={TASK_TYPE_META[progress.task.type].color}>
                    {TASK_TYPE_META[progress.task.type].label}
                  </Tag>
                </div>
              </div>
              <div style={{ width: 120 }}>
                <Progress
                  type="circle"
                  percent={pct}
                  size={80}
                  status={
                    progress.task.status === 'failed' || progress.task.status === 'timeout'
                      ? 'exception'
                      : progress.task.status === 'completed'
                        ? 'success'
                        : 'active'
                  }
                />
              </div>
              <div className="text-sm">
                <div>已完成：{progress.completedCount} / {progress.totalSteps} 步</div>
                <div>剩余：{progress.remainingCount} 步</div>
                {progress.currentStep && (
                  <div>当前步骤：{progress.currentStep.name}</div>
                )}
              </div>
            </div>
          </Card>

          {progress.steps.length === 0 ? (
            <Empty description="该任务暂无步骤定义" />
          ) : (
            <Steps
              direction="vertical"
              current={progress.steps.findIndex((s) => s.status === 'running')}
              items={progress.steps.map((step) => ({
                title: (
                  <Space>
                    {step.name}
                    <Tag color={STEP_STATUS_META[step.status].color}>
                      {STEP_STATUS_META[step.status].label}
                    </Tag>
                    {step.toolName && <Tag color="blue">{step.toolName}</Tag>}
                  </Space>
                ),
                description: (
                  <div className="text-xs text-gray-500">
                    {step.description && <div>{step.description}</div>}
                    <div>
                      {step.startedAt && <span>开始: {fmt(step.startedAt)} </span>}
                      {step.completedAt && <span>完成: {fmt(step.completedAt)} </span>}
                      {step.durationMs != null && <span>耗时: {step.durationMs}ms</span>}
                    </div>
                    {step.failReason && (
                      <div className="text-red-500">失败原因: {step.failReason}</div>
                    )}
                  </div>
                ),
                status:
                  step.status === 'completed' || step.status === 'skipped'
                    ? 'finish'
                    : step.status === 'running'
                      ? 'process'
                      : step.status === 'failed'
                        ? 'error'
                        : 'wait',
              }))}
            />
          )}
        </>
      )}
    </>
  );
}
