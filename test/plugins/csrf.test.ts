import cookie from "@fastify/cookie";
import session from "@fastify/session";
import Fastify, { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

function getSessionCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("No session cookie in response");
  }

  return raw.split(";")[0];
}

async function createRealCsrfApp(): Promise<FastifyInstance> {
  vi.resetModules();
  vi.doMock("@src/shared/env", () => ({
    env: { NODE_ENV: "development" },
  }));

  const { default: csrfPlugin } = await import("@src/plugins/csrf");

  const app = Fastify();

  await app.register(
    fp(async (fastify) => {
      await fastify.register(cookie);
      await fastify.register(session, {
        secret: "test-session-secret-with-sufficient-length",
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
        },
      });
    }, { name: "session-plugin" }),
  );

  await app.register(csrfPlugin);

  app.get("/csrf-token", async (_request, reply) => {
    return reply.send({ token: reply.generateCsrf() });
  });

  app.post("/protected", { onRequest: app.csrfProtection }, async (_request, reply) => {
    return reply.send({ ok: true });
  });

  await app.ready();

  return app;
}

describe("CSRF Plugin", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    vi.doUnmock("@src/shared/env");
    vi.resetModules();

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("issues a CSRF token together with a session cookie", async () => {
    app = await createRealCsrfApp();

    const response = await app.inject({
      method: "GET",
      url: "/csrf-token",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toEqual(expect.any(String));
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a protected request without token and cookie", async () => {
    app = await createRealCsrfApp();

    const response = await app.inject({
      method: "POST",
      url: "/protected",
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a protected request when the token is missing its session cookie", async () => {
    app = await createRealCsrfApp();

    const csrfResponse = await app.inject({
      method: "GET",
      url: "/csrf-token",
    });

    const { token } = csrfResponse.json();

    const response = await app.inject({
      method: "POST",
      url: "/protected",
      headers: {
        "x-csrf-token": token,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("accepts a protected request with the matching token and session cookie", async () => {
    app = await createRealCsrfApp();

    const csrfResponse = await app.inject({
      method: "GET",
      url: "/csrf-token",
    });

    const { token } = csrfResponse.json();
    const sessionCookie = getSessionCookie(csrfResponse.headers["set-cookie"]);

    const response = await app.inject({
      method: "POST",
      url: "/protected",
      headers: {
        cookie: sessionCookie,
        "x-csrf-token": token,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
