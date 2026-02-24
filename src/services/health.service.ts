import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";

export type DatabaseHealth = {
  status: "up" | "down";
  message?: string;
};

type HealthRouteKind = "ready" | "health";

type HealthStatus = {
  httpStatusCode: 200 | 503;
  status: "ready" | "not_ready" | "ok" | "degraded";
};

export function getAppVersion(): string {
  return (
    process.env.APP_VERSION || process.env.npm_package_version || "unknown"
  );
}

export function getMemoryUsage() {
  const memory = process.memoryUsage();

  return {
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external,
  };
}

export async function getDatabaseHealth(
  fastify: FastifyInstance,
): Promise<DatabaseHealth> {
  try {
    await fastify.db.execute(sql`SELECT 1`);

    return { status: "up" };
  } catch {
    return { status: "down", message: "Database is unavailable" };
  }
}

export function getHealthStatus(
  routeKind: HealthRouteKind,
  database: DatabaseHealth,
): HealthStatus {
  const isHealthy = database.status === "up";

  if (routeKind === "ready") {
    return {
      httpStatusCode: isHealthy ? 200 : 503,
      status: isHealthy ? "ready" : "not_ready",
    };
  }

  return {
    httpStatusCode: isHealthy ? 200 : 503,
    status: isHealthy ? "ok" : "degraded",
  };
}
