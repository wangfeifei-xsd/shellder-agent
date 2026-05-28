import type { Metadata } from 'next';
import AntdAppRegistry from '@/components/AntdRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: 'shellder-agent',
  description: 'shellder-agent 管理后台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdAppRegistry>{children}</AntdAppRegistry>
      </body>
    </html>
  );
}
