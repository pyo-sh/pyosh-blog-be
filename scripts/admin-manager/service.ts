import { hashPassword } from "../../src/shared/password";
import type { Admin } from "../../src/db/schema/admins";
import type { AdminRepository } from "./repository";
import {
  validatePassword,
  validatePasswordConfirmation,
  validateUsername,
} from "./validators";

export type AdminRecord = Omit<Admin, "passwordHash">;

function sanitizeAdmin(admin: Admin): AdminRecord {
  const { passwordHash: _, ...record } = admin;
  return record;
}

function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export class AdminManagerService {
  constructor(private readonly repository: AdminRepository) {}

  async listAdmins(): Promise<AdminRecord[]> {
    const admins = await this.repository.list();
    return admins.map(sanitizeAdmin);
  }

  async getAdminById(id: number): Promise<AdminRecord> {
    const admin = await this.repository.findById(id);
    if (!admin) {
      throw new Error(`Admin ${id} not found.`);
    }

    return sanitizeAdmin(admin);
  }

  async createAdmin(input: {
    username: string;
    password: string;
    passwordConfirmation: string;
  }): Promise<AdminRecord> {
    const username = validateUsername(input.username);
    const password = validatePassword(input.password);
    validatePasswordConfirmation(password, input.passwordConfirmation);

    try {
      const passwordHash = await hashPassword(password);
      const admin = await this.repository.create({ username, passwordHash });
      return sanitizeAdmin(admin);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new Error(`Username "${username}" already exists.`);
      }

      throw error;
    }
  }

  async updateAdminUsername(id: number, input: { username: string }) {
    const username = validateUsername(input.username);

    try {
      const admin = await this.repository.updateUsername(id, username);
      if (!admin) {
        throw new Error(`Admin ${id} not found.`);
      }

      return sanitizeAdmin(admin);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new Error(`Username "${username}" already exists.`);
      }

      throw error;
    }
  }

  async changeAdminPassword(
    id: number,
    input: { password: string; passwordConfirmation: string },
  ): Promise<AdminRecord> {
    const password = validatePassword(input.password);
    validatePasswordConfirmation(password, input.passwordConfirmation);

    const passwordHash = await hashPassword(password);
    const admin = await this.repository.updatePasswordHash(id, passwordHash);
    if (!admin) {
      throw new Error(`Admin ${id} not found.`);
    }

    return sanitizeAdmin(admin);
  }

  async deleteAdmin(id: number): Promise<AdminRecord> {
    const admin = await this.repository.delete(id);
    if (!admin) {
      throw new Error(`Admin ${id} not found.`);
    }

    return sanitizeAdmin(admin);
  }
}
