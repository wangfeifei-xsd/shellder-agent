#!/usr/bin/env python3
"""为 project-sql 中 DDL/DML 的表名添加 `库名`.`表名` 限定（可重复执行，已限定则跳过）。"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONF = ROOT / "db-name.cnf"

# 需加库名前缀的 SQL 表引用（捕获组 1 为表名）
TABLE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bCREATE TABLE IF NOT EXISTS `([^`]+)`"),
    re.compile(r"\bCREATE TABLE `([^`]+)`"),
    re.compile(r"\bALTER TABLE `([^`]+)`"),
    re.compile(r"\bINSERT INTO `([^`]+)`"),
    re.compile(r"\bDELETE FROM `([^`]+)`"),
    re.compile(r"\bUPDATE `([^`]+)`"),
    re.compile(r"\bREFERENCES `([^`]+)`\("),
    re.compile(r"\bON `([^`]+)` \("),
]


def load_db_name() -> str:
    if CONF.is_file():
        for line in CONF.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("AGENT_DB="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return "agent_platform"


def qualify_table_ref(match: re.Match[str], db: str) -> str:
    full = match.group(0)
    if f"`{db}`.`" in full:
        return full
    table = match.group(1)
    if table == db or "." in table:
        return full
    return full.replace(f"`{table}`", f"`{db}`.`{table}`", 1)


def qualify_sql(text: str, db: str) -> str:
    out = text.replace("table_schema = DATABASE()", f"table_schema = '{db}'")
    for pat in TABLE_PATTERNS:
        out = pat.sub(lambda m: qualify_table_ref(m, db), out)
    return out


def strip_use_header(text: str) -> str:
    """仅移除本工具写入的「目标库 + USE」头，保留模块说明注释。"""
    lines = text.splitlines()
    i = 0
    if i < len(lines) and lines[i].startswith("-- 目标库:"):
        i += 1
    if i < len(lines) and lines[i].strip().upper().startswith("USE "):
        i += 1
    while i < len(lines) and lines[i].strip() == "":
        i += 1
    return "\n".join(lines[i:]).lstrip("\n")


def file_header(db: str) -> str:
    return f"-- 目标库: {db}\nUSE `{db}`;\n\n"


def process_file(path: Path, db: str) -> bool:
    raw = path.read_text(encoding="utf-8")
    body = strip_use_header(raw)
    qualified = qualify_sql(body, db)
    new_content = file_header(db) + qualified
    if new_content != raw:
        path.write_text(new_content, encoding="utf-8")
        return True
    return False


def main() -> int:
    db = load_db_name()
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        paths = sorted(ROOT.glob("[0-9][0-9]-*/*.sql"))
    changed = 0
    for p in paths:
        if p.name.startswith("00-all-"):
            continue
        if process_file(p, db):
            print(f"qualified: {p.relative_to(ROOT)}")
            changed += 1
    print(f"done (db={db}, updated={changed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
