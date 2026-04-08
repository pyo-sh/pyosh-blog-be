import { asc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { adminTable, type Admin } from "../../src/db/schema/admins";
import * as schema from "../../src/db/schema/index";

export type AdminRepository = {
  list(): Promise<Admin[]>;
  findById(id: number): Promise<Admin | null>;
  findByUsername(username: string): Promise<Admin | null>;
  create(input: { username: string; passwordHash: string }): Promise<Admin>;
  updateUsername(id: number, username: string): Promise<Admin | null>;
  updatePasswordHash(id: number, passwordHash: string): Promise<Admin | null>;
  delete(id: number): Promise<Admin | null>;
};

export class DrizzleAdminRepository implements AdminRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<Admin[]> {
    return this.db.select().from(adminTable).orderBy(asc(adminTable.id));
  }

  async findById(id: number): Promise<Admin | null> {
    const [admin] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.id, id))
      .limit(1);

    return admin ?? null;
  }

  async findByUsername(username: string): Promise<Admin | null> {
    const [admin] = await this.db
      .select()
      .from(adminTable)
      .where(eq(adminTable.username, username))
      .limit(1);

    return admin ?? null;
  }

  async create(input: {
    username: string;
    passwordHash: string;
  }): Promise<Admin> {
    await this.db.insert(adminTable).values(input);

    const admin = await this.findByUsername(input.username);
    if (!admin) {
      throw new Error("Created admin could not be reloaded.");
    }

    return admin;
  }

  async updateUsername(id: number, username: string): Promise<Admin | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.db
      .update(adminTable)
      .set({ username })
      .where(eq(adminTable.id, id));

    return this.findById(id);
  }

  async updatePasswordHash(
    id: number,
    passwordHash: string,
  ): Promise<Admin | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.db
      .update(adminTable)
      .set({ passwordHash })
      .where(eq(adminTable.id, id));

    return this.findById(id);
  }

  async delete(id: number): Promise<Admin | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.db.delete(adminTable).where(eq(adminTable.id, id));

    return existing;
  }
}
