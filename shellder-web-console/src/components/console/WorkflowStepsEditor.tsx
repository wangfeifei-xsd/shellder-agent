'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  FlagOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Empty, Form, Input, Select, Space, Spin, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkflowStepParamsFields } from '@/components/console/WorkflowStepParamsFields';
import { getConnectorErDiagram } from '@/lib/connector';
import {
  TOOL_TYPE_META,
  Tool,
  ToolType,
  WorkflowStepDef,
  defaultParamBindingsForTool,
  fetchAllTools,
  listToolInputParams,
} from '@/lib/tool';
import {
  WorkflowValidationContext,
  collectErColumns,
} from '@/lib/workflow-step-validation';
import './workflow-steps-editor.css';

const WORKFLOW_SUB_TOOL_TYPES: ToolType[] = ['query', 'http_query', 'action', 'notification'];

const SUB_TOOL_GROUP_LABEL: Record<ToolType, string> = {
  query: '查询型（SQL）',
  http_query: 'HTTP 查询',
  action: '操作型',
  notification: '通知型',
  workflow: '流程型',
};

export interface WorkflowStepFormValue extends WorkflowStepDef {}

interface WorkflowStepsEditorProps {
  tenantId?: string;
  excludeToolId?: string;
}

function PipelineLink({ label = '然后执行' }: { label?: string }) {
  return (
    <div className="workflow-link">
      <div className="workflow-link__line" />
      <ArrowDownOutlined className="workflow-link__arrow" />
      <span className="workflow-link__label">{label}</span>
      <div className="workflow-link__line" />
    </div>
  );
}

function PipelineNode({ type }: { type: 'start' | 'end' }) {
  const isStart = type === 'start';
  return (
    <div className={`workflow-node workflow-node--${type}`}>
      <span className="workflow-node__dot" />
      {isStart ? (
        <>
          <PlayCircleOutlined />
          <span>开始</span>
        </>
      ) : (
        <>
          <FlagOutlined />
          <span>结束</span>
        </>
      )}
    </div>
  );
}

export function WorkflowStepsEditor({ tenantId, excludeToolId }: WorkflowStepsEditorProps) {
  const form = Form.useFormInstance();
  const watchedSteps = Form.useWatch('workflowSteps', form) as WorkflowStepFormValue[] | undefined;

  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [erColumnsByConnector, setErColumnsByConnector] = useState<
    WorkflowValidationContext['erColumnsByConnector']
  >(new Map());

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

  const queryConnectorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const step of watchedSteps ?? []) {
      if (!step?.toolId) continue;
      const t = toolById.get(step.toolId);
      if (t?.type === 'query' && t.connectorId) ids.add(t.connectorId);
    }
    return [...ids];
  }, [watchedSteps, toolById]);

  useEffect(() => {
    if (!queryConnectorIds.length) {
      setErColumnsByConnector(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = new Map<string, ReturnType<typeof collectErColumns>>();
      await Promise.all(
        queryConnectorIds.map(async (connectorId) => {
          try {
            const er = await getConnectorErDiagram(connectorId);
            next.set(connectorId, collectErColumns(er.published?.tables));
          } catch {
            next.set(connectorId, []);
          }
        }),
      );
      if (!cancelled) setErColumnsByConnector(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [queryConnectorIds.join(',')]);

  const validationCtx = useMemo(
    (): WorkflowValidationContext => ({
      toolsById: toolById,
      erColumnsByConnector,
    }),
    [toolById, erColumnsByConnector],
  );

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
    const paramBindings = defaultParamBindingsForTool(tool);
    const next = [...steps];
    next[fieldIndex] = {
      ...current,
      name: current?.name?.trim() ? current.name : tool.name,
      toolId,
      paramBindings,
    };
    form.setFieldsValue({ workflowSteps: next });
  };

  const stepsForValidation = watchedSteps ?? [];

  return (
    <div className="workflow-steps-editor">
      <Spin spinning={loading}>
        <Form.List
          name="workflowSteps"
          rules={[
            {
              validator: async (_, steps: WorkflowStepFormValue[] | undefined) => {
                if (!steps?.length) {
                  return Promise.reject(new Error('请至少添加一个流程步骤'));
                }
                const { validateWorkflowSteps: validate } = await import(
                  '@/lib/workflow-step-validation'
                );
                const errors = validate(steps, validationCtx);
                if (errors.length) {
                  return Promise.reject(new Error(errors[0]));
                }
              },
            },
          ]}
        >
          {(fields, { add, remove, move }) => (
            <div className="workflow-pipeline">
              <PipelineNode type="start" />

              {fields.length === 0 ? (
                <>
                  <PipelineLink label="添加第一个步骤" />
                  <div className="workflow-empty">
                    <Empty description="暂无步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                </>
              ) : (
                fields.map((field, index) => {
                  const stepToolId = stepsForValidation[index]?.toolId;
                  const stepTool = stepToolId ? toolById.get(stepToolId) : undefined;
                  const paramDefs = stepTool ? listToolInputParams(stepTool) : [];
                  const stepName = stepsForValidation[index]?.name?.trim() || stepTool?.name;
                  const isConfigured = !!(stepToolId && stepName);

                  return (
                    <div key={field.key}>
                      <PipelineLink label={index === 0 ? '第 1 步' : `第 ${index + 1} 步`} />

                      <div className="workflow-step">
                        <div className="workflow-step__header">
                          <div className="workflow-step__index">{index + 1}</div>
                          <div className="workflow-step__title">
                            <span
                              className={`workflow-step__title-text${!stepName ? ' workflow-step__title--empty' : ''}`}
                            >
                              {stepName || '待配置步骤'}
                            </span>
                            {stepTool && (
                              <Tag color={TOOL_TYPE_META[stepTool.type].color} className="!mr-0">
                                {TOOL_TYPE_META[stepTool.type].label}
                              </Tag>
                            )}
                            {!isConfigured && (
                              <Tag color="default" className="!mr-0">
                                未完成
                              </Tag>
                            )}
                          </div>
                          <div className="workflow-step__actions">
                            <Space size={0}>
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
                          </div>
                        </div>

                        <div className="workflow-step__body">
                          <Form.Item
                            label="调用工具"
                            name={[field.name, 'toolId']}
                            rules={[{ required: true, message: '请选择要调用的工具' }]}
                            className="!mb-3"
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
                            className="!mb-3"
                          >
                            <Input placeholder="如：查询库存、创建订单" />
                          </Form.Item>
                          <Form.Item
                            label="说明（可选）"
                            name={[field.name, 'description']}
                            className="!mb-0"
                          >
                            <Input.TextArea rows={2} placeholder="步骤用途说明" />
                          </Form.Item>

                          <WorkflowStepParamsFields
                            fieldName={field.name}
                            stepIndex={index}
                            steps={stepsForValidation}
                            tool={stepTool}
                            paramDefs={paramDefs}
                            validationCtx={validationCtx}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <PipelineLink label="继续添加" />
              <Button
                type="dashed"
                className="workflow-add-step"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({ name: '', toolId: undefined, description: '', paramBindings: [] })
                }
              >
                添加步骤
              </Button>

              <PipelineLink label="流程完成" />
              <PipelineNode type="end" />

              {!loading && subTools.length === 0 && (
                <Typography.Text type="secondary" className="text-xs block mt-4 text-center">
                  可引用：查询型（NL2SQL）、HTTP 查询、操作型、通知型
                </Typography.Text>
              )}
            </div>
          )}
        </Form.List>
      </Spin>
    </div>
  );
}

export async function validateWorkflowStepsForm(
  steps: WorkflowStepFormValue[] | undefined,
  validationCtx: WorkflowValidationContext,
): Promise<string[]> {
  const { validateWorkflowSteps } = await import('@/lib/workflow-step-validation');
  return validateWorkflowSteps(steps, validationCtx);
}

export type { WorkflowValidationContext };
