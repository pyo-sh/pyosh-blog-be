import { eq, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { Admin, adminTable } from "@src/db/schema/admins";
import * as schema from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";
import { hashPassword, verifyPassword } from "@src/shared/password";

export interface AdminCreateArgs {
  email: string;
  password: string;
}

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
   * 관리자 계정 생성
   * @param email 이메일 주소
   * @param password 평문 비밀번호
   * @returns 생성된 관리자 정보 (password_hash 제외)
   */
  async createAdmin({
    email,
    password,
  }: AdminCreateArgs): Promise<AdminResponse> {
    // 이메일 중복 체크
    const [existing] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.email, email))
      .limit(1);

    if (existing) {
      throw HttpError.conflict("이미 존재하는 이메일입니다.");
    }

    // 비밀번호 해싱
    const passwordHash = await hashPassword(password);

    // 관리자 생성
    const [result] = await this.db.insert(adminTable).values({
      email,
      passwordHash,
    });

    const [admin] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.id, Number(result.insertId)))
      .limit(1);

    if (!admin) {
      throw HttpError.internal("관리자 생성에 실패했습니다.");
    }

    // password_hash 제외하고 반환
    const { passwordHash: _, ...adminResponse } = admin;

    return adminResponse;
  }

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
      throw HttpError.unauthorized("잘못된 이메일 또는 비밀번호입니다.");
    }

    // 비밀번호 검증
    const isValid = await verifyPassword(admin.passwordHash, password);
    if (!isValid) {
      throw HttpError.unauthorized("잘못된 이메일 또는 비밀번호입니다.");
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
      throw HttpError.notFound("관리자 정보를 찾을 수 없습니다.");
    }

    // password_hash 제외하고 반환
    const { passwordHash: _, ...adminResponse } = admin;

    return adminResponse;
  }

  /**
   * 관리자 계정 존재 여부 확인
   * @returns 관리자가 1명 이상 존재하면 true
   */
  async hasAnyAdmin(): Promise<boolean> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(adminTable)
      .limit(1);

    return result ? result.count > 0 : false;
  }
}
