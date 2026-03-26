import { eq } from "drizzle-orm";
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
    const [row] = await this.db
      .select({ guestbookEnabled: siteSettingsTable.guestbookEnabled })
      .from(siteSettingsTable)
      .limit(1);
    return row?.guestbookEnabled ?? true;
  }

  /**
   * 방명록 활성 상태 변경
   * 마이그레이션이 id=1 싱글톤 레코드를 보장하므로 직접 UPDATE
   */
  async setGuestbookEnabled(enabled: boolean): Promise<void> {
    await this.db
      .update(siteSettingsTable)
      .set({ guestbookEnabled: enabled })
      .where(eq(siteSettingsTable.id, 1));
  }
}
