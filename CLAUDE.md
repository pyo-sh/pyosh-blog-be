# Server CLAUDE.md

> Fastify + Drizzle ORM 작업 가이드

## 🏗️ 기술 스택

- Fastify 5.7.4
- Drizzle ORM 0.45.1
- MySQL2 3.16.3
- Zod 3.25.76
- Vitest 2.1.9

## 📂 주요 경로

```
server/
├── src/
│   ├── db/schema/          # Drizzle 스키마 (13개 테이블)
│   ├── plugins/            # Fastify 플러그인
│   ├── routes/             # API 라우트
│   ├── services/           # 비즈니스 로직
│   ├── hooks/              # auth.hook.ts
│   ├── errors/             # HttpError
│   └── app.ts              # buildApp()
├── test/                   # Vitest
└── drizzle.config.ts
```

## 💻 명령어

```bash
pnpm dev          # http://localhost:5500
pnpm test
```

## 📝 코딩 규칙

- **파일명**: kebab-case (user.service.ts)
- **클래스**: Injectable 제거됨 (순수 TypeScript)
- **에러**: HttpError static 메서드 사용
- **검증**: Zod 스키마 (수동 검증)
- **쿼리**: Drizzle query builder

## 🗄️ Drizzle ORM

- **스키마**: `src/db/schema/*.ts`
- **Relations**: `src/db/relations/*.ts`
- **타입**: `$inferSelect`, `$inferInsert` 사용

## 🔐 인증

- **Passport**: @fastify/passport (Google/GitHub OAuth)
- **세션**: 커스텀 Drizzle Store
- **인증 훅**: `requireAuth`, `optionalAuth`

## 📚 상세 정보

- Swagger UI: http://localhost:4000/docs

---

## 워크플로

전역 `CLAUDE.md`의 작업 선택 규칙과 `/dev-workflow` 스킬을 따른다.
기록은 모두 `docs/server/`에 저장된다.
