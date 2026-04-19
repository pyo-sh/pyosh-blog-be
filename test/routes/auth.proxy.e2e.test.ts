import { mkdir } from "node:fs/promises";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, TEST_ADMIN_PASSWORD, TEST_ADMIN_USERNAME } from "@test/helpers/app";
import { seedAdmin, truncateAll } from "@test/helpers/seed";

async function createProductionProxyApp(): Promise<FastifyInstance> {
  vi.resetModules();
  vi.doMock("@src/shared/env", async () => {
    const actual = await vi.importActual<typeof import("@src/shared/env")>(
      "@src/shared/env",
    );

    return {
      ...actual,
      env: {
        ...actual.env,
        NODE_ENV: "production" as const,
        SESSION_COOKIE_DOMAIN: ".pyosh.com",
        TRUSTED_PROXY_RANGES: "172.18.0.10/32",
      },
    };
  });

  await mkdir("uploads", { recursive: true });

  const { buildApp } = await import("@src/app");
  const app = await buildApp();
  await app.ready();

  return app;
}

describe("Auth Routes Behind HTTPS Proxy", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createProductionProxyApp();
  });

  afterAll(async () => {
    await cleanup(app);
    vi.doUnmock("@src/shared/env");
    vi.resetModules();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedAdmin();
  });

  it("issues a secure session cookie when login is forwarded over HTTPS", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/admin/login",
      remoteAddress: "172.18.0.10",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "api.pyosh.com",
      },
      payload: {
        username: TEST_ADMIN_USERNAME,
        password: TEST_ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toEqual(expect.any(String));
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("Domain=.pyosh.com");
  });

  it("ignores forwarded headers from untrusted public peers", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/admin/login",
      remoteAddress: "198.51.100.10",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-for": "1.2.3.4",
      },
      payload: {
        username: TEST_ADMIN_USERNAME,
        password: TEST_ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("ignores forwarded headers from private peers outside the configured allowlist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/admin/login",
      remoteAddress: "172.18.0.11",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-for": "10.0.0.5",
      },
      payload: {
        username: TEST_ADMIN_USERNAME,
        password: TEST_ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
