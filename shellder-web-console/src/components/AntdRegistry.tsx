'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

export default function AntdAppRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider locale={zhCN}>
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
