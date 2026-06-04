# 能力演示与嵌入式 Copilot 参数对齐

管理后台 **业务调试**（侧栏第六项，`/capabilities`）与嵌入页 `/copilot` 使用同一套业务契约。

## 调用链

1. `POST /api/v1/capabilities/demo/copilot-token` — 管理端代换票（响应同 `POST /copilot/v1/auth/token`）
2. `POST /copilot/v1/sessions` — body `{ title?, capabilityType? }`（定向选择，不走路由匹配）
3. `GET /copilot/v1/sessions/:id/stream?token=` — 先订阅 SSE
4. `POST /copilot/v1/sessions/:id/messages` — body `{ content, mode: "stream" }`
5. `GET /copilot/v1/sessions/:id` — 从助手消息 `content` 解析 `CapabilityResult`

问答型 `CapabilityResult.data` 除 `text` 外包含与知识库测试一致的召回字段：

- `merged_media` — wiki 召回合并的媒体引用（code 列表）
- `injected_context` — 拼入 LLM 的上下文（供核对；媒体不在 prompt 内）
- `recall_method` — 召回方式

## 前端封装

- `src/lib/copilot-runtime.ts` — `runCopilotStreamRound`
- `src/lib/copilot.ts` — `parseCapabilityResult` / `findLastAssistantCapabilityResult` / `extractQaRecallMediaBundle`
- 能力演示页用 `InjectedContextMediaPanel` 解析 `merged_media` 并内联预览（与「知识库 → 召回测试」一致）
- `src/lib/copilot-sse.ts` — `connectCopilotSse`

## 验收

同一租户、同一 Copilot 配置、同一输入：能力演示页与嵌入页助手消息 `content` 字段一致。
