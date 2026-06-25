'use client';

import { ApartmentOutlined } from '@ant-design/icons';
import { App, Alert, Form, Modal, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  WorkflowStepFormValue,
  WorkflowStepsEditor,
} from '@/components/console/WorkflowStepsEditor';
import { Tool, ToolConfig, UpdateToolInput, updateTool } from '@/lib/tool';
import { validateWorkflowStepsForTenant } from '@/lib/workflow-step-validation';

function buildWorkflowConfig(steps: WorkflowStepFormValue[]): ToolConfig {
  return {
    workflow: {
      steps: steps.map((s) => ({
        name: s.name.trim(),
        toolId: s.toolId,
        description: s.description?.trim() || undefined,
        paramBindings: s.paramBindings?.length
          ? s.paramBindings.map((b) => ({
              paramName: b.paramName,
              source: b.source,
              fixedValue: b.fixedValue?.trim() || undefined,
              fromStep: b.fromStep,
              valuePath: b.valuePath?.trim() || undefined,
            }))
          : undefined,
      })),
    },
  };
}

interface WorkflowStepsModalProps {
  tool?: Tool;
  tenantId?: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function WorkflowStepsModal({
  tool,
  tenantId,
  open,
  onClose,
  onSaved,
}: WorkflowStepsModalProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ workflowSteps: WorkflowStepFormValue[] }>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !tool) return;
    form.setFieldsValue({
      workflowSteps: tool.config.workflow?.steps?.length
        ? tool.config.workflow.steps.map((s) => ({
            name: s.name,
            toolId: s.toolId,
            description: s.description,
            paramBindings: s.paramBindings ?? [],
          }))
        : [],
    });
  }, [open, tool, form]);

  const handleSave = async () => {
    if (!tool || !tenantId) return;
    const v = await form.validateFields();
    const wfErrors = await validateWorkflowStepsForTenant(tenantId, v.workflowSteps);
    if (wfErrors.length) {
      modal.error({
        title: '流程编排校验未通过',
        content: (
          <ul className="mb-0 pl-4 max-h-60 overflow-auto">
            {wfErrors.map((err) => (
              <li key={err} className="text-sm">
                {err}
              </li>
            ))}
          </ul>
        ),
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpdateToolInput = {
        name: tool.name,
        description: tool.description ?? undefined,
        type: tool.type,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema ?? undefined,
        permissionScope: tool.permissionScope ?? undefined,
        riskLevel: tool.riskLevel,
        needConfirmation: tool.needConfirmation,
        timeoutMs: tool.timeoutMs,
        idempotencyKey: tool.idempotencyKey ?? undefined,
        auditEventType: tool.auditEventType ?? undefined,
        connectorId: tool.connectorId ?? '',
        config: buildWorkflowConfig(v.workflowSteps ?? []),
      };
      await updateTool(tool.id, payload);
      message.success('流程编排已保存');
      onClose();
      onSaved?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        tool ? (
          <div className="flex items-center gap-2 pr-8">
            <ApartmentOutlined className="text-[#722ed1]" />
            <span>流程编排</span>
            <Typography.Text type="secondary" className="font-normal">
              {tool.name}
            </Typography.Text>
            {tool.config.workflow?.steps?.length ? (
              <Tag color="purple">{tool.config.workflow.steps.length} 步</Tag>
            ) : null}
          </div>
        ) : (
          '流程编排'
        )
      }
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      okText="保存编排"
      confirmLoading={submitting}
      onOk={() => void handleSave()}
      styles={{
        body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingTop: 8 },
      }}
    >
      <Alert
        type="info"
        showIcon
        className="!mb-3 !py-2"
        message="自上而下依次执行，后续步骤可引用前置步骤的输出作为入参"
      />
      <Form form={form} layout="vertical">
        <WorkflowStepsEditor tenantId={tenantId} excludeToolId={tool?.id} />
      </Form>
    </Modal>
  );
}
