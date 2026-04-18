import { sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@src/db/schema/index";
import { siteSettingsTable } from "@src/db/schema/settings";

/**
 * Settings Service - 사이트 설정 관리
 */
export class SettingsService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 방명록 활성 상태 조회
   */
  async getGuestbookEnabled(): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ guestbookEnabled: siteSettingsTable.guestbookEnabled })
        .from(siteSettingsTable)
        .limit(1);

      return row?.guestbookEnabled ?? true;
    } catch (error) {
      if (!this.isMissingSettingsTableError(error)) {
        throw error;
      }

      await this.ensureSettingsTable();

      const [row] = await this.db
        .select({ guestbookEnabled: siteSettingsTable.guestbookEnabled })
        .from(siteSettingsTable)
        .limit(1);

      return row?.guestbookEnabled ?? true;
    }
  }

  /**
   * 방명록 활성 상태 변경
   * INSERT ... ON DUPLICATE KEY UPDATE로 싱글톤 레코드 부재도 안전하게 처리
   */
  async setGuestbookEnabled(enabled: boolean): Promise<void> {
    try {
      await this.db
        .insert(siteSettingsTable)
        .values({ id: 1, guestbookEnabled: enabled })
        .onDuplicateKeyUpdate({ set: { guestbookEnabled: enabled } });
    } catch (error) {
      if (!this.isMissingSettingsTableError(error)) {
        throw error;
      }

      await this.ensureSettingsTable();

      await this.db
        .insert(siteSettingsTable)
        .values({ id: 1, guestbookEnabled: enabled })
        .onDuplicateKeyUpdate({ set: { guestbookEnabled: enabled } });
    }
  }

  private isMissingSettingsTableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const cause = (
      error as Error & { cause?: { code?: string; errno?: number } }
    ).cause;

    return (
      cause?.code === "ER_NO_SUCH_TABLE" ||
      cause?.errno === 1146 ||
      error.message.includes("site_settings_tb")
    );
  }

  private async ensureSettingsTable(): Promise<void> {
    await this.db.execute(
      sql.raw(`
      CREATE TABLE IF NOT EXISTS \`site_settings_tb\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`guestbook_enabled\` boolean NOT NULL DEFAULT true,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`site_settings_tb_id\` PRIMARY KEY (\`id\`)
      )
    `),
    );

    await this.db.execute(
      sql.raw(`
      INSERT IGNORE INTO \`site_settings_tb\` (\`id\`, \`guestbook_enabled\`)
      VALUES (1, true)
    `),
    );
  }
}
