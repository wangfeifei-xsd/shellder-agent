import { Suspense } from 'react';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import router from './router';

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <Spin tip="加载中…" />
            </div>
          }
        >
          <RouterProvider router={router} />
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}
