# Server — Fastify API

Blog API server with Fastify + Drizzle ORM + MySQL.

## Tech Stack

Fastify 5.7 / Drizzle ORM 0.45 / MySQL2 3.16 / Zod 3.25 / Vitest 2.1

## Commands

```bash
pnpm dev          # http://localhost:5500
pnpm test         # Vitest
```

## Directory Structure

```
src/
├── app.ts                 # buildApp() entry point
├── db/schema/             # Drizzle schema (12 tables)
├── db/relations/          # Drizzle relations
├── routes/                # API routes (auth, posts, categories, tags, comments, guestbook, stats, seo, assets, user)
├── services/              # Business logic (file-storage, health, stats)
├── schemas/               # Zod common schemas
├── plugins/               # Fastify plugins (cors, csrf, drizzle, helmet, passport, rate-limit, session, static, swagger, multipart)
├── hooks/                 # auth.hook.ts — requireAuth, optionalAuth
├── errors/                # HttpError static methods
├── shared/                # Shared utilities
└── types/                 # Type definitions
```

## Coding Patterns

```typescript
// Error responses
throw HttpError.notFound('Post not found');
throw HttpError.unauthorized();

// Drizzle types
type Post = typeof posts.$inferSelect;
type NewPost = typeof posts.$inferInsert;

// Auth hook usage
{ preHandler: [requireAuth] }   // login required
{ preHandler: [optionalAuth] }  // login optional
```

## Auth

@fastify/passport (Google/GitHub OAuth) + custom Drizzle Session Store.

## Workflow

`/dev-pipeline` manages the full cycle. Records go in `docs/server/`.
