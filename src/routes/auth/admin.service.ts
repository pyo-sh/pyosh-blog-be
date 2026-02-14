import { eq } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { Admin, adminTable } from "@src/db/schema/admins";
import * as schema from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";
import { verifyPassword } from "@src/shared/password";

/**
 * Admin 계정 반환 타입 (password_hash 제외)
 */
export type AdminResponse = Omit<Admin, "passwordHash">;

/**
 * Admin 서비스 (관리자 계정 관리 및 인증)
 */
export class AdminService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 이메일/비밀번호 검증
   * @param email 이메일 주소
   * @param password 평문 비밀번호
   * @returns 인증된 관리자 정보 (password_hash 제외)
   */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<AdminResponse> {
    // 이메일로 관리자 조회
    const [admin] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.email, email))
      .limit(1);

    if (!admin) {
      throw HttpError.unauthorized("Invalid email or password.");
    }

    // 비밀번호 검증
    const isValid = await verifyPassword(admin.passwordHash, password);
    if (!isValid) {
      throw HttpError.unauthorized("Invalid email or password.");
    }

    // last_login_at 업데이트
    await this.db
      .update(adminTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminTable.id, admin.id));

    // password_hash 제외하고 반환
    const { passwordHash: _, ...adminResponse } = admin;

    return adminResponse;
  }

  /**
   * ID로 관리자 조회
   * @param id 관리자 ID
   * @returns 관리자 정보 (password_hash 제외)
   */
  async getAdminById(id: number): Promise<AdminResponse> {
    const [admin] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.id, id))
      .limit(1);

    if (!admin) {
      throw HttpError.notFound("Admin not found.");
    }

    // password_hash 제외하고 반환
    const { passwordHash: _, ...adminResponse } = admin;

    return adminResponse;
  }
}
