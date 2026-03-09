# Worktree workflow

- Any task involving file edits must start in a worktree.
- Do not edit directly on `main`.
- Use the workspace worktree convention: `.workspace/worktrees/{type}-{description}` from the workspace root.
- Branch name: `{type}/{description}`
- Commit message: `{type}: {description}`
- After committing in a worktree, stop and ask whether to merge locally or open a PR.
- One agent equals one task. Avoid concurrent edits to the same file.
