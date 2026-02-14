/**
 * 관리자 비밀번호 해시 생성 스크립트
 *
 * 사용법:
 *   pnpm tsx scripts/hash-password.ts "my-password"
 *
 * 출력된 해시를 사용하여 DB에 직접 관리자 계정을 생성합니다:
 *   INSERT INTO admin_tb (email, password_hash)
 *   VALUES ('admin@example.com', '<출력된 해시>');
 */
import * as argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
};

const password = process.argv[2];

if (!password) {
  console.error("Usage: pnpm tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

const hash = await argon2.hash(password, ARGON2_OPTIONS);
console.log(hash);
