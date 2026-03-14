# server — pyo-sh/pyosh-blog-be

Stack: Fastify 5.7 · Drizzle ORM 0.45 · MySQL2 · Zod · Vitest

## Commands

| | Command |
|-|---------|
| verify | `pnpm test` |
| dev | `pnpm dev` |

## Architecture

Entry: `src/app.ts` → `buildApp()`

- `src/routes/` — route handlers
- `src/services/` — business logic
- `src/schemas/` — shared Zod schemas
- `src/plugins/` — Fastify plugins

## Pre-task

Read `../docs/server/decisions.index.md` before changing architecture or conventions.
