# Server - Fastify API

Shared Claude Code instructions for the backend repository.

Personal preferences belong in `CLAUDE.local.md` or `.claude/settings.local.json`, not in this file.

## Purpose

Blog API server with Fastify, Drizzle ORM, and MySQL.

## Tech stack

Fastify 5.7
Drizzle ORM 0.45
MySQL2 3.16
Zod 3.25
Vitest 2.1

## Commands

```bash
pnpm dev
pnpm test
```

## Architecture notes

- `src/app.ts` is the `buildApp()` entry point.
- Routes live in `src/routes/`.
- Business logic lives in `src/services/`.
- Shared schemas live in `src/schemas/`.
- Plugins live in `src/plugins/`.
- Shared backend coding rules live in `.claude/rules/`.

## Context sources

- Before changing behavior, architecture, or conventions, read `../docs/server/progress.index.md`, `../docs/server/findings.index.md`, and `../docs/server/decisions.index.md`.
- For workspace mappings and shell helpers, read `../.agents/references/monorepo-layout.md`.

## Workflow

- `/dev-pipeline` manages the full cycle for issue-driven work.
- Records go in `../docs/server/`.
