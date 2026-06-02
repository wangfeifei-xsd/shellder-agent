# 06b — 只读库连接器元数据

与 `connector` 表 **1:1**，仅用于 `db_readonly` 类型连接器。

| 字段 | 说明 |
|------|------|
| `introspected_schema` | `information_schema` 确定性抽取结果 |
| `er_diagram_draft` | LLM / 人工编辑的 ER 草稿 |
| `er_diagram_published` | 已发布 ER（Runtime 仅读此字段） |

详见 `project-analysis/capabilities/query/查询型能力-详细方案.md` §4、§4.6。

管理台：**连接器管理 → 库表结构与 ER 图**（`/connectors/db-schema`），与连接器列表分离维护。
