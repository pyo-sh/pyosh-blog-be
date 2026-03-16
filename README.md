# pyosh-blog-be

Fastify API server for pyosh blog.

## Local setup

**1. Install dependencies**

```bash
pnpm install
```

**2. Configure environment**

Copy `.env.example` to `.env.development.local` and fill in the values.

```bash
cp .env.example .env.development.local
```

Key variables:

| Variable | Description |
|---|---|
| `SERVER_PORT` | Port the server listens on |
| `CLIENT_PROTOCOL` / `CLIENT_HOST` / `CLIENT_PORT` | Frontend origin (used for CORS and redirects) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PSWD` / `DB_DTBS` | MySQL connection |
| `SESSION_SECRET` | Session signing secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `LOGIN_SUCCESS_PATH` / `LOGIN_FAILURE_PATH` | Post-OAuth redirect paths on the frontend |

**3. Run database migrations**

```bash
pnpm db:migrate
```

**4. Start the dev server**

```bash
pnpm dev
```

The server starts with `nodemon` + `ts-node`. Swagger UI is available at `/documentation`.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile to `./build` |
| `pnpm start` | Run compiled build |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Run ESLint |
| `pnpm compile:types` | Type-check without emitting |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:migrate:status` | Show migration status |

## Project structure

```
src/
  server.ts        # Entry point - creates and starts the app
  app.ts           # buildApp() - registers plugins and routes
  routes/          # Route handlers (thin, delegate to services)
  services/        # Business logic
  schemas/         # Shared Zod schemas
  plugins/         # Fastify plugins (auth, session, etc.)
  hooks/           # Fastify lifecycle hooks
  db/              # Drizzle schema and query helpers
  shared/          # env config, utilities
  errors/          # HttpError helpers
  types/           # Shared TypeScript types
  constants/       # App-wide constants
```

## Environment files

The app loads env files in priority order depending on `NODE_ENV`:

- `.env.{NODE_ENV}.local` - local overrides (git-ignored)
- `.env.{NODE_ENV}` - environment defaults
- `.env.local` - shared local overrides (git-ignored)
- `.env` - shared defaults

For local development use `.env.development.local`.
For tests use `.env.test`.
