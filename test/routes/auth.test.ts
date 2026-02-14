import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanup,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
} from "@test/helpers/app";
import { seedAdmin, truncateAll } from "@test/helpers/seed";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  // ===== POST /api/auth/admin/login =====

  describe("POST /api/auth/admin/login", () => {
    beforeEach(async () => {
      await seedAdmin();
    });

    it("올바른 자격증명 → 200 + 세션 쿠키", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.admin).toBeDefined();
      expect(body.admin.email).toBe(TEST_ADMIN_EMAIL);
      expect(body.admin).not.toHaveProperty("passwordHash");

      const setCookie = response.headers["set-cookie"];
      expect(setCookie).toBeDefined();
    });

    it("잘못된 비밀번호 → 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: TEST_ADMIN_EMAIL,
          password: "WrongPassword1!",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("존재하지 않는 이메일 → 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: "notexist@test.pyosh.dev",
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("DB에 admin이 없을 때 로그인 → 401 + 에러 메시지", async () => {
      await truncateAll();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.message).toBeDefined();
    });
  });

  // ===== GET /api/auth/me =====

  describe("GET /api/auth/me", () => {
    it("로그인 상태 → 200", async () => {
      await seedAdmin();

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      const setCookie = loginResponse.headers["set-cookie"];
      const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = raw!.split(";")[0];

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.type).toBe("admin");
      expect(body.email).toBe(TEST_ADMIN_EMAIL);
    });

    it("비로그인 → 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===== POST /api/auth/admin/logout =====

  describe("POST /api/auth/admin/logout", () => {
    it("세션 파기 → 204, 이후 /me → 401", async () => {
      await seedAdmin();

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
        },
      });

      const setCookie = loginResponse.headers["set-cookie"];
      const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = raw!.split(";")[0];

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/auth/admin/logout",
        headers: { cookie: sessionCookie },
      });

      expect(logoutResponse.statusCode).toBe(204);

      // 세션 파기 후 /me 요청은 401
      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(meResponse.statusCode).toBe(401);
    });
  });
});
