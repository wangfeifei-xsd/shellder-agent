# 能力演示与嵌入式 Copilot 参数对齐

管理后台 **业务能力 → 能力演示** 与嵌入页 `/copilot` 使用同一套业务契约。

## 调用链

1. `POST /api/v1/capabilities/demo/copilot-token` — 管理端代换票（响应同 `POST /copilot/v1/auth/token`）
2. `POST /copilot/v1/sessions` — body `{ title? }`
3. `GET /copilot/v1/sessions/:id/stream?token=` — 先订阅 SSE
4. `POST /copilot/v1/sessions/:id/messages` — body `{ content, mode: "stream" }`
5. `GET /copilot/v1/sessions/:id` — 从助手消息 `content` 解析 `CapabilityResult`

## 前端封装

- `src/lib/copilot-runtime.ts` — `runCopilotStreamRound`
- `src/lib/copilot.ts` — `parseCapabilityResult` / `findLastAssistantCapabilityResult`
- `src/lib/copilot-sse.ts` — `connectCopilotSse`

## 验收

同一租户、同一 Copilot 配置、同一输入：能力演示页与嵌入页助手消息 `content` 字段一致。
