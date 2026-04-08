import { describe, expect, it, vi } from "vitest";
import type { Admin } from "@src/db/schema/admins";
import { AdminManagerService } from "../../scripts/admin-manager/service";
import type { AdminRepository } from "../../scripts/admin-manager/repository";

function createAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    id: overrides.id ?? 1,
    username: overrides.username ?? "admin.test",
    passwordHash: overrides.passwordHash ?? "hash",
    createdAt: overrides.createdAt ?? new Date("2026-04-10T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-04-10T00:00:00.000Z"),
    lastLoginAt: overrides.lastLoginAt ?? null,
  };
}

function createRepositoryMock(): AdminRepository {
  return {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findByUsername: vi.fn(async () => null),
    create: vi.fn(async (input) =>
      createAdmin({
        username: input.username,
        passwordHash: input.passwordHash,
      }),
    ),
    updateUsername: vi.fn(async (id, username) =>
      createAdmin({ id, username, passwordHash: "hash" }),
    ),
    updatePasswordHash: vi.fn(async (id, passwordHash) =>
      createAdmin({ id, passwordHash }),
    ),
    delete: vi.fn(async (id) => createAdmin({ id })),
  };
}

describe("AdminManagerService", () => {
  it("sanitizes password hash from listed admins", async () => {
    const repository = createRepositoryMock();
    vi.mocked(repository.list).mockResolvedValue([
      createAdmin({ id: 1, username: "one" }),
      createAdmin({ id: 2, username: "two" }),
    ]);
    const service = new AdminManagerService(repository);

    const admins = await service.listAdmins();

    expect(admins).toEqual([
      expect.objectContaining({ id: 1, username: "one" }),
      expect.objectContaining({ id: 2, username: "two" }),
    ]);
    expect(admins[0]).not.toHaveProperty("passwordHash");
  });

  it("normalizes email-like usernames on create", async () => {
    const repository = createRepositoryMock();
    const service = new AdminManagerService(repository);

    const admin = await service.createAdmin({
      username: "ADMIN@TEST.COM ",
      password: "secret",
      passwordConfirmation: "secret",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: "admin@test.com" }),
    );
    expect(admin.username).toBe("admin@test.com");
  });

  it("rejects duplicate usernames on create", async () => {
    const repository = createRepositoryMock();
    vi.mocked(repository.create).mockRejectedValue({ code: "ER_DUP_ENTRY" });
    const service = new AdminManagerService(repository);

    await expect(
      service.createAdmin({
        username: "admin.test",
        password: "secret",
        passwordConfirmation: "secret",
      }),
    ).rejects.toThrow('Username "admin.test" already exists.');
  });

  it("rejects mismatched password confirmation", async () => {
    const repository = createRepositoryMock();
    const service = new AdminManagerService(repository);

    await expect(
      service.createAdmin({
        username: "admin.test",
        password: "secret",
        passwordConfirmation: "different",
      }),
    ).rejects.toThrow("Password confirmation does not match.");
  });

  it("updates username and strips password hash", async () => {
    const repository = createRepositoryMock();
    const service = new AdminManagerService(repository);

    const admin = await service.updateAdminUsername(3, {
      username: "renamed.admin",
    });

    expect(repository.updateUsername).toHaveBeenCalledWith(3, "renamed.admin");
    expect(admin).toEqual(
      expect.objectContaining({ id: 3, username: "renamed.admin" }),
    );
    expect(admin).not.toHaveProperty("passwordHash");
  });

  it("allows deleting the last admin", async () => {
    const repository = createRepositoryMock();
    vi.mocked(repository.delete).mockResolvedValue(
      createAdmin({ id: 9, username: "last.admin" }),
    );
    const service = new AdminManagerService(repository);

    const deleted = await service.deleteAdmin(9);

    expect(repository.delete).toHaveBeenCalledWith(9);
    expect(deleted).toEqual(
      expect.objectContaining({ id: 9, username: "last.admin" }),
    );
  });
});
