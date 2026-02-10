import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { buildApp } from "@src/app";
import { db } from "@src/db/client";
import { sessionTable } from "@src/db/schema";
import { env } from "@src/shared/env";

/** 테스트용 Admin 기본 자격증명 */
export const TEST_ADMIN_EMAIL = "admin@test.pyosh.dev";
export const TEST_ADMIN_PASSWORD = "Test12345!";

/**
 * 테스트용 Fastify 인스턴스 생성
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();

  return app;
}

/**
 * 관리자 인증 세션 쿠키 반환
 *
 * seedAdmin()으로 Admin이 생성된 이후에 호출해야 함.
 * @param _adminId - 예약 파라미터 (현재 기본 Admin 자격증명만 사용)
 */
export async function injectAuth(
  app: FastifyInstance,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _adminId?: number,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/admin/login",
    payload: {
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `[injectAuth] Login failed: ${response.statusCode} - ${response.body}`,
    );
  }

  const setCookie = response.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("[injectAuth] No session cookie in response");
  }

  // "sessionId=value; Path=/; ..." → "sessionId=value"
  return raw.split(";")[0];
}

/**
 * OAuth 유저 세션 쿠키 생성
 *
 * seedUser()로 유저가 생성된 이후에 호출해야 함.
 * @fastify/passport + @fastify/session 방식으로 세션을 DB에 직접 삽입한다.
 * @param userId - 세션을 생성할 유저 ID
 */
export async function injectOAuthUser(userId: number): Promise<string> {
  // @fastify/session 형식의 세션 ID (24바이트 base64url)
  const sessionId = crypto.randomBytes(24).toString("base64url");

  // @fastify/passport 세션 데이터 형식: { passport: userId, cookie: {...} }
  const expiresDate = new Date(Date.now() + 86400 * 1000);
  const sessionData = JSON.stringify({
    passport: userId,
    cookie: {
      originalMaxAge: 86400000,
      expires: expiresDate.toISOString(),
      secure: false,
      httpOnly: true,
      path: "/",
    },
  });

  await db.insert(sessionTable).values({
    id: sessionId,
    data: sessionData,
    expiresAt: Math.floor(expiresDate.getTime() / 1000),
  });

  // @fastify/cookie Signer 방식 서명: value + '.' + hmac_sha256_base64_no_padding
  const signature = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(sessionId)
    .digest("base64")
    .replace(/=/g, "");

  return `sessionId=${sessionId}.${signature}`;
}

/**
 * Fastify 인스턴스 종료 및 DB 연결 해제
 */
export async function cleanup(app: FastifyInstance): Promise<void> {
  await app.close();
}
