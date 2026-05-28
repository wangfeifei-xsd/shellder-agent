'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';

export default function AntdAppRegistry({ children }: { children: React.ReactNode }) {
  return <AntdRegistry>{children}</AntdRegistry>;
}
