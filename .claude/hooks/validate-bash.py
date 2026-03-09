#!/usr/bin/env python3
"""PreToolUse hook for Bash commands.

Validates commands before execution and emits permit/ask/deny decisions.
Fail-open: if this script crashes or the environment lacks python3,
Claude Code treats exit 0 as no decision and non-zero (except 2) as
a non-blocking error - both let the command through.
"""
import json
import re
import sys
from typing import Optional


def emit(decision, reason, additional_context=None):
    # type: (str, str, Optional[str]) -> None
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }
    if additional_context:
        payload["hookSpecificOutput"]["additionalContext"] = additional_context
    print(json.dumps(payload))


try:
    event = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if event.get("tool_name") != "Bash":
    sys.exit(0)

command = (event.get("tool_input") or {}).get("command", "")
normalized = command.strip()

# --- hard deny ---------------------------------------------------------

hard_deny = [
    (r"(^|[;&|])\s*curl\b.*\|\s*(bash|sh)\b", "Do not pipe remote scripts directly into a shell."),
    (r"(^|[;&|])\s*wget\b.*\|\s*(bash|sh)\b", "Do not pipe remote scripts directly into a shell."),
    (r"(^|[;&|])\s*(bash|sh)\s+<\(", "Do not execute a process substitution as a script."),
    (r"(^|[;&|])\s*eval\s", "Avoid eval in shared Claude Code workflows."),
    (r"(^|[;&|])\s*source\s+<\(", "Avoid sourcing process substitution into the current shell."),
    (r"(^|[;&|])\s*\.\s+<\(", "Avoid sourcing process substitution into the current shell."),
]

for pattern, reason in hard_deny:
    if re.search(pattern, normalized):
        emit("deny", reason)
        sys.exit(0)

# --- ask patterns ------------------------------------------------------

ask_patterns = [
    (r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b", "Destructive deletion requires inspection of targets first."),
    (r"\brm\s+.*-r\b.*-f\b", "Destructive deletion requires inspection of targets first."),
    (r"\bfind\b.*\s-delete\b", "Preview targets before using find -delete."),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", "git clean -f is high risk. Confirm the target and intent first."),
    (r"\bsudo\b", "Avoid sudo unless the user explicitly requested it."),
    (r"[^'\"]\s*2>&1|^2>&1", "Keep stdout and stderr separate by default. Merge them only when a downstream command needs both."),
]

for pattern, reason in ask_patterns:
    if re.search(pattern, normalized):
        emit("ask", reason)
        sys.exit(0)

# --- complexity checks -------------------------------------------------

pipe_count = normalized.count("|")
and_count = normalized.count("&&")
if pipe_count > 1 or and_count > 1:
    emit(
        "ask",
        "Split dense multi-step commands into smaller commands or use a short script.",
        "Prefer a checked script under .workspace/scripts/YYYY-MM-DD-task-id.sh for non-trivial shell work.",
    )
    sys.exit(0)

inline_env_count = len(
    re.findall(r"(?<![A-Za-z0-9_/.-])([A-Za-z_][A-Za-z0-9_]*)=(?:\"[^\"]*\"|'[^']*'|[^ \t\r\n;&|]+)", normalized)
)
if inline_env_count >= 3:
    emit(
        "ask",
        "Too many inline environment variables. Use a script, settings env, or CLAUDE_ENV_FILE.",
        "Allow 1 or 2 simple inline env vars. For 3 or more, or for complex quoting, use a script or shared environment setup.",
    )
    sys.exit(0)

sys.exit(0)
