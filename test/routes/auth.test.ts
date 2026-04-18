import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanup,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "@test/helpers/app";
import { seedAdmin, truncateAll } from "@test/helpers/seed";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  function getSessionCookie(setCookie: string | string[] | undefined): string {
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    if (!raw) {
      throw new Error("No session cookie in response");
    }

    return raw.split(";")[0];
  }

  async function getCsrfHeaders(cookie?: string): Promise<Record<string, string>> {
    const response = await app.inject({
      method: "GET",
      url: "/auth/csrf-token",
      headers: cookie ? { cookie } : undefined,
    });
    const responseCookie = response.headers["set-cookie"];
    const nextCookie = responseCookie ? getSessionCookie(responseCookie) : cookie;
    const headers: Record<string, string> = {
      "x-csrf-token": response.json().token,
    };

    if (nextCookie) {
      headers.cookie = nextCookie;
    }

    return headers;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  // ===== POST /auth/admin/login =====

  describe("POST /auth/admin/login", () => {
    beforeEach(async () => {
      await seedAdmin();
    });

    it("올바른 자격증명 → 200 + 세션 쿠키", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.admin).toBeDefined();
      expect(body.admin.username).toBe(TEST_ADMIN_USERNAME);
      expect(body.admin).not.toHaveProperty("email");
      expect(body.admin).not.toHaveProperty("passwordHash");

      const setCookie = response.headers["set-cookie"];
      expect(setCookie).toBeDefined();
    });

    it("잘못된 비밀번호 → 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          password: "WrongPassword1!",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("존재하지 않는 사용자명 → 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: "missing-user",
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("마이그레이션된 email 형태 username도 username 필드로 로그인 가능 → 200", async () => {
      await truncateAll();
      await seedAdmin({ username: "admin@test.pyosh.dev" });

      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: "Admin@Test.pyosh.dev",
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.admin.username).toBe("admin@test.pyosh.dev");
      expect(body.admin).not.toHaveProperty("email");
    });

    it("legacy email 필드를 보내면 → 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          email: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("username에 공백이 포함되면 → 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: "admin user",
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("username이 100자를 초과하면 → 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: "a".repeat(101),
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("DB에 admin이 없을 때 로그인 → 401 + 에러 메시지", async () => {
      await truncateAll();

      const response = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.message).toBeDefined();
    });
  });

  // ===== GET /auth/csrf-token =====

  describe("GET /auth/csrf-token", () => {
    it("CSRF 토큰 발급 + 세션 쿠키 설정 → 200", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/csrf-token",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().token).toEqual(expect.any(String));
    });
  });

  // ===== GET /auth/me =====

  describe("GET /auth/me", () => {
    it("로그인 상태 → 200", async () => {
      await seedAdmin();

      const loginResponse = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      const sessionCookie = getSessionCookie(loginResponse.headers["set-cookie"]);

      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.type).toBe("admin");
      expect(body.username).toBe(TEST_ADMIN_USERNAME);
      expect(body).not.toHaveProperty("email");
    });

    it("비로그인 → 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===== POST /auth/admin/logout =====

  describe("POST /auth/admin/logout", () => {
    it("세션 파기 → 204, 이후 /me → 401", async () => {
      await seedAdmin();

      const loginResponse = await app.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      const sessionCookie = getSessionCookie(loginResponse.headers["set-cookie"]);
      const csrfHeaders = await getCsrfHeaders(sessionCookie);

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/auth/admin/logout",
        headers: csrfHeaders,
      });

      expect(logoutResponse.statusCode).toBe(204);

      // 세션 파기 후 /me 요청은 401
      const meResponse = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(meResponse.statusCode).toBe(401);
    });
  });
});
