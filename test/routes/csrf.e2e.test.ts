import { mkdir } from "node:fs/promises";
import { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@test/helpers/app";
import { truncateAll } from "@test/helpers/seed";

function getSessionCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("No session cookie in response");
  }

  return raw.split(";")[0];
}

async function createRealCsrfApp(): Promise<FastifyInstance> {
  vi.resetModules();
  vi.doMock("@src/shared/env", async () => {
    const actual = await vi.importActual<typeof import("@src/shared/env")>(
      "@src/shared/env",
    );

    return {
      ...actual,
      env: {
        ...actual.env,
        NODE_ENV: "development" as const,
      },
    };
  });

  await mkdir("uploads", { recursive: true });

  const { buildApp } = await import("@src/app");
  const app = await buildApp();
  await app.ready();

  return app;
}

describe("CSRF Route Wiring", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAll();
    app = await createRealCsrfApp();
  });

  afterEach(async () => {
    await cleanup(app);
    vi.doUnmock("@src/shared/env");
    vi.resetModules();
  });

  it("rejects guestbook creation when the issued session cookie is missing its CSRF token", async () => {
    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf-token",
    });

    const sessionCookie = getSessionCookie(csrfResponse.headers["set-cookie"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/guestbook",
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        body: "csrf 미설정 요청",
        guestName: "방문자",
        guestEmail: "visitor@example.com",
        guestPassword: "pass1234",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("accepts guestbook creation with the token and cookie issued by /api/auth/csrf-token", async () => {
    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf-token",
    });

    const { token } = csrfResponse.json();
    const sessionCookie = getSessionCookie(csrfResponse.headers["set-cookie"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/guestbook",
      headers: {
        cookie: sessionCookie,
        "x-csrf-token": token,
      },
      payload: {
        body: "csrf 검증 통과",
        guestName: "방문자",
        guestEmail: "visitor@example.com",
        guestPassword: "pass1234",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.body).toBe("csrf 검증 통과");
  });
});
