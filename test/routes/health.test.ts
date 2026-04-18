import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createTestApp } from "@test/helpers/app";

describe("Health Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("GET /health should return basic health response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
    });
  });

  it("GET /health/live should return liveness payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.version).toBe("string");
  });

  it("GET /health/ready should include database status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.database.status).toBe("up");
  });

  it("GET /health/status should include uptime and database status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/status",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.memory).toBe("object");
    expect(body.database.status).toBe("up");
  });

  it("GET /health/ready should return 503 when DB is down", async () => {
    vi.spyOn(app.db, "execute").mockRejectedValueOnce(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(body.database.status).toBe("down");
    expect(body.database.message).toBe("Database is unavailable");
  });

  it("GET /health/status should return 503 when DB is down", async () => {
    vi.spyOn(app.db, "execute").mockRejectedValueOnce(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: "/health/status",
    });

    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database.status).toBe("down");
    expect(body.database.message).toBe("Database is unavailable");
  });
});
