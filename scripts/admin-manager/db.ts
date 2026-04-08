import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import { loadEnv, requireDbEnv } from "../db-env";
import { DrizzleAdminRepository } from "./repository";
import { AdminManagerService } from "./service";

export async function createAdminManagerContext() {
  loadEnv();
  const dbEnv = requireDbEnv("Admin Manager");
  const pool = mysql.createPool(dbEnv);
  const db = drizzle(pool, { schema, mode: "default" });
  const repository = new DrizzleAdminRepository(db);
  const service = new AdminManagerService(repository);

  return {
    service,
    async close() {
      await pool.end();
    },
  };
}
