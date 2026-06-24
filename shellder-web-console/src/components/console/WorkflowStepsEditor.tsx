'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Card, Empty, Form, Input, Select, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tool, ToolType, fetchAllTools } from '@/lib/tool';

/** 流程步骤可引用的子 Tool 类型 */
const WORKFLOW_SUB_TOOL_TYPES: ToolType[] = ['query', 'http_query', 'action', 'notification'];

const SUB_TOOL_GROUP_LABEL: Record<ToolType, string> = {
  query: '查询型（SQL）',
  http_query: 'HTTP 查询',
  action: '操作型',
  notification: '通知型',
  workflow: '流程型',
};

export interface WorkflowStepFormValue {
  name: string;
  toolId?: string;
  description?: string;
}

interface WorkflowStepsEditorProps {
  tenantId?: string;
  /** 编辑当前 Workflow Tool 时排除自身，避免自引用 */
  excludeToolId?: string;
}

export function WorkflowStepsEditor({ tenantId, excludeToolId }: WorkflowStepsEditorProps) {
  const form = Form.useFormInstance();
  const watchedSteps = Form.useWatch('workflowSteps', form) as WorkflowStepFormValue[] | undefined;

  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTools = useCallback(async () => {
    if (!tenantId) {
      setTools([]);
      return;
    }
    setLoading(true);
    try {
      setTools(await fetchAllTools({ tenantId }));
    } catch {
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const referencedToolIds = useMemo(
    () => new Set((watchedSteps ?? []).map((s) => s?.toolId).filter(Boolean) as string[]),
    [watchedSteps],
  );

  const subTools = useMemo(
    () =>
      tools.filter(
        (t) =>
          WORKFLOW_SUB_TOOL_TYPES.includes(t.type) &&
          t.id !== excludeToolId &&
          (t.status === 'enabled' || referencedToolIds.has(t.id)),
      ),
    [tools, excludeToolId, referencedToolIds],
  );

  const toolById = useMemo(() => new Map(subTools.map((t) => [t.id, t])), [subTools]);

  const groupedOptions = useMemo(() => {
    return WORKFLOW_SUB_TOOL_TYPES.map((type) => ({
      label: SUB_TOOL_GROUP_LABEL[type],
      options: subTools
        .filter((t) => t.type === type)
        .map((t) => ({
          value: t.id,
          label: `${t.name}${t.status === 'disabled' ? ' · 已停用' : ''}`,
        })),
    })).filter((g) => g.options.length > 0);
  }, [subTools]);

  const handleToolSelect = (fieldIndex: number, toolId: string) => {
    const tool = toolById.get(toolId);
    if (!tool) return;
    const steps = (form.getFieldValue('workflowSteps') as WorkflowStepFormValue[] | undefined) ?? [];
    const current = steps[fieldIndex];
    if (current && !current.name?.trim()) {
      const next = [...steps];
      next[fieldIndex] = { ...current, name: tool.name };
      form.setFieldsValue({ workflowSteps: next });
    }
  };

  return (
    <Spin spinning={loading}>
      <Form.List
        name="workflowSteps"
        rules={[
          {
            validator: async (_, steps: WorkflowStepFormValue[] | undefined) => {
              if (!steps?.length) {
                return Promise.reject(new Error('请至少添加一个流程步骤'));
              }
            },
          },
        ]}
      >
        {(fields, { add, remove, move }) => (
          <>
            {fields.length === 0 ? (
              <Empty description="暂无步骤，点击下方按钮添加" className="my-4" />
            ) : (
              fields.map((field, index) => (
                <Card
                  key={field.key}
                  size="small"
                  className="mb-3"
                  title={`步骤 ${index + 1}`}
                  extra={
                    <Space size="small">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        aria-label="上移"
                        onClick={() => move(index, index - 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === fields.length - 1}
                        aria-label="下移"
                        onClick={() => move(index, index + 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除"
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  }
                >
                  <Form.Item
                    label="调用工具"
                    name={[field.name, 'toolId']}
                    rules={[{ required: true, message: '请选择要调用的工具' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={
                        subTools.length
                          ? '选择要调用的工具'
                          : '暂无可用子工具，请先创建查询/操作/通知类工具'
                      }
                      options={groupedOptions}
                      onChange={(toolId: string) => handleToolSelect(index, toolId)}
                    />
                  </Form.Item>
                  <Form.Item
                    label="步骤名称"
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请输入步骤名称' }]}
                  >
                    <Input placeholder="如：查询库存、创建订单" />
                  </Form.Item>
                  <Form.Item label="说明（可选）" name={[field.name, 'description']}>
                    <Input.TextArea rows={2} placeholder="步骤用途说明" />
                  </Form.Item>
                </Card>
              ))
            )}
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => add({ name: '', toolId: undefined, description: '' })}
            >
              添加步骤
            </Button>
            {!loading && subTools.length === 0 && (
              <Typography.Text type="secondary" className="text-xs block mt-2">
                可引用：查询型（数据库连接工具）、HTTP 查询、操作型、通知型。流程型工具本身不能作为子步骤。
              </Typography.Text>
            )}
          </>
        )}
      </Form.List>
    </Spin>
  );
}
