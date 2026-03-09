---
paths:
  - "src/**/*.ts"
---

# Backend architecture and coding rules

- Use `HttpError` static methods for HTTP error responses.
- Use Drizzle types from `$inferSelect` and `$inferInsert`.
- Use `requireAuth` for authenticated routes and `optionalAuth` where login is optional.
- Keep non-trivial business logic in `src/services/` instead of growing route handlers unnecessarily.
