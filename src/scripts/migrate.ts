import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { env } from "@src/shared/env";

async function main() {
  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PSWD,
    database: env.DB_DTBS,
    multipleStatements: false,
  });

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
