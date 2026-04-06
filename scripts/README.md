# Scripts

서버 운영 및 개발에 필요한 CLI 스크립트 모음입니다.

## hash-password.ts

관리자 비밀번호를 Argon2id로 해싱하여 출력합니다.

### 언제 사용하나

- 관리자 계정을 DB에 수동으로 생성할 때
- 기존 관리자의 비밀번호를 초기화할 때

### 사용법

```bash
pnpm tsx scripts/hash-password.ts "<비밀번호>"
```

### 출력 예시

```
$argon2id$v=19$m=65536,t=3,p=1$abc123...$xyz789...
```

### 어드민 계정 생성 (MySQL)

```sql
INSERT INTO admin_tb (username, password_hash)
VALUES ('admin.test', '<출력된 해시>');
```

### 비밀번호 초기화 (MySQL)

```sql
UPDATE admin_tb
SET password_hash = '<출력된 해시>'
WHERE username = 'admin.test';
```

### 참고

- Argon2id 옵션은 `src/shared/password.ts`와 동일하게 유지해야 합니다 (`memoryCost: 65536`, `timeCost: 3`).
- salt는 라이브러리가 자동 생성하므로, 같은 비밀번호라도 매번 다른 해시가 출력됩니다.

---

## db-migrate.ts

`drizzle/` 폴더에 있는 SQL 마이그레이션 파일을 DB에 적용합니다.

### 언제 사용하나

- 스키마 변경 후 마이그레이션 파일을 생성하고 DB에 반영할 때
- 새 환경(로컬, 스테이징, 프로덕션)에서 DB를 초기 세팅할 때

### 사용법

```bash
pnpm db:migrate
```

### 동작 방식

1. `.env`에서 DB 접속 정보를 로드합니다.
2. `drizzle/` 폴더의 마이그레이션 파일을 순서대로 적용합니다.
3. 이미 적용된 마이그레이션은 건너뜁니다 (`__drizzle_migrations` 테이블로 추적).

### 필요 환경변수

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PSWD`, `DB_DTBS`

---

## db-migration-status.ts

로컬 마이그레이션 파일 수와 DB에 적용된 마이그레이션 수를 비교하여 현재 상태를 보여줍니다.

### 언제 사용하나

- 배포 전 pending 마이그레이션이 있는지 확인할 때
- DB 마이그레이션 적용 여부를 빠르게 점검할 때

### 사용법

```bash
# 전체 요약 출력
pnpm db:migrate:status

# pending 수만 출력 (CI/스크립트 연동용)
pnpm db:migrate:status -- --pending-only
```

### 출력 예시

```
[DB Status] Migration summary
- Local migrations: 5
- Applied migrations: 3
- Pending (estimated): 2
- Last applied at: 2026-03-10T12:00:00.000Z
```

`--pending-only` 사용 시:

```
2
```

### 필요 환경변수

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PSWD`, `DB_DTBS`

---

## db-env.ts (헬퍼 모듈)

직접 실행하는 스크립트가 아닌, `db-migrate.ts`와 `db-migration-status.ts`에서 공통으로 사용하는 내부 모듈입니다.

`.env` 파일을 로드하고 DB 접속에 필요한 환경변수(`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PSWD`, `DB_DTBS`)가 모두 존재하는지 검증합니다.
