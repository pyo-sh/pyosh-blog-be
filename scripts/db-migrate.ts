import path from "node:path";
import { config } from "dotenv";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

function loadEnv() {
  config();

  const nodeEnv = process.env.NODE_ENV;
  const envTarget =
    nodeEnv === "production"
      ? "production"
      : nodeEnv === "test"
        ? "test"
        : "development";

  if (nodeEnv) {
    const envPath =
      nodeEnv === "test" ? ".env.test" : `.env.${envTarget}.local`;
    config({ path: envPath, override: true });
  }
}

function requireDbEnv() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS } = process.env;

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PSWD || !DB_DTBS) {
    throw new Error(
      "[DB Migrate] Missing required DB envs: DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS",
    );
  }

  return {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PSWD,
    database: DB_DTBS,
  };
}

async function main() {
  loadEnv();
  const dbEnv = requireDbEnv();

  const pool = mysql.createPool(dbEnv);

  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    console.log("[DB Migrate] Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[DB Migrate] Failed:", error);
  process.exit(1);
});
