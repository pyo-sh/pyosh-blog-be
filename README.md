# pyosh-blog-be

Fastify API server for pyosh blog.

## Tech stack

- Fastify 5.7
- Drizzle ORM 0.45 with `drizzle-kit`
- MySQL (via `mysql2`)
- Zod 3.25 (`fastify-type-provider-zod`)
- Passport (Google and GitHub OAuth) with `@fastify/session` and `@fastify/passport`
- Pino logger
- Vitest 2.1
- TypeScript 5.9

## Requirements

- Node.js 18+
- pnpm
- MySQL server reachable with the `DB_*` variables

## Getting started

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
| `SESSION_COOKIE_DOMAIN` | Optional shared cookie domain for cross-subdomain session reuse |
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
| `pnpm test:ui` | Run tests with the Vitest UI |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Run ESLint |
| `pnpm compile:types` | Type-check without emitting |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:migrate:status` | Show migration status |
| `pnpm db:admin` | Run the admin user management CLI |
| `pnpm pw:create` | Hash a password with argon2 |
| `pnpm tool` | Run the dockerized tools runner (`scripts/tools/docker-compose.yml`) |

## API documentation

- Swagger UI: `GET /documentation` on the running server
- Endpoint reference: [`api-spec.md`](./api-spec.md)

Route modules live under `src/routes/`:

```
assets  auth  categories  comments  guestbook
posts   seo   settings    stats     tags       user
```

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
scripts/           # DB migration, admin, password, and tool scripts
drizzle/           # Generated SQL migrations and meta
test/              # Vitest suites, helpers, and setup
```

## Environment files

The app loads env files in priority order depending on `NODE_ENV`:

- `.env.{NODE_ENV}.local` - local overrides (git-ignored)
- `.env.{NODE_ENV}` - environment defaults
- `.env.local` - shared local overrides (git-ignored)
- `.env` - shared defaults

For local development use `.env.development.local`. For tests use `.env.test`.

## Database migrations

Migration SQL lives in `drizzle/`. The schema source is `src/db/schema/index.ts` and Drizzle Kit is configured in `drizzle.config.ts`.

- Apply pending migrations: `pnpm db:migrate`
- Check current status: `pnpm db:migrate:status`
- Generate a new migration after editing the schema: `pnpm drizzle-kit generate`

Migration runner scripts are under `scripts/` (`db-migrate.ts`, `db-migration-status.ts`).

## Testing

- Runner: Vitest, configured in `vitest.config.ts`
- Environment: tests run with `NODE_ENV=test` and load `.env.test`
- Layout: suites live under `test/` mirroring `src/` (`routes/`, `services/`, `plugins/`, `scripts/`), with shared `helpers/` and a top-level `setup.ts` and `smoke.test.ts`

Run a single suite by passing a path:

```bash
pnpm test test/routes/auth
```

## Deployment

Production images are built from `Dockerfile` and run via `docker-compose.yml`.

- `blog_container` attaches to an external `blog_network` and does not expose ports directly. A Cloudflare Tunnel sidecar (see `cloudflared/`) fronts the service.
- Host bind mounts: `${HOME}/blog_uploads` -> `/app/uploads`, `${HOME}/blog_logs` -> `/app/logs`
- Env is loaded from a host-level `.env` referenced by the compose file
- Entry point: `scripts/entrypoint.sh`; deploy helper: `scripts/deploy.sh`

## License

MIT. See [`LICENSE`](./LICENSE).
