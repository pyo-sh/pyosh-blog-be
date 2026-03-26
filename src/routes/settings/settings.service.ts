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
   */
  async setGuestbookEnabled(enabled: boolean): Promise<void> {
    const [existing] = await this.db
      .select({ id: siteSettingsTable.id })
      .from(siteSettingsTable)
      .limit(1);

    if (existing) {
      await this.db
        .update(siteSettingsTable)
        .set({ guestbookEnabled: enabled });
    } else {
      await this.db
        .insert(siteSettingsTable)
        .values({ guestbookEnabled: enabled });
    }
  }
}
