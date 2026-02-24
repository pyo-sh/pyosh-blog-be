import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";

export type DatabaseHealth = {
  status: "up" | "down";
  message?: string;
};

export function getAppVersion(): string {
  return (
    process.env.APP_VERSION || process.env.npm_package_version || "unknown"
  );
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
