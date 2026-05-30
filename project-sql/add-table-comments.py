#!/usr/bin/env python3
"""为 project-sql 中 CREATE TABLE 语句追加 MySQL 表级 COMMENT（可重复执行）。"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

TABLE_COMMENTS: dict[str, str] = {
    "tenant": "租户主数据",
    "user": "平台用户账号",
    "role": "RBAC 角色",
    "user_role": "用户与角色关联",
    "user_tenant": "用户与租户绑定",
    "tool_call_audit": "工具调用审计",
    "user_action_audit": "用户操作审计",
    "external_call_audit": "外部接口调用审计",
    "rule": "策略规则配置",
    "rule_hit": "策略规则命中记录",
    "connector": "外部连接器配置",
    "tool": "工具注册元数据",
    "session": "会话",
    "message": "会话消息",
    "task": "任务",
    "task_step": "任务步骤",
    "task_log": "任务执行日志",
    "capability": "能力目录",
    "routing_rule": "能力路由规则",
    "skill": "技能书",
    "skill_trigger": "技能书触发示例",
    "skill_binding": "技能书绑定关系",
    "skill_execution_log": "技能书执行记录",
    "knowledge_base": "知识库租户绑定（pathy 代理）",
    "approval": "高风险动作审批",
    "openapi_app": "OpenAPI 接入应用",
    "openapi_call_log": "OpenAPI 调用日志",
    "system_config": "系统配置 KV",
    "notification_template": "通知模板",
    "copilot_config": "嵌入式 Copilot 配置",
    "kb_layer_processing_job": "pathy 层文件异步处理任务",
}

CREATE_HEAD = re.compile(
    r"CREATE TABLE(?: IF NOT EXISTS)? `(?:agent_platform`\.`)?(\w+)`\s*\(",
    re.IGNORECASE,
)
CREATE_TAIL = re.compile(
    r"\)\s*(?:DEFAULT CHARACTER SET|ENGINE\s*=\s*InnoDB)[^;]*;",
    re.IGNORECASE | re.DOTALL,
)
HAS_TABLE_COMMENT = re.compile(r"COMMENT\s*=\s*'[^']*'\s*;\s*$", re.IGNORECASE | re.DOTALL)


def annotate(text: str) -> tuple[str, int]:
    changed = 0
    out: list[str] = []
    pos = 0
    for head in CREATE_HEAD.finditer(text):
        out.append(text[pos : head.start()])
        table = head.group(1)
        rest = text[head.start() :]
        tail = CREATE_TAIL.search(rest)
        if not tail:
            out.append(rest)
            pos = len(text)
            break
        stmt = rest[: tail.end()]
        comment = TABLE_COMMENTS.get(table)
        if comment and not HAS_TABLE_COMMENT.search(stmt):
            body = stmt.rstrip()[:-1].rstrip()
            stmt = f"{body} COMMENT='{comment}';"
            changed += 1
        out.append(stmt)
        pos = head.start() + tail.end()
    out.append(text[pos:])
    return "".join(out), changed


def main() -> None:
    total = 0
    for path in sorted(ROOT.glob("[0-9][0-9]-*/schema*.sql")):
        original = path.read_text(encoding="utf-8")
        updated, n = annotate(original)
        if n:
            path.write_text(updated, encoding="utf-8")
            print(f"{path.relative_to(ROOT)}: +{n} table comment(s)")
            total += n
    print(f"Done. {total} table comment(s) added.")


if __name__ == "__main__":
    main()
