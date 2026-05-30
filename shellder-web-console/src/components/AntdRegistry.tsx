import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

/** Ant Design 全局配置（Vite SPA，无需 nextjs-registry）。 */
export default function AntdAppRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={zhCN}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
