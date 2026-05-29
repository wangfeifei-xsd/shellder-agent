'use client';

/**
 * Copilot 独立布局：不使用管理后台的 ConsoleLayout，
 * 作为可 iframe 嵌入的轻量页面。
 */
export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col bg-white">
      {children}
    </div>
  );
}
