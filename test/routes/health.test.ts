import { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createTestApp } from "@test/helpers/app";

describe("Health Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    vi.restoreAllMocks();

    if (app) {
      await cleanup(app);
    }
  });

  it("GET /health should return basic health response", async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
    });
  });

  it("GET /api/health/live should return liveness payload", async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health/live",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.version).toBe("string");
  });

  it("GET /api/health/ready should include database status", async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.database.status).toBe("up");
  });

  it("GET /api/health should include uptime and database status", async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.memory).toBe("object");
    expect(body.database.status).toBe("up");
  });

  it("GET /api/health/ready should return 503 when DB is down", async () => {
    app = await createTestApp();
    vi.spyOn(app.db, "execute").mockRejectedValueOnce(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(body.database.status).toBe("down");
    expect(body.database.message).toBe("Database is unavailable");
  });

  it("GET /api/health should return 503 when DB is down", async () => {
    app = await createTestApp();
    vi.spyOn(app.db, "execute").mockRejectedValueOnce(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database.status).toBe("down");
    expect(body.database.message).toBe("Database is unavailable");
  });
});
