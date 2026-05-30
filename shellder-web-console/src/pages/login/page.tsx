'use client';

import { App, Button, Form, Input } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Suspense, useEffect, useRef, useState } from 'react';
import { login, setToken } from '@/lib/auth';

const brandFont =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type GlowPoint = { x: number; y: number };

/** 鼠标追逐光影（rAF + 缓动，避免每帧 setState） */
function LoginMouseGlow({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target: GlowPoint = { x: 50, y: 50 };
    const fast: GlowPoint = { x: 50, y: 50 };
    const slow: GlowPoint = { x: 50, y: 50 };

    const applyStatic = () => {
      const center = 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(99,102,241,0.12), transparent)';
      primaryRef.current?.style.setProperty('background', center);
      secondaryRef.current?.style.setProperty('background', 'transparent');
      highlightRef.current?.style.setProperty('background', 'transparent');
    };

    if (reducedMotion) {
      applyStatic();
      return;
    }

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      target.x = ((e.clientX - rect.left) / rect.width) * 100;
      target.y = ((e.clientY - rect.top) / rect.height) * 100;
    };

    const onLeave = () => {
      target.x = 50;
      target.y = 50;
    };

    const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

    let raf = 0;
    const tick = () => {
      fast.x = lerp(fast.x, target.x, 0.1);
      fast.y = lerp(fast.y, target.y, 0.1);
      slow.x = lerp(slow.x, target.x, 0.05);
      slow.y = lerp(slow.y, target.y, 0.05);

      if (primaryRef.current) {
        primaryRef.current.style.background = `radial-gradient(560px circle at ${fast.x}% ${fast.y}%, rgba(99, 102, 241, 0.24), transparent 42%)`;
      }
      if (secondaryRef.current) {
        secondaryRef.current.style.background = `radial-gradient(420px circle at ${slow.x}% ${slow.y}%, rgba(14, 165, 233, 0.16), transparent 46%)`;
      }
      if (highlightRef.current) {
        highlightRef.current.style.background = `radial-gradient(220px circle at ${fast.x}% ${fast.y}%, rgba(255, 255, 255, 0.55), transparent 58%)`;
      }

      raf = requestAnimationFrame(tick);
    };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-15%,rgba(99,102,241,0.1),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_100%_100%,rgba(14,165,233,0.06),transparent)]"
        aria-hidden
      />
      <div ref={primaryRef} className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        ref={secondaryRef}
        className="pointer-events-none absolute inset-0 mix-blend-multiply"
        aria-hidden
      />
      <div ref={highlightRef} className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(250,250,250,0.35)_100%)]"
        aria-hidden
      />
    </>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const onFinish = async (values: { username: string; password: string }) => {
    setSubmitting(true);
    try {
      const res = await login(values.username, values.password);
      setToken(res.accessToken);
      message.success('登录成功');
      const redirect = params.get('redirect');
      navigate(redirect && redirect.startsWith('/') ? redirect : '/', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={pageRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-50 p-6"
    >
      <LoginMouseGlow containerRef={pageRef} />

      <div className="relative z-10 w-full max-w-[400px]">
        <header className="mb-10 text-center">
          <h1
            className="text-[26px] font-bold leading-tight tracking-tight text-neutral-900 antialiased"
            style={{ fontFamily: brandFont }}
          >
            Shellder Agent
          </h1>
          <p className="mt-2.5 text-sm text-neutral-500">智能体管理与运营平台</p>
        </header>

        <div className="rounded-2xl border border-neutral-200/70 bg-white/90 px-8 py-9 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
          <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
              className="!mb-4"
            >
              <Input placeholder="用户名" autoComplete="username" className="!rounded-lg" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
              className="!mb-6"
            >
              <Input.Password
                placeholder="密码"
                autoComplete="current-password"
                className="!rounded-lg"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={submitting}
              className="!h-11 !rounded-lg !font-medium !shadow-sm"
            >
              继续
            </Button>
          </Form>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">仅供授权人员访问</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
