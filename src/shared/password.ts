import * as argon2 from "argon2";

/**
 * Argon2id 옵션
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64MB
  timeCost: 3,
};

/**
 * 비밀번호를 Argon2id로 해싱
 * @param plain 평문 비밀번호
 * @returns 해시된 비밀번호
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * 비밀번호 해시 검증
 * @param hash 저장된 해시
 * @param plain 평문 비밀번호
 * @returns 일치 여부
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // 해시 형식이 잘못된 경우 false 반환
    return false;
  }
}
