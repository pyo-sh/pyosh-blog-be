import path from "path";

const SETUP_GUIDE = `
  ──────────────────────────────────────────────────────────
  [Test Setup] 테스트 DB를 찾을 수 없거나 접근 권한이 없습니다.

  MySQL에 root로 접속 후 아래 명령을 실행하세요:

    CREATE DATABASE IF NOT EXISTS \`pyosh_blog_test\`;
    GRANT ALL PRIVILEGES ON \`pyosh_blog_test\`.* TO 'pyosh'@'localhost';
    FLUSH PRIVILEGES;

  DB_USER / DB_PSWD는 server/.env.test에서 수정할 수 있습니다.
  ──────────────────────────────────────────────────────────
`;

/**
 * Vitest Global Setup
 * - 테스트 DB 생성 시도 (CREATE DATABASE IF NOT EXISTS)
 * - Drizzle 마이그레이션 실행 (멱등)
 * - 권한 부족 시 안내 메시지 출력 후 종료
 */
export async function setup(): Promise<void> {
  // globalSetup은 별도 프로세스에서 실행되므로 dotenv를 직접 로드
  const { config } = await import("dotenv");
  config({ path: path.resolve(process.cwd(), ".env.test") });

  const mysql = await import("mysql2/promise");
  const { drizzle } = await import("drizzle-orm/mysql2");
  const { migrate } = await import("drizzle-orm/mysql2/migrator");

  const { DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS } = process.env;

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PSWD || !DB_DTBS) {
    throw new Error(
      "[Test Setup] Missing DB environment variables. Check server/.env.test",
    );
  }

  // 1. 테스트 DB 생성 (없으면) - 권한 부족 시 graceful 처리
  const rootConn = await mysql.default.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PSWD,
  });

  try {
    await rootConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_DTBS}\``);
    console.log(`[Test Setup] Database "${DB_DTBS}" ready`);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ER_DBACCESS_DENIED_ERROR" || code === "ER_ACCESS_DENIED_ERROR") {
      // DB가 이미 존재하는 경우 계속 진행, 없으면 안내 출력 후 종료
      try {
        await rootConn.execute(`USE \`${DB_DTBS}\``);
        console.log(`[Test Setup] Using existing database "${DB_DTBS}"`);
      } catch {
        console.error(SETUP_GUIDE);
        throw new Error(`[Test Setup] Cannot access database "${DB_DTBS}". See instructions above.`);
      }
    } else {
      throw err;
    }
  } finally {
    await rootConn.end();
  }

  // 2. 스키마 마이그레이션 실행 (멱등)
  const pool = mysql.default.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PSWD,
    database: DB_DTBS,
  });

  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    console.log("[Test Setup] Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

export async function teardown(): Promise<void> {
  // 테스트 DB는 유지 (다음 실행 시 migrate가 멱등하게 동작)
}
