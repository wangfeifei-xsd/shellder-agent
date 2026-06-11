'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { PlayCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  useWikiPrefixTree,
  WikiPrefixFormItem,
} from '@/components/console/knowledge/WikiPrefixFormItem';
import {
  buildCopilotInitMessage,
  COPILOT_READY_MESSAGE_TYPE,
  pickCopilotTokenExchangeParams,
  type CopilotTokenExchangeParams,
} from '@/lib/copilot-init';
import { buildHashRouteUrl } from '@/lib/navigation';
import { listOpenApiApps, type OpenApiAppItem } from '@/lib/openapi-management';
import { getTenant } from '@/lib/tenant';

const { Title, Paragraph } = Typography;

/**
 * Copilot 嵌入预览 — 管理员可在此页面测试嵌入效果，
 * 并获取嵌入代码片段。
 */
export default function CopilotPreviewPage() {
  const { tenants, activeTenantId } = useActiveTenant();
  const [form] = Form.useForm();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [openapiApps, setOpenapiApps] = useState<OpenApiAppItem[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const pendingInitRef = useRef<CopilotTokenExchangeParams | null>(null);
  const selectedTenantId = Form.useWatch('tenantId', form) as string | undefined;
  const { treeData: wikiPrefixTreeData, loading: wikiPrefixTreeLoading } =
    useWikiPrefixTree(selectedTenantId);

  const resolveCopilotPath = () => buildHashRouteUrl('/copilot');
  const tenantOptions = useMemo(
    () =>
      tenants.map((tenant) => ({
        value: tenant.id,
        label: `${tenant.name}（${tenant.code}）`,
      })),
    [tenants],
  );

  const appOptions = useMemo(
    () =>
      openapiApps.map((app) => ({
        value: app.id,
        label: `${app.name}（${app.clientId}）`,
      })),
    [openapiApps],
  );

  const loadOpenapiApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const res = await listOpenApiApps({
        pageSize: 200,
        status: 'enabled',
        tenantId: activeTenantId,
      });
      setOpenapiApps(res.items);
    } catch {
      setOpenapiApps([]);
    } finally {
      setAppsLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void loadOpenapiApps();
  }, [loadOpenapiApps]);

  useEffect(() => {
    const appId = form.getFieldValue('appId') as string | undefined;
    if (!appId || openapiApps.some((a) => a.id === appId)) return;
    form.setFieldValue('appId', undefined);
  }, [form, openapiApps]);

  const resolveTenantIdForApp = useCallback(
    (app: OpenApiAppItem): string | undefined => {
      const allowed = app.allowedTenantIds;
      if (!allowed.length) return activeTenantId;
      if (activeTenantId && allowed.includes(activeTenantId)) return activeTenantId;
      const bound = allowed.filter((id) => tenants.some((t) => t.id === id));
      if (bound.length === 1) return bound[0];
      if (allowed.length === 1) return allowed[0];
      return undefined;
    },
    [activeTenantId, tenants],
  );

  const handleAppSelect = useCallback(
    async (appId: string | undefined) => {
      if (!appId) return;
      const app = openapiApps.find((a) => a.id === appId);
      if (!app) return;

      const tenantId = resolveTenantIdForApp(app);
      const patch: Record<string, unknown> = {
        clientId: app.clientId,
        clientSecret: undefined,
        tenantId,
      };

      if (tenantId) {
        try {
          const tenant = await getTenant(tenantId);
          patch.externalTenantId = tenant.externalTenantId ?? undefined;
        } catch {
          // 租户详情加载失败时仍保留 clientId / tenantId
        }
      }

      form.setFieldsValue(patch);
    },
    [form, openapiApps, resolveTenantIdForApp],
  );

  const buildInitParamsFromForm = (
    values: Record<string, unknown>,
  ): CopilotTokenExchangeParams | null => {
    const wikiPrefixes = (values.wikiPrefixes as string[] | undefined)?.filter(Boolean);
    const scopeList = (values.scopeList as string[] | undefined)?.filter(Boolean);
    return pickCopilotTokenExchangeParams({
      clientId: values.clientId,
      clientSecret: values.clientSecret,
      tenantId: values.tenantId,
      externalTenantId: values.externalTenantId,
      externalUserId: values.externalUserId,
      scopeList,
      wikiPrefixes,
    });
  };

  const postInitToPreviewFrame = useCallback((init: CopilotTokenExchangeParams) => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Copilot Preview"]',
    );
    iframe?.contentWindow?.postMessage(
      buildCopilotInitMessage(init),
      window.location.origin,
    );
  }, []);

  const deliverInitToPreviewFrame = useCallback(
    (init: CopilotTokenExchangeParams, withRetry = false) => {
      pendingInitRef.current = init;
      postInitToPreviewFrame(init);
      if (!withRetry) return;
      window.setTimeout(() => postInitToPreviewFrame(init), 80);
      window.setTimeout(() => postInitToPreviewFrame(init), 300);
    },
    [postInitToPreviewFrame],
  );

  useEffect(() => {
    const onChildReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== COPILOT_READY_MESSAGE_TYPE) return;
      const init =
        pendingInitRef.current ?? buildInitParamsFromForm(form.getFieldsValue());
      if (init) postInitToPreviewFrame(init);
    };
    window.addEventListener('message', onChildReady);
    return () => window.removeEventListener('message', onChildReady);
  }, [form, postInitToPreviewFrame]);

  const handlePreview = async () => {
    const values = await form.validateFields();
    const init = buildInitParamsFromForm(values);
    if (!init) {
      message.warning('请先填写凭证');
      return;
    }
    pendingInitRef.current = init;
    setPreviewKey((k) => k + 1);
    setIframeSrc(buildHashRouteUrl('/copilot'));
  };

  const generateEmbedCode = () => {
    const values = form.getFieldsValue();
    if (!values.clientId || !values.clientSecret) {
      message.warning('请先填写凭证');
      return;
    }
    const init = buildInitParamsFromForm(values);
    if (!init) {
      message.warning('请先填写凭证');
      return;
    }
    const initPayload = JSON.stringify(buildCopilotInitMessage(init));
    const code = `<!-- shellder-agent Copilot 嵌入代码 -->
<iframe
  id="shellder-copilot"
  src="${resolveCopilotPath()}"
  style="width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12);"
  allow="clipboard-write"
></iframe>
<script>
  // 通过 postMessage 传入凭证与目录范围（推荐，避免 URL 暴露密钥）
  const copilotFrame = document.getElementById('shellder-copilot');
  const copilotInit = ${initPayload};
  const copilotOrigin = '${window.location.origin}';
  function sendCopilotInit() {
    copilotFrame.contentWindow.postMessage(copilotInit, copilotOrigin);
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== copilotOrigin) return;
    if (event.data && event.data.type === 'copilot:ready') sendCopilotInit();
  });
  copilotFrame.addEventListener('load', () => {
    sendCopilotInit();
    setTimeout(sendCopilotInit, 80);
    setTimeout(sendCopilotInit, 300);
  });
</script>`;

    navigator.clipboard.writeText(code).then(() => {
      message.success('嵌入代码已复制到剪贴板');
    });
  };

  return (
    <div>
      <Title level={4}>嵌入式 Copilot 预览</Title>
      <Paragraph type="secondary">
        在此页面测试 Copilot 嵌入效果，并生成可直接使用的嵌入代码片段。
      </Paragraph>

      <div className="flex gap-6">
        {/* 左侧：配置表单 */}
        <Card className="w-[400px]" title="嵌入参数">
          <Form form={form} layout="vertical" initialValues={{ wikiPrefixes: [] }}>
            <Form.Item
              name="appId"
              label="OpenAPI 应用"
              tooltip="选择后自动填入 Client ID、租户 ID 等；Client Secret 需手动填写（平台不存储明文）"
            >
              <Select
                allowClear
                showSearch
                loading={appsLoading}
                optionFilterProp="label"
                placeholder={
                  appOptions.length > 0
                    ? '选择应用以代入参数'
                    : '暂无可用应用'
                }
                options={appOptions}
                onChange={(value) => {
                  if (value) void handleAppSelect(value);
                  else {
                    form.setFieldsValue({
                      clientId: undefined,
                      clientSecret: undefined,
                    });
                  }
                }}
                notFoundContent={
                  <span className="text-gray-400">
                    请先在{' '}
                    <Link to="/openapi/apps">OpenAPI 应用接入</Link> 创建应用
                  </span>
                }
              />
            </Form.Item>
            <Form.Item name="clientId" label="Client ID" rules={[{ required: true }]}>
              <Input placeholder="OpenAPI 应用的 Client ID" />
            </Form.Item>
            <Form.Item
              name="clientSecret"
              label="Client Secret"
              rules={[{ required: true }]}
              extra="创建或重置密钥时展示一次，请从本地保管处粘贴"
            >
              <Input.Password placeholder="OpenAPI 应用的 Client Secret" />
            </Form.Item>
            <Form.Item name="tenantId" label="租户 ID">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={tenantOptions.length > 0 ? '可选，选择租户' : '暂无可选租户'}
                options={tenantOptions}
              />
            </Form.Item>
            <Form.Item name="externalTenantId" label="外部租户 ID">
              <Input placeholder="可选，externalTenantId 映射" />
            </Form.Item>
            <Form.Item name="externalUserId" label="外部用户 ID">
              <Input placeholder="可选，业务系统用户标识" />
            </Form.Item>
            <Form.Item
              name="scopeList"
              label="数据范围 scopeList"
              tooltip="对应问数范围字段 IN 条件；留空表示不按范围过滤"
            >
              <Select
                mode="tags"
                placeholder="输入部门/组织 ID 后回车，如 dept-01"
                tokenSeparators={[',']}
              />
            </Form.Item>
            <WikiPrefixFormItem
              tenantId={selectedTenantId}
              fieldName="wikiPrefixes"
              label="目录范围"
              treeData={wikiPrefixTreeData}
              treeLoading={wikiPrefixTreeLoading}
            />
            <Paragraph type="secondary" className="!mb-4 !-mt-2 text-xs">
              仅问答型能力生效；须先选择租户。选项受知识库「wiki 路径前缀」约束，换票时服务端会校验。
            </Paragraph>
            <Space>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handlePreview}>
                预览
              </Button>
              <Button icon={<CopyOutlined />} onClick={generateEmbedCode}>
                复制嵌入代码
              </Button>
            </Space>
          </Form>
        </Card>

        {/* 右侧：iframe 预览 */}
        <Card
          className="flex-1"
          title="预览效果"
          bodyStyle={{ padding: 0, height: 560, overflow: 'hidden' }}
        >
          {iframeSrc ? (
            <iframe
              key={previewKey}
              src={iframeSrc}
              className="h-full w-full border-none"
              title="Copilot Preview"
              onLoad={() => {
                const init =
                  pendingInitRef.current ??
                  buildInitParamsFromForm(form.getFieldsValue());
                if (init) deliverInitToPreviewFrame(init, true);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              点击「预览」按钮开始测试
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
