'use client';

import { Input, Select, Typography } from 'antd';
import { DATA_SCOPE_PANEL_HINT } from '@/components/console/er-data-scope-ui';

export interface QueryPrincipalContextValue {
  externalUserId: string;
  scopeList: string[];
}

export function QueryPrincipalContextFields({
  value,
  onChange,
}: {
  value: QueryPrincipalContextValue;
  onChange: (next: QueryPrincipalContextValue) => void;
}) {
  return (
    <div>
      <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
        {DATA_SCOPE_PANEL_HINT}
      </Typography.Paragraph>
      <div className="mb-3">
        <Typography.Text type="secondary" className="mb-1 block text-xs">
          externalUserId（用户列 =）
        </Typography.Text>
        <Input
          size="small"
          allowClear
          placeholder="业务用户 ID，留空表示不按用户过滤"
          value={value.externalUserId}
          onChange={(e) =>
            onChange({ ...value, externalUserId: e.target.value })
          }
        />
      </div>
      <div>
        <Typography.Text type="secondary" className="mb-1 block text-xs">
          scopeList（范围列 IN）
        </Typography.Text>
        <Select
          mode="tags"
          size="small"
          className="w-full"
          placeholder="部门/组织 ID，回车添加；留空表示不按范围过滤"
          tokenSeparators={[',']}
          value={value.scopeList}
          onChange={(tags) =>
            onChange({
              ...value,
              scopeList: (tags as string[]).map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      </div>
    </div>
  );
}

export function toQueryPrincipalContextBody(
  value: QueryPrincipalContextValue,
): { externalUserId?: string; scopeList?: string[] } {
  const externalUserId = value.externalUserId.trim() || undefined;
  const scopeList = value.scopeList.filter(Boolean);
  return {
    ...(externalUserId ? { externalUserId } : {}),
    ...(scopeList.length > 0 ? { scopeList } : {}),
  };
}
