# Bash and shell rules

- Prefer readable, auditable commands over dense one-liners.
- Short read-only pipelines are acceptable.
- Use a short script instead of a dense command when the command:
  - changes files or git state
  - chains multiple stateful actions
  - needs heavy quoting or escaping
  - creates temporary files
  - mixes analysis and mutation
  - requires 3 or more inline environment variables
- Keep stdout and stderr separate by default.
- Use `mktemp` and `trap` for temporary scripts and files.
- For git-only commands in another repository, prefer `git -C "$repo" ...`.
- For `gh`, `pnpm`, or repo-local scripts in another repository, use `(cd "$repo" && ...)` inside one command or one short script.
- Avoid brittle process matching such as `ps aux | grep foo`.
- Before destructive actions, inspect targets first and use dry-run options when available.
- Shared or persistent environment belongs in `.claude/settings.json` or `CLAUDE_ENV_FILE`.
- Do not invent a custom JSON env syntax in bash commands.
