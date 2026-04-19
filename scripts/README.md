# Scripts

서버 운영 및 개발에 필요한 CLI 스크립트 모음입니다.

## Tool runner (배포 서버용 docker 실행 환경)

배포 서버 호스트에서 DB 스크립트를 실행하기 위한 일회성 docker 환경입니다.

`mysql_container`는 `blog_network` 안에서만 접근 가능하므로, 호스트 쉘에서 직접 `pnpm db:admin` 을 실행하면 DB 연결에 실패합니다. 이 tool runner 는 동일 네트워크에 합류한 컨테이너에서 스크립트를 실행합니다.

### 언제 사용하나

- 배포 서버 SSH 접속 후 admin 계정을 관리할 때
- 배포 서버에서 마이그레이션 상태를 확인할 때
- 호스트 쉘에서 DB 스크립트를 실행해야 하는 모든 경우

### 사전 조건

- 배포 서버에 `blog_network` docker 네트워크가 존재해야 합니다
- `.env` 파일이 프로젝트 루트에 있어야 합니다

### 사용법

```bash
# bash 쉘로 진입 (권장)
pnpm tool

# 진입 후 평소처럼 스크립트 실행
pnpm db:admin
pnpm db:migrate:status
pnpm db:migrate

# 종료
exit
```

일회성 실행도 가능합니다:

```bash
pnpm tool pnpm db:migrate:status
```

### 동작 방식

1. `node:20-slim` 컨테이너를 `blog_network`에 합류시켜 실행합니다.
2. 소스 디렉터리를 bind-mount 하고 `pnpm install` 을 실행합니다.
3. bash 쉘(또는 지정 명령)을 실행합니다.
4. `--rm` 으로 종료 시 컨테이너와 anonymous volume(`node_modules`) 을 자동 삭제합니다.

### 볼륨 관리

| 볼륨 | 방식 | 설명 |
|------|------|------|
| `node_modules` | anonymous | 컨테이너 종료 시 자동 삭제 |
| `tool_pnpm_store` | named | 패키지 캐시 유지 - 재실행 시 네트워크 재다운로드 방지 |

pnpm store 볼륨을 초기화하려면:

```bash
docker volume rm backend_tool_pnpm_store
```

---

## hash-password.ts

관리자 비밀번호를 Argon2id로 해싱하여 출력합니다.

### 언제 사용하나

- 관리자 계정을 DB에 수동으로 생성할 때
- 기존 관리자의 비밀번호를 초기화할 때

### 사용법

```bash
pnpm ts-node ./scripts/hash-password.ts "<비밀번호>"
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

## admin-manager.ts

로컬 터미널에서 admin 계정을 조회, 생성, 수정, 비밀번호 변경, 삭제할 수 있는 대화형 TUI 스크립트입니다.

### 언제 사용하나

- 현재 등록된 admin 계정을 확인할 때
- 새 admin 계정을 생성할 때
- username을 변경할 때
- 비밀번호를 변경할 때
- 더 이상 필요 없는 admin 계정을 삭제할 때

### 사용법

```bash
# 기본값: NODE_ENV=development
pnpm ts-node ./scripts/admin-manager.ts

# override 예시
NODE_ENV=production pnpm ts-node ./scripts/admin-manager.ts
```

### 제공 기능

- admin 목록 조회
- 상세 정보 확인
- admin 생성
- username 변경
- 비밀번호 변경
- admin 삭제

### 안전 장치

- 비밀번호 입력 마스킹
- 비밀번호 변경 시 대상 username 재확인
- 삭제 시 대상 username 재확인 + 최종 delete 확인

### 필요 환경변수

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PSWD`, `DB_DTBS`

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
