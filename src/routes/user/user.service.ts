import { eq } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@src/db/schema/index";
import { User, userTable } from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";

export interface UserCreateArgs {
  name: string;
  githubId?: string | null;
  googleEmail?: string | null;
  imageId?: number | null;
}

export interface UserUpdateArgs {
  id: number;
  name?: string;
  imageId?: number | null;
}

/**
 * User 서비스 (Drizzle ORM 기반)
 */
export class UserService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async createUser(args: UserCreateArgs): Promise<User> {
    const [result] = await this.db.insert(userTable).values(args);
    const [user] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.id, Number(result.insertId)))
      .limit(1);

    if (!user) {
      throw HttpError.internal("Failed to create user.");
    }

    return user;
  }

  async getUser(id: number): Promise<User> {
    const [user] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!user) {
      throw HttpError.notFound("User not found.");
    }

    return user;
  }

  async updateUser({ id, name, imageId }: UserUpdateArgs): Promise<User> {
    const [user] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!user) {
      throw HttpError.notFound("User not found.");
    }

    // 변경사항만 적용
    const updates: Partial<User> = {};
    if (name !== undefined) {
      updates.name = name;
    }
    if (imageId !== undefined) {
      updates.imageId = imageId;
    }

    await this.db.update(userTable).set(updates).where(eq(userTable.id, id));

    // 업데이트된 유저 조회
    const [updatedUser] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!updatedUser) {
      throw HttpError.internal("Failed to update user.");
    }

    return updatedUser;
  }

  async deleteUser(id: number): Promise<void> {
    // Soft delete: deletedAt 업데이트
    await this.db
      .update(userTable)
      .set({ deletedAt: new Date() })
      .where(eq(userTable.id, id));

    // 삭제 확인
    const [user] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!user || !user.deletedAt) {
      throw HttpError.notFound("Failed to delete user.");
    }
  }
}
