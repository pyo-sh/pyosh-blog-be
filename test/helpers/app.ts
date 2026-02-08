import { FastifyInstance } from "fastify";
import { buildApp } from "@src/app";

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
 * Fastify 인스턴스 종료 및 DB 연결 해제
 */
export async function cleanup(app: FastifyInstance): Promise<void> {
  await app.close();
}
