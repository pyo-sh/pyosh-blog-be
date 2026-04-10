import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index";
import { env } from "@src/shared/env";

declare global {
  var __pyoshTestDbShutdownRegistered__: boolean | undefined;
}

/**
 * MySQL2 Connection Pool
 */
export const connection = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PSWD,
  database: env.DB_DTBS,
});

/**
 * Drizzle ORM Client
 */
export const db = drizzle(connection, { schema, mode: "default" });

if (env.NODE_ENV === "test" && !globalThis.__pyoshTestDbShutdownRegistered__) {
  globalThis.__pyoshTestDbShutdownRegistered__ = true;

  process.once("beforeExit", () => {
    void connection.end();
  });
}
