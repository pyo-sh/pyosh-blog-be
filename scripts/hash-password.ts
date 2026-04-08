/**
 * 관리자 비밀번호 해시 생성 스크립트
 *
 * 사용법:
 *   pnpm ts-node ./scripts/hash-password.ts "my-password"
 *
 * 출력된 해시를 사용하여 DB에 직접 관리자 계정을 생성합니다:
 *   INSERT INTO admin_tb (username, password_hash)
 *   VALUES ('admin.test', '<출력된 해시>');
 */
import { hashPassword } from "../src/shared/password";

const password = process.argv[2];

if (!password) {
  console.error("Usage: pnpm ts-node ./scripts/hash-password.ts <password>");
  process.exit(1);
}

async function main() {
  const hash = await hashPassword(password);
  console.log(hash);
}

main();
