import { Suspense } from 'react';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Navigate, useRoutes } from 'react-router-dom';
import { appRoutes } from './routes';

function AppRoutes() {
  const routes = useRoutes([
    ...appRoutes,
    { path: '*', element: <Navigate to="/" replace /> },
  ]);
  return routes;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <Spin tip="加载中…" />
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
