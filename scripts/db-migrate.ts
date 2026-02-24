import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { loadEnv, requireDbEnv } from "./db-env";

async function main() {
  loadEnv();
  const dbEnv = requireDbEnv("DB Migrate");

  const pool = mysql.createPool(dbEnv);

  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    console.log("[DB Migrate] Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[DB Migrate] Failed:", error);
  process.exit(1);
});
