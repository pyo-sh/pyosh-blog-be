import { eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@src/db/client";
import { siteSettingsTable } from "@src/db/schema/settings";
import { cleanup, createTestApp, injectAuth } from "@test/helpers/app";
import { seedAdmin, truncateAll } from "@test/helpers/seed";

describe("Settings Routes", () => {
  let app: FastifyInstance;

  async function getCsrfHeaders(cookie?: string): Promise<Record<string, string>> {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/csrf-token",
      headers: cookie ? { cookie } : undefined,
    });
    const setCookie = response.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const headers: Record<string, string> = {
      "x-csrf-token": response.json().token,
    };

    if (raw || cookie) {
      headers.cookie = (raw ?? cookie)!.split(";")[0];
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

  describe("GET /api/settings/guestbook", () => {
    it("기본 방명록 활성 상태 조회 → 200 + enabled=true", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/settings/guestbook",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: true });
    });
  });

  describe("PATCH /api/admin/settings/guestbook", () => {
    it("관리자 인증 없이 접근 → 403", async () => {
      const csrfHeaders = await getCsrfHeaders();
      const response = await app.inject({
        method: "PATCH",
        url: "/api/admin/settings/guestbook",
        headers: csrfHeaders,
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(403);
    });

    it("관리자 방명록 활성 상태 변경 → 200 + DB 반영", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfHeaders = await getCsrfHeaders(adminCookie);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/admin/settings/guestbook",
        headers: csrfHeaders,
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: false });

      const [row] = await db
        .select({ enabled: siteSettingsTable.guestbookEnabled })
        .from(siteSettingsTable)
        .where(eq(siteSettingsTable.id, 1));

      expect(row?.enabled).toBe(false);
    });
  });
});
