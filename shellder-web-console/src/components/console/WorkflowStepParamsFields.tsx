'use client';

import { Alert, Form, Input, Select, Typography } from 'antd';
import { useMemo } from 'react';
import {
  Tool,
  ToolInputParamDef,
  WORKFLOW_PARAM_SOURCE_OPTIONS,
  WorkflowParamSource,
  WorkflowStepDef,
} from '@/lib/tool';
import {
  WorkflowValidationContext,
  getPathOptionsForPriorStep,
  validateWorkflowSteps,
} from '@/lib/workflow-step-validation';

interface WorkflowStepParamsFieldsProps {
  fieldName: number;
  stepIndex: number;
  steps: WorkflowStepDef[];
  tool?: Tool;
  paramDefs: ToolInputParamDef[];
  validationCtx: WorkflowValidationContext;
}

export function WorkflowStepParamsFields({
  fieldName,
  stepIndex,
  steps,
  tool,
  paramDefs,
  validationCtx,
}: WorkflowStepParamsFieldsProps) {
  const form = Form.useFormInstance();
  const watchedSteps = Form.useWatch('workflowSteps', form) as WorkflowStepDef[] | undefined;
  const stepsLive = watchedSteps ?? steps;

  const showQueryHint = tool?.type === 'query';
  const showParams = !!tool && tool.type !== 'query' && paramDefs.length > 0;

  const stepErrors = useMemo(() => {
    if (!showParams) return [];
    return validateWorkflowSteps(stepsLive, validationCtx);
  }, [showParams, stepsLive, validationCtx]);

  const stepErrorPrefix = `步骤 ${stepIndex + 1}「`;
  const paramErrors = (paramName: string) =>
    stepErrors.filter(
      (e) => e.startsWith(stepErrorPrefix) && e.includes(`参数 ${paramName}`),
    );

  const syncBinding = (
    paramName: string,
    patch: Partial<{
      source: WorkflowParamSource;
      fixedValue?: string;
      fromStep?: number;
      valuePath?: string;
    }>,
  ) => {
    const allSteps = (form.getFieldValue('workflowSteps') as WorkflowStepDef[] | undefined) ?? [];
    const bindings = [...(allSteps[fieldName]?.paramBindings ?? [])];
    const idx = bindings.findIndex((b) => b.paramName === paramName);
    if (idx >= 0) {
      bindings[idx] = { ...bindings[idx], ...patch };
    } else {
      bindings.push({ paramName, source: 'user_message', ...patch });
    }
    const next = [...allSteps];
    next[fieldName] = { ...next[fieldName], paramBindings: bindings };
    form.setFieldsValue({ workflowSteps: next });
  };

  const getBinding = (paramName: string) => {
    const allSteps = (form.getFieldValue('workflowSteps') as WorkflowStepDef[] | undefined) ?? [];
    return allSteps[fieldName]?.paramBindings?.find((b) => b.paramName === paramName);
  };

  const priorStepOptions = Array.from({ length: stepIndex }, (_, i) => ({
    value: i + 1,
    label: `步骤 ${i + 1}${stepsLive[i]?.name ? `：${stepsLive[i].name}` : ''}`,
  }));

  if (showQueryHint) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2">
        <Typography.Text type="secondary" className="text-xs">
          查询型步骤：使用用户问句经 NL2SQL 执行，无需配置入参；结果可供后续步骤引用。
        </Typography.Text>
      </div>
    );
  }

  if (!showParams || !tool) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-3 w-1 rounded-full bg-purple-500" />
        <Typography.Text strong className="text-xs text-purple-900">
          入参配置
        </Typography.Text>
      </div>
      <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
        工具「{tool.name}」的调用参数。引用前置步骤时从输出字段中选择。
      </Typography.Paragraph>

      {paramDefs.map((param) => {
        const binding = getBinding(param.name);
        const source = binding?.source ?? 'user_message';
        const refStepNo = binding?.fromStep ?? stepIndex;
        const pathOptions =
          source === 'previous_step' && refStepNo >= 1 && refStepNo <= stepIndex
            ? getPathOptionsForPriorStep(refStepNo - 1, stepsLive, validationCtx)
            : [];
        const errors = paramErrors(param.name);

        return (
          <div key={param.name} className="mb-3 last:mb-0">
            <Typography.Text className="text-xs">
              {param.name}
              <Typography.Text type="secondary" className="ml-1 text-xs">
                ({param.type})
              </Typography.Text>
              {param.required ? <span className="text-red-500"> *</span> : null}
              {param.description ? (
                <Typography.Text type="secondary" className="ml-1 text-xs">
                  {param.description}
                </Typography.Text>
              ) : null}
            </Typography.Text>
            <Select
              className="mt-1 w-full"
              size="small"
              options={WORKFLOW_PARAM_SOURCE_OPTIONS}
              value={source}
              onChange={(v: WorkflowParamSource) => {
                const patch: Partial<{
                  source: WorkflowParamSource;
                  fixedValue?: string;
                  fromStep?: number;
                  valuePath?: string;
                }> = { source: v };
                if (v === 'previous_step' && stepIndex > 0) {
                  patch.fromStep = stepIndex;
                }
                syncBinding(param.name, patch);
              }}
            />
            {source === 'fixed' && (
              <Input
                className="mt-1"
                size="small"
                placeholder={`固定 ${param.type} 值`}
                value={binding?.fixedValue ?? ''}
                status={errors.length ? 'error' : undefined}
                onChange={(e) => syncBinding(param.name, { fixedValue: e.target.value })}
              />
            )}
            {source === 'previous_step' && (
              <div className="mt-1 space-y-1">
                <Select
                  className="w-full"
                  size="small"
                  placeholder={stepIndex > 0 ? '选择引用哪一步' : '无前置步骤'}
                  disabled={stepIndex === 0}
                  options={priorStepOptions}
                  value={binding?.fromStep ?? (stepIndex > 0 ? stepIndex : undefined)}
                  onChange={(v) => syncBinding(param.name, { fromStep: v, valuePath: undefined })}
                />
                {pathOptions.length > 0 ? (
                  <Select
                    className="w-full"
                    size="small"
                    showSearch
                    optionFilterProp="label"
                    placeholder="从输出字段中选择"
                    options={pathOptions}
                    value={binding?.valuePath || undefined}
                    status={errors.length ? 'error' : undefined}
                    onChange={(v) => syncBinding(param.name, { valuePath: v })}
                  />
                ) : (
                  <Input
                    size="small"
                    placeholder="结果路径"
                    disabled={stepIndex === 0}
                    value={binding?.valuePath ?? ''}
                    status={errors.length ? 'error' : undefined}
                    onChange={(e) => syncBinding(param.name, { valuePath: e.target.value })}
                  />
                )}
                {pathOptions.length === 0 && refStepNo >= 1 && stepIndex > 0 && (
                  <Typography.Text type="warning" className="text-xs">
                    前置步骤尚无可用输出字段（查询型需已发布 ER；HTTP 查询需配置 fieldMapping）
                  </Typography.Text>
                )}
              </div>
            )}
            {errors.map((err) => (
              <Alert key={err} className="mt-1 py-1" type="error" showIcon message={err} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
