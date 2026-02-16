import { eq, isNull } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@src/db/schema/index";
import {
  oauthAccountTable,
  OAuthAccount,
} from "@src/db/schema/oauth-accounts";
import { HttpError } from "@src/errors/http-error";

export interface UpdateMyProfileData {
  displayName?: string;
  avatarUrl?: string | null;
}

/**
 * User Service — oauth_account_tb 기반 사용자 관리
 */
export class UserService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 본인 프로필 조회
   */
  async getMyProfile(oauthAccountId: number): Promise<OAuthAccount> {
    const [account] = await this.db
      .select()
      .from(oauthAccountTable)
      .where(eq(oauthAccountTable.id, oauthAccountId))
      .limit(1);

    if (!account || account.deletedAt !== null) {
      throw HttpError.notFound("User not found.");
    }

    return account;
  }

  /**
   * 본인 프로필 수정 (허용 필드: displayName, avatarUrl)
   */
  async updateMyProfile(
    oauthAccountId: number,
    data: UpdateMyProfileData,
  ): Promise<OAuthAccount> {
    const [existing] = await this.db
      .select()
      .from(oauthAccountTable)
      .where(eq(oauthAccountTable.id, oauthAccountId))
      .limit(1);

    if (!existing || existing.deletedAt !== null) {
      throw HttpError.notFound("User not found.");
    }

    const updateData: Partial<typeof oauthAccountTable.$inferInsert> = {};

    if (data.displayName !== undefined) {
      updateData.displayName = data.displayName;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    await this.db
      .update(oauthAccountTable)
      .set(updateData)
      .where(eq(oauthAccountTable.id, oauthAccountId));

    const [updated] = await this.db
      .select()
      .from(oauthAccountTable)
      .where(eq(oauthAccountTable.id, oauthAccountId))
      .limit(1);

    return updated!;
  }

  /**
   * 회원 탈퇴 (soft delete: deletedAt 설정)
   */
  async deleteMyAccount(oauthAccountId: number): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(oauthAccountTable)
      .where(eq(oauthAccountTable.id, oauthAccountId))
      .limit(1);

    if (!existing || existing.deletedAt !== null) {
      throw HttpError.notFound("User not found.");
    }

    await this.db
      .update(oauthAccountTable)
      .set({ deletedAt: new Date() })
      .where(eq(oauthAccountTable.id, oauthAccountId));
  }

  /**
   * 계정이 활성 상태인지 확인 (내부 유틸)
   */
  async isActive(oauthAccountId: number): Promise<boolean> {
    const [account] = await this.db
      .select({ deletedAt: oauthAccountTable.deletedAt })
      .from(oauthAccountTable)
      .where(
        eq(oauthAccountTable.id, oauthAccountId),
      )
      .limit(1);

    return !!account && account.deletedAt === null;
  }
}
