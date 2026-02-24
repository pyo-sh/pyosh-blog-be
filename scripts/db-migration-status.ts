import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import mysql from "mysql2/promise";

type MigrationSummaryRow = {
  appliedCount: number;
  lastAppliedAt: string | number | null;
};

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
      "[DB Status] Missing required DB envs: DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS",
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

function getLocalMigrationCount(): number {
  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries?: unknown[];
  };

  return journal.entries?.length || 0;
}

async function getAppliedMigrationSummary(conn: mysql.Connection) {
  const [tableRows] = await conn.query<{ exists: number }[]>(
    `
      SELECT COUNT(*) AS exists
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = '__drizzle_migrations'
    `,
  );

  if (!tableRows[0]?.exists) {
    return { appliedCount: 0, lastAppliedAt: null };
  }

  const [rows] = await conn.query<MigrationSummaryRow[]>(
    `
      SELECT
        COUNT(*) AS appliedCount,
        MAX(created_at) AS lastAppliedAt
      FROM __drizzle_migrations
    `,
  );

  return rows[0] || { appliedCount: 0, lastAppliedAt: null };
}

function formatLastApplied(lastAppliedAt: string | number | null): string {
  if (!lastAppliedAt) {
    return "none";
  }

  const timestamp = Number(lastAppliedAt);
  if (!Number.isFinite(timestamp)) {
    return "none";
  }

  return new Date(timestamp).toISOString();
}

async function main() {
  loadEnv();
  const dbEnv = requireDbEnv();
  const localCount = getLocalMigrationCount();
  const connection = await mysql.createConnection(dbEnv);

  try {
    const applied = await getAppliedMigrationSummary(connection);
    const pendingCount = Math.max(localCount - applied.appliedCount, 0);

    console.log("[DB Status] Migration summary");
    console.log(`- Local migrations: ${localCount}`);
    console.log(`- Applied migrations: ${applied.appliedCount}`);
    console.log(`- Pending (estimated): ${pendingCount}`);
    console.log(`- Last applied at: ${formatLastApplied(applied.lastAppliedAt)}`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error("[DB Status] Failed:", error);
  process.exit(1);
});
