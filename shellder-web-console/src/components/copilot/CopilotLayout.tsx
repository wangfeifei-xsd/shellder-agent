/** Copilot 独立布局：不使用管理后台 ConsoleLayout，供 iframe 嵌入。 */
export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-white">{children}</div>;
}
